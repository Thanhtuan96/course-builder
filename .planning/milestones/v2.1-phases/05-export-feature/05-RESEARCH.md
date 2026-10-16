# Phase 5: Export Feature - Research

**Researched:** 2026-03-07
**Domain:** Claude Code MCP integration, Notion/Obsidian API export
**Confidence:** MEDIUM

## Summary

Phase 5 implements the export feature that allows users to push their learning journey (notes, answers, summaries) to Notion or Obsidian via MCP. The export requires MCP servers to be configured in the user's environment. The implementation involves detecting MCP availability, prompting for destination choice, and transforming course content into the target platform format.

**Primary recommendation:** Use MCP tool calling to invoke Notion/Obsidian MCP servers for export, with graceful fallback to setup instructions when MCP is unavailable. The professor agent should handle all export logic within its existing command structure.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Uses `AskUserQuestion` immediately when user runs `professor:export`
- Options: Notion / Obsidian / Cancel
- After destination selected, proceed to export immediately (no preview step)
- If user cancels, professor acknowledges and exits gracefully
- Notion: Parent page with course properties, child pages for lectures, Notes page, capstone + summary; Code referenced (not embedded)
- Obsidian: Folder per course with .md files; user configures vault path in settings (persisted)
- Export scope: Everything (NOTES.md, all LECTURE.md, CAPSTONE.md, COURSE.md, summary/retrospective generated at export time)
- MCP unavailability: Detect before attempting export, show destination-specific setup instructions

### Claude's Discretion
- How to store Obsidian vault path (file-based config, environment variable, or Claude settings)
- Summary/retrospective generation approach
- Error handling specifics

### Deferred Ideas (OUT OF SCOPE)
- File-based Obsidian export as fallback when Obsidian MCP unavailable (EXP-04, future requirement)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CMD-14 | User can run `professor:export` to choose exporting the course to Notion or Obsidian | MCP tool calling via Claude Code, AskUserQuestion for destination selection |
| EXP-01 | `professor:export` sends lecture notes + user answers + NOTES.md to Notion via MCP | Notion MCP server tools, page creation API |
| EXP-02 | `professor:export` sends course content to Obsidian via Obsidian MCP server | Obsidian MCP server tools, file creation API |
| EXP-03 | User can choose export destination (Notion or Obsidian) when running `professor:export` | AskUserQuestion flow per locked decisions |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@modelcontextprotocol/server-notion` | Latest (npm) | Notion MCP server for creating/managing Notion pages | Official MCP reference implementation |
| `mcp-obsidian` | Latest (npm) | Obsidian MCP server for vault file operations | Community standard for Obsidian integration |
| Claude Code MCP tools | Built-in | Tool invocation for MCP server communication | Native Claude Code capability |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Notion API | v1 | Notion page/block creation | When Notion MCP tool called |
| Obsidian Vault | Local | Markdown file creation | When Obsidian MCP tool called |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| MCP server | Direct API calls (Notion/Obsidian REST APIs) | MCP provides abstraction, tool auto-discovery, security |
| File-based export | MCP-only export | EXP-04 (future) adds file-based fallback |

**Installation:**
MCP servers are user-side installations, not project dependencies. The README should document:
```bash
# Notion MCP
npm install -g @modelcontextprotocol/server-notion

# Obsidian MCP  
npm install -g mcp-obsidian
```

And configuration in `.mcp.json`:
```json
{
  "mcpServers": {
    "notion": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-notion"],
      "env": {
        "NOTION_API_TOKEN": "${NOTION_API_TOKEN}"
      }
    },
    "obsidian": {
      "command": "npx", 
      "args": ["-y", "mcp-obsidian"],
      "env": {
        "OBSIDIAN_API_KEY": "${OBSIDIAN_API_KEY}",
        "OBSIDIAN_HOST": "${OBSIDIAN_HOST}",
        "OBSIDIAN_PORT": "${OBSIDIAN_PORT}"
      }
    }
  }
}
```

## Architecture Patterns

### Recommended Project Structure
```
commands/professor/
├── export.md              # Command entry point → routes to professor agent
└── ...

agents/
├── professor.md          # Contains export logic (or exports to separate module)
└── ...

professor-skill/
├── SKILL.md              # Core behavior (source of truth)
└── ...

courses/{slug}/           # Source files for export
├── COURSE.md             # Syllabus + progress
├── LECTURE.md            # Current lecture (may have multiple from history)
├── NOTES.md              # User notes
├── CAPSTONE.md           # Capstone brief
└── lecture-history/      # (future: archive of all LECTURE.md content)
    ├── lecture-1.md
    ├── lecture-2.md
    └── ...
