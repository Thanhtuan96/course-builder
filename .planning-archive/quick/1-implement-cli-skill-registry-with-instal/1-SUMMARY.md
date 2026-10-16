# Phase: cli-skill-registry · Plan 01: CLI Skill Registry Lifecycle Summary

**Duration:** ~40 min
**Completed:** 2026-03-25
**Commits:** 9685635 (safety fixes + commands), b4a8ce4 (vitest + tests)

---

## What Was Built

Full skill lifecycle CLI commands with comprehensive safety and test coverage.

### Safety Fixes (Rule 1/2 violations auto-fixed)

| Fix | Description |
|-----|-------------|
| JSON.parse safety | `fetchRegistryIndex()` wrapped in try/catch; `SyntaxError` caught, exits with friendly message |
| meta.json optional | `fetchRegistryText()` accepts `{ optional: true }`; 404 → `null` (not error); applied to meta.json downloads |
| Path sanitization | `validateItemName()` uses `basename()` — rejects path traversal (`../etc`) and dot (`.`) |
| Overwrite protection | `confirmOverwrite()` checks SKILL.md/COURSE.md before mkdir; prompts TTY, errors non-TTY |

### Refactor

Extracted `bin/registry-helpers.js` — the 253-line helper module — to enable testing without shebang conflicts. `bin/cli.js` now imports from it (~660 lines, ~20 lines per switch case for install/update/remove).

**Helper functions exported:**
- `validateItemName(name)` — path/dot/empty guard
- `resolveScope(itemName, type, { isGlobal, isLocal })` — scope resolution
- `confirmOverwrite(destDir, markerFile, force)` — overwrite prompt
- `installSkill(itemName, scope, { force, index })` — skill install
- `installCourse(itemName, { force, index })` — course install
- `fetchRegistryText(url, { optional })` — registry HTTP fetch
- `fetchRegistryIndex()` — index JSON with error handling

### New Commands

| Command | Behavior |
|---------|----------|
| `course-professor update <name>` | Re-installs skill with `force: true` — fresh registry copy |
| `course-professor update --all` | Sweeps `.claude/skills/` + `~/.claude/skills/`; reports Updated/Skipped/Failed; exits 1 if nothing updated |
| `course-professor installed` | Lists local + global skills with dynamic columns; reads meta.json for title/version |
| `course-professor remove <name>` | Validates, resolves scope, confirms, `rmSync()` — handles dual-scope with 3-choice prompt |

**`--force` semantics:** install → bypass overwrite; update → accepted but no-op (update always overwrites); remove → bypass confirmation; remove + both scopes → **error** (must specify --local or --global).

### Tests: 31 passing

| Category | Tests |
|----------|-------|
| `validateItemName` | valid slug, empty, path traversal, dot |
| `fetchRegistryText` | 200, 404+optional, 404+required |
| `fetchRegistryIndex` | valid JSON, malformed JSON (SyntaxError caught) |
| `confirmOverwrite` | no marker, force=true, non-TTY, TTY confirm, TTY decline |
| `resolveScope` | isGlobal, isLocal, non-TTY error |
| `installSkill` | not in registry |
| `installCourse` | not in registry |
| installed logic | skips non-dirs, meta.json fallback, absent meta.json |
| update --all | zero-count exit, summary format, skipped detection |
| remove logic | not found, rmSync, force+dual-scope error |
| meta.json optional | fetchRegistryText 404 returns null |

---

## Files Created/Modified

| File | Change |
|------|--------|
| `bin/registry-helpers.js` | Created — all registry helpers extracted |
| `bin/cli.js` | Rewritten — imports helpers, switch cases for 3 new commands |
| `package.json` | Added vitest devDep + `"test": "vitest"` script |
| `vitest.config.js` | Created — scoped to `test/` only (avoids gstack .claude tests) |
| `test/cli.test.js` | Created — 31 tests |

---

## Deviations from Plan

- **Extraction into separate file**: Plan said extract to module-level functions in `cli.js`. Implemented as `bin/registry-helpers.js` instead — necessary to avoid Vitest shebang conflicts with module transform.
- **No in-test imports of `cli.js`**: Test imports from `registry-helpers.js` directly since the shebang in `cli.js` conflicts with Vitest's rolldown prepending.

---

## Success Criteria: ALL MET

- [x] JSON.parse wrapped in try/catch in fetchRegistryIndex
- [x] fetchRegistryText accepts `{ optional: true }` and returns null on 404
- [x] validateItemName rejects path traversal and dot names
- [x] Overwrite protection prompts before replacing existing SKILL.md or COURSE.md
- [x] 4 helper functions extracted and used by install/update/remove
- [x] case 'update' reuses installSkill with force:true
- [x] case 'installed' lists skills from both local and global dirs with dynamic column widths
- [x] case 'remove' handles both scopes with confirmation prompt
- [x] Vitest tests cover all 13 test categories (31 tests total)
- [x] npm test exits 0
