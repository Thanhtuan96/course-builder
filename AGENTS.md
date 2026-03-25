# AGENTS.md — Course Learning Plugin Developer Guide

This file provides guidance for AI agents operating in this repository.

## Project Overview

Course Learning Plugin ("Professor") is a Claude Code plugin that implements a Socratic learning assistant. It teaches by asking questions instead of giving answers. The plugin has no build step, no package manager, and minimal JavaScript—all components are Markdown files read directly by Claude Code.

---

## Build, Lint, and Test Commands

```bash
# No build step — Markdown files are read directly by Claude Code

# Install dependencies (for CLI tool)
npm install

# Run all tests
npm test

# Run a single test file
npx vitest run test/cli.test.js

# Run tests in watch mode
npx vitest

# CLI tool (bin/cli.js)
node bin/cli.js --help              # Show CLI help
node bin/cli.js list                # List supported agents
node bin/cli.js setup <agent>      # Setup for specific agent
node bin/cli.js init                # Auto-detect and setup

# Web UI
npm run build                       # Build web client (requires web/client/)
npm run start                       # Start web server
```

---

## Code Style Guidelines

### General Principles

- **No build step**: Keep all code simple and interpretable
- **Cross-agent compatibility**: Code should work with Claude Code, OpenCode, Gemini CLI, Cursor
- **Minimal dependencies**: Only add external deps when necessary (e.g., chalk, inquirer, ora)

### Module System

- Use ES modules (`import`/`export`) for `.js` files with `"type": "module"` in package.json
- Use CommonJS (`require`/`module.exports`) only for hooks loaded by older runtimes (e.g., `hooks/pre-compact.js`)

```javascript
// ES Modules (bin/cli.js, bin/registry-helpers.js)
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

// CommonJS (hooks/pre-compact.js)
const fs = require('fs');
const path = require('path');
```

### File Naming

- **Files**: kebab-case (`pre-compact.js`, `registry-helpers.js`)
- **Functions/variables**: camelCase (`validateItemName`, `fetchRegistryIndex`)
- **Constants**: UPPER_SNAKE_CASE for truly immutable values

### Formatting

- 2 spaces for indentation
- Maximum line length: 100 characters
- Use semicolons consistently
- Spaces around operators: `const x = y + z`

### JSDoc Comments

Use JSDoc for all exported functions to improve readability and IDE support:

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

## Markdown Conventions (Commands and Agents)

### File Structure

- One Markdown file per command in `commands/professor/`
- Agent definitions in `agents/` directory
- Use YAML frontmatter for metadata

### Naming Conventions

| Type | Format | Example |
|------|--------|---------|
| Commands | `professor:<action>` | `professor:new-topic` |
| Agents | lowercase with hyphens | `researcher`, `professor` |
| Course dirs | kebab-case slugs | `courses/javascript-fundamentals/` |
| Course files | UPPER_SNAKE_CASE | `COURSE.md`, `LECTURE.md` |

---

## Testing Guidelines

### Test Structure (Vitest)

- Place tests in `test/*.test.js`
- Use Vitest with Node environment
- Mock external dependencies (inquirer, ora, https)

```javascript
// Mock example
vi.mock('inquirer', () => ({
  default: { prompt: vi.fn() },
}));
```

### Test Patterns

- Use `beforeEach`/`afterEach` for setup/teardown
- Mock `process.exit` to prevent test termination
- Use temp directories for file system tests
- Test both success and error paths

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

## Plugin Structure (plugin.json)

When adding new components, register them in `plugin.json`:

```json
{
  "agents": [{ "name": "professor", "file": "agents/professor.md" }],
  "commands": [{ "name": "professor:new-topic", "file": "commands/professor/new-topic.md" }],
  "hooks": [{ "event": "PreCompact", "file": "hooks/pre-compact.js" }]
}
```

---

## GSD Workflow (Optional)

This project supports the get-shit-done workflow for larger features. Use GSD when:

- User explicitly asks for GSD or uses a `gsd-*` command
- A feature requires multiple phases of work

Key commands:
- `/gsd-new-project` — Create a new project roadmap
- `/gsd-plan-phase` — Plan the next phase
- `/gsd-execute` — Execute planned tasks

Do NOT apply GSD workflows unless the user explicitly asks for them.

---

## Directory Structure

```
course-learning-plugin/
├── bin/                    # CLI entry point and helpers
│   ├── cli.js              # Main CLI (ES modules)
│   └── registry-helpers.js # Registry functions (ES modules, testable)
├── commands/professor/     # Command definitions (Markdown)
├── agents/                 # Agent definitions (Markdown)
├── hooks/                 # Hook scripts (CommonJS for compatibility)
│   └── pre-compact.js      # Pre-compact hook
├── templates/              # Per-agent templates
├── shared/                 # Shared files for all agents
├── test/                   # Test files
│   └── cli.test.js         # CLI tests (Vitest)
├── web/                    # Web UI (optional)
├── courses/                # User course files (runtime)
├── .claude/                # GSD workflows and agents
├── .agents/                # gstack skills
└── plugin.json             # Plugin manifest
```

---

## Core Behavior Rules (Professor Skill)

These rules are for the Professor teaching agent and must never be violated:

1. **Never write working code** for the user — not in review, hint, discuss, or anywhere
2. **Never complete exercises** on the user's behalf
3. **During capstone phase**: no hints, no `profesor:stuck`, no code nudges
4. **Always read `COURSE.md` first** at conversation start to restore context
5. **Always update `COURSE.md`** immediately when section status changes
6. **LECTURE.md is disposable** — overwritten by each `profesor:next`
7. **CAPSTONE.md is immutable** — never edit after creation
