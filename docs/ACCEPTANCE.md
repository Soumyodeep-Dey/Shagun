# Acceptance evidence and connected checklist

Local results are not a substitute for a configured Supabase and Razorpay test project.

| Requirement                              | Local evidence                                       | Remaining connected verification                             |
| ---------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------ |
| Sign in, create, publish, copy link      | Form/auth implementation; owner SQL editor tests     | Real Google + email OTP, upload, publish and clipboard       |
| Incognito public page, no guest login    | Public allowlist test and unprotected guest routes   | Seeded public guest browser test                             |
| ₹1,001 envelope and blessing             | Input schemas, UI implementation                     | Connected guest flow (`E2E_CONNECTED=1`)                     |
| Success appears once in right dashboard  | SQL replay/retry/accounting tests                    | Observe two owner sessions and actual captured provider test |
| Persistence across reload/browser        | PostgreSQL persistence architecture                  | Connected receipt test; owner dashboard reload               |
| Cross-owner isolation                    | Actual RLS/privilege/thank-you tests in PostgreSQL   | Hosted permission smoke test + two Auth accounts             |
| Public privacy                           | Explicit SELECT allowlist test                       | Connected public API and HTML/RSC inspection                 |
| Amount/signature/order tampering         | Schema, payment service, HMAC and mismatch tests     | Provider sandbox tampering test                              |
| Duplicate callbacks/webhooks             | Unique constraints + actual transactional SQL replay | Retransmit signed test webhook through hosted endpoint       |
| Failed/cancelled/pending are not success | Accounting tests and browser state tests             | Real checkout cancellation, delayed capture and failure      |
| Thanked status persists                  | PostgreSQL mark_thanked isolation/persistence test   | Click, reload and check second owner cannot mutate           |
| Mobile/desktop                           | 16 browser checks; visual landing review             | Onboarding, gifting and dashboard on connected project       |

## Manual run after configuration

1. Apply migration to an isolated Supabase test project. Configure Google and Email OTP. Sign in as owner A, create a unique wedding with no goals, preview it, save as draft, and verify `/w/slug` returns unavailable. Publish, then copy/open its link in incognito. Add goals and repeat.
2. Upload valid JPEG/PNG/WebP photos, test an oversized file and a mismatched MIME signature. Try another user's Storage folder and confirm rejection. Check that broken/removed photos render the heart fallback.
3. With explicit mock mode, gift ₹1,001 with a Floral envelope and blessing. Simulate failure, retry without retyping, then success. Confirm exactly one gift is successful and two attempts exist. Reload the dashboard and open the saved receipt URL in another browser. Never remove the token or replace it with `success=true` and expect success.
4. Sign in as owner B in a separate browser. Confirm A's profile/goals/gifts/attempts cannot be read, edited or marked thanked. Anonymous direct table and RPC calls must fail. Run `npm run test:db` as a smoke check.
5. Test goal deletion while its payment is open: historical gifts remain allocated, but new requests to the archived goal fail. Try a goal from another wedding, a taken slug, a fractional paise amount, an out-of-range amount and a changed immutable request payload.
6. Switch to explicit Razorpay test mode with complete test credentials. Use provider-documented test instruments. Confirm captured success on the private dashboard. Test callback before webhook and webhook before callback; replay both. Alter signature/order/amount and confirm rejection. Provider downtime and authorized-only status must stay pending; later captured confirmation may move it to success. Replay an older failure and ensure success remains.
7. Copy the thank-you template, mark thanked and reload. Verify WhatsApp opens a reviewable draft, QR downloads and scans to the direct public URL. Do not send an automated message.
8. Repeat critical connected flows at phone and desktop widths, with keyboard-only navigation and reduced motion. Verify long names/blessings remain plain text and cannot break layout or execute markup.

None of these external steps is claimed completed in this session without credentials.
