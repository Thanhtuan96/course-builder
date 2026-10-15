/**
 * JavaScript / TypeScript runner worker (CODE-02).
 *
 * Runs the entry module with a tiny CommonJS loader so sibling workspace files can `require`
 * (or `import`, converted by `esmToCjs`) each other. Captures `console.*`, and records
 * `console.assert(...)` / `check(name, fn)` self-checks without aborting on the first failure.
 *
 * Protocol (main → worker): `{ type: 'run', files, entry, language }`
 *          (worker → main): `{ type: 'stdout'|'stderr', text }`, `{ type: 'checks', checks }`,
 *                           `{ type: 'done', exitCode }`, `{ type: 'error', message }`
 */
import { stripTypes } from '../lib/runner/strip-types.js';
import { esmToCjs } from '../lib/runner/esm-cjs.js';
import { languageForPath } from '../lib/runner/languages.js';

self.onmessage = (event) => {
  const msg = event.data || {};
  if (msg.type !== 'run') return;
  run(msg).catch((err) => {
    post({ type: 'stderr', text: `${err && err.message ? err.message : err}\n` });
    post({ type: 'done', exitCode: 1 });
  });
};

/** @param {any} data */
function post(data) {
  self.postMessage(data);
}

/**
 * @param {{ files?: Record<string,string>, entry?: string }} msg
 */
async function run({ files = {}, entry = null }) {
  const sources = {};
  for (const [path, content] of Object.entries(files)) sources[norm(path)] = String(content ?? '');
  const entryPath = norm(entry || Object.keys(sources)[0] || 'main.js');
  if (sources[entryPath] === undefined) throw new Error(`Entry file not found: ${entryPath}`);

  const checks = [];
  const pendingChecks = [];
  let assertIndex = 0;

  const check = (name, fn) => {
    const label = String(name || `check #${checks.length + 1}`);
    let result;
    try {
      result = typeof fn === 'function' ? fn() : fn;
    } catch (err) {
      checks.push({ name: label, passed: false, message: err?.message || String(err) });
      return false;
    }
    if (result && typeof result.then === 'function') {
      pendingChecks.push(
        result.then(
          (value) => checks.push({ name: label, passed: value !== false, message: value === false ? 'returned false' : undefined }),
          (err) => checks.push({ name: label, passed: false, message: err?.message || String(err) })
        )
      );
      return undefined;
    }
    const passed = result !== false;
    checks.push({ name: label, passed, message: passed ? undefined : 'returned false' });
    return passed;
  };

  const sandboxConsole = {
    log: (...args) => post({ type: 'stdout', text: `${args.map(fmt).join(' ')}\n` }),
    info: (...args) => post({ type: 'stdout', text: `${args.map(fmt).join(' ')}\n` }),
    debug: (...args) => post({ type: 'stdout', text: `${args.map(fmt).join(' ')}\n` }),
    table: (...args) => post({ type: 'stdout', text: `${args.map(fmt).join(' ')}\n` }),
    dir: (...args) => post({ type: 'stdout', text: `${args.map(fmt).join(' ')}\n` }),
    warn: (...args) => post({ type: 'stderr', text: `${args.map(fmt).join(' ')}\n` }),
    error: (...args) => post({ type: 'stderr', text: `${args.map(fmt).join(' ')}\n` }),
    trace: (...args) => post({ type: 'stderr', text: `${args.map(fmt).join(' ')}\n` }),
    time: () => {},
    timeEnd: () => {},
    assert: (condition, ...args) => {
      assertIndex += 1;
      const message = args.length ? args.map(fmt).join(' ') : `console.assert #${assertIndex}`;
      checks.push({ name: message, passed: Boolean(condition), message: condition ? undefined : message });
      return Boolean(condition);
    },
  };

  const moduleCache = new Map();

  function resolve(fromPath, spec) {
    if (!spec.startsWith('.') && !spec.startsWith('/')) {
      throw new Error(`Cannot load "${spec}" in the browser. Only sibling workspace files can be imported — use the local runner for packages.`);
    }
    const base = fromPath.split('/').slice(0, -1);
    const parts = [...base];
    for (const seg of spec.split('/')) {
      if (seg === '' || seg === '.') continue;
      if (seg === '..') parts.pop();
      else parts.push(seg);
    }
    const joined = parts.join('/');
    if (sources[joined] !== undefined) return joined;
    for (const ext of ['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx']) {
      if (sources[joined + ext] !== undefined) return joined + ext;
    }
    throw new Error(`Module not found: ${spec} (imported from ${fromPath})`);
  }

  function requireModule(fromPath, spec) {
    const target = resolve(fromPath, spec);
    const cached = moduleCache.get(target);
    if (cached) return cached.exports;
    const module = { exports: {}, __esModule: false };
    moduleCache.set(target, module);
    const source = transform(sources[target], languageForPath(target));
    const factory = new Function(
      'module',
      'exports',
      'require',
      '__module',
      '__interop',
      'console',
      'check',
      `${source}\n//# sourceURL=professor-workspace/${target}`
    );
    factory(
      module,
      module.exports,
      (s) => requireModule(target, s),
      module,
      interop,
      sandboxConsole,
      check
    );
    return module.exports;
  }

  const entryModule = { exports: {}, __esModule: false };
  const factory = new Function(
    'module',
    'exports',
    'require',
    '__module',
    '__interop',
    'console',
    'check',
    `${transform(sources[entryPath], languageForPath(entryPath))}\n//# sourceURL=professor-workspace/${entryPath}`
  );
  factory(
    entryModule,
    entryModule.exports,
    (s) => requireModule(entryPath, s),
    entryModule,
    interop,
    sandboxConsole,
    check
  );

  if (pendingChecks.length) await Promise.all(pendingChecks);
  if (checks.length) post({ type: 'checks', checks });
  post({ type: 'done', exitCode: 0 });
}

/**
 * @param {string} source
 * @param {string|null} language
 */
function transform(source, language) {
  let code = source;
  if (language === 'typescript') {
    try {
      code = stripTypes(code);
    } catch (err) {
      throw new Error(`TypeScript transform failed: ${err?.message || err}`);
    }
  }
  return esmToCjs(code);
}

/** @param {string} path */
function norm(path) {
  return String(path || '').replace(/^\.\//, '').replace(/\\/g, '/');
}

/** @param {any} value */
function fmt(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return String(value);
  if (value === undefined) return 'undefined';
  if (typeof value === 'function') return `[Function: ${value.name || 'anonymous'}]`;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** @param {any} mod */
function interop(mod) {
  return mod && mod.__esModule ? mod.default : mod;
}
