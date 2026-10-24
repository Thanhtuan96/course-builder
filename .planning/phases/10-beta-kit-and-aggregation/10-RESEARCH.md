# Phase 10: Beta Kit and Aggregation - Research

**Researched:** 2026-10-24 · **Domain:** Markdown ops kit + dependency-free Node CLI over a frozen zod schema; root-Vitest black-box tests · **Confidence:** HIGH (verified by source read + live probe)

## Summary

A `docs/beta/**` kit guarded by link/string assertions, plus `scripts/beta-aggregate.mjs` importing
Phase 5's frozen `reportSchema` read-only to print raw counts. Only technical risk was module
resolution (root has **no** `zod`) — probe-verified via `studio/node_modules`. The rest is contract
design: fixture literals, stream/exit discipline, stable sort, and doc prose that satisfies
"forbidden string appears nowhere" while still teaching the rule.

**Primary recommendation:** one `.mjs` with exported pure helpers (`parseArgs`, `scanDir`, `dedupe`,
`formatTable`, `buildJson`), schema imported by relative path, tested via
`spawnSync(process.execPath, [ABS_SCRIPT, dir], { cwd: fixture })`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Invocation is `node scripts/beta-aggregate.mjs <dir> [--json] [--roster <file>]`. The script reads every `*.json` file directly under `<dir>` (non-recursive), sorted by filename for deterministic output. `--json` switches stdout to one machine-readable JSON document; the default is a plain aligned table.
- **D-02:** Every candidate file is validated against the frozen Phase 5 schema (`studio/src/lib/beta/report.js` → `reportSchema`) imported read-only. Invalid files are collected with a human-readable reason and listed — they never abort the run or hide valid reports.
- **D-03:** Exit codes: `0` when every discovered file is valid (duplicates are warnings, not failures); `1` when at least one discovered file is invalid, the directory is missing/empty, or usage is wrong. Diagnostics for invalid files go to stderr in table mode and into the `--json` document on stdout; the exit code carries the failure.
- **D-04:** Dedupe is by `participantId`, keeping the export with the highest `generatedAtDayOffset` (the latest report window) and printing one warning per dropped duplicate naming both files. A same-offset tie keeps the lexicographically greater filename so the result is stable across runs, and still warns.
- **D-05:** Output is raw per-participant counts only — participant id, export day offset, activated flag, active-day count, loop totals, revision counts, week-1/week-2 flags, week-2 meaningful days, capstone submissions/evidence/verdict. No percentages, no averages, no derived rate is printed; the owner does the arithmetic against THRESHOLDS.md.
- **D-06:** A participant with no export is shown as `unknown`, never omitted silently. Because a folder of reports cannot reveal who was recruited, the script accepts an optional `--roster <file>` (JSON array of participant ids, or newline/comma-delimited ids) and emits an `unknown` row for every roster id with no report. Without a roster only exported participants appear, and any field the report itself cannot supply (e.g. `capstone.verdict: null`) renders as `unknown`. The roster file is excluded from report scanning when it lives inside `<dir>`.
- **D-07:** Exactly one thresholds document: `docs/beta/owner/THRESHOLDS.md`. It states the metric formulas (activation, week-1, week-2 return, practice loop completion, artifact-in-real-project, qualitative evidence), the proposed continue / change / stop rule, and one table mapping each outcome to its numeric condition.
- **D-08:** The numbers are the owner's decision, not the implementer's. They are drafted from REQUIREMENTS.md / PROJECT.md (BETA-05: ≥3 of 3–5 participants complete a real practice loop; PROJECT.md success metric: week-2 return = ≥1 meaningful action on days 8–14) and clearly labelled **DRAFT — PENDING OWNER SIGN-OFF**, followed by an empty sign-off block (name, date, commit hash). No other document presents them as decided.
- **D-09:** `docs/beta/owner/DECISION-MEMO-TEMPLATE.md` links to THRESHOLDS.md and does not repeat or reinterpret the numbers; it only records per-participant evidence and the final decision.
- **D-10:** `docs/beta/README.md` is the index and links every file with one line of purpose. Owner-facing docs live in `docs/beta/owner/`; participant-facing docs in `docs/beta/participant/`.
- **D-11:** `docs/beta/participant/CONSENT.md` and `docs/beta/participant/SCREENER.md` each contain one copy-paste-ready block (nothing to assemble): the consent paragraph is a single sendable paragraph plus a short bullet list of what is collected; the screener is a single checklist block the owner can paste into a message and score in place.
- **D-12:** Kit prose is English only. No Vietnamese translation is added in this phase; a future phase can translate without reworking the layout.
- **D-13:** The macOS screener is a knockout checklist plus fit signals, not a numeric score. Knockouts include macOS 13+, Node ≥22.5 available (`node:sqlite`), an existing web project they own, willingness to run terminal commands, and willingness to export a report twice. All knockouts must pass and at least two of three fit signals must be true; the decision rule is written next to the checklist.
- **D-14:** `docs/beta/owner/CHECK-IN-SCRIPT.md` fixes the call schedule (Day 0, Day 3–4, Day 7, Day 14), and every check-in includes the three behavioral questions verbatim: what they actually shipped/changed in their own project, a walkthrough of the last time they got stuck and what they did, and what better output Studio produced versus Claude + notes + editor. Day 7 and Day 14 also carry the report-export step. Answers are captured in a fixed per-participant record (date, participant id, question, verbatim answer, artifact/export reference) that Phase 13 can copy.
- **D-15:** `docs/beta/participant/TROUBLESHOOTING.md` covers bridge/pairing-token setup, Studio start/port issues, local-runner expectations, and report export, and never recommends `STUDIO_ORIGINS=*`, `--dangerously-skip-permissions` or any other relaxation.
- **D-16:** Fixtures live under `test/fixtures/beta-reports/` with separate directories/cases for valid, invalid, duplicate and missing-export input, and roster files where a "missing export" needs an expected participant. Fixtures are generated by hand as literal JSON so the test pins the frozen schema instead of round-tripping through the builder.
- **D-17:** `test/beta-aggregate.test.js` runs the script as a child process (real exit codes and stream separation), asserts table and `--json` output, duplicate warnings, invalid reasons, `unknown` rows, and the no-percentages rule. It also asserts the kit invariants: every README link resolves, the check-in script contains the three questions for all four check-ins, THRESHOLDS.md is marked draft with an empty sign-off block, and the forbidden security strings appear nowhere in `docs/beta/**`.

