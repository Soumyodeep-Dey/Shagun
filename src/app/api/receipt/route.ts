import { NextResponse } from "next/server";
import { receiptSchema } from "@/lib/validation/schemas";
import { receipt } from "@/server/services/payments";
import { sameOrigin, rateLimit, readJson, apiError } from "@/server/http";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    await rateLimit(req, "receipt", 60);
    const { token } = receiptSchema.parse(await readJson(req));
    return NextResponse.json(await receipt(token), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return apiError(e);
  }
}
