import { beforeAll, afterAll, describe, it, expect } from "vitest";
import pg from "pg";
import { prerequisites, migrations } from "./helpers/database";
const enabled = !!process.env.TEST_DATABASE_URL;
const connectionString = process.env.TEST_DATABASE_URL;
const db = new pg.Client({ connectionString });
describe.skipIf(!enabled)(
  "independent PostgreSQL connections (not PGlite)",
  () => {
    beforeAll(async () => {
      const url = new URL(connectionString!);
      if (
        !["127.0.0.1", "localhost"].includes(url.hostname) ||
        !url.pathname.startsWith("/shagun_test_")
      )
        throw new Error("Use an isolated local shagun_test_ database.");
      await db.connect();
      const setup = prerequisites.replaceAll(
        /create role (anon|authenticated|service_role)( bypassrls)?;/g,
        (_, role, options) =>
          `do $$begin if not exists(select 1 from pg_roles where rolname='${role}') then create role ${role}${options || ""};end if;end$$;`,
      );
      await db.query(setup);
      for (const sql of migrations()) await db.query(sql);
    }, 30000);
    afterAll(async () => {
      if (enabled) await db.end();
    });
    async function fixture() {
      const owner = crypto.randomUUID(),
        slug = `pg-${crypto.randomUUID()}`;
      await db.query("insert into auth.users(id) values($1)", [owner]);
      await db.query(
        "insert into public.couples(user_id,partner1_name,partner2_name,wedding_date,slug,published_at) values($1,'A','B',current_date,$2,now())",
        [owner, slug],
      );
      const input = {
        slug,
        goal_id: null,
        guest_name: "Guest",
        amount_paise: 100100,
        blessing_message: "",
        envelope_design: "red",
        mode: "razorpay_test",
        token_hash: crypto.randomUUID(),
        request_key: crypto.randomUUID(),
        attempt_key: crypto.randomUUID(),
        request_hash: "same",
      };
      const { rows } = await db.query(
        "select public.create_gift($1::jsonb) g",
        [JSON.stringify(input)],
      );
      return { ...rows[0].g, input };
    }
    async function blockedBy(pid: number, blocker: number) {
      for (let i = 0; i < 40; i++) {
        const { rows } = await db.query(
          "select $2::integer=any(pg_blocking_pids($1::integer)) blocked",
          [pid, blocker],
        );
        if (rows[0].blocked) return;
        await new Promise((r) => setTimeout(r, 25));
      }
      throw new Error(
        "The second independent connection never demonstrated a concurrent lock wait.",
      );
    }
    it.each([false, true])(
      "serializes distinct captures with reversed arrival=%s and accounts extra funds",
      async (reverse) => {
        const g = await fixture();
        await db.query(
          "select public.apply_payment($1,'failed',null,null,null)",
          [g.attempt_id],
        );
        const retry = await db.query("select public.create_gift($1::jsonb) g", [
          JSON.stringify({ ...g.input, attempt_key: crypto.randomUUID() }),
        ]);
        const ids = [g.attempt_id, retry.rows[0].g.attempt_id];
        if (reverse) ids.reverse();
        const a = new pg.Client({ connectionString }),
          b = new pg.Client({ connectionString });
        await Promise.all([a.connect(), b.connect()]);
        let pending: Promise<pg.QueryResult> | undefined;
        try {
          const [pa, pb] = await Promise.all([
            a.query("select pg_backend_pid() pid"),
            b.query("select pg_backend_pid() pid"),
          ]);
          expect(pa.rows[0].pid).not.toBe(pb.rows[0].pid);
          await a.query("begin");
          await a.query(
            "select id from public.contributions where id=$1 for update",
            [g.contribution_id],
          );
          const p1 = `pay_${crypto.randomUUID().replaceAll("-", "")}`,
            p2 = `pay_${crypto.randomUUID().replaceAll("-", "")}`;
          pending = b.query(
            "select public.apply_payment($1,'succeeded',$2,$3,'payment.captured')",
            [ids[1], p2, `event_${p2}`],
          );
          await blockedBy(pb.rows[0].pid, pa.rows[0].pid);
          await a.query(
            "select public.apply_payment($1,'succeeded',$2,$3,'payment.captured')",
            [ids[0], p1, `event_${p1}`],
          );
          await a.query("commit");
          await pending;
          await b.query(
            "select public.apply_payment($1,'succeeded',$2,$3,'payment.captured')",
            [ids[1], p2, `event_${p2}`],
          );
          const ledger = await db.query(
            "select * from public.payment_captures where contribution_id=$1",
            [g.contribution_id],
          );
          expect(ledger.rows).toHaveLength(2);
          expect(
            new Set(ledger.rows.map((r) => r.provider_payment_id)),
          ).toEqual(new Set([p1, p2]));
          expect(
            (
              await db.query(
                "select * from public.duplicate_capture_incidents where contribution_id=$1",
                [g.contribution_id],
              )
            ).rowCount,
          ).toBe(1);
          const totals = await db.query(
            "select * from public.payment_reconciliation where contribution_id=$1",
            [g.contribution_id],
          );
          expect(Number(totals.rows[0].intended_amount_paise)).toBe(100100);
          expect(Number(totals.rows[0].extra_amount_paise)).toBe(100100);
          expect(
            (
              await db.query(
                "select * from public.contributions where id=$1 and payment_status='succeeded'",
                [g.contribution_id],
              )
            ).rowCount,
          ).toBe(1);
        } finally {
          await a.query("rollback");
          await pending?.catch(() => {});
          await Promise.all([a.end(), b.end()]);
        }
      },
    );
    it("same payment callback and webhook concurrently create one capture and no duplicate incident", async () => {
      const g = await fixture(),
        p = `pay_${crypto.randomUUID().replaceAll("-", "")}`;
      const a = new pg.Client({ connectionString }),
        b = new pg.Client({ connectionString });
      await Promise.all([a.connect(), b.connect()]);
      try {
        await Promise.all([
          a.query("select public.apply_payment($1,'succeeded',$2,null,null)", [
            g.attempt_id,
            p,
          ]),
          b.query(
            "select public.apply_payment($1,'succeeded',$2,$3,'payment.captured')",
            [g.attempt_id, p, `evt_${p}`],
          ),
        ]);
        expect(
          (
            await db.query(
              "select * from public.payment_captures where contribution_id=$1",
              [g.contribution_id],
            )
          ).rowCount,
        ).toBe(1);
        expect(
          (
            await db.query(
              "select * from public.duplicate_capture_incidents where contribution_id=$1",
              [g.contribution_id],
            )
          ).rowCount,
        ).toBe(0);
      } finally {
        await Promise.all([a.end(), b.end()]);
      }
    });
    it("two simultaneous owners racing for one slug produce one profile and one uniqueness conflict", async () => {
      const ids = [crypto.randomUUID(), crypto.randomUUID()],
        slug = `race-${crypto.randomUUID()}`;
      for (const id of ids)
        await db.query("insert into auth.users(id) values($1)", [id]);
      const clients = [
        new pg.Client({ connectionString }),
        new pg.Client({ connectionString }),
      ];
      await Promise.all(clients.map((c) => c.connect()));
      let pending: Promise<{ error?: { code?: string } }> | undefined;
      try {
        for (let i = 0; i < 2; i++) {
          await clients[i].query("begin");
          await clients[i].query(
            "select set_config('request.jwt.claim.sub',$1,false)",
            [ids[i]],
          );
        }
        const payload = {
          partner1_name: "Race",
          partner2_name: "Partner",
          slug,
          wedding_date: "2026-12-14",
          photo_url: "",
          message: "",
          publish: true,
          goals: [],
        };
        await clients[0].query("select public.save_wedding($1::jsonb)", [
          JSON.stringify(payload),
        ]);
        const pids = await Promise.all(
          clients.map((c) => c.query("select pg_backend_pid() pid")),
        );
        pending = clients[1]
          .query("select public.save_wedding($1::jsonb)", [
            JSON.stringify(payload),
          ])
          .then(
            () => ({}),
            (error) => ({ error }),
          );
        await blockedBy(pids[1].rows[0].pid, pids[0].rows[0].pid);
        await clients[0].query("commit");
        expect((await pending).error?.code).toBe("23505");
        expect(
          (await db.query("select * from public.couples where slug=$1", [slug]))
            .rowCount,
        ).toBe(1);
        expect(
          (
            await db.query("select * from public.couples where user_id=$1", [
              ids[1],
            ])
          ).rowCount,
        ).toBe(0);
      } finally {
        await Promise.all(clients.map((c) => c.query("rollback")));
        await pending;
        await Promise.all(clients.map((c) => c.end()));
      }
    });
    it("a rolled-back event/transition can be retried and committed", async () => {
      const g = await fixture(),
        event = `evt_${crypto.randomUUID()}`,
        p = `pay_${crypto.randomUUID().replaceAll("-", "")}`;
      await db.query(
        "create function public.fail_capture_test() returns trigger language plpgsql as $$begin raise exception 'Injected transient capture failure';end$$;create trigger fail_capture_test before insert on public.payment_captures for each row execute function public.fail_capture_test();",
      );
      await expect(
        db.query(
          "select public.apply_payment($1,'succeeded',$2,$3,'payment.captured')",
          [g.attempt_id, p, event],
        ),
      ).rejects.toThrow("Injected transient capture failure");
      await db.query(
        "drop trigger fail_capture_test on public.payment_captures;drop function public.fail_capture_test();",
      );
      expect(
        (
          await db.query(
            "select * from public.webhook_events where provider_event_id=$1",
            [event],
          )
        ).rowCount,
      ).toBe(0);
      await db.query(
        "select public.apply_payment($1,'succeeded',$2,$3,'payment.captured')",
        [g.attempt_id, p, event],
      );
      expect(
        (
          await db.query(
            "select * from public.webhook_events where provider_event_id=$1",
            [event],
          )
        ).rowCount,
      ).toBe(1);
    });
  },
);
