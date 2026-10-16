# Product Strategy: Professor v2.0

**Date:** 2026-03-08
**Status:** Approved — basis for v2.0 milestone planning

## Vision

Professor evolves from a CLI-only plugin into a dual-mode product:
- **CLI (free)** — tech users, own API key, all 14+ commands
- **Local Web (free)** — tech users, own API key, better UX (split-pane, markdown rendering)
- **Cloud Web (paid)** — non-tech users, zero setup, subscription model

One codebase (`MODE=local|cloud`). One public repo. Cloud protected by env secrets.

## Market Position

Professor is the **only AI tutor that never gives answers across the entire learning journey** — including hints (layered), review (Socratic), and capstone (solo build). This is the core differentiator.

Market: AI tutoring projected $7.99B by 2030 (30.5% CAGR).

## User Tiers

| Tier | Access | Cost | Setup |
|------|--------|------|-------|
| Tech user | CLI | Free forever | Own API key |
| Tech user | Local Web | Free | Own API key + `npx course-professor web` |
| Non-tech user | Cloud Web | Paid (~$10-15/mo) | Zero — just sign up |

## Priority Order (Hướng C — Hybrid)

### Step 1: Critical Bug Fixes (1-2 days, before anything else)
- Fix `hooks/pre-compact.js` using CommonJS in ESM project
- Fix CLI multi-agent prompt (reads nothing, just exits)
- Fix YAML regex parsing (breaks on `:` in section titles)

### Step 2: Complete v1.1 (Phase 7 — Git Worktree Courses)
- Already planned, execute as-is

### Step 3: Quick Wins (1 week, high ROI)
- Onboarding wizard for first-time users
- Recommended pacing in COURSE.md (30min/section estimate)
- Exercise starter templates for `professor:next`
- Capstone phase softening (allow `professor:stuck` for concepts)

### Step 4: v2.0 Web UI (6-8 weeks)
See phases v2-01 through v2-05 below.

## v2.0 Phases

### v2-01: Critical Stability Fixes
**Goal:** Fix 3 critical bugs before any expansion work
- Hook ESM fix
- CLI prompt fix
- YAML parser fix

### v2-02: Local Web UI
**Goal:** `npx course-professor web` opens localhost:3000 with split-pane UI
- Express backend + React/Vite frontend
- Streaming chat with Professor
- Lecture panel (LECTURE.md rendered)
- Context-aware command pills
- WebSocket for live lecture refresh
- See: `docs/plans/2026-03-08-web-ui-implementation.md`

### v2-03: Cloud Foundation
**Goal:** Deploy hosted version with auth + DB
- Clerk auth (Google + Email login)
- Supabase PostgreSQL (users, courses, progress)
- Railway deployment
- `config.js` MODE switch (local vs cloud)
- Course data model in DB (mirrors COURSE.md schema)

### v2-04: Billing + Onboarding
**Goal:** Non-tech users can sign up, try free, then pay
- Stripe monthly subscription + 7-day free trial
- Onboarding wizard (3 steps: What to learn → Level → Goal)
- Landing page
- Paywall after trial

### v2-05: Retention Features
**Goal:** Keep paid users engaged (reduce churn)
- Learning streak (daily engagement tracking)
- Spaced repetition reminders (email after 1/3/7 days)
- Progress dashboard with visual charts
- Certificate on capstone completion
- Shareable progress link (viral growth)

## Architecture Decision

### One Repo, Two Modes
```
course-learning-plugin/ (public repo)
├── agents/, commands/, hooks/    ← Core plugin (shared)
├── bin/cli.js                    ← Free CLI
├── web/
│   ├── server.js                 ← Express (local + cloud)
│   ├── config.js                 ← MODE: 'local' | 'cloud'
│   ├── routes/
│   └── client/                   ← React + Vite
└── cloud/
    ├── db/                       ← Supabase schema
    ├── auth/                     ← Clerk
    └── billing/                  ← Stripe
```

Cloud mode requires secrets (`STRIPE_SECRET_KEY`, `DATABASE_URL`, `CLERK_SECRET_KEY`) — source code is public but service requires infrastructure.

## Refactoring Needed (Before Cloud — NOT before Web)

The following refactoring is needed before `cloud/` can be built safely.
It is NOT needed before Local Web UI:

1. **Eliminate `shared/` folder duplication** — use root `commands/` as source of truth
2. **CourseManager class** — centralize all COURSE.md read/write logic
3. **Command interface contract** — JSON Schema for command inputs/outputs
4. **Configuration abstraction** — `src/config.js` with env var support

These can be done incrementally during v2-03 (Cloud Foundation), not as a prerequisite for v2-02.

## Feature Gaps to Address in v2.0

### Quick wins (already identified, low effort)
| Feature | Effort | Phase |
|---------|--------|-------|
| Concept Glossary (`professor:glossary`) | 2h | v1.1 or v2-01 |
| Capstone softening (conceptual stuck allowed) | 1h | v2-01 |
| Recommended pacing in new-topic | 1h | v2-01 |
| Exercise starter templates | 4h | v2-02 |
| Visual progress bar | 1h (web only) | v2-02 |

### Must-have for paid web
| Feature | Phase |
|---------|-------|
| Adaptive diagnostic (replace self-assessment) | v2-04 |
| Learning streak | v2-05 |
| Spaced repetition reminders | v2-05 |
| Certificate on capstone | v2-05 |
| Shareable progress link | v2-05 |

## Out of Scope for v2.0

- Community/peer discussion (v3.0)
- Team/organization accounts (v3.0)
- Mobile app (v3.0)
- Prerequisite graphs / branching curricula (v3.0)
- Instructor dashboard for B2B (evaluate after launch)

---
*Strategy approved: 2026-03-08 via brainstorming session*
*Based on: 4-agent codebase analysis + UX/product research*
*Design docs: docs/plans/2026-03-08-web-ui-design.md, docs/plans/2026-03-08-product-roadmap-design.md*
