import pg from "pg";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
const url = new URL(
  process.env.TEST_PG_ADMIN_URL ||
    "postgres://shagun_test@127.0.0.1:55439/postgres",
);
if (!["localhost", "127.0.0.1"].includes(url.hostname))
  throw new Error(
    "This disposable runner accepts only a local PostgreSQL test server.",
  );
const admin = new pg.Client({ connectionString: url.toString() });
await admin.connect();
const database = `shagun_test_${randomUUID().replaceAll("-", "")}`;
try {
  await admin.query(`create database ${database}`);
  url.pathname = `/${database}`;
  const exit = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["node_modules/vitest/vitest.mjs", "run", "tests/concurrency.pg.test.ts"],
      {
        stdio: "inherit",
        env: { ...process.env, TEST_DATABASE_URL: url.toString() },
      },
    );
    child.once("error", reject);
    child.once("exit", resolve);
  });
  if (exit !== 0) process.exitCode = 1;
} finally {
  await admin.query(`drop database ${database} with (force)`);
  await admin.end();
}
