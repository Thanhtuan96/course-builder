# Professor Studio — SaaS Roadmap (DEPLOY-03)

**Status:** design document. v3.0 is deliberately **local-first** with **no hosted learner
database** (see REQUIREMENTS "Out of Scope"). This document describes how the same codebase grows a
hosted, multi-tenant product **without rewriting the app**, and it is the input to a future milestone.

The key property that makes this cheap: Studio already talks to storage through **one contract**
(`StorageAdapter`) over an HTTP `POST /api/studio/db` API, and the current local server
(`web/studio-api.js` + `web/studio-db.js`) already implements that contract on `node:sqlite`. The
hosted backend replaces the local node process with a **Cloudflare Worker + D1** that implements the
**same contract**, so the only client change is the base URL + auth token.

---

## 1. Target architecture

```
Studio SPA (static, hash routes)  ──►  Cloudflare Worker  ──►  D1 (SQLite)
        │                                    │
        │  BYOK (unchanged)                  ├─ Better Auth (via void/auth)
        └──────────────► provider APIs       ├─ Managed-AI proxy (Workers AI / Anthropic, metered)
                                             ├─ Stripe webhooks + billing
                                             └─ R2 exports / KV sessions
```

- **Host:** [Void](https://void.cloud) app on the learner's/our Cloudflare account (Workers + Assets).
  The Worker serves the static SPA and the `/api/studio/*` + auth + billing routes.
- **Database:** **Cloudflare D1** (SQLite). Reuses `studio/migrations/*.sql` **unchanged** and the
  wrangler-compatible `d1_migrations` tracking table, so local `node:sqlite` and D1 stay in lockstep.
- **Auth:** **Better Auth** via `void/auth` (email + OAuth providers: github, google, …).
- **Managed AI:** a proxy route holding the provider key server-side (Workers AI or Anthropic), so a
  paid tier needs no BYOK. BYOK adapters stay as the free/offline escape hatch.
- **Billing:** Stripe checkout + subscription webhooks feeding an entitlement check in the proxy.

---

## 2. Reusing the schema & the DB contract

The migration files are already D1-ready by construction: TEXT primary keys (UUID), `owner_id` on
every table (default `'local'`), ISO-8601 TEXT `created_at`/`updated_at`/`deleted_at` tombstones, JSON
stored as TEXT, and **no PRAGMA/extension dependencies**.

**Reuse plan:**

1. The Worker implements the exact `POST /api/studio/db` ops (`get`, `put`, `putMany`, `list`,
   `softDelete`, `exportAll`, `importAll`) by running parameterized SQL against D1 — a near copy of
   `web/studio-db.js` with `DatabaseSync` → `env.DB` (D1 binding).
2. Point Void's migration runner at Studio's migrations. Void reads SQL from `db/migrations/`
   (or `<sourceDir>/db/migrations`). Either set `sourceDir`, or copy/symlink `studio/migrations/*.sql`
   into `db/migrations/` (documented in `DEPLOY.md`). The `d1_migrations` table name is already
   wrangler-compatible, so migration history is unambiguous.
3. Keep `studio/src/lib/repo/schema.js` as the single source of truth for allowed tables/indexed
   fields; the Worker validates table/column names against a generated allowlist (same rules as today).

**New tables for the hosted tier** (added as `studio/migrations/0002_*.sql`, D1-compatible):

| Table | Purpose |
|-------|---------|
| `users` | Better Auth users (or use Better Auth's own tables in a separate schema) |
| `usage_events` | one row per managed-AI call: `user_id`, `model`, `input_tokens`, `output_tokens`, `cost_micros`, `created_at` |
| `subscriptions` | `user_id`, `stripe_customer_id`, `plan`, `status`, `current_period_end` |
| `sync_cursor` | optional per-device keyset cursor for the changefeed |

> The learner-data tables (`courses`, `lessons`, …) are **shared** across tenants via `owner_id`, not
> duplicated per tenant (see tenancy below).

---

## 3. Tenancy: single DB + `owner_id` vs DB-per-tenant

**Recommendation: single D1 database + `owner_id` row scoping.** Every learner table already carries
`owner_id`; the Worker sets it from the authenticated user and adds `WHERE owner_id = ?` to every
query. This is the natural extension of the current design.

| Option | Pros | Cons | D1 limits make it… |
|--------|------|------|-------------------|
| **Single DB + `owner_id`** | Reuses the schema as-is; one migration set; cheap; simple backups per user are just `WHERE owner_id` | Noisy-neighbour at extreme scale; a per-user restore is a row filter, not a file swap; needs airtight `owner_id` enforcement | ✅ **Chosen** — D1 is a managed single-node SQLite; per-DB overhead (bindings, provisioning, migrations) is the real cost |
| **DB-per-tenant** | Strong isolation; easy per-tenant export/delete; independent size/query cost | Linear provisioning/migration cost; a D1 database per user is impractical at any scale; D1 has a **limited number of databases per account** and per-database size limits | ❌ Not viable for consumer scale; only sensible for a handful of enterprise tenants |

Notes on D1 limits (⚠️ confirm current values before relying on them):

- D1 imposes **per-database size limits** (currently on the order of a few GB class), **row-size** and
  **SQL statement** limits, and a **bounded database count per account**. `owner_id` scoping keeps the
  whole learner base in one database comfortably.
- Queries must be **indexed** for the keyset patterns used below; `owner_id` should be added to the
  relevant indexes (`owner_id, updated_at`).

**Rule:** every Worker query is constructed with `owner_id` from the session — never from the request
body. A missing/blank `owner_id` must be treated as an error, not as "all rows".

---

## 4. Auth (Better Auth via `void/auth`)

- Add `auth: { providers: ['email', 'github', 'google'] }` to `void.config.ts`.
- A **Sign in** route appears in Studio; on first sign-in, local rows are stamped with the user's
  `owner_id` and pushed (see §5).
- The sync/db API requires a valid session; the pairing-token flow stays for the **local** bridge only.
- OAuth secrets live server-side (`void secret put`); nothing sensitive ships to the client.

---

## 5. Local → cloud import & sync

The sync layer is **additive behind `repo/`** and deliberately not in v3.0 (no `_outbox`/`_sync`
stores yet). The envelope is already present on every record (`id`, `created_at`, `updated_at`,
`deleted_at`), which is exactly what the changefeed needs.

**Phase A — one-shot cloud import (first sign-in).** Reuse the existing portability path:

1. `repo.exportAll()` from IndexedDB/SQLite → the JSON dump used by **Export backup** today.
2. `POST /api/studio/sync/import` uploads the dump; the Worker stamps `owner_id = session.user.id`
   (overwriting the local `'local'`) and upserts by `id`.
3. Counts are verified (same check as the local "Import browser data into SQLite" flow).

**Phase B — continuous sync (later).** Add the deferred `_outbox` + `_sync` stores and a real
push/pull:

- **Push:** mutations are written locally **and** enqueued in the same transaction; a flusher posts
  them with an `updated_at` precondition (idempotent upserts).
- **Pull:** a keyset changefeed on `(updated_at, id)` including tombstones — O(changes), not O(data).
- **Conflict rule:** last-write-wins on `updated_at`; **server wins on tombstones** so a delete is not
  resurrected. (CRDTs are a future evaluation, not a v1 need.)
- Bind to `online`/app-start with backoff; show a visible sync status.

**Deletes** already use tombstones (`deleted_at`), so they sync as normal updates; a purge sweeps
tombstones only after they have been acknowledged by the server.

---

## 6. Managed-AI proxy + metering

**Goal:** a paid tier that works with **no BYOK key**, while BYOK stays free.

- A Worker route `POST /api/studio/complete` (same SSE shape as the local bridge) that:
  1. authenticates the session,
  2. checks the entitlement (plan + quota),
  3. calls **Workers AI** (`void/ai`) or Anthropic with a **server-held** key,
  4. streams the response back and **records usage** in `usage_events`.
- Client: add a fifth provider `'managed'` that calls the proxy with the auth token;
  `providers/index.js` already isolates provider selection, so this is one adapter + one Settings card.
- **Metering:** `usage_events` rows feed a per-user monthly rollup; the proxy rejects over-quota with a
  structured error the UI renders as an upgrade prompt.
- **Why server-side:** holding the key client-side would expose it; a BYOK key is *the user's own*,
  but the managed key is ours and must never ship to the browser.
- Workers AI can also cover cheaper models; Anthropic can be the premium path. A queue decouples slow
  generations from the request lifecycle if needed.

---

## 7. Billing (Stripe)

- `POST /api/billing/checkout` creates a Stripe Checkout session for the Pro plan.
- A Stripe **webhook** (`/api/billing/webhook`, signature-verified) writes `subscriptions` and flips
  the entitlement metadata the proxy reads.
- Free tier = BYOK + local agent (unchanged); Pro = managed AI with a monthly token allowance.
- Keep billing state **server-side**; the client only asks "am I entitled?" and renders the result.

---

## 8. Oboe feature-parity roadmap

[B]ased on the requested scope, the parity roadmap (all additive pages/services; none invalidate the
local-first architecture):

| Feature | Notes |
|---------|-------|
| **Audio/podcast lessons (AUDIO-01)** | Generate a lesson script → TTS (Cloudflare/Workers AI or a TTS provider) → store audio in R2; a player on the Lesson page. Local-first fallback: browser speech synthesis with no backend. |
| **Managed AI (MANAGED-01)** | §6 above. |
| **Community course registry (REG-01)** | Browse/import courses from the `professor-skills-hub`; R2/CDN-hosted, import into the local repo. |
| **Cross-device sync (SYNC-01)** | §5 above. |
| **Capstone project brief (CAP-01)** | Unlock after all lessons are done; already modeled (`capstone` column). |
| Richer lesson formats, streak reminders (cron), weekly review emails | Additive; cron + email are built into Void. |

---

## 9. Phased plan

| Phase | Deliverable | Depends on |
|-------|-------------|-----------|
| S-a | Void app skeleton on Cloudflare; static Studio deployed; `void/auth` email sign-in; a `/api/studio/db/health` Worker route returning `{ ok, kind:'d1' }` | v3.0 |
| S-b | D1 Worker implementing the full `/api/studio/db` contract against `studio/migrations` (+ `d1_migrations`); single-DB `owner_id` scoping; add `owner_id` to indexes | S-a |
| S-c | One-shot cloud import on first sign-in (reuse `exportAll`/`importAll`); sign-in route in Studio | S-b |
| S-d | `_outbox`/`_sync` + keyset changefeed (continuous sync), sync-status UI | S-c |
| S-e | Managed-AI proxy + `usage_events` metering + `'managed'` provider; per-user quotas | S-b |
| S-f | Stripe checkout + webhook + entitlement gating | S-e |
| S-g | Audio lessons (R2 + TTS), registry import, capstone unlock, reminders | S-e |

---

## 10. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| `owner_id` scoping bug leaks another user's data | Centralize query building; never accept `owner_id` from the request; add tests that an authenticated user cannot read/write foreign rows. |
| D1 limits (size/rows/statements/db count) | Single DB + `owner_id`; keep JSON as TEXT but cap fields; index for keyset queries; monitor growth; migrate large blobs to R2. |
| Sync conflicts / resurrected deletes | `updated_at` last-write-wins + "server wins on tombstones" + durable outbox (local write and enqueue in one transaction). |
| Managed-AI cost/abuse | Server-held key, per-user quotas, metering, rate limits, and a queue; surface over-quota as an upgrade prompt. |
| Void maturity / lock-in | Keep `studio/dist` host-agnostic (relative base, hash routing, no Void-only imports); the Worker is the only Void-specific piece. |
| Key exposure | Managed key server-side only; BYOK keys stay in the browser; backups never include keys (already enforced by a test). |
| Privacy expectations of a "local-first" product | Make hosting **opt-in**; keep the entire local path working with no account, and state clearly in onboarding what leaves the device. |

---

*Related: [`DEPLOY.md`](DEPLOY.md) (static deploy) · [`../README.md`](../README.md) (local run) ·
`../../.planning/research/ARCHITECTURE.md` §SaaS Evolution Path.*
