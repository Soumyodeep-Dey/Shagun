import { NextResponse } from "next/server";
import { publicWedding } from "@/server/services/weddings";
import { apiError } from "@/server/http";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const wedding = await publicWedding(slug);
    return NextResponse.json(wedding || { error: "Wedding unavailable." }, {
      status: wedding ? 200 : 404,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return apiError(e);
  }
}
