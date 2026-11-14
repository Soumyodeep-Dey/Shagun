import { beforeEach, afterEach, describe, it, expect } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import {
  freshDb,
  ownerA,
  ownerB,
  wedding,
  gift,
  prerequisites,
  migrations,
} from "./helpers/database";
import { PGlite as LegacyDb } from "@electric-sql/pglite";
let db: PGlite;
beforeEach(async () => {
  db = await freshDb();
}, 30000);
afterEach(async () => db.close());
async function snapshot() {
  return (
    await db.query(
      "select jsonb_build_object('couples',(select jsonb_agg(to_jsonb(c)) from public.couples c),'goals',(select jsonb_agg(to_jsonb(g)) from public.goals g)) s",
    )
  ).rows;
}
describe("BUILD-03 transactional demo identity", () => {
  it("first run and repeated run preserve IDs and have exactly two correct goals", async () => {
    await db.query(
      "insert into auth.users values($1,'{\"shagun_demo\":true}')",
      [ownerA],
    );
    const first = await db.query("select public.seed_demo($1) id", [ownerA]);
    const second = await db.query("select public.seed_demo($1) id", [ownerA]);
    expect(second.rows).toEqual(first.rows);
    expect((await db.query("select * from public.couples")).rows).toHaveLength(
      1,
    );
    const goals = await db.query<{ target_amount_paise: number }>(
      "select target_amount_paise from public.goals order by sort_order",
    );
    expect(goals.rows.map((g) => Number(g.target_amount_paise))).toEqual([
      30000000, 100000000,
    ]);
    expect(
      (
        await db.query(
          "select wedding_date=(now() at time zone 'Asia/Kolkata')::date+30 correct from public.couples",
        )
      ).rows[0],
    ).toEqual({ correct: true });
  });
  it("aborts for an unmarked Auth identity without changes", async () => {
    await db.query("insert into auth.users(id) values($1)", [ownerA]);
    const before = await snapshot();
    await expect(
      db.query("select public.seed_demo($1)", [ownerA]),
    ).rejects.toThrow("Explicit demo");
    expect(await snapshot()).toEqual(before);
  });
  it("protects a conflicting demo slug owned by someone else", async () => {
    await wedding(db, ownerB, "aisha-rahul");
    await db.query(
      "insert into auth.users values($1,'{\"shagun_demo\":true}')",
      [ownerA],
    );
    const before = await snapshot();
    await expect(
      db.query("select public.seed_demo($1)", [ownerA]),
    ).rejects.toThrow("Demo slug");
    expect(await snapshot()).toEqual(before);
  });
  it("protects existing non-demo wedding even when its Auth owner is marked demo", async () => {
    await wedding(db);
    await db.query(
      "update auth.users set raw_app_meta_data='{\"shagun_demo\":true}' where id=$1",
      [ownerA],
    );
    const before = await snapshot();
    await expect(
      db.query("select public.seed_demo($1)", [ownerA]),
    ).rejects.toThrow("non-demo");
    expect(await snapshot()).toEqual(before);
  });
  it("rolls all profile writes back if goal insertion fails", async () => {
    await db.query(
      "insert into auth.users values($1,'{\"shagun_demo\":true}')",
      [ownerA],
    );
    await db.exec(
      "create function public.reject_test_goal() returns trigger language plpgsql as $$begin raise exception 'injected goal failure';end$$;create trigger reject_goal before insert on public.goals for each row execute function public.reject_test_goal();",
    );
    const before = await snapshot();
    await expect(
      db.query("select public.seed_demo($1)", [ownerA]),
    ).rejects.toThrow("injected");
    expect(await snapshot()).toEqual(before);
  });
});
describe("PAY-18 captures and exact accounting", () => {
  it("upgrade backfills already-verified attempts and identifies existing extra captures without changing gift totals", async () => {
    const legacy = new LegacyDb();
    try {
      await legacy.exec(prerequisites);
      const sql = migrations();
      for (const migration of sql.slice(0, 2))
        await legacy.exec(
          migration.replace("create extension if not exists pgcrypto;", ""),
        );
      await wedding(legacy);
      const g = await gift(legacy);
      await legacy.query(
        "select public.apply_payment($1,'succeeded','mock_legacy_one',null,null)",
        [g.attempt_id],
      );
      await legacy.query(
        "insert into public.payment_attempts(contribution_id,provider,provider_payment_id,amount_paise,currency,status,idempotency_key) values($1,'mock','mock_legacy_two',100100,'INR','succeeded',$2)",
        [g.contribution_id, crypto.randomUUID()],
      );
      const before = await legacy.query(
        "select amount_paise,payment_status from public.contributions",
      );
      await legacy.exec(sql[2]);
      expect(
        (await legacy.query("select * from public.payment_captures")).rows,
      ).toHaveLength(2);
      expect(
        (await legacy.query("select * from public.duplicate_capture_incidents"))
          .rows,
      ).toHaveLength(1);
      expect(
        (
          await legacy.query(
            "select amount_paise,payment_status from public.contributions",
          )
        ).rows,
      ).toEqual(before.rows);
    } finally {
      await legacy.close();
    }
  });
  it("preserves two captured attempts, one incident and explicit extra funds without double counting", async () => {
    await wedding(db);
    const g = await gift(db);
    await db.query("select public.apply_payment($1,'failed',null,null,null)", [
      g.attempt_id,
    ]);
    const retry = await db.query<{ g: { attempt_id: string } }>(
      "select public.create_gift($1::jsonb) g",
      [JSON.stringify({ ...g.input, attempt_key: crypto.randomUUID() })],
    );
    const a2 = retry.rows[0].g.attempt_id;
    for (const [a, p] of [
      [g.attempt_id, "mock_first"],
      [a2, "mock_second"],
      [a2, "mock_second"],
    ])
      await db.query(
        "select public.apply_payment($1,'succeeded',$2,null,null)",
        [a, p],
      );
    expect(
      (await db.query("select * from public.payment_captures")).rows,
    ).toHaveLength(2);
    expect(
      (await db.query("select * from public.duplicate_capture_incidents")).rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query(
          "select provider_payment_id from public.payment_attempts order by provider_payment_id",
        )
      ).rows,
    ).toEqual([
      { provider_payment_id: "mock_first" },
      { provider_payment_id: "mock_second" },
    ]);
    const r = await db.query<{
      intended_amount_paise: number;
      extra_amount_paise: number;
    }>("select * from public.payment_reconciliation");
    expect(Number(r.rows[0].intended_amount_paise)).toBe(100100);
    expect(Number(r.rows[0].extra_amount_paise)).toBe(100100);
    expect(
      Number(
        (
          await db.query<{ n: number }>(
            "select sum(amount_paise) n from public.contributions where payment_status='succeeded'",
          )
        ).rows[0].n,
      ),
    ).toBe(100100);
  });
  it("also preserves two distinct captures on the same order/attempt", async () => {
    await wedding(db);
    const g = await gift(db);
    for (const id of ["mock_one", "mock_two", "mock_two"])
      await db.query(
        "select public.apply_payment($1,'succeeded',$2,null,null)",
        [g.attempt_id, id],
      );
    expect(
      (await db.query("select * from public.payment_captures")).rows,
    ).toHaveLength(2);
    expect(
      (await db.query("select * from public.duplicate_capture_incidents")).rows,
    ).toHaveLength(1);
  });
  it("DASH-01/02: exact ₹3503 total excludes pending ₹5001 and failed ₹1001", async () => {
    await wedding(db);
    for (const amount of [50100, 100100, 200100]) {
      const g = await gift(db, "test-wedding", amount);
      await db.query(
        "select public.apply_payment($1,'succeeded',$2,null,null)",
        [g.attempt_id, `mock_${g.attempt_id}`],
      );
    }
    await gift(db, "test-wedding", 500100);
    const failed = await gift(db);
    await db.query("select public.apply_payment($1,'failed',null,null,null)", [
      failed.attempt_id,
    ]);
    await db.exec(
      `set role authenticated;select set_config('request.jwt.claim.sub','${ownerA}',false);`,
    );
    const s = await db.query<{
      s: { rows: { amount_paise: number }[]; pending_count: number };
    }>("select public.dashboard_summary() s");
    expect(s.rows[0].s.rows).toEqual([
      { goal_id: null, payment_mode: "mock", amount_paise: 350300 },
    ]);
    expect(s.rows[0].s.pending_count).toBe(1);
    await db.exec("reset role");
  });
  it("investigation records and capture ledger are inaccessible to anonymous and owner clients", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      for (const table of [
        "payment_discrepancies",
        "payment_captures",
        "duplicate_capture_incidents",
        "payment_reconciliation",
      ])
        await expect(db.query(`select * from public.${table}`)).rejects.toThrow(
          "permission denied",
        );
      await db.exec("reset role");
    }
  });
  it("general Shagun and two private goals aggregate into the correct categories", async () => {
    const cid = await wedding(db),
      ids = [crypto.randomUUID(), crypto.randomUUID()];
    for (const id of ids)
      await db.query(
        "insert into public.goals(id,couple_id,title,target_amount_paise) values($1,$2,'Dream',100000)",
        [id, cid],
      );
    for (const [index, amount] of [50100, 100100, 200100].entries()) {
      const g = await gift(db, "test-wedding", amount);
      if (index > 0)
        await db.query(
          "update public.contributions set goal_id=$1 where id=$2",
          [ids[index - 1], g.contribution_id],
        );
      await db.query(
        "select public.apply_payment($1,'succeeded',$2,null,null)",
        [g.attempt_id, `mock_${index}`],
      );
    }
    await db.exec(
      `set role authenticated;select set_config('request.jwt.claim.sub','${ownerA}',false);`,
    );
    const result = await db.query<{
      s: { rows: { goal_id: string | null; amount_paise: number }[] };
    }>("select public.dashboard_summary() s");
    const amounts = new Map(
      result.rows[0].s.rows.map((row) => [
        row.goal_id,
        Number(row.amount_paise),
      ]),
    );
    expect(amounts.get(null)).toBe(50100);
    expect(amounts.get(ids[0])).toBe(100100);
    expect(amounts.get(ids[1])).toBe(200100);
    await db.exec("reset role");
  });
  it("another owner cannot edit a foreign goal or change a verified amount", async () => {
    const cid = await wedding(db);
    await wedding(db, ownerB, "other-wedding");
    const id = crypto.randomUUID();
    await db.query(
      "insert into public.goals(id,couple_id,title,target_amount_paise) values($1,$2,'Protected',100100)",
      [id, cid],
    );
    const g = await gift(db);
    await db.query(
      "select public.apply_payment($1,'succeeded','mock_protected',null,null)",
      [g.attempt_id],
    );
    const before = await snapshot();
    await db.exec(
      `set role authenticated;select set_config('request.jwt.claim.sub','${ownerB}',false);`,
    );
    await expect(
      db.query("update public.contributions set amount_paise=1 where id=$1", [
        g.contribution_id,
      ]),
    ).rejects.toThrow("permission denied");
    await expect(
      db.query("select public.save_wedding($1::jsonb)", [
        JSON.stringify({
          partner1_name: "B changed",
          partner2_name: "B",
          wedding_date: "2026-12-14",
          slug: "other-wedding",
          photo_url: "",
          message: "",
          publish: true,
          goals: [
            {
              id,
              title: "Stolen",
              target_amount_paise: 1,
              icon: "heart",
              note: "",
            },
          ],
        }),
      ]),
    ).rejects.toThrow("Invalid goal");
    await db.exec("reset role");
    expect(await snapshot()).toEqual(before);
    expect(
      Number(
        (
          await db.query<{ amount_paise: number }>(
            "select amount_paise from public.contributions where id=$1",
            [g.contribution_id],
          )
        ).rows[0].amount_paise,
      ),
    ).toBe(100100);
  });
  it("four goals rejected by database without partial profile writes", async () => {
    await wedding(db);
    await db.exec(
      `set role authenticated;select set_config('request.jwt.claim.sub','${ownerA}',false);`,
    );
    const p = {
      partner1_name: "Changed",
      partner2_name: "Changed",
      slug: "test-wedding",
      wedding_date: "2026-12-14",
      photo_url: "",
      message: "",
      publish: true,
      goals: Array.from({ length: 4 }, () => ({
        title: "Dream",
        target_amount_paise: 100,
        icon: "heart",
        note: "",
      })),
    };
    await expect(
      db.query("select public.save_wedding($1::jsonb)", [JSON.stringify(p)]),
    ).rejects.toThrow("At most three");
    expect(
      (await db.query("select partner1_name from public.couples")).rows[0],
    ).toEqual({ partner1_name: "First" });
    await db.exec("reset role");
  });
});
