# Design: Retention & Sharing Features

**Date:** 2026-03-08
**Status:** Approved
**Approach:** Hybrid — CLI Core + Web Enhancement (Approach 3)

---

## Context

Professor is a Socratic learning assistant Claude Code plugin. v1.0 and v1.1 are complete (14 commands, git worktree courses, exercise auto-creation). v2.0 (Local Web UI) is in progress (phases 9-11).

This design covers the next set of features across 3 buckets:
- **A. Retention** — prevent forgetting after course completion
- **B. Friction Reduction** — make returning to study seamless
- **C. Sharing** — enable template sharing and team learning (incremental)

Target users: solo developers first, teams in the future.

---

## Architecture

### Approach: Hybrid CLI Core + Web Enhancement

All retention data lives in Markdown files accessible to both CLI and Web UI. No external plugin dependencies required. Spaced repetition logic is handled entirely by Professor — not delegated to Obsidian plugins or external tools.

**Design principle:** SCHEDULE.md must be human-readable without any plugin or tool installed.

---

## Section 1: Data Schema

### New file: `courses/{slug}/SCHEDULE.md`

Stores all retention data: spaced repetition schedule and flashcards.

```markdown
# Review Schedule: [Topic Name]

## Spaced Repetition Queue

| Section | Completed | Review 1 | Review 2 | Review 3 | Last Score |
|---------|-----------|----------|----------|----------|------------|
| Section 1: Basics | 2026-03-01 | 2026-03-02 done | 2026-03-05 due | 2026-03-12 locked | 4/5 |
| Section 2: Hooks  | 2026-03-03 | 2026-03-04 pending | — | — | — |

## Flashcards

### Section 1: Basics

**Q:** What is X?
**A:** [Revealed during professor:recall session]

**Q:** When would you use Y over Z?
**A:** [Revealed during professor:recall session]
```

Flashcard format is plain Markdown — no Obsidian plugin, no external tool required. Professor manages the review session interactively in CLI or Web UI.

### Changes to `COURSE.md` header

Three new fields added to the existing header block:

```markdown
**Streak**: 5 days (last active: 2026-03-08)
**Total time**: 4h 23min
**Reviews due**: 2 sections
```

### Changes to Progress Log in `COURSE.md`

Time spent added as a new column:

```markdown
| Date | Section | Activity | Time | Notes |
|------|---------|----------|------|-------|
| 2026-03-08 | Section 3 | Completed | 47min | Weak: error handling |
```

---

## Section 2: New Commands

### Group A — Retention

**`professor:recall`**

Single interactive session for spaced repetition. Shows due sections, runs Socratic quiz or flashcard flip, user self-rates (clear / fuzzy / forgot), updates SCHEDULE.md with next scheduled date.

Example flow:
```
2 sections due for recall

  1. Section 2: useState & useEffect (overdue 1 day)
  2. Section 4: Custom Hooks (due today)

Starting with Section 2...
[3 Socratic questions based on section content]
[User rates: clear / fuzzy / forgot]
[SCHEDULE.md updated — next review in 7 / 3 / 1 day respectively]
```

**`professor:schedule`**

Read-only view of the full review queue. Shows what is due today, overdue, and upcoming. No interaction — just a dashboard.

---

### Group B — Friction Reduction

**Auto-trigger on session start** (no new command required)

When user opens a new conversation, after reading COURSE.md, Professor automatically checks SCHEDULE.md for due recalls and displays:

```
Welcome back! Day 6 streak

2 recalls due — run professor:recall to clear them
Ready to continue: Section 5: Performance Optimization
```

**Streak tracking** — automatic, no command needed. Updated in COURSE.md whenever any professor command is used during the day.

**Time tracking** — automatic. Timestamp recorded when `professor:next` runs, closed when `professor:done` runs. Diff written to Progress Log.

---

### Group C — Sharing (incremental, 3 phases)

**Phase 1 — Templates (build now)**

`professor:template-export` — Exports the course syllabus as a reusable template file at `courses/{slug}/TEMPLATE.md`. Personal data (notes, progress, answers, dates) is stripped. Only structure, sections, and objectives are kept. User shares this file manually via GitHub, Slack, or any channel.

`professor:template-import <path>` — Imports a TEMPLATE.md file to create a new course with a pre-built syllabus. User still goes through `professor:next` to generate lectures — the template only provides structure.

**Phase 2 — Mentor/Learner (future)**

`professor:assign` — Mentor sends a template to a learner and can track their progress. Requires shared filesystem or web backend. Not built in this milestone.

**Phase 3 — Cohort (future)**

Multi-user shared progress dashboard on the Web UI. Requires web backend (phase 9+). Not built in this milestone.

---

## Section 3: Modified Existing Commands

| Command | Change |
|---------|--------|
| `professor:done` | Log time spent to Progress Log; create first recall entry in SCHEDULE.md |
| `professor:progress` | Show streak, total time, and recalls due count |
| `professor:export` | Include SCHEDULE.md data — flashcards exported as plain Q/A table to Notion; as-is to Obsidian |
| Session start | Auto-check SCHEDULE.md for due recalls; display streak and recall count |

---

## Export Compatibility

| Data | Notion | Obsidian |
|------|--------|----------|
| Streak + Total time | Page properties | Frontmatter YAML |
| Progress Log table | Notion database rows | Markdown table as-is |
| Review schedule | Notion database with Date fields | Markdown table as-is |
| Flashcards | Parse Q/A blocks → 2-column Notion table | Markdown as-is (no plugin required) |

No external plugins are required for either export target. Flashcard format is plain Markdown.

---

## Spaced Repetition Schedule (Ebbinghaus-based)

| User rating | Next review |
|------------|-------------|
| Clear (knew it well) | +7 days |
| Fuzzy (partially remembered) | +3 days |
| Forgot | +1 day |

Schedule stored in SCHEDULE.md, evaluated at session start.

---

## Implementation Scope

This design covers features for the next milestone after v2.0. Implementation should proceed in this order:

1. SCHEDULE.md schema + `professor:done` integration (time log + first recall entry)
2. `professor:recall` command
3. `professor:schedule` command (read-only)
4. Session start auto-check
5. Streak tracking in COURSE.md
6. `professor:template-export` and `professor:template-import`
7. `professor:export` updates to include SCHEDULE.md

Web UI (v2.0) can render SCHEDULE.md as a visual recall dashboard once the data schema is established.
