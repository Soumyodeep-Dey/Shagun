import { test, expect, type BrowserContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { ownerSession } from "../helpers/connected-auth";
test("two-owner mock release gate with real Supabase Auth and anonymous guest", async ({
  browser,
  baseURL,
}, testInfo) => {
  test.setTimeout(180000);
  const keys = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "E2E_OWNER_A_EMAIL",
    "E2E_OWNER_A_PASSWORD",
    "E2E_OWNER_B_EMAIL",
    "E2E_OWNER_B_PASSWORD",
  ];
  const missing = keys.filter((k) => !process.env[k]);
  test.skip(
    process.env.E2E_CONNECTED !== "1" ||
      process.env.E2E_ISOLATED_PROJECT !== "1" ||
      process.env.PAYMENT_MODE !== "mock" ||
      missing.length > 0,
    `BLOCKED: isolated Supabase test project, PAYMENT_MODE=mock, E2E_CONNECTED=1, E2E_ISOLATED_PROJECT=1 and local variables required; missing: ${missing.join(", ")}`,
  );
  test.skip(
    testInfo.project.name !== "desktop",
    "Connected gate runs once with dedicated accounts; mobile connected coverage is separate.",
  );
  const origin = baseURL!,
    contexts: BrowserContext[] = [],
    created: { id: string; user_id: string }[] = [];
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const run = crypto.randomUUID().slice(0, 8),
    slug = `e2e-a-${run}`,
    slugB = `e2e-b-${run}`,
    guestName = `PRIVATE_GUEST_${run}`,
    blessing = `PRIVATE_BLESSING_${run}`;
  const a = await ownerSession(
    browser,
    origin,
    process.env.E2E_OWNER_A_EMAIL!,
    process.env.E2E_OWNER_A_PASSWORD!,
  );
  contexts.push(a.context);
  const b = await ownerSession(
    browser,
    origin,
    process.env.E2E_OWNER_B_EMAIL!,
    process.env.E2E_OWNER_B_PASSWORD!,
  );
  contexts.push(b.context);
  expect(a.user.id).not.toBe(b.user.id);
  const existing = await admin
    .from("couples")
    .select("id")
    .in("user_id", [a.user.id, b.user.id]);
  if (existing.error) throw existing.error;
  if (existing.data?.length) {
    await Promise.all(contexts.map((c) => c.close()));
    test.skip(
      true,
      "BLOCKED: dedicated owner accounts must have no pre-existing wedding. Use fresh isolated accounts; no existing profiles are overwritten.",
    );
  }
  try {
    const page = await a.context.newPage();
    await page.goto("/create");
    await page.getByLabel("First partner’s name").fill("Acceptance A");
    await page.getByLabel("Second partner’s name").fill("Acceptance Partner");
    await page.getByLabel("Wedding date", { exact: true }).fill("2027-01-20");
    await page.getByLabel("Your unique link").fill(slug);
    await page.getByRole("button", { name: "+ Add a dream" }).click();
    await page
      .getByLabel("Title", { exact: true })
      .fill("Private target dream");
    await page.getByLabel("Private target (₹)").fill("987654");
    await page.getByLabel("A little note").fill("A public dream note.");
    await page.getByRole("button", { name: "Publish wedding page" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    const profile = await a.db
      .from("couples")
      .select("id,user_id,goals(id)")
      .single();
    if (profile.error) throw profile.error;
    created.push({ id: profile.data.id, user_id: a.user.id });
    const goalId = profile.data.goals[0].id;
    await expect(page.getByLabel("Your public wedding link")).toHaveValue(
      `${origin}/w/${slug}`,
    );
    const responseB = await b.context.request.post(`${origin}/api/wedding`, {
      headers: { origin },
      data: {
        partner1_name: "Owner B",
        partner2_name: "Partner B",
        wedding_date: "2027-01-20",
        slug: slugB,
        photo_url: "",
        message: "B only",
        goals: [],
        publish: true,
      },
    });
    expect(responseB.status()).toBe(200);
    const bp = await b.db.from("couples").select("id,user_id").single();
    if (bp.error) throw bp.error;
    created.push(bp.data);
    const guest = await browser.newContext();
    contexts.push(guest);
    const g = await guest.newPage();
    await g.goto(`${origin}/w/${slug}`);
    await expect(
      g.getByRole("heading", { name: /Acceptance A.*Acceptance Partner/ }),
    ).toBeVisible();
    await g.getByRole("link", { name: "Give Shagun" }).first().click();
    await g.getByRole("button", { name: "₹1,001", exact: true }).click();
    await g.getByRole("button", { name: "Continue", exact: true }).click();
    await g.getByText("Floral", { exact: true }).click();
    await g.getByRole("button", { name: "Continue", exact: true }).click();
    await g.getByLabel("Your name").fill(guestName);
    await g.getByLabel("Your blessing (optional)").fill(blessing);
    await g.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(g.getByText("₹1,001", { exact: true })).toBeVisible();
    await g.getByRole("button", { name: "Open checkout" }).click();
    await g.getByRole("button", { name: "Simulate success" }).click();
    await expect(
      g.getByRole("heading", { name: "Your demo blessing is delivered." }),
    ).toBeVisible();
    await page.reload();
    let row = page.getByRole("row").filter({ hasText: guestName });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("₹1,001");
    await expect(row).toContainText("Demo");
    await expect(row).toContainText("Confirmed");
    const gifts = await a.db
      .from("contributions")
      .select("id,amount_paise,payment_status,payment_mode,goal_id")
      .eq("couple_id", profile.data.id);
    if (gifts.error) throw gifts.error;
    expect(gifts.data).toHaveLength(1);
    expect(gifts.data[0]).toMatchObject({
      amount_paise: 100100,
      payment_status: "succeeded",
      payment_mode: "mock",
      goal_id: goalId,
    });
    const giftId = gifts.data[0].id;
    await row.getByText("Thank-you message", { exact: true }).click();
    await row.getByRole("button", { name: "Mark as thanked" }).click();
    await expect(row).toContainText("Thanked ✓");
    await page.reload();
    row = page.getByRole("row").filter({ hasText: guestName });
    await expect(row).toContainText("Thanked ✓");
    const anew = await ownerSession(
      browser,
      origin,
      process.env.E2E_OWNER_A_EMAIL!,
      process.env.E2E_OWNER_A_PASSWORD!,
    );
    contexts.push(anew.context);
    const freshPage = await anew.context.newPage();
    await freshPage.goto("/dashboard");
    await expect(
      freshPage.getByRole("row").filter({ hasText: guestName }),
    ).toHaveCount(1);
    await expect(
      freshPage.getByRole("row").filter({ hasText: guestName }),
    ).toContainText("Thanked ✓");
    for (const [table, column, id] of [
      ["contributions", "id", giftId],
      ["payment_attempts", "contribution_id", giftId],
      ["couples", "id", profile.data.id],
      ["goals", "id", goalId],
    ] as const) {
      const read = await b.db.from(table).select("*").eq(column, id);
      expect(read.error).toBeNull();
      expect(read.data).toEqual([]);
    }
    const edit = await b.db
      .from("contributions")
      .update({ amount_paise: 1, payment_status: "succeeded" })
      .eq("id", giftId);
    expect(edit.error).not.toBeNull();
    const changeGoal = await b.db
      .from("goals")
      .update({ title: "Stolen" })
      .eq("id", goalId);
    expect(changeGoal.error).not.toBeNull();
    expect(
      (
        await b.context.request.post(`${origin}/api/thanked`, {
          headers: { origin },
          data: { id: giftId },
        })
      ).status(),
    ).toBe(404);
    const badEdit = await b.context.request.post(`${origin}/api/wedding`, {
      headers: { origin },
      data: {
        partner1_name: "Changed B",
        partner2_name: "B",
        wedding_date: "2027-01-20",
        slug: slugB,
        photo_url: "",
        message: "",
        publish: true,
        goals: [
          {
            id: goalId,
            title: "Stolen",
            target_amount_paise: 1,
            icon: "heart",
            note: "",
          },
        ],
      },
    });
    expect(badEdit.ok()).toBe(false);
    expect(
      (await a.db.from("goals").select("title").eq("id", goalId).single()).data
        ?.title,
    ).toBe("Private target dream");
    const html = await guest.request.get(`${origin}/w/${slug}`),
      rsc = await guest.request.get(`${origin}/w/${slug}`, {
        headers: { RSC: "1" },
      }),
      api = await guest.request.get(`${origin}/api/public/wedding/${slug}`);
    expect(html.status()).toBe(200);
    expect(rsc.headers()["content-type"]).toContain("text/x-component");
    expect(api.status()).toBe(200);
    for (const response of [html, rsc, api]) {
      const body = await response.text();
      for (const privateValue of [
        guestName,
        blessing,
        "987654",
        "100100",
        "target_amount_paise",
        "amount_paise",
        "blessing_message",
        "payment_status",
        "receipt_token",
        "thank ed_at".replace(" ", ""),
      ])
        expect(body).not.toContain(privateValue);
    }
    const unauth = await guest.request.get(`${origin}/dashboard`, {
      maxRedirects: 0,
    });
    expect([303, 307, 308]).toContain(unauth.status());
    expect(unauth.headers().location).toContain("/login");
    await testInfo.attach("release-gate-evidence", {
      body: JSON.stringify({
        scope: "real Supabase Auth/database; explicit mock payment",
        ownerA: profile.data.id,
        ownerB: bp.data.id,
        contribution: giftId,
        amount_paise: 100100,
        mode: "mock",
        successfulGiftRows: 1,
        thanked: true,
        publicHtmlRscApiChecked: true,
      }),
      contentType: "application/json",
    });
  } finally {
    for (const c of created) {
      const check = await admin
        .from("couples")
        .select("slug,user_id")
        .eq("id", c.id)
        .single();
      if (
        check.error ||
        check.data.user_id !== c.user_id ||
        ![slug, slugB].includes(check.data.slug)
      )
        throw new Error(
          "Cleanup ownership check failed; no deletion attempted.",
        );
      const gifts = await admin
        .from("contributions")
        .select("id")
        .eq("couple_id", c.id);
      if (gifts.error) throw gifts.error;
      for (const gift of gifts.data) {
        const attempts = await admin
          .from("payment_attempts")
          .select("id")
          .eq("contribution_id", gift.id);
        if (attempts.error) throw attempts.error;
        for (const a of attempts.data) {
          const r = await admin
            .from("payment_discrepancies")
            .delete()
            .eq("attempt_id", a.id);
          if (r.error) throw r.error;
        }
        for (const table of [
          "duplicate_capture_incidents",
          "payment_captures",
          "payment_attempts",
        ]) {
          const r = await admin
            .from(table)
            .delete()
            .eq("contribution_id", gift.id);
          if (r.error) throw r.error;
        }
        const r = await admin.from("contributions").delete().eq("id", gift.id);
        if (r.error) throw r.error;
      }
      for (const table of ["goals", "couples"]) {
        const r = await admin
          .from(table)
          .delete()
          .eq(table === "couples" ? "id" : "couple_id", c.id);
        if (r.error) throw r.error;
      }
    }
    await Promise.all(contexts.map((c) => c.close()));
  }
});
