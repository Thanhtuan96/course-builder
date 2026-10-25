/**
 * Real Studio bridge process for the E2E run (RON-168).
 *
 * `web/server.js` is imported, not reimplemented: token guard, Origin allowlist, DB, runner and
 * agent spawn all stay the product's own code. The only test-specific inputs are an isolated temp
 * PROFESSOR_HOME, a fixed token, the Studio test origin and a fake `claude` first on PATH.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { startServer } from '../../web/server.js';
import {
  AUTH_DIR,
  BRIDGE_PORT,
  BRIDGE_TOKEN,
  FAKE_AGENT_DIR,
  HOST,
  PROFESSOR_HOME_MARKER,
  STUDIO_DIST,
  STUDIO_ORIGINS,
  TEST_RESULTS_DIR,
  createTempHome,
} from './env.js';

const basePath = process.env.PATH || '';
const home = createTempHome();
mkdirSync(TEST_RESULTS_DIR, { recursive: true });
mkdirSync(AUTH_DIR, { recursive: true });
writeFileSync(PROFESSOR_HOME_MARKER, home, 'utf8');

// `startServer` reads `process.env` for app config, but agent spawns in `agents.js` also read
// `process.env` directly (PATH/HOME). Set the same isolated values on both so no real agent CLI
// or user ~/.professor can ever be reached.
const bridgeEnv = {
  PORT: String(BRIDGE_PORT),
  HOST,
  NODE_ENV: 'production',
  // The suite tests the real local runner; bash is the only local toolchain guaranteed on macOS
  // and on Ubuntu CI. The bridge opt-in is explicit (never a product default).
  PROFESSOR_ALLOW_BASH: '1',
  PROFESSOR_HOME: home,
  STUDIO_BRIDGE_TOKEN: BRIDGE_TOKEN,
  STUDIO_ORIGINS,
  STUDIO_DIST,
  PATH: `${FAKE_AGENT_DIR}:${basePath}`,
};
Object.assign(process.env, bridgeEnv);

let started;
try {
  started = await startServer({
    env: process.env,
    log: (line) => console.log(`[e2e bridge] ${line}`),
  });
} catch (err) {
  console.error(`[e2e bridge] failed to start on ${HOST}:${BRIDGE_PORT}: ${err.message}`);
  process.exit(1);
}

console.log(`[e2e bridge] ${started.uiUrl} (health: ${started.uiUrl}/api/studio/health)`);

const shutdown = async () => {
  try {
    await started.close();
  } catch {
    /* ignore */
  }
  process.exit(0);
};

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
