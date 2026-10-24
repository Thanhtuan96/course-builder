# Phase 7: Beta Report UI and Nudges - Context

**Gathered:** 2026-10-24
**Status:** Ready for planning
**Mode:** Interactive discuss (orchestrator answered all grey areas in one pass — picker was unusable)

<domain>
## Phase Boundary

A beta learner can open "Export beta report" from Settings ▸ Data, read a short human summary and the
exact pretty-printed JSON they are about to save ("this is everything in the file"), and download it
as `professor-beta-report-<pid8>-d<N>.json`. The same JSON is what Phase 10's aggregation script
validates. Home shows a dismissible, non-blocking reminder on activation day-offset 7 and 14 only.

In scope:
- New `studio/src/components/data/BetaReportPanel.jsx` (preview + download + export marker)
- `studio/src/components/data/DataPanel.jsx` — mount point for the panel
- `studio/src/pages/Settings.jsx` — "Beta report" link that scrolls to the panel; honoured marker
  from the Home nudge (`/settings?report=1`)
- `studio/src/pages/Home.jsx` — day-7/day-14 banner (dismissible, per-checkpoint)
- New `studio/src/lib/i18n/{en,vi}/betaReport.json` namespace files
- New `studio/test/beta-report-panel*.test.js` tests
- **Approved ownership exception:** `studio/vite.config.js` — one `define` entry injecting
  `__APP_VERSION__` from the root `package.json` version (orchestrator-approved 2026-10-24; no Wave 2
  phase owns the file)

Out of scope (other phases): report builder/schema/events/metrics (Phase 5, frozen — consume only),
revision UI (Phase 8), Playwright evidence (Phase 9), aggregation script and `docs/beta/**`
(Phase 10), E2E (Phase 12), any new migration/table/event kind, any edit to `STATE.md`/`ROADMAP.md`/
`CLAUDE.md` (orchestrator-only per Execution Rules).

</domain>

<decisions>
## Implementation Decisions

### Entry point and navigation
- **D-01:** `BetaReportPanel` is mounted **inside Settings ▸ Data** by `DataPanel` (the owned mount
  point). `DataPanel` keeps its existing card and renders `BetaReportPanel` below it as its own card —
  no new route, no router change.
- **D-02:** Both entry points lead to the same panel: the Home nudge links to `/settings?report=1`
  (hash routing already tolerates a query — `matchRoute` strips it) and `Settings.jsx` scrolls to the
  panel's stable `id="beta-report"` when that marker is present; `Settings.jsx` also renders a small
  "Beta report" link near the Storage/Data heading that scrolls to the same id on click.
  Scrolling is the only behaviour added to `Settings.jsx`.

### App version (required by success criterion 2)
- **D-03:** The report's `app.version` comes from **one source of truth: the root `package.json`
  version**, injected at build time by a Vite `define` (`__APP_VERSION__`) added to
  `studio/vite.config.js`. A test asserts `__APP_VERSION__ === require('../package.json').version`
  so the two can never drift. — **Reversibility:** reversible — one define line plus one test.
- **D-04:** The `define` must also cover Vitest (it does: Vitest transforms through the same Vite
  config), so `BetaReportPanel.jsx` may reference `__APP_VERSION__` at module scope. If `define` is
  somehow absent (plain Node import outside Vite), fall back to `''` — the schema accepts `''` and
  the report stays valid, never throwing on an undefined global.
- **D-05:** `studio/package.json`'s `0.1.0` is **not** the app version and must not be used —
  it is a stale private-package field, not the shipped product version (`1.6.0-beta.x`).
  Ownership exception recorded in D-03 (see `<specifics>`).

### Preview and download
- **D-06:** One action opens the preview: a summary block (activation, report window offsets,
  loop counts, retention, capstone, app version, storage kind) followed by the **exact
  pretty-printed JSON that will be downloaded** under the copy "this is everything in the file".
  A test compares the downloaded text to the previewed text byte-for-byte, so the preview cannot
  drift from the file.
- **D-07:** The previewed/downloaded payload is produced by Phase 5's `buildBetaReport(...)` and is
  re-validated with `reportSchema` in the panel before it becomes downloadable; a schema failure
  surfaces an error and disables Download (never writes a partial file).
- **D-08:** `app.storage` is `(await getAdapterInfo()).kind` (`indexeddb|sqlite|memory|remote`).
  `app.provider` is a category string only: `bridge:<agent>` for the local bridge,
  `byok:<provider>` for BYOK (OpenAI-compatible preset id when the provider is `openai`), and `null`
  when nothing is configured or the value is outside the schema's closed enum. Never a key, model
  name or URL.

