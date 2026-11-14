import { createClient } from "@supabase/supabase-js";
const {
  NEXT_PUBLIC_SUPABASE_URL: url,
  SUPABASE_SERVICE_ROLE_KEY: key,
  DEMO_OWNER_USER_ID: owner,
} = process.env;
if (!url || !key || !owner)
  throw new Error(
    "Set Supabase URL, service role key and explicit DEMO_OWNER_USER_ID locally.",
  );
const db = createClient(url, key, { auth: { persistSession: false } });
const { error } = await db.rpc("seed_demo", { owner_id: owner });
if (error) throw new Error(`Demo seed aborted: ${error.message}`);
console.log(
  "Seeded the explicitly marked demo identity transactionally. No payments seeded.",
);
