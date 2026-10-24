import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EVIDENCE_SCHEMA_VERSION,
  EVIDENCE_WARNING_CODES,
  MAX_EVIDENCE_INPUT_CHARS,
  MAX_EVIDENCE_SPECS,
  MAX_EVIDENCE_TESTS,
  MAX_EVIDENCE_EXCERPT_CHARS,
  MAX_EVIDENCE_PAYLOAD_CHARS,
  stripAnsi,
  detectEvidenceFormat,
  parseEvidence,
  evidenceWarnings,
  summarizeEvidenceFacts,
  chromiumEvidence,
} from '../src/lib/capstone-evidence.js';
import * as evidenceModule from '../src/lib/capstone-evidence.js';

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'playwright');
const readFixture = (name) => readFileSync(join(FIXTURE_DIR, name), 'utf8');

const codeSet = new Set(EVIDENCE_WARNING_CODES);

/** Assert every warning the parser emitted belongs to the closed set. */
function expectClosedWarningSet(evidence) {
  expect(Array.isArray(evidence.warnings)).toBe(true);
  for (const warning of evidence.warnings) {
    expect(codeSet.has(warning.code)).toBe(true);
    expect(typeof warning.detail).toBe('string');
    expect(warning.detail.length).toBeLessThanOrEqual(120);
  }
}

const greenTest = (project) => ({
  title: 'adds an item to the cart',
  project,
  status: 'expected',
  expectedStatus: 'passed',
  retryCount: 0,
  durationMs: 1,
});

describe('capstone evidence: caps and contract constants', () => {
  it('publishes the documented caps and the schema version', () => {
    expect(EVIDENCE_SCHEMA_VERSION).toBe(1);
    expect(MAX_EVIDENCE_INPUT_CHARS).toBe(200_000);
    expect(MAX_EVIDENCE_SPECS).toBe(50);
    expect(MAX_EVIDENCE_TESTS).toBe(400);
    expect(MAX_EVIDENCE_EXCERPT_CHARS).toBe(2_000);
    expect(MAX_EVIDENCE_PAYLOAD_CHARS).toBe(32_000);
  });

  it('publishes exactly the six researched warning codes', () => {
    expect([...EVIDENCE_WARNING_CODES].sort()).toEqual([
      'claimed_pass_with_failures',
      'count_mismatch',
      'no_tests',
      'truncated',
      'unknown_spec_files',
      'unrecognized_format',
    ]);
  });
});

describe('capstone evidence: format detection', () => {
  it('returns unknown for empty or whitespace-only input', () => {
    expect(detectEvidenceFormat('')).toBe('unknown');
    expect(detectEvidenceFormat('   \n  \t ')).toBe('unknown');
  });

  it('detects a pure JSON reporter paste', () => {
    expect(detectEvidenceFormat(readFixture('json-pass.json'))).toBe('json');
  });

  it('anchors on the embedded report in a mixed list,json paste', () => {
    expect(detectEvidenceFormat(readFixture('mixed-list-json.txt'))).toBe('json');
  });

  it('returns unknown for a paste that is neither JSON nor a list summary', () => {
    expect(detectEvidenceFormat('totally unrelated notes about my day')).toBe('unknown');
  });
});

