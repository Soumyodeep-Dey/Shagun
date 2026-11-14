import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { createHmac } from "node:crypto";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  provider: vi.fn(),
  amount: 100100,
  status: "captured",
  captured: true,
  order: "order_stored",
}));
vi.mock("@/lib/supabase/admin", () => ({
  adminDb: () => ({
    rpc: mocks.rpc,
    from: (table: string) => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        maybeSingle: async () => ({
          data:
            table === "contributions"
              ? {
                  id: "gift",
                  payment_status: "pending",
                  payment_mode: "razorpay_test",
                  amount_paise: 100100,
                }
              : {
                  id: "attempt",
                  contribution_id: "gift",
                  provider: "razorpay_test",
                  provider_order_id: "order_stored",
                  amount_paise: 100100,
                  status: "pending",
                },
          error: null,
        }),
        limit: async () => ({
          data: [
            {
              id: "attempt",
              contribution_id: "gift",
              provider: "razorpay_test",
              provider_order_id: "order_stored",
              amount_paise: 100100,
              status: "pending",
            },
          ],
          error: null,
        }),
      };
      return builder;
    },
  }),
}));
vi.mock("@/lib/payments/razorpay", () => ({ razorpay: mocks.provider }));
import { verifyCallback } from "@/server/services/payments";
import { POST as webhook } from "@/app/api/webhooks/razorpay/route";
const original = { ...process.env };
beforeEach(() => {
  vi.clearAllMocks();
  process.env.PAYMENT_MODE = "razorpay_test";
  process.env.RAZORPAY_KEY_ID = "rzp_test_example";
  process.env.RAZORPAY_KEY_SECRET = "callback-secret";
  process.env.RAZORPAY_WEBHOOK_SECRET = "webhook-secret";
  mocks.rpc.mockResolvedValue({ error: null });
  mocks.provider.mockResolvedValue({
    id: "pay_valid",
    order_id: "order_stored",
    amount: 100100,
    currency: "INR",
    status: "captured",
    captured: true,
  });
});
afterEach(() => {
  process.env = { ...original };
});
const sig = () =>
  createHmac("sha256", "callback-secret")
    .update("order_stored|pay_valid")
    .digest("hex");
const callback = () => ({
  token: "a".repeat(64),
  attempt_id: "attempt",
  razorpay_order_id: "order_stored",
  razorpay_payment_id: "pay_valid",
  razorpay_signature: sig(),
});
describe("callback service", () => {
  it("rejects a mismatched browser order before provider verification", async () => {
    await expect(
      verifyCallback({ ...callback(), razorpay_order_id: "order_other" }),
    ).rejects.toThrow("Order mismatch");
    expect(mocks.provider).not.toHaveBeenCalled();
  });
  it("rejects an invalid signature", async () => {
    await expect(
      verifyCallback({ ...callback(), razorpay_signature: "0".repeat(64) }),
    ).rejects.toThrow("Invalid payment signature");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects provider amount/currency mismatches", async () => {
    for (const patch of [
      { amount: 50100 },
      { currency: "USD" },
      { order_id: "order_wrong" },
      { id: "pay_other" },
    ]) {
      mocks.provider.mockResolvedValueOnce({
        id: "pay_valid",
        order_id: "order_stored",
        amount: 100100,
        currency: "INR",
        status: "captured",
        captured: true,
        ...patch,
      });
      await expect(verifyCallback(callback())).rejects.toThrow(
        "does not match",
      );
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("does not count an authorized payment as captured", async () => {
    mocks.provider.mockResolvedValueOnce({
      id: "pay_valid",
      order_id: "order_stored",
      amount: 100100,
      currency: "INR",
      status: "authorized",
      captured: false,
    });
    await verifyCallback(callback());
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("transitions only captured matching payments", async () => {
    await verifyCallback(callback());
    expect(mocks.rpc).toHaveBeenCalledWith(
      "apply_payment",
      expect.objectContaining({
        aid: "attempt",
        new_status: "succeeded",
        payment_id: "pay_valid",
      }),
    );
  });
});
describe("webhook route", () => {
  const raw = JSON.stringify({
    event: "payment.captured",
    payload: {
      payment: { entity: { id: "pay_valid", order_id: "order_stored" } },
    },
  });
  const request = (
    body = raw,
    signature = createHmac("sha256", "webhook-secret")
      .update(raw)
      .digest("hex"),
  ) =>
    new Request("http://localhost/api/webhooks/razorpay", {
      method: "POST",
      body,
      headers: {
        "x-razorpay-signature": signature,
        "x-razorpay-event-id": "evt_test",
      },
    });
  it("checks the raw bytes before parsing", async () => {
    const res = await webhook(request(raw + " "));
    expect(res.status).toBe(400);
    expect(mocks.provider).not.toHaveBeenCalled();
  });
  it("passes event identity into the atomic transition", async () => {
    const res = await webhook(request());
    expect(res.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "apply_payment",
      expect.objectContaining({
        new_status: "succeeded",
        event_id: "evt_test",
        event_type: "payment.captured",
      }),
    );
  });
  it("keeps unconfirmed provider requests pending", async () => {
    mocks.provider.mockRejectedValueOnce(new Error("unavailable"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await webhook(request())).status).toBe(503);
    expect(mocks.rpc).not.toHaveBeenCalled();
    log.mockRestore();
  });
  it("disables Razorpay endpoints in mock mode", async () => {
    process.env.PAYMENT_MODE = "mock";
    expect((await webhook(request())).status).toBe(404);
    expect(mocks.provider).not.toHaveBeenCalled();
  });
});
