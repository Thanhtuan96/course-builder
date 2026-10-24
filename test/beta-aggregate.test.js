/**
 * Beta aggregation CLI and kit guards (BETA-02, BETA-03, BETA-04).
 *
 * Black-box tests around `scripts/beta-aggregate.mjs`: the real script is spawned with an
 * absolute path so exit codes and stdout/stderr separation are real. The `docs` block guards
 * the D-17 kit invariants: README links resolve, no document is an orphan, every check-in asks
 * the three questions, THRESHOLDS stays draft with an empty sign-off block, and the D-15
 * security rule is taught without ever naming a forbidden relaxation.
 *
 * @vitest-environment node
 */
import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVENT_KINDS } from '../studio/src/lib/repo/events.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'beta-aggregate.mjs');
const FIXTURES = join(REPO_ROOT, 'test', 'fixtures', 'beta-reports');
const DOCS = join(REPO_ROOT, 'docs', 'beta');

const CANONICAL = join(
  FIXTURES,
  'valid',
  'professor-beta-report-11111111-1111-4111-8111-111111111111-d14.json'
);

const ID = {
  A: '11111111-1111-4111-8111-111111111111',
  B: '22222222-2222-4222-8222-222222222222',
  C: '33333333-3333-4333-8333-333333333333',
  E: '55555555-5555-4555-8555-555555555555',
  F: '66666666-6666-4666-8666-666666666666',
  G: '77777777-7777-4777-8777-777777777777',
  H: '88888888-8888-4888-8888-888888888888',
};

const HEADER = [
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

const METRIC_WORD = /\b(percent|percentage|rate|average|avg)\b/i;

const tempDirs = [];

afterEach(() => {
  while (tempDirs.length > 0) rmSync(tempDirs.pop(), { recursive: true, force: true });
});

/**
 * Run the real CLI with an absolute script path.
 * @param {string[]} args
 * @param {string} [cwd]
 */
function run(args, cwd = REPO_ROOT) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf-8' });
}

/** Non-empty lines of a stream. */
function lines(text) {
  return text.split('\n').filter((line) => line.trim() !== '');
}

/** Header tokens of a table run. */
function headerOf(stdout) {
  return lines(stdout)[0].split(/\s+/);
}

/** The one table row mentioning a participant id. */
function rowOf(stdout, participantId) {
  const row = lines(stdout).find((line) => line.includes(participantId));
  return row === undefined ? [] : row.split(/\s+/);
}

/** Parse the single JSON document on stdout. */
function jsonOf(result) {
  return JSON.parse(result.stdout);
}

/** Everything the report folder holds, with size and mtime, for the read-only assertion. */
function snapshot(dir) {
  return readdirSync(dir)
    .sort()
    .map((name) => {
      const stat = statSync(join(dir, name));
      return `${name}:${stat.size}:${stat.mtimeMs}`;
    });
}

/** Every key at every depth of a JSON value. */
function collectKeys(value, found = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, found);
  } else if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      found.push(key);
      collectKeys(child, found);
    }
  }
  return found;
}

/** Recursively list every file under a directory. */
function walkFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walkFiles(full));
    else found.push(full);
  }
  return found;
}

/** Make a throwaway directory that is removed after the test. */
function tempDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

