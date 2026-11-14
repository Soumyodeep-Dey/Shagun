import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { createServer, type Server } from "node:http";
import { createHmac } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { freshDb, wedding, ownerA, ownerB } from "./helpers/database";
import { sqlFixture } from "./helpers/supabase-fixture";
const state = vi.hoisted(() => ({
  db: null as PGlite | null,
  failOnce: false,
  provider: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  adminDb: () =>
    sqlFixture(state.db!, () => {
      if (state.failOnce) {
        state.failOnce = false;
        return true;
      }
      return false;
    }),
}));
vi.mock("@/lib/supabase/server", () => ({
  serverDb: async () => ({
    ...sqlFixture(state.db!),
    auth: {
      getClaims: async () => {
        await state.db!.query(
          "select set_config('request.jwt.claim.sub',$1,false)",
          [ownerA],
        );
        return { data: { claims: { sub: ownerA } }, error: null };
      },
    },
  }),
}));
vi.mock("@/lib/payments/razorpay", () => ({ razorpay: state.provider }));
import { POST as createOrder } from "@/app/api/create-order/route";
import { POST as mockPayment } from "@/app/api/mock-payment/route";
import { POST as receipt } from "@/app/api/receipt/route";
import { POST as verify } from "@/app/api/verify-payment/route";
import { POST as webhook } from "@/app/api/webhooks/razorpay/route";
import { POST as saveWedding } from "@/app/api/wedding/route";
import { POST as upload } from "@/app/api/upload/route";
const routes: Record<string, (r: Request) => Promise<Response>> = {
  "/api/create-order": createOrder,
  "/api/mock-payment": mockPayment,
  "/api/receipt": receipt,
  "/api/verify-payment": verify,
  "/api/webhooks/razorpay": webhook,
  "/api/wedding": saveWedding,
  "/api/upload": upload,
};
let server: Server, origin: string;
const original = { ...process.env };
beforeAll(async () => {
  state.db = await freshDb();
  server = createServer(async (req, res) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const path = new URL(req.url!, origin).pathname;
      const handler = routes[path];
      if (!handler) {
        res.writeHead(404);
        res.end();
        return;
      }
      const response = await handler(
        new Request(`${origin}${path}`, {
          method: req.method,
          headers: req.headers as Record<string, string>,
          body: Buffer.concat(chunks),
        }),
      );
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      res.writeHead(500);
      res.end("Fixture transport failure");
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}, 30000);
beforeEach(async () => {
  process.env = {
    ...original,
    NEXT_PUBLIC_APP_URL: origin,
    PAYMENT_MODE: "mock",
    RATE_LIMIT_SECRET: "fixture-rate-secret-not-a-production-secret",
    RAZORPAY_KEY_ID: "rzp_test_fixture",
    RAZORPAY_KEY_SECRET: "fixture-callback-secret",
    RAZORPAY_WEBHOOK_SECRET: "fixture-webhook-secret",
  };
  state.failOnce = false;
  state.provider.mockReset();
  await state.db!.exec(
    "truncate public.couples,public.rate_limits,public.webhook_events cascade",
  );
  await wedding(state.db!);
  await wedding(state.db!, ownerB, "other-wedding");
});
afterAll(async () => {
  process.env = { ...original };
  if (server)
    await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
  await state.db?.close();
});
const input = () => ({
  slug: "test-wedding",
  goal_id: null,
  amount_paise: 100100,
  guest_name: "Guest",
  blessing_message: "",
  envelope_design: "red",
  request_key: crypto.randomUUID(),
  attempt_key: crypto.randomUUID(),
  receipt_token: "a".repeat(64),
});
async function post(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return fetch(`${origin}${path}`, {
    method: "POST",
    headers: { origin, "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
describe("actual HTTP Route Handlers; SQL fixture transport, mocked Auth/provider", () => {
  it.each([0, -1, 1.5, 9999, 10000001, "oops", null])(
    "rejects invalid/out-of-limit amount %s without storing a gift",
    async (amount) => {
      const res = await post("/api/create-order", {
        ...input(),
        amount_paise: amount,
      });
      expect(res.status).toBe(400);
      expect(
        (await state.db!.query("select * from public.contributions")).rows,
      ).toHaveLength(0);
    },
  );
  it.each([
    { guest_name: "   " },
    { guest_name: "x".repeat(101) },
    { blessing_message: "x".repeat(1001) },
    { envelope_design: "unknown" },
    { mode: "razorpay_test" },
  ])("rejects invalid guest data %j", async (patch) => {
    expect(
      (await post("/api/create-order", { ...input(), ...patch })).status,
    ).toBe(400);
    expect(
      (await state.db!.query("select * from public.contributions")).rows,
    ).toHaveLength(0);
  });
  it.each([50100, 100100, 200100, 500100])(
    "preset %s paise persists unchanged in the stored mock order",
    async (amount) => {
      const res = await post("/api/create-order", {
        ...input(),
        amount_paise: amount,
      });
      expect(res.status).toBe(200);
      const order = await res.json();
      expect(order.amount_paise).toBe(amount);
      expect(
        (
          await state.db!.query<{ amount_paise: number }>(
            "select amount_paise from public.payment_attempts",
          )
        ).rows,
      ).toEqual([{ amount_paise: amount }]);
    },
  );
  it("oversized and disguised executable uploads are rejected by the real HTTP handler", async () => {
    for (const blob of [
      new Blob([new Uint8Array(5242881)], { type: "image/png" }),
      new Blob(["MZ" + "x".repeat(64)], { type: "image/png" }),
    ]) {
      const form = new FormData();
      form.set("photo", blob, "disguised.png");
      const response = await fetch(`${origin}/api/upload`, {
        method: "POST",
        headers: { origin },
        body: form,
      });
      expect(response.status).toBe(400);
    }
  });
  it("allows empty blessing, general Shagun and each envelope; persists ₹1001 as 100100 paise", async () => {
    for (const [i, design] of ["red", "floral", "gold"].entries()) {
      const p = {
        ...input(),
        receipt_token: String(i + 1).repeat(64),
        envelope_design: design,
      };
      const response = await post("/api/create-order", p);
      expect(response.status).toBe(200);
    }
    const rows = await state.db!.query<{
      amount_paise: number;
      goal_id: string | null;
      blessing_message: string;
      envelope_design: string;
    }>(
      "select amount_paise,goal_id,blessing_message,envelope_design from public.contributions order by created_at",
    );
    expect(rows.rows).toHaveLength(3);
    for (const r of rows.rows) {
      expect(Number(r.amount_paise)).toBe(100100);
      expect(r.goal_id).toBeNull();
      expect(r.blessing_message).toBe("");
    }
  });
  it("taken slug returns a clear HTTP conflict and preserves both profiles", async () => {
    const before = (
      await state.db!.query(
        "select id,slug,partner1_name from public.couples order by id",
      )
    ).rows;
    const res = await post("/api/wedding", {
      partner1_name: "Changed",
      partner2_name: "Changed",
      slug: "other-wedding",
      wedding_date: "2026-12-14",
      photo_url: "",
      message: "",
      publish: true,
      goals: [],
    });
    expect(res.status).toBe(409);
    expect(await res.text()).toContain("already taken");
    expect(
      (
        await state.db!.query(
          "select id,slug,partner1_name from public.couples order by id",
        )
      ).rows,
    ).toEqual(before);
  });
  it("rejects fourth goal through HTTP before any profile mutation", async () => {
    const p = {
      partner1_name: "Changed",
      partner2_name: "Changed",
      slug: "test-wedding",
      wedding_date: "2026-12-14",
      photo_url: "",
      message: "",
      publish: true,
      goals: Array.from({ length: 4 }, () => ({
        title: "Dream",
        target_amount_paise: 100,
        icon: "heart",
        note: "",
      })),
    };
    expect((await post("/api/wedding", p)).status).toBe(400);
    expect(
      (
        await state.db!.query(
          "select partner1_name from public.couples where user_id=$1",
          [ownerA],
        )
      ).rows[0],
    ).toEqual({ partner1_name: "First" });
  });
  it.each([
    { partner1_name: "" },
    { partner2_name: "   " },
    { wedding_date: "invalid-date" },
    { slug: "Bad Slug" },
  ])("invalid onboarding values %j are rejected server-side", async (patch) => {
    const response = await post("/api/wedding", {
      partner1_name: "First",
      partner2_name: "Second",
      slug: "test-wedding",
      wedding_date: "2027-01-20",
      photo_url: "",
      message: "",
      goals: [],
      publish: true,
      ...patch,
    });
    expect(response.status).toBe(400);
    expect(
      (
        await state.db!.query(
          "select partner1_name from public.couples where user_id=$1",
          [ownerA],
        )
      ).rows[0],
    ).toEqual({ partner1_name: "First" });
  });
  it("rejects foreign, archived and nonexistent goals", async () => {
    const couples = await state.db!.query<{ id: string; slug: string }>(
      "select id,slug from public.couples",
    );
    const other = couples.rows.find((c) => c.slug === "other-wedding")!.id,
      own = couples.rows.find((c) => c.slug === "test-wedding")!.id;
    const ids = [crypto.randomUUID(), crypto.randomUUID()];
    await state.db!.query(
      "insert into public.goals(id,couple_id,title,target_amount_paise,is_active) values($1,$2,'Foreign',100,true),($3,$4,'Archived',100,false)",
      [ids[0], other, ids[1], own],
    );
    for (const id of [...ids, crypto.randomUUID()])
      expect(
        (await post("/api/create-order", { ...input(), goal_id: id })).status,
      ).toBe(404);
  });
  it("mock endpoint fails closed in Razorpay mode", async () => {
    process.env.PAYMENT_MODE = "razorpay_test";
    expect(
      (
        await post("/api/mock-payment", {
          token: "a".repeat(64),
          attempt_id: crypto.randomUUID(),
          outcome: "succeeded",
        })
      ).status,
    ).toBe(404);
  });
  it.each([
    "PAYMENT_MODE",
    "RAZORPAY_KEY_ID",
    "RAZORPAY_KEY_SECRET",
    "RAZORPAY_WEBHOOK_SECRET",
  ])(
    "reports missing %s without silent mock fallback or secret disclosure",
    async (key) => {
      process.env.PAYMENT_MODE = "razorpay_test";
      delete process.env[key];
      const res = await post("/api/create-order", input());
      expect(res.status).toBe(503);
      expect(await res.text()).toContain(key);
      expect(
        (await state.db!.query("select * from public.contributions")).rows,
      ).toHaveLength(0);
    },
  );
  it("receipt tokens authorize only their gift and cannot mutate another attempt", async () => {
    const p = input(),
      a = await (await post("/api/create-order", p)).json();
    const b = await (
      await post("/api/create-order", {
        ...input(),
        amount_paise: 200100,
        receipt_token: "b".repeat(64),
      })
    ).json();
    const mine = await (
      await post("/api/receipt", { token: p.receipt_token })
    ).json();
    expect(mine.amount_paise).toBe(100100);
    expect(Object.keys(mine).sort()).toEqual([
      "amount_paise",
      "mode",
      "status",
    ]);
    expect((await post("/api/receipt", { token: "f".repeat(64) })).status).toBe(
      404,
    );
    expect(
      (
        await post("/api/mock-payment", {
          token: p.receipt_token,
          attempt_id: b.attempt_id,
          outcome: "succeeded",
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await post("/api/mock-payment", {
          token: p.receipt_token,
          attempt_id: a.attempt_id,
          outcome: "succeeded",
        })
      ).status,
    ).toBe(200);
  });
  it.each(["failed", "cancelled"] as const)(
    "mock %s persists draft details and retries without double-counting",
    async (outcome) => {
      const p = {
        ...input(),
        guest_name: "Retry Guest",
        blessing_message: "Keep this blessing",
        envelope_design: "floral",
      };
      const first = await (await post("/api/create-order", p)).json();
      expect(
        (
          await post("/api/mock-payment", {
            token: p.receipt_token,
            attempt_id: first.attempt_id,
            outcome,
          })
        ).status,
      ).toBe(200);
      expect(
        (await (await post("/api/receipt", { token: p.receipt_token })).json())
          .status,
      ).toBe(outcome);
      const retry = await (
        await post("/api/create-order", {
          ...p,
          attempt_key: crypto.randomUUID(),
        })
      ).json();
      expect(retry.contribution_id).toBe(first.contribution_id);
      expect(retry.attempt_id).not.toBe(first.attempt_id);
      expect(
        (
          await post("/api/mock-payment", {
            token: p.receipt_token,
            attempt_id: retry.attempt_id,
            outcome: "succeeded",
          })
        ).status,
      ).toBe(200);
      const gifts = await state.db!.query<{
        guest_name: string;
        blessing_message: string;
        envelope_design: string;
        amount_paise: number;
        payment_status: string;
      }>(
        "select guest_name,blessing_message,envelope_design,amount_paise,payment_status from public.contributions",
      );
      expect(gifts.rows).toEqual([
        {
          guest_name: "Retry Guest",
          blessing_message: "Keep this blessing",
          envelope_design: "floral",
          amount_paise: 100100,
          payment_status: "succeeded",
        },
      ]);
      expect(
        (await state.db!.query("select * from public.payment_attempts")).rows,
      ).toHaveLength(2);
    },
  );
  it("simultaneous HTTP submissions reuse the same persisted gift and attempt", async () => {
    const p = input();
    const responses = await Promise.all([
      post("/api/create-order", p),
      post("/api/create-order", p),
    ]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    const [a, b] = await Promise.all(responses.map((r) => r.json()));
    expect(a.contribution_id).toBe(b.contribution_id);
    expect(a.attempt_id).toBe(b.attempt_id);
    expect(
      (await state.db!.query("select * from public.contributions")).rows,
    ).toHaveLength(1);
  });
  it.each(["NEXT_PUBLIC_APP_URL", "RATE_LIMIT_SECRET"])(
    "missing %s produces a safe HTTP configuration error",
    async (key) => {
      delete process.env[key];
      const res = await post("/api/create-order", input());
      expect(res.status).toBe(503);
      const text = await res.text();
      expect(text).toContain(key);
      expect(text).not.toContain("fixture-callback-secret");
    },
  );
  it("rate limits excessive anonymous writes and does not expose internal payloads", async () => {
    for (let i = 0; i < 15; i++)
      expect(
        (await post("/api/create-order", { ...input(), guest_name: "" }))
          .status,
      ).toBe(400);
    const res = await post("/api/create-order", input());
    expect(res.status).toBe(429);
    expect(await res.text()).toContain("Too many requests");
  });
  async function providerFixture() {
    const p = input(),
      order = await (await post("/api/create-order", p)).json();
    await state.db!.query(
      "update public.payment_attempts set provider='razorpay_test',provider_order_id='order_fixture' where id=$1",
      [order.attempt_id],
    );
    await state.db!.query(
      "update public.contributions set payment_mode='razorpay_test' where id=$1",
      [order.contribution_id],
    );
    process.env.PAYMENT_MODE = "razorpay_test";
    state.provider.mockResolvedValue({
      id: "pay_fixture",
      order_id: "order_fixture",
      amount: 100100,
      currency: "INR",
      status: "captured",
      captured: true,
    });
    return { p, order };
  }
  function callback(p: ReturnType<typeof input>, attempt: string) {
    return {
      token: p.receipt_token,
      attempt_id: attempt,
      razorpay_order_id: "order_fixture",
      razorpay_payment_id: "pay_fixture",
      razorpay_signature: createHmac("sha256", "fixture-callback-secret")
        .update("order_fixture|pay_fixture")
        .digest("hex"),
    };
  }
  async function sendWebhook() {
    const raw = JSON.stringify({
      event: "payment.captured",
      payload: {
        payment: { entity: { id: "pay_fixture", order_id: "order_fixture" } },
      },
    });
    return post("/api/webhooks/razorpay", raw, {
      "x-razorpay-signature": createHmac("sha256", "fixture-webhook-secret")
        .update(raw)
        .digest("hex"),
      "x-razorpay-event-id": "evt_fixture",
    });
  }
  it("PAY-05 persists bounded discrepancies across HTTP rejection and never credits mismatches", async () => {
    const { p, order } = await providerFixture();
    state.provider.mockResolvedValue({
      id: "pay_wrong",
      order_id: "order_wrong",
      amount: 50100,
      currency: "USD",
      status: "captured",
      captured: true,
    });
    for (let i = 0; i < 2; i++)
      expect(
        (await post("/api/verify-payment", callback(p, order.attempt_id)))
          .status,
      ).toBe(400);
    const records = await state.db!.query<{ field: string }>(
      "select * from public.payment_discrepancies order by field",
    );
    expect(records.rows).toHaveLength(4);
    expect(records.rows.map((r) => r.field)).toEqual([
      "amount",
      "currency",
      "order_id",
      "payment_id",
    ]);
    const serialized = JSON.stringify(records.rows);
    for (const secret of [
      p.receipt_token,
      "fixture-callback-secret",
      "fixture-webhook-secret",
      "Guest",
    ])
      expect(serialized).not.toContain(secret);
    expect(
      (await state.db!.query("select payment_status from public.contributions"))
        .rows[0],
    ).toEqual({ payment_status: "pending" });
    expect(
      (await state.db!.query("select * from public.payment_captures")).rows,
    ).toHaveLength(0);
  });
  it("distinct mismatched payments on one attempt retain their own investigation identities", async () => {
    const { p, order } = await providerFixture();
    for (const id of ["pay_first", "pay_second"]) {
      state.provider.mockResolvedValueOnce({
        id,
        order_id: "order_fixture",
        amount: 1,
        currency: "INR",
        status: "captured",
        captured: true,
      });
      const data = callback(p, order.attempt_id);
      data.razorpay_payment_id = id;
      data.razorpay_signature = createHmac("sha256", "fixture-callback-secret")
        .update(`order_fixture|${id}`)
        .digest("hex");
      expect((await post("/api/verify-payment", data)).status).toBe(400);
    }
    const r = await state.db!.query<{
      provider_payment_id: string;
      provider_order_id: string;
    }>(
      "select provider_payment_id,provider_order_id from public.payment_discrepancies order by provider_payment_id",
    );
    expect(r.rows).toEqual([
      { provider_payment_id: "pay_first", provider_order_id: "order_fixture" },
      { provider_payment_id: "pay_second", provider_order_id: "order_fixture" },
    ]);
  });
  it("PAY-05 webhook mismatch persists restricted investigation evidence without a transition", async () => {
    await providerFixture();
    state.provider.mockResolvedValue({
      id: "pay_fixture",
      order_id: "order_fixture",
      amount: 1,
      currency: "USD",
      status: "captured",
      captured: true,
    });
    expect((await sendWebhook()).status).toBe(400);
    expect(
      (
        await state.db!.query(
          "select source,field from public.payment_discrepancies order by field",
        )
      ).rows,
    ).toEqual([
      { source: "webhook", field: "amount" },
      { source: "webhook", field: "currency" },
    ]);
    expect(
      (await state.db!.query("select * from public.webhook_events")).rows,
    ).toHaveLength(0);
    expect(
      (await state.db!.query("select * from public.payment_captures")).rows,
    ).toHaveLength(0);
  });
  it("PAY-05 order-creation mismatch is retained and never opens a credited order", async () => {
    process.env.PAYMENT_MODE = "razorpay_test";
    state.provider.mockResolvedValue({
      id: "order_fixture",
      amount: 1,
      currency: "USD",
    });
    expect((await post("/api/create-order", input())).status).toBe(502);
    expect(
      (
        await state.db!.query(
          "select source,field from public.payment_discrepancies order by field",
        )
      ).rows,
    ).toEqual([
      { source: "order", field: "amount" },
      { source: "order", field: "currency" },
    ]);
    expect(
      (await state.db!.query("select payment_status from public.contributions"))
        .rows[0],
    ).toEqual({ payment_status: "pending" });
  });
  it("PAY-11 webhook-first then repeated callback counts one capture", async () => {
    const { p, order } = await providerFixture();
    expect((await sendWebhook()).status).toBe(200);
    for (let i = 0; i < 2; i++)
      expect(
        (await post("/api/verify-payment", callback(p, order.attempt_id)))
          .status,
      ).toBe(200);
    expect(
      (await state.db!.query("select * from public.payment_captures")).rows,
    ).toHaveLength(1);
    expect(
      (await state.db!.query("select * from public.contributions")).rows,
    ).toHaveLength(1);
  });
  it("simulated provider timeout leaves the receipt pending and a safe callback retry can confirm it", async () => {
    const { p, order } = await providerFixture();
    state.provider.mockRejectedValueOnce(
      new DOMException("simulated provider timeout", "TimeoutError"),
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(
      (await post("/api/verify-payment", callback(p, order.attempt_id))).status,
    ).toBe(503);
    expect(
      (await (await post("/api/receipt", { token: p.receipt_token })).json())
        .status,
    ).toBe("pending");
    expect(
      (await state.db!.query("select * from public.payment_captures")).rows,
    ).toHaveLength(0);
    expect(
      (await post("/api/verify-payment", callback(p, order.attempt_id))).status,
    ).toBe(200);
    log.mockRestore();
  });
  it("PAY-16 transient processing failure leaves event unprocessed and retry safely succeeds", async () => {
    await providerFixture();
    state.failOnce = true;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await sendWebhook()).status).toBe(503);
    expect(
      (await state.db!.query("select * from public.webhook_events")).rows,
    ).toHaveLength(0);
    expect((await sendWebhook()).status).toBe(200);
    expect((await sendWebhook()).status).toBe(200);
    expect(
      (await state.db!.query("select * from public.payment_captures")).rows,
    ).toHaveLength(1);
    expect(
      (await state.db!.query("select * from public.webhook_events")).rows,
    ).toHaveLength(1);
    log.mockRestore();
  });
});
