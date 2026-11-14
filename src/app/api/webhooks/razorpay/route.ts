import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { paymentMode, required } from "@/lib/env";
import { adminDb } from "@/lib/supabase/admin";
import {
  validSignature,
  capturedPayment,
  type ProviderPayment,
} from "@/lib/payments/verification";
import { razorpay } from "@/lib/payments/razorpay";
import { apiError, HttpError } from "@/server/http";
import { transition } from "@/server/services/payments";
const payload = z.object({
  event: z.string(),
  payload: z.object({
    payment: z
      .object({
        entity: z.object({
          id: z.string().regex(/^pay_[a-zA-Z0-9]+$/),
          order_id: z.string(),
        }),
      })
      .optional(),
  }),
});
export async function POST(req: Request) {
  try {
    if (paymentMode() !== "razorpay_test")
      throw new HttpError(404, "Not found.");
    const raw = await req.text();
    if (Buffer.byteLength(raw) > 100000)
      throw new HttpError(413, "Request too large.");
    if (
      !validSignature(
        raw,
        req.headers.get("x-razorpay-signature") || "",
        required("RAZORPAY_WEBHOOK_SECRET"),
      )
    )
      throw new HttpError(400, "Invalid webhook signature.");
    const event = payload.parse(JSON.parse(raw)),
      id =
        req.headers.get("x-razorpay-event-id") ||
        createHash("sha256").update(raw).digest("hex");
    if (
      ![
        "payment.captured",
        "payment.failed",
        "payment.authorized",
        "order.paid",
      ].includes(event.event) ||
      !event.payload.payment
    )
      return NextResponse.json({ received: true, ignored: true });
    const entity = event.payload.payment.entity;
    const db = adminDb();
    const { data: a, error } = await db
      .from("payment_attempts")
      .select(
        "id,contribution_id,provider,provider_order_id,amount_paise,status",
      )
      .eq("provider_order_id", entity.order_id)
      .eq("provider", "razorpay_test")
      .maybeSingle();
    if (error) throw error;
    if (!a)
      throw new HttpError(503, "Order association not yet available; retry.");
    const p = await razorpay<ProviderPayment>(
      `payments/${encodeURIComponent(entity.id)}`,
    );
    if (
      p.id !== entity.id ||
      p.order_id !== a.provider_order_id ||
      p.amount !== a.amount_paise ||
      p.currency !== "INR"
    )
      throw new HttpError(400, "Payment mismatch.");
    const status = capturedPayment(p, a.provider_order_id, a.amount_paise)
      ? "succeeded"
      : p.status === "failed"
        ? "failed"
        : "pending";
    await transition(a, status, p.id, id, event.event);
    return NextResponse.json({ received: true });
  } catch (e) {
    return apiError(e);
  }
}
