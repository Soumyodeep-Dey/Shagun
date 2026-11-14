import { test, expect } from "@playwright/test";
test.beforeEach(() => {
  test.skip(
    process.env.E2E_LOCAL_FIXTURE !== "1",
    "NOT RUN outside the explicit local public-rendering fixture.",
  );
});
test("public HTML, RSC and API exclude private fixture fields and funding/guest canaries", async ({
  page,
  request,
}) => {
  const path = "/w/fixture-couple";
  const html = await request.get(path),
    rsc = await request.get(path, { headers: { RSC: "1" } }),
    api = await request.get("/api/public/wedding/fixture-couple");
  expect(html.status()).toBe(200);
  expect(rsc.status()).toBe(200);
  expect(rsc.headers()["content-type"]).toContain("text/x-component");
  expect(api.status()).toBe(200);
  for (const response of [html, rsc, api])
    for (const secret of [
      "987654321",
      "123456789",
      "PRIVATE_GUEST_CANARY",
      "PRIVATE_BLESSING_CANARY",
      "PRIVATE_OWNER_CANARY",
      "target_amount_paise",
      "amount_paise",
      "guest_name",
      "blessing_message",
      "user_id",
      "receipt_token",
    ])
      expect(await response.text()).not.toContain(secret);
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "<img src=x",
  );
  expect(await page.evaluate(() => "__xss" in window)).toBe(false);
  expect(await page.locator('img[src="x"]').count()).toBe(0);
});
test("draft page/API are unavailable while a published zero-goal page still offers general Shagun", async ({
  page,
  request,
}) => {
  const draft = await request.get("/w/fixture-draft");
  // Next's documented streamed not-found response may retain HTTP 200. Assert
  // the unavailable UI and absence of wedding data, plus the API's strict 404.
  expect([200, 404]).toContain(draft.status());
  const draftHtml = await draft.text();
  expect(draftHtml).toContain("This invitation");
  expect(draftHtml).not.toContain("Safe Partner");
  expect(
    (await request.get("/api/public/wedding/fixture-draft")).status(),
  ).toBe(404);
  await page.goto("/w/fixture-empty");
  await expect(
    page.getByRole("heading", { name: "For your new beginning", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Give Shagun" })).toHaveCount(1);
  const invalidGoal = await request.get(
    "/w/fixture-couple/give?goal=10000000-0000-4000-8000-999999999999",
  );
  expect(await invalidGoal.text()).toContain("This invitation");
});
test("malicious guest name and blessing render safely on the actual review screen", async ({
  page,
}) => {
  await page.goto("/w/fixture-couple/give");
  if (test.info().project.name === "mobile") {
    await test.info().attach("mobile-before-interaction", {
      body: JSON.stringify(
        await page.evaluate(() => ({
          width: innerWidth,
          scroll: document.documentElement.scrollWidth,
          visualWidth: visualViewport?.width,
          rects: Array.from(
            document.querySelectorAll("fieldset, form, button, .card"),
          ).map((el) => ({
            text: el.textContent?.slice(0, 40),
            rect: el.getBoundingClientRect().toJSON(),
          })),
        })),
      ),
      contentType: "application/json",
    });
    await page.screenshot({
      path: "artifacts/mobile-give-before.png",
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const payload =
    '<img src=x onerror="window.__xss=1"><script>window.__xss=1</script>';
  await page.getByLabel("Your name").fill(payload.slice(0, 100));
  await page.getByLabel("Your blessing (optional)").fill(payload);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A gift from the heart" }),
  ).toBeVisible();
  await expect(page.locator("dd").last()).toHaveText(payload);
  expect(await page.evaluate(() => "__xss" in window)).toBe(false);
  expect(await page.locator('img[src="x"]').count()).toBe(0);
});
test("all amount presets and envelope options reach accurate review without guest login", async ({
  page,
}) => {
  await page.goto("/w/fixture-couple/give");
  for (const [index, preset] of [
    "₹501",
    "₹1,001",
    "₹2,001",
    "₹5,001",
  ].entries()) {
    await page.getByRole("button", { name: preset, exact: true }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page
      .getByText(
        ["Traditional Red", "Floral", "Minimal Gold", "Traditional Red"][index],
        { exact: true },
      )
      .click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByLabel("Your name").fill("Review Guest");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.locator("dd").filter({ hasText: preset })).toHaveCount(1);
    await expect(
      page
        .getByText("Demo payment — no money transferred.", { exact: true })
        .first(),
    ).toBeVisible();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.getByRole("button", { name: "Back", exact: true }).click();
  }
});
test("cancelled mock checkout preserves the complete guest draft for a safe UI retry", async ({
  page,
}) => {
  const submissions: Record<string, unknown>[] = [];
  await page.route("**/api/create-order", (route) => {
    submissions.push(route.request().postDataJSON());
    return route.fulfill({
      json: {
        contribution_id: "fixture-gift",
        attempt_id: `10000000-0000-4000-8000-00000000000${submissions.length}`,
        mode: "mock",
        status: "pending",
        amount_paise: 100100,
      },
    });
  });
  await page.route("**/api/mock-payment", (route) =>
    route.fulfill({ json: { status: route.request().postDataJSON().outcome } }),
  );
  await page.route("**/api/receipt", (route) =>
    route.fulfill({
      json: { status: "succeeded", mode: "mock", amount_paise: 100100 },
    }),
  );
  await page.goto("/w/fixture-couple/give");
  await page
    .getByRole("button", { name: "Continue", exact: true })
    .press("Enter");
  await page.getByText("Minimal Gold", { exact: true }).click();
  await page
    .getByRole("button", { name: "Continue", exact: true })
    .press("Enter");
  await page.getByLabel("Your name").fill("Retry Guest");
  await page.getByLabel("Your blessing (optional)").fill("Keep my blessing");
  await page
    .getByRole("button", { name: "Continue", exact: true })
    .press("Enter");
  await page.getByRole("button", { name: "Open checkout" }).click();
  await page.getByRole("button", { name: "Cancel demo payment" }).click();
  await expect(page.locator('p[role="alert"]')).toContainText("saved");
  await expect(
    page.getByRole("heading", { name: "A gift from the heart" }),
  ).toBeVisible();
  await expect(
    page.locator("dd").filter({ hasText: "Keep my blessing" }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Open checkout" }).click();
  expect(submissions).toHaveLength(2);
  for (const p of submissions)
    expect(p).toMatchObject({
      guest_name: "Retry Guest",
      blessing_message: "Keep my blessing",
      amount_paise: 100100,
      envelope_design: "gold",
    });
  expect(submissions[0].request_key).toBe(submissions[1].request_key);
  expect(submissions[0].attempt_key).not.toBe(submissions[1].attempt_key);
  await page.getByRole("button", { name: "Simulate success" }).click();
  await expect(
    page.getByRole("heading", { name: "Your demo blessing is delivered." }),
  ).toBeVisible();
});
test("public and guest screens stay usable at 360px, tablet and desktop widths with long malicious names", async ({
  browser,
  baseURL,
}) => {
  for (const width of [360, 768, 1440]) {
    const context = await browser.newContext({
      baseURL,
      viewport: { width, height: 900 },
      isMobile: width === 360,
      hasTouch: width === 360,
    });
    const page = await context.newPage();
    try {
      for (const path of ["/", "/w/fixture-couple", "/w/fixture-couple/give"]) {
        await page.goto(path);
        await page.evaluate(() => document.fonts.ready);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      }
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page.getByLabel("Your name").fill("Keyboard Guest");
      await page.getByLabel("Your blessing (optional)").fill("x".repeat(1000));
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    } finally {
      await context.close();
    }
  }
});
