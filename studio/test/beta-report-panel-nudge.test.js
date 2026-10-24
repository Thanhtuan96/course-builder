/**
 * @vitest-environment node
 *
 * Phase 7 INSTR-06 — the day-7 / day-14 beta-report reminder.
 *
 * Same harness rules as `beta-report-panel.test.js` (D-15): `.test.js`, Node environment, no jsdom and
 * no testing-library. Render assertions use `react-dom/server`; anything interactive is reached through
 * an exported pure helper. Every stubbed global is saved and restored, so a failure mid-test cannot
 * leak a fake `localStorage`, `Blob` or `document` into another file.
 *
 * Two deliberate testing choices:
 *   • The marker helpers take an injected storage, so their cases never touch `globalThis`.
 *   • The one download-path case exercises the SHIPPED seam (`createDownloadHandler`), which takes no
 *     storage argument — so it installs a Map-backed `globalThis.localStorage` and restores it.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { catalogKeys, translate } from '../src/lib/i18n/index.js';
import { EVENT_KINDS } from '../src/lib/repo/events.js';
import { createMemoryAdapter } from '../src/lib/repo/memory-adapter.js';
import * as repo from '../src/lib/repo/index.js';
import {
  NUDGE_CHECKPOINTS,
  BetaReportNudge,
  activationOffset,
  buildBetaReportPayload,
  createDownloadHandler,
  markerKey,
  nudgeVisible,
  readNudgeMarkers,
  safeStorage,
  writeNudgeMarker,
} from '../src/components/data/BetaReportPanel.jsx';
import { reportRequested, scrollToBetaReport } from '../src/pages/Settings.jsx';
import { Home } from '../src/pages/Home.jsx';

const PANEL_SOURCE = readFileSync(
  new URL('../src/components/data/BetaReportPanel.jsx', import.meta.url),
  'utf8'
);
const HOME_SOURCE = readFileSync(new URL('../src/pages/Home.jsx', import.meta.url), 'utf8');
const SETTINGS_SOURCE = readFileSync(new URL('../src/pages/Settings.jsx', import.meta.url), 'utf8');

/** Pinned local noon — never the machine clock, never a UTC instant. */
const NOW = new Date(2026, 4, 8, 12, 0, 0); // 2026-05-08
const ACTIVATED_DAY7 = '2026-05-01';
const ACTIVATED_DAY14 = '2026-04-24';
const SETTINGS = { provider: 'anthropic' };

/** @param {Date} base @param {number} days */
function daysAfter(base, days) {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + days, 12, 0, 0);
}

/** A storage object backed by a Map — the pure helpers are always driven through one of these. */
function fakeStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    store,
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
  };
}