describe('table', () => {
  it('prints one aligned row per participant with raw counts only', () => {
    const result = run([join(FIXTURES, 'valid')]);

    expect(result.status, 'valid folder exits 0').toBe(0);
    expect(headerOf(result.stdout)).toEqual(HEADER);
    expect(lines(result.stdout), 'header plus two rows').toHaveLength(3);

    expect(rowOf(result.stdout, ID.A)).toEqual([
      ID.A,
      '14',
      'yes',
      '5',
      '7',
      '1/0/1/0',
      'yes',
      'yes',
      '3',
      '1',
      '0',
      'unknown',
    ]);
    expect(rowOf(result.stdout, ID.B)).toEqual([
      ID.B,
      '0',
      'no',
      '1',
      '0',
      '0/0/0/0',
      'no',
      'no',
      '0',
      '0',
      '0',
      'unknown',
    ]);
    expect(result.stderr).toMatch(/^2 valid, 0 invalid, 0 duplicate\(s\)$/m);
  });

  it('ignores subfolders (non-recursive scan)', () => {
    const result = run([join(FIXTURES, 'nested')]);

    expect(result.status).toBe(0);
    expect(lines(result.stdout), 'header plus exactly one row').toHaveLength(2);
    expect(rowOf(result.stdout, ID.G)).toHaveLength(HEADER.length);
    expect(result.stdout).not.toContain(ID.H);
    expect(result.stderr).not.toContain(ID.H);
    expect(result.stdout).not.toContain('nested/sub');
    expect(result.stderr).not.toContain('nested/sub');
  });

  it('never writes to the report folder', () => {
    const dir = join(FIXTURES, 'valid');
    const before = snapshot(dir);
    const result = run([dir]);
    const after = snapshot(dir);

    expect(result.status).toBe(0);
    expect(after, 'fixture tree must be byte- and mtime-identical').toEqual(before);
  });
});

describe('json', () => {
  it('prints exactly one pinned document for a valid folder', () => {
    const result = run([join(FIXTURES, 'valid'), '--json']);

    expect(result.status).toBe(0);
    const document = jsonOf(result);
    expect(result.stdout.trim().startsWith('{')).toBe(true);
    expect(result.stdout.trim().endsWith('}')).toBe(true);

    expect(document.schemaVersion).toBe(1);
    expect(document.ok).toBe(true);
    expect(document.participants).toHaveLength(2);
    expect(document.invalid).toEqual([]);
    expect(document.duplicates).toEqual([]);
    expect(document.unknown).toEqual([]);

    const participant = document.participants.find((entry) => entry.participantId === ID.A);
    expect(participant, 'participant A present').toBeDefined();
    expect(participant.loopTotal).toBe(7);
    expect(Object.keys(participant.loopsByKind).sort()).toEqual([...EVENT_KINDS].sort());
    expect(participant.loopsByKind).toEqual({
      quiz_completed: 2,
      recall_completed: 1,
      answer_sent_for_review: 1,
      workspace_run: 2,
      exercise_completed: 0,
      capstone_checkpoint: 1,
    });
    expect(participant.revisions).toEqual({
      quiz: 1,
      tutor: 0,
      workspace: 1,
      capstone: 0,
      explicit: 1,
      inferred: 1,
    });
    expect(participant.capstoneVerdict).toBeNull();
    expect(participant.source).toBe(
      'professor-beta-report-11111111-1111-4111-8111-111111111111-d14.json'
    );
    expect(participant.week1Active).toBe(true);
    expect(participant.week2Return).toBe(true);
    expect(participant.week2MeaningfulDays).toBe(3);
    expect(participant.activeDayCount).toBe(5);
    expect(participant.capstoneSubmissions).toBe(1);
    expect(participant.capstoneExternalEvidence).toBe(0);
  });
});

