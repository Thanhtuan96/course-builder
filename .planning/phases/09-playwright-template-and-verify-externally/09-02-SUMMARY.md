---
phase: 09-playwright-template-and-verify-externally
plan: "02"
subsystem: data
tags: [playwright, course-template, i18n, bilingual, idempotent-seeding, vitest, react]

# Dependency graph
requires:
  - phase: 05-beta-data-foundation
    provides: "createCourse (content_md → lesson_versions, quiz_seed JSON) and the immutable createCapstone"
  - phase: 06-studio-beta-debt
    provides: "i18n/<lang>/<namespace>.json auto-merge so a new namespace needs no index.js edit"
  - phase: 09-01
    provides: "Nothing imported, but the same 'pure data + static contract' discipline and the frozen evidence payload this template's R6 refers to"
provides:
  - "Bilingual (en/vi) Playwright E2E course: 5 written lessons with 5-question quizzes, 5-item pre-flight checklist"
  - "Immutable R1–R7 capstone seeded with external_id `template:playwright-e2e`, kind `programming`, tests null"
  - "seedPlaywrightTemplate({ language }) — zero model calls, idempotent, StrictMode-safe; findPlaywrightTemplateCourse()"
  - "New Course 'Start from a template' card gated by the pre-flight checklist"
  - "playwrightTemplate i18n namespace (card chrome + rubric.r1…r7 labels) in en and vi"
affects: [09-03, 09-04, 09-05, "phase-10 aggregation", "phase-12"]

# Actuals (#2632) — chars/4 over the realized diff.
actuals:
  tokens: 27765
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Template course = pure data module + a seeder that calls only createCourse/createCapstone (demo-course.js pattern, bilingual)"
    - "Idempotency by in-flight promise memoised per normalized language, plus createCapstone's early return as the immutability guarantee"
    - "Teaching-rule guard test: lesson bodies may name flags in prose but must not contain a complete spec or a copyable run command"
    - "Byte-scan test for provider-free construction (no getProvider/createGenerateJson/generator/fetch in the module source)"

key-files:
  created:
    - studio/src/data/templates/playwright-e2e.js
    - studio/src/data/templates/playwright-e2e.vi.js
    - studio/src/lib/i18n/en/playwrightTemplate.json
    - studio/src/lib/i18n/vi/playwrightTemplate.json
    - studio/test/capstone-template.test.js
  modified:
    - studio/src/pages/NewCourse.jsx

key-decisions:
  - "English and Vietnamese variants are separate modules with one exported object each; playwrightTemplateFor returns a shallow copy so callers cannot mutate the module constant"
  - "findPlaywrightTemplateCourse detects the course through the capstone external_id (no course column, no migration), and re-reads it with getCourse so lessons come back"
  - "seedPlaywrightTemplate waits for an in-flight seed of another language and then re-checks, so only ever one template course exists regardless of call order"
  - "The rubric is passed to createCapstone unchanged; stored criteria keep { key, name, solid } in R1–R7 order and never go through the 4–6-criteria validator"
  - "The CTA label switches cta → notReady → seeding; the checklist is a hard gate on the button, not a blocker on reading the course"
  - "The template card reads playwrightTemplateFor(settings.language) while seeding uses effectiveLanguage, so the 'different language for this course' disclosure still applies to the seeded course"

patterns-established:
  - "Bundled content stays provider-free: a source scan fails the build if the template module ever references a provider, generator or fetch"
  - "Template identity lives on the capstone row (`external_id`), so `capstoneEvidenceMode` (09-03) can branch on data rather than on a new schema field"

requirements-completed: [PW-01, PW-02]

