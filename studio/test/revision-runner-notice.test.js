/**
 * Wave-0 contract for LOOP-04: the runner acknowledgement helpers, the `Browser` / `Local machine`
 * disclosure, `shouldBlockLocalRun`, and the honesty scan that keeps "sandbox" out of runner copy.
 *
 * The ack is scoped to `runnerBase(settings)` (D-14) and every helper takes an injectable `storage`
 * so `renderToString` never needs a DOM or `localStorage`.
 *
 * `components/revision/RunnerNotice.jsx` and `runner-notice.jsx` do not exist yet — red today.
 */
import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { RunnerNotice } from '../src/components/revision/RunnerNotice.jsx';
import {
  RUNNER_ACK_KEY,
  runnerAckScope,
  readRunnerAck,
  needsRunnerAck,
  acknowledgeRunner,
  shouldBlockLocalRun,
} from '../src/components/revision/runner-notice.jsx';
import { OutputPanel } from '../src/components/workspace/OutputPanel.jsx';

const LOCAL_SETTINGS = { bridge: { bridgeUrl: 'http://localhost:3000' } };
const REMOTE_SETTINGS = { bridge: { bridgeUrl: 'http://192.168.1.5:3000' } };
const SCOPE = 'http://localhost:3000/api/studio/run';
const ACKED_AT = '2026-10-24T10:00:00.000Z';

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

const renderText = (element) =>
  renderToString(element)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ');

describe('runner acknowledgement helpers', () => {
  it('runnerAckScope normalises through runnerBase', () => {
    expect(RUNNER_ACK_KEY).toBe('professor.runnerNotice.ack');
    expect(runnerAckScope(LOCAL_SETTINGS)).toBe(SCOPE);
    expect(runnerAckScope({ bridge: { bridgeUrl: 'http://localhost:3000/' } })).toBe(SCOPE);
    // A non-loopback bridge throws inside runnerBase and must be caught, not propagated.
    expect(runnerAckScope(REMOTE_SETTINGS)).toBeNull();
  });

  it('needsRunnerAck is true before the first acknowledgement', () => {
    expect(needsRunnerAck(LOCAL_SETTINGS, { getItem: () => null, setItem: vi.fn() })).toBe(true);
  });

  it('acknowledgeRunner persists url + acknowledgedAt under professor.runnerNotice.ack', () => {
    const store = memoryStorage();
    const setItem = vi.fn((key, value) => store.setItem(key, value));
    const storage = { getItem: store.getItem, setItem };

    const record = acknowledgeRunner(LOCAL_SETTINGS, storage, new Date('2026-10-24T10:00:00Z'));

    expect(record).toEqual({ url: SCOPE, acknowledgedAt: ACKED_AT });
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(setItem.mock.calls[0][0]).toBe('professor.runnerNotice.ack');
    expect(JSON.parse(setItem.mock.calls[0][1])).toEqual({ url: SCOPE, acknowledgedAt: ACKED_AT });
    expect(needsRunnerAck(LOCAL_SETTINGS, storage)).toBe(false);
  });

  it('a different runner URL re-prompts', () => {
    const storage = memoryStorage({
      [RUNNER_ACK_KEY]: JSON.stringify({ url: 'http://localhost:4000/api/studio/run', acknowledgedAt: ACKED_AT }),
    });
    expect(needsRunnerAck(LOCAL_SETTINGS, storage)).toBe(true);

    const sameScope = memoryStorage({ [RUNNER_ACK_KEY]: JSON.stringify({ url: SCOPE, acknowledgedAt: ACKED_AT }) });
    expect(needsRunnerAck(LOCAL_SETTINGS, sameScope)).toBe(false);
  });

  it('missing, null and throwing storage never throw', () => {
    expect(readRunnerAck(null)).toBeNull();

    const throwing = {
      getItem: () => {
        throw new Error('storage blocked');
      },
      setItem: vi.fn(),
    };
    expect(readRunnerAck(throwing)).toBeNull();
    expect(needsRunnerAck(LOCAL_SETTINGS, throwing)).toBe(true);

    const blockedWrite = {
      getItem: () => null,
      setItem: () => {
        throw new Error('storage full');
      },
    };
    expect(acknowledgeRunner(LOCAL_SETTINGS, blockedWrite, new Date('2026-10-24T10:00:00Z'))).toEqual({
      url: SCOPE,
      acknowledgedAt: ACKED_AT,
    });
  });

  it('no usable scope means no prompt and no record', () => {
    const setItem = vi.fn();
    const storage = { getItem: () => null, setItem };

    expect(needsRunnerAck(REMOTE_SETTINGS, storage)).toBe(false);
    expect(acknowledgeRunner(REMOTE_SETTINGS, storage)).toBeNull();
    expect(setItem).not.toHaveBeenCalled();
  });

  it('shouldBlockLocalRun blocks only a local, unacknowledged run', () => {
    expect(shouldBlockLocalRun({ runnerKind: 'local', acknowledged: false })).toBe(true);
    expect(shouldBlockLocalRun({ runnerKind: 'local', acknowledged: true })).toBe(false);
    expect(shouldBlockLocalRun({ runnerKind: 'browser', acknowledged: false })).toBe(false);
    expect(shouldBlockLocalRun({ runnerKind: null, acknowledged: false })).toBe(false);
    expect(shouldBlockLocalRun()).toBe(false);
  });
});