describe('capstone evidence: JSON reporter path', () => {
  it('reads counts, version, project and Chromium evidence from a passing run', () => {
    const evidence = parseEvidence(readFixture('json-pass.json'));

    expect(evidence.format).toBe('json');
    expect(evidence.reporter).toBe('json');
    expect(evidence.schemaVersion).toBe(EVIDENCE_SCHEMA_VERSION);
    expect(evidence.source).toBe('external');
    expect(evidence.selfReported).toBe(true);
    expect(evidence.truncated).toBe(false);
    expect(evidence.stats).toMatchObject({
      total: 2,
      passed: 2,
      failed: 0,
      skipped: 0,
      flaky: 0,
      playwrightVersion: '1.64.1',
      projects: ['chromium'],
      chromium: 'confirmed',
    });
    expect(evidence.stats.durationMs).toBe(3100);
    expect(evidence.specs).toHaveLength(1);
    expect(evidence.specs[0].file).toBe('tests/checkout.spec.js');
    expect(evidence.specs[0].tests.map((test) => test.title)).toEqual([
      'adds an item to the cart',
      'shows the cart total',
    ]);
    expect(evidence.warnings).toEqual([]);
    expectClosedWarningSet(evidence);
    expect(evidence.excerpt.length).toBeLessThanOrEqual(MAX_EVIDENCE_EXCERPT_CHARS);
  });

  it('counts a failing run and never stores attachments, stdout or stderr', () => {
    const evidence = parseEvidence(readFixture('json-fail.json'));

    expect(evidence.stats).toMatchObject({
      total: 2,
      passed: 1,
      failed: 1,
      skipped: 0,
      flaky: 0,
      chromium: 'confirmed',
    });
    expectClosedWarningSet(evidence);

    const structured = JSON.stringify({ ...evidence, excerpt: '' });
    expect(structured).not.toContain('attachments');
    expect(structured).not.toContain('stdout');
    expect(structured).not.toContain('stderr');
    expect(structured).not.toContain('errorLocation');
    expect(structured).not.toContain('test-results/');
  });

  it('counts a flaky retry as flaky and records the retry count', () => {
    const evidence = parseEvidence(readFixture('json-flaky.json'));

    expect(evidence.stats).toMatchObject({ total: 1, passed: 0, failed: 0, flaky: 1 });
    expect(evidence.specs[0].tests[0]).toMatchObject({
      status: 'flaky',
      expectedStatus: 'passed',
      retryCount: 1,
      durationMs: 72,
    });
  });

  it('reads per-project outcomes from a multi-project run', () => {
    const evidence = parseEvidence(readFixture('json-multi-project.json'));

    expect(evidence.stats.projects).toEqual(['chromium', 'firefox']);
    expect(evidence.stats.chromium).toBe('confirmed');
    expect(evidence.stats).toMatchObject({ total: 2, passed: 1, failed: 1 });
    expect(evidence.specs[0].tests.map((test) => test.project)).toEqual(['chromium', 'firefox']);
  });

  it('cannot evidence Chromium from a broken config', () => {
    const evidence = parseEvidence(readFixture('json-config-error.json'));

    expect(evidence.stats.chromium).toBe('none');
    expect(evidence.stats).toMatchObject({ total: 2, passed: 0, failed: 2 });
  });

  it('never treats a test.fail() run as a pass', () => {
    const evidence = parseEvidence(readFixture('json-expected-failure.json'));

    expect(evidence.stats).toMatchObject({
      total: 1,
      passed: 0,
      failed: 0,
      chromium: 'none',
    });
    expect(evidence.specs[0].tests[0]).toMatchObject({
      status: 'expected',
      expectedStatus: 'failed',
    });
  });

  it('reports no_tests for a zero-test run', () => {
    const evidence = parseEvidence(readFixture('json-zero-tests.json'));

    expect(evidence.stats.total).toBe(0);
    expect(evidence.specs).toEqual([]);
    expect(evidence.warnings.map((warning) => warning.code)).toContain('no_tests');
    expectClosedWarningSet(evidence);
  });
});

describe('capstone evidence: chromium evidence tri-state', () => {
  it('confirms a named chromium project', () => {
    expect(chromiumEvidence([{ file: 'a.spec.js', tests: [greenTest('chromium')] }], { projects: [{ name: 'chromium' }] })).toBe(
      'confirmed'
    );
  });

  it('assumes Chromium for an all-green unnamed default project', () => {
    const specs = [{ file: 'a.spec.js', tests: [greenTest('')] }];
    expect(chromiumEvidence(specs, { projects: [] })).toBe('assumed');
    expect(chromiumEvidence(specs, { projects: [{ name: '' }] })).toBe('assumed');
  });

  it('refuses to assume Chromium when two projects are configured', () => {
    const specs = [{ file: 'a.spec.js', tests: [greenTest('')] }];
    expect(chromiumEvidence(specs, { projects: [{ name: 'desktop' }, { name: 'mobile' }] })).toBe('none');
  });

  it('returns none when no test is green', () => {
    const specs = [
      { file: 'a.spec.js', tests: [{ ...greenTest('chromium'), status: 'unexpected' }] },
    ];
    expect(chromiumEvidence(specs, { projects: [{ name: 'chromium' }] })).toBe('none');
  });
});

