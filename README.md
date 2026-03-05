# Professor — A Socratic Learning Plugin for Claude Code

A Claude Code plugin that teaches you to code by asking questions instead of giving answers.

---

## What Is This?

Most AI coding assistants will write code for you the moment you ask. Professor does the opposite. It is built on the Socratic method: rather than handing you a solution, the professor asks questions that help you reason through the problem yourself. You think, you try, you make mistakes, and you learn.

This is intentional by design — not a limitation. When you type `professor:stuck`, the professor will not write the code for you. It will ask what you have tried so far, what you think might be going wrong, and nudge you toward the next insight. This approach works for all experience levels: beginners learning fundamentals, intermediate developers tackling system design, and advanced engineers studying cutting-edge concepts. The goal is genuine, durable understanding — the kind you only get by solving things yourself.

---

## Requirements

- **Claude Code** — this plugin is designed for Claude Code only (v1.0). Multi-platform support is not in scope.
- **Node.js** — required for hook scripts (Node.js 18 or newer recommended).
- **Notion or Obsidian** — only needed if you want to use the `professor:export` command. See setup sections below.

---

## Install

1. **Clone the repo:**

   ```bash
   git clone https://github.com/your-username/course-learning-plugin.git
   ```

2. **Create the plugins directory** (if it does not exist):

   ```bash
   mkdir -p ~/.claude/plugins
   ```

3. **Symlink the repo into the plugins directory:**

   ```bash
   ln -s "$(pwd)/course-learning-plugin" ~/.claude/plugins/professor
   ```

   Alternatively, you can clone directly into the plugins directory:

   ```bash
   git clone https://github.com/your-username/course-learning-plugin.git ~/.claude/plugins/professor
   ```

4. **Restart Claude Code** to reload plugins. The `professor:*` commands will be available in your next session.

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

| Command | Category | Description |
|---|---|---|
| `professor:new-topic` | Course Navigation | Start a new course topic — the professor proposes a syllabus for your review |
| `professor:next` | Course Navigation | Move to the next exercise in the current topic |
| `professor:done` | Course Navigation | Mark the current exercise complete and reflect on what you learned |
| `professor:review` | Course Navigation | Review a concept from earlier in the course |
| `professor:syllabus` | Course Navigation | Display the syllabus for the current course |
| `professor:progress` | Course Navigation | Show your current progress through the course |
| `professor:hint` | Getting Help | Ask for a hint — the professor nudges you without giving the answer |
| `professor:stuck` | Getting Help | Tell the professor you are stuck — expect questions, not solutions |
| `professor:discuss` | Getting Help | Open a free-form discussion about the current concept |
| `professor:quiz` | Getting Help | Ask the professor to quiz you on what you have covered so far |
| `professor:capstone` | Capstone | Begin the capstone project for the current course |
| `professor:capstone-review` | Capstone | Submit your capstone work for Socratic review |
| `professor:note` | Notes & Export | Save a note to your course notes file |
| `professor:export` | Notes & Export | Export your notes and progress to Notion or Obsidian |

---

## Scope and Limitations

- **Claude Code only.** This plugin targets Claude Code v1.0. Support for other AI platforms, Claude.ai, or multi-agent frameworks is deferred — not in scope for this release.
- **The professor will never complete your exercises for you.** That is the whole point. If you ask the professor to write the code for you, it will redirect you with a question. This is not a bug.
- **Notion and Obsidian MCP are optional.** The core learning workflow works without any external services. Export requires the relevant MCP server to be running in your project environment.
