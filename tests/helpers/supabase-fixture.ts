import type { PGlite } from "@electric-sql/pglite";
// Test-only PostgREST-shaped adapter: real SQL beneath mocked Supabase transport.
// Never imported by application code or used to manufacture connected Auth claims.
export function sqlFixture(
  db: PGlite,
  failTransition: () => boolean = () => false,
) {
  const identifier = (s: string) => {
    if (!/^[a-z_]+$/.test(s)) throw new Error("Unsafe fixture identifier");
    return s;
  };
  return {
    async rpc(name: string, args: Record<string, unknown>) {
      try {
        if (name === "apply_payment" && failTransition())
          return {
            data: null,
            error: {
              message: "Injected transient database failure",
              code: "08006",
            },
          };
        const keys = Object.keys(args);
        const values = keys.map((k) =>
          typeof args[k] === "object" && args[k] !== null
            ? JSON.stringify(args[k])
            : args[k],
        );
        const r = await db.query(
          `select public.${identifier(name)}(${keys.map((k, i) => `${identifier(k)} => $${i + 1}`).join(",")}) result`,
          values,
        );
        return { data: (r.rows[0] as { result: unknown }).result, error: null };
      } catch (e) {
        return { data: null, error: e };
      }
    },
    from(table: string) {
      identifier(table);
      let fields = "*",
        operation = "select",
        values: Record<string, unknown> = {},
        limit: number | undefined;
      const filters: {
        column: string;
        value: unknown;
        isNull?: boolean;
        notNull?: boolean;
      }[] = [];
      const sorts: string[] = [];
      async function run() {
        try {
          const params: unknown[] = [];
          let sql = "";
          if (operation === "upsert") {
            const rows = Array.isArray(values) ? values : [values];
            for (const row of rows) {
              const keys = Object.keys(row);
              await db.query(
                `insert into public.${table}(${keys.map(identifier).join(",")}) values(${keys.map((_, i) => `$${i + 1}`).join(",")}) on conflict(fingerprint) do nothing`,
                keys.map((k) => row[k]),
              );
            }
            return { data: null, error: null };
          }
          const where = filters
            .map((f) =>
              f.notNull
                ? `${identifier(f.column)} is not null`
                : f.isNull
                  ? `${identifier(f.column)} is null`
                  : (params.push(f.value),
                    `${identifier(f.column)}=$${params.length}`),
            )
            .join(" and ");
          if (operation === "update") {
            const setters = Object.keys(values).map((k) => {
              params.push(values[k]);
              return `${identifier(k)}=$${params.length}`;
            });
            sql = `update public.${table} set ${setters.join(",")}${where ? " where " + where : ""} returning ${fields}`;
          } else
            sql = `select ${fields} from public.${table}${where ? " where " + where : ""}${sorts.length ? " order by " + sorts.join(",") : ""}${limit !== undefined ? " limit " + limit : ""}`;
          const r = await db.query(sql, params);
          return { data: r.rows, error: null };
        } catch (error) {
          return { data: null, error };
        }
      }
      const builder = {
        select(s: string) {
          fields = s.split(",").map(identifier).join(",");
          return builder;
        },
        eq(column: string, value: unknown) {
          filters.push({ column, value });
          return builder;
        },
        is(column: string, value: null) {
          filters.push({ column, value, isNull: true });
          return builder;
        },
        not(column: string, _operator: string, _value: null) {
          if (_operator !== "is" || _value !== null)
            throw new Error("Unsupported fixture filter");
          filters.push({ column, value: null, notNull: true });
          return builder;
        },
        order(column: string, o?: { ascending?: boolean }) {
          sorts.push(
            `${identifier(column)} ${o?.ascending === false ? "desc" : "asc"}`,
          );
          return builder;
        },
        limit(n: number) {
          limit = n;
          return builder;
        },
        update(v: Record<string, unknown>) {
          operation = "update";
          values = v;
          return builder;
        },
        upsert(v: Record<string, unknown>[]) {
          operation = "upsert";
          values = v as unknown as Record<string, unknown>;
          return builder;
        },
        async maybeSingle() {
          const r = await run();
          return { ...r, data: r.data?.[0] || null };
        },
        then<TResult1 = unknown, TResult2 = never>(
          resolve?:
            | ((
                v: Awaited<ReturnType<typeof run>>,
              ) => TResult1 | PromiseLike<TResult1>)
            | null,
          reject?: ((r: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ) {
          return run().then(resolve, reject);
        },
      };
      return builder;
    },
  };
}
