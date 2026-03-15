# CLI Multi-Platform Fix Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `bin/cli.js` so that `setup claude/gemini/opencode/cursor` each installs working, platform-native professor plugin files instead of silently installing Claude Code files that other platforms ignore.

**Architecture:** Refactor `setupAgent()` and `detectAgent()` in `bin/cli.js` into four platform adapter modules under `bin/platforms/`. Each adapter exports `detect()` + `install()`. A shared utility module handles recursive file copying with per-platform token substitution (replacing `AskUserQuestion` with the platform-native equivalent or inline text). `cli.js` becomes a thin dispatcher.

**Tech Stack:** Node.js ESM (`import`/`export`), `fs` built-in, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-03-14-cli-multiplatform-fix-design.md`

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Modify | `bin/cli.js` | Remove platform logic; delegate detect/install to adapters |
| Modify | `templates/claude/plugin.json` | Sync with root `plugin.json` (3 commands + researcher + hooks) |
| Create | `bin/platforms/_shared.js` | Token substitution map + `copySharedFiles()` utility |
| Create | `bin/platforms/claude.js` | Claude Code adapter: `detect()` + `install()` |
| Create | `bin/platforms/gemini.js` | Gemini CLI adapter: `detect()` + `install()` + GEMINI.md generation |
| Create | `bin/platforms/opencode.js` | OpenCode adapter: `detect()` + `install()` + opencode.json merge |
| Create | `bin/platforms/cursor.js` | Cursor adapter: `detect()` + `install()` + .mdc generation |
| Create | `templates/gemini/GEMINI.md` | Concise routing preamble (~25 lines) for Gemini CLI |
| Create | `templates/opencode/opencode.json` | Base OpenCode config template |
| Create | `templates/cursor/professor.mdc` | YAML frontmatter only for Cursor rule |
| Delete | `templates/opencode/settings.json` | Obsolete; replaced by `opencode.json` |

---

## Chunk 1: Foundation — Template fix + shared utilities + Claude adapter

### Task 1: Sync `templates/claude/plugin.json` with root `plugin.json`

**Files:**
- Modify: `templates/claude/plugin.json`
- Reference: `plugin.json` (root, source of truth)

- [ ] **Step 1: Open both files and identify the diff**

  Root `plugin.json` has (template is missing these):
  - Commands: `professor:archive`, `professor:switch`, `professor:worktrees`
  - Agent: `researcher` entry
  - Hooks array: `PreCompact` hook

- [ ] **Step 2: Replace `templates/claude/plugin.json` with the synced version**

  ```json
  {
    "name": "professor",
    "version": "1.0.0",
    "description": "A Socratic learning plugin - teaches by asking questions instead of giving answers",
    "agents": [
      {
        "name": "professor",
        "file": "agents/professor.md"
      },
      {
        "name": "researcher",
        "file": "agents/researcher.md"
      }
    ],
    "commands": [
      { "name": "professor:new-topic",       "file": "commands/professor/new-topic.md" },
      { "name": "professor:next",            "file": "commands/professor/next.md" },
      { "name": "professor:done",            "file": "commands/professor/done.md" },
      { "name": "professor:review",          "file": "commands/professor/review.md" },
      { "name": "professor:hint",            "file": "commands/professor/hint.md" },
      { "name": "professor:stuck",           "file": "commands/professor/stuck.md" },
      { "name": "professor:syllabus",        "file": "commands/professor/syllabus.md" },
      { "name": "professor:progress",        "file": "commands/professor/progress.md" },
      { "name": "professor:discuss",         "file": "commands/professor/discuss.md" },
      { "name": "professor:quiz",            "file": "commands/professor/quiz.md" },
      { "name": "professor:capstone",        "file": "commands/professor/capstone.md" },
      { "name": "professor:capstone-review", "file": "commands/professor/capstone-review.md" },
      { "name": "professor:note",            "file": "commands/professor/note.md" },
      { "name": "professor:export",          "file": "commands/professor/export.md" },
      { "name": "professor:archive",         "file": "commands/professor/archive.md" },
      { "name": "professor:worktrees",       "file": "commands/professor/worktrees.md" },
      { "name": "professor:switch",          "file": "commands/professor/switch.md" }
    ],
    "hooks": [
      {
        "event": "PreCompact",
        "file": "hooks/pre-compact.js"
      }
    ]
  }
  ```

- [ ] **Step 3: Verify commands, agents, and hooks match root `plugin.json`**

  Note: `name` and `description` intentionally differ (`"course-learning-plugin"` vs `"professor"` — npm package vs plugin identity). Verify only the structural fields:

  ```bash
  diff <(jq -S '.commands,.agents,.hooks' plugin.json) <(jq -S '.commands,.agents,.hooks' templates/claude/plugin.json)
  ```
  Expected: no output (commands, agents, hooks are identical)

- [ ] **Step 4: Commit**

  ```bash
  git add templates/claude/plugin.json
  git commit -m "fix(claude): sync templates/claude/plugin.json with root plugin.json"
  ```

---

### Task 2: Create `bin/platforms/_shared.js`

**Files:**
- Create: `bin/platforms/_shared.js`

- [ ] **Step 1: Create `bin/platforms/` directory and write `_shared.js`**

  ```bash
  mkdir -p bin/platforms
  ```

  Write `bin/platforms/_shared.js`:

  ```js
  import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'fs';
  import { join, dirname } from 'path';
  import { fileURLToPath } from 'url';

  const __dirname = dirname(fileURLToPath(import.meta.url));

  // Maps platform name → tool substitutions.
  // null means: strip the AskUserQuestion call and replace with plain inline text.
  export const TOOL_SUBSTITUTIONS = {
    claude:   { AskUserQuestion: 'AskUserQuestion' },  // no-op
    gemini:   { AskUserQuestion: 'ask_user' },
    opencode: { AskUserQuestion: null },
    cursor:   { AskUserQuestion: null },
  };

  /**
   * Replace platform-specific tool call names in file content.
   *
   * Handles all three occurrence forms found in shared/ files:
   *   1. Backtick-wrapped:  `AskUserQuestion`
   *   2. Bare:              AskUserQuestion
   *
   * For null values (cursor, opencode), replaces with "ask the user directly in chat"
   * so instructions remain readable without referencing a non-existent tool.
   * For string values (gemini), replaces with the platform tool name (preserving backticks).
   */
  export function substituteTokens(content, platform) {
    const map = TOOL_SUBSTITUTIONS[platform];
    for (const [from, to] of Object.entries(map)) {
      if (to === null) {
        // Replace backtick-wrapped form first, then bare form
        content = content.replaceAll(`\`${from}\``, 'ask the user directly in chat');
        content = content.replaceAll(from, 'ask the user directly in chat');
      } else {
        // Replace backtick-wrapped form with backtick-wrapped replacement, then bare form
        content = content.replaceAll(`\`${from}\``, `\`${to}\``);
        content = content.replaceAll(from, to);
      }
    }
    return content;
  }

  /**
   * Recursively copy shared/ into targetDir, applying token substitution
   * to all .md and .js files.
   */
  export function copySharedFiles(targetDir, platform) {
    const sharedDir = join(__dirname, '..', '..', 'shared');
    _copyRecursive(sharedDir, targetDir, platform);
  }

  function _copyRecursive(src, dest, platform) {
    if (!existsSync(src)) return;
    const stat = statSync(src);
    if (stat.isDirectory()) {
      if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
      for (const file of readdirSync(src)) {
        _copyRecursive(join(src, file), join(dest, file), platform);
      }
    } else if (!existsSync(dest)) {
      let content = readFileSync(src, 'utf-8');
      if (src.endsWith('.md') || src.endsWith('.js')) {
        content = substituteTokens(content, platform);
      }
      writeFileSync(dest, content);
    }
  }
  ```

- [ ] **Step 2: Smoke-test the module loads without errors**

  ```bash
  node --input-type=module <<'EOF'
  import { TOOL_SUBSTITUTIONS, substituteTokens } from './bin/platforms/_shared.js';
  console.log('Platforms:', Object.keys(TOOL_SUBSTITUTIONS));
  // Backtick form
  const r1 = substituteTokens('Use `AskUserQuestion` to ask something.', 'gemini');
  console.assert(r1.includes('`ask_user`'), 'gemini backtick substitution failed');
  // Bare form
  const r2 = substituteTokens('Use AskUserQuestion to ask:', 'gemini');
  console.assert(r2.includes('ask_user') && !r2.includes('AskUserQuestion'), 'gemini bare substitution failed');
  // Null (cursor)
  const r3 = substituteTokens('Use `AskUserQuestion` to ask something. Use AskUserQuestion to confirm:', 'cursor');
  console.assert(!r3.includes('AskUserQuestion'), 'cursor null substitution missed occurrence');
  console.assert(r3.includes('ask the user directly in chat'), 'cursor null substitution wrong text');
  console.log('✅ _shared.js OK');
  EOF
  ```
  Expected: `Platforms: [ 'claude', 'gemini', 'opencode', 'cursor' ]` and `✅ _shared.js OK`

- [ ] **Step 3: Commit**

  ```bash
  git add bin/platforms/_shared.js
  git commit -m "feat(platforms): add shared token substitution utility"
  ```

---

### Task 3: Create `bin/platforms/claude.js`

**Files:**
- Create: `bin/platforms/claude.js`

- [ ] **Step 1: Write `bin/platforms/claude.js`**

  ```js
  import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
  import { join, dirname } from 'path';
  import { fileURLToPath } from 'url';
  import { copySharedFiles } from './_shared.js';

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const PLUGIN_DIR = join(__dirname, '..', '..');

  /** Returns true if Claude Code is present on this machine. */
  export function detect() {
    return !!(
      process.env.ANTHROPIC_API_KEY ||
      existsSync(join(process.env.HOME || '', '.claude'))
    );
  }

  /** Install professor plugin into .claude/ in the current working directory. */
  export async function install() {
    const targetDir = join(process.cwd(), '.claude');

    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
      console.log('✓ Created .claude/ directory');
    } else {
      console.log('⚠️  .claude/ already exists. Merging...');
    }

    // Copy templates/claude/ files (plugin.json, settings.json)
    const templateDir = join(PLUGIN_DIR, 'templates', 'claude');
    if (existsSync(templateDir)) {
      _copyTemplateDir(templateDir, targetDir);
    }

    // Copy shared/ files (agents/, commands/, hooks/, SKILL.md) with no-op substitution
    copySharedFiles(targetDir, 'claude');

    console.log(`
  ✅ Setup complete for Claude Code!

  Next steps:
  1. Restart Claude Code
  2. Run: professor:new-topic to start learning
    `.trim());
  }

  function _copyTemplateDir(src, dest, prefix = '') {
    for (const file of readdirSync(src)) {
      const srcPath = join(src, file);
      const destPath = join(dest, file);
      const label = prefix ? `${prefix}/${file}` : file;
      if (statSync(srcPath).isDirectory()) {
        if (!existsSync(destPath)) mkdirSync(destPath, { recursive: true });
        _copyTemplateDir(srcPath, destPath, label);  // recurse into subdirectories
      } else if (existsSync(destPath)) {
        console.log(`  ↔ ${label} (already exists)`);
      } else {
        writeFileSync(destPath, readFileSync(srcPath, 'utf-8'));
        console.log(`  + ${label}`);
      }
    }
  }
  ```

- [ ] **Step 2: Smoke-test detect() and install() dry run**

  ```bash
  node --input-type=module <<'EOF'
  import { detect } from './bin/platforms/claude.js';
  console.log('Claude detected:', detect());
  console.log('✅ claude.js loads OK');
  EOF
  ```
  Expected: `Claude detected: true` (since `~/.claude` exists) and no import errors.

- [ ] **Step 3: Commit**

  ```bash
  git add bin/platforms/claude.js
  git commit -m "feat(platforms): add Claude Code adapter"
  ```

---

## Chunk 2: Gemini + OpenCode adapters

### Task 4: Add `templates/gemini/GEMINI.md` routing preamble

**Files:**
- Create: `templates/gemini/GEMINI.md`

- [ ] **Step 1: Write `templates/gemini/GEMINI.md`**

  This is the routing preamble prepended before `shared/SKILL.md`. Keep it under 30 lines.

  ```markdown
  # Professor — Socratic Learning Assistant

  When the user types any `professor:*` command, or says "teach me X" / "I want to learn X" / "create a course for X", follow the professor skill below.

  ## Command Routing

  | Command | Behavior |
  |---|---|
  | `professor:new-topic` | Use `ask_user` to collect: topic, experience, goal. Research. Propose syllabus. Create `learning/{slug}/` worktree with COURSE.md + CAPSTONE.md + NOTES.md. |
  | `professor:next` | Read COURSE.md. Generate LECTURE.md for next ⬜ section. Mark 🔄. |
  | `professor:done` | Confirm understanding verbally. Mark ✅. Unlock capstone when all done. |
  | `professor:hint` | Layer 1 (conceptual) → Layer 2 (tool/pattern) → Layer 3 (pseudocode). Never skip. |
  | `professor:stuck` | Ask what they tried → exact sticking point → smaller steps → analogy. |
  | `professor:review` | What's working → Socratic question → one concept → next action. |
  | `professor:discuss` | Conceptual Q&A only. No code. |
  | `professor:quiz` | 5 questions matched to level. Socratic review of answers. |
  | `professor:syllabus` | Display COURSE.md. |
  | `professor:progress` | Completed / current / remaining + weak areas from COURSE.md. |
  | `professor:capstone` | Display CAPSTONE.md. |
  | `professor:capstone-review` | Full review only after all ✅. No code writing. |
  | `professor:note` | Save note to NOTES.md. |
  | `professor:archive` | Generate SUMMARY.md. Copy to .course_archive/. Remove worktree. |
  | `professor:switch` | Switch context to a different learning worktree. |
  | `professor:worktrees` | List active courses and their progress. |

  ---

  <!-- Full professor skill definition follows -->
  ```

- [ ] **Step 2: Verify the file is under 35 lines**

  ```bash
  wc -l templates/gemini/GEMINI.md
  ```
  Expected: ≤35

- [ ] **Step 3: Commit**

  ```bash
  git add templates/gemini/GEMINI.md
  git commit -m "feat(gemini): add GEMINI.md routing preamble template"
  ```

---

### Task 5: Create `bin/platforms/gemini.js`

**Files:**
- Create: `bin/platforms/gemini.js`

- [ ] **Step 1: Write `bin/platforms/gemini.js`**

  ```js
  import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
  import { join, dirname } from 'path';
  import { fileURLToPath } from 'url';
  import { substituteTokens } from './_shared.js';

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const PLUGIN_DIR = join(__dirname, '..', '..');

  /** Returns true if Gemini CLI is present on this machine. */
  export function detect() {
    return !!(
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      existsSync(join(process.env.HOME || '', '.gemini'))
    );
  }

  /** Install professor for Gemini CLI: writes .gemini/settings.json + GEMINI.md in cwd. */
  export async function install() {
    // 1. Create .gemini/ and write settings.json
    const geminiDir = join(process.cwd(), '.gemini');
    if (!existsSync(geminiDir)) {
      mkdirSync(geminiDir, { recursive: true });
      console.log('✓ Created .gemini/ directory');
    }

    const settingsSrc = join(PLUGIN_DIR, 'templates', 'gemini', 'settings.json');
    const settingsDest = join(geminiDir, 'settings.json');
    if (!existsSync(settingsDest) && existsSync(settingsSrc)) {
      writeFileSync(settingsDest, readFileSync(settingsSrc, 'utf-8'));
      console.log('  + .gemini/settings.json');
    } else if (existsSync(settingsDest)) {
      console.log('  ↔ .gemini/settings.json (already exists)');
    }

    // 2. Compile GEMINI.md from preamble + shared/SKILL.md, with ask_user substitution
    const preamblePath = join(PLUGIN_DIR, 'templates', 'gemini', 'GEMINI.md');
    const skillPath = join(PLUGIN_DIR, 'shared', 'SKILL.md');
    const preamble = existsSync(preamblePath) ? readFileSync(preamblePath, 'utf-8') : '';
    const skill = readFileSync(skillPath, 'utf-8');
    const professorBlock =
      `<!-- professor:start -->\n${preamble}\n${skill}\n<!-- professor:end -->`;
    const adapted = substituteTokens(professorBlock, 'gemini');

    const geminiMdPath = join(process.cwd(), 'GEMINI.md');
    if (existsSync(geminiMdPath)) {
      const existing = readFileSync(geminiMdPath, 'utf-8');
      if (existing.includes('<!-- professor:start -->')) {
        console.log('  ↔ GEMINI.md (professor block already present, skipping)');
      } else {
        writeFileSync(geminiMdPath, existing + '\n\n' + adapted);
        console.log('  + GEMINI.md (professor block appended to existing file)');
      }
    } else {
      writeFileSync(geminiMdPath, adapted);
      console.log('  + GEMINI.md');
    }

    console.log(`
  ✅ Setup complete for Gemini CLI!

  Next steps:
  1. Restart Gemini
  2. Type: professor:new-topic to start learning
    `.trim());
  }
  ```

- [ ] **Step 2: Smoke-test detect() loads**

  ```bash
  node --input-type=module <<'EOF'
  import { detect } from './bin/platforms/gemini.js';
  console.log('Gemini detected:', detect());
  console.log('✅ gemini.js loads OK');
  EOF
  ```
  Expected: no import errors, boolean logged.

- [ ] **Step 3: Integration test — run install() in a temp directory**

  ```bash
  mkdir -p /tmp/professor-gemini-test && cd /tmp/professor-gemini-test && \
  node --input-type=module <<'EOF'
  import { install } from '/Users/tuankhuat/Documents/Pet-Projects/course-learning-plugin/bin/platforms/gemini.js';
  await install();
  EOF
  ```
  Expected:
  - `.gemini/settings.json` created
  - `GEMINI.md` created containing `<!-- professor:start -->` and `ask_user` (not `AskUserQuestion`)

  Verify:
  ```bash
  ls /tmp/professor-gemini-test/.gemini/
  grep -c 'ask_user' /tmp/professor-gemini-test/GEMINI.md
  grep -c 'AskUserQuestion' /tmp/professor-gemini-test/GEMINI.md
  ```
  Expected: `settings.json` present; `ask_user` count > 0; `AskUserQuestion` count = 0

- [ ] **Step 4: Cleanup temp dir and commit**

  ```bash
  rm -rf /tmp/professor-gemini-test
  git add bin/platforms/gemini.js
  git commit -m "feat(platforms): add Gemini CLI adapter"
  ```

---

### Task 6: Add OpenCode templates and create `bin/platforms/opencode.js`

**Files:**
- Create: `templates/opencode/opencode.json`
- Create: `bin/platforms/opencode.js`
- Delete: `templates/opencode/settings.json`

- [ ] **Step 1: Write `templates/opencode/opencode.json`**

  ```json
  {
    "$schema": "https://opencode.ai/config.json",
    "instructions": [".opencode/professor.md"]
  }
  ```

- [ ] **Step 2: Delete the obsolete `templates/opencode/settings.json`**

  ```bash
  git rm templates/opencode/settings.json
  ```

- [ ] **Step 3: Write `bin/platforms/opencode.js`**

  ```js
  import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
  import { join, dirname } from 'path';
  import { fileURLToPath } from 'url';
  import { substituteTokens } from './_shared.js';

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const PLUGIN_DIR = join(__dirname, '..', '..');

  /** Returns true if an OpenCode project is present in cwd. */
  export function detect() {
    return (
      existsSync(join(process.cwd(), '.opencode')) ||
      existsSync(join(process.cwd(), 'opencode.json'))
    );
  }

  /** Install professor for OpenCode: writes .opencode/professor.md + merges opencode.json. */
  export async function install() {
    const targetDir = join(process.cwd(), '.opencode');
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
      console.log('✓ Created .opencode/ directory');
    }

    // 1. Write .opencode/professor.md with null substitution (inline text questions)
    const professorMdPath = join(targetDir, 'professor.md');
    if (!existsSync(professorMdPath)) {
      const skill = readFileSync(join(PLUGIN_DIR, 'shared', 'SKILL.md'), 'utf-8');
      const adapted = substituteTokens(skill, 'opencode');
      writeFileSync(professorMdPath, adapted);
      console.log('  + .opencode/professor.md');
    } else {
      console.log('  ↔ .opencode/professor.md (already exists)');
    }

    // 2. Read or create .opencode/opencode.json and merge instructions entry
    const opencodeJsonPath = join(targetDir, 'opencode.json');
    let config = {};
    if (existsSync(opencodeJsonPath)) {
      try { config = JSON.parse(readFileSync(opencodeJsonPath, 'utf-8')); } catch {}
    } else {
      const templatePath = join(PLUGIN_DIR, 'templates', 'opencode', 'opencode.json');
      if (existsSync(templatePath)) {
        try { config = JSON.parse(readFileSync(templatePath, 'utf-8')); } catch {}
      }
    }

    if (!config.$schema) config.$schema = 'https://opencode.ai/config.json';
    if (!Array.isArray(config.instructions)) config.instructions = [];
    if (!config.instructions.includes('.opencode/professor.md')) {
      config.instructions.push('.opencode/professor.md');
    }

    writeFileSync(opencodeJsonPath, JSON.stringify(config, null, 2) + '\n');
    console.log('  + .opencode/opencode.json');

    console.log(`
  ✅ Setup complete for OpenCode!

  Next steps:
  1. Restart OpenCode
  2. Type: professor:new-topic to start learning
    `.trim());
  }
  ```

- [ ] **Step 4: Smoke-test detect() and integration test**

  ```bash
  node --input-type=module <<'EOF'
  import { detect } from './bin/platforms/opencode.js';
  console.log('OpenCode detected (cwd):', detect());
  console.log('✅ opencode.js loads OK');
  EOF
  ```
  Expected: `OpenCode detected (cwd): true` (since `.opencode/` exists in cwd) and no import errors.

  Integration test in temp dir:
  ```bash
  mkdir -p /tmp/professor-opencode-test && cd /tmp/professor-opencode-test && git init && \
  node --input-type=module <<'EOF'
  import { install } from '/Users/tuankhuat/Documents/Pet-Projects/course-learning-plugin/bin/platforms/opencode.js';
  await install();
  EOF
  ```
  Verify:
  ```bash
  cat /tmp/professor-opencode-test/.opencode/opencode.json
  grep -c 'AskUserQuestion' /tmp/professor-opencode-test/.opencode/professor.md
  grep -c 'Ask the user directly' /tmp/professor-opencode-test/.opencode/professor.md
  ```
  Expected: `opencode.json` has `"instructions": [".opencode/professor.md"]`; `AskUserQuestion` count = 0; inline text count > 0.

- [ ] **Step 5: Cleanup and commit**

  ```bash
  rm -rf /tmp/professor-opencode-test
  git add templates/opencode/opencode.json bin/platforms/opencode.js
  git commit -m "feat(platforms): add OpenCode adapter and template; remove obsolete settings.json"
  ```

---

## Chunk 3: Cursor adapter + cli.js refactor + cleanup

### Task 7: Add Cursor template and create `bin/platforms/cursor.js`

**Files:**
- Create: `templates/cursor/professor.mdc`
- Create: `bin/platforms/cursor.js`

- [ ] **Step 1: Write `templates/cursor/professor.mdc`**

  Frontmatter only — the SKILL.md body is appended at install time.

  ```
  ---
  description: Socratic learning assistant - professor mode
  globs: ""
  alwaysApply: false
  ---
  ```

- [ ] **Step 2: Write `bin/platforms/cursor.js`**

  ```js
  import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
  import { join, dirname } from 'path';
  import { fileURLToPath } from 'url';
  import { substituteTokens } from './_shared.js';

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const PLUGIN_DIR = join(__dirname, '..', '..');

  /** Returns true if a Cursor project is present in cwd. */
  export function detect() {
    return existsSync(join(process.cwd(), '.cursor'));
  }

  /** Install professor for Cursor: writes .cursor/rules/professor.mdc. */
  export async function install() {
    const rulesDir = join(process.cwd(), '.cursor', 'rules');
    if (!existsSync(rulesDir)) {
      mkdirSync(rulesDir, { recursive: true });
      console.log('✓ Created .cursor/rules/ directory');
    }

    const mdcPath = join(rulesDir, 'professor.mdc');
    if (existsSync(mdcPath)) {
      console.log('  ↔ .cursor/rules/professor.mdc (already exists)');
    } else {
      const frontmatterPath = join(PLUGIN_DIR, 'templates', 'cursor', 'professor.mdc');
      const frontmatter = existsSync(frontmatterPath)
        ? readFileSync(frontmatterPath, 'utf-8')
        : '---\ndescription: Socratic learning assistant - professor mode\nglobs: ""\nalwaysApply: false\n---\n';
      const skill = readFileSync(join(PLUGIN_DIR, 'shared', 'SKILL.md'), 'utf-8');
      const combined = frontmatter + '\n' + skill;
      const adapted = substituteTokens(combined, 'cursor');
      writeFileSync(mdcPath, adapted);
      console.log('  + .cursor/rules/professor.mdc');
    }

    console.log(`
  ✅ Setup complete for Cursor!

  Next steps:
  1. Restart Cursor
  2. Type in chat: professor:new-topic to start learning
    `.trim());
  }
  ```

- [ ] **Step 3: Integration test in temp dir**

  ```bash
  mkdir -p /tmp/professor-cursor-test/.cursor && \
  node --input-type=module <<'EOF'
  process.chdir('/tmp/professor-cursor-test');
  import { install } from '/Users/tuankhuat/Documents/Pet-Projects/course-learning-plugin/bin/platforms/cursor.js';
  await install();
  EOF
  ```
  Verify:
  ```bash
  ls /tmp/professor-cursor-test/.cursor/rules/
  grep -c 'AskUserQuestion' /tmp/professor-cursor-test/.cursor/rules/professor.mdc
  grep -c 'Ask the user directly' /tmp/professor-cursor-test/.cursor/rules/professor.mdc
  head -5 /tmp/professor-cursor-test/.cursor/rules/professor.mdc
  ```
  Expected: `professor.mdc` present; `AskUserQuestion` count = 0; inline text count > 0; first line is `---` (frontmatter).

- [ ] **Step 4: Cleanup and commit**

  ```bash
  rm -rf /tmp/professor-cursor-test
  git add templates/cursor/professor.mdc bin/platforms/cursor.js
  git commit -m "feat(platforms): add Cursor adapter and .mdc template"
  ```

---

### Task 8: Refactor `bin/cli.js` to thin dispatcher

**Files:**
- Modify: `bin/cli.js`

This is the wiring task. Replace `detectAgent()` and `setupAgent()` with adapter-delegating versions. Keep the `web` command, `printBanner`, `printUsage`, `listAgents`, `promptAgentSelection`, `askQuestion`, and `init` functions intact — only the two functions and the `SUPPORTED_AGENTS` constant change.

- [ ] **Step 1: Update `SUPPORTED_AGENTS` constant (line 9)**

  Change:
  ```js
  const SUPPORTED_AGENTS = ['claude', 'opencode', 'gemini', 'agent', 'cursor', 'researcher'];
  ```
  To:
  ```js
  const SUPPORTED_AGENTS = ['claude', 'gemini', 'opencode', 'cursor'];
  ```

- [ ] **Step 2: Replace `detectAgent()` (lines 11–25)**

  Remove the entire old `detectAgent` function and replace with:
  ```js
  async function detectAgent() {
    const detected = [];
    for (const name of SUPPORTED_AGENTS) {
      const { detect } = await import(`./platforms/${name}.js`);
      if (detect()) detected.push(name);
    }
    return detected;
  }
  ```

- [ ] **Step 3: Replace `setupAgent(agent)` (lines 70–157)**

  Remove the entire old `setupAgent` function and replace with:
  ```js
  async function setupAgent(agent) {
    const agentLower = agent.toLowerCase();
    if (!SUPPORTED_AGENTS.includes(agentLower)) {
      console.error(`❌ Unsupported agent: ${agent}`);
      console.log(`Supported: ${SUPPORTED_AGENTS.join(', ')}`);
      process.exit(1);
    }
    const { install } = await import(`./platforms/${agentLower}.js`);
    await install();
  }
  ```

- [ ] **Step 4: Smoke-test all four setup commands from the repo root**

  ```bash
  # Claude
  node bin/cli.js setup claude 2>&1 | head -5

  # Gemini (will write GEMINI.md to cwd — safe to do in repo root, it's gitignored)
  node bin/cli.js setup gemini 2>&1 | head -5

  # OpenCode (already has .opencode/ in cwd)
  node bin/cli.js setup opencode 2>&1 | head -5

  # Cursor (will create .cursor/rules/ if needed)
  node bin/cli.js setup cursor 2>&1 | head -5
  ```
  Expected: each prints `✅ Setup complete for [Platform]!` with no import errors.

- [ ] **Step 5: Smoke-test `init` auto-detection**

  ```bash
  node bin/cli.js init 2>&1 | head -10
  ```
  Expected: detects `claude` (via `~/.claude`) and possibly `opencode`/`cursor` (since `.opencode/` and `.cursor/` exist in cwd). No `CLAUDE_API_KEY` references.

- [ ] **Step 6: Verify `list` and `help` still work**

  ```bash
  node bin/cli.js list
  node bin/cli.js help
  ```
  Expected: shows the 4 correct platform names (`claude`, `gemini`, `opencode`, `cursor`); no `agent` or `researcher`.

- [ ] **Step 7: Commit**

  ```bash
  git add bin/cli.js
  git commit -m "refactor(cli): delegate detect/install to platform adapters; fix detection env vars"
  ```

---

### Task 9: Final verification

- [ ] **Step 1: Verify no `AskUserQuestion` leaks into gemini/opencode/cursor output files**

  After running setup in temp dirs (Tasks 5, 6, 7), or re-run now:
  ```bash
  # Quick check on the adapter source files themselves
  grep -r 'AskUserQuestion' bin/platforms/gemini.js bin/platforms/opencode.js bin/platforms/cursor.js
  ```
  Expected: no matches (the adapters don't hardcode the tool name; substitution is done at install time via `_shared.js`).

- [ ] **Step 2: Verify `templates/claude/plugin.json` matches `plugin.json`**

  ```bash
  diff <(jq -S . plugin.json) <(jq -S . templates/claude/plugin.json)
  ```
  Expected: no output (files are identical when sorted).

- [ ] **Step 3: Verify `templates/opencode/settings.json` is gone**

  ```bash
  ls templates/opencode/
  ```
  Expected: only `opencode.json` present; no `settings.json`.

- [ ] **Step 4: Final commit if any loose files**

  ```bash
  git status
  # If clean: done
  # If dirty: git add -A && git commit -m "chore: final cleanup for cli multiplatform fix"
  ```
