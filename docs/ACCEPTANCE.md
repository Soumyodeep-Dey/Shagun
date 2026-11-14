# Connected acceptance guide

Current tested implementation: `bbd8103`, 15 November 2026. See [ACCEPTANCE-STATUS.md](ACCEPTANCE-STATUS.md) for all 84 case statuses and [ACCEPTANCE-RUN.md](ACCEPTANCE-RUN.md) for actual commands/counts/scope. The two-account mock release gate has **not passed**; its preflight is BLOCKED. No real provider payment or physical-device acceptance is claimed.

## Status rules

- **PASS**: executed successfully, only within the evidence scope stated for the case.
- **FAIL**: an executed failure or a clearly labelled current code-review finding.
- **NOT RUN**: scenario coverage has not been executed, rather than a fabricated environmental blocker.
- **BLOCKED**: a specific external prerequisite prevents execution.

Current acceptance IDs: 64 scoped PASS, 0 FAIL, 1 NOT RUN, 19 BLOCKED. This is not the same as 91 automated local regressions, five independent PostgreSQL tests or 36 browser checks. Passing a mocked-provider regression never means a real provider transaction passed.

## Configure the two-owner mock gate locally

Do not paste privileged keys or passwords into chat. Populate ignored local `.env.local` / `.env.e2e.local` files. The connected runner reads both (E2E file overrides app-file values; explicit process environment takes precedence).

```dotenv
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_ISOLATED_TEST_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_TEST_PROJECT_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_TEST_PROJECT_SERVER_ONLY_KEY
PAYMENT_MODE=mock
RATE_LIMIT_SECRET=YOUR_RANDOM_SECRET_AT_LEAST_32_CHARACTERS
TRUSTED_PROXY=none
E2E_CONNECTED=1
E2E_ISOLATED_PROJECT=1
E2E_OWNER_A_EMAIL=FIRST_DEDICATED_TEST_ACCOUNT
E2E_OWNER_A_PASSWORD=FIRST_LOCAL_TEST_PASSWORD
E2E_OWNER_B_EMAIL=SECOND_DEDICATED_TEST_ACCOUNT
E2E_OWNER_B_PASSWORD=SECOND_LOCAL_TEST_PASSWORD
# Optional: existing test application configured against the SAME project.
# E2E_BASE_URL=http://localhost:3000
```

Required external setup:

1. Use an **isolated Supabase test project**. Apply all three migrations in filename order. The Auth and Storage services/bucket must exist, not only a raw PostgreSQL schema.
2. Enable Supabase Email/password authentication. Create/confirm two dedicated existing Auth users with different IDs and no wedding profiles. Do not reuse production users or the seeded demo owner. Keep passwords in local ignored files only.
3. Start the application with that same project and explicit mock mode, or leave `E2E_BASE_URL` unset and let Playwright start the documented dev server. The app origin must match `NEXT_PUBLIC_APP_URL` for origin checks.
4. Install Chromium with `npx playwright install chromium` if missing, then run `npm run test:connected`.

The runner uses Supabase's supported password sign-in and the SSR client's cookie serialization. It does not mint JWTs, fake production claims, create a public test-login route or introduce an Auth bypass. This supported test mechanism does **not** satisfy separate Google/email-OTP acceptance cases; those providers still require their own configured runs.

The gate runs once in the desktop project with two isolated owner contexts and an anonymous guest. It exercises:

- Owner A onboarding, private goal target, publication and public-link field.
- Owner B's separate wedding, with no pre-existing profiles overwritten.
- Anonymous guest choosing a dream, ₹1,001, Floral envelope and a blessing in explicit mock mode.
- Correct confirmation, exactly one successful mock gift in A's dashboard, reload and another valid owner session.
- Persisted thanked status across reload and a new session.
- B's direct REST reads/updates, foreign-goal mutation and thanked API mutation denied; A's data unchanged.
- Public HTML, real RSC responses and the API excluding targets, funding values and private guest/blessing canaries.

The service-role key is used server-side/by the test runner only for fixture ownership checks and narrowly scoped cleanup. Cleanup verifies the generated run slug and authenticated user ID before touching rows created by that run; it never adopts or deletes an existing wedding. Use a fresh isolated project/users after an interrupted run if cleanup cannot be verified. Successful connected evidence is attached to Playwright results only when the full gate actually executes.

