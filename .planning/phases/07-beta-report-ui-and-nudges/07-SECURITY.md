---
phase: "7"
slug: "beta-report-ui-and-nudges"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-24"
---

# Phase 7 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Repository → report payload | Phase 5 rows are reduced to enums, counts and local-day offsets | Aggregate counts only; no course text, prompts, code, answers, keys, model names, URLs or repository ids |
| Report payload → learner's filesystem | A learner-triggered Blob download (`professor-beta-report-<pid8>-d<N>.json`) | The same content-free JSON, validated by `reportSchema` before any bytes exist |
| Report payload → rendered preview | Stored values rendered inside React | Text only — React escapes it; never HTML |
| Browser storage → Home banner | Two per-checkpoint `localStorage` markers decide whether a reminder shows | Non-secret booleans (`'1'`); a tampered value can only hide a reminder |
| Build → bundle | Root `package.json` version injected via Vite `define` | The public product version string (`1.6.0-beta.1`) |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-07-01 | Information disclosure | `buildBetaReportPayload` / `providerCategory` | high | mitigate | Payload produced only by Phase 5's `buildBetaReport`; `reportSchema` is strict (unknown keys rejected, not stripped); `providerCategory` returns `null` outside the closed enum; sentinel-string test seeds course/lesson/capstone content, `sk-live-…` and a `repo_url` and asserts none reach `payload.json` (`studio/test/beta-report-panel.test.js`) | closed |
| T-07-02 | Tampering (stored XSS) | `BetaReportPreview` | high | mitigate | JSON is a React text child inside `<pre><code>`; `dangerouslySetInnerHTML`/`innerHTML` prohibited and asserted absent from the module source; the byte-equality test unescapes only to compare text | closed |
| T-07-03 | Tampering | `buildReportExport` / Download control | medium | mitigate | `buildReportExport` is the only producer of `{json, filename}` and `safeParse`s first, throwing `code: 'beta_report_invalid'`; the preview renders Download only when a validated payload exists | closed |
| T-07-04 | Repudiation (wrong provenance) | `studio/vite.config.js` `APP_VERSION_DEFINE` / `appVersion()` | medium | mitigate | Root-manifest read via `new URL('../package.json', import.meta.url)`; `typeof __APP_VERSION__ !== 'undefined' ? … : ''` guard so the define-absent CI aggregate cannot throw; anti-drift test compares `config.define` with the root version and asserts it is not studio's `0.1.0`; `vite build` gate greps the dist tree | closed |
| T-07-05 | Denial of service (self-inflicted) | `assembleCapstoneSummary` | medium | mitigate | Any verdict other than `course_complete`/`needs_work` is coerced to `null`; covered by test (`rejects an out-of-enum capstone verdict…`) | closed |
| T-07-06 | Denial of service (blocked learner) | `BetaReportNudge` | high | mitigate | Inline banner mirroring `Layout`'s durability banner: no modal, no `<dialog>`, no `role="alert"`/`role="dialog"`, no focus trap, no navigation; dismiss is a plain button; asserted by render tests | closed |
| T-07-07 | Tampering (dead deep link) | `Settings.jsx` affordance | high | mitigate | Affordance is `<button type="button">` calling `scrollToBetaReport()`; helper takes an injected document and guards `getElementById` + `typeof scrollIntoView === 'function'`; test asserts the Settings source contains no `href="#beta-report"` | closed |
| T-07-08 | Repudiation (data integrity) | Home nudge / export path | medium | mitigate | `getBetaProfile()` is read-through only (D-14); the only side effects are two `localStorage` markers. The `exported` marker is written inside `downloadReportPayload` — the single `download()` call site that `createDownloadHandler` delegates to — and tests snapshot `listEvents().length` around the shipped callable plus source-assert that Home never calls `recordEvent`/`logEvent`/`createRevisionLink` | closed |
| T-07-09 | Tampering (marker) | `readNudgeMarkers` / `writeNudgeMarker` | low | mitigate | Exact-match `'1'` reads inside `try/catch`; `setItem` failures swallowed; storage injectable so tests never touch globals; a corrupt marker can only hide one reminder — never a trust decision | closed |
| T-07-10 | Denial of service (SSR crash) | `Settings`/`Home` effects | low | mitigate | One `useEffect` with an empty dependency list per surface plus `typeof window !== 'undefined'` guards; `renderToString` skips effects, so both helpers are unit-tested with injected arguments | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|

No accepted risks.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-25 | 10 | 10 | 0 | gsd-secure-phase (ASVS L1, grep-depth) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-25
