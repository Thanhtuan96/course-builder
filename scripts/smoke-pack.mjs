#!/usr/bin/env node
/**
 * smoke-pack.mjs — end-to-end tarball smoke test (REL-04).
 *
 * Proves that what `npm publish` would ship actually works when installed by a stranger:
 *
 *   1. build both bundles (legacy client + Studio) so the tarball is complete
 *   2. `npm pack` → install the .tgz into a fresh temp project (`npm init -y && npm i <tgz>`)
 *   3. run, against a throwaway `PROFESSOR_HOME`:
 *        course-professor --help            → usage
 *        course-professor doctor            → env checklist
 *        course-professor status            → empty state is fine
 *        course-professor import --all --dry-run (from a fixture dir) → plans an import
 *        course-professor studio --no-open --port <p> --api-port <a>
 *            GET  studio URL                → 200 HTML (the shipped studio/dist)
 *            GET  /api/studio/health        → 200 with the pairing token
 *            GET  /api/studio/db/health     → sqlite + migrations applied (shipped migrations)
 *          then stop the server.
 *
 * Any failing step aborts with a non-zero exit and a clear message. Set SMOKE_SKIP_BUILD=1 to
 * pack an already-built tree (used by CI after an explicit build step).
 */
import { spawn, spawnSync } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const STUDIO_PORT = Number(process.env.SMOKE_STUDIO_PORT || 5197);
const API_PORT = Number(process.env.SMOKE_API_PORT || 3019);
const TOKEN = 'smoke-token-0123456789abcdef';
const HEALTH_TIMEOUT_MS = 60000;

// Phase 2 supplies these two assets; plan 04-01 adds the matching package.json `files` entries.
// The real tarball smoke is intentionally deferred until Phase 2 merges (nothing is stubbed here).
const REQUIRED_PACKED_FILES = ['web/security.js', 'web/legacy-server.js'];
const TOKEN_BASENAME = '.studio-token';

const require = createRequire(import.meta.url);

/**
 * Flatten `npm pack --json` output into the list of packed file entries.
 *
 * @param {object|object[]} raw parsed npm output (real packs are arrays; dry runs can be objects)
 * @returns {{ path: string, size?: number, mode?: number }[]} flat file entries with a string path
 */
export function normalizePackEntries(raw) {
  const entries = Array.isArray(raw) ? raw : [raw];
  return entries
    .flatMap((entry) => entry?.files ?? [])
    .filter((file) => typeof file?.path === 'string');
}

/**
 * Check a normalized packlist for required security assets and a leaked pairing token.
 *
 * @param {({ path: string }|string)[]} files packed file entries or plain paths
 * @returns {{ missing: string[], leaked: string[] }} required paths absent from the packlist and
 *   packed paths whose basename is `.studio-token`
 */
export function checkPacklist(files) {
  const paths = new Set(
    files.map((file) => (typeof file === 'string' ? file : file?.path)).filter(Boolean)
  );
  const missing = REQUIRED_PACKED_FILES.filter((required) => !paths.has(required));
  const leaked = [...paths].filter((packed) => basename(packed) === TOKEN_BASENAME);
  return { missing, leaked };
}


let stepNo = 0;
function step(title) {
  stepNo += 1;
  console.log(`\n── [${stepNo}] ${title}`);
}

function fail(message) {
  console.error(`\n✗ SMOKE FAILED: ${message}`);
  process.exit(1);
}

function runSync(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    encoding: 'utf-8',
    stdio: opts.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    ...opts,
  });
  if (res.error) fail(`${cmd} ${args.join(' ')} could not start: ${res.error.message}`);
  if (res.status !== 0) {
    const detail = opts.capture ? `\n--- stdout ---\n${res.stdout}\n--- stderr ---\n${res.stderr}` : '';
    fail(`${cmd} ${args.join(' ')} exited ${res.status}${detail}`);
  }
  return res;
}

function runCli(cliPath, args, { cwd, env }) {
  return runSync(process.execPath, [cliPath, ...args], {
    cwd,
    env,
    capture: true,
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Count migrations that were applied to the Studio DB (proves studio/migrations was shipped). */
function countAppliedMigrations(dbPath) {
  try {
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      return db.prepare('SELECT COUNT(*) AS n FROM d1_migrations').get().n;
    } finally {
      db.close();
    }
  } catch (err) {
    fail(`could not read migrations from ${dbPath}: ${err.message}`);
  }
}

async function waitForHealth(url, token, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = 'no response';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { headers: { 'X-Studio-Token': token } });
      if (res.ok) return res;
      last = `HTTP ${res.status}`;
    } catch (err) {
      last = err.message;
    }
    await sleep(400);
  }
  fail(`Studio did not become healthy at ${url} (${last})`);
}

