---
phase: 06-studio-beta-debt
plan: 02
subsystem: ai-generation
tags: [provider-errors, i18n-detection, json-generation]

requires:
  - phase: 06-studio-beta-debt
    provides: per-namespace errors catalog (plan 06-01)

provides:
  - WrongLanguageError (code wrong_language) + wrongLanguageError factory
  - Repaired-value language re-check in createGenerateJson
  - Localized errors.wrong_language in en/vi
  - DEBT-01 regression tests across the repair ladder

affects: [07-beta-report-ui, 08-revision-loop-ui]

actuals:
  tokens: 0
  tasks: 4
  commits: 1

tech-stack:
  added: []
  patterns: [typed provider error taxonomy, one-repair language ladder]

key-files:
  created: []
  modified:
    - studio/src/lib/ai/errors.js
    - studio/src/lib/ai/provider-utils.js
    - studio/src/lib/i18n/en/errors.json
    - studio/src/lib/i18n/vi/errors.json
    - studio/test/ai.test.js

key-decisions:
  - "D-01: throw WrongLanguageError instead of returning wrong-language JSON"
  - "D-02: re-check the repair and keep exactly one repair attempt"
  - "D-03: central coverage in createGenerateJson (syllabus, quiz, flashcards, capstone)"
  - "D-04: localized via ERROR_HINTS + errors namespace (no custom message)"
  - "D-05: errors.js touched under the recorded ownership exception"

requirements-completed: [DEBT-01]

coverage:
  - id: D1
    description: "Wrong-language JSON after the repair retry becomes a retryable typed error"
    requirement: DEBT-01
    verification:
      - kind: unit
        ref: "studio/test/ai.test.js (generateJson wrong-language handling)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The error is localized and retryable in the existing UI"
    requirement: DEBT-01
    verification:
      - kind: unit
        ref: "studio/test/ai.test.js (catalog + ErrorNotice wiring assertions)"
        status: pass
    human_judgment: false

duration: 8min
completed: 2026-10-22
status: complete
---

# Phase 6 Plan 2: Typed Wrong-Language Error Summary

**A model that answers in the wrong language twice now produces a localized, retryable error instead of silently storing wrong-language course content.**

## Performance

- **Duration:** ~8 min
- **Tasks:** 4
- **Files changed:** 5

## Accomplishments

- Added `wrong_language` to the provider error taxonomy and exported `WrongLanguageError` / `wrongLanguageError(cause)`.
- Re-checked both validation and language on the single repair result; removed both fallback returns that used to leak wrong-language JSON.
- Abort and transport errors from the repair still propagate unchanged; valid repairs are returned.
- Added EN/VI `errors.wrong_language` copy (English byte-identical to `ERROR_HINTS.wrong_language`) so `ErrorNotice` localizes it.
- Added seven regression tests covering wrong repair language, successful repair, invalid repair, abort, transport error, no-language path, and catalog wiring.

## Task Commits

1. **Tasks 1–4:** `0585d07` — `feat(06-02): throw retryable wrong-language error`

## Files Created/Modified

- `studio/src/lib/ai/errors.js` — new code/class/factory
- `studio/src/lib/ai/provider-utils.js` — repaired-value re-check + typed throw
- `studio/src/lib/i18n/{en,vi}/errors.json` — localized copy
- `studio/test/ai.test.js` — DEBT-01 regression suite

## Decisions Made

D-01 through D-05 as locked. No call-site edits were needed: all four surfaces already pass `language` and already expose a retry action (research §2.4).

## Deviations from Plan

None.

## Issues Encountered

None.

## Verification

- `npm --prefix studio test` → 45 files / 386 tests passed.
- Focused ai + i18n coverage → 29 tests passed.

## Next Phase Readiness

The localized `wrong_language` code is available to every current and future `generateJson` caller for free.
