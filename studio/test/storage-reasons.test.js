/**
 * @vitest-environment node
 *
 * RON-210 — an unpaired browser switching storage to SQLite must never dead-end on a raw English
 * "No local server is paired." string. The probe now reports stable reason codes, and the UI renders
 * localized guidance (en + vi) from those codes instead of the probe's developer-facing `error`.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import {
  probeSqlite,
  planStorageMove,
  performStorageMove,
  selectAdapter,
  PROBE_REASONS,
  STORAGE_BROWSER,
  STORAGE_SQLITE,
} from '../src/lib/repo/select-adapter.js';
import { useAdapter } from '../src/lib/repo/index.js';
import { createMemoryAdapter } from '../src/lib/repo/memory-adapter.js';
import { StorageUnavailableError } from '../src/lib/repo/blocked-adapter.js';
import { SETTINGS_KEY } from '../src/lib/settings.js';
import { translate } from '../src/lib/i18n/index.js';
import { StorageChoice, sqliteReasonText, sqliteStatusText } from '../src/components/data/StorageChoice.jsx';
import { StorageMoveDialog } from '../src/components/data/StorageMoveDialog.jsx';

const REASONS = [PROBE_REASONS.NOT_PAIRED, PROBE_REASONS.UNREACHABLE, PROBE_REASONS.UNEXPECTED];
const bridge = { bridgeUrl: 'http://127.0.0.1:1', bridgeToken: 'token' };

function jsonRes(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockLocalStorage(initial) {
  const store = new Map();
  if (initial) store.set(SETTINGS_KEY, JSON.stringify(initial));
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    key: (i) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
}

const DOWN = async () => {
  throw new Error('connection refused');
};
const UNEXPECTED = async () => jsonRes({ ok: false, error: 'schema mismatch' });
const HEALTHY = async () => jsonRes({ ok: true, kind: 'sqlite', path: '/tmp/professor.db', schemaVersion: 1 });

beforeEach(() => {
  globalThis.localStorage = mockLocalStorage();
  useAdapter(createMemoryAdapter());
});

afterEach(() => {
  delete globalThis.localStorage;
});

describe('RON-210 probe reason codes', () => {
  it('reports not_paired when the bridge URL/token are missing', async () => {
    const probe = await probeSqlite({});
    expect(probe).toMatchObject({ available: false, configured: false, reason: PROBE_REASONS.NOT_PAIRED });
    // The English detail is kept for logs only — the UI must not render it.
    expect(probe.error).toBe('No local server is paired.');
  });

  it('reports not_paired when only half the bridge config is present', async () => {
    expect((await probeSqlite({ bridge: { bridgeUrl: 'http://127.0.0.1:1' } })).reason).toBe(PROBE_REASONS.NOT_PAIRED);
    expect((await probeSqlite({ bridge: { bridgeToken: 'token' } })).reason).toBe(PROBE_REASONS.NOT_PAIRED);
  });

  it('reports unreachable when the paired server refuses the connection', async () => {
    const probe = await probeSqlite({ bridge }, { fetchImpl: DOWN });
    expect(probe).toMatchObject({ available: false, configured: true, reason: PROBE_REASONS.UNREACHABLE });
  });

  it('reports unexpected when the paired server answers with a bad health payload', async () => {
    const probe = await probeSqlite({ bridge }, { fetchImpl: UNEXPECTED });
    expect(probe).toMatchObject({ available: false, configured: true, reason: PROBE_REASONS.UNEXPECTED });
  });

  it('omits the reason when the probe succeeds', async () => {
    const probe = await probeSqlite({ bridge }, { fetchImpl: HEALTHY });
    expect(probe.available).toBe(true);
    expect(probe.reason).toBeUndefined();
  });

  it('carries the code into the move plan (reason + English detail kept apart)', async () => {
    const plan = await planStorageMove(STORAGE_SQLITE, { settings: { storage: STORAGE_BROWSER } });
    expect(plan.targetReady).toBe(false);
    expect(plan.targetReason).toBe(PROBE_REASONS.NOT_PAIRED);
    expect(plan.targetError).toBe('No local server is paired.');
  });

  it('carries the code into the blocked adapter info', async () => {
    const result = await selectAdapter({ settings: { storage: STORAGE_SQLITE } });
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe(PROBE_REASONS.NOT_PAIRED);
  });

  it('performStorageMove refuses an unpaired target with a coded error', async () => {
    await expect(
      performStorageMove(STORAGE_SQLITE, { settings: { storage: STORAGE_BROWSER } })
    ).rejects.toMatchObject({ name: 'StorageUnavailableError', code: PROBE_REASONS.NOT_PAIRED });
    await expect(
      performStorageMove(STORAGE_SQLITE, { settings: { storage: STORAGE_BROWSER } })
    ).rejects.toBeInstanceOf(StorageUnavailableError);
  });
});

describe('RON-210 localized storage reasons', () => {
  it('ships short + hint strings for every reason code in both catalogs', () => {
    for (const reason of REASONS) {
      for (const suffix of ['short', 'hint']) {
        const key = `storage.reasons.${reason}.${suffix}`;
        const en = translate('en', key);
        const vi = translate('vi', key);
        expect(en, `missing ${key} in en`).not.toBe(key);
        expect(vi, `missing ${key} in vi`).not.toBe(key);
        expect(vi, `${key} is untranslated`).not.toBe(en);
      }
    }
  });

  it('renders no English probe detail in the Vietnamese storage choice', () => {
    globalThis.localStorage = mockLocalStorage({ language: 'vi' });
    const html = renderToString(
      createElement(StorageChoice, {
        value: STORAGE_BROWSER,
        onSelect: () => {},
        sqliteStatus: {
          available: false,
          configured: false,
          path: '',
          reason: PROBE_REASONS.NOT_PAIRED,
          error: 'No local server is paired.',
        },
      })
    );

    expect(html).toContain(translate('vi', 'storage.reasons.not_paired.short'));
    expect(html).not.toContain('No local server is paired.');
    expect(html).not.toContain(translate('en', 'storage.reasons.not_paired.short'));
    expect(html).not.toContain('Offline —');
  });

  it('renders localized pairing guidance in the Vietnamese switch dialog', () => {
    globalThis.localStorage = mockLocalStorage({ language: 'vi' });
    const html = renderToString(
      createElement(StorageMoveDialog, {
        plan: {
          from: STORAGE_BROWSER,
          to: STORAGE_SQLITE,
          counts: { courses: 0, cards: 0, total: 0 },
          targetReady: false,
          targetReason: PROBE_REASONS.NOT_PAIRED,
          targetError: 'No local server is paired.',
        },
        onConfirm: () => {},
        onCancel: () => {},
      })
    );

    expect(html).toContain(translate('vi', 'storage.reasons.not_paired.short'));
    expect(html).toContain(translate('vi', 'storage.reasons.not_paired.hint'));
    expect(html).not.toContain('No local server is paired.');
  });

  it('falls back to the generic offline label for an unknown code (never raw English)', () => {
    const t = (key) => translate('vi', key);
    expect(sqliteReasonText('mystery', t)).toBeNull();
    expect(
      sqliteStatusText({ available: false, reason: 'mystery', error: 'No local server is paired.' }, t)
    ).toBe(translate('vi', 'storage.offline'));
  });
});
