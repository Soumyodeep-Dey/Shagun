"use client";
import { createBrowserClient } from "@supabase/ssr";
export function browserDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Configure Supabase before signing in.");
  return createBrowserClient(url, key);
}
