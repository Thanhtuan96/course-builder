#!/usr/bin/env node
/**
 * beta-aggregate.mjs — read-only aggregation of exported beta reports (BETA-03, D-01..D-06).
 *
 * Usage:
 *   node scripts/beta-aggregate.mjs <dir>
 *   node scripts/beta-aggregate.mjs <dir> --json
 *   node scripts/beta-aggregate.mjs <dir> --roster <file>
 *
 * Every `*.json` file directly inside `<dir>` (non-recursive, sorted by name) is validated
 * against the frozen Phase 5 `reportSchema`, deduped per participant and printed as raw
 * per-participant counts. The script only reads: no file in the report folder is ever
 * written, renamed or removed, and subfolders are ignored.
 *
 * Output is raw counts only — the tool never computes or prints a percentage, rate or
 * average (D-05). The owner does the arithmetic against `docs/beta/owner/THRESHOLDS.md`.
 */
import { lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reportSchema } from '../studio/src/lib/beta/report.js';

/** Largest report accepted, in bytes (T-10-05). Checked before the file is read. */
export const MAX_REPORT_BYTES = 1048576;

/** Longest reason kept for one invalid file, so a single line stays readable. */
const MAX_REASON_CHARS = 160;

/** Table column order, pinned by the CLI contract. */
const COLUMNS = [
  'participant',
  'day',
  'activated',
  'activeDays',
  'loops',
  'revisions',
  'w1',
  'w2',
  'w2Days',
  'capSub',
  'capEvidence',
  'verdict',
];

const USAGE = `Usage: node scripts/beta-aggregate.mjs <dir> [--json] [--roster <file>]

Read every *.json report directly inside <dir> (non-recursive), validate it against the
frozen beta report schema and print raw per-participant counts.

Options:
  --json           print one machine-readable JSON document instead of a table
  --roster <file>  JSON array or newline/comma-delimited ids; ids without a report print
                   as unknown, and the roster file itself is not scanned as a report
  -h, --help       print this help`;

/**
 * Collapse a message onto one line and cap it at a readable length.
 * @param {string} text
 * @returns {string}
 */
function oneLine(text) {
  const flat = String(text).replace(/\s+/g, ' ').trim();
  return flat.length > MAX_REASON_CHARS
    ? `${flat.slice(0, MAX_REASON_CHARS - 3)}...`
    : flat;
}

/**
 * Parse CLI arguments into a plain options object.
 * @param {string[]} argv full process argv (node, script, ...args)
 * @returns {{ dir: string|null, json: boolean, roster: string|null, help: boolean, error: string|null }}
 */
export function parseArgs(argv) {
  const result = { dir: null, json: false, roster: null, help: false, error: null };
  const args = argv.slice(2);

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (token === '--help' || token === '-h') {
      result.help = true;
      continue;
    }
    if (token === '--json') {
      result.json = true;
      continue;
    }
    if (token === '--roster') {
      const value = args[index + 1];
      if (value === undefined || value.startsWith('-')) {
        result.error = 'missing value for --roster';
        return result;
      }
      result.roster = value;
      index += 1;
      continue;
    }
    if (token.startsWith('-')) {
      result.error = `unknown option: ${token}`;
      return result;
    }
    if (result.dir !== null) {
      result.error = `unexpected argument: ${token}`;
      return result;
    }
    result.dir = token;
  }

  if (!result.help && result.dir === null) result.error = 'missing <dir>';
  return result;
}

/**
 * List `*.json` candidates directly inside a directory, sorted by name (D-01).
 * Dotfiles are skipped and the roster is excluded by resolved path (D-06).
 * @param {string} dir
 * @param {string|null} rosterPath
 * @returns {string[]} basenames in UTF-16 code-unit order
 */
export function listReportFiles(dir, rosterPath = null) {
  const rosterAbs = rosterPath === null ? null : resolve(rosterPath);
  return readdirSync(dir)
    .sort()
    .filter((name) => {
      if (name.startsWith('.')) return false;
      if (!name.endsWith('.json')) return false;
      if (rosterAbs !== null && resolve(dir, name) === rosterAbs) return false;
      return true;
    });
}

/**
 * Validate one candidate file: regular-file check, size cap, JSON parse, frozen schema (D-02).
 * @param {string} dir
 * @param {string} name
 * @returns {{ ok: true, file: string, report: object } | { ok: false, file: string, reason: string }}
 */
export function validateReportFile(dir, name) {
  const absPath = join(dir, name);

  let stat;
  try {
    stat = lstatSync(absPath);
  } catch (err) {
    return { ok: false, file: name, reason: oneLine(`could not inspect: ${err.code || err.message}`) };
  }

  if (!stat.isFile()) return { ok: false, file: name, reason: 'not a regular file' };

  if (stat.size > MAX_REPORT_BYTES) {
    return {
      ok: false,
      file: name,
      reason: `file too large: ${stat.size} bytes (max ${MAX_REPORT_BYTES})`,
    };
  }

  let text;
  try {
    text = readFileSync(absPath, 'utf8');
  } catch (err) {
    return { ok: false, file: name, reason: oneLine(`could not read: ${err.code || err.message}`) };
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return { ok: false, file: name, reason: oneLine(`invalid JSON: ${err.message}`) };
  }

  const result = reportSchema.safeParse(parsed);
  if (result.success) return { ok: true, file: name, report: result.data };

  const [first, ...rest] = result.error.issues;
  const path = first.path.join('.') || '(root)';
  const more = rest.length > 0 ? ` (+${rest.length} more)` : '';
  return {
    ok: false,
    file: name,
    reason: oneLine(`${path}: ${first.code}: ${first.message}${more}`),
  };
}