### Claude's Discretion
- Exact table column widths/alignment, warning wording, and the internal module shape of the script (single file, small exported helpers for testing).
- Exact wording of the onboarding and troubleshooting prose beyond the locked facts and the forbidden-string rule.
- Whether the aggregation script also prints a one-line total of valid/invalid/duplicate counts (allowed as long as no percentage/rate appears).

### Deferred Ideas (OUT OF SCOPE)
- Filled decision memo, per-participant aggregated table and dogfood notes — Phase 13 (`docs/beta/cohort/**`).
- Translating the kit into Vietnamese — future phase; layout supports it without rework.
- A `npm run beta:aggregate` script alias — root `package.json` belongs to Phase 12 in Wave 3.
- A screenshot/GUI aggregation sheet — out of scope; raw table + JSON is enough for 3–5 reports.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BETA-02 | Beta kit: onboarding, macOS screener, consent, Day 0/3–4/7/14 check-in script with three behavioral questions, troubleshooting | §4 doc guards; §5 doc/string constraints |
| BETA-03 | Aggregation validates exports, dedupes, prints raw counts, missing export = unknown, no percentages | §1 harness; §2 fixtures; §3 CLI contract |
| BETA-04 | Continue/change/stop thresholds written and committed before Day 0 | §4 DRAFT/sign-off guard; D-07/D-08 |
</phase_requirements>

## 1. Root Vitest → Studio schema, and running the committed CLI from a test

**Resolution (HIGH, probe-verified).** Root has no `zod`; `studio/package.json` declares `zod ^4.6.7`
and `studio/node_modules/zod` exists, so importing `../studio/src/lib/beta/report.js` resolves its bare
`zod` from Studio's tree under plain Node and under Vitest's Vite resolver alike (throwaway root test
imported `reportSchema` and parsed OK; probe deleted, no product edits). Chain is pure:
`report.js → ../repo/events.js`, `./metrics.js → ../course.js → ./ids.js`. Import ≈130 ms (5 s budget).