### Capstone summary (assembled here, not in Phase 5)
- **D-09:** The panel assembles the capstone summary Phase 5 left to the caller: `started` = any
  course has a capstone; `submissions` = total capstone submissions across courses;
  `externalEvidence` = submissions whose `testResults.source === 'external'`; `verdict` = the
  verdict of the most recent submission (by `attempt`), or `null`. Reads use only the frozen repo
  API (`listCourses`, `getCapstone`, `listCapstoneSubmissions`) — no repo changes.

### Filename
- **D-10:** Filename is `professor-beta-report-<pid>-d<N>.json` where `<pid>` is the **first 8
  characters of the participant UUID** and `<N>` is the report's `generatedAtDayOffset`. The full
  participant id stays inside the JSON (that is what Phase 10 dedupes on). — **Reversibility:**
  costly — Phase 10's aggregation and the beta kit documentation refer to this file name.

### Day-7 / day-14 nudge
- **D-11:** The Home banner appears **only when the learner's local-day offset from activation is
  exactly 7 or 14** (Phase 5's `dayOffset`/`dayKey` helpers, activation = offset 0). Before
  activation, or on any other offset, nothing renders.
- **D-12:** The reminder is non-blocking (an inline banner like the existing durability banner — no
  modal, no route change) and carries two actions: the export action (D-02 link to the panel) and a
  dismiss control.
- **D-13:** Dismissal persists **per checkpoint** (`day7` and `day14` separately) in `localStorage`,
  so dismissing day 7 never suppresses day 14. Exporting also silences the current checkpoint: the
  download handler records "exported at offset N" and the banner for N is hidden from then on.
  All storage access is guarded for non-browser environments.
- **D-14:** The banner does not create learning events and does not write meaningful rows; the only
  side effects are the local export/dismiss markers. `getBetaProfile()` may be called read-through
  (it creates the singleton with `activated_at: null` when absent, by design) but a profile without
  `activated_day` shows no banner.

### Testing and i18n
- **D-15:** Tests stay in the existing Studio harness: `.test.js` files (not `.test.jsx`), Node
  environment, `react-dom/server` `renderToString` for render assertions plus direct calls to pure
  helpers exported from the panel/Home module (payload build, filename, nudge state, provider
  category, capstone summary, preview text). No jsdom, no testing-library, and **no change to
  `test.include`** (a second ownership exception is not wanted).
- **D-16:** New copy lives only in the new `betaReport` namespace (`en`/`vi`), addressed as
  `betaReport.*`. Existing namespace files are never edited; the Home banner uses `betaReport.*`
  keys too (the namespace is the report feature, wherever it is rendered).

### the agent's Discretion
- Card layout, button variants, whether the summary is a definition list or a compact grid, and
  the exact English/Vietnamese wording (subject to D-16).
- Whether helpers live in the panel module or a sibling module under
  `studio/src/components/data/` **as long as no unlisted file is added** — the default is to export
  them from `BetaReportPanel.jsx`/`Home.jsx` themselves.
- Ordering of summary rows and how numbers are rendered (raw counts only, never percentages).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase contract
- `.planning/ROADMAP.md` § "Phase 7: Beta Report UI and Nudges" — goal, Owns, Touch points, success criteria
- `.planning/ROADMAP.md` § "Execution Rules" — exclusive ownership, migrations, lockfiles, planning docs
- `.planning/REQUIREMENTS.md` — INSTR-05, INSTR-06 (lines 54–55, 158–159)
- `.planning/PROJECT.md` § "Beta learning loop & instrumentation" — the export must be small,
  content-free, shown at week 1 and week 2
- `.planning/phases/05-beta-data-foundation/05-CONTEXT.md` — frozen report schema v1 (D-11), beta
  profile/activation (D-08/D-09), privacy invariant (D-05)
- `.planning/phases/06-studio-beta-debt/06-CONTEXT.md` — per-namespace i18n layout (D-06/D-07)

### Research (design intent)
- `.planning/research/SUMMARY.md` § "Phase 7: Beta report UI and activation nudges"
- `.planning/research/ARCHITECTURE.md` § "Learning-event and report flow" and § "Report JSON shape"
- `.planning/research/FEATURES.md` — "Export beta report" and "Week 1 / week 2 export prompt"
  (non-blocking banner, never a modal)
- `.planning/research/PITFALLS.md` — Pitfall 9 (content leak), "Report export hidden in settings"

### Source of truth (consume, do not change)
- `studio/src/lib/beta/report.js` — `buildBetaReport`, `reportSchema` (strict, schemaVersion 1)
- `studio/src/lib/beta/metrics.js` — `computeMetrics`, `dayOffset`, `dayNumber`
- `studio/src/lib/repo/index.js` — `listEvents`, `getBetaProfile`, `listRevisionLinks`,
  `listCourses`, `getCapstone`, `listCapstoneSubmissions`, `getAdapterInfo`
- `studio/src/lib/settings.js` — `useSettings`, provider ids/presets (`bridge`, `anthropic`,
  `openai` + preset, `ollama`)
- `studio/src/lib/course-export.js` — `download(filename, text, type)`
- `studio/src/components/data/DataPanel.jsx` — existing backup/restore card, mount point
- `studio/src/components/Layout.jsx` — existing dismissible banner pattern to mirror
- `studio/src/lib/router.js` — `Link`, `navigate`; query strings survive hash routing
- `studio/src/lib/i18n/index.js` + `studio/src/lib/i18n/en/data.json` — catalog layout and key style
- `studio/vite.config.js` — where `__APP_VERSION__` is defined (approved exception)
- `studio/test/beta-report.test.js`, `studio/test/beta-privacy.test.js`,
  `studio/test/tutor-panel.render.test.js` — patterns to extend (schema + render smoke)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `buildBetaReport()` already returns `reportSchema.parse(...)`, so the panel composes inputs and
  does not re-implement any counting.
- `download()` in `course-export.js` is the established Blob-download helper (DataPanel uses it).
- `useT()` + per-namespace JSON files: a new `betaReport.json` pair is picked up by the eager glob
  with zero `index.js` changes.
- `dayOffset(dayKey(new Date()), profile.activated_day)` gives the nudge's offset without loading
  events; `computeMetrics` gives the same offset for the report.
- `Link` from `router.js` renders a real anchor, so middle-click/copy-link keep working.

### Established Patterns
- Studio tests run in Node: render assertions use `react-dom/server`; anything interactive must be
  a pure, exported helper to be testable.
- Cards (`components/ui/Card.jsx`), `Button` variants, `Input`/`Select` labels are the UI contract;
  banners on Home/Layout are inline blocks with a dismiss button.
- Guard every `localStorage`/`sessionStorage` access with a `typeof … !== 'undefined'` check.
- Root suite and Studio suite are separate Vitest installs; Phase 7 touches only Studio tests.

### Integration Points
- `DataPanel` is mounted by `Settings.jsx`, so the panel is reachable from Settings with no new
  route.
- `getAdapterInfo().kind` is the storage kind; the remote adapter reports `remote`.
- `testResults.source === 'external'` is the marker Phase 5's capstone emitter already uses, so the
  panel's `externalEvidence` count matches the `capstone_checkpoint` events.

</code_context>

<specifics>
## Specific Ideas

- Orchestrator decisions (2026-10-24), locked as-is:
  1. Panel lives in Settings ▸ Data via DataPanel; Settings link and Home nudge both lead there.
  2. `app.version` = root `package.json` via Vite `define` `__APP_VERSION__`, with a test proving it
     matches; editing `studio/vite.config.js` for that define is an **approved ownership exception**.
  3. Filename uses the first 8 characters of the participant id; the full id stays in the JSON.
  4. Nudge only at offsets 7 and 14, non-blocking, dismissal per checkpoint, auto-hides after that
     day's export, links to the panel.
  5. Preview = short localized summary + the exact pretty-printed JSON, with "this is everything in
     the file"; a test proves the downloaded bytes equal the previewed JSON.
- Privacy framing: the honest promise is "no content", not "anonymous" — the panel copy should say
  what the file contains and that it never uploads anything.

</specifics>

<deferred>
## Deferred Ideas

- Copy-to-clipboard and a "download every report" history — not needed; one file per checkpoint.
- Showing the report on Home inline (instead of linking to Settings) — the nudge is enough.
- Recording an export as a learning event or a new table — explicitly out of scope (no migration,
  and exporting is not a meaningful learning action per Phase 5 D-01).
- Percentages or cohort comparisons in the panel — raw counts only, aggregation belongs to Phase 10.

</deferred>

---

*Phase: 7-Beta Report UI and Nudges*
*Context gathered: 2026-10-24*
