# AGENTS.md - Developer Guide for Course Learning Plugin

This file provides guidance for AI agents operating in this repository.

## Project Overview

Course Learning Plugin ("Professor") is a Claude Code plugin that implements a Socratic learning assistant. It teaches by asking questions instead of giving answers. The plugin has no build step, no package manager, and no test runner—all components are Markdown files read directly by Claude Code.

## Build, Lint, and Test Commands

This project is primarily a Markdown-based plugin with minimal JavaScript:

```bash
# No build step required - Markdown files are read directly by Claude Code

# For the CLI tool (bin/cli.js):
node bin/cli.js --help              # Show CLI help
node bin/cli.js list                # List supported agents
node bin/cli.js setup <agent>      # Setup for specific agent
node bin/cli.js init                # Auto-detect and setup

# No linting configured (project uses plain JavaScript with no linter)
# No tests configured (Markdown-based plugin, no test runner)

# If you add Node.js code that needs testing:
# npm init -y                       # Initialize package.json for tests
# npm install --save-dev jest       # Add Jest for testing
# npx jest                          # Run all tests
# npx jest --testPathPattern=xxx    # Run specific test file
```

## Code Style Guidelines

### General Principles

- **No build step**: Keep all code simple and interpretable
- **No external dependencies** in main plugin code except where necessary
- **Cross-agent compatibility**: Code should work with Claude Code, OpenCode, Gemini CLI

### JavaScript Conventions

#### Module System

- Use ES modules (`import`/`export`) for `.mjs` files or files with `"type": "module"` in package.json
- Use CommonJS (`require`/`module.exports`) for files that may be loaded by older runtimes
- `bin/cli.js` uses ES modules with `import` statements
- `hooks/pre-compact.js` uses CommonJS for broader compatibility

```javascript
// ES Modules (bin/cli.js)
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

// CommonJS (hooks/pre-compact.js)
const fs = require('fs');
const path = require('path');
```

#### File Naming

- Use kebab-case for file names: `pre-compact.js`, `cli.js`
- Use PascalCase for class names (if applicable)
- Use camelCase for function and variable names

#### Formatting

- Use 2 spaces for indentation
- Maximum line length: 100 characters
- Use semicolons consistently
- Add spaces around operators: `const x = y + z` not `const x=y+z`

#### Error Handling

```javascript
// Always wrap file system operations in try-catch
function readCourseFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return content;
  } catch (err) {
    console.warn(`Warning: Could not read ${filePath}: ${err.message}`);
    return null;
  }
}

// Use appropriate exit codes
process.exit(1);  // Error
process.exit(0); // Success
```

#### Path Handling

```javascript
// Always use path.join() for cross-platform compatibility
import { join } from 'path';
const configPath = join(process.cwd(), '.config', 'settings.json');

// Use __dirname for relative paths in ES modules
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
```

### Markdown Conventions (Commands and Agents)

#### File Structure

- One Markdown file per command in `commands/professor/`
- Agent definitions in `agents/` directory
- Use frontmatter for metadata

```markdown
---
description: Brief command description
---

# Command Name

## Behavior

Detailed behavior description...

## Examples

- `professor:command` - What it does
```

#### Content Style

- Use Socratic method: ask questions, don't give answers
- Be encouraging and supportive in tone
- Include practical examples
- Keep sections focused and concise

### Naming Conventions

- **Commands**: `professor:<action>` format (e.g., `professor:new-topic`)
- **Agents**: Descriptive lowercase with hyphens (e.g., `researcher`)
- **Course directories**: kebab-case slugs (e.g., `courses/javascript-fundamentals/`)
- **Files in courses**: UPPER_SNAKE_CASE for constants (COURSE.md, LECTURE.md)

### Git Workflow

```bash
# Commit messages should be descriptive
git commit -m "feat: add researcher agent delegation"

# Use conventional commits:
# feat:     New feature
# fix:      Bug fix
# docs:     Documentation changes
# chore:    Maintenance tasks
# refactor: Code restructuring
```

### Plugin.json Structure

When modifying `plugin.json`, always register new components:

```json
{
  "agents": [
    { "name": "professor", "file": "agents/professor.md" }
  ],
  "commands": [
    { "name": "professor:new-topic", "file": "commands/professor/new-topic.md" }
  ],
  "hooks": [
    { "name": "pre-compact", "file": "hooks/pre-compact.js" }
  ]
}
```

### Core Behavior Rules (Never Violate)

1. **Never write working code** for the user — not in review, hint, discuss, or anywhere
2. **Never complete exercises** on the user's behalf under any circumstances
3. **During capstone phase**: no hints, no `professor:stuck`, no code nudges
4. **Always read `COURSE.md` first** at conversation start to restore context
5. **Always update `COURSE.md` immediately** when section status changes
6. **LECTURE.md is disposable** — overwritten by each `professor:next`
7. **CAPSTONE.md is immutable** — never edit after creation

### Adding New Features

1. Create command file in `commands/professor/<command-name>.md`
2. Register in `plugin.json` under `commands[]`
3. Update CLAUDE.md with new command documentation
4. Add CLI support if needed in `bin/cli.js`

### Directory Structure

```
course-learning-plugin/
├── agents/                  # Agent definitions (Markdown)
├── commands/professor/     # Command definitions (Markdown)
├── hooks/                  # Hook scripts (JavaScript)
├── bin/cli.js              # CLI entry point
├── templates/              # Per-agent templates
├── shared/                 # Shared files for all agents
├── courses/                # User course files (created at runtime)
├── .planning/              # GSD planning docs
└── plugin.json             # Plugin manifest
```
