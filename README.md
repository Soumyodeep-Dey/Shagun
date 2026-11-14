# Shagun

**Your blessings, their new beginning.** A private wedding wishlist and digital envelope MVP for Indian couples. Guests never sign in. All payments are explicitly mock or Razorpay **test** payments; no live payments or settlements are implemented.

Acceptance update (15 November 2026): tested code `bbd8103` fixes the three reviewed seed/payment-integrity gaps. Actual checks: 91 local regressions, five independent-connection PostgreSQL tests, 36 browser checks, lint/type checking, production build, client-secret scan and clean-source startup. The 84 supplied acceptance IDs currently have **64 scoped PASS, 0 FAIL, 1 NOT RUN and 19 BLOCKED**; these are not test-execution counts. **The two-account mock release gate remains BLOCKED.** See [current evidence](docs/ACCEPTANCE-RUN.md), [every case](docs/ACCEPTANCE-STATUS.md) and [exact connected setup](docs/ACCEPTANCE.md).

## Start locally

Requirements: Node.js 22 LTS, npm, and a Supabase project (hosted or local). A landing page, login screen and receipt error screen work without credentials; real wedding pages and payments deliberately require PostgreSQL.

```powershell
npm ci
Copy-Item .env.example .env.local
# Fill the environment values described below.
npm run dev
```

Open http://localhost:3000. `npm run build` creates a Vercel-compatible production build; `npm start` serves it. Webpack is selected explicitly because the Windows sandbox's Turbopack worker failed during verification. The production build succeeded outside that sandbox. No project has been deployed.

Dependencies are pinned and `package-lock.json` is included. ESLint 9.39.5 is the compatible version for Next's current React, import and accessibility plugins; those plugins do not yet declare ESLint 10 compatibility. A scoped minimatch 11.0.1 override fixes the advisory in the TypeScript ESLint dependency tree. CI runs lint, type checking, PostgreSQL/logic tests, build and Chromium acceptance checks.

## Environment

| Variable                                            | Configuration                                                                                                                   |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`                               | Exact application origin, e.g. `http://localhost:3000`; HTTPS on hosted environments. No trailing path.                         |
| `NEXT_PUBLIC_SUPABASE_URL`                          | Supabase project URL without trailing slash.                                                                                    |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`              | Supabase publishable key (legacy anon key also supported by Supabase clients).                                                  |
| `SUPABASE_SERVICE_ROLE_KEY`                         | Server-only Supabase service role key. Never prefix with `NEXT_PUBLIC_`.                                                        |
| `PAYMENT_MODE`                                      | Explicitly `mock` or `razorpay_test`. Missing, unknown, and live modes fail closed.                                             |
| `MIN_CONTRIBUTION_PAISE` / `MAX_CONTRIBUTION_PAISE` | Defaults ₹100 / ₹1,00,000; positive integer paise. Maximum supported ₹10,00,000.                                                |
| `RATE_LIMIT_SECRET`                                 | Random secret at least 32 characters. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. |
| `TRUSTED_PROXY`                                     | `none` locally; `vercel` only on Vercel. The Vercel runtime must also set `VERCEL=1`.                                           |
| `RAZORPAY_KEY_ID`                                   | Must start `rzp_test_` in Razorpay mode.                                                                                        |
| `RAZORPAY_KEY_SECRET`                               | Server-only test API secret.                                                                                                    |
| `RAZORPAY_WEBHOOK_SECRET`                           | Server-only secret configured on the test webhook.                                                                              |
| `DEMO_OWNER_USER_ID`                                | Existing Supabase Auth UUID explicitly designated as the demo owner. Used only by seed.                                         |

Do not commit `.env.local`. No credentials are shipped with this project. Setting mock mode does **not** bypass Supabase or Auth.

## Supabase migrations and storage

Apply all three SQL files in `supabase/migrations/` in filename order to a fresh Supabase project using the SQL editor, or with the Supabase CLI:

```text
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

For local Supabase, use `supabase init`, `supabase start`, then `supabase db reset`. Copy the local URL, publishable/anon key and service role key into `.env.local`. Docker and the Supabase CLI are external prerequisites; they were not installed or run in this implementation session.

The migration creates couples, goals, contributions, payment attempts, webhook events and shared rate-limit counters. It enables RLS and removes anonymous table access. Authenticated clients get owner-scoped reads, and only narrow owner-edit/thank-you functions. Financial writes require the server's service role. Owner edits cannot change payments. Slug uniqueness and goal/couple consistency are database constraints. Removed dreams are archived to preserve contribution history.

The migration also creates the public `wedding-photos` bucket, a 5 MB object limit, JPEG/PNG/WebP MIME restrictions and owner-folder upload/delete policies. The app verifies the MIME signature and limits uploads before Storage. Objects are named `AUTH_USER_UUID/RANDOM_UUID.ext`, with no overwrite permission. Hosted photo rendering uses Next Image optimization and a Supabase-only remote pattern; missing/failed images fall back to a heart illustration. **Photos are public assets**, including uploaded draft photos; the UI tells the owner this. Do not upload sensitive images. On Vercel, its request-body limit may reject a near-5 MB multipart request; use photos under 4 MB. Replaced photos are retained; remove unused objects through Storage after checking references.

