import { createClient } from "@supabase/supabase-js";
const {
  NEXT_PUBLIC_SUPABASE_URL: url,
  SUPABASE_SERVICE_ROLE_KEY: key,
  DEMO_OWNER_USER_ID: owner,
} = process.env;
if (!url || !key || !owner)
  throw new Error(
    "Set Supabase URL, service role key and explicit DEMO_OWNER_USER_ID.",
  );
const db = createClient(url, key, { auth: { persistSession: false } });
const {
  data: { user },
  error: authError,
} = await db.auth.admin.getUserById(owner);
if (authError || !user)
  throw new Error("Demo owner must be an existing Auth user.");
const date = new Date();
date.setUTCDate(date.getUTCDate() + 30);
const { data: c, error } = await db
  .from("couples")
  .upsert(
    {
      user_id: owner,
      partner1_name: "Aisha",
      partner2_name: "Rahul",
      wedding_date: date.toISOString().slice(0, 10),
      slug: "aisha-rahul",
      message:
        "Your presence is our greatest gift. If you’d like to give Shagun, you can leave a blessing and contribute towards our new beginning.",
      published_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  )
  .select("id")
  .single();
if (error) throw error;
const ids = [
  "e4b58d9d-433d-49eb-aa43-89fd20162701",
  "e4b58d9d-433d-49eb-aa43-89fd20162702",
];
const { data: existing, error: readError } = await db
  .from("goals")
  .select("id,couple_id")
  .in("id", ids);
if (readError) throw readError;
if (existing.some((g) => g.couple_id !== c.id))
  throw new Error("Seed goal IDs belong to a different demo owner.");
const { error: goalError } = await db.from("goals").upsert([
  {
    id: ids[0],
    couple_id: c.id,
    title: "Honeymoon in Europe",
    target_amount_paise: 30000000,
    icon: "plane",
    note: "A little adventure, a lifetime of memories.",
    sort_order: 0,
  },
  {
    id: ids[1],
    couple_id: c.id,
    title: "First Home",
    target_amount_paise: 100000000,
    icon: "home",
    note: "A place to make our own.",
    sort_order: 1,
  },
]);
if (goalError) throw goalError;
console.log(
  "Seeded Aisha & Rahul for the configured Auth owner. No payments seeded.",
);
