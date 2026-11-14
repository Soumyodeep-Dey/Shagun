# Acceptance status — current evidence

Updated 15 November 2026. Baseline audit: `d8c3408`. Tested implementation: `bbd8103bf89458b3eae7af351a7726eae212bbcc`. Later reporting changes are documentation-only. The baseline findings were compared with the actual unchanged code before applying fixes.

**The two-account mock release gate has not passed: it is BLOCKED by missing Supabase test configuration.**

| Status                                                 | Acceptance IDs |
| ------------------------------------------------------ | -------------: |
| PASS — only within each stated executed scope          |             64 |
| FAIL — executed failure or current code-review finding |              0 |
| NOT RUN — missing scenario coverage                    |              1 |
| BLOCKED — specific external prerequisite absent        |             19 |
| Total supplied acceptance IDs                          |             84 |

These are case-evidence statuses, not connected-release approval. They are **not** the automated execution counts (91 local regressions, 5 independent-connection PostgreSQL tests, 36 browser checks). A fixture PASS never means real Supabase/Razorpay/device acceptance.

Definitions: PASS requires executed evidence and its scope; FAIL requires an executed failure or labelled code-review finding; NOT RUN means no scenario was executed; BLOCKED names an absent external prerequisite. Previously discovered failures were fixed and rerun; they are not counted as ongoing failures.

Evidence: [commands/results](ACCEPTANCE-RUN.md), [connected prerequisites](ACCEPTANCE.md), [SQL/HTTP tests](../tests/http-acceptance.test.ts), [seed/ledger tests](../tests/integrity.test.ts), [independent PostgreSQL connections](../tests/concurrency.pg.test.ts), [production browser checks](../tests/browser/local-security.spec.ts), [component browser checks](../tests/browser/components.spec.ts).

## Authentication

| ID      | Status  | Executed evidence / exact remaining scope                                                                                            |
| ------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| AUTH-01 | BLOCKED | Real signed-out/session-cookie private-route acceptance needs configured Supabase Auth. Connected suite prepared; preflight blocked. |
| AUTH-02 | BLOCKED | Google OAuth provider and a real sign-in are absent. Login-button rendering passes; it is not OAuth acceptance.                      |
| AUTH-03 | BLOCKED | Real email OTP delivery/session verification needs Supabase Email configuration and SMTP/template setup.                             |
| AUTH-04 | BLOCKED | Incorrect, expired and reused OTP checks need the real configured Auth service and delivered codes.                                  |
| AUTH-05 | BLOCKED | Logout/revisit acceptance needs a valid real Auth session. No synthetic browser Auth bypass was introduced.                          |
| AUTH-06 | PASS    | Logic suite rejects external, protocol-relative and backslash redirect destinations.                                                 |

## Onboarding

| ID     | Status  | Executed evidence / exact remaining scope                                                                                                                                                                                       |
| ------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ONB-01 | BLOCKED | RHF onboarding component and SQL persistence regressions pass. Real owner sign-in, form save and refresh need the connected project.                                                                                            |
| ONB-02 | PASS    | HTTP suite rejects empty names, invalid date and invalid slug without writes. Browser component fixture verifies labelled field errors and aria-invalid.                                                                        |
| ONB-03 | PASS    | Independent PostgreSQL connections demonstrate a real lock wait for a simultaneous slug race: one commits, one receives 23505. HTTP handler returns 409 and preserves profiles. Auth transport is a fixture.                    |
| ONB-04 | PASS    | Production Next page with mock Supabase transport renders a published zero-goal wedding with one general Shagun CTA. HTTP/SQL fixtures persist null-goal gifts.                                                                 |
| ONB-05 | PASS    | Actual editor component stops at three goals; fourth-goal payloads are rejected independently by HTTP validation and transactional SQL.                                                                                         |
| ONB-06 | PASS    | Production Next draft page renders unavailable UI with no wedding names; public API returns 404. Transport fixture enforces the actual published-at filter. Streamed not-found pages may retain HTTP 200 as documented by Next. |
| ONB-07 | BLOCKED | Actual owner publish → incognito navigation is part of the blocked connected release gate; local public rendering is separately tested.                                                                                         |

## Privacy and ownership

