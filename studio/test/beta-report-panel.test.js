/**
 * @vitest-environment node
 *
 * Phase 7 INSTR-05 — beta report export.
 *
 * Runs in the plain Studio Node harness: no jsdom, no testing-library. Render assertions use
 * `react-dom/server`, interactive behaviour is covered through the exported pure helpers, and the
 * download path is observed by stubbing the small DOM surface `download()` touches (every stubbed
 * global is restored after each test).
 *
 * This file must stay green under BOTH runners: `npm --prefix studio test` (studio/vite.config.js,
 * which defines __APP_VERSION__) and the root aggregate `npm test` (which does not). Anything that
 * touches the version therefore reads `config.define` rather than the injected global.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import config, { APP_VERSION_DEFINE } from '../vite.config.js';
import { catalogKeys, translate } from '../src/lib/i18n/index.js';
import { EVENT_KINDS } from '../src/lib/repo/events.js';
import { createMemoryAdapter } from '../src/lib/repo/memory-adapter.js';
import * as repo from '../src/lib/repo/index.js';
import { buildBetaReport, reportSchema } from '../src/lib/beta/report.js';
import {
  appVersion,
  assembleCapstoneSummary,
  buildBetaReportPayload,
  buildReportExport,
  createDownloadHandler,
  providerCategory,
  BetaReportPanel,
  BetaReportPreview,
} from '../src/components/data/BetaReportPanel.jsx';
import { DataPanel } from '../src/components/data/DataPanel.jsx';

const ROOT_PACKAGE = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const STUDIO_PACKAGE = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const PANEL_SOURCE = readFileSync(
  new URL('../src/components/data/BetaReportPanel.jsx', import.meta.url),
  'utf8'
);
const STORAGE_KINDS = ['indexeddb', 'sqlite', 'memory', 'remote'];
const PROVIDER_CATEGORY_RE =
  /^(bridge|byok):(anthropic|openai|openrouter|groq|lmstudio|ollama|custom|claude|opencode|cursor|gemini|antigravity)$/;

/** Pinned local noon — never the machine clock, never a UTC instant. */
const DAY0 = new Date(2026, 0, 10, 12, 0, 0);
const SETTINGS = { provider: 'anthropic' };

/** Undo React's text-node escaping so byte comparisons see the real JSON (`&amp;` must be last). */
function unescapeHtml(html) {
  return String(html)
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** Every flattened key the new betaReport namespace contributes to a language catalog. */
function betaReportKeys(language) {
  return catalogKeys(language)
    .filter((key) => key.startsWith('betaReport.'))
    .sort();
}

/** @param {Date} base @param {number} days */
function daysAfter(base, days) {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + days, 12, 0, 0);
}

// ── download capture ────────────────────────────────────────────────────────────────────────────
// `download()` builds a Blob, creates an object URL and clicks an anchor. Overriding those four
// globals captures the exact bytes. The originals are saved and restored after every test: deleting
// a real Node global would leak into other files.
let savedGlobals;
let stubsInstalled = false;
let captured;
let clicked;

function installDownloadStubs() {
  savedGlobals = {
    Blob: globalThis.Blob,
    hadDocument: 'document' in globalThis,
    document: globalThis.document,
    createObjectURL: URL.createObjectURL,
    revokeObjectURL: URL.revokeObjectURL,
  };
  captured = null;
  clicked = [];
  globalThis.Blob = class {
    constructor(parts, opts) {
      captured = { text: parts.join(''), opts };
    }
  };
  URL.createObjectURL = () => 'blob:mock';
  URL.revokeObjectURL = () => {};
  globalThis.document = {
    body: { appendChild() {} },
    createElement: () => ({
      href: '',
      download: '',
      click() {
        clicked.push(this.download);
      },
      remove() {},
    }),
  };
  stubsInstalled = true;
}

function restoreDownloadStubs() {
  if (!stubsInstalled) return;
  globalThis.Blob = savedGlobals.Blob;
  if (savedGlobals.hadDocument) globalThis.document = savedGlobals.document;
  else delete globalThis.document;
  URL.createObjectURL = savedGlobals.createObjectURL;
  URL.revokeObjectURL = savedGlobals.revokeObjectURL;
  stubsInstalled = false;
}

beforeEach(() => {
  repo.useAdapter(createMemoryAdapter());
});