## Google and email OTP authentication

1. In Supabase Auth URL Configuration, set the Site URL to the app origin. Allow `http://localhost:3000/auth/callback` for development and the exact HTTPS `/auth/callback` URL for each approved hosted environment. Avoid broad wildcard domains.
2. Enable Google in Supabase Auth Providers. Create a Google OAuth web client and use Supabase's displayed callback URL (`https://PROJECT.supabase.co/auth/v1/callback`) as Google's authorized redirect URI. Put the Google client ID/secret in Supabase, never in browser source.
3. Enable the Email provider and configure SMTP for reliable delivery. Change the **Magic Link** email template to display `{{ .Token }}` as a sign-in code, e.g. `Your Shagun sign-in code is {{ .Token }}`. The app requests and verifies email OTP directly; it does not rely on a clickable email link.
4. The Google flow uses PKCE code exchange at `/auth/callback`. `src/proxy.ts` refreshes cookie sessions with `getClaims()`. Every private page, mutation and RPC independently checks identity/ownership. Redirects remain same-origin.
5. Sign out through the dashboard's POST form. Enable Supabase Auth abuse controls and CAPTCHA/provider protections appropriate to your deployment. Configure and validate email rate limits before sharing publicly.

## Seed the demo

Create a dedicated demo-owner Auth user in Supabase. An operator must set that user's **app_metadata** to include `"shagun_demo": true` (user-editable user_metadata does not qualify). Copy the UUID into local `DEMO_OWNER_USER_ID`, then run:

```text
npm run seed
```

The script calls the restricted `seed_demo` RPC. It checks operator-controlled demo identity, the reserved slug and goal identities **before any writes**, locks the seed slot, and commits profile/goals together. Existing unmarked weddings are rejected even if their Auth owner is flagged. No old profile is adopted automatically. First run creates a database demo marker; repeat runs require that marker and preserve IDs. The date is 30 days after the seed run in Asia/Kolkata. Targets remain ₹3,00,000 and ₹10,00,000. Goal errors roll back profile writes. A pre-migration demo without a marker is intentionally refused: use an isolated fresh demo owner/project or have an operator investigate legacy demo records; never mark a real wedding as a demo merely to bypass this guard.

## Payments

### Mock

Set `PAYMENT_MODE=mock`. Submit the guest flow to create a persisted intent and attempt, then simulate success, failure or cancellation. Every screen labels demo payments; no payment instrument is collected and no money moves. Mock endpoints are unavailable in Razorpay mode. After a failed/cancelled mock checkout, retry creates a new attempt for the same contribution. Network retries reuse idempotency keys.

### Razorpay test

Set `PAYMENT_MODE=razorpay_test` and all three Razorpay values. In the provider dashboard, enable automatic capture for the intended test methods. Create a **test-mode** webhook pointing to `https://YOUR_HOST/api/webhooks/razorpay`, configure its secret, and subscribe to `payment.captured`, `payment.failed`, `payment.authorized` and `order.paid`. For local provider testing use a user-configured HTTPS tunnel; no tunnel or external resource is created automatically.

`POST /api/create-order` validates recipient, active goal, integer amount, server limits and immutable request data, persists the intent/attempt, then creates the provider order. A DB compare-and-set claim prevents two concurrent requests from creating competing orders. `POST /api/verify-payment` verifies HMAC using the **stored** order ID, fetches the provider payment, compares ID/order/amount/currency and requires captured status. `/api/webhooks/razorpay` verifies the raw bytes before parsing and refetches the current provider payment. Provider errors leave confirmation pending and webhooks receive a retryable error. Never treat an authorized payment or Checkout callback alone as received money.

All transitions run in a PostgreSQL transaction, with a lock on the contribution. Event identity and transition commit together. Successful contributions are terminal, repeated events are harmless, and an older failure cannot downgrade a success. Dashboard totals sum contributions, not attempts. Mock and Razorpay test totals stay separate.

If order creation has an uncertain network response, the attempt retains `creating_ATTEMPT_UUID` rather than risking a duplicate order. Locate the matching order in the Razorpay **test** dashboard by receipt (the attempt UUID). Recover through this operator-only CLI:

```text
node --env-file=.env.local scripts/reconcile-payment.mjs ATTEMPT_UUID order_TEST_ORDER_ID
```

It fetches the order, checks receipt/amount/currency, restores the association, and counts it only if a matching captured payment exists. If no order exists, investigate provider availability before making a new gift; the application deliberately does not automatically replace an uncertain order.

Standard payment acceptance **does not automatically settle funds to each couple**. Live wedding-gifting eligibility, recipient onboarding, settlement and the provider's required product arrangements need explicit provider confirmation and a separate implementation. This MVP collects neither bank details nor UPI IDs.

## Privacy and security

