---
phase: quick
plan: 2
type: execute
wave: 1
depends_on: []
files_modified:
  - commands/professor/capstone-review.md
  - shared/commands/professor/capstone-review.md
  - commands/professor/skill-export.md
  - shared/commands/professor/skill-export.md
  - commands/professor/publish.md
  - shared/commands/professor/publish.md
  - bin/cli.js
  - bin/registry-helpers.js
  - test/cli.test.js
  - plugin.json
autonomous: true
requirements: []
must_haves:
  truths:
    - "professor:capstone-review writes COMPLETION.md on Course Complete verdict"
    - "professor:skill-export produces SKILL.md from capstone context"
    - "course-professor publish --dry-run packages files without touching GitHub"
    - "course-professor publish creates PR via gh or falls back to browser URL"
    - "professor:publish shells out to CLI and reports PR URL"
  artifacts:
    - path: "commands/professor/capstone-review.md"
      provides: "Patched path lookup + COMPLETION.md write on Course Complete"
    - path: "commands/professor/skill-export.md"
      provides: "SKILL.md generation from capstone"
    - path: "commands/professor/publish.md"
      provides: "In-session publish UX"
    - path: "bin/cli.js"
      provides: "case 'publish:' execution layer"
    - path: "bin/registry-helpers.js"
      provides: "validateSource* + buildMetaJson + buildStagingDir + generateBrowserFallbackUrl"
    - path: "test/cli.test.js"
      provides: "≥15 Vitest tests for publish unit paths"
    - path: "plugin.json"
      provides: "professor:publish and professor:skill-export registered"
  key_links:
    - from: "commands/professor/publish.md"
      to: "bin/cli.js"
      via: "Bash shell-out to npx course-professor publish"
      pattern: "npx course-professor publish"
    - from: "commands/professor/capstone-review.md"
      to: "learning/{slug}/COMPLETION.md"
      via: "Write tool on Course Complete verdict"
      pattern: "writeFileSync.*COMPLETION.md"
    - from: "bin/cli.js"
      to: "bin/registry-helpers.js"
      via: "import { validateSourceCourse, buildStagingDir, ... }"
      pattern: "validateSource|buildStagingDir|generateBrowserFallback"
---

<objective>
Build all 5 publish-flow steps from the approved design doc:
1. Patch `professor:capstone-review` (path fix + COMPLETION.md write)
2. Build `professor:skill-export` command (produces SKILL.md from capstone)
3. Build `course-professor publish` CLI command (execution layer)
4. Build `professor:publish` command (in-session UX wrapper)
5. Register both in `plugin.json`

The CLI publish command is the authoritative execution layer. The plugin commands are UX wrappers that shell out to the CLI.
</objective>

<context>
@/Users/tuankhuat/.gstack/projects/course-learning-plugin/tuankhuat-develop-design-20260326-publish-flow.md
</context>

<interfaces>
<!-- Key exports needed for the publish CLI — derived from existing registry-helpers.js patterns -->

From bin/registry-helpers.js (existing exports to use):
```javascript
export async function fetchRegistryText(url, { optional = false } = {})  // fetch raw registry text
export function style(type, text)  // chalk-styled console output
export function validateItemName(name)  // slug validation
```

New exports to add to bin/registry-helpers.js:
```javascript
// Source validation (inlined from validate.js — separate repo, no runtime import)
export function validateSourceCourse(dir)   // { valid, errors } — checks COURSE.md ≥3 sections
export function validateSourceSkill(dir)    // { valid, errors } — checks SKILL.md + COMPLETION.md verdict
export function validateMetaJson(meta, type) // { valid, errors } — validates meta.json schema

// Meta.json builder
export function buildCourseMetaJson(courseDir, overrides) // { name, title, description, author, level, topics }
export function buildSkillMetaJson(skillDir, overrides)   // { name, title, description, author, origin_course, topics }

// Staging dir builder
export function buildStagingDir(type, slug, sourceDir)   // copies to .publish-staging/<slug>/

// URL fallback generator
export function generateBrowserFallbackUrl(type, slug)   // GitHub compare URL string
```

From bin/cli.js (existing patterns to follow):
```javascript
// Style: style('success', msg), style('error', msg), style('info', msg)
// Ora spinner: ora('text').start() / spinner.stop() / spinner.succeed() / spinner.fail()
// Inquirer: inquirer.prompt([{ type: 'confirm', name: 'confirmed', ... }])
// Exit: process.exit(0) / process.exit(1)
```

