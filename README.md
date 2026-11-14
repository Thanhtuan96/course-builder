# Ronin SkillForce

**A Socratic learning coach for AI agents.** SkillForce teaches by asking questions instead of
handing you answers. It runs inside **Claude Code**, **Gemini CLI**, **OpenCode** and **Cursor**,
and comes with **Studio**, a local web app for lessons, quizzes, flashcards and hands-on exercises.

```bash
npx ronin-skillforce init      # set up your AI agent
npx ronin-skillforce studio    # open Studio in your browser
```

> Formerly published as `course-professor` (now deprecated). The old `course-professor` command
> still works as an alias.

---

## Why SkillForce

Most AI assistants write the answer the moment you ask. SkillForce does the opposite: you think,
you try, you get feedback as questions, and you keep what you learn.

- **Socratic by design.** It never completes your exercises; it asks the next question instead.
- **Any subject.** Each course has a kind: `programming`, `quantitative`, `conceptual` or `skill`.
  Exercises match the kind: code with self-checks, problem sets, analysis prompts or drills.
- **Grounded lectures.** Before each lecture it researches 3–6 sources and cites key claims. It
  never invents links, and marks claims it could not source as unverified.
- **Your progress stays on your machine.** Courses are plain Markdown files. Programming courses
  are git worktrees on their own `learning/<slug>` branch, so they never mix with your project.
- **Remembers how you learn.** Coach keeps a trail of every review round, flags weak concepts and
  builds spaced-repetition flashcards.

---

## Requirements

- An AI agent: Claude Code, Gemini CLI, OpenCode or Cursor.
- **Node.js 18+** for setup and the CLI; **Node 22.5+** for Studio, `review` and `import` (they use
  the built-in `node:sqlite` module). Run `npx ronin-skillforce doctor` to check your setup.
- **Git** for programming courses.

---

## Quick start

### 1. Set up your agent

```bash
npx ronin-skillforce init              # auto-detect your agent
npx ronin-skillforce setup claude      # or pick one: claude | cursor | opencode | gemini
```

Restart your agent, then start a course:

```
professor:new-topic
```

Professor asks a few questions about what you want to learn, proposes a syllabus and creates the
course in `learning/<slug>/`. Then use `professor:next` for each lesson.

### 2. Open Studio (optional)

```bash
npx ronin-skillforce studio            # starts the local server + Studio and pairs them
```

Studio is a browser app on your machine. Bring your own API key (Anthropic, any
OpenAI-compatible endpoint, Ollama), or use the AI agent you already have through the local
bridge, with no key needed. Your data goes to your browser (IndexedDB) or to a SQLite file at
`~/.professor/professor.db`, whichever you choose.

### Install globally (optional)

```bash
npm i -g ronin-skillforce              # then run `skillforce <command>`
npm uninstall -g ronin-skillforce
```

Your courses (`learning/`, `courses/`) and Studio's database live outside the package and are not
removed when you uninstall.

---

## Agent commands

Type these in your AI agent.

| Command | What it does |
|---|---|
| `professor:new-topic` | Start a course: research, syllabus, course folder |
| `professor:next` | Next lesson: grounded lecture and an exercise |
| `professor:review` | Coach reviews your work, starting with your own self-assessment |
| `professor:hint` | Hints in 3 layers: concept → tool/pattern → pseudo-code |
| `professor:stuck` | Break a blocker into smaller steps, without the answer |
| `professor:discuss` | Questions about the current concept |
| `professor:quiz` | 5 questions at your level |
| `professor:done` | Coach checks your understanding, then marks the section complete |
| `professor:recall` / `professor:schedule` | Spaced-repetition drills and your review schedule |
| `professor:progress` / `professor:syllabus` | Progress, streak and the full syllabus |
| `professor:capstone` / `professor:capstone-review` | Final project brief and its review |
| `professor:note` / `professor:export` | Notes, and export to Notion or Obsidian |
| `professor:switch` / `professor:worktrees` / `professor:archive` | Manage several courses |

