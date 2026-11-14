# Architecture

One Next.js application owns pages, Route Handlers and server-only services. Supabase provides Auth, PostgreSQL and Storage. No second backend or process-memory persistence exists.

```text
Owner browser → cookie SSR client → verified claims → RLS owner reads
                                  → save_wedding / mark_thanked RPC
Guest browser → publicWedding service → explicit public SELECT allowlist
Guest browser → order/status APIs → server role → PostgreSQL intent + attempts
Provider callback/webhook → signature + provider fetch → apply_payment RPC
```

`src/lib/supabase/browser.ts` contains only publishable config. Server cookie clients use `@supabase/ssr`; `src/proxy.ts` refreshes sessions. Private pages and routes revalidate claims independently. `src/lib/supabase/admin.ts` is marked `server-only` and must never enter a client module.

`PublicWedding` and `OwnerWedding` are distinct types. Public queries are explicit column lists; a private record is never fetched and then hidden in CSS. Public pages are dynamic and draft access is rejected. The dashboard uses the owner's cookie client with RLS, not the service-role client.

## Intent and attempt state

A contribution represents one guest gift and carries an immutable request fingerprint. A payment attempt represents a try at paying that gift. Request keys and attempt keys are UUIDs; receipt bearer tokens are random 256-bit values stored only as hashes. Retrying a network request reuses the same keys and stored amounts. Changing gift details creates a new intent, while retrying a failed mock payment creates a new attempt on the existing intent.

```text
contribution: pending ───→ succeeded (terminal)
                │
                ├───────→ failed ───→ pending on retry
                └───────→ cancelled ─→ pending on retry

attempt: pending → failed / cancelled / succeeded
         provider confirmation can supersede a failure with captured success
```

Only server configuration chooses mock versus Razorpay test mode. The browser cannot request a different mode. The database requires INR and positive integer paise; server validation adds configurable contribution limits. A composite foreign key ties each selected goal to its couple, and server/database checks require publication and an active goal at intent creation.

Provider orders are bound to stored attempts. An atomic claim prevents parallel order creation. Uncertain creation leaves a pending sentinel for deliberate reconciliation instead of silently creating a duplicate. Callback signatures use stored order IDs. Both callback and webhook verify current provider facts; authorized-only payments remain unconfirmed.

`apply_payment` locks the contribution before its attempt, inserts a unique webhook event and changes both states in one transaction. Any failed constraint rolls back event processing too. Success never downgrades. Totals sum each successful contribution once and split mock from Razorpay test funds. Archiving a goal preserves existing gifts and their allocations.

## Operational boundaries

The database-backed rate limiter survives process restarts. Outside Vercel's trusted-proxy mode it fails conservatively to shared/global quotas; it does not trust arbitrary client headers. Production abuse controls also need platform configuration. Receipt fragments avoid query-string logs, but external analytics must still avoid DOM/body capture. Photos are public assets with owner folder policies and strict image host allowlisting.

The isolated PostgreSQL test harness verifies migration logic without fabricating a Supabase login. Full Auth, Storage and provider acceptance are separate external checks documented in ACCEPTANCE.md.

## Acceptance integrity changes — implementation `bbd8103`

Migration `202611140003_acceptance_integrity.sql` adds an operator-only seed RPC, restricted investigation records and a capture ledger. `seed_demo` requires both an explicit owner UUID and `auth.users.raw_app_meta_data.shagun_demo=true`. It serializes the reserved demo slot, rejects conflicting slugs/goal identities and existing unmarked weddings before writes, then creates/restores the marked demo atomically. Owner profile editing cannot set the demo marker.

`payment_discrepancies` records only attempt/source, bounded provider identifiers, mismatch field and expected/observed values. A deterministic fingerprint includes payment/order identity so retries deduplicate without merging different mismatched payments. The service commits this restricted insert in a separate request **before** returning rejection; it never attempts to insert evidence in a transaction that then raises and rolls it back. If evidence cannot be persisted, confirmation fails closed. No raw payloads, tokens, signatures, secrets, guest names or blessings are recorded.

`payment_captures` retains every distinct verified provider capture, including multiple payment IDs on one order/attempt. The first observed capture is marked intended under the contribution lock; a partial unique index enforces one intended capture per gift. Subsequent distinct captures are retained and produce one `duplicate_capture_incidents` row per extra capture. Retries of the same payment/event create neither extra credit nor a second incident. Existing verified attempts are backfilled during upgrade.

`payment_reconciliation` separates intended amount, extra amount and extra capture count by gift/provider/currency. Dashboard totals still count the intended contribution once; **extra captured funds are explicitly accounted for in the restricted ledger**, not silently discarded or described as a second intended gift. `captured_at` records local observation time, not a claim about the provider's original capture timestamp. Operators reconcile using stored attempt/order/payment identities. No refund is issued automatically.

All investigation/capture/incident tables and the reconciliation view are RLS-enabled/restricted to server/operator access, with anonymous and authenticated grants revoked. Owners cannot mutate financial records or read investigation records. Payment transition, capture/incident insertion and event completion remain one transaction. Mismatch evidence is deliberately outside a rejected transition transaction.

Sequential PGlite coverage is explicitly separate from five tests using independent PostgreSQL connections. Connected Playwright uses real Supabase password sign-in and SSR cookie serialization for two isolated test users; fixtures never introduce a production Auth bypass. See ACCEPTANCE-RUN.md for actual executed scope and blocked checks.
