/**
 * Playwright reporter evidence parsing (PW-03, phase 9).
 *
 * Contract: this module is **pure, synchronous and deterministic**. It reads a string and nothing
 * else — no network, no child process, no `eval`, no filesystem, no imports — and it never executes,
 * evaluates or type-checks the pasted text. The same paste always produces the same normalized
 * payload.
 *
 * The normalized payload (schema version 1) is a cross-phase contract stored in
 * `capstone_submissions.test_results_json`, read back by attempt history and by later aggregation:
 *
 * ```
 * {
 *   schemaVersion, source: 'external', selfReported: true, format, reporter,
 *   stats: { total, passed, failed, skipped, flaky, durationMs, playwrightVersion, projects, chromium },
 *   specs: [{ file, tests: [{ title, project, status, expectedStatus, retryCount, durationMs }] }],
 *   warnings: [{ code, detail }],
 *   truncated,
 *   excerpt,
 * }
 * ```
 *
 * Reporter `attachments`, `results[].errors`, `stdout` and `stderr` are dropped by construction: the
 * only place raw reporter text is kept is the bounded `excerpt` (audit head of the paste).
 */

/** Payload schema marker; bump only with a planned cross-phase migration. */
export const EVIDENCE_SCHEMA_VERSION = 1;

/** Longest paste the parser will look at (characters). Beyond this the payload is `truncated`. */
export const MAX_EVIDENCE_INPUT_CHARS = 200_000;

/** Most spec files kept in the normalized payload. */
export const MAX_EVIDENCE_SPECS = 50;

/** Most test entries kept in the normalized payload. */
export const MAX_EVIDENCE_TESTS = 400;

/** Longest raw-paste head kept for audit. */
export const MAX_EVIDENCE_EXCERPT_CHARS = 2_000;

/** Hard limit for the serialized payload written to storage. */
export const MAX_EVIDENCE_PAYLOAD_CHARS = 32_000;

/** The closed warning-code set (D-05). "Mismatch" means exactly these codes. */
export const EVIDENCE_WARNING_CODES = Object.freeze([
  'no_tests',
  'count_mismatch',
  'unknown_spec_files',
  'claimed_pass_with_failures',
  'unrecognized_format',
  'truncated',
]);

/** Longest test title kept per test entry. */
const MAX_TITLE_CHARS = 120;

/** Longest spec file path kept per spec entry. */
const MAX_FILE_CHARS = 200;

/** Longest warning detail kept per warning. */
const MAX_DETAIL_CHARS = 120;

/** CSI sequences: colours (`ESC[32m`) and cursor control (`ESC[2K`, `ESC[0G`). */
const ANSI_CSI_RE = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;

/** OSC sequences: window titles and hyperlinks. */
const ANSI_OSC_RE = /\u001b\][^\u0007]*(\u0007|\u001b\\)/g;

/** The JSON reporter serializes `config` first; a pasted report starts on a line of its own `{`. */
const JSON_REPORT_ANCHOR = '\n{\n  "config":';

/** Tolerant anchor used by detection and by the embedded-report scan. */
const JSON_CONFIG_ANCHOR_RE = /\{\s*"config"\s*:/;

/** Summary block line: `1 failed`, `2 passed (3.1s)`, `1 did not run`. */
const SUMMARY_RE =
  /^\s*(\d+)\s+(passed|failed|flaky|skipped|did not run|interrupted)\b(?:\s*\(([^)]+)\))?\s*$/i;

/** List/line header line: `Running 2 tests using 2 workers`. */
const HEADER_RE = /^\s*Running\s+(\d+)\s+tests?\s+using\s+(\d+)\s+workers?\b/i;

/**
 * List reporter row: `  ✓  1 [chromium] › tests/a.spec.js:3:1 › title (438ms)`.
 *
 * Duration and retry suffix are optional; the project bracket is optional (1.4x layout); the glyph
 * set includes the non-UTF-8 fallbacks (`ok`, `x`).
 */
