---
phase: cli-skill-registry
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: [bin/cli.js, package.json, test/cli.test.js]
autonomous: true
requirements: []
must_haves:
  truths:
    - "CLI safely handles malformed registry JSON without stack traces"
    - "meta.json is optional during install — 404 returns null, not error"
    - "Invalid item names (path traversal, dots) are rejected at entry"
    - "Existing SKILL.md/COURSE.md prompts before overwriting"
    - "update command reinstalls skill with fresh registry copy"
    - "installed command lists all local+global skills with metadata"
    - "remove command deletes skill from correct scope with confirmation"
  artifacts:
    - path: bin/cli.js
      provides: CLI with all commands, helpers, and safety fixes
      exports: validateItemName, resolveScope, installSkill, installCourse, update, installed, remove
    - path: package.json
      provides: test script + vitest dependency
      exports: "test": "vitest"
    - path: test/cli.test.js
      provides: comprehensive test coverage
      exports: 13 test categories covering all error paths
  key_links:
    - from: case 'install'
      to: installSkill / installCourse helpers
      via: function call with index
      pattern: installSkill.*index
    - from: case 'update'
      to: installSkill helper
      via: force:true option
      pattern: installSkill.*force.*true
    - from: validateItemName
      to: install/update/remove/case 'install'
      via: called at entry of each
      pattern: validateItemName\(name\)
---

<objective>
Implement the full CLI skill registry lifecycle: JSON.parse safety, meta.json optional, path sanitization, overwrite protection, helper refactor, and three new commands (update/installed/remove) with comprehensive Vitest test coverage.
</objective>

<context>
@bin/cli.js
</context>

<tasks>

<task type="auto">
  <name>Task 1: Safety fixes + helper refactor</name>
  <files>bin/cli.js</files>
  <action>
Apply all 4 safety fixes and the helper extraction refactor to bin/cli.js:

1. **JSON.parse safety**: Wrap `JSON.parse(text)` in `fetchRegistryIndex()` with try/catch. On `SyntaxError`, print `style('error', 'Registry returned invalid data. Try again or check https://github.com/professor-skills-hub/courses-skills-registry')` and exit 1.

2. **meta.json optional**: Update `fetchRegistryText()` to accept `{ optional: true }` option. When `optional: true` and HTTP status is 404, return `null` instead of rejecting. Apply `{ optional: true }` to meta.json downloads in both skill and course install paths.

3. **Path sanitization**: Add `basename` to `import { join, dirname, basename } from 'path'`. Extract `validateItemName(name)` at module level:
   ```
   function validateItemName(name) {
     if (!name || basename(name) !== name || name === '.') {
       console.error(style('error', 'Invalid name'));
       process.exit(1);
     }
   }
   ```
   Call `validateItemName(itemName)` at top of `install` case (before registry fetch) and at top of `update`, `installed`, `remove` case blocks.

4. **Overwrite protection**: Before `mkdirSync(destDir)` in BOTH skill and course paths:
   - Skills: check `existsSync(join(destDir, 'SKILL.md'))`
   - Courses: check `existsSync(join(destDir, 'COURSE.md'))`
   - If exists + no `--force` + TTY: prompt `'Already installed. Overwrite? (y/N)'` default false
   - If exists + no `--force` + non-TTY: print error and exit 1

5. **Extract helpers**: At module level, after the `style` function:
   - `validateItemName(name)` — see item 3 above
   - `async function resolveScope(itemName, type)` — handles `--global`/`--local`/TTY logic, returns scope string, used by install/update/remove
   - `async function installSkill(itemName, scope, { force = false, index = null } = {})` — lookup (from provided index or fetch), dest path, overwrite check, download SKILL.md + meta.json (optional), success message. Takes `{ force: true }` for update.
   - `async function installCourse(itemName, { force = false, index = null } = {})` — lookup, dest path (`learning/{name}/`), overwrite check (COURSE.md), download, success message. No scope param (always local).

   Add `rmSync` to fs imports.

   The `case 'install'` block becomes: fetch index, determine `isSkill`, call appropriate helper with `{ index }`. ~15 lines.
</action>
  <verify>node bin/cli.js install nonexistent-xyz-123 --force 2>&1 | grep -q "Invalid name\|not found" && echo "validateItemName works"</verify>
  <done>All 4 safety fixes applied, 4 helpers extracted, install case refactored to ~15 lines using helpers</done>
</task>

<task type="auto">
  <name>Task 2: Add update, installed, remove commands</name>
  <files>bin/cli.js</files>
  <action>
Add three new case blocks to the switch statement (after the existing `case 'install'` block):

