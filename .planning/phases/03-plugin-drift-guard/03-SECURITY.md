---
phase: "03"
slug: "plugin-drift-guard"
status: verified
threats_open: 0
asvs_level: 1
created: "2026-10-22"
---

# Phase 03 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| canonical files -> sync script | Repository-controlled Markdown/JS is read and copied; path-like names or symlinked entries could redirect a destination. | Source text (non-sensitive) |
| sync script -> `shared/` | The script creates, overwrites and deletes files inside three managed directories. | Generated plugin content (non-sensitive) |
| shell wrapper -> Node CLI | Developer arguments cross from `bin/sync-shared.sh` into the script. | CLI arguments (`--check`) |
| manifests <-> filesystem | `plugin.json` / `templates/claude/plugin.json` must name real canonical files. | Path strings / version strings |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-03-01 | Tampering | `scripts/sync-shared.mjs` destination resolution | high | mitigate | `assertPlainName` rejects `.`/`..`/separators; `resolveManagedDest` resolves and asserts the destination stays under its managed root; `lstatSync` rejects non-regular destinations, so symlinks are reported instead of followed. Test: `test/shared-drift.test.js` "reports a symlinked destination escape without following it". | closed |
| T-03-02 | Tampering | `scripts/sync-shared.mjs` orphan removal | medium | mitigate | `listOrphans` walks only `shared/agents`, `shared/commands/professor`, `shared/hooks`; dotfiles ignored; `resolveManagedDest` re-asserts the prefix; only regular files/symlinks are unlinked, directories are refused. Tests: command/hook orphan removal + read-only orphan reporting. | closed |
| T-03-03 | Tampering | `bin/sync-shared.sh` argument handling | medium | mitigate | `set -euo pipefail`; fixed `exec node "$(dirname "$0")/../scripts/sync-shared.mjs" "$@"`; quoted `"$0"`/`"$@"`; no `eval`, no globs, no `cp`. | closed |
| T-03-04 | Tampering / Repudiation | `plugin.json`, `templates/claude/plugin.json`, `.claude-plugin/marketplace.json` | medium | mitigate | `test/shared-drift.test.js` asserts one-to-one command/agent parity in both directions, no duplicate names, declared files exist, `PreCompact` hook declared in both manifests, and all four version fields equal `package.json`. | closed |
| T-03-05 | Tampering | Deterministic writes / partial failure | low | mitigate | Canonical lists are sorted; files written only when bytes differ; missing/unreadable sources fail fast; `--check` output uses repo-relative paths and no timestamps. Idempotence asserted by the plan verify and the committed-tree hash test. | closed |
| T-03-SC | Tampering | Package installs | high | mitigate | This phase adds no dependencies and runs no package installs; `package.json` and all lockfiles are unchanged (verified by `git diff --stat`). | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|

No accepted risks.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-22 | 6 | 6 | 0 | gsd-autonomous phase-03 worker (inline auditor) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-22
