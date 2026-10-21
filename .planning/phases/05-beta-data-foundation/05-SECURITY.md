---
phase: "05"
slug: "beta-data-foundation"
status: verified
threats_open: 0
asvs_level: 1
created: "2026-10-22"
---

# Phase 05 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| shipped migration files -> SQLite/IndexedDB | Released migrations define every learner database; a changed or duplicated file corrupts data or fails upgrades | schema DDL, no learner content |
| Studio/CLI action -> repo write function | Untrusted learner input reaches the repo; only the repo decides what becomes an event | learner answers/code transiently, never persisted in events |
| repo -> `learning_events` / `revision_links` | Event and link rows must hold enum/number/local-day metadata only | enums, numbers, local day keys, local UUID refs |
| backup JSON -> `importAll` | A restored dump is untrusted data crossing every adapter | rows for every table, must remain content-free |
| phase branch -> develop | An unowned edit or a changed released migration breaks another Worker | source code, planning artifacts |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-05-01 | Tampering | `studio/migrations/0001-0005` | high | mitigate | 0001-0004 untouched; 0005 SHA-256 pinned in `test/fixtures/migrations.sha256.json`; `test/migrations.test.js` enforces contiguity + content | closed |
| T-05-02 | Tampering | `0005_beta_loop.sql` upgrade | high | mitigate | Additive `CREATE TABLE/INDEX IF NOT EXISTS`; partial-migration test preserves rows | closed |
| T-05-03 | Repudiation | `web/studio-db.js` / `/db/health` | medium | mitigate | Highest applied `d1_migrations` prefix with shared fallback; API test asserts 5 | closed |
| T-05-04 | Denial of Service | `idb-adapter.js` v4 databases | high | mitigate | `DB_VERSION` 5; v2→v5 and v4→v5 tests prove stores, rows and exportAll | closed |
| T-05-05 | Tampering | `repo/index.js` emission hooks | high | mitigate | Emit after successful create; one event per action; inner-checks discriminator; capstone idempotent early return | closed |
| T-05-06 | Tampering | adapter/CLI parity | medium | mitigate | Emission lives only in the shared repo; adapter contract + real CLI review/import parity tests | closed |
| T-05-07 | Information Disclosure | `events.js` meta / `learning_events` | high | mitigate | Per-kind whitelist, enum-only strings, reject arrays/free strings, 512-char cap; sentinel over rows + backup | closed |
| T-05-08 | Tampering | `revisionOf` feedback table | high | mitigate | Fixed allowlist before `adapter.get`; feedback must exist and not be deleted; one link per revised id; four negative tests | closed |
| T-05-13 | Spoofing | inferred revision predicates | medium | mitigate | Absolute ISO timestamps with parse guards; feedback strictly after attempt; span ≤ 72 h | closed |
| T-05-09 | Tampering | `beta/metrics.js` day math | high | mitigate | Calendar-component `dayNumber`/`dayOffset`; no `new Date(storedDay)`; clamp at 0; UTC+7/UTC−8/DST pins | closed |
| T-05-10 | Information Disclosure | `beta/report.js` schema | high | mitigate | `z.strictObject` at every level; literal schemaVersion 1; provider regex; full-report sentinel | closed |
| T-05-14 | Tampering | report validation | medium | mitigate | Unknown keys rejected (`unrecognized_keys`); builder returns `reportSchema.parse` | closed |
| T-05-11 | Tampering | `exportAll`/`importAll`/`clearAll` | high | mitigate | Contract covers new tables on memory, IndexedDB, SQLite and CLI; old dumps without the tables restore | closed |
| T-05-12 | Information Disclosure | backup / CLI parity | medium | mitigate | Export shape unchanged; restored report remains identical and content-free | closed |
| T-05-SC | Tampering | package installs | high | mitigate | No package installed; zod already declared in `studio/package.json` | closed |

*Status: open · closed · open — below high threshold (non-blocking)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-05-01 | T-05-06 | `bin/studio-store.js` lacks an adapter-level `clearAll`; new tables are still exported/imported/cleared through the inner SQLite DB. Contract gap, not a security regression — follow-up for a later phase. | orchestrator | 2026-10-22 |
| AR-05-02 | T-05-10 | `app.version` permits a short free string (≤32 chars); it is app metadata, not learner content. | orchestrator | 2026-10-22 |
| AR-05-03 | T-05-08 | An unknown explicit feedback table is silently ignored (no adapter read) and falls through to inference by design. | orchestrator | 2026-10-22 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-22 | 15 | 15 | 0 | gsd-security-auditor |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-22