**case 'update':**
- Parse name from args, call `validateItemName(name)`. Require exactly 1 arg.
- Call `resolveScope(name, 'skill')` to get scope.
- Fetch registry index once.
- Pre-check: if skill not installed in resolved scope → error + exit 1.
- Call `installSkill(name, scope, { force: true, index })`.
- `--all` flag: enumerate `.claude/skills/` (local) and `~/.claude/skills/` (global) — `existsSync` before `readdirSync`, filter dirs with SKILL.md. Fetch index once. Loop: try/catch per skill, track `{ updated, skipped, failed }`. If not in registry → warning + skipped. If fetch fails → warning + failed. Summary: "Updated: N | Skipped: N | Failed: N". Exit 1 if updated === 0.
- `--global`/`--local` flags restrict sweep scope.

**case 'installed':**
- Enumerate `.claude/skills/` (local) and `~/.claude/skills/` (global) — `existsSync` before `readdirSync`. Filter to subdirs with SKILL.md.
- Per skill: read meta.json if present. Compute dynamic column widths using `Math.max`.
- Format per line: `{slug.padEnd(nameW)}  {title.padEnd(titleW)}  {version.padEnd(verW)}  ({scope})  {path}`
- If neither dir has skills: `style('info', 'No skills installed. Run: course-professor search')`

**case 'remove':**
- Parse name from args, call `validateItemName(name)`. Require exactly 1 arg.
- Resolve scope: `--global` → global only; `--local` → local only; neither → check both scopes.
- If skill exists in both scopes and neither flag: prompt 3 choices [1] Local, [2] Global, [3] Both.
- `--force` with no scope flag when in both → **error**: "Skill found in both scopes. Use --local, --global, or --force --local/--global."
- If not found in resolved scope → error + exit 1.
- Confirm prompt unless `--force`: `'Remove skill "{name}" from {path}? (y/N)'` default false.
- On confirm: `rmSync(destDir, { recursive: true, force: true })`. Print success.

Also update `printUsage()` to add `update`, `installed`, `remove` to COMMANDS block and EXAMPLES section.
</action>
  <verify>node bin/cli.js --help 2>&1 | grep -E "update|installed|remove" && echo "Commands registered"</verify>
  <done>All three new commands implemented and documented in help output</done>
</task>

<task type="auto">
  <name>Task 3: Add Vitest + comprehensive test coverage</name>
  <files>bin/cli.js, package.json, test/cli.test.js</files>
  <action>
Install vitest and create comprehensive test coverage:

1. **Add vitest**: `npm install -D vitest`. Add `"test": "vitest"` to package.json scripts.

2. **Create test/cli.test.js**: ESM test file. Import the helper functions by extracting them to module-level so they can be tested directly. Cover:

   - `validateItemName()`: valid slug, empty string, path traversal (`../etc`), dot (`.`)
   - `fetchRegistryText()`: 200 response, 404+optional=true → null, 404+optional=false → throws
   - `fetchRegistryIndex()`: valid JSON, malformed JSON (SyntaxError caught)
   - `resolveScope()`: --global flag, --local flag, no flag+TTY mock, no flag+non-TTY
   - `installSkill()` error paths: not in registry, overwrite+TTY mock, overwrite+non-TTY, overwrite+force, meta.json optional (404→null)
   - `installCourse()` error paths: not in registry, COURSE.md overwrite+TTY, overwrite+force
   - `update` case: skill not installed error, calls installSkill with force:true
   - `update --all`: exit 1 on 0 updated, summary format, per-skill try/catch
   - `installed` case: empty dirs, local+global mix, meta.json absent fallback
   - `remove` case: not found, both scopes+no flag, force+no scope=error, confirm flow

   Use `vi.mock()` for https imports. Use `vi.mock('inquirer')` to mock TTY prompts. Use temp directories with `fs.mkdtempSync` for file system tests. Clean up in `afterEach`.
</action>
  <verify>npm test -- --run 2>&1 | tail -5</verify>
  <done>Vitest installed, all 13 test categories pass</done>
</task>

</tasks>

<verification>
node bin/cli.js --help includes update/installed/remove in command list
node bin/cli.js install test-skill-xyz --force exits with "Invalid name" or skill not found
npm test -- --run exits 0 with all tests passing
</verification>

<success_criteria>
- JSON.parse wrapped in try/catch in fetchRegistryIndex
- fetchRegistryText accepts { optional: true } and returns null on 404
- validateItemName rejects path traversal and dot names
- Overwrite protection prompts before replacing existing SKILL.md or COURSE.md
- 4 helper functions extracted and used by install/update/remove
- case 'update' reuses installSkill with force:true
- case 'installed' lists skills from both local and global dirs with dynamic column widths
- case 'remove' handles both scopes with confirmation prompt
- Vitest tests cover all 13 test categories
- npm test exits 0
</success_criteria>

<output>
After completion, create `.planning/quick/1-implement-cli-skill-registry-with-instal/1-SUMMARY.md`
</output>
