import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
await mkdir("artifacts", { recursive: true });
const browser = await chromium.launch();
const errors = [];
for (const [name, width, height] of [
  ["desktop", 1440, 1000],
  ["mobile", 390, 844],
]) {
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 1,
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /hydrat|react error|uncaught/i.test(message.text())
    )
      errors.push(message.text());
  });
  await page.goto("http://localhost:3000");
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: `artifacts/landing-${name}.png`,
    fullPage: true,
  });
  await page.close();
}
await browser.close();
if (errors.length)
  throw new Error(`Preview browser errors: ${errors.join("; ")}`);
console.log("Saved desktop and mobile previews in artifacts/.");