meta.json schemas (from design doc):
```json
// Course: { name, title, description, author, level, topics[], version?, created?, updated?, license? }
// Skill:  { name, title, description, author, origin_course, topics[], version?, created?, updated?, license? }
```

COMPLETION.md format (from design doc):
```yaml
---
course: react-hooks
completed: 2026-03-26
verdict: Course Complete
capstone_summary: Built a custom useDebounce hook...
---
```

SKILL.md format for skill-export (50-150 lines, per Eng Decision 7):
- Frontmatter: name, description, triggers
- Core behavior rules derived from CAPSTONE.md + NOTES.md + COMPLETION.md
- Example prompts
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Patch professor:capstone-review — path fix + COMPLETION.md write</name>
  <files>commands/professor/capstone-review.md, shared/commands/professor/capstone-review.md</files>
  <action>
Apply BOTH fixes atomically (per Eng Decision 4 — partial fix rejected):

**Fix A — Directory lookup priority:**
In Step 1 (course directory check), replace the single `courses/` check with:
- Check `learning/{slug}/COURSE.md` first (new worktree structure)
- Fall back to `courses/{slug}/COURSE.md` (legacy)
- Fix slug extraction to work from any working directory context

**Fix B — COMPLETION.md write step (on "Course Complete" only, never "Almost There"):**
After Step 6 verdict of "Course Complete" (step 49 in original):
- Write `learning/{slug}/COMPLETION.md` (or `courses/` fallback) with:
  ```yaml
  ---
  course: {slug}
  completed: {YYYY-MM-DD}
  verdict: Course Complete
  capstone_summary: {first 200 chars of capstone_summary from review}
  ---
  ```
- Extract capstone_summary from the review text provided by the user (the description of what they built)
- "Almost There" verdict must NOT write COMPLETION.md — the gate remains
- Also update `COURSE.md` capstone status to ✅ Complete per existing step 49 behavior

Apply to both `commands/professor/capstone-review.md` and `shared/commands/professor/capstone-review.md`.
  </action>
  <verify>npx vitest run test/cli.test.js (existing tests still pass)</verify>
  <done>capstone-review writes COMPLETION.md on "Course Complete" verdict; directory lookup checks learning/ first with courses/ fallback</done>
</task>

<task type="auto">
  <name>Task 2: Build professor:skill-export + course-professor publish CLI + Vitest tests</name>
  <files>commands/professor/skill-export.md, shared/commands/professor/skill-export.md, bin/cli.js, bin/registry-helpers.js, test/cli.test.js</files>
  <action>
**PART A — professor:skill-export command file** (commands/professor/skill-export.md and shared/):

Triggered when user runs `professor:skill-export`. Reads the course directory (learning/{slug}/ first, courses/ fallback).

Steps:
1. Find active course directory — same lookup pattern as capstone-review fix
2. Gate check: COMPLETION.md must exist with `verdict: Course Complete` (hard gate — stop if missing)
3. Read COMPLETION.md, CAPSTONE.md, NOTES.md from the course directory
4. Generate `SKILL.md` (50-150 lines) with:
   - YAML frontmatter: name (from slug), description (from capstone_summary), triggers (3-5 example prompts)
   - Core behavior rules (derived from what the learner demonstrated — look at capstone_summary and CAPSTONE.md)
   - Example prompts section (5 prompts showing how someone would use this skill)
   - This is NOT the 868-line professor-skill/SKILL.md — it's a concise learner-authored skill
5. Write to `learning/{slug}/SKILL.md` (same directory as COMPLETION.md)
6. Report: "SKILL.md written to {path}. You can now run `professor:publish` to share it."

**PART B — Add validation and meta builder functions to bin/registry-helpers.js:**

Add these exports (inlined per Eng Decision 1 — validate.js is in separate repo, no runtime import):