/** Undo React's text-node escaping (`&amp;` must be last, or the others get double-decoded). */
function unescapeHtml(html) {
  return String(html)
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** Every flattened key the betaReport namespace contributes to a language catalog. */
function betaReportKeys(language) {
  return catalogKeys(language)
    .filter((key) => key.startsWith('betaReport.'))
    .sort();
}

// ── download + storage capture ─────────────────────────────────────────────────────────────────
// `download()` builds a Blob, creates an object URL and clicks an anchor. Overriding those globals
// captures the exact bytes. The originals are saved and restored after every test: deleting a real
// Node global would leak into other files.
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

/** Install a Map-backed `globalThis.localStorage`, remembering how to put the real one back. */
function installLocalStorage() {
  const storage = fakeStorage();
  const had = 'localStorage' in globalThis;
  const original = had ? globalThis.localStorage : undefined;
  globalThis.localStorage = storage;
  return {
    storage,
    restore() {
      if (had) globalThis.localStorage = original;
      else delete globalThis.localStorage;
    },
  };
}

beforeEach(() => {
  repo.useAdapter(createMemoryAdapter());
});

afterEach(() => {
  restoreDownloadStubs();
});

describe('beta report nudge: checkpoints', () => {
  it('knows exactly the two checkpoints, and refuses to be edited', () => {
    expect([...NUDGE_CHECKPOINTS]).toEqual([7, 14]);
    expect(Object.isFrozen(NUDGE_CHECKPOINTS)).toBe(true);
  });

  it('fires only at offsets 7 and 14', () => {
    expect(nudgeVisible({ offset: 7 })).toBe(7);
    expect(nudgeVisible({ offset: 14 })).toBe(14);

    for (const offset of [0, 1, 6, 8, 13, 15, 21, -1, null, undefined]) {
      expect(nudgeVisible({ offset }), `offset ${offset} must not show the reminder`).toBeNull();
    }
    expect(nudgeVisible()).toBeNull();
    expect(nudgeVisible({})).toBeNull();
  });

  it('hides a checkpoint only when that same checkpoint is marked', () => {
    expect(nudgeVisible({ offset: 7, dismissed: [7] })).toBeNull();
    expect(nudgeVisible({ offset: 7, exported: [7] })).toBeNull();
    // marking 14 never silences 7, and vice versa
    expect(nudgeVisible({ offset: 7, dismissed: [14], exported: [14] })).toBe(7);
    expect(nudgeVisible({ offset: 14, dismissed: [7], exported: [7] })).toBe(14);
  });
});

describe('beta report nudge: per-checkpoint markers', () => {
  it('uses a distinct storage key per kind and per checkpoint', () => {
    expect(markerKey('dismissed', 7)).toBe('professor-studio:beta-report-dismissed:7');
    expect(markerKey('exported', 7)).toBe('professor-studio:beta-report-exported:7');
    expect(markerKey('dismissed', 7)).not.toBe(markerKey('exported', 7));
    expect(markerKey('dismissed', 7)).not.toBe(markerKey('dismissed', 14));
  });

  it('persists a dismissal without suppressing the other checkpoint', () => {
    const storage = fakeStorage();
    expect(writeNudgeMarker('dismissed', 7, storage)).toBe(true);

    const markers = readNudgeMarkers(storage);
    expect(markers).toEqual({ dismissed: [7], exported: [] });
    expect(nudgeVisible({ offset: 7, ...markers })).toBeNull();
    expect(nudgeVisible({ offset: 14, ...markers })).toBe(14);
  });

  it('persists an export without suppressing the other checkpoint', () => {
    const storage = fakeStorage();
    expect(writeNudgeMarker('exported', 7, storage)).toBe(true);

    const markers = readNudgeMarkers(storage);
    expect(markers).toEqual({ dismissed: [], exported: [7] });
    expect(nudgeVisible({ offset: 7, ...markers })).toBeNull();
    expect(nudgeVisible({ offset: 14, ...markers })).toBe(14);
  });

  it('ignores anything but an exact "1" (corrupt or tampered markers)', () => {
    const storage = fakeStorage({
      [markerKey('dismissed', 7)]: 'true',
      [markerKey('exported', 14)]: 'yes',
      [markerKey('dismissed', 14)]: '01',
    });

    expect(readNudgeMarkers(storage)).toEqual({ dismissed: [], exported: [] });
  });

  it('never throws with a missing, partial or throwing storage', () => {
    expect(readNudgeMarkers(undefined)).toEqual({ dismissed: [], exported: [] });
    expect(readNudgeMarkers(null)).toEqual({ dismissed: [], exported: [] });
    expect(readNudgeMarkers({})).toEqual({ dismissed: [], exported: [] });
    expect(
      readNudgeMarkers({
        getItem() {
          throw new Error('denied');
        },
      })
    ).toEqual({ dismissed: [], exported: [] });

    expect(writeNudgeMarker('dismissed', 7, undefined)).toBe(false);
    expect(writeNudgeMarker('dismissed', 7, null)).toBe(false);
    expect(writeNudgeMarker('dismissed', 7, {})).toBe(false);
    expect(
      writeNudgeMarker('dismissed', 7, {
        setItem() {
          throw new Error('QuotaExceededError');
        },
      })
    ).toBe(false);
  });

  it('reports the browser storage or nothing, without ever throwing', () => {
    const installed = installLocalStorage();
    try {
      expect(safeStorage()).toBe(installed.storage);
    } finally {
      installed.restore();
    }
    // whatever this runtime exposes, the helper is total
    expect(() => safeStorage()).not.toThrow();
  });
});

describe('beta report nudge: activation offset', () => {
  it('is null until the profile has a valid activation day', () => {
    expect(activationOffset(null, NOW)).toBeNull();
    expect(activationOffset(undefined, NOW)).toBeNull();
    expect(activationOffset({}, NOW)).toBeNull();
    expect(activationOffset({ activated_day: null }, NOW)).toBeNull();
    expect(activationOffset({ activated_day: '' }, NOW)).toBeNull();
    expect(activationOffset({ activated_day: 'not-a-day' }, NOW)).toBeNull();
    expect(activationOffset({ activated_day: 20260501 }, NOW)).toBeNull();
  });

  it('computes local calendar-day offsets from a pinned clock', () => {
    expect(activationOffset({ activated_day: ACTIVATED_DAY7 }, NOW)).toBe(7);
    expect(activationOffset({ activated_day: ACTIVATED_DAY14 }, NOW)).toBe(14);
    expect(activationOffset({ activated_day: '2026-05-08' }, NOW)).toBe(0);
    expect(activationOffset({ activated_day: ACTIVATED_DAY7 }, daysAfter(NOW, 7))).toBe(14);
  });

  it('clamps a clock before activation to offset 0, so no reminder can appear early', () => {
    const offset = activationOffset({ activated_day: ACTIVATED_DAY7 }, new Date(2026, 3, 29, 12));
    expect(offset).toBe(0);
    expect(nudgeVisible({ offset })).toBeNull();
  });
});

describe('beta report nudge: export marker on the shipped download path', () => {
  it('records the exported checkpoint through the handler the panel hands to Download', async () => {
    const activation = daysAfter(NOW, -7); // local day 2026-05-01
    await repo.recordEvent({ kind: 'quiz_completed', surface: 'quiz', now: activation });

    const payload = await buildBetaReportPayload({ now: NOW, settings: SETTINGS });
    expect(payload.report.generatedAtDayOffset).toBe(7);

    const installed = installLocalStorage();
    installDownloadStubs();
    try {
      const before = (await repo.listEvents()).length;
      const onDownload = createDownloadHandler(payload);
      onDownload();

      // (a) the marker exists for this checkpoint and only this checkpoint
      const markers = readNudgeMarkers(globalThis.localStorage);
      expect(markers.exported).toEqual([payload.report.generatedAtDayOffset]);
      expect(markers.exported).toEqual([7]);
      expect(markers.exported).not.toContain(14);
      expect(markers.dismissed).toEqual([]);

      // (b) the marker never disturbs the bytes
      expect(captured.text).toBe(payload.json);
      expect(clicked).toEqual([payload.filename]);
      expect(captured.opts.type).toBe('application/json');

      // (c) no repository row and no learning event anywhere on the download path
      expect((await repo.listEvents()).length).toBe(before);
      expect(nudgeVisible({ offset: 7, ...markers })).toBeNull();
    } finally {
      installed.restore();
    }
  });

  it('writes an inert marker on a non-checkpoint day and never claims day 7', async () => {
    const activation = daysAfter(NOW, -3); // local day 2026-05-05
    await repo.recordEvent({ kind: 'quiz_completed', surface: 'quiz', now: activation });

    const payload = await buildBetaReportPayload({ now: NOW, settings: SETTINGS });
    expect(payload.report.generatedAtDayOffset).toBe(3);

    const installed = installLocalStorage();
    installDownloadStubs();
    try {
      const before = (await repo.listEvents()).length;
      createDownloadHandler(payload)();

      expect(globalThis.localStorage.getItem(markerKey('exported', 3))).toBe('1');
      expect(readNudgeMarkers(globalThis.localStorage).exported).toEqual([]);
      expect(globalThis.localStorage.getItem(markerKey('exported', 7))).toBeNull();
      expect((await repo.listEvents()).length).toBe(before);
    } finally {
      installed.restore();
    }
  });
});

describe('beta report nudge: source guard', () => {
  it('touches localStorage only inside safeStorage, never at module scope', () => {
    const code = PANEL_SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const start = code.indexOf('export function safeStorage(');
    expect(start).toBeGreaterThan(-1);
    const end = code.indexOf('\n}', start);
    expect(end).toBeGreaterThan(start);

    const body = code.slice(start, end);
    const outside = code.slice(0, start) + code.slice(end);

    expect(body).toContain('localStorage');
    expect(outside).not.toContain('localStorage');
  });

  it('ships the four nudge keys in both catalogs', () => {
    for (const key of ['day7', 'day14', 'action', 'dismiss']) {
      expect(betaReportKeys('en')).toContain(`betaReport.nudge.${key}`);
      expect(betaReportKeys('vi')).toContain(`betaReport.nudge.${key}`);
    }
  });
});

describe('beta report nudge: banner render', () => {
  it('renders the day-7 message, the settings deep link and the dismiss control', () => {
    const html = unescapeHtml(
      renderToString(createElement(BetaReportNudge, { checkpoint: 7, onDismiss: () => {} }))
    );

    expect(html).toContain('href="#/settings?report=1"');
    expect(html).toContain(translate('en', 'betaReport.nudge.day7'));
    expect(html).toContain(translate('en', 'betaReport.nudge.action'));
    expect(html).toContain(translate('en', 'betaReport.nudge.dismiss'));
    expect(html).not.toContain(translate('en', 'betaReport.nudge.day14'));
  });

  it('renders the day-14 message and never the day-7 one', () => {
    const html = unescapeHtml(
      renderToString(createElement(BetaReportNudge, { checkpoint: 14, onDismiss: () => {} }))
    );

    expect(html).toContain(translate('en', 'betaReport.nudge.day14'));
    expect(html).not.toContain(translate('en', 'betaReport.nudge.day7'));
    expect(html).toContain('href="#/settings?report=1"');
  });

  it('is a non-blocking banner: no alert role, no dialog, no focus trap', () => {
    const raw = renderToString(
      createElement(BetaReportNudge, { checkpoint: 7, onDismiss: () => {} })
    );

    expect(raw).not.toContain('role="alert"');
    expect(raw).not.toContain('role="dialog"');
    expect(raw).not.toContain('<dialog');
    expect(raw).not.toContain('autoFocus');
    expect(raw).toContain('<button type="button"');
  });

  it('renders no reminder at all on Home before the effect resolves', () => {
    const html = unescapeHtml(renderToString(createElement(Home)));

    expect(html).toContain(translate('en', 'home.title'));
    expect(html).not.toContain(translate('en', 'betaReport.nudge.day7'));
    expect(html).not.toContain(translate('en', 'betaReport.nudge.day14'));
  });
});

describe('beta report nudge: Settings deep link', () => {
  it('recognizes the report marker and nothing else', () => {
    expect(reportRequested('#/settings?report=1')).toBe(true);
    expect(reportRequested('#/settings?bridge=x&token=y&report=1')).toBe(true);
    expect(reportRequested('/settings?report=1')).toBe(true);
    expect(reportRequested('?report=1')).toBe(true);

    expect(reportRequested('#/settings')).toBe(false);
    expect(reportRequested('#/settings?report=0')).toBe(false);
    expect(reportRequested('#/settings?report=true')).toBe(false);
    expect(reportRequested('#/')).toBe(false);
    expect(reportRequested('')).toBe(false);
    expect(reportRequested()).toBe(false);
  });

  it('scrolls to the panel id with smooth/start options', () => {
    const calls = [];
    const doc = {
      getElementById: (id) =>
        id === 'beta-report' ? { scrollIntoView: (options) => calls.push(options) } : null,
    };

    expect(scrollToBetaReport(doc)).toBe(true);
    expect(calls).toEqual([{ behavior: 'smooth', block: 'start' }]);
  });

  it('returns false without throwing when there is nothing to scroll', () => {
    expect(scrollToBetaReport(null)).toBe(false);
    expect(scrollToBetaReport({})).toBe(false);
    expect(scrollToBetaReport({ getElementById: () => null })).toBe(false);
    expect(scrollToBetaReport({ getElementById: () => ({}) })).toBe(false);
    expect(
      scrollToBetaReport({ getElementById: () => ({ scrollIntoView: 'not a function' }) })
    ).toBe(false);
  });

  it('never uses an anchor for the affordance (the hash router would render NotFound)', () => {
    expect(SETTINGS_SOURCE).not.toContain('href="#beta-report"');
    expect(SETTINGS_SOURCE).toMatch(/<button\s+type="button"\s+onClick=\{\(\) => scrollToBetaReport\(\)\}/);
    expect(SETTINGS_SOURCE).toContain("t('betaReport.jump')");
  });
});

describe('beta report nudge: no learning events, no meaningful rows', () => {
  // `renderToString` skips effects, so counting events around a Home render would prove nothing about
  // Home's real effect body. These assertions pin the truth to the source that actually runs.
  const FORBIDDEN_WRITES = ['recordEvent(', 'logEvent(', 'createRevisionLink(', 'upsertCourse('];

  it('Home reads the beta profile exactly once, inside an effect', () => {
    expect((HOME_SOURCE.match(/getBetaProfile\(/g) || [])).toHaveLength(1);
    expect(HOME_SOURCE).toMatch(/useEffect\(\(\) => \{[\s\S]*?getBetaProfile\(/);
  });

  it('Home and the panel contain no event, revision or course write', () => {
    for (const forbidden of FORBIDDEN_WRITES) {
      expect(HOME_SOURCE, `Home.jsx must not call ${forbidden}`).not.toContain(forbidden);
      expect(PANEL_SOURCE, `BetaReportPanel.jsx must not call ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('the nudge only ever writes localStorage markers', () => {
    expect(PANEL_SOURCE).toContain("writeNudgeMarker('exported'");
    expect(HOME_SOURCE).toContain("writeNudgeMarker('dismissed'");
    // one read-through and one dismiss write, no other repository call in the nudge path
    expect((HOME_SOURCE.match(/\bgetBetaProfile\(/g) || [])).toHaveLength(1);
  });
});

describe('beta report nudge: dynamic i18n key parity', () => {
  // The `i18n-keys` scanner only sees literal `t('...')` arguments, so the template-literal keys
  // (`betaReport.kinds.${kind}`, `betaReport.storage.${kind}`) have no automatic coverage. This block
  // closes that gap for every dynamic key the preview, the banner and the Settings button resolve.
  const DYNAMIC_KEYS = [
    ...EVENT_KINDS.map((kind) => `betaReport.kinds.${kind}`),
    ...['indexeddb', 'sqlite', 'memory', 'remote'].map((kind) => `betaReport.storage.${kind}`),
    ...[
      'activation',
      'window',
      'loops',
      'revisions',
      'retention',
      'capstone',
      'version',
      'storage',
    ].map((row) => `betaReport.summary.${row}`),
    ...[
      'yes',
      'no',
      'activated',
      'notActivated',
      'none',
      'week1',
      'week2',
      'started',
      'notStarted',
      'courseComplete',
      'needsWork',
    ].map((value) => `betaReport.values.${value}`),
    'betaReport.nudge.day7',
    'betaReport.nudge.day14',
    'betaReport.nudge.action',
    'betaReport.nudge.dismiss',
    'betaReport.jump',
  ];

  it('defines every dynamic key in both catalogs', () => {
    const en = catalogKeys('en');
    const vi = catalogKeys('vi');
    expect(en.length).toBeGreaterThan(0);

    for (const key of DYNAMIC_KEYS) {
      expect(en, `missing from en: ${key}`).toContain(key);
      expect(vi, `missing from vi: ${key}`).toContain(key);
    }
  });

  it('keeps the whole betaReport namespace key-identical across languages', () => {
    expect(betaReportKeys('vi')).toEqual(betaReportKeys('en'));
  });

  it('resolves every dynamic key to real copy in both languages', () => {
    for (const key of DYNAMIC_KEYS) {
      const en = translate('en', key);
      const vi = translate('vi', key);
      expect(en, `en resolved ${key} to the key itself`).not.toBe(key);
      expect(vi, `vi resolved ${key} to the key itself`).not.toBe(key);
      expect(en).not.toBe('');
      expect(vi).not.toBe('');
    }
  });

  it('never leaves a Vietnamese nudge string as the English one', () => {
    // Values that are legitimately identical across languages (e.g. "SQLite") are excluded on purpose:
    // this assertion is about copy the learner reads, not about product nouns.
    for (const key of [
      'betaReport.nudge.day7',
      'betaReport.nudge.day14',
      'betaReport.nudge.action',
      'betaReport.nudge.dismiss',
      'betaReport.jump',
      'betaReport.open',
      'betaReport.download',
    ]) {
      expect(translate('vi', key), `vi left ${key} as English`).not.toBe(translate('en', key));
    }
  });
});