describe('capstone evidence: mixed and broken pastes', () => {
  it('extracts the embedded JSON from a mixed list,json paste exactly once', () => {
    const evidence = parseEvidence(readFixture('mixed-list-json.txt'));

    expect(evidence.format).toBe('json');
    expect(evidence.stats.total).toBe(3);
    expect(evidence.specs).toHaveLength(1);
    expect(evidence.specs[0].tests).toHaveLength(3);
  });

  it('returns unknown format for a truncated JSON paste without throwing', () => {
    const evidence = parseEvidence(readFixture('truncated.json'));

    expect(evidence.format).toBe('unknown');
    expect(evidence.stats.total).toBe(0);
    expect(evidence.warnings.map((warning) => warning.code)).toContain('unrecognized_format');
    expectClosedWarningSet(evidence);
  });

  it('returns unknown format for empty input without throwing', () => {
    const evidence = parseEvidence('');

    expect(evidence.format).toBe('unknown');
    expect(evidence.stats).toMatchObject({ total: 0, passed: 0, failed: 0 });
    expect(evidence.warnings.map((warning) => warning.code)).toContain('unrecognized_format');
  });

  it('strips ANSI escapes and normalizes CRLF', () => {
    expect(stripAnsi('\u001b[32m✓\u001b[39m ok\u001b[2K\r\nnext')).toBe('✓ ok\nnext');
  });

  it('never throws for garbage input', () => {
    expect(() => parseEvidence('<<<not a report>>>')).not.toThrow();
    expect(() => parseEvidence(null)).not.toThrow();
    expect(() => parseEvidence(undefined)).not.toThrow();
    expect(parseEvidence(null).format).toBe('unknown');
  });
});

describe('capstone evidence: list and line reporter paths', () => {
  it('parses a colourised list paste identically to the plain one', () => {
    const plain = parseEvidence(readFixture('list-pass.txt'));
    const colour = parseEvidence(readFixture('list-color.txt'));

    expect(colour.format).toBe('list');
    expect(colour.reporter).toBe('list');
    expect(colour.stats).toEqual(plain.stats);
    expect(colour.specs).toEqual(plain.specs);
    expect(colour.warnings).toEqual(plain.warnings);

    expect(plain.stats).toMatchObject({
      total: 2,
      passed: 2,
      failed: 0,
      skipped: 0,
      flaky: 0,
      playwrightVersion: null,
      projects: ['chromium'],
      chromium: 'confirmed',
    });
    expect(plain.stats.durationMs).toBe(3100);
  });

  it('reads a failing list paste with a retry, a skipped row and a failure body', () => {
    const evidence = parseEvidence(readFixture('list-fail.txt'));

    expect(evidence.format).toBe('list');
    expect(evidence.stats).toMatchObject({
      total: 4,
      passed: 1,
      failed: 1,
      skipped: 1,
      flaky: 1,
      durationMs: 3100,
    });
    expect(evidence.warnings).toEqual([]);

    const tests = evidence.specs[0].tests;
    expect(tests.map((test) => test.title)).toEqual([
      'adds an item to the cart',
      'shows the cart total',
      'saves the address for later',
      'applies a discount code',
    ]);
    expect(tests.find((test) => test.title === 'shows the cart total')).toMatchObject({
      status: 'flaky',
      retryCount: 1,
      durationMs: 72,
    });
    expect(tests.find((test) => test.title === 'saves the address for later')).toMatchObject({
      status: 'skipped',
      durationMs: null,
    });
  });

  it('reads the older 1.4x list layout without a project bracket', () => {
    const evidence = parseEvidence(readFixture('list-1.4x.txt'));

    expect(evidence.reporter).toBe('list');
    expect(evidence.stats).toMatchObject({
      total: 2,
      passed: 2,
      failed: 0,
      chromium: 'assumed',
      projects: [],
    });
    expect(evidence.specs[0].tests.every((test) => test.project === '')).toBe(true);
    expect(evidence.specs[0].tests[0].title).toBe('checkout › guest › adds an item to the cart');
  });

  it('derives counts from the summary block for the line reporter', () => {
    const evidence = parseEvidence(readFixture('line-fail.txt'));

    expect(evidence.format).toBe('list');
    expect(evidence.reporter).toBe('line');
    expect(evidence.stats).toMatchObject({
      total: 4,
      passed: 1,
      failed: 1,
      skipped: 1,
      flaky: 1,
      durationMs: 10500,
      chromium: 'none',
    });
    expect(evidence.warnings).toEqual([]);
  });

  it('flags a summary that disagrees with the per-test rows and keeps the summary counts', () => {
    const evidence = parseEvidence(
      [
        'Running 2 tests using 2 workers',
        '',
        '  ✓  1 [chromium] › tests/checkout.spec.js:3:1 › adds an item to the cart (438ms)',
        '  ✘  2 [chromium] › tests/checkout.spec.js:8:1 › shows the cart total (1.1s)',
        '',
        '  2 passed (3.1s)',
        '',
      ].join('\n')
    );

    expect(evidence.stats).toMatchObject({ total: 2, passed: 2, failed: 0 });
    expect(evidence.warnings.map((warning) => warning.code)).toContain('count_mismatch');
    expectClosedWarningSet(evidence);
  });

  it('never throws on a list paste with only a summary', () => {
    const evidence = parseEvidence('  1 passed (2.4s)');

    expect(evidence.format).toBe('list');
    expect(evidence.stats).toMatchObject({ total: 1, passed: 1, durationMs: 2400 });
  });
});