/**
 * Sum every practice-loop kind in a report.
 * @param {Record<string, number>} byKind
 * @returns {number}
 */
function countLoops(byKind) {
  return Object.values(byKind).reduce((sum, value) => sum + value, 0);
}

/**
 * Collapse duplicate exports for one participant (D-04).
 * Highest `generatedAtDayOffset` wins; a same-offset tie keeps the lexicographically greater
 * filename. Every dropped file produces exactly one warning and one duplicate record.
 * @param {{ file: string, report: object }[]} reports valid reports in filename order
 * @returns {{ entries: { file: string, report: object }[], warnings: string[], duplicates: { participantId: string, kept: string, dropped: string }[] }}
 */
export function dedupe(reports) {
  const kept = new Map();
  const warnings = [];
  const duplicates = [];

  for (const candidate of reports) {
    const id = candidate.report.participantId;
    const current = kept.get(id);

    if (current === undefined) {
      kept.set(id, candidate);
      continue;
    }

    const wins =
      candidate.report.generatedAtDayOffset > current.report.generatedAtDayOffset ||
      (candidate.report.generatedAtDayOffset === current.report.generatedAtDayOffset &&
        candidate.file > current.file);

    const dropped = wins ? current : candidate;
    if (wins) kept.set(id, candidate);
    warnings.push(`duplicate participant ${id}: dropped ${dropped.file}, kept ${wins ? candidate.file : current.file}`);
    duplicates.push({
      participantId: id,
      kept: wins ? candidate.file : current.file,
      dropped: dropped.file,
    });
  }

  const entries = [...kept.values()].sort((a, b) => {
    if (a.file < b.file) return -1;
    if (a.file > b.file) return 1;
    return 0;
  });

  return { entries, warnings, duplicates };
}

/**
 * Read a roster file as a JSON array of ids or a whitespace/comma-delimited list (D-06).
 * Duplicate ids collapse and order is irrelevant because unknown rows are sorted.
 * @param {string} rosterPath
 * @returns {string[]}
 * @throws {Error} when the file cannot be read or does not hold non-empty string ids
 */
export function readRoster(rosterPath) {
  let text;
  try {
    text = readFileSync(rosterPath, 'utf8');
  } catch (err) {
    throw new Error(`could not read roster ${rosterPath}: ${err.code || err.message}`);
  }

  const trimmed = text.trim();
  let ids;

  if (trimmed.startsWith('[')) {
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch (err) {
      throw new Error(`could not parse roster ${rosterPath}: ${oneLine(err.message)}`);
    }
    if (
      !Array.isArray(parsed) ||
      !parsed.every((id) => typeof id === 'string' && id.trim() !== '')
    ) {
      throw new Error(`could not parse roster ${rosterPath}: expected an array of participant ids`);
    }
    ids = parsed.map((id) => id.trim());
  } else {
    ids = trimmed
      .split(/[\s,]+/)
      .map((id) => id.trim())
      .filter(Boolean);
  }

  return [...new Set(ids)];
}

/**
 * Project a kept report onto the pinned machine-readable participant shape.
 * Values a report cannot supply stay `null` so the JSON document never invents a metric.
 * @param {{ file: string, report: object }} entry
 * @returns {object}
 */
function participantFromEntry(entry) {
  const report = entry.report;
  return {
    participantId: report.participantId,
    source: entry.file,
    generatedAtDayOffset: report.generatedAtDayOffset,
    activated: report.activation.activated,
    activeDayCount: report.window.activeDayOffsets.length,
    loopTotal: countLoops(report.loops.byKind),
    loopsByKind: { ...report.loops.byKind },
    revisions: { ...report.loops.revisions },
    week1Active: report.retention.week1Active,
    week2Return: report.retention.week2Return,
    week2MeaningfulDays: report.retention.week2MeaningfulDays,
    capstoneSubmissions: report.capstone.submissions,
    capstoneExternalEvidence: report.capstone.externalEvidence,
    capstoneVerdict: report.capstone.verdict,
  };
}

/**
 * Build an all-null participant row for a roster id with no export (D-06).
 * @param {string} participantId
 * @returns {object}
 */
function participantFromRoster(participantId) {
  return {
    participantId,
    source: null,
    generatedAtDayOffset: null,
    activated: null,
    activeDayCount: null,
    loopTotal: null,
    loopsByKind: null,
    revisions: null,
    week1Active: null,
    week2Return: null,
    week2MeaningfulDays: null,
    capstoneSubmissions: null,
    capstoneExternalEvidence: null,
    capstoneVerdict: null,
  };
}

