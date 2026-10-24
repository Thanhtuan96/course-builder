/**
 * @vitest-environment node
 *
 * PW-03 — render smoke for the "Verify externally" surface (plan 09-04).
 *
 * `renderToString` keeps this file DOM-free: the form is server-rendered and the paste/confirm
 * decisions are covered through the exported pure helpers (`evaluateEvidenceInput`,
 * `uploadRejection`), because `renderToString` cannot fire change events and `FileReader` needs a
 * browser. The browser-only upload read is the Manual-Only row in `09-VALIDATION.md`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import {
  EVIDENCE_COMMANDS,
  ExternalEvidenceForm,
  MAX_UPLOAD_BYTES,
  evaluateEvidenceInput,
  uploadRejection,
} from '../src/components/capstone/ExternalEvidenceForm.jsx';
import { EvidenceSummary } from '../src/components/capstone/EvidenceSummary.jsx';
import { parseEvidence } from '../src/lib/capstone-evidence.js';
import { translate } from '../src/lib/i18n/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(join(HERE, 'fixtures', 'playwright', name), 'utf8');

const LIST_FAIL = fixture('list-fail.txt');
const JSON_FAIL = fixture('json-fail.json');
const LIST_ASSUMED = fixture('list-1.4x.txt');
const JSON_CONFIG_ERROR = fixture('json-config-error.json');

/** How many times `needle` occurs in `haystack` (label-duplication assertions). */
const countOf = (haystack, needle) => haystack.split(needle).length - 1;

/** A long payload smuggled into a test title; every character must stay inert (T-09-24). */
const HOSTILE_TITLE = '<img src=x onerror=alert(1)>';
const HOSTILE_PASTE = [
  'Running 1 test using 1 worker',
  '',
  `  ✓  1 [chromium] › tests/hostile.spec.js:1:1 › ${HOSTILE_TITLE} (12ms)`,
  '',
  '',
  '  1 passed (12ms)',
  '',
].join('\n');

const CAPSTONE_COMPONENTS = ['ExternalEvidenceForm.jsx', 'EvidenceSummary.jsx'].map((name) => ({
  name,
  source: readFileSync(join(HERE, '..', 'src', 'components', 'capstone', name), 'utf8'),
}));

/** Tokens a suggested command must never teach the learner (research §C, T-09-19). */
const FORBIDDEN_COMMAND_TOKENS = ['--reporter=html', 'blob', '--trace', 'screenshot', 'list,json'];

const renderForm = (props = {}) => renderToString(createElement(ExternalEvidenceForm, props));

