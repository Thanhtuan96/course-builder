# Phase 3: Plugin Drift Guard - Context

**Gathered:** 2026-10-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Make `shared/` a generated artifact that can never silently diverge from its canonical sources, and
add a drift guard that fails when it does. The installers read `shared/` directly
(`bin/platforms/claude.js`, `gemini.js`, `cursor.js`), while authors edit the root plugin files and
`professor-skill/SKILL.md`, so drift reaches users today (the current `shared/SKILL.md` is missing the
Agent Architecture section).

In scope:
- `scripts/sync-shared.mjs` — copy canonical files into `shared/`, plus a `--check` mode
- `bin/sync-shared.sh` — reduced to a one-line wrapper around the Node script
- Reconcile `shared/SKILL.md` with `professor-skill/SKILL.md` (canonical wins)
- `test/shared-drift.test.js` — byte-level drift test plus manifest parity
- Version alignment across `plugin.json`, `templates/claude/plugin.json`,
  `.claude-plugin/marketplace.json` against root `package.json`

Out of scope:
- `package.json` script additions (root `package.json` is not owned by this phase; a
  `sync:shared` script is a Phase 4 request)
- Any behavior change to agents, commands, hooks, or installers
- Lockfiles, CI workflow wiring (Phase 4), migration work (Phase 5)

</domain>

<decisions>
## Implementation Decisions

### Canonical direction
- **D-01:** Canonical sources are `agents/*.md`, `commands/professor/*.md`, `hooks/pre-compact.js`
  and `professor-skill/SKILL.md`; `shared/` is generated. `professor-skill/SKILL.md` is authoritative
  per `CLAUDE.md`, so `shared/SKILL.md` gains the Agent Architecture section — canonical content is
  never trimmed to match a stale copy. — **Reversibility:** costly — installers and every future
  phase read `shared/`; reversing the source-of-truth direction would require auditing all install
  paths and every drifted copy again.

### Sync behavior
- **D-02:** `scripts/sync-shared.mjs` is a dependency-free ESM Node script with two modes: default
  (write canonical → `shared/`) and `--check` (read-only; print missing/changed/orphan items and exit
  non-zero on any drift). The `.sh` wrapper stays for existing callers/docs and delegates with
  `exec node "$(dirname "$0")/../scripts/sync-shared.mjs" "$@"`.
- **D-03:** Sync mirrors the managed trees exactly: orphan files under `shared/agents/`,
  `shared/commands/professor/` and `shared/hooks/`, plus an unexpected `shared/SKILL.md` situation,
  are removed on sync and reported as drift by `--check`. Ignore `.gitkeep` and other dotfiles, and
  never touch unmanaged paths outside `shared/`.
- **D-04:** Writes are byte-for-byte (`readFileSync`/`writeFileSync`, no transformation) and ordered
  deterministically (sorted paths) so repeated runs are idempotent. No platform token substitution
  belongs here — that stays in `bin/platforms/_shared.js`.

### Manifest and version alignment
- **D-05:** Parity covers commands, agents, hooks and both manifests: every
  `commands/professor/*.md` has a matching `{ name: "professor:<basename>", file }` entry in both
  `plugin.json` and `templates/claude/plugin.json` and vice versa; every `agents/*.md` has an entry
  in both; `hooks/pre-compact.js` is declared in `plugin.json` with event `PreCompact`.
- **D-06:** Align `plugin.json.version`, `templates/claude/plugin.json.version` and both version
  fields in `.claude-plugin/marketplace.json` (`metadata.version`, `plugins[0].version`) to root
  `package.json.version` (`1.6.0-beta.1`). Do not rename plugins or repositories.

### Verification and tooling
- **D-07:** `test/shared-drift.test.js` is a black-box test: run `node scripts/sync-shared.mjs
  --check` as a subprocess and assert exit code 0 on the committed tree, plus independent assertions
  for manifest parity and version alignment. The `--check` path must never write to `shared/`; the
  test must not mutate the repo (temp dirs only if a fixture is needed).
