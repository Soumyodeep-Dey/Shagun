import { NextResponse } from "next/server";
import { apiError, sameOrigin, rateLimit, readJson } from "@/server/http";
import { createOrder } from "@/server/services/payments";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    await rateLimit(req, "create-order", 15);
    return NextResponse.json(await createOrder(await readJson(req)));
  } catch (e) {
    return apiError(e);
  }
}
