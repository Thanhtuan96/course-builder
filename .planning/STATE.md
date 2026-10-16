# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-17)

**Core value:** The learner builds real understanding by doing — practice → feedback → revision → a verifiable output they use in a real project — never by reading Claude's code.
**Current focus:** Phase 1 — Seams and Toolchain Prep (Wave 0, serial)

## Current Position

Phase: 1 of 13 (Seams and Toolchain Prep)
Plan: 0 of TBD in current phase
Status: Ready to plan
Last activity: 2026-10-17 — Roadmap created (13 phases, 5 waves, 46/46 v1 requirements mapped)

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: -
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**
- Last 5 plans: -
- Trend: -

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Wave structure — W0: P1; W1: P2–P6; W2: P7–P10; W3: P11–P12; W4: P13 (human-run cohort)
- [Roadmap]: Migration `0005_beta_loop.sql` owned by Phase 5 only; `0006` reserved, usable only after 0005 merges
- [Roadmap]: Lockfiles — Phase 1 owns all dependency changes; Phase 4 owns root scripts in Wave 1; Phase 12 owns root `package.json` in Wave 3
- [Roadmap]: Phase 6 splits i18n catalogs per namespace so Wave 2 phases add only their own namespace files
- [Roadmap]: SEC-12 (loopback bridge URL + CSP) and Studio-side `#token=` pairing read live in Phase 6; Phase 2 emits the fragment — `#token=<value>` is the contract
- [Roadmap]: Capstone-surface "Revise"/attempt history is built by Phase 9 in capstone components; LOOP-01..03 requirements are owned by Phase 8
- [Roadmap]: Activation day = offset 0; week-1 = offsets 1–7; week-2 return = offsets 8–14 (local calendar days)
- [Roadmap]: Vitest 5 upgrade then `test.projects`; chained `npm test` is the documented fallback

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 5 must freeze its public API (`events.js`, repo attempt/revision reads, report schema v1) in its plan before Wave 2 starts
- Phase 2 research: safe non-interactive flags per agent CLI; Windows `.cmd` shims (likely documented as unsupported for beta)
- Phase 12 real-provider UAT cannot run in CI — it is a hard gate before publishing `1.6.0-beta.x`
- Phase 13 BETA-01 owner dogfood gates participant recruiting

## Session Continuity

Last session: 2026-10-17
Stopped at: Roadmap and state initialized
Resume file: None