```javascript
// validateSourceCourse(dir): checks dir has COURSE.md with ≥3 sections marked ⬜/🔄/✅
// Returns { valid: boolean, errors: string[] }

export function validateSourceCourse(dir) {
  const courseMd = readFileSync(join(dir, 'COURSE.md'), 'utf-8').split('\n');
  // Count non-header, non-blank lines with status indicators
  const sectionCount = courseMd.filter(l => l.match(/^[⬜🔄✅]/)).length;
  const errors = [];
  if (sectionCount < 3) errors.push(`COURSE.md has ${sectionCount} sections — minimum 3 required`);
  if (!existsSync(join(dir, 'COURSE.md'))) errors.push('COURSE.md not found');
  return { valid: errors.length === 0, errors };
}

// validateSourceSkill(dir): checks dir has SKILL.md + COMPLETION.md with "Course Complete"
export function validateSourceSkill(dir) {
  const errors = [];
  if (!existsSync(join(dir, 'SKILL.md'))) errors.push('SKILL.md not found (run professor:skill-export first)');
  const compPath = join(dir, 'COMPLETION.md');
  if (!existsSync(compPath)) errors.push('COMPLETION.md not found (run professor:capstone-review to completion first)');
  else {
    const comp = readFileSync(compPath, 'utf-8');
    if (!comp.includes('verdict: Course Complete')) errors.push('COMPLETION.md verdict is not "Course Complete" — skill publish requires full completion');
  }
  return { valid: errors.length === 0, errors };
}

// validateMetaJson(meta, type): validates built meta.json against schema
// Returns { valid, errors }

export function buildCourseMetaJson(courseDir, { name, title, description, author, level, topics }) {
  return { name, title, description, author, level, topics: topics || [] };
}
export function buildSkillMetaJson(skillDir, { name, title, description, author, origin_course, topics }) {
  return { name, title, description, author, origin_course, topics: topics || [] };
}

// buildStagingDir(type, slug, sourceDir): copies files to .publish-staging/<slug>/
export function buildStagingDir(type, slug, sourceDir) {
  const stagingDir = join(process.cwd(), '.publish-staging', slug);
  mkdirSync(stagingDir, { recursive: true });
  if (type === 'course') {
    writeFileSync(join(stagingDir, 'COURSE.md'), readFileSync(join(sourceDir, 'COURSE.md')));
    writeFileSync(join(stagingDir, 'meta.json'), JSON.stringify(buildCourseMetaJson(sourceDir, {}), null, 2));
  } else {
    writeFileSync(join(stagingDir, 'SKILL.md'), readFileSync(join(sourceDir, 'SKILL.md')));
    writeFileSync(join(stagingDir, 'meta.json'), JSON.stringify(buildSkillMetaJson(sourceDir, {}), null, 2));
  }
  return stagingDir;
}

// generateBrowserFallbackUrl(type, slug): GitHub compare URL
export function generateBrowserFallbackUrl(type, slug) {
  return `https://github.com/professor-skills-hub/courses-skills-registry/compare/main...contribute/${type}/${slug}`;
}
```

**PART C — Add `case 'publish':` to bin/cli.js:**

```javascript
case 'publish': {
  // Parse args
  const isDryRun   = args.includes('--dry-run');
  const isForce    = args.includes('--force');
  const typeArg    = args.includes('--type') ? args[args.indexOf('--type') + 1] : null;
  const nameArg    = args.find(a => a.startsWith('--name='))?.split('=')[1]
                  || args.find((a, i) => !a.startsWith('--') && i > 0 && args[i-1] !== '--type');
  const pathArg    = args.find(a => a.startsWith('--path='))?.split('=')[1]
                  || (args.includes('--path') ? args[args.indexOf('--path') + 1] : null);

  const sourceDir  = pathArg || process.cwd();
  const slug       = nameArg || basename(sourceDir);

  // Auto-detect type: skill if SKILL.md+COMPLETION.md exist, else course
  let contentType = typeArg;
  if (!contentType) {
    const hasSkill = existsSync(join(sourceDir, 'SKILL.md')) && existsSync(join(sourceDir, 'COMPLETION.md'));
    const hasCourse = existsSync(join(sourceDir, 'COURSE.md'));
    if (hasSkill && hasCourse) {
      console.log(style('info', 'Both course and skill detected. Use --type course|skill to specify.'));
      process.exit(1);
    }
    contentType = hasSkill ? 'skill' : hasCourse ? 'course' : null;
    if (!contentType) {
      console.error(style('error', 'No COURSE.md or SKILL.md found. Run from a course directory.'));
      process.exit(1);
    }
  }

  // Validate source
  const validator = contentType === 'course' ? validateSourceCourse(sourceDir) : validateSourceSkill(sourceDir);
  if (!validator.valid) {
    for (const err of validator.errors) console.error(style('error', err));
    process.exit(1);
  }

  // Build staging dir
  const stagingDir = buildStagingDir(contentType, slug, sourceDir);

  if (isDryRun) {
    console.log(style('info', `Dry run — packaged files at: ${stagingDir}`));
    console.log(style('info', 'Contents:'));
    readdirSync(stagingDir).forEach(f => console.log(`  - ${f}`));
    process.exit(0);
  }

  // gh availability check
  const ghAvailable = (() => {
    try {
      const { execSync } = import('child_process');
      execSync('gh --version', { stdio: 'ignore' });
      return true;
    } catch { return false; }
  })();

  if (!ghAvailable) {
    const url = generateBrowserFallbackUrl(contentType, slug);
    console.log(style('warning', 'gh CLI not found — using browser fallback.'));
    console.log(`Open this URL to create a PR manually:`));
    console.log(chalk.blue(`  ${url}`));
    console.log(style('info', `Your packaged files are at: ${stagingDir}`));
    console.log(style('info', 'Upload them to the PR after opening the browser.'));
    process.exit(0);
  }

  // gh auth check
  const { execSync: ghExec } = await import('child_process');
  try { ghExec('gh auth status', { stdio: 'ignore' }); } catch {
    console.log(style('warning', 'gh not authenticated — using browser fallback.'));
    const url = generateBrowserFallbackUrl(contentType, slug);
    console.log(chalk.blue(`  ${url}`));
    process.exit(0);
  }

  // Setup git credentials
  try {
    ghExec('gh auth setup-git', { stdio: 'pipe' });
  } catch {
    console.error(style('error', 'gh auth setup-git failed. Run gh auth login first.'));
    process.exit(1);
  }

  // Fork
  const forkSpinner = ora('Forking registry…').start();
  let forkUrl;
  try {
    ghExec(`gh repo fork professor-skills-hub/courses-skills-registry --clone=false`, { stdio: 'pipe' });
    const remoteUrl = ghExec('git remote get-url origin', { encoding: 'utf-8' });
    forkUrl = remoteUrl.trim();
    forkSpinner.succeed();
  } catch (err) {
    forkSpinner.fail();
    console.error(style('error', `Fork failed: ${err.message}`));
    process.exit(1);
  }

  // Clone to temp dir
  const tmpDir = mkdtempSync(join(os.tmpdir(), 'professor-publish-'));
  const repoDir = join(tmpDir, 'repo');
  const cloneSpinner = ora('Cloning fork…').start();
  try {
    ghExec(`git clone --depth=1 ${forkUrl} ${repoDir}`, { stdio: 'pipe' });
    cloneSpinner.succeed();
  } catch (err) {
    cloneSpinner.fail();
    console.error(style('error', `Clone failed: ${err.message}`));
    rmSync(tmpDir, { recursive: true, force: true });
    process.exit(1);
  }

  // Copy files
  const destDir = join(repoDir, contentType === 'course' ? 'courses' : 'skills', slug);
  mkdirSync(destDir, { recursive: true });
  for (const f of readdirSync(stagingDir)) {
    const src = join(stagingDir, f);
    if (statSync(src).isFile()) {
      writeFileSync(join(destDir, f), readFileSync(src));
    }
  }

  // Branch, commit, push
  const branch = `contribute/${contentType}/${slug}`;
  const commitMsg = `Add ${contentType}: ${slug}`;
  ghExec(`git checkout -b ${branch}`, { cwd: repoDir, stdio: 'pipe' });
  ghExec(`git add . && git commit -m "${commitMsg}"`, { cwd: repoDir, stdio: 'pipe' });
  const pushFlags = isForce ? '-f' : '';
  ghExec(`git push origin ${branch} ${pushFlags}`.trim(), { cwd: repoDir, stdio: 'pipe' });

  // Create PR
  const prSpinner = ora('Creating PR…').start();
  let prUrl;
  try {
    const prJson = ghExec(`gh pr create --json url --jq .url --title "${commitMsg}" --body "Published via course-professor publish."`, {
      cwd: repoDir,
      encoding: 'utf-8',
    });
    prUrl = JSON.parse(prJson).url;
    prSpinner.succeed();
    console.log(style('success', `PR created: ${prUrl}`));
  } catch (err) {
    prSpinner.fail();
    console.error(style('error', `PR creation failed: ${err.message}`));
    process.exit(1);
  }

  // Cleanup
  rmSync(tmpDir, { recursive: true, force: true });
  rmSync(stagingDir, { recursive: true, force: true });
  process.exit(0);
  break;
}
```

**PART D — Add Vitest tests (test/cli.test.js):**

Add test cases covering:
- `validateSourceCourse` — valid course (≥3 sections), invalid (1 section), missing COURSE.md
- `validateSourceSkill` — valid (SKILL.md + COMPLETION.md with Course Complete verdict), missing SKILL.md, missing COMPLETION.md, wrong verdict
- `buildCourseMetaJson` — all fields present, missing optional fields
- `buildSkillMetaJson` — all fields, origin_course required field
- `buildStagingDir` — creates .publish-staging/<slug>/ with correct files
- `generateBrowserFallbackUrl` — correct URL format for course and skill
- `--dry-run` exit with code 0
- `--type` auto-detection: skill (both files), course (COURSE.md only), ambiguous, neither found

</action>
  <verify>npx vitest run test/cli.test.js (all tests pass)</verify>
  <done>skill-export command exists and produces SKILL.md; CLI publish --dry-run packages files without touching GitHub; --type auto-detection works; all new Vitest tests pass</done>
</task>

<task type="auto">
  <name>Task 3: Build professor:publish UX wrapper + register in plugin.json</name>
  <files>commands/professor/publish.md, shared/commands/professor/publish.md, plugin.json</files>
  <action>
**PART A — commands/professor/publish.md and shared/commands/professor/publish.md:**

Triggered when user runs `professor:publish`.

Steps:

1. **Find active course** — same lookup (learning/{slug}/ first, courses/ fallback)

2. **Multi-course disambiguation** (Eng Decision 8): If multiple courses exist, ask user which one to publish using AskUserQuestion. List all learning/ dirs with COURSE.md.

3. **Ask type** (step 1 of design spec):
   > "What would you like to publish — a course template or a skill you built?"
   - Options: Course template / Skill I built
   - Do NOT auto-detect — use explicit choice per design spec.

4. **Skill gate checks** (step 2 of design spec):
   - If "Skill I built": check `COMPLETION.md` exists — hard gate. If missing:
     > "Run `professor:capstone-review` to completion first — COMPLETION.md is required."
   - Check `SKILL.md` exists (from prior `professor:skill-export`) — if missing:
     > "Run `professor:skill-export` first to generate your SKILL.md before publishing."

5. **Extract fields** (step 3 of design spec):
   - Read COURSE.md (for courses) or SKILL.md + COMPLETION.md (for skills)
   - Extract: title, description, level (from COURSE.md frontmatter)
   - AskUserQuestion for any missing required fields: GitHub username, description, topics array

6. **AskUserQuestion: level** if not in COURSE.md frontmatter (Beginner / Intermediate / Advanced / Expert)

7. **Confirm** (step 6 of design spec):
   > "About to open a PR to professor-skills-hub. Proceed?"
   - If no: stop.

8. **Version check** (Eng Decision 9): Run Bash check:
   ```
   npx course-professor --version
   ```
   If version < expected, print warning: "You may need to update: npm install -g course-professor"

9. **Shell out to CLI** (step 6 of design spec):
   ```
   npx course-professor publish --type [course|skill] --name [slug]
   ```
   Use Bash tool with output capture. Parse stdout for bare PR URL (line starting with `https://github.com/`). On non-zero exit, surface stderr verbatim.

