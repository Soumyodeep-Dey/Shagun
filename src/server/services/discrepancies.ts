import "server-only";
import { createHash } from "node:crypto";
import { adminDb } from "@/lib/supabase/admin";
import type { ProviderPayment } from "@/lib/payments/verification";
import { HttpError } from "@/server/http";
type Difference = {
  field: "amount" | "currency" | "order_id" | "payment_id";
  expected: string;
  observed: string;
};
export async function recordDiscrepancies(
  attemptId: string,
  source: "callback" | "webhook" | "order",
  differences: Difference[],
  identifiers: { payment_id?: string; order_id?: string } = {},
) {
  if (!differences.length) return;
  const bounded = (value: unknown) =>
    value === undefined || value === null ? null : String(value).slice(0, 128);
  const providerPaymentId = bounded(identifiers.payment_id),
    providerOrderId = bounded(identifiers.order_id);
  const rows = differences.map((d) => ({
    attempt_id: attemptId,
    source,
    field: d.field,
    expected_value: d.expected.slice(0, 128),
    observed_value: d.observed.slice(0, 128),
    provider_payment_id: providerPaymentId,
    provider_order_id: providerOrderId,
    fingerprint: createHash("sha256")
      .update(
        JSON.stringify([
          attemptId,
          source,
          d.field,
          d.expected.slice(0, 128),
          d.observed.slice(0, 128),
          providerPaymentId,
          providerOrderId,
        ]),
      )
      .digest("hex"),
  }));
  // Separate committed request before rejection, never a transaction that then raises.
  const { error } = await adminDb()
    .from("payment_discrepancies")
    .upsert(rows, { onConflict: "fingerprint", ignoreDuplicates: true });
  if (error) throw error;
}
export async function assertPaymentMatches(
  attempt: {
    id: string;
    provider_order_id: string | null;
    amount_paise: number;
  },
  p: ProviderPayment,
  paymentId: string,
  source: "callback" | "webhook",
) {
  const differences: Difference[] = [];
  for (const [field, expected, observed] of [
    ["payment_id", paymentId, p.id],
    ["order_id", attempt.provider_order_id, p.order_id],
    ["amount", attempt.amount_paise, p.amount],
    ["currency", "INR", p.currency],
  ] as const)
    if (expected !== observed)
      differences.push({
        field,
        expected: String(expected),
        observed: String(observed),
      });
  if (differences.length) {
    await recordDiscrepancies(attempt.id, source, differences, {
      payment_id: p.id,
      order_id: p.order_id,
    });
    throw new HttpError(400, "Payment does not match the stored order.");
  }
}