describe('invalid', () => {
  const invalidDir = join(FIXTURES, 'invalid');
  const expected = {
    'bad-schema-version.json': ['schemaVersion: invalid_value'],
    'missing-bykind.json': ['loops.byKind', 'invalid_type'],
    'extra-key.json': ['unrecognized_keys'],
    'bad-provider.json': ['app.provider: invalid_format'],
    'broken.json': ['invalid JSON:'],
    'array.json': ['(root): invalid_type'],
  };

  it('lists every invalid file with one reason each and exits 1', () => {
    const result = run([invalidDir]);

    expect(result.status).toBe(1);
    expect(lines(result.stdout), 'no data row when nothing is valid').toHaveLength(1);
    expect(result.stdout).not.toContain(ID.A);

    const errLines = lines(result.stderr);
    expect(errLines.length).toBeGreaterThan(0);
    for (const line of errLines) {
      const allowed =
        /^\d+ valid, \d+ invalid, \d+ duplicate\(s\)$/.test(line) || line.startsWith('invalid ');
      expect(allowed, `unexpected stderr line: ${line}`).toBe(true);
    }

    for (const [name, substrings] of Object.entries(expected)) {
      const matching = errLines.filter((line) => line.includes(name));
      expect(matching, `exactly one line for ${name}`).toHaveLength(1);
      expect(matching[0].startsWith('invalid '), `${name} line starts with "invalid "`).toBe(true);
      for (const substring of substrings) {
        expect(matching[0], `${name} reason mentions ${substring}`).toContain(substring);
      }
    }

    expect(result.stderr).not.toMatch(/node:internal/);
    expect(result.stderr).not.toMatch(/^\s+at /m);
    expect(result.stderr).not.toContain(FIXTURES);
  });

  it('still prints valid participants beside an invalid file', () => {
    const result = run([join(FIXTURES, 'mixed')]);

    expect(result.status).toBe(1);
    expect(rowOf(result.stdout, ID.C)).toHaveLength(HEADER.length);
    expect(result.stderr).toMatch(/invalid zz-bad-provider\.json: .*invalid_format/);
  });

  it('keeps the JSON document parseable, ok false and fully populated', () => {
    const result = run([invalidDir, '--json']);

    expect(result.status).toBe(1);
    const document = jsonOf(result);
    expect(document.ok).toBe(false);
    expect(document.participants).toEqual([]);
    expect(document.invalid).toHaveLength(6);
    for (const entry of document.invalid) {
      expect(typeof entry.file).toBe('string');
      expect(entry.reason.length).toBeGreaterThan(0);
      expect(entry.reason).not.toContain('\n');
      expect(entry.reason).not.toContain(REPO_ROOT);
    }
    expect(result.stdout).not.toMatch(/node:internal/);
    expect(result.stdout).not.toMatch(/^\s+at /m);
  });

  it('keeps valid participants in the JSON document when one file is invalid', () => {
    const result = run([join(FIXTURES, 'mixed'), '--json']);

    expect(result.status).toBe(1);
    const document = jsonOf(result);
    expect(document.ok).toBe(false);
    expect(document.invalid).toHaveLength(1);
    expect(document.participants.map((entry) => entry.participantId)).toEqual([ID.C]);
  });

  it('reports a missing directory as not a directory with empty stdout', () => {
    const result = run([join(FIXTURES, 'no-such-dir')]);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('not a directory');
    expect(lines(result.stderr)).toHaveLength(1);
  });

  it('reports a regular file passed as <dir> as not a directory', () => {
    const result = run([join(REPO_ROOT, 'package.json')]);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('not a directory');
    expect(lines(result.stderr)).toHaveLength(1);
  });

  it('reports a folder without report files as no report files', () => {
    const result = run([join(FIXTURES, 'empty')]);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('no report files');
    expect(lines(result.stderr)).toHaveLength(1);
  });

  it('rejects a report over the size cap before parsing it', () => {
    const dir = tempDir('beta-oversize-');
    const canonical = readFileSync(CANONICAL, 'utf8');
    writeFileSync(join(dir, 'big.json'), `${canonical}${' '.repeat(1048576)}`);

    const result = run([dir]);

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/^invalid big\.json: file too large: \d+ bytes/m);
    expect(result.stderr).toContain('1048576');
  });

  it.skipIf(process.platform === 'win32')('rejects a symlinked .json without reading it', () => {
    const dir = tempDir('beta-symlink-');
    const sentinelDir = tempDir('beta-sentinel-');
    const sentinel = join(sentinelDir, 'secret.txt');
    writeFileSync(sentinel, 'SENTINEL-CONTENT-MUST-NOT-LEAK\n');
    copyFileSync(CANONICAL, join(dir, 'ok.json'));
    symlinkSync(sentinel, join(dir, 'link.json'));

    const result = run([dir]);

    expect(result.status, 'a non-regular .json entry is invalid').toBe(1);
    expect(result.stderr).toMatch(/^invalid link\.json: .*not a regular file$/m);
    expect(rowOf(result.stdout, ID.A)).toHaveLength(HEADER.length);
    expect(result.stdout).not.toContain('SENTINEL-CONTENT-MUST-NOT-LEAK');
    expect(result.stderr).not.toContain('SENTINEL-CONTENT-MUST-NOT-LEAK');

    const document = jsonOf(run([dir, '--json']));
    const entry = document.invalid.find((item) => item.file === 'link.json');
    expect(entry, 'link.json listed as invalid').toBeDefined();
    expect(entry.reason).toMatch(/not a regular file/);
    expect(document.participants.map((participant) => participant.participantId)).toEqual([ID.A]);
  });
});

