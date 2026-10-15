/**
 * @vitest-environment node
 *
 * LANG-02 — every translation key used in `src/**` must exist in BOTH catalogs, and the two
 * catalogs must define exactly the same keys (no missing Vietnamese strings).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalogKeys } from '../src/lib/i18n/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', 'src');

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'i18n') continue; // the layer itself documents example keys
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...walk(full));
    else if (/\.(js|jsx)$/.test(entry)) out.push(full);
  }
  return out;
}

/** Keys passed as a literal first argument to `t(...)` anywhere under `src/`. */
function usedKeys() {
  const re = /\bt\(\s*['"]([^'"]+)['"]/g;
  const found = new Set();
  for (const file of walk(SRC)) {
    const text = readFileSync(file, 'utf8');
    let match;
    while ((match = re.exec(text)) !== null) found.add(match[1]);
  }
  return found;
}

describe('i18n catalogs', () => {
  const en = new Set(catalogKeys('en'));
  const vi = new Set(catalogKeys('vi'));
  const used = usedKeys();

  it('used keys exist in both en and vi', () => {
    const missingEn = [...used].filter((k) => !en.has(k));
    const missingVi = [...used].filter((k) => !vi.has(k));
    expect(missingEn, `missing from en.json: ${missingEn.join(', ')}`).toEqual([]);
    expect(missingVi, `missing from vi.json: ${missingVi.join(', ')}`).toEqual([]);
  });

  it('en and vi define the same keys', () => {
    const onlyEn = [...en].filter((k) => !vi.has(k));
    const onlyVi = [...vi].filter((k) => !en.has(k));
    expect(onlyEn, `only in en.json: ${onlyEn.join(', ')}`).toEqual([]);
    expect(onlyVi, `only in vi.json: ${onlyVi.join(', ')}`).toEqual([]);
  });
});
