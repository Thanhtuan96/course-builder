/**
 * @vitest-environment node
 *
 * RON-266 — the published CLI (`course-professor import`) resolves its module graph from
 * `bin/commands/import.js` inside the packed tarball, where Studio-only dependencies such as `zod`
 * are not installed. The repository module used to import the zod-backed exercise spec statically,
 * which broke the tarball smoke with ERR_MODULE_NOT_FOUND.
 *
 * This test walks the graph Node evaluates at import time (static `import`/`export … from`/
 * `require`, not `await import(...)` inside a function) and fails if it reaches zod or the exercise
 * spec module. The exercise functions keep their `await import('../exercises/spec.js')`, which is
 * only evaluated when the CLI never calls them.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = join(ROOT, 'bin/commands/import.js');
const REPO = join(ROOT, 'studio/src/lib/repo/index.js');
const SPEC = join(ROOT, 'studio/src/lib/exercises/spec.js');

// Static module edges only. A dynamic `import('…')` runs when the enclosing function is called, so
// it is deliberately not part of the tarball-import graph.
const STATIC_IMPORT_RE =
  /(?:^|\n)\s*(?:import|export)\b[^'"()]*?\bfrom\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]|(?:^|[^\w.])require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

const ZOD_SPECIFIER = /^zod(\/.*)?$/;
const STATIC_ZOD =
  /\bfrom\s*['"]zod(?:\/[^'"]*)?['"]|^\s*import\s*['"]zod(?:\/[^'"]*)?['"]|\brequire\s*\(\s*['"]zod(?:\/[^'"]*)?['"]\s*\)/m;

/** @param {string} file */
function staticImportsOf(file) {
  const text = readFileSync(file, 'utf8');
  const specs = new Set();
  for (const match of text.matchAll(STATIC_IMPORT_RE)) {
    specs.add(match[1] || match[2] || match[3]);
  }
  return { text, specs: [...specs] };
}

/** @param {string} fromFile @param {string} specifier */
function resolveRelative(fromFile, specifier) {
  const base = resolve(dirname(fromFile), specifier);
  for (const candidate of [base, `${base}.js`, `${base}.jsx`, join(base, 'index.js')]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      /* not this candidate */
    }
  }
  return null;
}

/**
 * Every file Node loads when the CLI entry point is imported.
 * @param {string} entry
 * @returns {Map<string, { text: string, specs: string[] }>}
 */
function cliStaticGraph(entry) {
  const graph = new Map();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.shift();
    if (graph.has(file)) continue;
    const { text, specs } = staticImportsOf(file);
    graph.set(file, { text, specs });
    for (const spec of specs) {
      if (!spec.startsWith('.')) continue;
      const target = resolveRelative(file, spec);
      if (target && !graph.has(target)) queue.push(target);
    }
  }
  return graph;
}

describe('RON-266 CLI: tarball-safe module graph', () => {
  const graph = cliStaticGraph(ENTRY);

  it('walks the CLI entry point down to the repository module', () => {
    expect(graph.size).toBeGreaterThan(5);
    expect([...graph.keys()]).toContain(REPO);
  });

  it('RON-266 CLI: the import module graph never resolves zod', () => {
    const offenders = [];
    for (const [file, { specs }] of graph) {
      for (const spec of specs) {
        if (ZOD_SPECIFIER.test(spec)) offenders.push(`${file.replace(`${ROOT}/`, '')} -> ${spec}`);
      }
    }
    expect(offenders, `zod is reachable from the CLI: ${offenders.join(', ')}`).toEqual([]);
    expect([...graph.keys()]).not.toContain(SPEC);
    for (const [file, { text }] of graph) {
      expect(STATIC_ZOD.test(text), `${file.replace(`${ROOT}/`, '')} imports zod`).toBe(false);
    }
  });

  it('RON-266 CLI: the repository loads the exercise spec lazily', () => {
    const repo = graph.get(REPO);
    expect(repo).toBeDefined();
    // No static `import … from '…/exercises/spec.js'`: only the `await import(...)` inside the
    // exercise write function the CLI never calls.
    expect(repo.text).not.toMatch(/^\s*import\s[^;]*from\s*['"][^'"]*exercises\/spec\.js['"]/m);
    expect(repo.text).toMatch(/await import\(['"]\.\.\/exercises\/spec\.js['"]\)/);
  });
});