describe('usage', () => {
  const usageErrors = [[], ['--nope'], ['--json=true'], ['--roster=x'], ['one', 'two'], ['--roster']];

  for (const args of usageErrors) {
    it(`exits 1 with usage on stderr for ${JSON.stringify(args)}`, () => {
      const result = run(args);

      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr.startsWith('Usage:')).toBe(true);
    });
  }

  for (const flag of ['--help', '-h']) {
    it(`prints usage on stdout for ${flag}`, () => {
      const result = run([flag]);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('beta-aggregate');
      expect(result.stdout.startsWith('Usage:')).toBe(true);
    });
  }
});

describe('duplicate', () => {
  it('keeps the later export and warns once', () => {
    const dir = join(FIXTURES, 'duplicate');
    const result = run([dir]);

    expect(result.status).toBe(0);
    expect(lines(result.stdout), 'one data row after dedupe').toHaveLength(2);
    expect(rowOf(result.stdout, '44444444-4444-4444-8444-444444444444')[1]).toBe('14');

    const warnings = lines(result.stderr).filter((line) => line.includes('duplicate participant'));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('professor-beta-report-44444444-4444-4444-8444-444444444444-d7.json');
    expect(warnings[0]).toContain('professor-beta-report-44444444-4444-4444-8444-444444444444-d14.json');

    const document = jsonOf(run([dir, '--json']));
    expect(document.duplicates).toHaveLength(1);
    expect(document.duplicates[0].kept.endsWith('-d14.json')).toBe(true);
    expect(document.duplicates[0].dropped.endsWith('-d7.json')).toBe(true);
  });

  it('breaks a same-offset tie on the lexicographically greater filename', () => {
    const dir = join(FIXTURES, 'duplicate-tie');
    const table = run([dir]);

    expect(table.status).toBe(0);
    expect(lines(table.stdout), 'one data row after the tie').toHaveLength(2);
    expect(rowOf(table.stdout, ID.E)[8], 'w2Days from the b file').toBe('5');

    const warnings = lines(table.stderr).filter((line) => line.includes('duplicate participant'));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('-a-d9.json');
    expect(warnings[0]).toContain('-b-d9.json');

    const document = jsonOf(run([dir, '--json']));
    expect(document.participants).toHaveLength(1);
    expect(document.participants[0].week2MeaningfulDays).toBe(5);
    expect(document.participants[0].source.endsWith('-b-d9.json')).toBe(true);
    expect(document.duplicates).toHaveLength(1);
  });
});