Public wedding responses select only ID, slug, names, wedding date, photo URL, message and active dream ID/title/icon/note. They never load targets, contributions, guest identities, blessings, funding totals or counts. Draft pages return unavailable. Shared links are unlisted invitations, not password-protected access; anyone with the link can see those public wedding fields.

Private receipt access requires a browser-generated 256-bit token; only its SHA-256 hash is stored. The token travels in the receipt URL fragment and POST request body, not a query string. A receipt exposes only its own status, mode and amount. Keep the whole receipt URL private. A query like `success=true` has no effect. Referrer policy is `no-referrer`, and receipt responses use `no-store`.

React renders names/blessings as text. No HTML insertion is used. Same-origin POST checks guard application mutations; signed provider webhooks are exempt from browser origin checks. Anonymous gift/status writes use a shared PostgreSQL limiter. On Vercel, only Vercel's trusted forwarded IP is hashed; arbitrary `X-Forwarded-For` is ignored. Outside the trusted proxy configuration, limits apply globally and are suitable for local testing, not a busy shared deployment. Add provider/edge WAF protection and tune quotas before public use. Counter keys are hashed and contain no raw guest IPs; schedule cleanup of old `rate_limits` rows based on `bucket` as part of operations.

Errors return safe messages; structured logs include only an internal event/code, not secrets, receipt tokens, names, blessings or request bodies. Next's generic server error boundary asks operators to check configuration. Disable request-body capture in any external logger you introduce.

## Checks and actual verification

```text
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e -- --workers=2
```

Historical implementation-session results (14 November 2026; superseded by [current acceptance evidence](docs/ACCEPTANCE-RUN.md)):

| Check                                                | Actual result                                      |
| ---------------------------------------------------- | -------------------------------------------------- |
| Logic, privacy, payment-service and PostgreSQL tests | 31 passing                                         |
| Browser desktop/mobile checks                        | 16 passing; 2 connected-project checks skipped     |
| Type checking                                        | Passed                                             |
| ESLint                                               | Passed without warnings                            |
| Production build                                     | Passed using Webpack outside Windows sandbox       |
| Dependency audit                                     | Zero reported vulnerabilities after scoped patch   |
| Desktop/mobile visual review                         | Screenshots captured and inspected in `artifacts/` |
| Hosted Supabase migration/Auth/Storage               | Not run: external project credentials absent       |
| Razorpay test checkout and real signed delivery      | Not run: external test credentials absent          |

The PostgreSQL tests run the actual migration and functions in PGlite, a local embedded PostgreSQL engine. They stub only Supabase-owned Auth/Storage schema prerequisites and skip the extension-install statement because `gen_random_uuid()` is built in. These tests exercise real SQL constraints, RLS, privileges, transactional RPCs, retries, event replay, archived goals, thanked status and shared counters. They do not verify Supabase's network, Auth service, Storage service, extensions or concurrent multi-connection behavior.

Browser receipt-state tests deliberately stub receipt responses; they do **not** prove provider acceptance. The connected suite now covers two supported Auth sessions, onboarding/publication, an anonymous mock gift, the owner dashboard, a new session, RLS/API ownership rejection, public HTML/RSC/API privacy and persistent thanked status:

```powershell
# Configure local .env.local and .env.e2e.local using docs/ACCEPTANCE.md.
# Use two dedicated confirmed Auth users without existing wedding profiles.
npm run test:connected
# Optional hosted/local Supabase anonymous-permission smoke test:
npm run test:db
```

`E2E_BASE_URL` can point browser tests at an existing approved test server. Never run the mock connected test against live payment infrastructure (live mode is unsupported anyway).

See [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md) for the credential-dependent end-to-end checklist, [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for trust boundaries, and [docs/PHASES.md](docs/PHASES.md) for every phase's output.

## Vercel preparation and limitations

Deploy only when explicitly authorized. Select Next.js, use Node 22, `npm ci`, `npm run build`, and configure the environment above in the intended Vercel environment. Apply migrations before serving database routes. Update Supabase allowed callback URLs and the Razorpay **test** webhook URL to the final origin. Rebuild after changing public Supabase environment values or the image allowlist. Keep private pages out of shared caches and verify RLS on the hosted project. Do not point untrusted preview branches at a production database or secrets.

This MVP has no automated messaging, AI, social feed, public gift data, native app, admin panel, live payments, recipient onboarding or settlement. There is no refund/dispute workflow, automatic reconciliation scheduler, CAPTCHA UI, or photo garbage collector. These are documented limits, not mocked production capabilities. Gift records use pages of 50 and totals aggregate all owner records in PostgreSQL, independently of REST row limits. Exports are not implemented. A shared invitation cannot stop forwarding, and a copied receipt token grants read access to that one receipt. See [docs/LIVE-LAUNCH.md](docs/LIVE-LAUNCH.md) before considering any real-money extension.

Typography uses locally bundled Inter and Playfair Display via Fontsource (SIL Open Font License). Lucide icons use their bundled open-source license. Wedding stationery artwork is original CSS, with no third-party stock photo dependency. Uploaded couple photos require the owner's permission to publish.
