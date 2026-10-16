# Professor — A Socratic Learning Plugin for AI Coding Agents

A plugin that teaches you to code by asking questions instead of giving answers. Works with **Claude Code**, **Cursor**, **Gemini CLI**, and **OpenCode**.

---

## What Is This?

Most AI coding assistants will write code for you the moment you ask. Professor does the opposite. It is built on the Socratic method: rather than handing you a solution, the professor asks questions that help you reason through the problem yourself. You think, you try, you make mistakes, and you learn.

**Key differentiators:**

- **Socratic by design** — never gives answers; guides through questions
- **4 levels** — Beginner, Intermediate, Advanced, Expert
- **Git worktrees** — each course on its own branch, isolated from your project code
- **Spaced repetition** — flashcard drills keep knowledge from fading
- **Multi-agent system** — 5 specialized agents (Professor, Coach, Spotter, Navigator, Researcher)
- **Skill registry** — install community skills earned by other learners

---

## Requirements

- **AI agent** — Claude Code, Gemini CLI, OpenCode, or Cursor.
- **Node.js** — **18+** for setup and the registry commands; **22.5+** for Professor Studio, `review`
  and `import` (they use the built-in `node:sqlite` module). Check with `npx course-professor doctor`.
- **Git** — required for git worktree-based courses.
- **Notion or Obsidian** — only needed if you want to use the `professor:export` command. See setup sections below.

---

## Install

### Option 1: Using npx (Recommended)

```bash
npx course-professor init
```

Auto-detects your agent and sets up the plugin. Or specify manually:

```bash
npx course-professor setup claude    # Claude Code
npx course-professor setup cursor    # Cursor
npx course-professor setup opencode  # OpenCode
npx course-professor setup gemini    # Gemini CLI
```

To try the **Professor Studio beta** (v1.6, published on the `next` dist-tag):

```bash
npx course-professor@next studio     # starts the local server + Studio and pairs them
```

