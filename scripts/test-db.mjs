import { createClient } from "@supabase/supabase-js";
const {
  NEXT_PUBLIC_SUPABASE_URL: url,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
} = process.env;
if (!url || !key)
  throw new Error("Configure .env.local with hosted or local Supabase first.");
const anon = createClient(url, key, { auth: { persistSession: false } });
for (const table of [
  "contributions",
  "payment_attempts",
  "webhook_events",
  "couples",
  "goals",
]) {
  const { data, error } = await anon.from(table).select("*").limit(1);
  if (!error && data?.length) throw new Error(`Anonymous exposure: ${table}`);
  console.log(`${table}: anonymous read reveals no rows`);
}
const { error } = await anon.rpc("apply_payment", {
  aid: crypto.randomUUID(),
  new_status: "succeeded",
});
if (!error) throw new Error("Anonymous payment writes unexpectedly enabled.");
console.log("Anonymous payment mutation rejected.");
