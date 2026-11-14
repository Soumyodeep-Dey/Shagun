import { NextResponse } from "next/server";
import { z } from "zod";
import { serverDb } from "@/lib/supabase/server";
import { apiError, HttpError, sameOrigin, readJson } from "@/server/http";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const db = await serverDb();
    const { data, error } = await db.auth.getClaims();
    if (error || !data?.claims.sub)
      throw new HttpError(401, "Sign in to continue.");
    const { id } = z.object({ id: z.uuid() }).parse(await readJson(req));
    const { error: e } = await db.rpc("mark_thanked", { cid: id });
    if (e) throw new HttpError(404, "Gift unavailable.");
    return NextResponse.json({ thanked: true });
  } catch (e) {
    return apiError(e);
  }
}