const LIST_ROW_RE =
  /^\s*([✓✘x-]|ok)\s+(\d+)\s+(?:\[([^\]]+)\]\s*›\s*)?(.+?):(\d+):(\d+)\s*›\s*(.+?)(?:\s+\(retry #(\d+)\))?(?:\s+\(([\d.]+)(ms|s)\))?\s*$/u;

/** Line reporter progress row: `[1/4] [chromium] › tests/a.spec.js:3:1 › title`. */
const LINE_ROW_RE =
  /^\[(\d+)\/(\d+)\]\s+(?:\(retries\)\s+)?(?:\[([^\]]+)\]\s*›\s*)?(.+?):(\d+):(\d+)\s*›\s*(.+?)(?:\s+\(retry #(\d+)\))?\s*$/u;

/** Write-up phrases that claim a green run (heuristic on the learner's claim, not on the run). */
const CLAIMED_PASS_RES = [
  /all (?:the )?tests? (?:are )?(?:pass|green)/i,
  /100\s*%\s*pass/i,
  /tất cả.*(?:đạt|pass)/i,
];

/**
 * Clip a value to a maximum length.
 *
 * @param {unknown} value
 * @param {number} max
 * @returns {string}
 */
function clip(value, max) {
  const text = String(value ?? '');
  return text.length > max ? text.slice(0, max) : text;
}

/**
 * Parse JSON without throwing.
 *
 * @param {string} text
 * @returns {object|null}
 */
function safeJsonParse(text) {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Remove ANSI escape sequences and normalize line endings.
 *
 * Indexed by glyph (`✓`/`✘`), so it must run before any line matching.
 *
 * @param {unknown} text
 * @returns {string}
 */
export function stripAnsi(text) {
  return String(text ?? '')
    .replace(ANSI_CSI_RE, '')
    .replace(ANSI_OSC_RE, '')
    .replace(/\r\n?/g, '\n');
}

/**
 * Detect which Playwright reporter produced a paste.
 *
 * Order: empty → pure JSON → embedded JSON report (`{\s*"config":`) → list/line summary or header →
 * `unknown`. Never throws.
 *
 * @param {unknown} text
 * @returns {'json'|'list'|'unknown'}
 */
export function detectEvidenceFormat(text) {
  const trimmed = stripAnsi(text).trim();
  if (!trimmed) return 'unknown';
  if (trimmed.startsWith('{') && safeJsonParse(trimmed)) return 'json';
  if (JSON_CONFIG_ANCHOR_RE.test(trimmed)) return 'json';
  if (trimmed.split('\n').some((line) => SUMMARY_RE.test(line) || HEADER_RE.test(line))) {
    return 'list';
  }
  return 'unknown';
}

/**
 * Extract the JSON report from a paste: the whole text when it is JSON, else the slice starting at
 * the **last** embedded `{` + `"config":` anchor (never the first brace in the paste).
 *
 * @param {string} text
 * @returns {object|null}
 */
function extractJsonReport(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) {
    const whole = safeJsonParse(trimmed);
    if (whole) return whole;
  }
  const index = text.lastIndexOf(JSON_REPORT_ANCHOR);
  if (index === -1) return null;
  return safeJsonParse(text.slice(index + 1).trim());
}

/**
 * Zeroed evidence for an unrecognized or empty paste.
 *
 * @returns {{ format: 'unknown', reporter: null, stats: object, specs: Array, warnings: Array, truncated: boolean }}
 */
function emptyEvidence() {
  return {
    format: 'unknown',
    reporter: null,
    stats: {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      flaky: 0,
      durationMs: 0,
      playwrightVersion: null,
      projects: [],
      chromium: 'none',
    },
    specs: [],
    warnings: [],
    truncated: false,
  };
}

/**
 * Append a warning once, in the closed code set, with a bounded detail string.
 *
 * @param {Array<{code: string, detail: string}>} warnings
 * @param {string} code
 * @param {string} detail
 * @returns {void}
 */
function addWarning(warnings, code, detail) {
  if (!EVIDENCE_WARNING_CODES.includes(code)) return;
  if (warnings.some((warning) => warning.code === code)) return;
  warnings.push({ code, detail: clip(detail, MAX_DETAIL_CHARS) });
}

/**
 * Decide whether a run evidences a passing Chromium run (R6).
 *
 * A "green" normalized test is `status === 'expected'` with `expectedStatus === 'passed'` (the JSON
 * walk additionally requires a `passed` result before counting it in `stats.passed`).
 *
 * - `confirmed` — at least one green test runs in a project matching `chrom|chrome`.
 * - `assumed` — every green test has an empty project name **and** at most one project is
 *   configured (Playwright's default browser is Chromium).
 * - `none` — no green test, a named non-Chromium project, or unnamed tests with two or more
 *   configured projects (not attributable to one browser).
 *
 * @param {Array<{tests: Array<{status?: string, expectedStatus?: string, project?: string}>}>} specs
 * @param {{ projects?: Array<{name?: string}> }|null} config the report's `config` object
 * @returns {'confirmed'|'assumed'|'none'}
 */
export function chromiumEvidence(specs, config) {
  const greenProjects = [];
  for (const spec of Array.isArray(specs) ? specs : []) {
    for (const test of Array.isArray(spec?.tests) ? spec.tests : []) {
      if (test?.status === 'expected' && test?.expectedStatus === 'passed') {
        greenProjects.push(test.project || '');
      }
    }
  }
  if (!greenProjects.length) return 'none';
  if (greenProjects.some((project) => /chrom|chrome/i.test(project))) return 'confirmed';
  const configured = config && Array.isArray(config.projects) ? config.projects : [];
  if (greenProjects.every((project) => !project) && configured.length <= 1) return 'assumed';
  return 'none';
}

/**
 * Walk the JSON reporter's `suites` tree into normalized specs and counts.
 *
 * Only `title`, `projectName`, `status`, `expectedStatus`, retry count and the last result's
 * duration are copied; `attachments`, `errors`, `errorLocation`, `stdout`, `stderr`, `steps`, `id`
 * and `ok` never reach the payload.
 *
 * @param {object} report
 * @returns {{ format: 'json', reporter: 'json', stats: object, specs: Array, warnings: Array, truncated: boolean }}
 */
function parseJsonReport(report) {
  const config = report?.config && typeof report.config === 'object' ? report.config : {};
  const specsByFile = new Map();
  let counted = 0;
  let passed = 0;
  let failed = 0;
  let flaky = 0;
  let skipped = 0;
  let capped = false;

  const walk = (suite) => {
    if (capped) return;
    for (const spec of Array.isArray(suite?.specs) ? suite.specs : []) {
      if (counted >= MAX_EVIDENCE_TESTS || specsByFile.size >= MAX_EVIDENCE_SPECS) {
        capped = true;
        return;
      }
      const file = clip(spec?.file ?? suite?.file ?? '', MAX_FILE_CHARS);
      if (!specsByFile.has(file) && specsByFile.size >= MAX_EVIDENCE_SPECS) {
        capped = true;
        return;
      }
      const tests = [];
      for (const rawTest of Array.isArray(spec?.tests) ? spec.tests : []) {
        if (counted >= MAX_EVIDENCE_TESTS) {
          capped = true;
          break;
        }
        const results = Array.isArray(rawTest?.results) ? rawTest.results : [];
        const status = rawTest?.status || 'unexpected';
        const expectedStatus = rawTest?.expectedStatus || 'passed';
        const lastResult = results.length ? results[results.length - 1] : null;
        const passedResult = results.some((result) => result?.status === 'passed');
        tests.push({
          title: clip(spec?.title, MAX_TITLE_CHARS),
          project: rawTest?.projectName || '',
          status,
          expectedStatus,
          retryCount: Math.max(0, results.length - 1),
          durationMs: Math.max(0, Math.round(Number(lastResult?.duration) || 0)),
        });
        counted += 1;
        if (status === 'expected' && expectedStatus === 'passed' && passedResult) passed += 1;
        else if (status === 'unexpected') failed += 1;
        else if (status === 'flaky') flaky += 1;
        else if (status === 'skipped') skipped += 1;
      }
      const existing = specsByFile.get(file);
      if (existing) existing.tests.push(...tests);
      else specsByFile.set(file, { file, tests });
      if (capped) return;
    }
    for (const child of Array.isArray(suite?.suites) ? suite.suites : []) walk(child);
  };

  for (const suite of Array.isArray(report?.suites) ? report.suites : []) walk(suite);

  const specs = [...specsByFile.values()];

  const rawStats = report?.stats && typeof report.stats === 'object' ? report.stats : {};
  const durationMs = Math.max(0, Math.round(Number(rawStats.duration) || 0));
  const playwrightVersion =
    typeof config.version === 'string' && config.version ? config.version : null;
  const projects = (Array.isArray(config.projects) ? config.projects : []).map((project) =>
    String(project?.name ?? '')
  );

  const stats = {
    total: counted,
    passed,
    failed,
    skipped,
    flaky,
    durationMs,
    playwrightVersion,
    projects,
    chromium: chromiumEvidence(specs, config),
  };

  const warnings = [];
  const reportedTotal = ['expected', 'skipped', 'unexpected', 'flaky'].reduce(
    (sum, key) => sum + Math.max(0, Number(rawStats[key]) || 0),
    0
  );
  if (reportedTotal !== counted) {
    addWarning(
      warnings,
      'count_mismatch',
      `The report's stats describe ${reportedTotal} test(s) but ${counted} were found.`
    );
  }
  if (counted === 0) addWarning(warnings, 'no_tests', 'The report contains no tests.');

  return { format: 'json', reporter: 'json', stats, specs, warnings, truncated: false };
}

/**
 * Convert a reporter duration string (`438ms`, `1.1s`) to integer milliseconds.
 *
 * @param {unknown} text
 * @returns {number|null}
 */
function parseDuration(text) {
  const match = String(text ?? '')
    .trim()
    .match(/^([\d.]+)\s*(ms|s)$/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.round(match[2].toLowerCase() === 's' ? value * 1000 : value));
}

/**
 * Map a list-reporter status glyph to an outcome.
 *
 * @param {string} glyph
 * @returns {'passed'|'failed'|'skipped'}
 */
function glyphOutcome(glyph) {
  const mark = String(glyph ?? '').toLowerCase();
  if (mark === '✓' || mark === 'ok') return 'passed';
  if (mark === '✘' || mark === 'x') return 'failed';
  return 'skipped';
}

/**
 * Parse the list or line reporter's text output.
 *
 * Counts come from the summary block when present (the row counts are only used to detect a
 * disagreement); per-test rows are grouped by `project|file:line:column` so a retried test is one
 * entry, and the last attempt decides the outcome. Failure bodies are never parsed.
 *
 * @param {string} text
 * @returns {{ format: 'list', reporter: 'list'|'line', stats: object, specs: Array, warnings: Array, truncated: boolean }}
 */
function parseTextReport(text) {
  const rows = [];
  const summary = { passed: null, failed: null, flaky: null, skipped: null, durationMs: null };
  let sawLineProgress = false;

  for (const line of text.split('\n')) {
    const summaryMatch = line.match(SUMMARY_RE);
    if (summaryMatch) {
      const count = Number(summaryMatch[1]) || 0;
      const word = summaryMatch[2].toLowerCase();
      if (word === 'passed') summary.passed = (summary.passed || 0) + count;
      else if (word === 'failed' || word === 'interrupted') summary.failed = (summary.failed || 0) + count;
      else if (word === 'flaky') summary.flaky = (summary.flaky || 0) + count;
      else summary.skipped = (summary.skipped || 0) + count;
      if (summaryMatch[3]) {
        const duration = parseDuration(summaryMatch[3]);
        if (duration !== null) summary.durationMs = duration;
      }
      continue;
    }
    if (HEADER_RE.test(line)) continue;
    if (LINE_ROW_RE.test(line)) {
      sawLineProgress = true;
      continue;
    }
    const listRow = line.match(LIST_ROW_RE);
    if (listRow) rows.push(listRow);
  }

  const grouped = new Map();
  const order = [];
  for (const match of rows) {
    const project = match[3] || '';
    const file = clip(match[4], MAX_FILE_CHARS);
    const key = `${project}|${file}:${match[5]}:${match[6]}`;
    const outcome = glyphOutcome(match[1]);
    const retry = match[8] != null ? Number(match[8]) : null;
    const durationMs = match[9] != null ? parseDuration(`${match[9]}${match[10]}`) : null;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        project,
        file,
        title: clip(match[7].trim(), MAX_TITLE_CHARS),
        attempts: 1,
        outcome,
        retryCount: retry ?? 0,
        durationMs: outcome === 'skipped' ? null : durationMs,
      });
      order.push(key);
      continue;
    }
    existing.attempts += 1;
    existing.outcome = outcome;
    existing.retryCount = Math.max(existing.retryCount + 1, retry ?? 0);
    existing.durationMs = outcome === 'skipped' ? null : durationMs;
  }

  const specsByFile = new Map();
  const rowCounts = { passed: 0, failed: 0, flaky: 0, skipped: 0 };
  let kept = 0;
  let capped = false;
  for (const key of order) {
    if (kept >= MAX_EVIDENCE_TESTS) {
      capped = true;
      break;
    }
    const entry = grouped.get(key);
    let status = 'expected';
    let expectedStatus = 'passed';
    if (entry.outcome === 'skipped') {
      status = 'skipped';
      expectedStatus = 'skipped';
    } else if (entry.outcome === 'failed') {
      status = 'unexpected';
    } else if (entry.attempts > 1) {
      status = 'flaky';
    }

    let spec = specsByFile.get(entry.file);
    if (!spec) {
      if (specsByFile.size >= MAX_EVIDENCE_SPECS) {
        capped = true;
        break;
      }
      spec = { file: entry.file, tests: [] };
      specsByFile.set(entry.file, spec);
    }
    spec.tests.push({
      title: entry.title,
      project: entry.project,
      status,
      expectedStatus,
      retryCount: entry.attempts > 1 ? entry.retryCount : 0,
      durationMs: status === 'skipped' ? null : entry.durationMs,
    });
    kept += 1;
    if (status === 'expected') rowCounts.passed += 1;
    else if (status === 'unexpected') rowCounts.failed += 1;
    else if (status === 'flaky') rowCounts.flaky += 1;
    else rowCounts.skipped += 1;
  }

  const specs = [...specsByFile.values()];
  const warnings = [];
  const hasSummary =
    summary.passed != null ||
    summary.failed != null ||
    summary.flaky != null ||
    summary.skipped != null;
  const counts = hasSummary
    ? {
        passed: summary.passed || 0,
        failed: summary.failed || 0,
        flaky: summary.flaky || 0,
        skipped: summary.skipped || 0,
      }
    : rowCounts;

  if (
    hasSummary &&
    rows.length > 0 &&
    (counts.passed !== rowCounts.passed ||
      counts.failed !== rowCounts.failed ||
      counts.flaky !== rowCounts.flaky ||
      counts.skipped !== rowCounts.skipped)
  ) {
    addWarning(
      warnings,
      'count_mismatch',
      `The summary and the per-test rows disagree (summary p=${counts.passed} f=${counts.failed} s=${counts.skipped}; rows p=${rowCounts.passed} f=${rowCounts.failed} s=${rowCounts.skipped}).`
    );
  }

  const total = counts.passed + counts.failed + counts.flaky + counts.skipped;
  if (total === 0) addWarning(warnings, 'no_tests', 'The report contains no tests.');

  const projects = [];
  for (const spec of specs) {
    for (const test of spec.tests) {
      if (test.project && !projects.includes(test.project)) projects.push(test.project);
    }
  }

  const stats = {
    total,
    passed: counts.passed,
    failed: counts.failed,
    skipped: counts.skipped,
    flaky: counts.flaky,
    durationMs:
      summary.durationMs != null
        ? summary.durationMs
        : [...grouped.values()].reduce((sum, entry) => sum + (Number(entry.durationMs) || 0), 0),
    playwrightVersion: null,
    projects,
    chromium: chromiumEvidence(specs, { projects: [] }),
  };

  return {
    format: 'list',
    reporter: sawLineProgress ? 'line' : 'list',
    stats,
    specs,
    warnings,
    truncated: capped,
  };
}

