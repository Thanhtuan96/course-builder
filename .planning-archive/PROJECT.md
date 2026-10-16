# Course Learning Plugin

## What This Is

A Claude Code plugin that turns any technology learning goal into a structured, Socratic learning experience. Users state what they want to achieve — the Professor agent builds a custom course, guides them through exercises without giving answers, lets them take personal notes, and exports their entire learning journey to Notion or Obsidian for long-term retention.

Built on top of professor-skill-v3 (existing Socratic skill), evolved into a full plugin with agents, slash commands, hooks, and knowledge export.

From v3.0 the project also ships **Professor Studio** (`studio/`): a local-first web learning platform (Vite SPA) where anyone can generate a course from a prompt and learn through lessons, quizzes, flashcards and a Socratic tutor — free, using their own AI key or local agent. Long-term direction: an Oboe-style hosted SaaS.

## Core Value

The learner builds real understanding by doing — not by reading Claude's code. Every interaction guides, questions, and teaches instead of shortcutting.

## Business Context

- **Customer**: Self-directed learners (tech first, then non-tech) who want structured courses on any topic
- **Revenue model**: Free local-first/BYOK forever; paid hosted SaaS later (managed AI, sync, accounts)
- **Success metric**: Learners who complete ≥1 lesson+quiz loop in their first session
- **Strategy notes**: `.planning/PRODUCT_STRATEGY.md`, `studio/docs/SAAS-ROADMAP.md` (v3.0)

## Requirements

### Validated

- ✓ Socratic professor agent with layer-by-layer hints — existing (SKILL.md v3)
- ✓ Course file structure (COURSE.md, LECTURE.md, CAPSTONE.md) — existing
- ✓ Full command set: new-topic, next, review, done, discuss, quiz, hint, stuck, syllabus, progress, capstone, capstone-review — existing
- ✓ 4 learning levels (Beginner → Expert) — existing
- ✓ Capstone project with unlock mechanic — existing
- ✓ Progress tracking in COURSE.md — existing
- ✓ Web research on topic creation and section generation — existing
- ✓ Claude Code plugin structure (plugin.json, agents/, commands/, hooks/) with proper manifest — v1.0
- ✓ Hybrid course creation: Claude proposes syllabus → user reviews/edits → confirms before start — v1.0
- ✓ Personal notes feature (NOTES.md per course) — v1.0
- ✓ `professor:note` command — v1.0
- ✓ `professor:export` command (Notion via MCP, Obsidian .md files) — v1.0
- ✓ PreCompact hook (token warning + auto-save session state) — v1.0
- ✓ Course archive feature (`professor:archive`) — v1.0
- ✓ CLI auto-setup (`npx course-professor init/setup`) — v1.0
- ✓ Git Worktree-based courses (each tech = separate worktree) — v1.1
- ✓ Archive preserves learning context to `.course_archive/` — v1.1
- ✓ Worktree management commands (create, list, switch, archive) — v1.1
- ✓ Auto-create exercise files on professor:next — v1.1
- ✓ Cursor agent support — v1.1
- ✓ Agent specialization (researcher agent) — v1.1
- ✓ Research-enhanced hints — v1.1
- ✓ MCP documentation (notion, obsidian) — v1.1
- ✓ React client with split-pane layout (LecturePanel, ChatPanel, command pills) — v2.0
- ✓ CLI web command, production build, Express static serving — v2.0
- ✓ Retention layer (SCHEDULE.md, professor:recall, professor:schedule, streak tracking, time tracking) — v2.0
- ✓ Template export/import for course sharing — v2.0
- ✓ Auto-generate exercise files — v2.0
- ✓ Coach agent with self-assessment dialogue (professor:review, professor:done, professor:stuck) — v2.0
- ✓ Spotter agent for mid-work check-ins — v2.0
- ✓ Navigator agent for section bridges and concept threading — v2.0
- ✓ Professor orchestrator refactor (routing table, delegation to specialized agents) — v2.0
- ✓ Agent cross-platform polish (Claude Code, Cursor, Gemini CLI, OpenCode) — v2.0

### Active

- [ ] Professor Studio (v3.0): course from prompt, lessons, quizzes, flashcards (SRS), Socratic tutor, 4 AI sources (BYOK Anthropic, OpenAI-compatible, Ollama, local agent bridge), static deploy — see REQUIREMENTS.md
- [ ] Cloud deployment + authentication — superseded by v3.0 static deploy + SaaS roadmap doc; SaaS backend is a later milestone

### Out of Scope

- Automated grading/scoring — learning is qualitative, not point-based
- Multi-user/collaborative learning — single user per plugin instance (v1)
- Video or audio content — text-based learning only for v3.0 (audio/podcast lessons revisit in SaaS milestone)
- ~~AI-generated quizzes with auto-grading~~ — moved into scope in v3.0: Studio quizzes are self-check retrieval practice, Socratic review remains for exercises/capstone
- Server-side storage of learner data in v3.0 — Studio is local-first (IndexedDB); cloud sync belongs to the SaaS milestone

## Context

