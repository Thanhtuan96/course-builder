/**
 * Settings & secrets (AI-03).
 *
 * Everything here lives in localStorage under `professor-studio:settings` and never enters
 * repository exports/backups — the repository has no settings table at all, so keys cannot leak.
 */
import { useCallback, useEffect, useState } from 'react';

export const SETTINGS_KEY = 'professor-studio:settings';

export const DEFAULT_PROVIDER = 'anthropic';

export const DEFAULT_SETTINGS = {
  provider: DEFAULT_PROVIDER,
  model: '',
  anthropic: { apiKey: '', model: 'claude-opus-5-5' },
  openai: {
    preset: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
  },
  ollama: { baseUrl: 'http://localhost:11434/v1', model: 'llama3.2' },
  bridge: { bridgeUrl: 'http://localhost:3000', bridgeToken: '', agent: '' },
  learnerName: '',
  language: 'English',
  onboardingDone: false,
};

const listeners = new Set();

function deepMerge(base, patch) {
  const out = { ...base };
  for (const [key, value] of Object.entries(patch || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = deepMerge(base?.[key] || {}, value);
    } else if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

function read() {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? deepMerge(DEFAULT_SETTINGS, JSON.parse(raw)) : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** @returns {typeof DEFAULT_SETTINGS} */
export function loadSettings() {
  return read();
}

/**
 * Merge a patch into stored settings and notify subscribers.
 * @param {object} patch
 * @returns {typeof DEFAULT_SETTINGS}
 */
export function saveSettings(patch) {
  const next = deepMerge(read(), patch);
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch {
      /* storage full — settings will simply not persist */
    }
  }
  for (const fn of listeners) fn(next);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('professor:settings', { detail: next }));
  return next;
}

/** Remove every API key / token, keeping provider preferences. */
export function clearSecrets() {
  return saveSettings({
    anthropic: { apiKey: '' },
    openai: { apiKey: '' },
    bridge: { bridgeToken: '' },
  });
}

/** @param {(settings: typeof DEFAULT_SETTINGS) => void} fn */
export function subscribeSettings(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** React binding: [settings, update]. */
export function useSettings() {
  const [settings, setSettings] = useState(read);
  useEffect(() => {
    const off = subscribeSettings(setSettings);
    const onStorage = (e) => {
      if (e.key === SETTINGS_KEY) setSettings(read());
    };
    window.addEventListener('storage', onStorage);
    return () => {
      off();
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  const update = useCallback((patch) => saveSettings(patch), []);
  return [settings, update];
}

/** The model id the active provider should use. */
export function activeModel(settings) {
  return settings.model || settings[settings.provider]?.model || '';
}