/**
 * Keep the serialized payload under `MAX_EVIDENCE_PAYLOAD_CHARS` without touching the counts.
 *
 * Drops the least-valuable tail data in order: the last test entry of the last spec, then whole
 * specs from the end, then the excerpt. The summary facts (`schemaVersion`, `source`,
 * `selfReported`, `format`, `reporter`, `stats`, `warnings`, `truncated`) always survive.
 *
 * @param {object} payload
 * @returns {void}
 */
function clampPayload(payload) {
  let dropped = false;
  const fits = () => JSON.stringify(payload).length <= MAX_EVIDENCE_PAYLOAD_CHARS;

  while (!fits()) {
    const lastSpec = payload.specs.length ? payload.specs[payload.specs.length - 1] : null;
    if (lastSpec && lastSpec.tests.length) {
      lastSpec.tests.pop();
      dropped = true;
      continue;
    }
    if (payload.specs.length) {
      payload.specs.pop();
      dropped = true;
      continue;
    }
    if (payload.excerpt) {
      payload.excerpt = '';
      dropped = true;
      continue;
    }
    break;
  }

  if (dropped) {
    payload.truncated = true;
    addWarning(
      payload.warnings,
      'truncated',
      `The stored evidence was clipped to fit ${MAX_EVIDENCE_PAYLOAD_CHARS} characters.`
    );
  }
}