describe('RunnerNotice and runner badges', () => {
  it('RunnerNotice shows the machine notice and an acknowledge action before ack', () => {
    const html = renderToString(
      createElement(RunnerNotice, {
        runnerInfo: { kind: 'local', ready: true, command: 'node' },
        acknowledged: false,
        onAcknowledge: () => {},
      })
    );

    expect(html).toContain('Code runs on your machine');
    expect(html).toContain('Local machine');
    expect(html).toContain('I understand — run my code');
  });

  it('RunnerNotice after ack keeps the copy and drops the button', () => {
    const html = renderToString(
      createElement(RunnerNotice, {
        runnerInfo: { kind: 'local', ready: true, command: 'node' },
        acknowledged: true,
        onAcknowledge: () => {},
      })
    );

    expect(html).toContain('Code runs on your machine');
    expect(html).toContain('You have acknowledged that code runs on your machine.');
    expect(html).not.toContain('I understand — run my code');
  });

  it('RunnerNotice renders nothing machine-specific for browser runs', () => {
    const html = renderToString(
      createElement(RunnerNotice, { runnerInfo: { kind: 'browser', ready: true }, acknowledged: false })
    );

    expect(html).toContain('Browser');
    expect(html).not.toContain('Code runs on your machine');
  });

  it('OutputPanel labels the runner honestly', () => {
    const local = renderToString(
      createElement(OutputPanel, {
        output: { runner: 'local', stdout: '', stderr: '', checks: [], preview: null },
        runnerInfo: { kind: 'local', ready: true },
      })
    );
    expect(local).toContain('Local machine');
    expect(local).not.toContain('Local server');

    const browser = renderToString(
      createElement(OutputPanel, {
        output: { runner: 'browser', stdout: '', stderr: '', checks: [], preview: null },
        runnerInfo: { kind: 'browser', ready: true },
      })
    );
    expect(browser).toContain('Browser');
  });

  // T-08-08 (LOOP-04): a pending run has `runner: null`, so the badge must fall back to the runner
  // the target language is known to use — never to a hardcoded "Browser".
  it('OutputPanel labels a pending local run with Local machine, never Browser', () => {
    const html = renderToString(
      createElement(OutputPanel, {
        output: { runner: null, stdout: '', stderr: '', checks: [], preview: null },
        runnerInfo: { kind: 'local', ready: true, command: 'node' },
      })
    );

    expect(html).toContain('Local machine');
    expect(html).not.toContain('Browser');
  });

  it('OutputPanel labels a pending browser run with Browser', () => {
    const html = renderToString(
      createElement(OutputPanel, {
        output: { runner: null, stdout: '', stderr: '', checks: [], preview: null },
        runnerInfo: { kind: 'browser', ready: true },
      })
    );

    expect(html).toContain('Browser');
    expect(html).not.toContain('Local machine');
  });

  it('OutputPanel renders no runner badge when the runner is truly unknown', () => {
    const html = renderToString(
      createElement(OutputPanel, {
        output: { runner: null, stdout: '', stderr: '', checks: [], preview: null },
        runnerInfo: null,
      })
    );

    expect(html).not.toContain('Browser');
    expect(html).not.toContain('Local machine');
  });
});

describe('runner copy never says sandbox', () => {
  const readCatalog = (lang) =>
    JSON.parse(
      readFileSync(fileURLToPath(new URL(`../src/lib/i18n/${lang}/runnerNotice.json`, import.meta.url)), 'utf8')
    );
  const flattenValues = (value) =>
    value && typeof value === 'object' ? Object.values(value).flatMap(flattenValues) : [value];

  it('no runnerNotice catalog value says sandbox', () => {
    for (const lang of ['en', 'vi']) {
      for (const value of flattenValues(readCatalog(lang))) {
        expect(value, `${lang}/runnerNotice.json`).not.toMatch(/sandbox/i);
      }
    }
  });

  it('rendered local-runner text never says sandbox', () => {
    // The HTML preview iframe's `sandbox="allow-scripts"` attribute is deliberately excluded from
    // this scan (D-15): it is not runner copy. Both fixtures render with `preview: null`.
    const notice = renderText(
      createElement(RunnerNotice, {
        runnerInfo: { kind: 'local', ready: true, command: 'node' },
        acknowledged: false,
        onAcknowledge: () => {},
      })
    );
    expect(notice).not.toMatch(/sandbox/i);

    const panel = renderText(
      createElement(OutputPanel, {
        output: { runner: 'local', stdout: '', stderr: '', checks: [], preview: null },
        runnerInfo: { kind: 'local', ready: true },
      })
    );
    expect(panel).not.toMatch(/sandbox/i);
  });
});
