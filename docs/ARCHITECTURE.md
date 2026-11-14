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
