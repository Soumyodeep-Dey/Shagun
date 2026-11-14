import { NextResponse } from "next/server";
import { z } from "zod";
import { paymentMode } from "@/lib/env";
import {
  apiError,
  HttpError,
  sameOrigin,
  readJson,
  rateLimit,
} from "@/server/http";
import { scopedAttempt, transition } from "@/server/services/payments";
const schema = z
  .object({
    token: z.string().regex(/^[a-f0-9]{64}$/),
    attempt_id: z.uuid(),
    outcome: z.enum(["succeeded", "failed", "cancelled"]),
  })
  .strict();
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    if (paymentMode() !== "mock") throw new HttpError(404, "Not found.");
    await rateLimit(req, "mock", 40);
    const input = schema.parse(await readJson(req));
    const { attempt } = await scopedAttempt(input.token, input.attempt_id);
    if (attempt.provider !== "mock") throw new HttpError(400, "Mode mismatch.");
    await transition(attempt, input.outcome, `mock_${attempt.id}`);
    return NextResponse.json({
      status: (await scopedAttempt(input.token)).gift.payment_status,
    });
  } catch (e) {
    return apiError(e);
  }
}
