import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
export const prerequisites = `
create role anon;create role authenticated;create role service_role bypassrls;
create schema auth;create table auth.users(id uuid primary key,raw_app_meta_data jsonb not null default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to public;
create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid,name text,bucket_id text);alter table storage.objects enable row level security;
create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;`;
export const migrations = () =>
  readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(`supabase/migrations/${f}`, "utf8"));
export async function freshDb() {
  const db = new PGlite();
  await db.exec(prerequisites);
  for (const sql of migrations())
    await db.exec(sql.replace("create extension if not exists pgcrypto;", ""));
  return db;
}
export const ownerA = "10000000-0000-4000-8000-000000000011",
  ownerB = "10000000-0000-4000-8000-000000000012";
export async function wedding(
  db: PGlite,
  owner = ownerA,
  slug = "test-wedding",
) {
  await db.query(
    "insert into auth.users(id) values($1) on conflict do nothing",
    [owner],
  );
  const r = await db.query<{ id: string }>(
    "insert into public.couples(user_id,partner1_name,partner2_name,wedding_date,slug,message,published_at) values($1,'First','Second',current_date+30,$2,'Welcome',now()) returning id",
    [owner, slug],
  );
  return r.rows[0].id;
}
export async function gift(db: PGlite, slug = "test-wedding", amount = 100100) {
  const p = {
    slug,
    goal_id: null,
    guest_name: "Guest",
    amount_paise: amount,
    blessing_message: "",
    envelope_design: "red",
    mode: "mock",
    token_hash: crypto.randomUUID(),
    request_key: crypto.randomUUID(),
    attempt_key: crypto.randomUUID(),
    request_hash: "immutable",
  };
  const r = await db.query<{
    g: { contribution_id: string; attempt_id: string };
  }>("select public.create_gift($1::jsonb) g", [JSON.stringify(p)]);
  return { ...r.rows[0].g, input: p };
}
