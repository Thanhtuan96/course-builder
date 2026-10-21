# Phase 3: Plugin Drift Guard - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-22
**Phase:** 3-plugin-drift-guard
**Areas discussed:** SKILL.md reconciliation, orphan handling, version alignment, parity breadth

---

## SKILL.md reconciliation

| Option | Description | Selected |
|--------|-------------|----------|
| Canonical wins | Copy `professor-skill/SKILL.md` (incl. Agent Architecture) into `shared/` | ✓ |
| Trim canonical | Delete the section from canonical so it matches stale `shared/` | |

**User's choice:** Orchestrator directive — `professor-skill/SKILL.md` is canonical per `CLAUDE.md`,
so `shared/` gets the Agent Architecture section; never trim canonical.
**Notes:** Installers read `shared/SKILL.md`, so the missing section was reaching users.

## Orphan handling

| Option | Description | Selected |
|--------|-------------|----------|
| Mirror exactly | Remove/report files in `shared/` with no canonical source | ✓ |
| Known-files only | Compare only expected files, leave extra files alone | |

**User's choice:** Sync removes orphan files that have no canonical source; `--check` reports them
as drift and fails.
**Notes:** Ignore `.gitkeep`/dotfiles; stay inside managed `shared/` trees.

## Version alignment

| Option | Description | Selected |
|--------|-------------|----------|
| Align to package.json | Set all three manifests to root `package.json.version` | ✓ |
| Leave versions alone | Only guard file drift | |

**User's choice:** Align `plugin.json`, `templates/claude/plugin.json` and
`.claude-plugin/marketplace.json` to `package.json` (`1.6.0-beta.1`); do not rename plugins.
**Notes:** Marketplace has two version fields (`metadata.version`, `plugins[0].version`).

## Parity breadth

| Option | Description | Selected |
|--------|-------------|----------|
| Full parity | Commands + agents + hooks + both manifests | ✓ |
| Commands only | Literal minimum from ROADMAP success criterion 3 | |

**User's choice:** Parity covers commands, agents, hooks and both manifests.
**Notes:** Recommended additions (duplicate entries, declared-file existence) approved as
implementation discretion.

## the agent's Discretion

- `--check` output formatting and helper layout.
- Test invocation style (`spawnSync` vs `execFileSync`) and temp-dir fixtures.
- Extra cheap assertions (duplicates, declared files exist).

## Deferred Ideas

- `sync:shared` npm script → request to Phase 4 (owns root `package.json` scripts).
- `SYNC_GUIDE.md` / `CLAUDE.md` doc wording updates → orchestrator patch at merge.
- Gitignored local copies (`.gemini/`, `.codex/`, `.cursor/`, `GEMINI.md`) → out of scope.
