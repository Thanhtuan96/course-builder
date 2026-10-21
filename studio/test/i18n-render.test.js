/**
 * @vitest-environment node
 *
 * DEBT-02 — rendering in one language must not mutate the i18n module's shared language state.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { SETTINGS_KEY } from '../src/lib/settings.js';
import { getLanguage, setLanguage, t, translate, useT } from '../src/lib/i18n/index.js';

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

function Title() {
  const tr = useT();
  return createElement('span', null, tr('home.title'));
}

afterEach(() => {
  delete globalThis.localStorage;
  setLanguage('en');
});

describe('useT render safety', () => {
  it('renders the settings language without changing the module language', () => {
    globalThis.localStorage = mockLocalStorage({ language: 'vi' });
    expect(getLanguage()).toBe('en');

    const html = renderToString(createElement(Title));

    expect(html).toContain(translate('vi', 'home.title'));
    expect(getLanguage()).toBe('en');
    expect(t('home.title')).toBe(translate('en', 'home.title'));
  });

  it('keeps an explicit setLanguage after rendering another language', () => {
    setLanguage('vi');
    globalThis.localStorage = mockLocalStorage({ language: 'en' });

    const html = renderToString(createElement(Title));

    expect(html).toContain(translate('en', 'home.title'));
    expect(getLanguage()).toBe('vi');
    expect(t('home.title')).toBe(translate('vi', 'home.title'));
  });
});
