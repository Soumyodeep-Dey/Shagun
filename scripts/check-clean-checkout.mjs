import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { createServer } from "node:net";
const source = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const root = process.cwd(),
  dir = resolve(".test-runtime", `clean-${source.slice(0, 8)}-${Date.now()}`);
mkdirSync(dir, { recursive: true });
execFileSync("git", [
  "archive",
  "--format=tar",
  "-o",
  join(dir, "source.tar"),
  "HEAD",
]);
execFileSync("tar", ["-xf", join(dir, "source.tar"), "-C", dir]);
async function command(args) {
  const code = await new Promise((r, j) => {
    const child = spawn(process.execPath, [process.env.npm_execpath, ...args], {
      cwd: dir,
      stdio: "inherit",
      env: process.env,
    });
    child.once("error", j);
    child.once("exit", r);
  });
  if (code !== 0)
    throw new Error(`Clean-checkout command failed: npm ${args.join(" ")}`);
}
await command(["ci", "--offline"]);
await command(["run", "build"]);
const probe = createServer();
await new Promise((r) => probe.listen(0, "127.0.0.1", r));
const port = probe.address().port;
await new Promise((r) => probe.close(r));
const app = spawn(
  process.execPath,
  [
    join(dir, "node_modules/next/dist/bin/next"),
    "start",
    "-H",
    "127.0.0.1",
    "-p",
    String(port),
  ],
  { cwd: dir, stdio: "ignore", env: process.env },
);
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (app.exitCode !== null)
      throw new Error("Clean-checkout preview exited.");
    try {
      if ((await fetch(`http://127.0.0.1:${port}`)).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  if (!ready) throw new Error("Clean-checkout preview did not start.");
  const landing = await fetch(`http://127.0.0.1:${port}`),
    login = await fetch(`http://127.0.0.1:${port}/login`);
  if (
    landing.status !== 200 ||
    !(await landing.text()).includes("Your blessings")
  )
    throw new Error("Clean landing failed.");
  if (login.status !== 200) throw new Error("Clean login screen failed.");
  const evidence = {
    source_commit: source,
    status: "PASS",
    commands: [
      "npm ci --offline",
      "npm run build",
      "next start -H 127.0.0.1; GET / and /login",
    ],
    landingStatus: landing.status,
    loginStatus: login.status,
    scope:
      "Fresh git archive and locked install; no Supabase/provider credentials and no connected-acceptance claim.",
  };
  mkdirSync(join(root, "artifacts"), { recursive: true });
  writeFileSync(
    join(root, "artifacts/clean-checkout.json"),
    JSON.stringify(evidence, null, 2) + "\n",
  );
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  app.kill();
}