Without the prerequisites, `npm run test:connected` exits **2 (BLOCKED)**, executes zero connected tests and writes `artifacts/connected-blockers.json`. Exit 2 is not a passing release gate. The generic local browser runner intentionally skips the connected gate in both project configurations; that is two skipped invocations of one logical scenario.

## Independent local checks

```text
npm run lint
npm run typecheck
npm test
npm run build
npm run test:privacy
npm run test:browser:local
npm run test:postgres
npm run test:clean
```

`test:privacy` requires the documented build canaries for meaningful secret-boundary evidence. `test:clean` tests the current committed source, not uncommitted edits. See ACCEPTANCE-RUN.md for the precise executed revision and limitations.

For independent-connection SQL tests, use a disposable local PostgreSQL 17 cluster. Example Windows setup (only if creating a fresh cluster):

```powershell
New-Item -ItemType Directory -Force .test-runtime | Out-Null
initdb -D .test-postgres --auth=trust --username=shagun_test --no-locale --encoding=UTF8
pg_ctl -D .test-postgres -l .test-runtime/postgres.log -o "-h 127.0.0.1 -p 55439" start
npm run test:postgres
pg_ctl -D .test-postgres -m fast stop
```

This trust configuration is only for an empty loopback test cluster, never a production/shared server. `TEST_PG_ADMIN_URL` may point at another **local** disposable test server. The runner creates/drops a uniquely named `shagun_test_*` database and rejects non-local targets. CI has a PostgreSQL 17 service configured. PGlite runs are not concurrency evidence; the separate PostgreSQL suite checks distinct backend PIDs and an observed lock wait.

## Demo seeding prerequisites

In addition to local `DEMO_OWNER_USER_ID`, an operator must set that Auth user's **app_metadata** to include `shagun_demo: true`. User-editable user_metadata does not qualify. Seed creates `demo_seed_id=aisha-rahul:v1` on first run and requires it for repeat writes. Conflicting slugs/goal IDs, unmarked existing weddings and wrong identities abort before modification. All writes are transactional. Legacy unmarked demo rows are deliberately not auto-adopted; investigate them through an operator in an isolated project rather than marking real weddings as demo data.

`npm run seed` was not run against hosted Supabase in this session. Its actual SQL RPC was exercised locally for first/repeated runs, protected conflicts and rollback, including exact target/date checks.

## Restricted investigation and reconciliation

Operators can inspect `payment_discrepancies`, `payment_captures`, `duplicate_capture_incidents` and `payment_reconciliation` through their privileged database tooling. Anonymous visitors and authenticated couple clients cannot access these objects. Records contain only necessary bounded identifiers, mismatch facts and financial values, never raw payloads, secrets or guest content.

```sql
select contribution_id, provider, currency, intended_amount_paise,
       extra_amount_paise, extra_capture_count
from public.payment_reconciliation
where extra_capture_count > 0;
```

Use the incident's intended/extra capture references to find both order/payment IDs and trace the associated attempts. The intended gift is counted once; extra captures remain explicitly accounted for. No refunds are automatic. Changing a receipt URL, accepting a callback alone or seeing an authorized-only payment is never payment proof.

## Keep these external tracks separate

- **Razorpay TEST provider**: needs locally configured `RAZORPAY_KEY_ID` beginning `rzp_test_`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, the test account/capture settings and an approved reachable HTTPS webhook URL. No actual provider checkout, network timeout/recovery CLI or signed provider delivery was executed here. Do not create a public deployment or tunnel without authorization.
- **Google / email OTP / Storage**: require real provider/SMTP/template/bucket configuration and real sessions. Password-based gate preparation is not evidence these providers work.
- **Real devices**: Android Chrome, physical iPhone Safari and WhatsApp's in-app browser are absent. Chromium phone emulation is labelled as emulation only.
- **Performance**: UX-11 remains NOT RUN. Establish controlled mobile/4G conditions and an approved test endpoint, then record timing against the 2-second target. No unconditional loading guarantee.
- **Live launch**: provider approval, recipient onboarding, settlements, refunds and real-device UPI remain in LIVE-LAUNCH.md. No live mode, public deployment or paid resources were enabled.