| ID     | Status  | Executed evidence / exact remaining scope                                                                                                                                                      |
| ------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEC-01 | PASS    | Production Next HTML, RSC and public API responses exclude private keys, targets and guest/funding canaries. Supabase public transport is mocked, not hosted acceptance.                       |
| SEC-02 | BLOCKED | Isolated SQL RLS tests pass, but the exact two-real-account HTTP/REST identifier-tampering case awaits connected Auth. The prepared gate exercises it.                                         |
| SEC-03 | PASS    | SQL owner B cannot edit owner A’s goal through save_wedding; attempted changes roll back and protected profile/goal snapshots remain unchanged. Scope: SQL identities, not real JWT sessions.  |
| SEC-04 | PASS    | SQL tests execute anonymous financial reads/privileged RPC calls and confirm permission denial; investigation tables and reconciliation view are also inaccessible.                            |
| SEC-05 | PASS    | Authenticated direct financial-status updates and anonymous privileged mutations are rejected by executed database privilege tests.                                                            |
| SEC-06 | PASS    | Executed verified-amount tampering is denied to the authenticated role; the stored 100100-paise gift remains unchanged. Financial table write grants are absent.                               |
| SEC-07 | PASS    | Production build used three server-secret canaries; scanner inspected 47 client artifacts and found none. This is build-boundary evidence, not inspection of a hosted session.                 |
| SEC-08 | PASS    | Actual browser rendering of malicious names and blessings on public/review screens creates no executable script/image handler. Component fixtures also render their production text templates. |
| SEC-09 | PASS    | Real HTTP handlers with SQL-backed fixture transport return only the scoped receipt, reject random tokens and reject use of one token to mutate another attempt.                               |
| SEC-10 | PASS    | HTTP flooding reaches the shared SQL limiter and returns safe 429 responses. Local/global quota scope; deployed proxy/WAF tuning is separate.                                                  |

## Guest gifting

| ID       | Status  | Executed evidence / exact remaining scope                                                                                                                                                                                                    |
| -------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GUEST-01 | BLOCKED | The complete connected guest journey requires an owner-created wedding in Supabase. Local unauthenticated page/review and HTTP payment fixtures pass, but do not replace that gate.                                                          |
| GUEST-02 | PASS    | All four presets are checked through browser review and HTTP persistence in mock order attempts; stored paise equal the selected values.                                                                                                     |
| GUEST-03 | PASS    | HTTP stores 100100 paise, browser review displays ₹1,001, and mock records retain that integer amount.                                                                                                                                       |
| GUEST-04 | PASS    | Actual HTTP handler paths reject zero, negative, fractional-paise, malformed, null and out-of-range amounts before a contribution is created.                                                                                                |
| GUEST-05 | PASS    | All three envelopes are selected in browser review; HTTP/SQL persistence verifies each design.                                                                                                                                               |
| GUEST-06 | PASS    | Empty optional blessing proceeds through real HTTP handlers and persists as empty text.                                                                                                                                                      |
| GUEST-07 | PASS    | Blank/over-length names and over-length blessings receive HTTP 400 with no invalid contribution created.                                                                                                                                     |
| GUEST-08 | PASS    | HTTP/SQL rejects a selected goal belonging to another published wedding.                                                                                                                                                                     |
| GUEST-09 | PASS    | HTTP rejects archived/nonexistent goals; production Next invalid-goal navigation renders unavailable UI. Public transport is a fixture.                                                                                                      |
| GUEST-10 | PASS    | General gifts in the SQL-backed HTTP fixture belong to the selected published wedding and have a null goal; zero-goal public UI is tested.                                                                                                   |
| GUEST-11 | PASS    | Actual guest component cancels a mocked checkout and retries with preserved name, blessing, amount and envelope; request identity is retained while attempt identity changes. Separate HTTP tests verify persisted failed/cancelled retries. |
| GUEST-12 | PASS    | Two simultaneous HTTP submissions with the same idempotency data return the same stored gift/attempt. That PGlite-backed test is not described as independent-connection PostgreSQL concurrency.                                             |

## Mock payments

| ID      | Status  | Executed evidence / exact remaining scope                                                                                                                                                 |
| ------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MOCK-01 | PASS    | Production guest/review pages visibly display “Demo payment — no money transferred.” Browser fixture mode is explicitly mock.                                                             |
| MOCK-02 | BLOCKED | SQL/HTTP mock persistence and one-count accounting pass. Display of that gift in a real authenticated owner dashboard awaits the connected gate.                                          |
| MOCK-03 | PASS    | HTTP failure/cancellation → retry → success preserves one gift and traceable attempts. Exact summary fixtures exclude pending/failed records; receipt rendering distinguishes all states. |
| MOCK-04 | PASS    | Actual mock-payment HTTP handler returns 404 in explicitly configured Razorpay test mode.                                                                                                 |
| MOCK-05 | PASS    | Browser-supplied mode fields receive HTTP 400; server mode/configuration selection is tested independently.                                                                               |
| MOCK-06 | PASS    | Missing Razorpay key/secret/webhook secret in test mode yields explicit HTTP 503 configuration errors with no contribution or fallback mock success.                                      |

