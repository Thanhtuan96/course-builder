---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Phases
current_phase: 21-research-and-polish-current-agent-plan-to-work-in-real-world
current_plan: 04
status: executing
last_updated: "2026-03-25T12:10:36.430Z"
progress:
  total_phases: 26
  completed_phases: 17
  total_plans: 38
  completed_plans: 39
---

# Session State

## Project Reference

See: .planning/PROJECT.md
**Core value:** The learner builds real understanding by doing — not by reading Claude's code.
**Current focus:** v2.1 Public Launch

## Position

**Milestone:** v2.1 Public Launch
**Current phase:** 21-research-and-polish-current-agent-plan-to-work-in-real-world
**Current plan:** 04
**Status:** In progress (Plan 03 complete, feature branch active)

## Accumulated Context

### Roadmap Evolution
- v1.0 completed: Plugin scaffold, all 14 commands, notes, export, archive, CLI
- v1.1 completed: Git worktree courses, auto-create exercise files, agent specialization
- v2.0 in progress: Phase 13 (React client) and Phase 14 (Integration) done; phases 15-17 still pending
- v2.1 roadmap defined: Phases 18-20 — cloud deploy, auth, OSS SKILL registry
- Phase 21 added: research and polish current agent plan to work in real world

### v2.1 Phase Summary
- **Phase 18: Cloud Deployment** — DEFERRED. Needs filesystem + CLI replacement for serverless. Revisit after CLI community active.
- **Phase 19: Authentication** — DEFERRED. Depends on Phase 18.
- **Phase 20: CLI Install Command** — ACTIVE. `npx course-professor install <course-name>` + `npx course-professor list`. Fetches from `professor-skills/registry` GitHub directly. No server needed.

### v2.1 Goals
- ~~Cloud deployment (Vercel) with public URL and custom domain~~ — Deferred
- ~~Email + GitHub OAuth user authentication~~ — Deferred
- `npx course-professor install <course-name>` — install a community course template locally
- `npx course-professor list` — browse available courses from registry

### Registry Repo (External — Complete)
- **Repo:** `professor-skills/registry` (separate repo, not this one)
- **Status:** Built and validated — `courses/` + `skills/` separation, `index.json` with `courses[]` + `skills[]` arrays
- **Philosophy:** COURSE = syllabus template for learning. SKILL = real problem-solver built by a learner after completing a course (earned gate).
- **Contribution:** courses/ open to anyone via PR. skills/ earned — must complete course + capstone first.
- **No server:** CLI fetches `index.json` from GitHub raw URL, downloads files directly. GitHub Actions rebuild index on merge.
- **Phase 21 (Vercel server) removed** — was irrelevant once web platform deferred.

### Phase 21 Decisions
- All 4 specialized agents (Coach, Spotter, Navigator, Researcher) use mode: subagent + model: inherit in frontmatter for OpenCode compatibility
- Delegation return language replaced with platform-agnostic block referencing Claude Code (automatic), Cursor (/agent-name), Gemini CLI / OpenCode (@agent-name)
- Spotter agent includes inline fallback for when Coach is unavailable
- Navigator activation triggers reframed without command name dependencies for cross-platform compatibility

### Phase 15 Decisions
- Time tracking uses ISO 8601 timestamps with minute-precision duration calculation
- Streak tracking uses calendar-day based streak with yesterday/today/2+days logic
- Duration display format: N min / Nh MMm based on length
- Streak reset after 2+ days of inactivity (forgiving approach)
- Fire emoji (🔥) for streaks ≥ 3 days for visual engagement

### Platform Roadmap Context
- Full roadmap design spec: docs/superpowers/specs/2026-03-13-platform-roadmap-design.md
- v3.0: Non-tech learner expansion (phases 21-23)
- v3.1: SKILL Creator Loop (phases 24-27)
- v4.0: Marketplace — freemium + payments + revenue share (phases 28-33)

### Deferred Work (Not in Current Plan)
- **Cloud Deployment (Vercel)** — Deferred. Focus on CLI and SKILLs first. Will revisit after core CLI is complete.
  - Previous attempt: Phase 18 (reverted)
  - Reason: User prefers to focus on CLI/skills first
  - Will be re-added to roadmap when ready

### Pending Todos
- 4 todos (see .planning/todos/pending/)

## Session Log

- 2026-03-07: v1.0 milestone complete - all features shipped
- 2026-03-07: Started v1.1 - Git Worktree Courses
- 2026-03-07: Completed plan 07-01 - Git Worktree Courses implementation
- 2026-03-08: Planned Phase 08 - Auto-create exercise files
- 2026-03-08: Completed plan 08-01 - Auto-create exercise files implementation
- 2026-03-08: Started v2.0 - Local Web UI
- 2026-03-11: Completed plan 10-02 - Researcher delegation implementation
- 2026-03-11: Completed plan 10-03 - Researcher agent template
- 2026-03-11: Completed plan 11-01 - Research-enhanced hints with keywords
- 2026-03-11: Added Phase 17 - Auto generate exercise files
- 2026-03-11: Started v2.0 - Local Web UI (Phase 13)
- 2026-03-11: Completed plan 13-01 - Client components infrastructure
- 2026-03-11: Completed plan 13-02 - React components implementation
- 2026-03-13: Completed plan 14-01 - Integration (Express server, build, production mode)
- 2026-03-13: Started v2.1 - Public Launch milestone
- 2026-03-13: Defined v2.1 requirements (DEPL-01-03, AUTH-01-03, REG-01-03)
- 2026-03-14: Created v2.1 roadmap — phases 18, 19, 20 added to ROADMAP.md
- 2026-03-14: Completed plan 15-01 - SCHEDULE.md schema and professor:done integration
- 2026-03-14: Completed plan 15-02 - Time-per-section and streak tracking for COURSE.md
- 2026-03-14: Completed plan 15-03 - professor:recall and professor:schedule commands
- 2026-03-14: Completed plan 15-04 - Retention integration with session start and export
- 2026-03-15: Completed plan 16-01 - Template export/import for course sharing
- 2026-03-15: Completed plan 17-01 - Auto-generate exercise files
- 2026-03-15: Deferred phases 18-20 (Cloud Deployment, Auth, OSS Registry) — focus on CLI/skills first
- 2026-03-15: Completed plan 17.1-02 - Coach agent integration (review, done, stuck commands wired to Coach)
- 2026-03-15: Phase 20 re-scoped to CLI install command only (no server, no webhook) — registry repo is external and complete
- 2026-03-15: Phase 21 (Vercel-compatible server) removed — irrelevant while web platform is deferred
- 2026-03-15: Registry repo (professor-skills/registry) complete externally — courses/+skills/ split, validate+build scripts, GitHub Actions
- 2026-03-16: Completed plan 17.1.1.1.1-02 — Professor orchestrator refactor (stripped command behaviors, added routing table reference)
- 2026-03-16: Completed plan 17.1.1.1.1-03 — Added 5 missing routing entries (quiz, template-export, template-import, worktrees, switch)
- 2026-03-25: Completed plan 21-01 — Professor.md cross-platform polish (removed routing:/actions:, replaced AskUserQuestion, added delegation block, trimmed to 353 lines)
- 2026-03-25: Completed plan 21-02 — All 4 specialized agents (Coach, Spotter, Navigator, Researcher) polished with mode: subagent, model: inherit, and platform-agnostic delegation return language
- 2026-03-25: Completed plan 21-03 — Synced agents/ to shared/ (navigator.md now present), added Agent Architecture table to SKILL.md documenting all 5 agents
