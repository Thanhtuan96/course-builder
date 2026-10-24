# Phase 7: Beta Report UI and Nudges - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-24
**Phase:** 7-Beta Report UI and Nudges
**Areas discussed:** Entry point & Settings link, App version source, Participant id in filename,
Day-7/day-14 nudge behavior, Preview contents

---

## Entry point & Settings link

| Option | Description | Selected |
|--------|-------------|----------|
| Inline in Settings ▸ Data via DataPanel, with Settings + Home linking/scrolling to it | No new route; panel is its own card below the backup card | ✓ |
| Separate route / new page | Needs router + App changes outside phase ownership | |
| Modal opened from DataPanel | Extra overlay pattern; research explicitly says not a modal for the nudge | |

**User's choice (orchestrator):** Panel lives in Settings ▸ Data via the existing DataPanel mount;
the Settings.jsx link and the Home nudge both navigate/scroll to that panel.
**Notes:** The discuss picker was unusable in the narrow pane, so the orchestrator supplied all five
answers in one message and they were locked verbatim.

---

## App version source

| Option | Description | Selected |
|--------|-------------|----------|
| Vite `define` `__APP_VERSION__` from root package.json + equality test | One source of truth; needs an approved edit to `studio/vite.config.js` | ✓ |
| Phase-local constant in the panel, checked against package.json by a test | No unowned file touched, but duplicates the version string | |
| Studio `package.json` version (0.1.0) | Stale private-package field, not the shipped product version | |

**User's choice:** Single source of truth from the root `package.json`, injected at build time via a
Vite `define`; a test proves it equals the package version. Editing `studio/vite.config.js` for that
one define is an approved ownership exception (no Wave 2 phase owns it).
**Notes:** Record the exception in CONTEXT.md and the plan; do not add a second exception.

---

## Participant id in filename

| Option | Description | Selected |
|--------|-------------|----------|
| First 8 characters of the participant id | Readable file name; the full UUID remains in the JSON | ✓ |
| Full 36-character UUID | Unambiguous but unwieldy | |
| Operator-supplied label | Adds onboarding work outside this phase | |

**User's choice:** `professor-beta-report-<first 8 chars>-d<N>.json`; the full participant id stays
inside the JSON, which is what Phase 10's aggregation dedupes on.

---

## Day-7/day-14 nudge behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Offsets 7 and 14 only; dismiss per checkpoint; auto-hide after that day's export; links to panel | Mirrors the non-blocking durability banner and cannot nag past an export | ✓ |
| Show from day 7 onward until exported | Contradicts "on other days it does not appear" | |
| Session-only dismissal | Day-7 dismissal could resurface on every reload | |

**User's choice:** Shown only at activation offsets 7 and 14 (local days), non-blocking, dismissal
persists per checkpoint (day7 and day14 separately), auto-hides once a report was exported that day,
and links to the panel.
**Notes:** No learning events and no meaningful writes from the banner.

---

## Preview contents

| Option | Description | Selected |
|--------|-------------|----------|
| Short localized summary + exact pretty-printed JSON, with "this is everything in the file" | Trust-building; one test proves the bytes match | ✓ |
| Raw JSON only | Honest but harder to read | |
| Summary only, download the JSON | Violates "previews the full file contents" | |

**User's choice:** Short localized human summary of the fields above the exact pretty-printed JSON
that will be downloaded, with the copy "this is everything in the file"; the downloaded bytes must
equal the previewed JSON (test it).

---

## the agent's Discretion

- Card layout, button variants, summary presentation (definition list vs compact grid) and exact
  English/Vietnamese wording within the new `betaReport` namespace.
- Whether pure helpers live in `BetaReportPanel.jsx` / `Home.jsx` themselves or a sibling module,
  as long as no file outside the phase's Owns is added.
- Ordering of summary rows; raw counts only, never percentages.

## Deferred Ideas

- Copy-to-clipboard and multi-report history.
- Rendering the report inline on Home instead of linking to Settings.
- Recording exports as learning events or new tables (explicitly out of scope — no migration,
  exporting is not a meaningful learning action).
- Percentages/cohort comparisons in the panel (Phase 10 owns aggregation).