describe('roster', () => {
  it('renders an unknown row for a roster id with no export (JSON roster)', () => {
    const dir = join(FIXTURES, 'missing-export');
    const result = run([dir, '--roster', join(dir, 'roster.json')]);

    expect(result.status).toBe(0);
    expect(lines(result.stdout), 'header plus two rows').toHaveLength(3);
    expect(rowOf(result.stdout, ID.F)).toEqual([ID.F, ...Array(11).fill('unknown')]);

    const document = jsonOf(run([dir, '--roster', join(dir, 'roster.json'), '--json']));
    expect(document.ok).toBe(true);
    expect(document.unknown).toEqual([ID.F]);
    expect(document.participants).toHaveLength(2);

    const missing = document.participants.find((entry) => entry.participantId === ID.F);
    expect(missing.source).toBeNull();
    expect(missing.generatedAtDayOffset).toBeNull();
    expect(missing.activated).toBeNull();
    expect(missing.activeDayCount).toBeNull();
    expect(missing.loopTotal).toBeNull();
    expect(missing.loopsByKind).toBeNull();
    expect(missing.revisions).toBeNull();
    expect(missing.week1Active).toBeNull();
    expect(missing.week2Return).toBeNull();
    expect(missing.week2MeaningfulDays).toBeNull();
    expect(missing.capstoneSubmissions).toBeNull();
    expect(missing.capstoneExternalEvidence).toBeNull();
    expect(missing.capstoneVerdict).toBeNull();

    expect(document.participants.some((entry) => entry.source === 'roster.json')).toBe(false);
    expect(document.invalid.some((entry) => entry.file === 'roster.json')).toBe(false);
  });

  it('accepts a newline-delimited and a comma-delimited roster with the same result', () => {
    const dir = join(FIXTURES, 'missing-export-list');
    const newline = run([dir, '--roster', join(dir, 'roster.txt')]);
    const comma = run([dir, '--roster', join(dir, 'roster-comma.txt')]);

    for (const result of [newline, comma]) {
      expect(result.status).toBe(0);
      expect(lines(result.stdout)).toHaveLength(3);
      expect(rowOf(result.stdout, ID.A)).toHaveLength(HEADER.length);
      expect(rowOf(result.stdout, ID.F)).toEqual([ID.F, ...Array(11).fill('unknown')]);
    }
    expect(newline.stdout).toBe(comma.stdout);
  });

  it('scans roster.json as a report when --roster is omitted', () => {
    const dir = join(FIXTURES, 'missing-export');
    const result = run([dir]);

    expect(result.status).toBe(1);
    expect(rowOf(result.stdout, ID.A)).toHaveLength(HEADER.length);
    const rosterLine = lines(result.stderr).find(
      (line) => line.includes('roster.json') && line.startsWith('invalid ')
    );
    expect(rosterLine, 'roster.json reported invalid').toBeDefined();
  });

  it('fails with one stderr line when the roster cannot be read', () => {
    const dir = join(FIXTURES, 'missing-export');
    const result = run([dir, '--roster', join(dir, 'no-such-roster.txt')]);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(lines(result.stderr)).toHaveLength(1);
    expect(result.stderr).toContain('no-such-roster.txt');
  });
});

describe('percentage', () => {
  it('emits no percent sign and no derived-metric key in table mode', () => {
    const result = run([join(FIXTURES, 'valid')]);

    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain('%');
    expect(result.stderr).not.toContain('%');
    for (const token of headerOf(result.stdout)) {
      expect(token).not.toMatch(METRIC_WORD);
    }
  });

  it('emits no percent sign and no derived-metric key in JSON mode', () => {
    const result = run([join(FIXTURES, 'valid'), '--json']);

    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain('%');
    expect(result.stderr).not.toContain('%');

    const document = jsonOf(result);
    for (const key of collectKeys(document)) {
      expect(key, `key ${key} must not name a derived metric`).not.toMatch(METRIC_WORD);
    }
    expect(METRIC_WORD.test('generatedAtDayOffset'), 'word boundaries protect day offsets').toBe(
      false
    );
  });
});