- **D-08:** Do not add a root `package.json` script. Record the `sync:shared` request in the phase
  SUMMARY (and CONTEXT) so Phase 4 can add it; the workflow uses `node scripts/sync-shared.mjs`
  directly meanwhile.

### the agent's Discretion
- Exact CLI wording/formatting of `--check` output, internal helper layout, and whether the drift
  test shells out via `child_process.spawnSync` or `execFileSync` — implementation details.
- Whether to also assert no duplicate manifest entries and that declared files exist; recommended,
  since it is cheap and within the parity mandate.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase and requirement scope
- `.planning/ROADMAP.md` §"Phase 3: Plugin Drift Guard" — goal, owned files, success criteria
- `.planning/REQUIREMENTS.md` — BOUND-02 (generated `shared/`, drift test, `plugin.json` parity)
- `.planning/research/SUMMARY.md` §"Phase 3: Plugin drift guard" — delivery list
- `.planning/research/ARCHITECTURE.md` §"Component Responsibilities" — `sync-shared.mjs` contract
- `.planning/codebase/CONCERNS.md` §"Duplicated canonical content with manual sync" and
  §"Version and metadata drift" — the debt this phase closes
- `.planning/codebase/CONVENTIONS.md` — command frontmatter and manifest registration rules

### Existing implementation
- `bin/sync-shared.sh` — current sync behavior and its output contract
- `SYNC_GUIDE.md` — documented manual workflow (do not edit; out of phase ownership)
- `bin/platforms/claude.js`, `bin/platforms/gemini.js`, `bin/platforms/cursor.js` — consumers of
  `shared/SKILL.md`, `shared/agents/`, `shared/commands/`, `shared/hooks/`
- `test/migrations.test.js` — repo test/comment style for a guard test
- `vitest.config.js` — root test discovery (`test/**/*.test.js`)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `bin/sync-shared.sh` already defines the canonical → `shared/` copy set, but omits `SKILL.md`.
- `test/migrations.test.js` shows the flake-free guard-test pattern (node environment, fs + crypto,
  no network).

### Established Patterns
- Plain ESM scripts in `scripts/` (`scripts/smoke-pack.mjs` is the existing precedent), no new deps.
- Guard tests assert both the happy path and a deliberately broken fixture; they do not silently
  skip when files are missing.
- Manifests list commands as `{ "name": "professor:<action>", "file": "commands/professor/<action>.md" }`.

### Integration Points
- `scripts/sync-shared.mjs` ↔ `bin/sync-shared.sh` (wrapper) ↔ developer workflow
- `shared/SKILL.md` ↔ `professor-skill/SKILL.md` ↔ installers
- `plugin.json`, `templates/claude/plugin.json`, `.claude-plugin/marketplace.json` ↔ canonical files
- `test/shared-drift.test.js` ↔ Phase 4 CI drift job (runs this glob)

</code_context>

<specifics>
## Specific Ideas

- Current drift evidence: `shared/SKILL.md` is 547 lines vs `professor-skill/SKILL.md` 567 lines; the
  missing block is "Agent Architecture" inserted before "Absolute Rules".
- Current versions: `package.json` 1.6.0-beta.1, `plugin.json` 1.2.0, template 1.0.0,
  marketplace 1.2.0 (two fields).
- Current tree: 26 commands, 5 agents, 1 hook; all canonical/shared copies are byte-identical
  except `SKILL.md`.

</specifics>

<deferred>
## Deferred Ideas

- Adding `sync:shared` (and any `drift` alias) to root `package.json` scripts — Phase 4 owns
  `package.json` scripts in Wave 1; hand the request to the orchestrator/Phase 4.
- Updating `SYNC_GUIDE.md` and `CLAUDE.md` to say "`shared/` is generated" — not owned by this phase;
  propose the doc patch at merge time.
- Reconciling gitignored local copies (`.gemini/`, `.codex/`, `.cursor/`, `GEMINI.md`) — explicitly
  out of scope per roadmap/research.

</deferred>

---

*Phase: 3-Plugin Drift Guard*
*Context gathered: 2026-10-22*