afterEach(() => {
  restoreDownloadStubs();
});

describe('beta report: app version provenance', () => {
  it('injects the ROOT package.json version through __APP_VERSION__', () => {
    expect(JSON.parse(APP_VERSION_DEFINE.__APP_VERSION__)).toBe(ROOT_PACKAGE.version);
    expect(ROOT_PACKAGE.version).toBe('1.6.0-beta.1');
  });

  it('wires the define into the exported Vite config', () => {
    expect(config.define).toBeTruthy();
    expect(config.define.__APP_VERSION__).toBe(APP_VERSION_DEFINE.__APP_VERSION__);
  });

  it('never sources the version from studio/package.json (the stale 0.1.0 field)', () => {
    expect(JSON.parse(config.define.__APP_VERSION__)).not.toBe(STUDIO_PACKAGE.version);
    expect(STUDIO_PACKAGE.version).toBe('0.1.0');
  });

  it('keeps the serve-only dev CSP plugin untouched', () => {
    const plugin = config.plugins.find((entry) => entry && entry.name === 'studio-dev-csp');
    expect(plugin).toBeTruthy();
    expect(plugin.apply).toBe('serve');
  });
});

describe('beta report: i18n namespace parity', () => {
  it('ships the same non-empty betaReport key set in en and vi', () => {
    const en = betaReportKeys('en');
    const vi = betaReportKeys('vi');
    expect(en.length).toBeGreaterThan(0);
    expect(vi).toEqual(en);
  });

  it('covers every event kind (keys the UI resolves through a template literal)', () => {
    const en = betaReportKeys('en');
    const vi = betaReportKeys('vi');
    for (const kind of EVENT_KINDS) {
      expect(en).toContain(`betaReport.kinds.${kind}`);
      expect(vi).toContain(`betaReport.kinds.${kind}`);
    }
  });

  it('covers every storage kind, including the local-server remote value', () => {
    const en = betaReportKeys('en');
    const vi = betaReportKeys('vi');
    for (const kind of STORAGE_KINDS) {
      expect(en).toContain(`betaReport.storage.${kind}`);
      expect(vi).toContain(`betaReport.storage.${kind}`);
    }
    expect(translate('en', 'betaReport.storage.remote').toLowerCase()).toContain('sqlite');
  });

  it('resolves real copy (never the key itself) in both languages', () => {
    const en = translate('en', 'betaReport.open');
    const vi = translate('vi', 'betaReport.open');
    expect(en).not.toBe('');
    expect(vi).not.toBe('');
    expect(en).not.toBe('betaReport.open');
    expect(vi).not.toBe('betaReport.open');
    expect(vi).not.toBe(en);
  });
});

