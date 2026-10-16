/**
 * Migration integrity (QA-04).
 *
 * Guards the `studio/migrations/` directory so released migrations can never silently change:
 *   1. filenames have unique numeric prefixes (no duplicate `000N_`),
 *   2. prefixes are contiguous from 0001 with no gaps,
 *   3. the released-manifest pins a contiguous prefix of migrations (never an unreleased one),
 *   4. every released migration (0001–0004) matches its committed SHA-256.
 *
 * When a new migration is released, add its filename → SHA-256 to
 * `test/fixtures/migrations.sha256.json` in the same change.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'studio', 'migrations');
const MANIFEST_PATH = join(__dirname, 'fixtures', 'migrations.sha256.json');

const migrationFiles = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort();

/** Numeric prefix of a migration filename (`0001_init.sql` → 1), or null when malformed. */
function prefixOf(file) {
  const m = /^(\d+)_/.exec(file);
  return m ? Number(m[1]) : null;
}

/** SHA-256 of a migration file in `studio/migrations/`. */
function sha256(file) {
  return createHash('sha256').update(readFileSync(join(MIGRATIONS_DIR, file))).digest('hex');
}

describe('studio/migrations', () => {
  it('ships at least one migration', () => {
    expect(migrationFiles.length).toBeGreaterThan(0);
  });

  it('gives every migration a unique numeric prefix', () => {
    const prefixes = migrationFiles.map(prefixOf);
    expect(prefixes.every((p) => Number.isInteger(p)), `malformed migration filename in ${migrationFiles.join(', ')}`).toBe(true);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });

  it('numbers migrations contiguously from 0001', () => {
    const prefixes = migrationFiles.map(prefixOf).sort((a, b) => a - b);
    const expected = prefixes.map((_, i) => i + 1);
    expect(prefixes).toEqual(expected);
  });

  it('pins only a contiguous released prefix (never an unreleased migration)', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
    const released = Object.keys(manifest).map(prefixOf).sort((a, b) => a - b);
    const all = migrationFiles.map(prefixOf).sort((a, b) => a - b);
    expect(released.length).toBeGreaterThan(0);
    expect(released.length).toBeLessThanOrEqual(all.length);
    expect(released).toEqual(all.slice(0, released.length));
  });

  it('never lets a released migration change content', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
    for (const [file, hash] of Object.entries(manifest)) {
      const full = join(MIGRATIONS_DIR, file);
      expect(existsSync(full), `released migration is missing: ${file}`).toBe(true);
      expect(sha256(file), `released migration was edited: ${file}`).toBe(hash);
    }
  });
});