10. **Report result**: PR URL to user, or browser URL if gh was unavailable.

**PART B — plugin.json edits:**

Add to `commands[]` array:
```json
{ "name": "professor:publish",       "file": "commands/professor/publish.md" },
{ "name": "professor:skill-export",  "file": "commands/professor/skill-export.md" },
```

Also update the professor agent description to include `professor:publish` and `professor:skill-export`:
```
professor:new-topic, professor:next, professor:done, professor:review,
professor:hint, professor:stuck, professor:discuss, professor:quiz,
professor:syllabus, professor:progress, professor:navigator, professor:capstone, professor:capstone-review,
professor:export, professor:note, professor:archive, professor:publish, professor:skill-export
```
  </action>
  <verify>npx vitest run test/cli.test.js (all pass); ls commands/professor/publish.md shared/commands/professor/publish.md (files exist)</verify>
  <done>professor:publish and professor:skill-export registered in plugin.json; publish command shells out to CLI correctly</done>
</task>

</tasks>

<verification>
- `commands/professor/publish.md` and `shared/commands/professor/publish.md` exist
- `commands/professor/skill-export.md` and `shared/commands/professor/skill-export.md` exist  
- `plugin.json` includes both new commands
- `bin/cli.js` has `case 'publish':` block
- `bin/registry-helpers.js` exports validation/meta/staging functions
- `test/cli.test.js` has ≥15 new test cases for publish logic
- `npm test` passes all tests
</verification>

<success_criteria>
All 5 design doc next steps are implemented:
1. ✅ capstone-review patched (learning/ path + COMPLETION.md write)
2. ✅ skill-export command creates SKILL.md from capstone
3. ✅ `course-professor publish` CLI works with --dry-run, gh fork/clone/push, browser fallback
4. ✅ `professor:publish` shells out to CLI with PR URL reporting
5. ✅ plugin.json registers both new commands
</success_criteria>

<output>
After completion, create `.planning/quick/2-build-all-5-publish-flow-steps-capstone-/2-SUMMARY.md`
</output>
