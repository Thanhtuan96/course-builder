/**
 * Self-check convention shared with the Phase 23/28 exercise skeletons (CODE-03).
 *
 * The exercise file ships *skeleton + self-checks only*, in the course language's own idiom:
 *   - Python      `assert <expr>` inside `if __name__ == "__main__":`
 *   - JavaScript  `console.assert(<expr>, "<msg>")` and/or the injected `check("<name>", () => …)`
 *                 (a tiny helper we provide so checks can be named)
 *   - SQL         the expected result rows in a comment directive (`-- @check <name>` + `-- @expect <json>`)
 *
 * "Check" runs the file and reports each self-check as pass/fail. This module owns the *pure*
 * parts — parsing / source instrumentation / row comparison — so both the browser workers and
 * the tests use exactly the same rules. It never invents or reveals a solution.
 *
 * Result shape used everywhere: `{ name, passed, message }`.
 */

/**
 * @typedef {{ name: string, passed: boolean, message?: string }} CheckResult
 */

/**
 * Flatten check results into a summary.
 * @param {CheckResult[]} checks
 */
export function summarize(checks) {
  const list = Array.isArray(checks) ? checks : [];
  const passed = list.filter((c) => c.passed).length;
  return { passed, failed: list.length - passed, total: list.length };
}

const MAX_NAME = 80;

/** @param {string} text */
function clipName(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > MAX_NAME ? `${clean.slice(0, MAX_NAME - 1)}…` : clean;
}

/* ------------------------------------------------------------------ JavaScript */

/**
 * Statically discover the checks the UI can show before a run.
 * This is best-effort (used only for the "n checks" label); the worker records the real results.
 * @param {string} source
 * @returns {string[]}
 */
