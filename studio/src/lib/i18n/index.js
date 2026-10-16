/**
 * Tiny UI i18n layer (LANG-02). No dependencies.
 *
 *   const t = useT();          // inside a component, re-renders when the language changes
 *   t('home.title')
 *   t('review.cardOf', { n: 2, total: 5 })
 *   t('common.cards', { count: 3 })   // "3 cards" / "1 card" via the "one|other" form
 *
 * Catalogs are plain JSON (`en.json`, `vi.json`). The active learning language is
 * `settings.language` (a BCP-47 code); missing keys fall back to English, then to the key itself.
 */
import { useCallback } from 'react';
import { useSettings } from '../settings.js';
import { DEFAULT_LANGUAGE, normalizeLanguage } from './languages.js';
import en from './en.json';
import vi from './vi.json';

const CATALOGS = { en, vi };

/** Languages that currently ship a UI catalog. Others fall back to English. */
export const UI_LANGUAGES = Object.keys(CATALOGS);

let currentLanguage = DEFAULT_LANGUAGE;

/** @param {unknown} code */
export function setLanguage(code) {
  currentLanguage = normalizeLanguage(code);
  return currentLanguage;
}

/** @returns {string} the active UI language code */
export function getLanguage() {
  return currentLanguage;
}

function lookup(catalog, key) {
  const parts = String(key).split('.');
  let node = catalog;
  for (const part of parts) {
    if (node == null || typeof node !== 'object') return undefined;
    node = node[part];
  }
  return node;
}

/**
 * Pick the plural/plain variant of a value.
 * A value may be a string with a `one|other` form (used with `params.count`) or an object
 * `{ one, other }`. Anything else is returned unchanged.
 * @param {unknown} value
 * @param {Record<string, any>} params
 */
function selectVariant(value, params) {
  if (typeof value === 'string' && value.includes('|')) {
    const [one, other] = value.split('|');
    return params?.count === 1 ? one : other;
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (params?.count === 0 && value.zero != null) return value.zero;
    return params?.count === 1 ? value.one : value.other;
  }
  return value;
}

/** Replace `{name}` tokens; unknown params are left as-is. */
function interpolate(template, params) {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    params[name] === undefined || params[name] === null ? match : String(params[name])
  );
}

/**
 * Resolve a key against an explicit language (used by tests and non-React code).
 * @param {string} language
 * @param {string} key
 * @param {Record<string, any>} [params]
 * @returns {string}
 */
export function translate(language, key, params = {}) {
  const code = normalizeLanguage(language);
  const catalog = CATALOGS[code] || CATALOGS[DEFAULT_LANGUAGE];
  let value = selectVariant(lookup(catalog, key), params);
  if (typeof value !== 'string') {
    value = selectVariant(lookup(CATALOGS[DEFAULT_LANGUAGE], key), params);
  }
  if (typeof value !== 'string') return key;
  return interpolate(value, params);
}

/**
 * Translate using the module-level language (set with `setLanguage`, or by `useT`).
 * @param {string} key
 * @param {Record<string, any>} [params]
 */
export function t(key, params) {
  return translate(currentLanguage, key, params);
}

/** The list of keys present in a catalog (for the coverage test). */
export function catalogKeys(language) {
  const catalog = CATALOGS[normalizeLanguage(language)] || {};
  const out = [];
  const walk = (node, prefix) => {
    for (const [k, v] of Object.entries(node || {})) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, key);
      else out.push(key);
    }
  };
  walk(catalog, '');
  return out;
}

/**
 * React binding: returns a `t` bound to the current learning language and re-renders when it
 * changes (settings live-update through `useSettings`).
 * @returns {(key: string, params?: Record<string, any>) => string}
 */
export function useT() {
  const [settings] = useSettings();
  const language = normalizeLanguage(settings?.language);
  currentLanguage = language;
  return useCallback((key, params) => translate(language, key, params), [language]);
}