/**
 * Render one table cell. `null` means the report cannot supply the value.
 * @param {string|number|boolean|null} value
 * @returns {string}
 */
function cell(value) {
  return value === null || value === undefined ? 'unknown' : String(value);
}

/**
 * Render a boolean flag, or `unknown` when the report cannot supply it.
 * @param {boolean|null} value
 * @returns {string}
 */
function flag(value) {
  if (value === null || value === undefined) return 'unknown';
  return value ? 'yes' : 'no';
}

/**
 * Render the aligned plain-text table (D-05). Header plus one row per participant;
 * every column pads to the widest cell with a single-space gap.
 * @param {object[]} participants participant objects from the JSON document shape
 * @returns {string}
 */
export function formatTable(participants) {
  const rows = [
    COLUMNS,
    ...participants.map((participant) => [
      participant.participantId,
      cell(participant.generatedAtDayOffset),
      flag(participant.activated),
      cell(participant.activeDayCount),
      cell(participant.loopTotal),
      participant.revisions === null
        ? 'unknown'
        : [
            participant.revisions.quiz,
            participant.revisions.tutor,
            participant.revisions.workspace,
            participant.revisions.capstone,
          ].join('/'),
      flag(participant.week1Active),
      flag(participant.week2Return),
      cell(participant.week2MeaningfulDays),
      cell(participant.capstoneSubmissions),
      cell(participant.capstoneExternalEvidence),
      cell(participant.capstoneVerdict),
    ]),
  ];

  const widths = COLUMNS.map((_, index) => Math.max(...rows.map((row) => row[index].length)));

  return rows
    .map((row) => row.map((value, index) => value.padEnd(widths[index])).join(' ').trimEnd())
    .join('\n');
}

/**
 * Assemble the pinned `--json` document. `ok` mirrors the exit code; nothing is derived.
 * @param {{ participants: object[], invalid: { file: string, reason: string }[], duplicates: { participantId: string, kept: string, dropped: string }[], unknown: string[], ok: boolean }} input
 * @returns {object}
 */
export function buildJsonDocument({ participants, invalid, duplicates, unknown, ok }) {
  return {
    schemaVersion: 1,
    ok,
    participants,
    invalid,
    duplicates,
    unknown,
  };
}

/**
 * Print a directory-level failure: one stderr line, empty stdout, exit 1 (D-03).
 * @param {string} message
 * @returns {number}
 */
function failDirectory(message) {
  process.stderr.write(`${message}\n`);
  return 1;
}

/**
 * CLI entry point.
 * @param {string[]} argv full process argv
 * @returns {number} 0 when at least one report was found and none was invalid, else 1
 */
export function main(argv) {
  const args = parseArgs(argv);

  if (args.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  if (args.error !== null) {
    process.stderr.write(`${USAGE}\nError: ${args.error}\n`);
    return 1;
  }

  const dir = args.dir;

  let dirStat;
  try {
    dirStat = lstatSync(dir);
  } catch {
    return failDirectory(`not a directory: ${dir}`);
  }
  if (!dirStat.isDirectory()) return failDirectory(`not a directory: ${dir}`);

  let rosterIds = [];
  if (args.roster !== null) {
    try {
      rosterIds = readRoster(args.roster);
    } catch (err) {
      process.stderr.write(`Error: ${String(err.message).replace(/\s+/g, ' ').trim()}\n`);
      return 1;
    }
  }

  let names;
  try {
    names = listReportFiles(dir, args.roster);
  } catch (err) {
    return failDirectory(`could not read directory ${dir}: ${err.code || err.message}`);
  }
  if (names.length === 0) return failDirectory(`no report files in ${dir}`);

  const valid = [];
  const invalid = [];
  for (const name of names) {
    const result = validateReportFile(dir, name);
    if (result.ok) valid.push({ file: result.file, report: result.report });
    else invalid.push({ file: result.file, reason: result.reason });
  }

  const { entries, warnings, duplicates } = dedupe(valid);
  const keptIds = new Set(entries.map((entry) => entry.report.participantId));
  const missingIds = rosterIds.filter((id) => !keptIds.has(id)).sort();

  const participants = [
    ...entries.map(participantFromEntry),
    ...missingIds.map(participantFromRoster),
  ];
  const ok = invalid.length === 0;

  if (args.json) {
    const document = buildJsonDocument({ participants, invalid, duplicates, unknown: missingIds, ok });
    process.stdout.write(`${JSON.stringify(document, null, 2)}\n`);
    return ok ? 0 : 1;
  }

  for (const item of invalid) process.stderr.write(`invalid ${item.file}: ${item.reason}\n`);
  for (const warning of warnings) process.stderr.write(`${warning}\n`);
  process.stdout.write(`${formatTable(participants)}\n`);
  process.stderr.write(
    `${valid.length} valid, ${invalid.length} invalid, ${duplicates.length} duplicate(s)\n`
  );

  return ok ? 0 : 1;
}

/**
 * True only when this module is the process entry point (realpath handles macOS `/var`).
 * @returns {boolean}
 */
function isMain() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}

if (isMain()) {
  process.exitCode = main(process.argv);
}