```js
/** @vitest-environment node */
import { reportSchema } from '../studio/src/lib/beta/report.js'; // only for direct schema asserts

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'beta-aggregate.mjs');   // MUST be absolute
const run = (args, cwd) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf-8' });
```

Pitfalls: (a) relative script path + foreign `cwd` fails to start (`status === null`, `error` set) —
probe-confirmed; pass the absolute script, fixture dir in `args`/`cwd`. (b) Capture both streams; never
`stdio:'inherit'`. (c) Committed fixture dirs need no temp copy; `mkdtemp` only if a case must write.
(d) Assert `status` explicitly (`0`/`1`).

## 2. Export-format fixture strategy (hand-written, no `buildBetaReport`)

`reportSchema` is `z.strictObject` at every level: **all keys required**, unknown keys →
`unrecognized_keys`, and `loops.byKind` needs exactly the six `EVENT_KINDS`
(`quiz_completed, recall_completed, answer_sent_for_review, workspace_run, exercise_completed,
capstone_checkpoint`). Only `app.provider`, `activation.firstEventKind`, `capstone.verdict` are
nullable; numbers have no defaults (a missing `exercise_completed: 0` fails).

Canonical valid fixture (`test/fixtures/beta-reports/valid/professor-beta-report-<pid>-d14.json`):

```json
{ "schemaVersion": 1, "participantId": "11111111-1111-4111-8111-111111111111",
  "generatedAtDayOffset": 14,
  "app": { "version": "1.6.0-beta.1", "storage": "sqlite", "provider": "bridge:claude" },
  "activation": { "activated": true, "firstEventKind": "quiz_completed" },
  "window": { "activeDayOffsets": [0, 3, 7, 10, 14] },
  "loops": { "byKind": { "quiz_completed": 2, "recall_completed": 1, "answer_sent_for_review": 1,
                          "workspace_run": 2, "exercise_completed": 0, "capstone_checkpoint": 1 },
             "revisions": { "quiz": 1, "tutor": 0, "workspace": 1, "capstone": 0, "explicit": 1, "inferred": 1 } },
  "retention": { "week1Active": true, "week2Return": true, "week2MeaningfulDays": 3 },
  "capstone": { "started": true, "submissions": 1, "externalEvidence": 0, "verdict": null } }
```
`provider` must match `^(bridge|byok):(anthropic|openai|openrouter|groq|lmstudio|ollama|custom|claude|opencode|cursor|gemini|antigravity)$`
(`"claude"`, `"bridge:unknown"` invalid); `participantId` must be a real UUID (`"pid-1"` →
`invalid_format`); `activeDayOffsets` items are 0..14.

