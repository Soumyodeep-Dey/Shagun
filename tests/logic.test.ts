import { describe, it, expect, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import {
  validSignature,
  capturedPayment,
  hashToken,
} from "@/lib/payments/verification";
import {
  validateAmount,
  giftSchema,
  weddingSchema,
} from "@/lib/validation/schemas";
import { safeNext, money, countdown, thankYou } from "@/lib/utils";
import { totals, goalTotal } from "@/lib/dashboard";
import { paymentMode } from "@/lib/env";
import type { Gift } from "@/lib/types";
describe("payment proof", () => {
  it("checks HMAC and rejects tampering, truncation and malformed signatures", () => {
    const sig = createHmac("sha256", "secret")
      .update("order_1|pay_1")
      .digest("hex");
    expect(validSignature("order_1|pay_1", sig, "secret")).toBe(true);
    expect(validSignature("order_2|pay_1", sig, "secret")).toBe(false);
    for (const s of ["", sig.slice(1), "x".repeat(64)])
      expect(validSignature("order_1|pay_1", s, "secret")).toBe(false);
  });
  it("requires matching amount, currency, stored order AND capture", () => {
    const p = {
      id: "pay_1",
      order_id: "order_1",
      amount: 100100,
      currency: "INR",
      status: "captured",
      captured: true,
    };
    expect(capturedPayment(p, "order_1", 100100)).toBe(true);
    for (const patch of [
      { amount: 50100 },
      { currency: "USD" },
      { order_id: "order_other" },
      { status: "authorized" },
      { captured: false },
    ])
      expect(capturedPayment({ ...p, ...patch }, "order_1", 100100)).toBe(
        false,
      );
  });
  it("hashes receipt tokens without storing bearer secrets", () => {
    expect(hashToken("a".repeat(64))).toMatch(/^[a-f0-9]{64}$/);
    expect(hashToken("a".repeat(64))).not.toBe("a".repeat(64));
  });
  it("validates integer paise and configured bounds", () => {
    expect(validateAmount(100100, 10000, 1000000)).toBe(100100);
    for (const n of [0, -1, 1.5, 9999, 1000001, NaN, Infinity])
      expect(() => validateAmount(n, 10000, 1000000)).toThrow();
  });
});
describe("configuration", () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
  });
  it("never silently falls back or permits live keys", () => {
    delete process.env.PAYMENT_MODE;
    expect(() => paymentMode()).toThrow();
    process.env.PAYMENT_MODE = "live";
    expect(() => paymentMode()).toThrow();
    process.env.PAYMENT_MODE = "razorpay_test";
    process.env.RAZORPAY_KEY_ID = "rzp_live_wrong";
    expect(() => paymentMode()).toThrow();
    process.env.PAYMENT_MODE = "mock";
    expect(paymentMode()).toBe("mock");
  });
});
describe("privacy and input", () => {
  it("rejects browser payment-mode overrides and malformed money", () => {
    const g = {
      slug: "aisha-rahul",
      goal_id: null,
      amount_paise: 100100,
      guest_name: "Guest",
      blessing_message: "<script>alert(1)</script>",
      envelope_design: "red",
      request_key: crypto.randomUUID(),
      attempt_key: crypto.randomUUID(),
      receipt_token: "a".repeat(64),
    };
    expect(giftSchema.safeParse(g).success).toBe(true);
    expect(giftSchema.safeParse({ ...g, mode: "mock" }).success).toBe(false);
    expect(giftSchema.safeParse({ ...g, amount_paise: 100.5 }).success).toBe(
      false,
    );
    expect(giftSchema.safeParse({ ...g, guest_name: "   " }).success).toBe(
      false,
    );
  });
  it("rejects unsafe slugs and more than three dreams", () => {
    const p = {
      partner1_name: "A",
      partner2_name: "B",
      wedding_date: "2026-12-14",
      slug: "a-b",
      photo_url: "",
      message: "",
      goals: [],
      publish: false,
    };
    expect(weddingSchema.safeParse(p).success).toBe(true);
    for (const slug of ["../private", "Hello World", "a--b", "a/b"])
      expect(weddingSchema.safeParse({ ...p, slug }).success).toBe(false);
  });
  it("blocks external redirects", () => {
    for (const s of [
      "https://evil.test",
      "//evil.test",
      "/\\evil.test",
      "/auth/logout",
      "/login",
    ])
      expect(safeNext(s)).toBe("/dashboard");
    expect(safeNext("/create")).toBe("/create");
  });
});
describe("dashboard accounting", () => {
  it("excludes pending, failed and cancelled; separates payment modes", () => {
    const base = { goal_id: null, amount_paise: 100100, payment_mode: "mock" };
    const gifts = [
      { ...base, payment_status: "succeeded" },
      { ...base, payment_status: "pending" },
      { ...base, payment_status: "failed" },
      { ...base, payment_status: "cancelled" },
      { ...base, payment_status: "succeeded", payment_mode: "razorpay_test" },
    ] as Gift[];
    expect(totals(gifts, "mock")).toBe(100100);
    expect(totals(gifts, "razorpay_test")).toBe(100100);
    expect(goalTotal(gifts, "other", "mock")).toBe(0);
  });
});
describe("presentation", () => {
  it("formats Indian currency", () =>
    expect(money(30000000)).toBe("₹3,00,000"));
  it("handles post-wedding dates", () => {
    expect(countdown("2026-01-01", new Date("2026-02-01"))).toBe(
      "Our new beginning has begun",
    );
  });
  it("uses a deterministic thank-you template", () => {
    expect(thankYou("Meera", "Aisha & Rahul", "First Home")).toContain(
      "Dear Meera, thank you",
    );
  });
});
