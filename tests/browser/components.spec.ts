import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { PNG } from "pngjs";
import jsQR from "jsqr";
test.beforeEach(async ({ page }) => {
  page.on("pageerror", (error) =>
    console.log("Component fixture runtime:", error.message),
  );
  page.on("console", (message) => {
    if (message.type() === "error")
      console.log("Component fixture console:", message.text());
  });
  page.on("requestfailed", (request) =>
    console.log(
      "Component fixture request failed:",
      request.url(),
      request.failure()?.errorText,
    ),
  );
  test.skip(
    process.env.E2E_LOCAL_FIXTURE !== "1",
    "Local component fixture only; this is not connected Auth acceptance.",
  );
  if (test.info().project.name === "mobile")
    await page.setViewportSize({ width: 360, height: 900 });
  const styles = JSON.parse(process.env.E2E_COMPONENT_CSS || "[]") as string[];
  const bundle = await page.request.get(process.env.E2E_COMPONENT_URL!);
  expect(bundle.ok()).toBe(true);
  await page.route("**/__fixture-components.js", async (r) =>
    r.fulfill({ contentType: "text/javascript", body: await bundle.body() }),
  );
  await page.route("**/__component-fixture**", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1">${styles.map((src) => `<link rel="stylesheet" href="${src}">`).join("")}</head><body><main class="shell page max-w-4xl"><div id="fixture"></div></main><script type="module" src="/__fixture-components.js"></script></body></html>`,
    }),
  );
});
test("onboarding shows field errors, keyboard labels and a three-goal UI cap", async ({
  page,
}) => {
  await page.goto("/__component-fixture?widget=editor");
  await page.getByRole("button", { name: "Publish wedding page" }).click();
  await expect(page.getByLabel("First partner’s name")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(
    page.getByLabel("Wedding date", { exact: true }),
  ).toHaveAttribute("aria-invalid", "true");
  await page.getByLabel("First partner’s name").focus();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Second partner’s name")).toBeFocused();
  for (let i = 0; i < 3; i++)
    await page.getByRole("button", { name: "+ Add a dream" }).click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveCount(3);
  await expect(page.getByRole("button", { name: "+ Add a dream" })).toHaveCount(
    0,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("share copy and downloaded QR contain the exact published public URL", async ({
  page,
  request,
  baseURL,
}, testInfo) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/__component-fixture?widget=tools");
  const url = `${baseURL}/w/fixture-couple`;
  await expect(page.getByLabel("Your public wedding link")).toHaveValue(url);
  await page.getByRole("button", { name: "Copy public link" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download QR" }).click();
  const download = await event;
  const path = testInfo.outputPath("wedding-qr.png");
  await download.saveAs(path);
  const png = PNG.sync.read(readFileSync(path));
  const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  expect(decoded?.data).toBe(url);
  expect((await request.get(decoded!.data)).status()).toBe(200);
});
test("WhatsApp opens only a reviewable encoded sharing URL with no automated send", async ({
  page,
  baseURL,
}) => {
  await page.goto("/__component-fixture?widget=tools");
  const href = await page
    .getByRole("link", { name: "Share on WhatsApp" })
    .getAttribute("href");
  expect(new URL(href!).searchParams.get("text")).toBe(
    `We are getting married! Instead of gifts, bless us with Shagun towards our dreams 💛 ${baseURL}/w/fixture-couple`,
  );
  await page
    .context()
    .route("https://wa.me/**", (r) =>
      r.fulfill({
        contentType: "text/html",
        body: "<p>External navigation intercepted: no message sent.</p>",
      }),
    );
  const event = page.waitForEvent("popup");
  await page.getByRole("link", { name: "Share on WhatsApp" }).click();
  const popup = await event;
  await expect(popup).toHaveURL(href!);
  await popup.close();
});
test("thank-you template has correct details, copies via keyboard and sends nothing automatically", async ({
  page,
}) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const posts: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST") posts.push(r.url());
  });
  await page.goto("/__component-fixture?widget=tools");
  await page.locator("summary").focus();
  await page.keyboard.press("Enter");
  const expected =
    "Dear Meera, thank you for your thoughtful Shagun and blessings towards First Home. Your love means so much as we begin this chapter together. With love, Aisha & Rahul";
  await expect(page.getByText(expected, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Copy text" }).focus();
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    expected,
  );
  expect(posts).toEqual([]);
  await page.route("**/api/thanked", (r) =>
    r.fulfill({ json: { thanked: true } }),
  );
  await page.getByRole("button", { name: "Mark as thanked" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("summary")).toHaveText("Thanked ✓");
  expect(posts).toHaveLength(1);
  expect(posts[0]).toContain("/api/thanked");
});