/**
 * Parse a pasted Playwright report into the normalized evidence payload.
 *
 * Never throws and never touches anything outside the argument. Unrecognized input yields
 * `format: 'unknown'`, zeroed stats and an `unrecognized_format` warning.
 *
 * @param {unknown} rawText the pasted reporter output
 * @returns {object} the normalized payload (see the module doc)
 */
export function parseEvidence(rawText) {
  const source = String(rawText ?? '');
  const inputTruncated = source.length > MAX_EVIDENCE_INPUT_CHARS;
  const text = stripAnsi(inputTruncated ? source.slice(0, MAX_EVIDENCE_INPUT_CHARS) : source);
  const format = detectEvidenceFormat(text);

  let parsed = null;
  if (format === 'json') {
    const report = extractJsonReport(text);
    if (report) parsed = parseJsonReport(report);
  } else if (format === 'list') {
    parsed = parseTextReport(text);
  }

  const evidence = parsed || emptyEvidence();
  if (!parsed) {
    addWarning(evidence.warnings, 'unrecognized_format', 'The pasted text is not a Playwright reporter output.');
  }

  const payload = {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    source: 'external',
    selfReported: true,
    format: evidence.format,
    reporter: evidence.reporter,
    stats: evidence.stats,
    specs: evidence.specs,
    warnings: evidence.warnings,
    truncated: evidence.truncated,
    excerpt: text.slice(0, MAX_EVIDENCE_EXCERPT_CHARS),
  };

  if (inputTruncated) {
    payload.truncated = true;
    addWarning(
      payload.warnings,
      'truncated',
      `The paste exceeded ${MAX_EVIDENCE_INPUT_CHARS} characters and was clipped.`
    );
  }

  clampPayload(payload);
  return payload;
}

