# AGENTS.md — Course Learning Plugin Developer Guide

This file provides guidance for AI agents operating in this repository.

## Project Overview

**Course Learning Plugin ("Professor")** — a multi-platform Socratic learning assistant. Ships as a Claude Code plugin, npx CLI, and optional web UI. The core (agents, commands, hooks) has no build step — Markdown files read directly by the agent.

---

## Build, Lint, and Test Commands

```bash
# No build step for core plugin — Markdown files are read directly

# Install dependencies
npm install

# Run all tests
npm test

# Run a single test file (Vitest)
npx vitest run test/cli.test.js

# Run tests in watch mode
npx vitest

# CLI tool
node bin/cli.js --help              # Show CLI help
node bin/cli.js list                # List supported agents
node bin/cli.js setup <agent>       # Setup for specific agent
node bin/cli.js init                # Auto-detect and setup

# Web UI (optional)
npm run build                       # Build React client
npm start                           # Start Express server on :3000
cd web/client && npm run dev       # Vite dev server
```

---

## Code Style Guidelines

### General Principles

- **No build step**: Keep all code simple and interpretable
- **Cross-agent compatibility**: Works with Claude Code, OpenCode, Gemini CLI, Cursor
- **Minimal dependencies**: Only add external deps when necessary (chalk, inquirer, ora)

### Module System

- ES modules (`import`/`export`) for `.js` files with `"type": "module"` in package.json
- CommonJS (`require`/`module.exports`) only for hooks loaded by older runtimes (e.g., `hooks/pre-compact.js`)

```javascript
// ES Modules (bin/cli.js, bin/registry-helpers.js)
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

// CommonJS (hooks/pre-compact.js)
const fs = require('fs');
const path = require('path');
```

### File Naming

| Type | Format | Example |
|------|--------|---------|
| Files | kebab-case | `pre-compact.js`, `registry-helpers.js` |
| Functions/variables | camelCase | `validateItemName`, `fetchRegistryIndex` |
| Constants | UPPER_SNAKE_CASE | `SUPPORTED_AGENTS` |
| Commands | `professor:<action>` | `professor:new-topic` |
| Course dirs | kebab-case slugs | `courses/javascript-fundamentals/` |
| Course files | UPPER_SNAKE_CASE | `COURSE.md`, `LECTURE.md` |

### Formatting

- 2 spaces for indentation
- Maximum line length: 100 characters
- Use semicolons consistently
- Spaces around operators: `const x = y + z`

### JSDoc Comments

Use JSDoc for all exported functions:

```javascript
/**
 * Fetch raw text from the registry.
 * @param {string} url
 * @param {{ optional?: boolean }} opts
 * @returns {Promise<string|null>}
 */
export async function fetchRegistryText(url, { optional = false } = {}) { ... }
```

### Error Handling

- Always wrap file system operations in try-catch
- Use `process.exit(1)` for errors, `process.exit(0)` for success
- Provide informative error messages with `console.error(style('error', '...'))`

```javascript
try {
  const content = fs.readFileSync(filePath, 'utf-8');
  return content;
} catch (err) {
  console.error(`Warning: Could not read ${filePath}: ${err.message}`);
  return null;
}
```

### Path Handling

- Always use `path.join()` for cross-platform compatibility
- Use `fileURLToPath(import.meta.url)` + `dirname` for `__dirname` in ES modules

```javascript
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = join(process.cwd(), '.config', 'settings.json');
```

---

## Testing Guidelines (Vitest)

- Place tests in `test/*.test.js`
- Use Vitest with Node environment
- Mock external dependencies (inquirer, ora, https)
- Use `beforeEach`/`afterEach` for setup/teardown
- Mock `process.exit` to prevent test termination
- Use temp directories for file system tests
- Test both success and error paths

```javascript
vi.mock('inquirer', () => ({
  default: { prompt: vi.fn() },
}));
```

---

## Git Workflow

```bash
# Conventional commits
git commit -m "feat: add researcher agent delegation"
git commit -m "fix: handle missing registry gracefully"
git commit -m "docs: update command reference"

# Commit types: feat, fix, docs, chore, refactor
```

---

## Directory Structure

```
course-learning-plugin/
├── bin/                    # CLI entry point and helpers (ES modules)
├── commands/professor/     # Command definitions (Markdown)
├── agents/                 # Agent definitions (Markdown)
├── hooks/                  # Hook scripts (CommonJS for compatibility)
│   └── pre-compact.js      # PreCompact hook
├── templates/              # Per-agent setup templates
├── shared/                 # Platform-neutral canonical files
├── test/                   # Test files (Vitest)
│   └── cli.test.js
├── web/                    # Express + React web UI (optional)
├── learning/               # Git worktrees per course (primary)
├── courses/                # Legacy course storage
└── plugin.json             # Plugin manifest
```

---

## Platform-Specific Rules

### Cursor Rules
Cursor-specific rules are defined in `.cursor/rules/professor.mdc`. When working in Cursor, apply the Professor skill rules from that file.

### Claude Code / OpenCode / Gemini CLI
The core plugin works natively. Install with:
```bash
node bin/cli.js init          # Auto-detect platform
node bin/cli.js setup claude  # Explicit setup
```

---

## Core Behavior Rules (Professor Teaching Agent)

These must never be violated:

1. **Never write working code** for the user — not in review, hint, discuss, or anywhere
2. **Never complete exercises** on the user's behalf
3. **During capstone phase**: no hints, no `profesor:stuck`, no code nudges
4. **Always read `COURSE.md` first** at conversation start (check `learning/` before `courses/`)
5. **Always update `COURSE.md`** immediately when section status changes
6. **LECTURE.md is disposable** — overwritten by each `profesor:next`
7. **CAPSTONE.md is immutable** — never edit after creation

### Course Storage Locations
- **Primary**: `learning/{slug}/` (git worktrees with branch `learning/{slug}`)
- **Legacy**: `courses/{slug}/`
- **Archived**: `.course_archive/{slug}/`

### Course Files
Each course contains:
- `COURSE.md` — syllabus + progress tracker (single source of truth)
- `LECTURE.md` — current active section (disposable)
- `CAPSTONE.md` — project brief (immutable)
- `NOTES.md` — learner notes
