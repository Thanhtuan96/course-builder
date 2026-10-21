/**
 * @vitest-environment node
 *
 * DEBT-02 — per-namespace catalogs: every language carries the same namespace files, each namespace
 * has identical keys in both languages, and a brand-new namespace merges without editing index.js.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalogKeys, mergeCatalogModules, translate } from '../src/lib/i18n/index.js';

const I18N = dirname(fileURLToPath(import.meta.url)).replace(/\/test$/, '/src/lib/i18n');
const LANGS = ['en', 'vi'];

// The namespaces Phase 6 shipped. Wave 2 adds new pairs; this is a subset assertion on purpose so
// adding a namespace never requires editing this shared test.
const REQUIRED_NAMESPACES = [
  'common',
  'nav',
  'durability',
  'app',
  'onboarding',
  'home',
  'newCourse',
  'course',
  'lesson',
  'reflection',
  'practice',
  'tutor',
  'capstone',
  'settings',
  'provider',
  'providerMeta',
  'data',
  'storage',
  'workspace',
  'errors',
];

function namespaceFiles(lang) {
  return readdirSync(join(I18N, lang))
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.slice(0, -'.json'.length))
    .sort();
}

function flattenKeys(value, prefix = '') {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => flattenKeys(child, prefix ? `${prefix}.${key}` : key));
}

function readNamespace(lang, namespace) {
  return JSON.parse(readFileSync(join(I18N, lang, `${namespace}.json`), 'utf8'));
}

describe('i18n namespace split', () => {
  it('ships the same namespace files in every language', () => {
    const en = namespaceFiles('en');
    const vi = namespaceFiles('vi');
    expect(vi, `namespaces only in en: ${vi.filter((n) => !en.includes(n)).join(', ')}`).toEqual(en);
    expect(en).toEqual(expect.arrayContaining(REQUIRED_NAMESPACES));
  });

  it('keeps every namespace key-identical across languages', () => {
    const en = namespaceFiles('en');
    const vi = namespaceFiles('vi');
    for (const namespace of [...new Set([...en, ...vi])]) {
      const enKeys = flattenKeys(readNamespace('en', namespace)).sort();
      const viKeys = flattenKeys(readNamespace('vi', namespace)).sort();
      const onlyEn = enKeys.filter((key) => !viKeys.includes(key));
      const onlyVi = viKeys.filter((key) => !enKeys.includes(key));
      expect(onlyEn, `only in en/${namespace}.json: ${onlyEn.join(', ')}`).toEqual([]);
      expect(onlyVi, `only in vi/${namespace}.json: ${onlyVi.join(', ')}`).toEqual([]);
    }
  });

  it('keeps the global catalog key sets identical', () => {
    const en = new Set(catalogKeys('en'));
    const vi = new Set(catalogKeys('vi'));
    expect([...en].filter((key) => !vi.has(key))).toEqual([]);
    expect([...vi].filter((key) => !en.has(key))).toEqual([]);
  });

  it('resolves the errors namespace from its own file in both languages', () => {
    expect(translate('en', 'errors.bad_json')).toBe(readNamespace('en', 'errors').bad_json);
    expect(translate('vi', 'errors.bad_json')).toBe(readNamespace('vi', 'errors').bad_json);
    expect(catalogKeys('en')).toContain('errors.unknown');
  });

  it('auto-merges a namespace that does not exist on disk without editing index.js', () => {
    const merged = mergeCatalogModules({
      './en/brandNew.json': { default: { greeting: 'Hello' } },
      './vi/brandNew.json': { default: { greeting: 'Xin chào' } },
      './not-a-namespace.json': { default: { ignored: true } },
      './en/deep/nested.json': { default: { ignored: true } },
    });
    expect(merged.en.brandNew.greeting).toBe('Hello');
    expect(merged.vi.brandNew.greeting).toBe('Xin chào');
    expect(merged.en).not.toHaveProperty('not-a-namespace');
    expect(merged.en).not.toHaveProperty('deep');
  });
});
