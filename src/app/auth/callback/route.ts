import { NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase/server";
import { safeNext } from "@/lib/utils";
import { appUrl } from "@/lib/env";
export async function GET(req: Request) {
  const url = new URL(req.url),
    code = url.searchParams.get("code");
  if (code) {
    const db = await serverDb();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error)
      return NextResponse.redirect(
        new URL(safeNext(url.searchParams.get("next")), appUrl()),
      );
  }
  return NextResponse.redirect(new URL("/login?error=callback", appUrl()));
}