export function listJsChecks(source) {
  const names = [];
  const text = String(source || '');

  const checkCall = /(?:^|[^.\w])check\s*\(\s*(['"`])([^'"`]*)\1/g;
  let m;
  while ((m = checkCall.exec(text))) names.push(clipName(m[2]));

  const assertCall = /console\.assert\s*\(/g;
  let i = 0;
  while ((m = assertCall.exec(text))) {
    const message = readAssertMessage(text, m.index + m[0].length);
    i += 1;
    names.push(clipName(message || `console.assert #${i}`));
  }
  return names;
}

/**
 * Read the second argument of a `console.assert(...)` starting right after the open paren.
 * Balanced-paren aware; returns the string literal message if present.
 * @param {string} text
 * @param {number} start index just after `console.assert(`
 * @returns {string|null}
 */
function readAssertMessage(text, start) {
  let depth = 1;
  let i = start;
  let inString = null;
  let lastTopComma = -1;
  for (; i < text.length; i++) {
    const ch = text[i];
    const prev = text[i - 1];
    if (inString) {
      if (ch === inString && prev !== '\\') inString = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    else if (ch === ')' || ch === ']' || ch === '}') {
      depth -= 1;
      if (depth === 0) break;
    } else if (ch === ',' && depth === 1) lastTopComma = i;
  }
  if (lastTopComma < 0) return null;
  const arg = text.slice(lastTopComma + 1, i).trim();
  const str = /^(['"`])(.*)\1$/s.exec(arg);
  return str ? str[2] : arg;
}

/**
 * JavaScript instrumentation is a no-op at the source level: the worker injects
 * `console.assert` + `check(name, fn)` and records results at runtime (so one failed check
 * never stops the others). Kept as a function so the worker and tests share one entry point.
 * @param {string} source
 * @returns {{ code: string, checks: string[] }}
 */
export function instrumentJs(source) {
  return { code: String(source ?? ''), checks: listJsChecks(source) };
}

/* ------------------------------------------------------------------ Python */

/**
 * Rewrite single-line `assert <expr>[, <msg>]` statements into recorded `__check(...)` calls so
 * every self-check runs and is reported individually (an `AssertionError` would otherwise abort
 * the whole script). The expression is passed as a thunk, so it is evaluated exactly once.
 *
 * Limitation (documented): asserts spanning multiple source lines are not rewritten.
 * @param {string} source
 * @returns {{ code: string, checks: string[] }}
 */
export function instrumentPython(source) {
  const lines = String(source ?? '').split('\n');
  const names = [];
  const out = lines.map((line) => {
    const m = /^(\s*)assert\s+(.+?)\s*$/.exec(line);
    if (!m) return line;
    const indent = m[1];
    const body = m[2];
    const { expr, message } = splitPythonAssert(body);
    const name = clipName(message || expr);
    names.push(name);
    const msgLiteral = message ? JSON.stringify(message) : 'None';
    const exprLiteral = JSON.stringify(expr);
    return `${indent}__check(${JSON.stringify(name)}, lambda: (${expr}), ${msgLiteral}, ${exprLiteral})`;
  });
  return { code: out.join('\n'), checks: names };
}

/**
 * Split a Python assert body into its expression and optional message.
 * The message is everything after the *last* top-level comma (depth 0, outside strings).
 * @param {string} body
 * @returns {{ expr: string, message: string|null }}
 */
export function splitPythonAssert(body) {
  const text = String(body);
  let depth = 0;
  let inString = null;
  let lastComma = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const prev = text[i - 1];
    if (inString) {
      if (ch === inString && prev !== '\\') inString = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = ch;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    else if (ch === ')' || ch === ']' || ch === '}') depth -= 1;
    else if (ch === ',' && depth === 0) lastComma = i;
  }
  if (lastComma < 0) return { expr: text.trim(), message: null };
  return {
    expr: text.slice(0, lastComma).trim(),
    message: text.slice(lastComma + 1).trim().replace(/^(['"])(.*)\1$/s, '$2'),
  };
}

/* ------------------------------------------------------------------ SQL */

/**
 * Parse `-- @check <name>` / `-- @expect <json-rows>` directives from a SQL exercise file.
 *
 * Convention (kept dead simple and documented so the skeleton generator can emit it):
 *   -- @check returns top scorer
 *   -- @expect [{"name": "Ada", "score": 9}]
 *
 * Each `@expect` becomes one check comparing the *last* result set to the expected rows.
 * With no directives, Check simply runs the query and shows the table.
 *
 * @param {string} source
 * @returns {Array<{ name: string, expected: any }>}
 */
export function parseSqlChecks(source) {
  const lines = String(source ?? '').split('\n');
  const out = [];
  let pendingName = null;
  for (const raw of lines) {
    const line = raw.trim();
    const check = /^--\s*@check\s+(.+)$/i.exec(line);
    if (check) {
      pendingName = clipName(check[1]);
      continue;
    }
    const expect = /^--\s*@expect\s+(.+)$/i.exec(line);
    if (expect) {
      const json = expect[1].trim();
      let parsed = null;
      try {
        parsed = JSON.parse(json);
      } catch {
        parsed = json;
      }
      out.push({ name: pendingName || `@expect #${out.length + 1}`, expected: parsed });
      pendingName = null;
    }
  }
  return out;
}

/**
 * Compare a SQL result set (array of row objects) to an expected array of row objects.
 * Order-insensitive; values compared loosely (numbers vs numeric strings match) because
 * sql.js and drivers differ on typing.
 * @param {any} actual
 * @param {any} expected
 * @returns {boolean}
 */
export function compareSqlRows(actual, expected) {
  if (!Array.isArray(expected)) return false;
  if (!Array.isArray(actual)) return false;
  if (actual.length !== expected.length) return false;
  const norm = (rows) =>
    rows
      .map((row) =>
        JSON.stringify(
          Object.keys(row || {})
            .sort()
            .map((k) => [k, loose(row[k])])
        )
      )
      .sort();
  return JSON.stringify(norm(actual)) === JSON.stringify(norm(expected));
}

/** @param {any} value */
function loose(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
    return String(Number(value));
  }
  return String(value);
}