describe('docs', () => {
  const readmePath = join(DOCS, 'README.md');
  const readme = readFileSync(readmePath, 'utf8');
  const linkTargets = [...readme.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)]
    .map((match) => match[1])
    .filter((target) => !/^(https?:|mailto:|#)/.test(target))
    .map((target) => target.split('#')[0])
    .filter(Boolean);

  it('resolves every README link and leaves no orphan document', () => {
    expect(linkTargets.length).toBeGreaterThan(0);

    const linked = new Set();
    for (const target of linkTargets) {
      const absolute = resolve(dirname(readmePath), target);
      expect(existsSync(absolute), `dead README link: ${target}`).toBe(true);
      linked.add(absolute);
    }

    const scoped = walkFiles(DOCS).filter(
      (file) => file.endsWith('.md') && /[\\/](owner|participant)[\\/]/.test(file)
    );
    expect(scoped.length).toBeGreaterThan(0);
    for (const file of scoped) {
      expect(linked.has(resolve(file)), `orphan doc: ${relative(DOCS, file)}`).toBe(true);
    }
  });

  it('asks the three behavioural questions in all four Day sections', () => {
    const script = readFileSync(join(DOCS, 'owner', 'CHECK-IN-SCRIPT.md'), 'utf8');
    const matching = [...script.matchAll(/^## Day (0|3[–-]4|7|14)\b.*$/gm)];

    expect(matching.length, 'exactly four Day sections').toBe(4);

    const questions = [
      'ship or change in your own project',
      'the last time you got stuck',
      'better than claude + your notes + your editor',
    ];

    for (const [index, match] of matching.entries()) {
      const start = match.index + match[0].length;
      const end = index + 1 < matching.length ? matching[index + 1].index : script.length;
      const body = script.slice(start, end).replace(/\s+/g, ' ').toLowerCase();

      for (const question of questions) {
        expect(body, `Day ${match[1]} is missing "${question}"`).toContain(question);
      }

      const hasExport = body.includes('export');
      if (match[1] === '7' || match[1] === '14') {
        expect(hasExport, `Day ${match[1]} carries the export step`).toBe(true);
      } else {
        expect(hasExport, `Day ${match[1]} must have no export step`).toBe(false);
      }
    }
  });

  it('teaches the D-15 rule in troubleshooting prose', () => {
    const troubleshooting = readFileSync(
      join(DOCS, 'participant', 'TROUBLESHOOTING.md'),
      'utf8'
    ).toLowerCase();

    expect(troubleshooting).toContain('never widen the allowed browser origins');
    expect(troubleshooting).toContain("never disable the agent's permission prompts");
  });

  it('keeps THRESHOLDS draft with an empty sign-off block', () => {
    const thresholds = readFileSync(join(DOCS, 'owner', 'THRESHOLDS.md'), 'utf8');

    expect(thresholds).toMatch(/DRAFT\s*[—–-]\s*PENDING OWNER SIGN-OFF/);
    expect(thresholds).toMatch(/^## Sign-off$/m);
    for (const field of ['Name', 'Date', 'Commit']) {
      expect(thresholds, `the ${field} line stays empty`).toMatch(
        new RegExp(`^- ${field}:\\s*$`, 'm')
      );
    }
    expect(thresholds).not.toContain('%');
    for (const line of thresholds.split('\n')) {
      expect(/^(approved|signed off)/i.test(line), `unexpected signed line: ${line}`).toBe(false);
    }
  });

  it('links the thresholds from the decision memo without restating them', () => {
    const memo = readFileSync(join(DOCS, 'owner', 'DECISION-MEMO-TEMPLATE.md'), 'utf8');

    expect(memo).toContain('THRESHOLDS.md');
    expect(memo).not.toContain('%');
  });

  it('never mentions a forbidden security relaxation anywhere in the kit', () => {
    const forbidden = [
      'STUDIO_ORIGINS=*',
      '--dangerously-skip-permissions',
      'STUDIO_ALLOW_NON_LOOPBACK',
    ];
    const markdown = walkFiles(DOCS).filter((file) => file.endsWith('.md'));

    expect(markdown.length).toBeGreaterThan(0);
    for (const file of markdown) {
      const text = readFileSync(file, 'utf8');
      for (const literal of forbidden) {
        expect(text.includes(literal), `${relative(DOCS, file)} must not contain ${literal}`).toBe(
          false
        );
      }
    }
  });
});