| Path (all literal JSON, fixed ids, no clock/UUID) | Purpose | Expected |
|---|---|---|
| `valid/…-d14.json`, `valid/…-d0.json` | two participants, one unactivated | 2 rows, exit 0 |
| `invalid/bad-schema-version.json` / `invalid/missing-bykind.json` | `schemaVersion: 2` / only `quiz_completed` in `byKind` | `invalid_value` / 5× `invalid_type`, exit 1 |
| `invalid/extra-key.json` / `invalid/bad-provider.json` / `invalid/broken.json` / `invalid/array.json` | top-level `"note"` / `"claude"` / trailing comma / root `[]` | `unrecognized_keys` / `invalid_format` / `invalid JSON:` / `invalid_type` |
| `duplicate/…-d7.json`, `…-d14.json` | same pid, two offsets | keep d14, 1 warning |
| `duplicate-tie/…a-d9.json`, `…b-d9.json` | same pid+offset | keep `…b…`, 1 warning |
| `missing-export/roster.json` + one report | roster `[pidA,pidB]`, only pidA exported | pidB `unknown`; `roster.json` not scanned |
| `empty/README.md` | no `*.json` (git can't commit empty dirs) | exit 1, "no report files" |

Reason text: `` `${issue.path.join('.') || '(root)'}: ${issue.message}` ``, one line, ~120 chars max.
Assert substrings (`invalid_value`, `unrecognized_keys`, `Invalid UUID`), never full zod prose.

## 3. Deterministic CLI contract

**Args** (`parseArgs(argv)` → `{ dir, json, roster } | { error }`): loop `argv.slice(2)`; `--json`
flag; `--roster` consumes the next token (missing → usage error); `--help`/`-h` prints usage to stdout,
exit 0; first non-flag token is `dir`; extra positional, unknown `-…` flag or missing `dir` → usage on
**stderr**, exit 1. No `--flag=value` form.

**Scan:** `readdirSync(dir)`; `entries.sort()` default (UTF-16 code-unit order — **never
`localeCompare`**); keep `endsWith('.json')`, skip dotfiles, require `statSync(...).isFile()`;
non-recursive; exclude the roster by resolved path (`resolve(dir,name) !== resolve(rosterPath)`).

**Dedupe:** iterate in filename order into `Map<participantId, {file, report}>`; replace when
`candidate.generatedAtDayOffset > kept.…`, or equal and `candidate.file > kept.file` (string compare);
warn per drop `duplicate participant <id>: dropped <file>, kept <file>`. Invalid files never enter
dedupe. Rows follow kept-file order; roster-only `unknown` rows follow, sorted by id; never sort rows
by metric.

**Streams/exit:** stdout = table or JSON only; stderr = duplicate warnings, invalid-file lines,
`N valid, M invalid, K duplicate(s)` (allowed; no `%`). Exit `0` iff ≥1 report discovered and no
invalid; else `1`. `--json` still exits 1 when invalid.

**Table** (fixed column order, `padEnd` to max width, single-space gap, no box drawing):
`participant day activated activeDays loops revisions w1 w2 w2Days capSub capEvidence verdict`;
`yes`/`no`; `revisions` as `quiz/tutor/ws/cap`; `loops` = Σ`byKind`; every unavailable cell is the
literal `unknown` (roster-only row: `unknown` everywhere but the id).

**JSON doc** (stable key order, no absolute paths/timestamps, `ok` = exit-code boolean):
`{ schemaVersion: 1, ok, participants: [{ participantId, source, generatedAtDayOffset, activated,
activeDayCount, loopTotal, loopsByKind, revisions, week1Active, week2Return, week2MeaningfulDays,
capstoneSubmissions, capstoneExternalEvidence, capstoneVerdict }], invalid: [{ file, reason }],
duplicates: [{ participantId, kept, dropped }], unknown: [participantId] }`. JSON keeps `null`
(machine-readable); only the table renders `unknown`; `source: null` = roster-only row.

## 4. Doc-guard tests (robust forms)

- **README links:** `/\[[^\]]*\]\(([^)]+)\)/g`; skip `http(s)://`, `mailto:`, pure `#anchor`; strip
  `#fragment`; `expect(existsSync(resolve(dirname(README), link)))`. Reverse: every `.md` under
  `docs/beta/owner|participant` is linked (kills orphans). Keep targets relative.
- **3 questions × 4 check-ins:** split on `/^##\s+Day\s+(0|3[–-]4|7|14)\b.*$/m` (accept en dash *and*
  hyphen), require 4 sections, then assert each `section.replace(/\s+/g,' ')` contains three substrings
  the plan pins (e.g. `"shipped or changed in your own project"`, `"the last time you got stuck"`,
  `"better than Claude + your notes + your editor"`); Day 7 and Day 14 must mention export. Pinning the
  substrings in the plan is what keeps this non-brittle.
- **THRESHOLDS draft + empty sign-off:** heading `## Sign-off`; `/^- (Name|Date|Commit):\s*$/m` each;
  draft label `/DRAFT\s*[—–-]\s*PENDING OWNER SIGN-OFF/`; assert absence of `"signed off"`/`"approved"`.
  DECISION-MEMO-TEMPLATE must link `THRESHOLDS.md` and contain no `%`.
- **Forbidden strings:** walk `docs/beta/**` for `*.md` (`readdirSync(dir,{recursive:true})`) and assert
  none contains `STUDIO_ORIGINS=*`, `--dangerously-skip-permissions`, `STUDIO_ALLOW_NON_LOOPBACK`.
  **Authoring consequence:** D-17 bans the strings outright — troubleshooting must state the rule
  without naming the flags ("never widen the allowed origins", "never disable the agent's permission
  prompts"). Same for the kit README.

## 5. Repo conventions and traps

- No ESLint/Prettier config — style by convention: 2 spaces, semicolons, ~100 cols, single quotes,
  kebab-case, JSDoc `@param`/`@returns` on every export, `@vitest-environment node`, `expect(v, 'msg')`.
- **No new deps, no `package.json`/lockfile edits.** Script imports only `node:fs`, `node:path`,
  `node:process`, `../studio/src/lib/beta/report.js`. `docs/`+`scripts/` sit outside `files` — do not add.
  New test is picked up by `test/**/*.test.js`; no vitest config change. Assert zod issue `code`/`path`
  substrings, never messages. `%` in **script output** fails D-05 (keep `%` out of THRESHOLDS too).
- Fixtures: no `new Date()`, `randomUUID()`, absolute paths; name them
  `professor-beta-report-<pid>-d<N>.json` so kept/dropped assertions read naturally.
- Follow `sync-shared.mjs`: `invokedDirectly` realpath compare + `process.exitCode = main(argv)`.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework / config | Vitest ^5.0.5 (root project, CI Node 22/24) · `vitest.config.js` includes `test/**/*.test.js` |
| Quick run command | `npx vitest run test/beta-aggregate.test.js --project root` |
| Full suite command | `npm test` (root + Studio projects) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| BETA-03 | Valid dir → aligned table, exit 0, counts match fixtures | integration | `npx vitest run test/beta-aggregate.test.js -t table` | ❌ Wave 0 |
| BETA-03 | `--json` → parseable doc (participants/invalid/duplicates/unknown, `ok:true`) | integration | `… -t json` | ❌ Wave 0 |
| BETA-03 | Invalid files → exit 1, reason on stderr, valid reports still listed; missing/empty dir + bad usage → exit 1, usage on stderr | integration | `… -t invalid` / `… -t usage` | ❌ Wave 0 |
| BETA-03 | Duplicate pid → highest offset wins; tie → greater filename; one warning per drop | integration | `… -t duplicate` | ❌ Wave 0 |
| BETA-03 | Roster → `unknown` row; roster inside dir not scanned; `verdict:null` → `unknown` | integration | `… -t roster` | ❌ Wave 0 |
| BETA-03 | No `%` and no percent/rate/average key in either output mode | integration | `… -t percentage` | ❌ Wave 0 |
| BETA-02/04 | README links resolve, no orphan doc, 3 questions × 4 check-ins, DRAFT sign-off block, forbidden strings absent | unit (fs/string) | `… -t docs` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run test/beta-aggregate.test.js --project root`; **per wave merge:** `npm test`; **phase gate:** full `npm test` green before `/gsd-verify-work`
- `npm run test:drift` / `npm run test:security` are unaffected by this phase

### Wave 0 Gaps
- [ ] `test/fixtures/beta-reports/{valid,invalid,duplicate,duplicate-tie,missing-export,empty}/**` (§2)
- [ ] `test/beta-aggregate.test.js` — every row above (the phase's only test file)
- [ ] `docs/beta/**` (README + owner/ + participant/) — guard targets must exist before guards pass
- [ ] No install needed: `vitest` present, `zod` resolves via `studio/node_modules`

## Sources

### Primary (HIGH confidence)
- `studio/src/lib/beta/report.js`, `.../metrics.js`, `.../repo/events.js` (read) — schema shape, nullables, `EVENT_KINDS`, printed-field semantics
- `scripts/smoke-pack.mjs`, `scripts/sync-shared.mjs` (read) — shebang/JSDoc/exported helpers/`invokedDirectly`/`process.exitCode`
- `test/shared-drift.test.js`, `test/migrations.test.js` (read) — spawnSync + mkdtemp + afterEach pattern
- `vitest.config.js`, `package.json`, `studio/package.json`, `.github/workflows/ci.yml` (read) — include glob, engines, CI Node 22/24
- Probe 2026-10-24: root test importing `reportSchema` passed; relative script path + foreign cwd fails; import ≈130 ms. Probe deleted, no product files touched.

### Secondary (MEDIUM confidence)
- zod 4 issue codes seen in the probe (`invalid_type`, `invalid_value`, `invalid_format`, `unrecognized_keys`) — safe for substring assertions, never message text.

**Confidence:** stack/resolution HIGH · CLI contract HIGH (D-01..D-06 fully specify it) · doc guards HIGH mechanically, MEDIUM on exact question substrings (planner must pin them). **Valid until:** ~2026-11-24.