```

### Pattern 1: MCP Tool Invocation
**What:** Calling MCP server tools through Claude Code's tool system
**When to use:** When needing to interact with external services (Notion, Obsidian)
**Example:**
```typescript
// The professor agent invokes MCP tools like:
// 1. Detect available MCP servers
// 2. Call notion_create_page for parent page
// 3. Call notion_create_page for each child page
// 4. Handle response and report success/failure
```

### Pattern 2: Content Transformation
**What:** Converting course Markdown files to target platform format
**When to use:** Before calling MCP tools to create pages/files
**Example:**
```markdown
// Notion: Convert Markdown to Notion blocks
// - Headers → heading_1, heading_2, heading_3 blocks
// - Code blocks → code blocks (with language)
// - Links → link preview blocks

// Obsidian: Preserve Markdown with YAML frontmatter
// ---
// title: "Course: React Fundamentals"
// date: 2026-03-07
// tags: [course, react]
// course-slug: react-fundamentals
// status: in-progress
// ---
```

### Pattern 3: MCP Availability Detection
**What:** Checking if required MCP server is available before attempting export
**When to use:** At start of export command, before any API calls
**Example:**
```typescript
// Attempt to call a simple MCP tool (e.g., notion_get_me)
// If it fails with "server not found", MCP is unavailable
// Show destination-specific setup instructions
```

### Anti-Patterns to Avoid
- **Direct API calls without MCP:** Don't bypass MCP and call Notion/Obsidian APIs directly — violates the MCP abstraction layer and makes the feature dependent on API keys in project config
- **Blocking on unavailable MCP:** Don't wait indefinitely — detect unavailability early and provide helpful setup instructions
- **Embedding code in exports:** Per locked decisions, code is referenced (links), not embedded in Notion pages

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Notion API integration | Custom REST API client | `@modelcontextprotocol/server-notion` MCP | Handles auth, rate limiting, block conversion |
| Obsidian file sync | Custom file system watcher | `mcp-obsidian` MCP | Native vault access, proper conflict handling |
| MCP server detection | Custom polling mechanism | MCP tool failure detection | Standard MCP error handling |
| Markdown to Notion blocks | Custom Markdown parser | MCP server handles conversion | Edge cases covered by server |

**Key insight:** MCP servers are the standard way to integrate external services in Claude Code. Building custom integrations would duplicate MCP functionality and require maintaining API credentials in the project.

## Common Pitfalls

### Pitfall 1: MCP Server Not Running
**What goes wrong:** Export fails with cryptic error when MCP server isn't configured
**Why it happens:** User hasn't installed/configured MCP servers
**How to avoid:** Detect availability before attempting export, show setup instructions
**Warning signs:** Tool call returns "server not available" or connection timeout

### Pitfall 2: Missing API Tokens
**What goes wrong:** MCP server starts but API calls fail with auth errors
**Why it happens:** Environment variables not set (NOTION_API_TOKEN, etc.)
**How to avoid:** Include token setup in setup instructions, check env vars early
**Warning signs:** 401 or 403 errors from MCP tool responses

### Pitfall 3: Large Content Exceeds Notion Limits
**What goes wrong:** Notion API returns "resource too large" for big pages
**Why it happens:** Notion has block limits per page (~100 blocks recommended)
**How to avoid:** Split lectures into multiple pages, use page hierarchy
**Warning signs:** API returns 400 with "too many children" error

### Pitfall 4: Obsidian Vault Path Issues
**What goes wrong:** Files created in wrong location or permission denied
**Why it happens:** Vault path not configured or incorrect
**How to avoid:** Store vault path in persistent config, validate before write
**Warning signs:** File system errors, path not found

## Code Examples

### Export Command Flow
```markdown
// commands/professor/export.md
---
name: professor:export
description: "Export course to Notion or Obsidian"
---

When user runs `professor:export`:

1. READ the course files from `courses/{slug}/`:
   - COURSE.md (syllabus + progress)
   - NOTES.md (user notes)  
   - CAPSTONE.md (project brief)
   - All LECTURE.md files (or lecture-history/)

2. USE AskUserQuestion to prompt:
   > "Where would you like to export your course?"
   > Options: "Notion" / "Obsidian" / "Cancel"

3. IF user selects "Notion":
   a. DETECT Notion MCP availability (call notion_get_me)
   b. IF unavailable → show Notion setup instructions
   c. IF available → CREATE Notion page structure:
      - Parent page: Course title, description, progress
      - Child pages: One per lecture, Notes, Capstone, Summary
      - Code: Reference only (link to files)
   
4. IF user selects "Obsidian":
   a. DETECT Obsidian MCP availability
   b. IF unavailable → show Obsidian setup instructions  
   c. IF available → CHECK vault path in config
      - IF not set → AskUserQuestion for vault path
      - Save to config for future use
   d. CREATE Obsidian folder structure:
      - /{vault}/{course-slug}/course.md
      - /{vault}/{course-slug}/lecture-1.md
      - ...
      - /{vault}/{course-slug}/notes.md
      - /{vault}/{course-slug}/capstone.md
      - /{vault}/{course-slug}/summary.md

5. IF user selects "Cancel":
   > "Export cancelled. Your course remains here. Run `professor:export` again anytime."
