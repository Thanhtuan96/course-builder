# Task brief: Phase 35 — One learning language + Studio i18n (vi/en) + enforced output language

Own git worktree from `feat/studio-local-first` AFTER Phases 33 and 26c are merged (you are the only Studio worker).
Small conventional commits. Do NOT push.

## Evidence (user report + orchestrator check of ~/.professor/professor.db)
User (Claude Code via bridge) reports the generated syllabus, lesson content, quiz/flashcards/tutor, section headings and
the whole UI do not follow the language they chose. Findings: language is fragmented — UI is English-only; Settings has a
separate "Tutor language" (default English); NewCourse has a separate "Lesson language" that DEFAULTS to settings.language
(English), so unless the learner changes it everything is English; lesson section headings are an English template;
nothing verifies the output language. (A course created with the dropdown set to Vietnamese did get a Vietnamese
syllabus and `courses.language = 'Vietnamese'`.)

## Requirements (add to REQUIREMENTS.md as LANG-01..05 in your summary; orchestrator will record them)
- **LANG-01 one learning language**: `settings.language` is the single learning language (BCP-47 code: `vi`, `en`, …,
  with display names; migrate old values 'Vietnamese'/'English' → codes; `courses.language` values migrated in the repo
  layer on read). Chosen in onboarding step 1 (preselect from `navigator.language`), shown in Settings as
  "Learning language". Remove the separate "Tutor language". NewCourse defaults to it, with an "Use a different language
  for this course" disclosure. `courses.language` stays the per-course override.
- **LANG-02 UI i18n**: tiny i18n layer `studio/src/lib/i18n/` (`t(key, params)`, `useT()`, `vi.json`, `en.json`, fallback
  en, plural-safe params) — no heavy deps. Translate ALL user-facing strings: layout/nav, onboarding, Home, NewCourse,
  Course, Lesson, Practice (quiz/flashcards/review), Tutor (quick actions incl. capstone mode copy), Capstone pages,
  Settings, DataPanel, errors + hints (ProviderError hints), empty states, demo course (ship a Vietnamese demo course
  variant: seeded by language on first run). Add a test that every key used in `src/**` exists in both json files.
- **LANG-03 localized lesson structure**: section headings, "Misconception/Reality", "Answers to check yourself",
  "Verify it yourself", capstone headings are localized by the COURSE language (reuse/extend whatever Phase 33 added;
  keep stable internal section ids).
- **LANG-04 enforced output language**: every prompt builder states the language at the top of the system prompt AND
  appends a final one-line instruction to the last user message ("Answer only in Vietnamese."). After generation run a
  dependency-free language check (`lib/i18n/detect.js`: for `vi` → ratio of Vietnamese diacritic letters among letters
  above a threshold; for `en` → ASCII-letter ratio; generic fallback = stopword hit-rate for supported languages).
  Lesson/tutor/streamed text: if the check fails, show a small notice and auto-regenerate ONCE with a stronger
  instruction (store both versions). JSON (syllabus/quiz/cards/capstone): check every string field; on failure use the
  generateJson repair retry with the language instruction. Unit-test the detector on real Vietnamese/English samples
  (incl. code-heavy programming lessons — ignore fenced code when measuring).
- **LANG-05 change course language**: Course page action "Change language" → updates `courses.language`; existing lesson
  versions stay; next generations use the new language; offer "Regenerate this lesson in <language>" (new version).

## Files you own
`studio/src/lib/i18n/**` (new), every `studio/src/**/*.jsx` for string extraction only (no behaviour changes beyond
LANG-01..05), `lib/settings.js`, `lib/prompts/*.js` (language instruction + localized headings), `lib/ai/provider-utils.js`
(language check hook in generateJson), `data/demo-course*.js`, tests, `studio/README.md` (language section).

## Verify before reporting
All suites + build. Real run with `node bin/cli.js studio --no-open --port 5195 --api-port 3016`, temp `PROFESSOR_HOME`,
Claude Code agent: fresh browser profile on a `vi` navigator → onboarding preselects Tiếng Việt → UI Vietnamese → create a
course without touching any language control → syllabus, lesson (headings + body), quiz, flashcards, tutor reply are all
Vietnamese. Paste short excerpts of each.
