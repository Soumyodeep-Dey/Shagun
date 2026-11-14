import { test, expect } from "@playwright/test";
test("landing has clear guest privacy and working create CTA", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Your blessings/ }),
  ).toBeVisible();
  await expect(
    page.getByText("No guest signup. No public gift amounts."),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Meet our demo couple" }),
  ).toHaveAttribute("href", "/w/aisha-rahul");
  await expect(
    page.getByRole("link", { name: "Create Your Wishlist" }),
  ).toHaveAttribute("href", "/create");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("login exposes Google and email OTP with labels", async ({ page }) => {
  await page.goto("/login");
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeVisible();
  await page.getByLabel("Email address").fill("couple@example.test");
  await expect(
    page.getByRole("button", { name: "Email me a sign-in code" }),
  ).toBeEnabled();
});
test("a success query string cannot forge a receipt", async ({ page }) => {
  await page.goto("/thank-you?success=true");
  await expect(page.locator('p[role="alert"]')).toContainText(
    "success URL alone is not proof",
  );
  await expect(page.locator(".confetti")).toHaveCount(0);
});
for (const status of ["pending", "failed", "cancelled", "succeeded"])
  test(`scoped receipt renders ${status} accurately`, async ({ page }) => {
    await page.route("**/api/receipt", (route) =>
      route.fulfill({ json: { status, mode: "mock", amount_paise: 100100 } }),
    );
    await page.goto(`/thank-you#${"a".repeat(64)}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      status === "succeeded"
        ? "Your demo blessing is delivered."
        : status === "pending"
          ? "Awaiting confirmation."
          : status === "failed"
            ? "Payment did not complete."
            : "Checkout was cancelled.",
    );
    await expect(page.locator(".confetti")).toHaveCount(
      status === "succeeded" ? 1 : 0,
    );
  });
test("reduced-motion preference disables celebration animation", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/receipt", (route) =>
    route.fulfill({
      json: { status: "succeeded", mode: "mock", amount_paise: 100100 },
    }),
  );
  await page.goto(`/thank-you#${"b".repeat(64)}`);
  await expect(page.locator(".confetti")).toBeVisible();
  expect(
    await page
      .locator(".confetti")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
});