```

### Notion Page Structure
```typescript
// Notion page hierarchy
{
  parent: { page_id: "root" },
  properties: {
    "Name": { title: [{ text: { content: "Course: React Fundamentals" }}] },
    "Level": { select: { name: "Intermediate" }},
    "Progress": { select: { name: "3/5 sections complete" }},
    "Started": { date: { start: "2026-03-01" }}
  },
  children: [
    // Lecture pages as children
    { object: "block", type: "child_page", child_page: { title: "Section 1: Components" }},
    { object: "block", type: "child_page", child_page: { title: "Section 2: State" }},
    // ... more lectures
    { object: "block", type: "child_page", child_page: { title: "Notes" }},
    { object: "block", type: "child_page", child_page: { title: "Capstone Project" }},
    { object: "block", type: "child_page", child_page: { title: "Summary" }}
  ]
}
```

### Obsidian YAML Frontmatter
```markdown
---
title: "Course: React Fundamentals"
date: 2026-03-07
tags: [course, react, learning]
course-slug: react-fundamentals
status: in-progress
level: Intermediate
progress: "3/5 sections complete"
---

# Course: React Fundamentals

## Learning Objectives
- Build reusable React components
- Manage component state effectively
- ...

## Syllabus & Progress
| # | Section | Status |
|---|---------|--------|
| 1 | Components | ✅ Done |
| 2 | State | 🔄 In progress |
...
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual copy-paste | MCP-powered export | 2025+ | One-command export, structured pages |
| Single destination | Dual destination (Notion/Obsidian) | Phase 5 | User choice respected |
| Code embedded | Code referenced | Phase 5 | Cleaner pages, links to source |
| No MCP detection | Availability detection + setup help | Phase 5 | Better UX on first try |

**Deprecated/outdated:**
- Direct Notion API integration (without MCP) — replaced by MCP server
- Single export destination — replaced by user choice

## Open Questions

1. **How to store Obsidian vault path persistently?**
   - What we know: Needs to persist across sessions
   - What's unclear: File-based config vs. environment variable vs. Claude settings
   - Recommendation: Use simple JSON config file in project root (.export-config.json)

2. **How to get complete lecture history for export?**
   - What we know: LECTURE.md is overwritten each time
   - What's unclear: Should lectures be stored in archive as they're created?
   - Recommendation: For v1, export current LECTURE.md only; EXP-04 (future) adds lecture history

3. **How to detect MCP availability without failing visibly?**
   - What we know: MCP tool calls fail if server unavailable
   - What's unclear: Best practice for silent detection
   - Recommendation: Try a simple read-only tool call, catch and handle errors gracefully

4. **What Notion properties to include?**
   - What we know: Course title, description, progress
   - What's unclear: Which additional properties valuable
   - Recommendation: Keep simple per CONTEXT.md: title, description, progress status, capstone link

## Validation Architecture

> Skip this section entirely if workflow.nyquist_validation is explicitly set to false in .planning/config.json. If the key is absent, treat as enabled.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | N/A — This is a Claude Code plugin (Markdown files only) |
| Config file | N/A |
| Quick run command | N/A — No test framework |
| Full suite command | N/A |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CMD-14 | Export command exists and routes correctly | Manual | N/A | ✅ commands/professor/export.md |
| EXP-01 | Notion export via MCP | Manual | N/A | N/A — requires MCP |
| EXP-02 | Obsidian export via MCP | Manual | N/A | N/A — requires MCP |
| EXP-03 | Destination selection via AskUserQuestion | Manual | N/A | N/A — behavior test |

### Sampling Rate
- **Per task commit:** Manual verification of command routing
- **Per wave merge:** Manual verification of export flow
- **Phase gate:** Manual test with mock MCP (or real MCP if configured)

### Wave 0 Gaps
- [ ] Integration tests with real MCP servers — requires user to have MCP configured
- [ ] Mock MCP server for automated testing — future enhancement

*(If no gaps: "This phase consists of Markdown file updates. No automated test framework needed.")*

## Sources

### Primary (HIGH confidence)
- MCP documentation (modelcontextprotocol.info) — MCP concepts, client support
- Claude Code documentation — MCP integration via .mcp.json
- CONTEXT.md — Locked implementation decisions

### Secondary (MEDIUM confidence)
- Notion API documentation — Page/block creation structure
- Obsidian Markdown format — YAML frontmatter conventions
- CLAUDE.md (this project) — Export feature specification

### Tertiary (LOW confidence)
- Community MCP server implementations — Tool schemas (need verification)

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM - MCP servers identified but exact npm packages need verification
- Architecture: HIGH - Clear patterns from CONTEXT.md and existing codebase
- Pitfalls: MEDIUM - Common issues identified, some require MCP to verify

**Research date:** 2026-03-07
**Valid until:** 2026-04-07 (30 days — MCP ecosystem evolving)

---

*Research complete. Ready for planning.*