describe('EVIDENCE_COMMANDS', () => {
  it('offers exactly three commands, all pinned to Chromium', () => {
    expect(EVIDENCE_COMMANDS).toHaveLength(3);
    for (const entry of EVIDENCE_COMMANDS) {
      expect(typeof entry.id).toBe('string');
      expect(typeof entry.label).toBe('string');
      expect(entry.command).toContain('--project=chromium');
    }
    expect(EVIDENCE_COMMANDS.map((entry) => entry.id)).toEqual(['json_file', 'json_stdout', 'list']);
  });

  it('never teaches a reporter or artifact that can leak the learner app', () => {
    const offenders = [];
    for (const entry of EVIDENCE_COMMANDS) {
      for (const token of FORBIDDEN_COMMAND_TOKENS) {
        if (entry.command.includes(token)) offenders.push([entry.id, token]);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('is frozen so a render cannot mutate the suggested commands', () => {
    expect(Object.isFrozen(EVIDENCE_COMMANDS)).toBe(true);
    expect(EVIDENCE_COMMANDS.every((entry) => Object.isFrozen(entry))).toBe(true);
  });
});

describe('ExternalEvidenceForm render smoke', () => {
  it('shows the copyable commands before the paste field', () => {
    const html = renderForm();
    for (const entry of EVIDENCE_COMMANDS) expect(html).toContain(entry.command);
    expect(html).toContain(translate('en', 'externalEvidence.commandTitle'));
    expect(html).toContain(translate('en', 'externalEvidence.pasteLabel'));
    expect(html).toContain(translate('en', 'externalEvidence.uploadLabel'));
    expect(html).toContain(translate('en', 'externalEvidence.confirmLabel'));
    expect(html.indexOf(EVIDENCE_COMMANDS[0].command)).toBeLessThan(
      html.indexOf(translate('en', 'externalEvidence.pasteLabel'))
    );
  });

  it('shows no facts grid before anything is pasted', () => {
    const html = renderForm();
    expect(html).not.toContain(translate('en', 'externalEvidence.factsTitle'));
    expect(html).not.toContain(translate('en', 'externalEvidence.specsTitle'));
    expect(html).toContain(translate('en', 'externalEvidence.title'));
  });

  it('disables the confirmation checkbox until a report parses', () => {
    expect(renderForm()).toMatch(/<input type="checkbox"[^>]*disabled/);
    expect(
      renderForm({ result: { text: LIST_FAIL, evidence: null, confirmed: false } })
    ).not.toMatch(/<input type="checkbox"[^>]*disabled/);
  });

  it('parses a pasted list report into facts with the self-reported label', () => {
    const html = renderForm({ result: { text: LIST_FAIL, evidence: null, confirmed: false } });
    expect(html).toContain('self-reported evidence');
    const failedLabel = translate('en', 'externalEvidence.failed');
    expect(html).toMatch(new RegExp(`<dt[^>]*>${failedLabel}</dt><dd[^>]*>1</dd>`));
    expect(html).toContain(translate('en', 'externalEvidence.factsTitle'));
  });

  it('shows the unrecognized notice for text that is not reporter output', () => {
    const html = renderForm({
      result: { text: 'hello, this is just a sentence', evidence: null, confirmed: false },
    });
    expect(html).toContain(translate('en', 'externalEvidence.unrecognized'));
  });

  it('reflects the confirmed flag from the parent', () => {
    const html = renderForm({
      result: { text: LIST_FAIL, evidence: null, confirmed: true },
    });
    expect(html).toMatch(/<input type="checkbox"[^>]*checked/);
    expect(html).not.toContain(translate('en', 'externalEvidence.confirmRequired'));
  });
});

describe('evaluateEvidenceInput', () => {
  it('returns null evidence and summary for empty or whitespace text', () => {
    expect(evaluateEvidenceInput({ text: '' })).toEqual({ evidence: null, summary: null });
    expect(evaluateEvidenceInput({ text: '  \n\t ' })).toEqual({ evidence: null, summary: null });
    expect(evaluateEvidenceInput()).toEqual({ evidence: null, summary: null });
  });

  it('parses a pasted list report into the normalized payload', () => {
    const { evidence, summary } = evaluateEvidenceInput({ text: LIST_FAIL });
    expect(evidence.format).toBe('list');
    expect(evidence.stats.failed).toBe(1);
    expect(evidence.stats.passed).toBe(1);
    expect(evidence.stats.flaky).toBe(1);
    expect(evidence.stats.skipped).toBe(1);
    expect(evidence.specs[0].file).toBe('tests/checkout.spec.js');
    expect(summary.selfReported).toBe(true);
    expect(summary.label).toBe('self-reported evidence');
    expect(summary.failed).toBe(1);
  });

  it('parses a JSON report paste the same way as an upload would', () => {
    const { evidence } = evaluateEvidenceInput({ text: JSON_FAIL });
    expect(evidence.format).toBe('json');
    expect(evidence.stats.failed).toBeGreaterThan(0);
    expect(evidence.stats.playwrightVersion).toBeTruthy();
  });

  it('feeds submittedFiles into evidenceWarnings (unknown_spec_files)', () => {
    const { evidence } = evaluateEvidenceInput({
      text: LIST_FAIL,
      submittedFiles: { 'tests/other.spec.js': '' },
    });
    const codes = evidence.warnings.map((warning) => warning.code);
    expect(codes).toContain('unknown_spec_files');

    const matched = evaluateEvidenceInput({
      text: LIST_FAIL,
      submittedFiles: { 'tests/checkout.spec.js': '' },
    });
    expect(matched.evidence.warnings.map((warning) => warning.code)).not.toContain(
      'unknown_spec_files'
    );
  });

  it('feeds the write-up into evidenceWarnings (claimed_pass_with_failures)', () => {
    const { evidence } = evaluateEvidenceInput({
      text: LIST_FAIL,
      writeup: 'All tests pass now.',
    });
    expect(evidence.warnings.map((warning) => warning.code)).toContain(
      'claimed_pass_with_failures'
    );
  });

  it('is pure: the same paste yields the same payload and never mutates its input object', () => {
    const input = { text: LIST_FAIL, submittedFiles: { 'tests/checkout.spec.js': '' } };
    const first = evaluateEvidenceInput(input);
    const second = evaluateEvidenceInput(input);
    expect(second).toEqual(first);
    expect(Object.keys(input)).toEqual(['text', 'submittedFiles']);
  });
});

describe('uploadRejection', () => {
  it('rejects files over 1 MB and accepts the exact boundary', () => {
    expect(MAX_UPLOAD_BYTES).toBe(1_000_000);
    expect(uploadRejection({ size: 2_000_000 })).toBe('uploadTooLarge');
    expect(uploadRejection({ size: 999_999 })).toBeNull();
    expect(uploadRejection({ size: 1_000_000 })).toBeNull();
    expect(uploadRejection({ size: 1_000_001 })).toBe('uploadTooLarge');
  });

  it('accepts an unknown or missing size', () => {
    expect(uploadRejection({})).toBeNull();
    expect(uploadRejection()).toBeNull();
  });
});

describe('EvidenceSummary: literal label, warnings and Chromium states', () => {
  it('renders the literal self-reported label next to the facts', () => {
    const evidence = parseEvidence(LIST_FAIL);
    const html = renderToString(createElement(EvidenceSummary, { evidence }));
    // The literal English label, not a paraphrase (D-05, T-09-18).
    expect(html).toContain('self-reported evidence');
    expect(html).toContain(translate('en', 'externalEvidence.factsTitle'));
    // `1 failed` in the report shows up as the failed stat and the no-mismatch line is absent
    // once a warning exists; here the report is internally consistent, so the empty line shows.
    expect(html).toMatch(/<dt[^>]*>Failed<\/dt><dd[^>]*>1<\/dd>/);
    expect(html).toContain(translate('en', 'externalEvidence.warningNone'));
  });

  it('renders each warning code with its own localised line exactly once', () => {
    const parsed = parseEvidence(JSON_FAIL);
    const evidence = {
      ...parsed,
      warnings: [
        { code: 'no_tests', detail: 'detail A' },
        { code: 'claimed_pass_with_failures', detail: 'detail B' },
      ],
    };
    const html = renderToString(createElement(EvidenceSummary, { evidence }));

    const noTests = translate('en', 'externalEvidence.warning.no_tests');
    const claimed = translate('en', 'externalEvidence.warning.claimed_pass_with_failures');
    expect(countOf(html, noTests)).toBe(1);
    expect(countOf(html, claimed)).toBe(1);
    expect(html).not.toContain(translate('en', 'externalEvidence.warningNone'));
  });

  it('maps all six codes to six distinct labels', () => {
    const codes = [
      'no_tests',
      'count_mismatch',
      'unknown_spec_files',
      'claimed_pass_with_failures',
      'unrecognized_format',
      'truncated',
    ];
    const evidence = {
      ...parseEvidence(LIST_FAIL),
      warnings: codes.map((code) => ({ code, detail: `detail ${code}` })),
    };
    const html = renderToString(createElement(EvidenceSummary, { evidence }));
    for (const code of codes) {
      const label = translate('en', `externalEvidence.warning.${code}`);
      expect(label, `missing catalog value for ${code}`).not.toBe(
        `externalEvidence.warning.${code}`
      );
      expect(countOf(html, label), `duplicated label for ${code}`).toBe(1);
    }
  });

  it('shows Chromium as assumed for a single unnamed project and as absent otherwise', () => {
    const assumed = renderToString(
      createElement(EvidenceSummary, { evidence: parseEvidence(LIST_ASSUMED) })
    );
    expect(assumed).toContain(translate('en', 'externalEvidence.chromiumAssumed'));

    const none = renderToString(
      createElement(EvidenceSummary, { evidence: parseEvidence(JSON_CONFIG_ERROR) })
    );
    expect(none).toContain(translate('en', 'externalEvidence.chromiumNone'));
    expect(none).not.toContain(translate('en', 'externalEvidence.chromiumAssumed'));
  });

  it('renders nothing at all for null evidence', () => {
    expect(renderToString(createElement(EvidenceSummary, { evidence: null }))).toBe('');
  });
});

describe('hostile pasted evidence stays inert (T-09-24, Gate B)', () => {
  const hostileEvidence = parseEvidence(HOSTILE_PASTE);

  it('parses the payload as a test title instead of dropping it', () => {
    expect(hostileEvidence.specs[0].tests[0].title).toBe(HOSTILE_TITLE);
  });

  it('escapes the payload in the summary and never emits a raw tag', () => {
    const html = renderToString(createElement(EvidenceSummary, { evidence: hostileEvidence }));
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img');
    expect(html).not.toContain(HOSTILE_TITLE);
    // React escapes the tag terminator too, so no attribute can ever be parsed out of the paste.
    expect(html).not.toContain('onerror=alert(1)>');
  });

  it('escapes the payload in the form (textarea and summary)', () => {
    const html = renderForm({
      result: { text: HOSTILE_PASTE, evidence: null, confirmed: false },
    });
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img');
    expect(html).not.toContain(HOSTILE_TITLE);
    expect(html).not.toContain('onerror=alert(1)>');
  });
});

describe('evidence components never build HTML or execute code (T-09-24, PW-05)', () => {
  const FORBIDDEN_TOKENS = ['dangerouslySetInnerHTML', 'innerHTML', 'eval(', 'new Function'];
  const FORBIDDEN_IMPORTS = [
    '@playwright/test',
    'child_process',
    'components/ui/Markdown',
    'web/studio-runner',
    'fetch(',
  ];

  it.each(CAPSTONE_COMPONENTS)('$name contains no HTML sink or code evaluation', ({ source }) => {
    const found = FORBIDDEN_TOKENS.filter((token) => source.includes(token));
    expect(found).toEqual([]);
  });

  it.each(CAPSTONE_COMPONENTS)('$name imports no runner, provider or Playwright module', ({
    source,
  }) => {
    const found = FORBIDDEN_IMPORTS.filter((token) => source.includes(token));
    expect(found).toEqual([]);
  });
});
