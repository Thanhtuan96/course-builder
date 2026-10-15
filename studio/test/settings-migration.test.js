/**
 * Phase 26c — legacy `settings.model` migration.
 *
 * The pre-26c app kept ONE global `model` shared by every provider, so an Anthropic model id leaked
 * into the local-agent bridge. Migration moves the value into the matching provider only when it is
 * valid there, then deletes the global field for good.
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  migrateSettings,
  activeModel,
  bridgeAgentModel,
  loadSettings,
  saveSettings,
  SETTINGS_KEY,
} from '../src/lib/settings.js';

function mockLocalStorage(initial) {
  const store = new Map();
  if (initial !== undefined) store.set(SETTINGS_KEY, JSON.stringify(initial));
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}

beforeEach(() => {
  globalThis.localStorage = mockLocalStorage();
});
afterEach(() => {
  delete globalThis.localStorage;
});

describe('migrateSettings', () => {
  it('moves a Claude model into anthropic.model and drops the global field', () => {
    const out = migrateSettings({ provider: 'anthropic', model: 'claude-opus-5-5' });
    expect(out.model).toBeUndefined();
    expect(out.anthropic.model).toBe('claude-opus-5-5');
  });

  it('drops a model that is not valid for the active provider', () => {
    const out = migrateSettings({ provider: 'anthropic', model: 'gpt-4o-mini' });
    expect(out.model).toBeUndefined();
    expect(out.anthropic?.model).toBeUndefined();
  });

  it('never leaks an Anthropic model into the bridge (invalid for opencode)', () => {
    const out = migrateSettings({ provider: 'bridge', bridge: { agent: 'opencode' }, model: 'claude-opus-5-5' });
    expect(out.model).toBeUndefined();
    expect(out.bridge.models).toBeUndefined();
  });

  it('keeps a valid opencode model on the bridge agent slot', () => {
    const out = migrateSettings({ provider: 'bridge', bridge: { agent: 'opencode' }, model: 'opencode-go/deepseek-v4.1-flash' });
    expect(out.model).toBeUndefined();
    expect(out.bridge.models.opencode).toBe('opencode-go/deepseek-v4.1-flash');
  });

  it('moves openai and ollama models to their own providers', () => {
    expect(migrateSettings({ provider: 'openai', model: 'gpt-4o-mini' }).openai.model).toBe('gpt-4o-mini');
    expect(migrateSettings({ provider: 'ollama', model: 'llama3.2' }).ollama.model).toBe('llama3.2');
  });

  it('is a no-op when there is no legacy model', () => {
    const raw = { provider: 'anthropic', anthropic: { model: 'claude-opus-5-5' } };
    expect(migrateSettings(raw)).toEqual(raw);
  });
});

describe('loadSettings applies the migration', () => {
  it('reads old stored settings and strips the global model', () => {
    globalThis.localStorage = mockLocalStorage({
      provider: 'bridge',
      bridge: { agent: 'opencode' },
      model: 'claude-opus-5-5',
    });
    const settings = loadSettings();
    expect(settings.model).toBeUndefined();
    expect(settings.bridge.models.opencode).toBe('');
    expect(settings.bridge.models.claude).toBe('');
  });

  it('saveSettings also strips a legacy top-level model', () => {
    saveSettings({ provider: 'anthropic', model: 'claude-opus-5-5' });
    const stored = JSON.parse(globalThis.localStorage.getItem(SETTINGS_KEY));
    expect(stored.model).toBeUndefined();
    expect(stored.anthropic.model).toBe('claude-opus-5-5');
  });
});

describe('activeModel / bridgeAgentModel', () => {
  it('reads only the selected agent slot for the bridge', () => {
    const settings = {
      provider: 'bridge',
      bridge: { agent: 'opencode', models: { opencode: 'opencode-go/deepseek-v4.1-flash', claude: '' } },
      anthropic: { model: 'claude-opus-5-5' },
    };
    expect(activeModel(settings)).toBe('opencode-go/deepseek-v4.1-flash');
    expect(bridgeAgentModel(settings, 'claude')).toBe('');
  });

  it('reads only the provider slot for API providers', () => {
    expect(activeModel({ provider: 'anthropic', anthropic: { model: 'claude-opus-5-5' } })).toBe('claude-opus-5-5');
    expect(activeModel({ provider: 'ollama', ollama: { model: 'llama3.2' } })).toBe('llama3.2');
    expect(activeModel({})).toBe('');
  });
});