coverage:
  - id: D1
    description: "Bilingual Playwright course content: reviewed English title, 5 lessons with pre-written bodies and 5 four-option quizzes each, 5-item pre-flight checklist, and a fixed R1–R7 capstone brief"
    requirement: PW-01
    verification:
      - kind: unit
        ref: "studio/test/capstone-template.test.js#Playwright template content (en) — 8 cases"
        status: pass
      - kind: unit
        ref: "studio/test/capstone-template.test.js#Playwright template content (vi) — 8 cases"
        status: pass
      - kind: unit
        ref: "studio/test/capstone-template.test.js#cannot drift structurally between the two languages"
        status: pass
    human_judgment: false
  - id: D2
    description: "Lesson copy teaches concepts without handing over a complete spec or a copyable run command (commands live in the app, D-16)"
    requirement: PW-01
    verification:
      - kind: unit
        ref: "studio/test/capstone-template.test.js#never puts a complete runnable spec or a copyable run command in lesson text"
        status: pass
    human_judgment: false
  - id: D3
    description: "Seeding creates exactly 1 course / 5 lessons / 5 lesson_versions / 1 capstone with zero model calls, and a second (or concurrent) seed adds no rows and returns the identical immutable capstone"
    requirement: PW-01
    verification:
      - kind: unit
        ref: "studio/test/capstone-template.test.js#seeds one course with five readable lessons and their quizzes"
        status: pass
      - kind: unit
        ref: "studio/test/capstone-template.test.js#creates nothing on a second seed and returns the identical immutable row (T-09-07)"
        status: pass
      - kind: unit
        ref: "studio/test/capstone-template.test.js#collapses two concurrent seeds into one course (React StrictMode double invoke)"
        status: pass
      - kind: unit
        ref: "studio/test/capstone-template.test.js#never calls a model: seeding works with an empty settings object and no fetch"
        status: pass
    human_judgment: false
  - id: D4
    description: "New Course offers the template above the free-text form behind a five-item pre-flight checklist, with the playwrightTemplate namespace complete in both languages"
    requirement: PW-01
    verification:
      - kind: unit
        ref: "studio/test/capstone-template.test.js#renders the template card with all five pre-flight labels above the free-text form"
        status: pass
      - kind: unit
        ref: "studio/test/capstone-template.test.js#keeps the free-text and skip-AI affordances so the template is additive"
        status: pass
      - kind: unit
        ref: "studio/test/i18n-keys.test.js + i18n-catalogs.test.js (unchanged, green)"
        status: pass
    human_judgment: false
  - id: D5
    description: "The lesson copy and the Vietnamese translation actually teach the concept at Intermediate level and read naturally"
    verification: []
    human_judgment: true
    rationale: "Pedagogical quality and translation fluency cannot be asserted mechanically; the deterministic tests only prove length, shape, rubric keys and the absence of a complete spec."

metrics:
  duration: 9min
  completed: 2026-10-25
  status: complete
---

# Phase 9 Plan 02: Playwright Template and Template Entry Summary

**Bilingual, provider-free Playwright E2E course (5 written lessons + 5-item pre-flight + immutable R1–R7 capstone) seeded idempotently through `createCourse`/`createCapstone` and offered from New Course behind a tick-to-start checklist**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-10-24T15:44:27Z
- **Completed:** 2026-10-24T15:53:39Z
- **Tasks:** 3
- **Files modified:** 6 (5 created, 1 modified)

## Accomplishments

- `studio/src/data/templates/playwright-e2e.js` + `.vi.js`: the whole course as local content — title,
  description, goal, Intermediate/programming level, five pre-written lessons (2 875–3 297 chars of
  `content_md` each) with five four-option quiz questions each, five pre-flight items, and the fixed
  seven-criterion capstone with headings matching `BRIEF_HEADINGS` in both languages.
- `seedPlaywrightTemplate({ language })` seeds course + lessons (with `content_md`, so lesson versions
  exist without a model) + the immutable capstone. **Zero model calls**: no provider, no JSON
  generation, no fetch — verified by an empty-settings run with a wrapped `globalThis.fetch`, and by a
  source scan that fails if `getProvider` / `createGenerateJson` / the AI capstone generator /
  `validateCapstone` / `fetch(` ever appears in the module.
- Idempotence at three levels: `findPlaywrightTemplateCourse()` short-circuits, the in-flight promise is
  memoised per language (StrictMode / double click), and `createCapstone` early-returns the existing
  row — so the brief cannot be regenerated and two learners in a cohort grade against the same rubric.
- `NewCourse.jsx` gains a "Start from a template" card **above** the free-text form: five required
  checkboxes, a hint, and a CTA that is disabled and labelled `notReady` until all five are ticked
  (`seeding` while the seeder runs). The AI/free-text/skip-AI flow is untouched.
- Two new catalogs (`playwrightTemplate.json` in en + vi) with identical leaf key sets; no existing
  namespace file was edited.

## Lessons (titles per language)

| # | English (`PLAYWRIGHT_TEMPLATE`) | Vietnamese (`PLAYWRIGHT_TEMPLATE_VI`) |
|---|---|---|
| 1 | What a reliable end-to-end test actually is | Một bài kiểm thử end-to-end đáng tin thật sự là gì |
| 2 | Find elements the way a user does | Tìm phần tử theo cách người dùng làm |
| 3 | Let Playwright wait for you | Để Playwright chờ thay bạn |
| 4 | Make it runnable twice, alone | Chạy được hai lần, và chạy một mình |
| 5 | Prove it: projects, reporters, evidence | Chứng minh: project, reporter, bằng chứng |