Studio needs **Node 22.5+**. `npx` always runs the latest published version, so no install step is
required — see [Upgrade & uninstall](#upgrade--uninstall) to manage a global install instead.

### Upgrade & uninstall

```bash
npx course-professor@latest --version   # run the newest stable without installing
npm i -g course-professor@latest        # install/upgrade globally
npm i -g course-professor@next          # install the Studio beta
npm uninstall -g course-professor       # remove a global install
```

Your courses (`learning/`, `courses/`) and Studio's database (`~/.professor/professor.db`) live
outside the package and are **not** removed on uninstall — delete them manually if you want a clean
slate. `npx` users can clear the cached package with `npm cache clean --force`.

### Option 2: Manual Install

1. **Clone the repo:**

   ```bash
   git clone https://github.com/professor-skills/course-learning-plugin.git
   ```

2. **Create the plugins directory** (if it does not exist):

   ```bash
   mkdir -p ~/.claude/plugins
   ```

3. **Symlink the repo into the plugins directory:**

   ```bash
   ln -s "$(pwd)/course-learning-plugin" ~/.claude/plugins/professor
   ```

4. **Restart your AI agent** to reload plugins. The `professor:*` commands will be available in your next session.

---

## Agents

Professor uses a team of 5 specialized agents. Each has a distinct role:

| Agent | Commands | Role |
|---|---|---|
| **Professor** | Orchestrates everything | Main Socratic mentor — teaches by asking questions |
| **Coach** | `professor:review`, `professor:done`, `professor:stuck` | Self-assessment dialogue — starts every interaction by asking what you think |
| **Spotter** | `professor:spotter` | Mid-work check-ins — catches confusion before it compounds |
| **Navigator** | `professor:navigator`, `professor:progress` | Section bridges — shows how concepts connect across the course |
| **Researcher** | `professor:next` (assists) | Web research before lecture generation — keeps content current |

You interact with Professor directly; it routes specialized commands to the right agent automatically.

---

## Notion MCP Setup

Only needed if you want to export your notes and progress to Notion using `professor:export`.

**Step 1: Create a Notion integration**

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Click "New integration"
3. Give it a name (e.g., "Professor Plugin"), click Submit
4. Copy the **Internal Integration Token** shown on the integration page

**Step 2: Share your target page with the integration**

1. Open the Notion page where you want exports to appear
2. Click the `...` menu → **Connections** → find your integration and connect it

**Step 3: Add the MCP config**

Create or edit `.mcp.json` in your project root (or `~/.claude/settings.json` under `"mcpServers"` depending on your Claude Code version):

```json
{
  "mcpServers": {
    "notion": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-notion"],
      "env": {
        "NOTION_API_TOKEN": "your-notion-integration-token-here"
      }
    }
  }
}
```

Replace `your-notion-integration-token-here` with the token you copied in Step 1.

---

## Obsidian MCP Setup

Only needed if you want to export your notes and progress to Obsidian using `professor:export`.

**Step 1: Install the Obsidian Local REST API plugin**

1. In Obsidian, open **Settings → Community plugins**
2. Search for **Local REST API** and install it
3. Enable the plugin, then go to its settings
4. Copy the **API Key** shown there (the default port is 27123)

**Step 2: Add the MCP config**

Create or edit `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "obsidian": {
      "command": "npx",
      "args": ["-y", "mcp-obsidian"],
      "env": {
        "OBSIDIAN_API_KEY": "your-obsidian-rest-api-key-here",
        "OBSIDIAN_HOST": "127.0.0.1",
        "OBSIDIAN_PORT": "27123"
      }
    }
  }
}
```

Replace `your-obsidian-rest-api-key-here` with the API key from Step 1. Update `OBSIDIAN_PORT` if you changed the default port in the plugin settings.

---

## Commands

### Course Navigation

| Command | Description |
|---|---|
| `professor:new-topic` | Start a new course — Professor researches the topic and proposes a syllabus |
| `professor:next` | Move to the next section — generates lecture + exercise |
| `professor:done` | Mark the current section complete — Professor confirms understanding, creates flashcards |
| `professor:review` | Review your work with Coach — Socratic feedback with self-assessment first |
| `professor:syllabus` | Display the full course syllabus |
| `professor:progress` | Show current progress, streak, and time spent |
| `professor:switch` | Switch between active courses |
| `professor:worktrees` | List all learning worktrees and archived courses |

### Getting Help

| Command | Description |
|---|---|
| `professor:hint` | Ask for a hint — 3 layers: conceptual → tool/pattern → pseudo-code |
| `professor:stuck` | Tell Professor you're blocked — structured breakdown without giving the answer |
| `professor:discuss` | Free-form Q&A on the current concept |
| `professor:quiz` | 5 questions matched to your level |
| `professor:spotter` | Mid-work check-in — catch confusion before it compounds |

### Capstone

| Command | Description |
|---|---|
| `professor:capstone` | View the capstone project brief |
| `professor:capstone-review` | Submit your finished project for Socratic review |

### Retention & Notes

| Command | Description |
|---|---|
| `professor:recall` | Spaced repetition drill — 3 Socratic questions per section |
| `professor:schedule` | Review dashboard — overdue, today, and upcoming sections |
| `professor:note` | Save a timestamped note to your course notes file |
| `professor:export` | Push notes and progress to Notion or Obsidian |

### Templates & Archiving

| Command | Description |
|---|---|
| `professor:template-export` | Export course as a shareable template (no personal data) |
| `professor:template-import` | Import a community course template |
| `professor:archive` | Archive a completed course with summary and notes |

---

## CLI

```bash
npx course-professor [command]
```

### Setup

| Command | Description |
|---|---|
| `init` | Auto-detect agent and set up |
| `setup <agent>` | Set up for a specific agent |
| `list` | List supported agents |

### Course & Skill Registry

| Command | Description |
|---|---|
| `courses` | Browse available community courses |
| `search <keyword>` | Search courses by keyword |
| `install <name>` | Install a course → `learning/{name}/` |
| `install --skill <name>` | Install a skill → `.claude/skills/{name}/` |
| `update <skill-name>` | Update an installed skill to the latest version |
| `update --all` | Update all installed skills |
| `installed` | List all installed skills |
| `remove <skill-name>` | Remove an installed skill |

**Skill scopes:**

- `--local` — this project only (`.claude/skills/`)
- `--global` — all projects (default, prompts for scope)
- `--force` — bypass confirmation prompts

### Dev Fast-path

Check progress, continue, and verify exercises without leaving the terminal:

| Command | Description |
|---|---|
| `status [--json]` | Every course on disk: kind, progress, current section, due flashcards, streak |
| `next [slug]` | Current lecture summary, objectives, exercise path and the agent command to continue |
| `check [slug]` | Run the active exercise's self-checks with the right toolchain (never reveals solutions) |
| `doctor` | Environment checklist (Node ≥18, git, agent CLIs, Ollama, port 3000, DB path) with fix hints |

```bash
npx course-professor status                  # see all courses + overall streak
npx course-professor status --json           # machine-readable output for scripts
npx course-professor next                    # what to work on, and how to continue
npx course-professor check nextjs            # run the active exercise's self-checks
npx course-professor doctor                  # diagnose your local setup
```

Add `--dir <path>` to `status`/`next`/`check` to read courses from a directory other than `learning/` and `courses/`.

### Studio, Review & Import

One command starts the whole local platform — the bridge server and the built Studio app — and pairs them for you. `review` and `import` use the same SQLite database (`~/.professor/professor.db`) and the same repository logic as Studio, so your data is identical everywhere.

| Command | Description |
|---|---|
| `studio` | Install/build if needed, start the local server + Studio, print a pairing URL and open the browser |
| `studio --port 5180 --api-port 3000` | Choose the Studio and server ports |
| `studio --no-open` | Print the pairing URL without opening the browser |
| `review [--limit 20]` | Review due flashcards in the terminal (Space flips, 1–4 grades, q quits) sharing SM-2 state with Studio |
| `import [slug\|--all]` | Import CLI courses (`COURSE.md`, `lectures/`, `SCHEDULE.md`, `LEARNING-LOG.md`) into Studio's SQLite DB |
| `import [slug\|--all] --dry-run` | Print what would be imported without writing |

```bash
npx course-professor studio                  # server + Studio + pairing, one command
npx course-professor studio --no-open        # just print the pairing URL
npx course-professor review                  # review due flashcards in the terminal
npx course-professor import --all            # import every CLI course into Studio
npx course-professor import nextjs --dry-run # preview one course's import
```

`import` is idempotent: re-running updates existing rows (matched by `source: 'cli'` + a stable `external_id`) instead of duplicating, and never overwrites graded cards or existing lecture versions.

### Web UI

| Command | Description |
|---|---|
| `web` | Start local web UI (default port 3000) |
| `web [port]` | Start on a specific port |
| `web --production` | Start in production mode (requires build) |

---

## How Courses Work

Each course lives in a git worktree on its own branch — isolated from your project code, so you can work on exercises without affecting your project.

```
learning/
└── {topic-slug}/           ← git worktree (dedicated branch)
    ├── COURSE.md            ← Syllabus + progress tracker (source of truth)
    ├── LECTURE.md           ← Current section (overwritten each professor:next)
    ├── NOTES.md             ← Your notes
    ├── CAPSTONE.md          ← Final project brief (immutable)
    └── SCHEDULE.md          ← Flashcards + spaced repetition queue
```

**Progress is stored in plain Markdown files** — no database, no lock-in. Your `COURSE.md` tracks everything: syllabus, completed sections, streaks, time spent, and notes.

---

## Community Courses & Skills

Browse and install community-contributed content from the registry:

```bash
npx course-professor courses                       # list all available courses
npx course-professor search react                 # search by keyword
npx course-professor install react-hooks          # install → learning/react-hooks/
```

After installing, run `professor:new-topic` in your agent — Professor detects the downloaded course automatically and picks up where the syllabus left off.

**Skills** are real problem-solvers earned by learners who completed a course and built the capstone. Install one and it becomes a specialized agent in your projects:

```bash
npx course-professor install --skill react-hooks-reviewer           # prompts for scope
npx course-professor install --skill react-hooks-reviewer --global  # install globally
npx course-professor update react-hooks-reviewer                    # update to latest
npx course-professor installed                                      # list what you have
npx course-professor remove react-hooks-reviewer                    # uninstall
```

Registry: [professor-skills/registry](https://github.com/professor-skills/registry)

---

## Scope and Limitations

- **Multi-platform.** Works with Claude Code, Gemini CLI, OpenCode, and Cursor.
- **The professor will never complete your exercises.** That is the whole point. If you ask for code, it will redirect you with a question. This is not a bug.
- **Notion and Obsidian MCP are optional.** The core learning workflow works without any external services. Export requires the relevant MCP server to be running in your project environment.
- **Courses are local.** The plugin and your course files live on your machine. The registry is a GitHub repository — no server required.
