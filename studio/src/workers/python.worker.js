/**
 * Python runner worker (CODE-02) — Pyodide, loaded lazily from the official CDN on first run.
 *
 * The ~10 MB runtime is intentionally NOT bundled: it is fetched only when a Python lesson is
 * actually run (see PYODIDE_VERSION, pinned to the `pyodide` npm package version). `input()` is
 * disabled with a readable message. `assert` self-checks are rewritten to recorded, non-aborting
 * checks (CODE-03) by `instrumentPython`.
 *
 * Protocol mirrors js.worker.js, plus `{ type: 'status', text }` while the runtime downloads.
 */
import { instrumentPython } from '../lib/runner/checks.js';

/** Pinned to the `pyodide` npm package version inspected for this phase. */
const PYODIDE_VERSION = '314.0.7';
const PYODIDE_CDN = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const WORKDIR = '/home/pyodide/workspace';

let pyodidePromise = null;

function getPyodide() {
  if (!pyodidePromise) {
    pyodidePromise = (async () => {
      post({ type: 'status', text: `Downloading the Python runtime (Pyodide v${PYODIDE_VERSION})…` });
      const mod = await import(/* @vite-ignore */ `${PYODIDE_CDN}pyodide.mjs`);
      const py = await mod.loadPyodide({ indexURL: PYODIDE_CDN });
      py.setStdout({ batched: (text) => post({ type: 'stdout', text }) });
      py.setStderr({ batched: (text) => post({ type: 'stderr', text }) });
      return py;
    })().catch((err) => {
      pyodidePromise = null;
      throw err;
    });
  }
  return pyodidePromise;
}

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

const PREAMBLE = `
import builtins, json as __json, sys as __sys, os as __os
__checks = []
def __check(name, thunk, message=None, expr=None):
    try:
        value = thunk()
    except Exception as err:
        __checks.append({"name": name, "passed": False, "message": repr(err)})
        return
    if value:
        __checks.append({"name": name, "passed": True})
    else:
        __checks.append({"name": name, "passed": False, "message": message or ("assert failed: " + (expr or name))})
def __disabled_input(*args, **kwargs):
    raise RuntimeError("input() is not available in the browser — set the values you want to test directly in the code.")
builtins.input = __disabled_input
__os.makedirs(${JSON.stringify(WORKDIR)}, exist_ok=True)
if ${JSON.stringify(WORKDIR)} not in __sys.path:
    __sys.path.insert(0, ${JSON.stringify(WORKDIR)})
`;

/**
 * @param {{ files?: Record<string,string>, entry?: string }} msg
 */
async function run({ files = {}, entry = null }) {
  const py = await getPyodide();
  const paths = Object.keys(files).map((p) => String(p).replace(/\\/g, '/'));
  const entryPath = String(entry || paths[0] || 'main.py').replace(/\\/g, '/');

  // Make sibling files importable from the entry script (schema/helper modules).
  for (const path of paths) {
    if (path === entryPath) continue;
    const dir = `${WORKDIR}/${path.split('/').slice(0, -1).join('/')}`;
    py.FS.mkdirTree(dir);
    py.FS.writeFile(`${WORKDIR}/${path}`, String(files[path] ?? ''));
  }

  await py.runPythonAsync(PREAMBLE);

  const source = instrumentPython(String(files[entryPath] ?? '')).code;
  try {
    await py.runPythonAsync(source, { filename: entryPath });
  } catch (err) {
    const message = err?.message ? String(err.message) : String(err);
    // Pyodide surfaces a Python traceback on stderr already; keep the tail as the exit reason.
    post({ type: 'stderr', text: `${message}\n` });
    post({ type: 'checks', checks: readChecks(py) });
    post({ type: 'done', exitCode: 1 });
    return;
  }

  const checks = readChecks(py);
  if (checks.length) post({ type: 'checks', checks });
  post({ type: 'done', exitCode: 0 });
}

/** @param {any} py */
function readChecks(py) {
  try {
    const json = py.runPython('__json.dumps(__checks)');
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