Every lesson follows the learning-core section spirit (`Objectives → Explanation → Worked example →
Common misconceptions → Check your understanding → Exercise → Key takeaways → Resources`) and links
`playwright.dev` docs. Lesson 5 names `--project=chromium`, `--reporter=json` and `--reporter=list` in
prose only; **no lesson contains a complete spec or a runnable invocation** — the copyable command is
09-04's `EVIDENCE_COMMANDS` (D-16).

## Seeded row counts (memory adapter, measured)

| Operation | courses | lessons | lesson_versions | capstones |
|---|---|---|---|---|
| first `seedPlaywrightTemplate({ language: 'en' })` | 1 | 5 | 5 | 1 |
| second seed (same or no language) | 1 | 5 | 5 | 1 (same `id`, `created: false`) |
| two concurrent seeds | 1 | 5 | 5 | 1 |

Stored capstone: `kind: 'programming'`, `tests: null`, `hidden_answers_json: null`,
`external_id: 'template:playwright-e2e'`, `brief_md` byte-identical to the variant.

## Rubric keys

Stored as `[{ key, name, solid }]` in order — `R1`, `R2`, `R3`, `R4`, `R5`, `R6`, `R7` — with `name`
and `solid` in the course language. Localized display labels live separately at
`playwrightTemplate.rubric.r1` … `r7`. R6's `solid` requires a real passing test with
`expectedStatus: passed` in a Chromium (or default) project and 0 failures.

## i18n keys added (identical in en and vi, 14 leaf keys)

`playwrightTemplate.card.title`, `.description`, `.checklistTitle`, `.checklistHint`, `.cta`,
`.notReady`, `.seeding`, and `playwrightTemplate.rubric.r1` … `.r7`.

## Files Created/Modified

- `studio/src/data/templates/playwright-e2e.js` — en variant, ids, frozen `PLAYWRIGHT_RUBRIC_KEYS`,
  `playwrightTemplateFor`, `findPlaywrightTemplateCourse`, `seedPlaywrightTemplate` (925 lines)
- `studio/src/data/templates/playwright-e2e.vi.js` — vi variant only, no seeder, no imports (803 lines)
- `studio/src/lib/i18n/en/playwrightTemplate.json` — card chrome + R1–R7 labels
- `studio/src/lib/i18n/vi/playwrightTemplate.json` — Vietnamese twin
- `studio/src/pages/NewCourse.jsx` — template card + `startTemplate()` (197 changed lines)
- `studio/test/capstone-template.test.js` — 32 tests: content, parity, teaching rule, seeding, render

## Decisions Made

- **Variant selection and copying.** `playwrightTemplateFor` resolves through `normalizeLanguage` (so
  `'Vietnamese'`, `'vi-VN'`, `'vi'` all select the Vietnamese course, `'es'` falls back to English) and
  returns `{ ...variant }` — mutating the result cannot corrupt the module constant.
- **Template identity on the capstone.** `findPlaywrightTemplateCourse()` lists courses, reads each
  capstone and matches `external_id === 'template:playwright-e2e'`, then re-reads via `getCourse` so
  lessons come along. No new column, no migration (D-02).
- **Cross-language concurrency.** If a seed for another language is in flight, the second call awaits
  it and re-enters; the second entry finds the existing course and returns `created: false`. Only one
  template course can ever exist.
- **Card language vs course language.** The card chrome and checklist follow `settings.language`; the
  seeded course follows `effectiveLanguage`, so the "use a different language for this course"
  disclosure still decides the course language.
- **No route, no schema.** The template is an additive card on `NewCourse` (D-15); the AI/free-text
  path, `propose`, `start` and `makeSyllabus` are unchanged.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Unescaped backticks inside the Vietnamese lesson template literals**
- **Found during:** Task 1 (first focused test run)
- **Issue:** Markdown code spans written with raw `` ` `` inside a JS template literal terminated the
  literal (`src/data/templates/playwright-e2e.vi.js:203`), so the module failed to parse.
- **Fix:** Escaped the backticks (`\``) in six places in the Vietnamese lesson bodies; the English
  lessons were already escaped.
- **Files modified:** `studio/src/data/templates/playwright-e2e.vi.js`
- **Verification:** `npm --prefix studio test -- --run test/capstone-template.test.js` → 24 passed.
- **Committed in:** `e98793c`