describe('capstone evidence: warnings computed from the submission', () => {
  it('flags spec files the learner did not submit', () => {
    const evidence = parseEvidence(readFixture('list-pass.txt'));

    const unknown = evidenceWarnings(evidence, { files: { 'tests/other.spec.js': '' } });
    expect(unknown.map((warning) => warning.code)).toContain('unknown_spec_files');

    const known = evidenceWarnings(evidence, { files: { 'tests/checkout.spec.js': '' } });
    expect(known.map((warning) => warning.code)).not.toContain('unknown_spec_files');

    const caseInsensitive = evidenceWarnings(evidence, { files: { 'Tests/Checkout.Spec.js': '' } });
    expect(caseInsensitive.map((warning) => warning.code)).not.toContain('unknown_spec_files');
  });

  it('never mutates the evidence it inspects', () => {
    const evidence = parseEvidence(readFixture('list-pass.txt'));
    const before = JSON.stringify(evidence);

    evidenceWarnings(evidence, { files: { 'tests/other.spec.js': '' }, contentMd: 'all tests pass' });
    expect(JSON.stringify(evidence)).toBe(before);
  });

  it('flags a write-up that claims success over a failing run', () => {
    const failing = parseEvidence(readFixture('list-fail.txt'));

    for (const contentMd of [
      'All the tests pass now.',
      'all tests are green',
      '100% pass, I promise',
      'tất cả các bài kiểm tra đều đạt',
    ]) {
      const warnings = evidenceWarnings(failing, { contentMd });
      expect(warnings.map((warning) => warning.code)).toContain('claimed_pass_with_failures');
    }

    const honest = evidenceWarnings(parseEvidence(readFixture('list-pass.txt')), {
      contentMd: 'All the tests pass now.',
    });
    expect(honest.map((warning) => warning.code)).not.toContain('claimed_pass_with_failures');
  });

  it('deduplicates warnings by code and keeps the closed set', () => {
    const failing = parseEvidence(readFixture('list-fail.txt'));
    const warnings = evidenceWarnings(failing, {
      files: { 'tests/other.spec.js': '' },
      contentMd: 'all tests pass',
    });

    expect(new Set(warnings.map((warning) => warning.code)).size).toBe(warnings.length);
    for (const warning of warnings) {
      expect(codeSet.has(warning.code)).toBe(true);
      expect(warning.detail.length).toBeLessThanOrEqual(120);
    }
  });

  it('emits no warning code outside the closed set for any fixture', () => {
    for (const name of [
      'json-pass.json',
      'json-fail.json',
      'json-flaky.json',
      'json-multi-project.json',
      'json-zero-tests.json',
      'json-config-error.json',
      'json-expected-failure.json',
      'list-pass.txt',
      'list-fail.txt',
      'list-color.txt',
      'list-1.4x.txt',
      'line-fail.txt',
      'mixed-list-json.txt',
      'truncated.json',
    ]) {
      expectClosedWarningSet(parseEvidence(readFixture(name)));
    }
  });
});

