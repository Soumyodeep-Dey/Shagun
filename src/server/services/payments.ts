import "server-only";
import { createHash } from "node:crypto";
import { adminDb } from "@/lib/supabase/admin";
import { giftSchema, validateAmount } from "@/lib/validation/schemas";
import { paymentMode, limits, required } from "@/lib/env";
import {
  hashToken,
  validSignature,
  capturedPayment,
  type ProviderPayment,
} from "@/lib/payments/verification";
import { razorpay } from "@/lib/payments/razorpay";
import { HttpError } from "@/server/http";
import type { PaymentStatus, PaymentMode } from "@/lib/types";
import { assertPaymentMatches, recordDiscrepancies } from "./discrepancies";
type Attempt = {
  id: string;
  contribution_id: string;
  provider: PaymentMode;
  provider_order_id: string | null;
  amount_paise: number;
  status: PaymentStatus;
};
export async function scopedAttempt(token: string, attemptId?: string) {
  const db = adminDb();
  const { data: gift, error } = await db
    .from("contributions")
    .select("id,payment_status,payment_mode,amount_paise")
    .eq("receipt_token_hash", hashToken(token))
    .maybeSingle();
  if (error) throw error;
  if (!gift) throw new HttpError(404, "Receipt not found.");
  let query = db
    .from("payment_attempts")
    .select("id,contribution_id,provider,provider_order_id,amount_paise,status")
    .eq("contribution_id", gift.id);
  if (attemptId) query = query.eq("id", attemptId);
  const { data: attempts, error: ae } = await query
    .order("created_at", { ascending: false })
    .limit(1);
  if (ae) throw ae;
  if (!attempts?.[0]) throw new HttpError(404, "Payment attempt not found.");
  return { gift, attempt: attempts[0] as Attempt };
}
export async function transition(
  a: Attempt,
  status: PaymentStatus,
  paymentId?: string,
  eventId?: string,
  eventType?: string,
) {
  const { error } = await adminDb().rpc("apply_payment", {
    aid: a.id,
    new_status: status,
    payment_id: paymentId || null,
    event_id: eventId || null,
    event_type: eventType || null,
  });
  if (error) throw error;
}
export async function createOrder(raw: unknown) {
  const input = giftSchema.parse(raw),
    mode = paymentMode(),
    { min, max } = limits();
  try {
    validateAmount(input.amount_paise, min, max);
  } catch {
    throw new HttpError(
      400,
      "Amount is outside the allowed contribution range.",
    );
  }
  const { receipt_token, request_key, attempt_key, ...details } = input;
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ ...details, mode }))
    .digest("hex");
  const db = adminDb();
  const { data, error } = await db.rpc("create_gift", {
    p: {
      ...details,
      request_key,
      attempt_key,
      mode,
      token_hash: hashToken(receipt_token),
      request_hash: fingerprint,
    },
  });
  if (error) {
    if (error.message?.includes("Idempotency"))
      throw new HttpError(
        409,
        "This attempt has different details. Start a new attempt.",
      );
    if (error.message?.includes("unavailable"))
      throw new HttpError(404, "The wedding or selected dream is unavailable.");
    throw error;
  }
  const result = data as {
    contribution_id: string;
    attempt_id: string;
    order_id: string | null;
    amount_paise: number;
    status: PaymentStatus;
  };
  if (
    mode === "razorpay_test" &&
    !result.order_id &&
    result.status !== "succeeded"
  ) {
    // A DB claim prevents parallel requests creating competing provider orders. An uncertain network result stays pending for operator reconciliation.
    const { data: claim, error: ce } = await db
      .from("payment_attempts")
      .update({ provider_order_id: `creating_${result.attempt_id}` })
      .eq("id", result.attempt_id)
      .is("provider_order_id", null)
      .select("id");
    if (ce) throw ce;
    if (claim?.length) {
      const order = await razorpay<{
        id: string;
        amount: number;
        currency: string;
      }>("orders", {
        amount: result.amount_paise,
        currency: "INR",
        receipt: result.attempt_id,
      });
      if (
        order.amount !== result.amount_paise ||
        order.currency !== "INR" ||
        !order.id.startsWith("order_")
      ) {
        await recordDiscrepancies(
          result.attempt_id,
          "order",
          [
            ...(order.amount !== result.amount_paise
              ? [
                  {
                    field: "amount" as const,
                    expected: String(result.amount_paise),
                    observed: String(order.amount),
                  },
                ]
              : []),
            ...(order.currency !== "INR"
              ? [
                  {
                    field: "currency" as const,
                    expected: "INR",
                    observed: String(order.currency),
                  },
                ]
              : []),
            ...(!order.id.startsWith("order_")
              ? [
                  {
                    field: "order_id" as const,
                    expected: "order_*",
                    observed: String(order.id),
                  },
                ]
              : []),
          ],
          { order_id: order.id },
        );
        throw new HttpError(502, "Provider order did not match.");
      }
      const { error: oe } = await db
        .from("payment_attempts")
        .update({ provider_order_id: order.id })
        .eq("id", result.attempt_id)
        .eq("provider_order_id", `creating_${result.attempt_id}`);
      if (oe) throw oe;
      result.order_id = order.id;
    } else {
      const { data: current } = await db
        .from("payment_attempts")
        .select("provider_order_id")
        .eq("id", result.attempt_id)
        .single();
      result.order_id = current?.provider_order_id;
    }
  }
  if (
    mode === "razorpay_test" &&
    (!result.order_id || result.order_id.startsWith("creating_"))
  )
    throw new HttpError(
      409,
      "Order confirmation is pending. Keep your receipt link and retry later.",
    );
  return {
    ...result,
    mode,
    key_id: mode === "razorpay_test" ? required("RAZORPAY_KEY_ID") : undefined,
  };
}
export async function verifyCallback(input: {
  token: string;
  attempt_id: string;
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}) {
  if (paymentMode() !== "razorpay_test")
    throw new HttpError(409, "Razorpay test mode is not enabled.");
  const { attempt } = await scopedAttempt(input.token, input.attempt_id);
  if (
    attempt.provider !== "razorpay_test" ||
    !attempt.provider_order_id ||
    attempt.provider_order_id !== input.razorpay_order_id
  ) {
    await recordDiscrepancies(
      attempt.id,
      "callback",
      [
        {
          field: "order_id",
          expected: String(attempt.provider_order_id),
          observed: input.razorpay_order_id,
        },
      ],
      {
        payment_id: input.razorpay_payment_id,
        order_id: input.razorpay_order_id,
      },
    );
    throw new HttpError(400, "Order mismatch.");
  }
  if (
    !validSignature(
      `${attempt.provider_order_id}|${input.razorpay_payment_id}`,
      input.razorpay_signature,
      required("RAZORPAY_KEY_SECRET"),
    )
  )
    throw new HttpError(400, "Invalid payment signature.");
  const p = await razorpay<ProviderPayment>(
    `payments/${encodeURIComponent(input.razorpay_payment_id)}`,
  );
  await assertPaymentMatches(attempt, p, input.razorpay_payment_id, "callback");
  if (capturedPayment(p, attempt.provider_order_id, attempt.amount_paise))
    await transition(attempt, "succeeded", p.id);
  else if (p.status === "failed") await transition(attempt, "failed", p.id);
  return {
    status: (await scopedAttempt(input.token, input.attempt_id)).gift
      .payment_status,
  };
}
export async function receipt(token: string) {
  const { gift } = await scopedAttempt(token);
  return {
    status: gift.payment_status as PaymentStatus,
    mode: gift.payment_mode as PaymentMode,
    amount_paise: gift.amount_paise as number,
  };
}
