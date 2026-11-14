// Operator-only recovery for an uncertain order-creation response. No live mode.
import { createClient } from "@supabase/supabase-js";
const [attemptId, orderId] = process.argv.slice(2);
const env = process.env;
if (
  env.PAYMENT_MODE !== "razorpay_test" ||
  !env.RAZORPAY_KEY_ID?.startsWith("rzp_test_") ||
  !env.RAZORPAY_KEY_SECRET ||
  !env.SUPABASE_SERVICE_ROLE_KEY ||
  !env.NEXT_PUBLIC_SUPABASE_URL
)
  throw new Error(
    "Configure Supabase service role and Razorpay TEST credentials.",
  );
if (
  !/^[a-f0-9-]{36}$/.test(attemptId || "") ||
  !/^order_[A-Za-z0-9]+$/.test(orderId || "")
)
  throw new Error(
    "Usage: node --env-file=.env.local scripts/reconcile-payment.mjs ATTEMPT_UUID ORDER_ID",
  );
const db = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const { data: a, error } = await db
  .from("payment_attempts")
  .select("id,amount_paise,provider_order_id,provider")
  .eq("id", attemptId)
  .single();
if (error) throw error;
if (a.provider !== "razorpay_test")
  throw new Error("Not a Razorpay test attempt.");
async function provider(path) {
  const res = await fetch(`https://api.razorpay.com/v1/${path}`, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString("base64")}`,
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error("Provider request failed. No status changed.");
  return res.json();
}
const order = await provider(`orders/${orderId}`);
if (
  order.id !== orderId ||
  order.receipt !== a.id ||
  order.amount !== a.amount_paise ||
  order.currency !== "INR"
)
  throw new Error("Order association, receipt, currency or amount mismatch.");
if (a.provider_order_id !== orderId) {
  if (a.provider_order_id !== `creating_${a.id}`)
    throw new Error("Existing order association differs.");
  const { error: e } = await db
    .from("payment_attempts")
    .update({ provider_order_id: orderId })
    .eq("id", a.id)
    .eq("provider_order_id", `creating_${a.id}`);
  if (e) throw e;
}
const payments = await provider(`orders/${orderId}/payments`);
const captured = payments.items.find(
  (p) =>
    p.order_id === orderId &&
    p.amount === a.amount_paise &&
    p.currency === "INR" &&
    p.status === "captured" &&
    p.captured === true,
);
if (captured) {
  const { error: e } = await db.rpc("apply_payment", {
    aid: a.id,
    new_status: "succeeded",
    payment_id: captured.id,
    event_id: null,
    event_type: null,
  });
  if (e) throw e;
  console.log(
    "Verified captured TEST payment and reconciled its stored attempt.",
  );
} else
  console.log(
    "Order associated; no captured payment found. Receipt remains unconfirmed.",
  );
