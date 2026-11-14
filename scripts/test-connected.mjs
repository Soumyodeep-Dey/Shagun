import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { spawn } from "node:child_process";
// Local files only: never prompt for privileged credentials in chat.
const local = {};
for (const path of [".env.local", ".env.e2e.local"])
  if (existsSync(path))
    Object.assign(local, parseEnv(readFileSync(path, "utf8")));
const env = { ...local, ...process.env };
const required = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "RATE_LIMIT_SECRET",
  "E2E_OWNER_A_EMAIL",
  "E2E_OWNER_A_PASSWORD",
  "E2E_OWNER_B_EMAIL",
  "E2E_OWNER_B_PASSWORD",
];
const missing = required.filter((k) => !env[k]);
const conditions = [];
for (const [key, value] of [
  ["PAYMENT_MODE", "mock"],
  ["E2E_CONNECTED", "1"],
  ["E2E_ISOLATED_PROJECT", "1"],
])
  if (env[key] !== value) conditions.push(`${key}=${value}`);
if (missing.length || conditions.length) {
  const evidence = {
    status: "BLOCKED",
    testsExecuted: 0,
    missingVariables: missing,
    requiredSettings: conditions,
    prerequisites: [
      "All three migrations applied to an isolated Supabase test project",
      "Two confirmed Email/password Auth users without wedding profiles",
      "Application configured against that same project; E2E_BASE_URL optional",
    ],
    providerScope: "explicit mock mode; Razorpay and physical devices excluded",
  };
  mkdirSync("artifacts", { recursive: true });
  writeFileSync(
    "artifacts/connected-blockers.json",
    JSON.stringify(evidence, null, 2) + "\n",
  );
  console.log(JSON.stringify(evidence, null, 2));
  process.exitCode = 2;
} else {
  const exit = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "node_modules/@playwright/test/cli.js",
        "test",
        "tests/browser/connected.spec.ts",
        "--project=desktop",
        "--workers=1",
      ],
      { stdio: "inherit", env },
    );
    child.once("error", reject);
    child.once("exit", resolve);
  });
  process.exitCode = exit ?? 1;
}