Professor routes work to specialised agents: **Coach** (reviews and self-assessment),
**Spotter** (mid-work check-ins), **Navigator** (how concepts connect) and **Researcher**
(sources for lectures).

---

## CLI

```bash
npx ronin-skillforce <command>         # or `skillforce <command>` after a global install
```

| Command | What it does |
|---|---|
| `init`, `setup <agent>`, `list` | Set up the plugin for your agent |
| `status [--json]` | Every course: kind, progress, current section, due flashcards, streak |
| `next [slug]` | Current lesson summary and how to continue |
| `check [slug]` | Run the active exercise's self-checks (never shows solutions) |
| `doctor` | Check Node, git, agents, Ollama, ports and the database, with fix hints |
| `studio [--no-open] [--port N --api-port N]` | Start the local server and Studio, print a pairing URL |
| `review [--limit N]` | Review due flashcards in the terminal (shared with Studio) |
| `import [slug \| --all] [--dry-run]` | Import Markdown courses into Studio's database |
| `create`, `save`, `context`, `trail` | Course steps the agent commands run for you |
| `courses`, `search`, `install`, `update`, `installed`, `remove` | Community courses and skills (beta) |
| `web` | Start only the bridge server (see below) |

### Starting the bridge manually

`skillforce web` starts the Studio bridge server and serves the built Studio app from the
same port (3000 by default). It does not build Studio: if `studio/dist` is missing the port answers
with a 503 page. `web --production` refuses to start without a Studio build, and
`web --rotate-token` prints a new pairing token. Most people should use `skillforce studio`
instead.

The bridge accepts only loopback clients and requires the pairing token, so keep the token private.
The old web UI is **deprecated** and opt-in only (`web --legacy` or `PROFESSOR_LEGACY=1`); it will
be removed.

---

## How courses are stored

```
learning/<slug>/
├── COURSE.md         syllabus and progress (source of truth)
├── LECTURE.md        current lesson; older lessons are kept in lectures/
├── LEARNING-LOG.md   Coach review trail, attempts and section verdicts
├── SCHEDULE.md       flashcards and spaced-repetition queue
├── CAPSTONE.md       final project brief (never changes)
├── NOTES.md          your notes
└── exercises/
```

Everything is plain Markdown you can read, edit and commit. There is no lock-in.

---

## Export to Notion or Obsidian (optional)

`professor:export` needs an MCP server in your project's `.mcp.json`. The core learning flow works
without one.

<details>
<summary>Notion</summary>

Create an integration at [notion.so/my-integrations](https://www.notion.so/my-integrations), copy
its token, and connect it to the target page (`…` → **Connections**). Then:

```json
{
  "mcpServers": {
    "notion": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-notion"],
      "env": { "NOTION_API_TOKEN": "your-notion-integration-token" }
    }
  }
}
```

</details>

<details>
<summary>Obsidian</summary>

Install and enable the **Local REST API** community plugin and copy its API key (default port
27123). Then:

```json
{
  "mcpServers": {
    "obsidian": {
      "command": "npx",
      "args": ["-y", "mcp-obsidian"],
      "env": {
        "OBSIDIAN_API_KEY": "your-obsidian-rest-api-key",
        "OBSIDIAN_HOST": "127.0.0.1",
        "OBSIDIAN_PORT": "27123"
      }
    }
  }
}
```

</details>

---

## Security and privacy

Studio runs as a browser app, a loopback bridge and a local code runner on your machine. API keys
stay in your browser and are never included in backups. See [`SECURITY.md`](SECURITY.md) for what
runs where and how to report a vulnerability.

## Links

- Changes: [`CHANGELOG.md`](CHANGELOG.md)
- Studio details: [`studio/README.md`](studio/README.md)
- Source and issues: [github.com/Thanhtuan96/course-builder](https://github.com/Thanhtuan96/course-builder)

## License

MIT