describe('beta report: payload seam', () => {
  it('builds a schema-valid, content-shaped payload from repository rows', async () => {
    const payload = await buildBetaReportPayload({ now: DAY0, settings: SETTINGS });

    expect(reportSchema.safeParse(payload.report).success).toBe(true);
    expect(payload.report.schemaVersion).toBe(1);
    expect(payload.report.participantId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    expect(payload.report.app.storage).toBe('memory');
    expect(payload.report.app.provider).toBe('byok:anthropic');
    expect(Object.keys(payload.report).sort()).toEqual(
      [
        'activation',
        'app',
        'capstone',
        'generatedAtDayOffset',
        'loops',
        'participantId',
        'retention',
        'schemaVersion',
        'window',
      ].sort()
    );
    expect(payload.json).toBe(JSON.stringify(payload.report, null, 2));
    expect(payload.filename).toMatch(/^professor-beta-report-[0-9a-f]{8}-d\d+\.json$/);
  });

  it('names the file after the participant prefix and the report day offset', async () => {
    await repo.recordEvent({ kind: 'quiz_completed', surface: 'quiz', now: DAY0 });

    const day0 = await buildBetaReportPayload({ now: DAY0, settings: SETTINGS });
    const day7 = await buildBetaReportPayload({ now: daysAfter(DAY0, 7), settings: SETTINGS });
    const pid8 = day0.report.participantId.slice(0, 8);

    expect(day0.report.generatedAtDayOffset).toBe(0);
    expect(day7.report.generatedAtDayOffset).toBe(7);
    expect(day0.filename).toBe(`professor-beta-report-${pid8}-d0.json`);
    expect(day7.filename).toBe(`professor-beta-report-${pid8}-d7.json`);
    expect(day7.report.participantId).toBe(day0.report.participantId);
  });

  it('round-trips an injected app version through the export gate', async () => {
    const profile = await repo.getBetaProfile();
    const report = buildBetaReport({
      profile,
      now: DAY0,
      app: { version: 'test-version-42', storage: 'memory', provider: null },
    });

    const payload = buildReportExport(report);
    expect(payload.report.app.version).toBe('test-version-42');
    expect(JSON.parse(payload.json).app.version).toBe('test-version-42');
  });

  it('exposes a string app version in every runner, never throwing', () => {
    expect(typeof appVersion()).toBe('string');
    expect(appVersion('1.2.3')).toBe('1.2.3');
    expect(appVersion(null)).toBe('');
    expect(appVersion(42)).toBe('');
  });

  it('throws beta_report_invalid for an unknown top-level key and yields no bytes', async () => {
    const payload = await buildBetaReportPayload({ now: DAY0, settings: SETTINGS });
    const corrupted = { ...payload.report, courseTitle: 'leaked free text' };

    let error;
    try {
      buildReportExport(corrupted);
    } catch (err) {
      error = err;
    }
    expect(error).toBeTruthy();
    expect(error.code).toBe('beta_report_invalid');
    expect(error.message).toMatch(/schema validation/i);
    expect(error.message).toContain('courseTitle');
  });

  it('rejects an out-of-enum capstone verdict instead of writing an invalid file', async () => {
    const payload = await buildBetaReportPayload({ now: DAY0, settings: SETTINGS });
    const corrupted = {
      ...payload.report,
      capstone: { ...payload.report.capstone, verdict: 'maybe' },
    };
    expect(() => buildReportExport(corrupted)).toThrow(/schema validation/i);
  });

  it('never carries course text, ids, URLs or API keys', async () => {
    const sentinels = {
      title: 'SENTINEL_COURSE_TITLE_7f3a',
      description: 'SENTINEL_COURSE_DESCRIPTION_91bc',
      content: 'SENTINEL_LESSON_CONTENT_55de',
      brief: 'SENTINEL_CAPSTONE_BRIEF_4a02',
      submission: 'SENTINEL_CAPSTONE_SUBMISSION_6d77',
      key: 'sk-live-SENTINEL0123456789abcdef',
    };

    const course = await repo.createCourse({
      title: sentinels.title,
      description: `${sentinels.description} ${sentinels.key}`,
      lessons: [{ title: 'Privacy lesson', content_md: sentinels.content }],
    });
    const lesson = course.lessons[0];
    const capstone = await repo.createCapstone({
      courseId: course.id,
      brief_md: `brief ${sentinels.brief} ${sentinels.key}`,
      rubric: [],
    });
    await repo.createCapstoneSubmission({
      capstoneId: capstone.id,
      content_md: sentinels.submission,
      repo_url: `https://example.test/${sentinels.key}`,
      testResults: { source: 'external', output: sentinels.submission },
      externalId: 'cli:07-01-sentinel',
    });

    // Positive control: the sentinels really are stored, so the assertions below can fail.
    const stored = JSON.stringify(await repo.exportAll());
    for (const value of Object.values(sentinels)) expect(stored).toContain(value);

    const payload = await buildBetaReportPayload({ now: DAY0, settings: SETTINGS });

    for (const value of Object.values(sentinels)) expect(payload.json).not.toContain(value);
    expect(payload.json).not.toContain(course.id);
    expect(payload.json).not.toContain(lesson.id);
    expect(payload.json).not.toContain(capstone.id);
    expect(payload.json).not.toContain('example.test');
    expect(payload.report.capstone).toEqual({
      started: true,
      submissions: 1,
      externalEvidence: 1,
      verdict: null,
    });
  });
});

describe('beta report: provider category', () => {
  const BASE_PROFILE = {
    participant_id: '00000000-0000-4000-8000-000000000000',
    activated_day: null,
  };

  it('only ever emits a category the frozen schema accepts', () => {
    const matrix = [
      ...['claude', 'opencode', 'cursor', 'gemini', 'antigravity', 'ollama'].map((agent) => ({
        provider: 'bridge',
        bridge: { agent },
      })),
      ...['openai', 'openrouter', 'groq', 'lmstudio', 'custom'].map((preset) => ({
        provider: 'openai',
        openai: { preset },
      })),
      { provider: 'anthropic' },
      { provider: 'ollama' },
      {},
      { provider: null },
    ];

    for (const settings of matrix) {
      const category = providerCategory(settings);
      expect(category === null || PROVIDER_CATEGORY_RE.test(category)).toBe(true);
      expect(() =>
        buildBetaReport({
          profile: BASE_PROFILE,
          app: { version: '', storage: 'memory', provider: category },
        })
      ).not.toThrow();
    }
  });

  it('maps known ids and returns null for anything unknown', () => {
    expect(providerCategory({ provider: 'bridge', bridge: { agent: 'opencode' } })).toBe(
      'bridge:opencode'
    );
    expect(providerCategory({ provider: 'bridge' })).toBe('bridge:claude');
    expect(providerCategory({ provider: 'openai', openai: { preset: 'groq' } })).toBe('byok:groq');

    expect(providerCategory()).toBeNull();
    expect(providerCategory({})).toBeNull();
    expect(providerCategory({ provider: 'evil' })).toBeNull();
    expect(providerCategory({ provider: 'bridge', bridge: { agent: 'nvim' } })).toBeNull();
    expect(providerCategory({ provider: 'openai', openai: { preset: 'evil' } })).toBeNull();
  });
});

describe('beta report: capstone summary', () => {
  it('counts courses, submissions and external evidence, and takes the latest verdict', async () => {
    const withCapstone = await repo.createCourse({ title: 'With capstone', lessons: [] });
    await repo.createCourse({ title: 'Without capstone', lessons: [] });
    const capstone = await repo.createCapstone({
      courseId: withCapstone.id,
      brief_md: 'brief',
      rubric: [],
    });

    await repo.createCapstoneSubmission({ capstoneId: capstone.id, verdict: 'needs_work' });
    await repo.createCapstoneSubmission({
      capstoneId: capstone.id,
      testResults: { source: 'external' },
      verdict: 'course_complete',
    });
    await repo.createCapstoneSubmission({ capstoneId: capstone.id, verdict: 'needs_work' });

    const summary = await assembleCapstoneSummary(await repo.listCourses());
    expect(summary).toEqual({
      started: true,
      submissions: 3,
      externalEvidence: 1,
      verdict: 'needs_work',
    });
  });

  it('coerces an out-of-enum stored verdict to null but still counts the row', async () => {
    const course = await repo.createCourse({ title: 'Only course', lessons: [] });
    const capstone = await repo.createCapstone({ courseId: course.id, brief_md: 'brief', rubric: [] });
    await repo.createCapstoneSubmission({ capstoneId: capstone.id, verdict: 'pending' });

    const summary = await assembleCapstoneSummary(await repo.listCourses());
    expect(summary).toEqual({
      started: true,
      submissions: 1,
      externalEvidence: 0,
      verdict: null,
    });
  });

  it('reports nothing started when no course has a capstone', async () => {
    await repo.createCourse({ title: 'No capstone', lessons: [] });
    expect(await assembleCapstoneSummary(await repo.listCourses())).toEqual({
      started: false,
      submissions: 0,
      externalEvidence: 0,
      verdict: null,
    });
  });
});

describe('beta report: single download seam', () => {
  it('writes exactly the previewed bytes through one download() call', async () => {
    const payload = await buildBetaReportPayload({ now: DAY0, settings: SETTINGS });
    const eventsBefore = (await repo.listEvents()).length;

    installDownloadStubs();
    const result = createDownloadHandler(payload)();

    expect(result).toBe(payload);
    expect(captured.text).toBe(payload.json);
    expect(captured.opts.type).toBe('application/json');
    expect(clicked).toEqual([payload.filename]);
    expect((await repo.listEvents()).length).toBe(eventsBefore);
  });

  it('downloads nothing at all until the handler is invoked', async () => {
    const payload = await buildBetaReportPayload({ now: DAY0, settings: SETTINGS });
    installDownloadStubs();
    createDownloadHandler(payload);
    expect(captured).toBeNull();
    expect(clicked).toEqual([]);
  });
});

describe('beta report: preview and panel', () => {
  it('wires the preview to the shared download seam and never renders HTML', () => {
    expect(PANEL_SOURCE).toMatch(/onDownload=\{\s*createDownloadHandler\(payload\)\s*\}/);
    expect(PANEL_SOURCE.match(/\bdownload\(/g) || []).toHaveLength(1);
    expect(PANEL_SOURCE).not.toContain('dangerouslySetInnerHTML');
    expect(PANEL_SOURCE).not.toContain('.innerHTML');
  });

  it('previews exactly the bytes it downloads, with every summary label', async () => {
    await repo.recordEvent({ kind: 'quiz_completed', surface: 'quiz', now: DAY0 });
    await repo.recordEvent({ kind: 'recall_completed', surface: 'recall', now: daysAfter(DAY0, 1) });
    const payload = await buildBetaReportPayload({ now: daysAfter(DAY0, 7), settings: SETTINGS });
    const eventsBefore = (await repo.listEvents()).length;

    installDownloadStubs();
    createDownloadHandler(payload)();
    expect(captured.text).toBe(payload.json);
    expect(clicked).toEqual([payload.filename]);

    const html = unescapeHtml(renderToString(createElement(BetaReportPreview, { payload })));

    expect(html).toContain(payload.json);
    expect(html).toContain(payload.filename);
    expect(html).toContain(translate('en', 'betaReport.summaryTitle'));
    expect(html).toContain(translate('en', 'betaReport.everythingInFile'));
    expect(html).toContain(translate('en', 'betaReport.download'));
    for (const row of [
      'activation',
      'window',
      'loops',
      'revisions',
      'retention',
      'capstone',
      'version',
      'storage',
    ]) {
      expect(html).toContain(translate('en', `betaReport.summary.${row}`));
    }
    for (const kind of EVENT_KINDS) {
      expect(html).toContain(translate('en', `betaReport.kinds.${kind}`));
    }
    expect(html).toContain(translate('en', `betaReport.storage.${payload.report.app.storage}`));
    expect(html).toContain(translate('en', 'betaReport.values.yes'));
    expect(html).toContain(translate('en', 'betaReport.values.no'));
    expect((await repo.listEvents()).length).toBe(eventsBefore);
  });

  it('renders a JSON value containing markup as escaped text', async () => {
    const payload = await buildBetaReportPayload({ now: DAY0, settings: SETTINGS });
    const hostile = { ...payload, json: '{\n  "note": "<tag>"\n}' };
    const html = renderToString(createElement(BetaReportPreview, { payload: hostile }));

    expect(html).toContain('&lt;tag&gt;');
    expect(html).not.toContain('<tag>');
  });

  it('renders a status message and no download control in an error state', () => {
    const error = Object.assign(new Error('Beta report failed schema validation — x'), {
      code: 'beta_report_invalid',
    });
    const html = renderToString(createElement(BetaReportPreview, { error }));

    expect(html).toContain('role="status"');
    expect(unescapeHtml(html)).toContain(translate('en', 'betaReport.error'));
    expect(unescapeHtml(html)).toContain(translate('en', 'betaReport.invalid'));
    expect(unescapeHtml(html)).not.toContain(translate('en', 'betaReport.download'));
    // schema detail is never echoed into the UI
    expect(unescapeHtml(html)).not.toContain('failed schema validation');
  });

  it('renders the export action and the stable card id before anything is read', () => {
    const html = unescapeHtml(renderToString(createElement(BetaReportPanel)));

    expect(html).toContain('id="beta-report"');
    expect(html).toContain(translate('en', 'betaReport.title'));
    expect(html).toContain(translate('en', 'betaReport.subtitle'));
    expect(html).toContain(translate('en', 'betaReport.open'));
    expect(html).not.toContain(translate('en', 'betaReport.download'));
  });

  it('mounts the panel below the existing backup card in Settings ▸ Data', async () => {
    const html = unescapeHtml(renderToString(createElement(DataPanel)));

    expect(html).toContain(translate('en', 'data.title'));
    expect(html).toContain(translate('en', 'data.exportBackup'));
    expect(html).toContain('id="beta-report"');
    expect(html).toContain(translate('en', 'betaReport.open'));
    expect(html.indexOf(translate('en', 'data.title'))).toBeLessThan(
      html.indexOf('id="beta-report"')
    );
  });
});
