---
phase: "08"
slug: "revision-loop-ui-and-run-location-disclosure"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-25"
---

# Phase 08 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Learner content → prompt | Learner answers, code, check output and persisted review JSON are untrusted data echoed into provider prompts | Learner prose/code (potentially adversarial) |
| Model output → UI | Review JSON from the model is parsed, schema-validated and rendered | Model-generated criteria/questions |
| Studio → local runner | The browser talks to the loopback runner (`runnerBase(settings)`) and executes on the learner's machine | Code, stdout/stderr, check results |
| Stored review → later turns | A persisted `mode:'review'` chat row becomes the fixed rubric for later reviews | Criterion keys/labels (learner-owned local store) |
| Browser storage → disclosure state | The runner acknowledgement lives in `localStorage` | `{url, acknowledgedAt}` (no secrets) |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-08-01 | Spoofing / Tampering (prompt injection) | `prompts/practice.js`, `prompts/tutor.js`, `prompts/base.js` | high | mitigate | Learner answers, code, check output, lesson text and rubric labels wrapped with `wrapUntrusted` after `stripInvisible`; data-not-instructions clause in both review rule sets; sentinel tests prove content never reaches `system` un-delimited | closed |
| T-08-02 | Tampering (corrected code) | `prompts/tutor.js`, `revision/review-request.js`, `TutorPanel.jsx` | high | mitigate | `z.strictObject` review schema rejects `code`/`solution` keys and code fences, enforces one question per unmet criterion; `NO_SOLUTION_RULE` present; validator wired to the write path | closed |
| T-08-03 | Tampering (loose model output) | `prompts/practice.js`, `QuizPanel.jsx` | medium | mitigate | `reviewQuestionSchema` (strictObject, key ≤24, question ≤400, fence ban, duplicate-key rejection) now backs `validateReviewQuestions`; enrichment cannot persist extra keys | closed |
| T-08-04 | Tampering (hostile stored JSON) | `revision/history.js`, `ReviewMessage.jsx` | high | mitigate | Total parse with shape gate and per-criterion filter on legal statuses/strings; malformed content renders as plain text; no `JSON.parse` in the component and no HTML injection path | closed |
| T-08-05 | Tampering (criteria drift) | `prompts/tutor.js`, `revision/history.js` | high | mitigate | Persisted rubric keys are authoritative; drift, missing or invented keys are rejected (one repair, then `bad_json`); labels are taken from the persisted rubric, not the model | closed |
| T-08-06 | Spoofing / Tampering (rubric re-injection) | `revision/history.js`, `prompts/tutor.js` | medium | mitigate | `sanitizeRubricKey`/`sanitizeRubricLabel` strip invisible chars, angle brackets, backticks, newlines and cap length on parse; fixed keys stay in prose while labels are passed through `wrapUntrusted` in a `<fixed_rubric>` block | closed |
| T-08-07 | Information disclosure (dishonest disclosure) | `RunnerNotice.jsx`, `runner-notice.jsx`, `CodeWorkspace.jsx` | high | mitigate | `Browser`/`Local machine` badges; "Code runs on your machine" + user-permissions notice before the first local run; gate runs before `setRunning` so nothing executes; acknowledgement scoped to `runnerBase(settings)` and re-prompted on URL change; no `sandbox`/`isolated`/`safe` wording in en/vi copy (scanned) | closed |
| T-08-08 | Repudiation / Information disclosure (mislabeled run) | `OutputPanel.jsx`, `CodeWorkspace.jsx` | medium | mitigate | Badge derives from `output.runner` else the known target `runnerInfo.kind`; a pending local run renders `Local machine`; no badge when the target is unknown; SSR cases cover local, browser and unknown | closed |
| T-08-09 | Information disclosure (secrets) | `revision/history.js`, `runner-notice.jsx`, `QuizPanel.jsx`, `TutorPanel.jsx` | high | mitigate | Review records carry only `{surface, attemptTable, attemptId, passing, criteria}`; no stdout/stderr/snapshot; ack payload is `{url, acknowledgedAt}`; the bridge token travels only in the `X-Studio-Token` header | closed |
| T-08-10 | Denial of service (masked validation) | `lib/repo/index.js` | high | mitigate | `bestEffort` wraps only the post-write `recordEvent`/`maybeLinkRevision` calls on the four write paths; `recordEvent` still throws on invalid kind/surface/meta; localStorage reads/writes are guarded and never throw | closed |
| T-08-11 | Tampering (trusted stored flag) | `revision/history.js` | low | mitigate | `parseReviewRecord` ignores the stored `passing` boolean and re-derives it from the parsed criteria; forged-record tests cover true/all-`not_met`, true/`partial` and false/all-`met` | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|

No accepted risks. Every register row is disposition `mitigate` and closed.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-25 | 11 | 7 | 4 | gsd-security-auditor (ASVS L1, retroactive-STRIDE) |
| 2026-10-25 | 11 | 11 | 0 | orchestrator fix-up round (`3714c57`, `4883e56`, `aa3d418`, `0a968d0`) + full suite 93 files / 1194 tests green |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-25
