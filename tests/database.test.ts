import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
let db: PGlite;
const owner = "10000000-0000-4000-8000-000000000001",
  other = "10000000-0000-4000-8000-000000000002";
let gid: string, attempt: string;
const request = "20000000-0000-4000-8000-000000000001",
  attemptKey = "20000000-0000-4000-8000-000000000002";
const profile = {
  partner1_name: "Aisha",
  partner2_name: "Rahul",
  wedding_date: "2026-12-14",
  slug: "aisha-rahul",
  photo_url: "",
  message: "Welcome",
  publish: true,
  goals: [
    {
      title: "Home",
      target_amount_paise: 10000000,
      icon: "home",
      note: "Together",
    },
  ],
};
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to public;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid,name text,bucket_id text);alter table storage.objects enable row level security;create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;insert into auth.users values('${owner}'),('${other}');`,
  );
  const sql = readFileSync(
    "supabase/migrations/202611140001_initial.sql",
    "utf8",
  ).replace("create extension if not exists pgcrypto;", "");
  await db.exec(sql);
  await db.exec(
    readFileSync(
      "supabase/migrations/202611140002_dashboard_summary.sql",
      "utf8",
    ),
  );
  await db.exec(
    "alter table auth.users add column raw_app_meta_data jsonb not null default '{}'::jsonb;",
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/202611140003_acceptance_integrity.sql",
      "utf8",
    ),
  );
  await db.exec(
    `set role authenticated;select set_config('request.jwt.claim.sub','${owner}',false);`,
  );
  const r = await db.query<{ id: string }>(
    "select public.save_wedding($1::jsonb) as id",
    [JSON.stringify(profile)],
  );
  expect(r.rows[0].id).toBeTruthy();
  const g = await db.query<{ id: string }>("select id from public.goals");
  gid = g.rows[0].id;
  await db.exec("reset role;");
}, 30000);
afterAll(async () => {
  await db?.close();
});
describe("PostgreSQL migration, isolation and transitions", () => {
  it("denies anonymous financial reads and direct writes", async () => {
    await db.exec("set role anon;");
    await expect(
      db.query("select * from public.contributions"),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.query("select public.create_gift($1::jsonb)", ["{}"]),
    ).rejects.toThrow(/permission denied/);
    await db.exec("reset role;");
  });
  it("isolates owner records and rejects slug races", async () => {
    await db.exec(
      `set role authenticated;select set_config('request.jwt.claim.sub','${other}',false);`,
    );
    expect((await db.query("select * from public.couples")).rows).toHaveLength(
      0,
    );
    expect((await db.query("select * from public.goals")).rows).toHaveLength(0);
    await expect(
      db.query("select public.save_wedding($1::jsonb)", [
        JSON.stringify(profile),
      ]),
    ).rejects.toThrow(/unique/);
    await expect(
      db.query("update public.contributions set payment_status='succeeded'"),
    ).rejects.toThrow(/permission denied/);
    await db.exec("reset role;");
  });
  it("creates one intent for repeated requests and rejects changed amounts", async () => {
    const p = {
      slug: "aisha-rahul",
      goal_id: gid,
      guest_name: "Meera",
      amount_paise: 100100,
      blessing_message: "Bless you",
      envelope_design: "red",
      mode: "mock",
      token_hash: "hash1",
      request_key: request,
      attempt_key: attemptKey,
      request_hash: "same",
    };
    const r = await db.query<{ gift: { attempt_id: string } }>(
      "select public.create_gift($1::jsonb) gift",
      [JSON.stringify(p)],
    );
    attempt = r.rows[0].gift.attempt_id;
    await db.query("select public.create_gift($1::jsonb)", [JSON.stringify(p)]);
    expect(
      (await db.query("select * from public.contributions")).rows,
    ).toHaveLength(1);
    expect(
      (await db.query("select * from public.payment_attempts")).rows,
    ).toHaveLength(1);
    await expect(
      db.query("select public.create_gift($1::jsonb)", [
        JSON.stringify({ ...p, request_hash: "changed", amount_paise: 500 }),
      ]),
    ).rejects.toThrow(/Idempotency conflict/);
  });
  it("rejects goal/couple mismatches and unpublished recipients", async () => {
    await db.exec(
      `set role authenticated;select set_config('request.jwt.claim.sub','${other}',false);`,
    );
    await db.query("select public.save_wedding($1::jsonb)", [
      JSON.stringify({ ...profile, slug: "other-wedding", goals: [] }),
    ]);
    await db.exec("reset role;");
    const p = {
      slug: "other-wedding",
      goal_id: gid,
      guest_name: "X",
      amount_paise: 100,
      blessing_message: "",
      envelope_design: "gold",
      mode: "mock",
      token_hash: "hash2",
      request_key: crypto.randomUUID(),
      attempt_key: crypto.randomUUID(),
      request_hash: "different",
    };
    await expect(
      db.query("select public.create_gift($1::jsonb)", [JSON.stringify(p)]),
    ).rejects.toThrow(/Dream unavailable/);
    await db.query(
      "update public.couples set published_at=null where slug=$1",
      ["other-wedding"],
    );
    await expect(
      db.query("select public.create_gift($1::jsonb)", [
        JSON.stringify({ ...p, goal_id: null }),
      ]),
    ).rejects.toThrow(/Wedding unavailable/);
  });
  it("supports retries without duplicating the contribution", async () => {
    const previousAttempt = attempt;
    await db.query("select public.apply_payment($1,'failed',null,null,null)", [
      attempt,
    ]);
    const p = {
      slug: "aisha-rahul",
      goal_id: gid,
      guest_name: "Meera",
      amount_paise: 100100,
      blessing_message: "Bless you",
      envelope_design: "red",
      mode: "mock",
      token_hash: "hash1",
      request_key: request,
      attempt_key: crypto.randomUUID(),
      request_hash: "same",
    };
    const r = await db.query<{ gift: { attempt_id: string } }>(
      "select public.create_gift($1::jsonb) gift",
      [JSON.stringify(p)],
    );
    attempt = r.rows[0].gift.attempt_id;
    expect(
      (await db.query("select * from public.contributions")).rows,
    ).toHaveLength(1);
    expect(
      (await db.query("select * from public.payment_attempts")).rows,
    ).toHaveLength(2);
    await db.query("select public.apply_payment($1,'failed',null,null,null)", [
      previousAttempt,
    ]);
    const current = await db.query<{ payment_status: string }>(
      "select payment_status from public.contributions",
    );
    expect(current.rows[0].payment_status).toBe("pending");
  });
  it("commits event processing once and never downgrades success", async () => {
    await db.query(
      "select public.apply_payment($1,'succeeded','mock_payment','evt_1','payment.captured')",
      [attempt],
    );
    await db.query(
      "select public.apply_payment($1,'succeeded','mock_payment','evt_1','payment.captured')",
      [attempt],
    );
    await db.query(
      "select public.apply_payment($1,'failed','mock_payment','evt_2','payment.failed')",
      [attempt],
    );
    const r = await db.query<{ payment_status: string; amount_paise: number }>(
      "select payment_status,amount_paise from public.contributions",
    );
    expect(r.rows[0].payment_status).toBe("succeeded");
    expect(Number(r.rows[0].amount_paise)).toBe(100100);
    expect(
      (await db.query("select * from public.webhook_events")).rows,
    ).toHaveLength(2);
  });
  it("marks thanked only for the authenticated owner, preserving archived history", async () => {
    const r = await db.query<{ id: string }>(
      "select id from public.contributions",
    );
    const giftId = r.rows[0].id;
    await db.exec(
      `set role authenticated;select set_config('request.jwt.claim.sub','${other}',false);`,
    );
    expect(
      (await db.query("select * from public.contributions")).rows,
    ).toHaveLength(0);
    expect(
      (await db.query("select * from public.payment_attempts")).rows,
    ).toHaveLength(0);
    await expect(
      db.query("select public.mark_thanked($1)", [giftId]),
    ).rejects.toThrow(/unavailable/);
    await db.exec(
      `select set_config('request.jwt.claim.sub','${owner}',false);`,
    );
    await db.query("select public.mark_thanked($1)", [giftId]);
    await db.query("select public.save_wedding($1::jsonb)", [
      JSON.stringify({ ...profile, goals: [] }),
    ]);
    const gifts = await db.query<{ thanked_at: string }>(
      "select thanked_at from public.contributions",
    );
    expect(gifts.rows[0].thanked_at).toBeTruthy();
    const goals = await db.query<{ is_active: boolean }>(
      "select is_active from public.goals",
    );
    expect(goals.rows[0].is_active).toBe(false);
    await db.exec("reset role;");
  });
  it("aggregates only the current owner’s successful records independently of pagination", async () => {
    await db.exec(
      `set role authenticated;select set_config('request.jwt.claim.sub','${owner}',false);`,
    );
    const summary = await db.query<{
      s: { pending_count: number; rows: { amount_paise: number }[] };
    }>("select public.dashboard_summary() s");
    expect(summary.rows[0].s.rows).toHaveLength(1);
    expect(Number(summary.rows[0].s.rows[0].amount_paise)).toBe(100100);
    await db.exec(
      `select set_config('request.jwt.claim.sub','${other}',false);`,
    );
    const otherSummary = await db.query<{ s: { rows: unknown[] } }>(
      "select public.dashboard_summary() s",
    );
    expect(otherSummary.rows[0].s.rows).toHaveLength(0);
    await db.exec("reset role;");
  });
  it("enforces shared rate limits in PostgreSQL", async () => {
    for (let i = 0; i < 3; i++) {
      const r = await db.query<{ ok: boolean }>(
        "select public.take_rate_limit('test',2,60) ok",
      );
      expect(r.rows[0].ok).toBe(i < 2);
    }
  });
});