describe('capstone evidence: fact summary and purity', () => {
  it('summarizes the stored facts without the raw paste', () => {
    const facts = summarizeEvidenceFacts(parseEvidence(readFixture('list-fail.txt')));

    expect(facts).toEqual({
      total: 4,
      passed: 1,
      failed: 1,
      skipped: 1,
      flaky: 1,
      durationMs: 3100,
      playwrightVersion: null,
      projects: ['chromium'],
      chromium: 'confirmed',
      format: 'list',
      warningCount: 0,
      selfReported: true,
      label: 'self-reported evidence',
    });
    expect(facts).not.toHaveProperty('excerpt');
    expect(facts).not.toHaveProperty('specs');
    expect(facts).not.toHaveProperty('warnings');
  });

  it('is a pure function: two interleaved parses return identical results', () => {
    const jsonFirst = parseEvidence(readFixture('json-fail.json'));
    const listFirst = parseEvidence(readFixture('list-fail.txt'));
    const listSecond = parseEvidence(readFixture('list-fail.txt'));
    const jsonSecond = parseEvidence(readFixture('json-fail.json'));

    expect(jsonSecond).toEqual(jsonFirst);
    expect(listSecond).toEqual(listFirst);
  });

  it('exports exactly the documented public surface', () => {
    const expected = [
      'EVIDENCE_SCHEMA_VERSION',
      'EVIDENCE_WARNING_CODES',
      'MAX_EVIDENCE_EXCERPT_CHARS',
      'MAX_EVIDENCE_INPUT_CHARS',
      'MAX_EVIDENCE_PAYLOAD_CHARS',
      'MAX_EVIDENCE_SPECS',
      'MAX_EVIDENCE_TESTS',
      'chromiumEvidence',
      'detectEvidenceFormat',
      'evidenceWarnings',
      'parseEvidence',
      'stripAnsi',
      'summarizeEvidenceFacts',
    ].sort();

    expect(Object.keys(evidenceModule).sort()).toEqual(expected);
  });

  it('is statically incapable of spawning, fetching or evaluating code', () => {
    const modulePath = join(FIXTURE_DIR, '..', '..', '..', 'src', 'lib', 'capstone-evidence.js');
    const source = readFileSync(modulePath, 'utf8');

    expect(source).not.toMatch(/child_process/);
    expect(source).not.toMatch(/\bexec\s*\(/);
    expect(source).not.toMatch(/\bspawn\s*\(/);
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/XMLHttpRequest/);
    expect(source).not.toMatch(/\beval\s*\(/);
    expect(source).not.toMatch(/new\s+Function\s*\(/);
    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toMatch(/@playwright\/test/);
  });
});

describe('capstone evidence: size and privacy guards', () => {
  /** A hostile report: 400 tests with 120-character titles (T-09-05). */
  function hostileReport() {
    const tests = Array.from({ length: 400 }, () => ({
      projectName: 'chromium',
      status: 'expected',
      expectedStatus: 'passed',
      results: [{ status: 'passed', duration: 12, retry: 0 }],
    }));
    return JSON.stringify({
      config: { version: '1.64.1', projects: [{ name: 'chromium' }] },
      suites: [
        {
          title: 'hostile.spec.js',
          file: 'tests/hostile.spec.js',
          specs: [{ title: 'x'.repeat(120), tests }],
        },
      ],
      errors: [],
      stats: { duration: 5000.5, expected: 400, skipped: 0, unexpected: 0, flaky: 0 },
    });
  }

  it('clamps a hostile 400-test report without losing the counts', () => {
    const input = hostileReport();
    expect(input.length).toBeLessThan(MAX_EVIDENCE_INPUT_CHARS);

    const payload = parseEvidence(input);

    expect(payload.stats.total).toBe(400);
    expect(payload.stats.passed).toBe(400);
    expect(payload.truncated).toBe(true);
    expect(payload.warnings.filter((warning) => warning.code === 'truncated')).toHaveLength(1);
    expect(JSON.stringify(payload).length).toBeLessThanOrEqual(MAX_EVIDENCE_PAYLOAD_CHARS);
    expect(payload.excerpt.length).toBeLessThanOrEqual(MAX_EVIDENCE_EXCERPT_CHARS);
    expectClosedWarningSet(payload);
  });

  it('keeps every stored payload under the serialized cap', () => {
    for (const name of ['json-fail.json', 'json-multi-project.json', 'list-fail.txt', 'mixed-list-json.txt']) {
      const payload = parseEvidence(readFixture(name));
      expect(JSON.stringify(payload).length).toBeLessThanOrEqual(MAX_EVIDENCE_PAYLOAD_CHARS);
    }
  });

  it('clips an oversized paste and says so', () => {
    const payload = parseEvidence('x'.repeat(MAX_EVIDENCE_INPUT_CHARS + 500));

    expect(payload.format).toBe('unknown');
    expect(payload.truncated).toBe(true);
    expect(payload.warnings.map((warning) => warning.code)).toContain('truncated');
    expect(payload.excerpt.length).toBe(MAX_EVIDENCE_EXCERPT_CHARS);
  });

  it('never stores attachments, stdout or stderr from a text or JSON paste', () => {
    for (const name of ['json-fail.json', 'json-multi-project.json', 'list-fail.txt']) {
      const payload = parseEvidence(readFixture(name));
      const structured = JSON.stringify({ ...payload, excerpt: '' });
      expect(structured).not.toContain('attachments');
      expect(structured).not.toContain('stdout');
      expect(structured).not.toContain('stderr');
    }
  });
});
