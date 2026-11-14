import { test, expect } from "@playwright/test";
test("seeded incognito guest can retry mock checkout and see a persisted receipt", async ({
  browser,
  baseURL,
}) => {
  test.skip(
    process.env.E2E_CONNECTED !== "1",
    "Requires migrated, seeded Supabase and explicit PAYMENT_MODE=mock.",
  );
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${baseURL}/w/aisha-rahul`);
  await expect(
    page.getByRole("heading", { name: /Aisha.*Rahul/ }),
  ).toBeVisible();
  const response = await page.request.get(
    `${baseURL}/api/public/wedding/aisha-rahul`,
  );
  const body = await response.text();
  for (const field of [
    "target_amount",
    "amount_paise",
    "guest_name",
    "blessing_message",
    "payment_status",
    "user_id",
    "receipt_token",
  ])
    expect(body).not.toContain(field);
  await page.getByRole("link", { name: "Give Shagun" }).last().click();
  await page.getByRole("button", { name: "₹1,001", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByText("Floral", { exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Your name").fill("Acceptance Guest");
  await page.getByLabel("Your blessing (optional)").fill("A lifetime of love!");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Open checkout" }).click();
  await page.getByRole("button", { name: "Simulate failure" }).click();
  await expect(page.locator('p[role="alert"]')).toContainText("details");
  await page.getByRole("button", { name: "Open checkout" }).click();
  await page.getByRole("button", { name: "Simulate success" }).click();
  await expect(
    page.getByRole("heading", { name: "Your demo blessing is delivered." }),
  ).toBeVisible();
  const receipt = page.url();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your demo blessing is delivered." }),
  ).toBeVisible();
  const second = await browser.newContext();
  const other = await second.newPage();
  await other.goto(receipt);
  await expect(
    other.getByRole("heading", { name: "Your demo blessing is delivered." }),
  ).toBeVisible();
  await context.close();
  await second.close();
});
