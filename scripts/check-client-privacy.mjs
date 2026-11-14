import { readdir, readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const secrets = [
  "SHAGUN_SERVICE_ROLE_BUNDLE_CANARY",
  "SHAGUN_RAZORPAY_SECRET_BUNDLE_CANARY",
  "SHAGUN_WEBHOOK_SECRET_BUNDLE_CANARY",
];
let checked = 0;
async function walk(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${item.name}`;
    if (item.isDirectory()) await walk(path);
    else if (/\.(js|map|html|json)$/.test(item.name)) {
      const text = await readFile(path, "utf8");
      for (const secret of secrets)
        assert(
          !text.includes(secret),
          `Privileged canary found in a client artifact: ${path}`,
        );
      checked++;
    }
  }
}
await walk(".next/static");
assert(checked > 0);
console.log(
  `PASS: scanned ${checked} client artifacts; none contained the three server-secret canaries. Build with the documented canary environment for meaningful evidence.`,
);