/**
 * Normalize a spec path for case-insensitive comparison against submitted file paths.
 *
 * Strips a leading `./` and a leading `tests/` directory, backslashes and case, so
 * `tests/Checkout.spec.js` matches `Checkout.spec.js`.
 *
 * @param {unknown} file
 * @returns {string}
 */
function normalizeSpecKey(file) {
  return String(file ?? '')
    .replace(/\\/g, '/')
    .trim()
    .toLowerCase()
    .replace(/^\.\//, '')
    .replace(/^tests\//, '');
}

/**
 * Add submission-level mismatch warnings to the parser's warnings.
 *
 * `unknown_spec_files` compares the parsed spec basenames with the submitted code's file paths;
 * `claimed_pass_with_failures` is a heuristic on the learner's own write-up. Both are non-blocking
 * (D-21) and the returned array never mutates the input.
 *
 * @param {object} evidence the payload from `parseEvidence`
 * @param {{ files?: Record<string, string>|null, contentMd?: string }} [options]
 * @returns {Array<{code: string, detail: string}>}
 */
export function evidenceWarnings(evidence, { files = null, contentMd = '' } = {}) {
  const warnings = (Array.isArray(evidence?.warnings) ? evidence.warnings : []).map((warning) => ({
    code: warning.code,
    detail: warning.detail,
  }));

  if (files && typeof files === 'object') {
    const submitted = new Set(Object.keys(files).map((file) => normalizeSpecKey(file)));
    const parsed = [];
    for (const spec of Array.isArray(evidence?.specs) ? evidence.specs : []) {
      const key = normalizeSpecKey(spec?.file);
      if (key) parsed.push(key);
    }
    const unknown = parsed.filter((key) => !submitted.has(key));
    if (unknown.length) {
      addWarning(
        warnings,
        'unknown_spec_files',
        `Not found in the submitted files: ${unknown.slice(0, 3).join(', ')}.`
      );
    }
  }

  const failed = Number(evidence?.stats?.failed) || 0;
  if (failed > 0 && CLAIMED_PASS_RES.some((pattern) => pattern.test(String(contentMd ?? '')))) {
    addWarning(
      warnings,
      'claimed_pass_with_failures',
      'The write-up claims a green run but the evidence reports failures.'
    );
  }

  return warnings;
}

/**
 * Flatten the stored evidence into the facts shown next to the "self-reported evidence" label and
 * passed to the review prompt. Never includes the raw paste, the specs or the warnings array.
 *
 * @param {object} evidence the payload from `parseEvidence`
 * @param {object|null} [facts] optional deterministic spec-code facts to attach
 * @returns {object}
 */
export function summarizeEvidenceFacts(evidence, facts = null) {
  const stats = evidence?.stats || {};
  const summary = {
    total: Number(stats.total) || 0,
    passed: Number(stats.passed) || 0,
    failed: Number(stats.failed) || 0,
    skipped: Number(stats.skipped) || 0,
    flaky: Number(stats.flaky) || 0,
    durationMs: Number(stats.durationMs) || 0,
    playwrightVersion: stats.playwrightVersion ?? null,
    projects: Array.isArray(stats.projects) ? [...stats.projects] : [],
    chromium: stats.chromium || 'none',
    format: evidence?.format || 'unknown',
    warningCount: Array.isArray(evidence?.warnings) ? evidence.warnings.length : 0,
    selfReported: true,
    label: 'self-reported evidence',
  };
  if (facts && typeof facts === 'object') summary.facts = facts;
  return summary;
}