## Payments and reliability

| ID     | Status  | Executed evidence / exact remaining scope                                                                                                                                                                                                                                                                                                       |
| ------ | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PAY-01 | BLOCKED | Actual Razorpay order acceptance needs local RAZORPAY_KEY_ID/SECRET and a test provider account. Mocked provider-order logic is not provider acceptance.                                                                                                                                                                                        |
| PAY-02 | BLOCKED | No real Razorpay test instrument checkout was run; test-provider credentials are absent.                                                                                                                                                                                                                                                        |
| PAY-03 | PASS    | Invalid callback HMAC is rejected by the real service logic before any transition; provider/database transport is mocked in that test.                                                                                                                                                                                                          |
| PAY-04 | PASS    | Wrong submitted/stored/provider order or payment identity is rejected without credit. Restricted discrepancy records retain the necessary observed identifiers.                                                                                                                                                                                 |
| PAY-05 | PASS    | FIXED. SQL-backed HTTP tests persist amount/currency/identity discrepancy records before rejection; retries deduplicate by payment identity, distinct payments remain distinct, and no capture/gift credit occurs. Callback, webhook and order-creation paths tested.                                                                           |
| PAY-06 | PASS    | Authorized-but-not-captured mocked provider responses cause no success transition; pending states remain excluded from successful accounting.                                                                                                                                                                                                   |
| PAY-07 | PASS    | Production browser visits /thank-you?success=true without proof and shows no successful-payment claim/confetti.                                                                                                                                                                                                                                 |
| PAY-08 | PASS    | Webhook-first followed by repeated verification HTTP callbacks produces one capture and one successful gift in the SQL-backed fixture.                                                                                                                                                                                                          |
| PAY-09 | PASS    | Executed SQL event replay and HTTP repeated webhook tests remain idempotent; one provider capture is retained.                                                                                                                                                                                                                                  |
| PAY-10 | PASS    | Two independent PostgreSQL connections concurrently apply callback/webhook proof for the same payment; one capture and zero duplicate-capture incidents result. No claim of real network delivery.                                                                                                                                              |
| PAY-11 | PASS    | Actual HTTP webhook-first then repeated callback ordering passes against real SQL with mocked provider lookup.                                                                                                                                                                                                                                  |
| PAY-12 | PASS    | SQL tests preserve terminal success after older failure and preserve a newer pending retry against an older failed attempt.                                                                                                                                                                                                                     |
| PAY-13 | PASS    | Raw webhook byte tampering/malformed signature tests reject before provider lookup or payment mutation.                                                                                                                                                                                                                                         |
| PAY-14 | PASS    | A simulated provider TimeoutError through HTTP leaves a scoped pending receipt and zero captures; retry confirms safely. Actual provider latency and the provider-connected recovery CLI remain separate unexecuted provider checks.                                                                                                            |
| PAY-15 | BLOCKED | Browser-close plus actual captured-provider webhook delivery needs real Razorpay test credentials and an approved reachable test webhook URL.                                                                                                                                                                                                   |
| PAY-16 | PASS    | HTTP injected transient RPC error leaves no processed event; retry succeeds once. Real PostgreSQL injected mid-function capture failure rolls the event/transition back and permits a safe retry.                                                                                                                                               |
| PAY-17 | PASS    | SQL/HTTP first-failed/second-successful attempts remain traceable under one contribution and count once.                                                                                                                                                                                                                                        |
| PAY-18 | PASS    | FIXED. Independent PostgreSQL connections demonstrate lock contention for distinct captures in both arrival orders. Both payment IDs/attempts remain, exactly one idempotent incident records the extra capture, and reconciliation separates intended and extra amounts. Same-order extra captures and upgrade backfill also pass. No refunds. |

## Dashboard and integrity

| ID      | Status  | Executed evidence / exact remaining scope                                                                                                                                                           |
| ------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DASH-01 | PASS    | Production SQL summary fixture: 50100 + 100100 + 200100 = 350300 paise (₹3,503).                                                                                                                    |
| DASH-02 | PASS    | Adding pending 500100 and failed 100100 leaves the successful SQL summary at 350300 paise.                                                                                                          |
| DASH-03 | PASS    | Executed summary fixture checks general Shagun and two separate goals retain their exact allocations.                                                                                               |
| DASH-04 | PASS    | Production ThankYouTool/template in a browser component fixture contains correct guest/couple/goal details, copies real clipboard text, supports keyboard controls and sends nothing automatically. |
| DASH-05 | BLOCKED | SQL thanked persistence and browser client state pass; refresh plus a new real Auth session is prepared but blocked in the connected gate.                                                          |
| DASH-06 | PASS    | SQL archiving retains contribution allocation/history and thanked state.                                                                                                                            |
| DASH-07 | BLOCKED | Clean public startup and SQL persistence are tested; real private profile/payment retrieval after restart/new Auth session needs configured Supabase.                                               |
| DASH-08 | BLOCKED | Accounting separates modes and source labels remain test-only; the private dashboard with real mock/test records requires connected Auth/data verification.                                         |