- **Existing skill**: `professor-skill-v3/professor-skill/SKILL.md` is the authoritative behavior spec. All runtime state lives in `courses/{topic-slug}/` as Markdown files.
- **Distribution target**: Claude Code plugin (`.claude/`) as primary; the `.skill` zip format for Claude.ai as secondary. Same behavioral logic, different packaging.
- **Runtime**: Node.js v22, no compiled code — everything is Markdown instructions + lightweight CJS hooks.
- **Notion MCP**: Already present in the Claude Code workspace environment (mcp__claude_ai_Notion__* tools available).
- **Obsidian export**: Creates standard Markdown files with YAML frontmatter compatible with Obsidian vault import.
- **Version history**: v1 and v2 of the professor skill preceded this. v3 is stable and production-quality. This plugin is the next evolution with full plugin architecture.
- **Registry**: `professor-skills/registry` exists as separate GitHub repo — courses/ + skills/ split, no server needed

## Constraints

- **Platform**: Claude Code CLI — plugin must follow Claude Code plugin conventions (plugin.json manifest, standard directory layout)
- **No external DB**: Plugin state remains in Markdown files. Studio (v3.0) stores data only in the learner's browser (IndexedDB) — no server DB
- **Studio is static**: `studio/` must build to a static bundle (no Node server required) so it deploys to void.cloud / any static host; AI calls go browser → provider directly or to a localhost bridge
- **Keys stay local**: BYOK API keys live only in the learner's browser and are never included in exports/backups
- **Hook API**: Token-threshold hook must use PreCompact event (or equivalent hook available in Claude Code hooks system)
- **Socratic rules immutable**: The absolute rules from SKILL.md (never write code for user, never complete exercises) must remain enforced in all new commands/agents
- **Backwards compatible**: Existing `courses/` directories created by skill v3 must work without migration

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Hybrid syllabus creation (Claude proposes → user edits) | Pure AI generation may miss user's specific outcome; pure user-definition is blank-page friction | ✓ Good |
| NOTES.md as per-course flat file (not inline in COURSE.md) | Keeps progress tracking clean; notes are separate from structured progress | ✓ Good |
| Export as command (not automatic) | User controls when knowledge is pushed out; avoids noisy exports mid-course | ✓ Good |
| Notion MCP as primary, Obsidian file as fallback | MCP already available; Obsidian is local-first alternative for users without Notion | ✓ Good |
| Plugin structure over standalone skill | Full plugin gives access to hooks (token warning), dedicated agents, and slash commands vs single SKILL.md | ✓ Good |
| Git Worktree for each technology | Each tech = separate git worktree, learning context preserved in archive | ✓ Good |
| Archive copies learning files before deleting worktree | User's code stays in worktree; learning journey saved to .course_archive/ | ✓ Good |
| Express + React + Vite for Web UI | Standard, well-supported stack; easy to build and deploy | ✓ Shipped |
| Multi-agent architecture (Coach, Spotter, Navigator, Researcher) | Specialized agents for different interaction types improves learning outcomes | ✓ Good |
| Cross-platform agent compatibility (Claude Code, Cursor, Gemini CLI, OpenCode) | Learners use different AI agents; the skill should work everywhere | ✓ Shipped |
| `mode: subagent` + `model: inherit` for specialized agents | OpenCode compatible pattern; delegation via conditional block | ✓ Good |
| Phase 18-20 deferred (cloud, auth) | Focus on CLI and SKILLS first — simpler distribution | ✓ Good |
| v3.0 Studio as new static SPA in `studio/` (keep `web/`) | `web/` depends on Express + filesystem + spawning CLIs, cannot run on static/edge hosting | — Pending |
| Hybrid pedagogy in Studio | Lessons explain fully (Oboe-like); exercises/capstone and tutor stay Socratic | — Pending |
| Local agent bridge reuses `web/` server `/api/chat` | Learners use their own Claude Code/OpenCode/Cursor subscription for free | — Pending |
| Execution via OpenCode workers in cmux, Claude orchestrates/reviews | User preference for multi-agent development | — Pending |

---

## Previous Milestone: v2.0 Local Web UI *(complete)*

**Shipped:** 2026-03-25
- Phase 13: React client components
- Phase 14: CLI web, production build
- Phase 15: Retention layer (recall, schedule, streaks)
- Phase 16: Template sharing
- Phase 17: Auto-generate exercise files
- Phase 17.1: Coach agent
- Phase 17.1.1: Spotter agent
- Phase 17.1.1.1: Navigator agent
- Phase 17.1.1.1.1: Professor orchestrator refactor
- Phase 21: Agent cross-platform polish

---

## Current Milestone: v3.0 Professor Studio

**Goal:** A learner runs `npm run dev` (or opens the deployed static site) and completes the full loop — create a course from a prompt → study a generated lesson → take a quiz → review flashcards → ask the Socratic tutor — for free with their own key or local agent.

**Target features:**
- Course generation from prompt (topic + level + goal → syllabus)
- Lessons (Markdown), quizzes, flashcards with SM-2 spaced repetition, progress + streaks
- Socratic tutor chat per lesson (hybrid pedagogy)
- AI sources: BYOK Anthropic, OpenAI-compatible, Ollama local, local agent bridge
- IndexedDB storage with JSON backup/restore
- Static build deployable to void.cloud + SaaS architecture/roadmap doc

*(v2.1 cloud/auth/install deferred items are superseded by this milestone.)*

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---

*Last updated: 2026-10-15 after starting milestone v3.0*