**2. [Rule 1 - Bug] The provider-free source scan flagged words used in my own comments**
- **Found during:** Task 2 (first seeding run)
- **Issue:** The scan is deliberately a dumb substring check, and the seeder comment named
  `validateCapstone` and `generateCapstoneForCourse` while explaining why they must not be used — the
  scan cannot tell a comment from a call.
- **Fix:** Re-worded the comment ("the 4–6-criteria validator", "the AI capstone generator") instead of
  weakening the scan.
- **Files modified:** `studio/src/data/templates/playwright-e2e.js`
- **Verification:** 30 passed in the focused file.
- **Committed in:** `76156cc`

### Notes (not deviations)

- The row-count assertions read the memory adapter directly (`adapter.list('capstones')`,
  `adapter.list('lesson_versions')`) because the repo exposes `getCapstone(courseId)` but no capstone
  list. The **seeder** itself only ever calls `createCourse` / `createCapstone` / `listCourses` /
  `getCapstone` / `getCourse`.
- Task 3's acceptance mentions "calls `seedPlaywrightTemplate` exactly once per click". With
  `renderToString` there is no DOM to click, so the guarantee is proven where it matters: the button is
  `disabled` until the checklist is complete (asserted on the rendered markup), `startTemplate` returns
  early while `templateSeeding` is true, and the seeder itself collapses concurrent calls into one
  course (Task 2 test). Adding jsdom/react-test-renderer would be a dependency change, which this phase
  forbids.
- `studio/test/capstone-template.test.js` also asserts the English title, quiz shape, pre-flight ids and
  the absence of a complete spec in **both** variants, so the content gate (Gate A) is enforced for
  future edits, not just once.

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both were inside the owned files, changed no contract, and kept the plan's scans
strict rather than relaxing them. Nothing in the artifact list differs from the plan.

## Verification

- `npm --prefix studio test -- --run test/capstone-template.test.js` → **32 passed / 1 file**
- `npm --prefix studio test -- --run test/capstone-template.test.js test/i18n-keys.test.js test/i18n-catalogs.test.js`
  → **39 passed / 3 files**
- `npm --prefix studio test` → **600 passed / 57 files** (baseline before this plan: 568 / 56)
- `npm test` (root + studio) → **1170 passed / 86 files**
- `git diff --name-only` shows only the six owned files: no `package.json`, no lockfile, no migration,
  no `DB_VERSION`, no existing i18n namespace, no `STATE.md` / `ROADMAP.md`.

## Zero model calls — how it is proven

1. The template module imports exactly three things: `normalizeLanguage`, the repo helpers, and the
   Vietnamese variant. No settings, no `lib/ai/**`, no prompt module.
2. A source scan fails if `getProvider`, `createGenerateJson`, the AI capstone generator,
   `validateCapstone` or `fetch(` appears in the module text.
3. A test wraps `globalThis.fetch`, seeds twice (en, then vi) with an empty options object and asserts
   **0** fetch calls.
4. Seeding works against a bare memory adapter with no settings loaded at all.

## Next Phase Readiness

- 09-03 can branch on `capstone.external_id === 'template:playwright-e2e'` (or on the R1–R7 keys) — the
  row is already shaped for `capstoneEvidenceMode(capstone)`.
- The seeded rubric is `[{ key: 'R1'…'R7', name, solid }]`; display labels are
  `playwrightTemplate.rubric.r1`…`r7` in both languages. Do not rename either.
- 09-04 owns the only copyable run command (`EVIDENCE_COMMANDS`); lesson 5 deliberately does not contain
  one, so the course copy cannot drift with Playwright versions.
- The capstone is seeded once and has no update path: if anyone needs different lesson text later, that
  is a new `external_id`, not an edit (D-01 reversibility note).

---

*Phase: 09-playwright-template-and-verify-externally*
*Completed: 2026-10-25*

## Self-Check: PASSED

- Files exist: `studio/src/data/templates/playwright-e2e.js`,
  `studio/src/data/templates/playwright-e2e.vi.js`, `studio/src/lib/i18n/en/playwrightTemplate.json`,
  `studio/src/lib/i18n/vi/playwrightTemplate.json`, `studio/test/capstone-template.test.js`,
  `studio/src/pages/NewCourse.jsx`
- Commits exist: `e98793c`, `76156cc`, `421a751`
- Focused suite 32 passed; i18n trio 39 passed; Studio suite 600 passed / 57 files; root+studio 1170
  passed / 86 files
