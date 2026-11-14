import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, sameOrigin, rateLimit, readJson } from "@/server/http";
import { verifyCallback } from "@/server/services/payments";
const schema = z
  .object({
    token: z.string().regex(/^[a-f0-9]{64}$/),
    attempt_id: z.uuid(),
    razorpay_payment_id: z.string().regex(/^pay_[a-zA-Z0-9]+$/),
    razorpay_order_id: z.string().regex(/^order_[a-zA-Z0-9]+$/),
    razorpay_signature: z.string().length(64),
  })
  .strict();
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    await rateLimit(req, "verify", 40);
    return NextResponse.json(
      await verifyCallback(schema.parse(await readJson(req))),
    );
  } catch (e) {
    return apiError(e);
  }
}