## Images, sharing and usability

| ID    | Status  | Executed evidence / exact remaining scope                                                                                                                                                                                                                              |
| ----- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UX-01 | BLOCKED | Valid Storage upload/render round trip needs the configured Supabase Storage service and a real owner session.                                                                                                                                                         |
| UX-02 | PASS    | Actual upload HTTP handler rejects oversized and MIME-disguised executable fixtures before Storage writes. Auth transport is mocked.                                                                                                                                   |
| UX-03 | BLOCKED | Cross-owner overwrite through the real Supabase Storage API requires two valid owner sessions and the configured bucket/policies.                                                                                                                                      |
| UX-04 | PASS    | Production ShareTools copies the real browser clipboard, downloads a PNG, and a QR decoder recovers the exact public URL, which loads successfully. Component/public transport fixture scope; no physical-camera claim.                                                |
| UX-05 | PASS    | Production ShareTools opens the correct encoded wa.me review URL in a new tab. External navigation is intercepted; no message is sent and no actual WhatsApp-device acceptance is claimed.                                                                             |
| UX-06 | PASS    | Fresh browser contexts test public/guest pages at 360, 768 and 1440px; onboarding/share/thank-you production components also run at 360px and desktop. Long-name grid overflow found and fixed. Auth-gated server dashboard acceptance remains in the connected scope. |
| UX-07 | PASS    | Production onboarding, thank-you and guest controls are exercised through labels, focus, Tab/Enter and normal clicks. Local browser/component fixtures; no claim of exhaustive assistive-technology certification.                                                     |
| UX-08 | PASS    | Reduced-motion browser checks confirm celebration animation is disabled.                                                                                                                                                                                               |
| UX-09 | PASS    | Past-date countdown regression returns the post-wedding state rather than a negative countdown.                                                                                                                                                                        |
| UX-10 | BLOCKED | Physical Android Chrome, iPhone Safari and WhatsApp browser devices/sessions are not connected. Chromium emulation is not substituted for those checks.                                                                                                                |
| UX-11 | NOT RUN | No controlled mobile/4G loading measurement has been recorded. Establish the measurement profile and approved test endpoint, then record results against the 2-second target; no unconditional guarantee.                                                              |

## Build and setup

| ID       | Status | Executed evidence / exact remaining scope                                                                                                                                                                                   |
| -------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BUILD-01 | PASS   | Actual lint/typecheck, 91 unit/HTTP/SQL regressions, 5 real PostgreSQL tests, 36 browser checks and production build pass. Skipped cases are reported separately; counts are not acceptance-case counts.                    |
| BUILD-02 | PASS   | Fresh disposable PostgreSQL 17 database and PGlite both execute all three migrations and constraints/policies. Supabase-owned Auth/Storage schema prerequisites are fixtures; actual hosted service setup is not claimed.   |
| BUILD-03 | PASS   | FIXED. Seed RPC tests first/repeated run, wrong Auth identity, conflicting demo slug, existing non-demo profile and injected goal failure. Protected rows remain unchanged and partial writes roll back.                    |
| BUILD-04 | PASS   | Executed local seed RPC verifies explicit owner identity, stable IDs, date +30 days in Asia/Kolkata and both exact private targets. No actual hosted seed run claimed.                                                      |
| BUILD-05 | PASS   | Fresh archive of bbd8103: npm ci --offline, production build, local start and GET / and /login succeed. Connected Supabase setup remains an external prerequisite; no credentials were invented.                            |
| BUILD-06 | PASS   | Executed missing-env matrix covers app origin, rate secret, server Supabase URL/key, SSR publishable key, payment mode and Razorpay test secrets. Responses disclose variable names, not secret values; no silent fallback. |

## Connected release gate

BLOCKED, zero connected tests executed. `npm run test:connected` exits with the blocked preflight result and writes `artifacts/connected-blockers.json`. Required local variables and provider/device separation are in ACCEPTANCE.md. The two skipped browser-project invocations represent one logical connected gate, not two passed scenarios.
