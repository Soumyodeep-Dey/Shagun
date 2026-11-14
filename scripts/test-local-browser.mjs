import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { build } from "esbuild";
import { readdirSync } from "node:fs";
const componentBundle = await build({
  entryPoints: ["tests/fixtures/components.tsx"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "browser",
  jsx: "automatic",
  define: { "process.env": '{"NODE_ENV":"production"}' },
  plugins: [
    {
      name: "test-router",
      setup(b) {
        b.onResolve({ filter: /^next\/navigation$/ }, () => ({
          path: "navigation",
          namespace: "fixture",
        }));
        b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
          contents:
            "export function useRouter(){return {push(path){window.__fixtureNavigation=path},refresh(){}}}",
          loader: "js",
        }));
      },
    },
  ],
});
// Mock Supabase HTTP transport for PUBLIC rendering only. No Auth service,
// protected-page bypass, payment persistence, or claim of connected acceptance.
const privateFields = {
  target_amount_paise: 987654321,
  amount_paise: 123456789,
  guest_name: "PRIVATE_GUEST_CANARY",
  blessing_message: "PRIVATE_BLESSING_CANARY",
  user_id: "PRIVATE_OWNER_CANARY",
};
const malicious =
  '<img src=x onerror="window.__xss=1"><script>window.__xss=1</script>';
const couple = {
  id: "10000000-0000-4000-8000-000000000031",
  slug: "fixture-couple",
  partner1_name: malicious,
  partner2_name: "Safe Partner",
  wedding_date: "2027-01-20",
  photo_url: null,
  message: "A public welcome.",
  published_at: "2026-11-14T00:00:00Z",
  ...privateFields,
};
const goal = {
  id: "10000000-0000-4000-8000-000000000032",
  couple_id: couple.id,
  title: "Our dream",
  icon: "heart",
  note: "Only this note is public.",
  ...privateFields,
};
const fixture = createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/components.js") {
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("content-type", "text/javascript");
    res.end(componentBundle.outputFiles[0].contents);
    return;
  }
  if (!url.pathname.startsWith("/rest/v1/")) {
    res.writeHead(404);
    res.end();
    return;
  }
  const table = url.pathname.split("/").at(-1),
    fields = (url.searchParams.get("select") || "").split(",");
  const requestedSlug = url.searchParams.get("slug");
  const row =
    table === "couples"
      ? {
          ...couple,
          slug: requestedSlug?.slice(3) || "fixture-couple",
          published_at:
            requestedSlug === "eq.fixture-draft" ? null : couple.published_at,
        }
      : table === "goals"
        ? goal
        : null;
  res.setHeader("content-type", "application/json");
  if (!row) {
    res.writeHead(404);
    res.end("{}");
    return;
  }
  if (
    table === "couples" &&
    !["eq.fixture-couple", "eq.fixture-empty", "eq.fixture-draft"].includes(
      requestedSlug,
    )
  ) {
    res.end("[]");
    return;
  }
  if (
    (table === "goals" &&
      url.searchParams.get("couple_id")?.includes("000000000033")) ||
    (table === "couples" &&
      row.published_at === null &&
      url.searchParams.get("published_at") === "not.is.null")
  ) {
    res.end("[]");
    return;
  }
  if (table === "couples" && requestedSlug === "eq.fixture-empty")
    row.id = "10000000-0000-4000-8000-000000000033";
  res.end(
    JSON.stringify([
      fields.includes("*")
        ? row
        : Object.fromEntries(fields.map((field) => [field, row[field]])),
    ]),
  );
});
await new Promise((r) => fixture.listen(0, "127.0.0.1", r));
const fixtureOrigin = `http://127.0.0.1:${fixture.address().port}`,
  appOrigin = "http://localhost:3107";
const env = {
  ...process.env,
  NEXT_PUBLIC_APP_URL: appOrigin,
  NEXT_PUBLIC_SUPABASE_URL: fixtureOrigin,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fixture-publishable-key",
  SUPABASE_SERVICE_ROLE_KEY: "SHAGUN_SERVICE_ROLE_BUNDLE_CANARY",
  PAYMENT_MODE: "mock",
  RATE_LIMIT_SECRET: "fixture-rate-secret-not-for-production",
  E2E_CONNECTED: "0",
  E2E_LOCAL_FIXTURE: "1",
  E2E_BASE_URL: appOrigin,
  E2E_COMPONENT_URL: `${fixtureOrigin}/components.js`,
  E2E_COMPONENT_CSS: JSON.stringify(
    readdirSync(".next/static/css")
      .filter((f) => f.endsWith(".css"))
      .map((f) => `/_next/static/css/${f}`),
  ),
};
const app = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "-p", "3107"],
  { stdio: ["ignore", "pipe", "pipe"], env },
);
let appError = "";
app.stderr.on("data", (d) => {
  appError += d.toString();
});
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(appOrigin);
      if (res.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  if (!ready)
    throw new Error(
      `Local fixture preview did not start: ${appError.slice(-1000)}`,
    );
  console.log(
    "Browser scope: production Next routes, mocked public Supabase transport; no real Auth or provider.",
  );
  const exit = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "node_modules/@playwright/test/cli.js",
        "test",
        "--workers=2",
        ...process.argv.slice(2),
      ],
      { stdio: "inherit", env },
    );
    child.once("error", reject);
    child.once("exit", resolve);
  });
  if (exit !== 0) process.exitCode = 1;
} finally {
  app.kill();
  fixture.closeAllConnections();
  await new Promise((r) => fixture.close(r));
}