const workDirs = [];
function mkWorkTemp(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  workDirs.push(dir);
  return dir;
}

let studioChild = null;
let tgzPath = null;

function cleanup() {
  if (studioChild && studioChild.exitCode === null) {
    try { studioChild.kill('SIGTERM'); } catch { /* already gone */ }
    try { studioChild.kill('SIGKILL'); } catch { /* already gone */ }
  }
  if (tgzPath) {
    try { rmSync(tgzPath, { force: true }); } catch { /* ignore */ }
  }
  for (const dir of workDirs) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

async function main() {
  if (!process.env.SMOKE_SKIP_BUILD) {
    step('Build legacy client + Studio bundles');
    runSync('npm', ['run', 'build'], { cwd: REPO_ROOT });
    runSync('npm', ['run', 'build:studio'], { cwd: REPO_ROOT });
  }

  if (!existsSync(join(REPO_ROOT, 'studio', 'dist', 'index.html'))) {
    fail('studio/dist/index.html is missing — the tarball would not contain Studio. Run `npm run build:studio`.');
  }

  step('npm pack');
  const pack = runSync('npm', ['pack', '--json'], { cwd: REPO_ROOT, capture: true });
  let parsed;
  try {
    parsed = JSON.parse(pack.stdout);
  } catch {
    fail(`could not parse \`npm pack --json\` output:\n${pack.stdout}`);
  }
  const packEntries = Array.isArray(parsed) ? parsed : [parsed];
  let filename;
  try {
    filename = packEntries.at(-1).filename;
  } catch {
    fail(`could not read the packed filename from \`npm pack --json\` output:\n${pack.stdout}`);
  }
  if (!filename) fail(`\`npm pack --json\` returned no filename:\n${pack.stdout}`);
  tgzPath = join(REPO_ROOT, filename);
  console.log(`   packed ${filename}`);

  step('Verify the packlist includes the Phase 2 security assets and no pairing token');
  const packedFiles = normalizePackEntries(parsed);
  const packlist = checkPacklist(packedFiles);
  for (const missing of packlist.missing) {
    fail(
      `packed tarball is missing ${missing}. Add it to package.json "files" and rebuild. ` +
        'Phase 2 supplies the file contents; this smoke is deferred until that phase merges.'
    );
  }
  if (packlist.leaked.length > 0) {
    fail(`pairing token would be published: ${packlist.leaked.join(', ')}`);
  }
  console.log(`   ${packedFiles.length} files; both security assets present; no token path`);

  step('Install the tarball into a fresh temp project');
  const projectDir = mkWorkTemp('professor-smoke-project-');
  runSync('npm', ['init', '-y'], { cwd: projectDir, capture: true });
  runSync('npm', ['install', tgzPath, '--no-audit', '--no-fund'], { cwd: projectDir, capture: true });

  const pkgDir = join(projectDir, 'node_modules', 'course-professor');
  const cliPath = join(pkgDir, 'bin', 'cli.js');
  if (!existsSync(cliPath)) fail(`installed CLI not found at ${cliPath}`);

  const professorHome = mkWorkTemp('professor-smoke-home-');
  const env = { ...process.env, PROFESSOR_HOME: professorHome, STUDIO_BRIDGE_TOKEN: TOKEN, NO_COLOR: '1' };

  step('course-professor --help');
  const help = runCli(cliPath, ['--help'], { cwd: projectDir, env });
  if (!/Usage: course-professor/.test(help.stdout)) fail('`--help` did not print usage');
  console.log('   ok');

  step('course-professor doctor');
  const doctor = runCli(cliPath, ['doctor'], { cwd: projectDir, env });
  if (!/Professor doctor/.test(doctor.stdout)) fail('`doctor` did not print the checklist');
  console.log('   ok');

  step('course-professor status (empty — must not error)');
  runCli(cliPath, ['status'], { cwd: projectDir, env });
  console.log('   ok');

  step('course-professor import --all --dry-run (fixture course)');
  const fixtureDir = mkWorkTemp('professor-smoke-courses-');
  const courseDir = join(fixtureDir, 'learning', 'smoke-course');
  mkdirSync(courseDir, { recursive: true });
  writeFileSync(
    join(courseDir, 'COURSE.md'),
    [
      '# Course: Smoke Course',
      '',
      '**Kind**: conceptual',
      '**Level**: beginner',
      '**Goal**: Verify the packaged CLI can plan an import.',
      '',
      '## Syllabus',
      '',
      '- 🔄 Section 1: Hello World',
      '- ⬜ Section 2: Goodbye World',
      '',
    ].join('\n')
  );
  const imported = runCli(cliPath, ['import', '--all', '--dry-run'], { cwd: fixtureDir, env });
  if (!/Would import/.test(imported.stdout)) {
    fail(`\`import --dry-run\` did not plan an import:\n${imported.stdout}`);
  }
  console.log('   ok');

  step(`course-professor studio --no-open --port ${STUDIO_PORT} --api-port ${API_PORT}`);
  studioChild = spawn(
    process.execPath,
    [cliPath, 'studio', '--no-open', '--port', String(STUDIO_PORT), '--api-port', String(API_PORT)],
    { cwd: projectDir, env, stdio: ['ignore', 'pipe', 'pipe'] }
  );
  let serverLog = '';
  studioChild.stdout.on('data', (d) => { serverLog += d.toString(); });
  studioChild.stderr.on('data', (d) => { serverLog += d.toString(); });
  studioChild.on('exit', (code, signal) => {
    if (code && code !== 0 && code !== null) {
      console.error(`   studio exited early: code=${code} signal=${signal}\n${serverLog}`);
    }
  });

  const healthUrl = `http://localhost:${API_PORT}/api/studio/health`;
  await waitForHealth(healthUrl, TOKEN, HEALTH_TIMEOUT_MS);
  console.log('   health endpoint responded');

  const studioUrl = `http://localhost:${STUDIO_PORT}/`;
  const page = await fetch(studioUrl);
  const html = await page.text();
  if (page.status !== 200) fail(`Studio URL returned ${page.status}`);
  if (!/text\/html/.test(page.headers.get('content-type') || '')) {
    fail(`Studio URL content-type was ${page.headers.get('content-type')} (expected text/html)`);
  }
  if (!/<html[\s>]/i.test(html)) fail('Studio URL did not return HTML');
  console.log(`   GET ${studioUrl} → 200 HTML`);

  const health = await (await fetch(healthUrl, { headers: { 'X-Studio-Token': TOKEN } })).json();
  if (health.ok !== true) fail(`/api/studio/health not ok: ${JSON.stringify(health)}`);
  console.log(`   GET /api/studio/health → ok`);

  const dbHealthRes = await fetch(`http://localhost:${API_PORT}/api/studio/db/health`, {
    headers: { 'X-Studio-Token': TOKEN },
  });
  if (dbHealthRes.status !== 200) fail(`/api/studio/db/health returned ${dbHealthRes.status}`);
  const dbHealth = await dbHealthRes.json();
  if (dbHealth.kind !== 'sqlite') fail(`db/health kind was ${dbHealth.kind} (expected sqlite)`);
  if (typeof dbHealth.schemaVersion !== 'number') {
    fail(`db/health schemaVersion was not a number: ${JSON.stringify(dbHealth)}`);
  }
  // `schemaVersion` is derived from the applied migration ledger (the highest `d1_migrations`
  // prefix); what this smoke test really needs to prove is that the shipped `studio/migrations/*.sql`
  // were applied. We assert that directly by counting the rows in the migration ledger (5 ship today).
  const applied = countAppliedMigrations(join(professorHome, 'professor.db'));
  if (applied < 5) {
    fail(`only ${applied} migration(s) applied from the tarball (expected >= 5). Is studio/migrations shipped?`);
  }
  console.log(`   GET /api/studio/db/health → kind=sqlite schemaVersion=${dbHealth.schemaVersion} migrationsApplied=${applied}`);

  step('Stop Studio');
  studioChild.kill('SIGTERM');
  await new Promise((resolve) => {
    if (studioChild.exitCode !== null) return resolve();
    studioChild.once('exit', resolve);
    setTimeout(() => { try { studioChild.kill('SIGKILL'); } catch { /* ignore */ } resolve(); }, 8000);
  });
  studioChild = null;
  console.log('   stopped');

  console.log('\n✓ SMOKE PASSED — the packed tarball installs and runs cleanly.');
}

const invokedDirectly =
  Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  try {
    await main();
  } catch (err) {
    fail(err?.stack || String(err));
  } finally {
    cleanup();
  }
}
