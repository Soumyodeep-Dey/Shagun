import { NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase/server";
import { appUrl } from "@/lib/env";
import { sameOrigin, apiError } from "@/server/http";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    await (await serverDb()).auth.signOut();
    return NextResponse.redirect(new URL("/", appUrl()), 303);
  } catch (e) {
    return apiError(e);
  }
}
