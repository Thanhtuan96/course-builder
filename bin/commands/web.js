/**
 * bin/commands/web.js — the `course-professor web` command.
 *
 * Studio-only by default: no API-key discovery/prompt and no `.env`, keychain or agent-home scan.
 * Legacy mode is the explicit opt-in (`--legacy` or `PROFESSOR_LEGACY=1`) and keeps the old
 * Anthropic/OpenAI fallback prompt. The server itself owns legacy-dev Vite startup (D-08).
 */
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import inquirer from 'inquirer';
import ora from 'ora';
import { buildPairingUrl } from './studio.js';
import * as security from '../../web/security.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const DEFAULT_PORT = '3000';

/** True when `pkg` resolves from `dir` (or an ancestor `node_modules`, e.g. the package root). */
function canResolveFrom(dir, pkg) {
  try {
    createRequire(join(dir, 'index.js')).resolve(pkg);
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse `web` flags and the single positional port. The port is returned as a **string** (or `null`
 * when absent) so existing callers can pass it through unchanged; unknown flags never become a port.
 *
 * @param {string[]} [args]
 * @returns {{ legacy: boolean, production: boolean, cloud: boolean, rotateToken: boolean,
 *             port: string|null }}
 */
export function parseWebArgs(args = []) {
  const list = Array.isArray(args) ? args : [];
  let port = null;
  for (const arg of list) {
    if (typeof arg !== 'string' || arg.startsWith('--')) continue;
    if (port === null) port = arg;
  }
  return {
    legacy: list.includes('--legacy'),
    production: list.includes('--production'),
    cloud: list.includes('--cloud'),
    rotateToken: list.includes('--rotate-token'),
    port,
  };
}

/**
 * User-facing UI port. Legacy dev is served by Vite on 5173; every other mode serves the UI on the
 * API port (Studio-only or legacy production).
 *
 * @param {{ legacy?: boolean, production?: boolean, port?: string|null }} [opts]
 * @returns {string}
 */
export function resolveWebUiPort({ legacy = false, production = false, port = null } = {}) {
  if (legacy && !production) return '5173';
  return port || DEFAULT_PORT;
}

/**
 * @param {{ args: string[], cwd: string, chalk: any, style: (kind: string, text: string) => string,
 *           startServerImpl?: Function }} ctx
 */
export async function run({ args = [], style, startServerImpl } = {}) {
  const { execSync } = await import('child_process');
  const webDir = join(REPO_ROOT, 'web');
  const options = parseWebArgs(args);
  const isProduction = options.production;
  const legacy = options.legacy || process.env.PROFESSOR_LEGACY === '1';
  const cloudOnly = options.cloud;

  if (!existsSync(webDir)) {
    console.error(style('error', 'Web UI not found. Ensure the package is fully installed.'));
    process.exit(1);
  }

  if (isProduction) process.env.NODE_ENV = 'production';
  if (legacy) process.env.PROFESSOR_LEGACY = '1';

  const positionalPort =
    options.port || (!isProduction ? process.env.PORT : null) || DEFAULT_PORT;

  let rotatedToken = null;
  if (options.rotateToken) {
    try {
      rotatedToken = security.rotateStudioToken({ env: process.env });
    } catch (err) {
      console.error(
        style('error', err.code === 'env_token_immutable' ? err.message : `Could not rotate token: ${err.message}`)
      );
      throw err;
    }
    const startRequested = options.legacy || options.production || options.cloud || options.port !== null;
    const { pairingUrl } = buildPairingUrl({
      studioPort: resolveWebUiPort({ legacy, production: isProduction, port: positionalPort }),
      apiPort: positionalPort,
      token: rotatedToken,
    });
    console.log('');
    console.log(`   Pairing token: ${security.maskToken(rotatedToken)}`);
    console.log(`   Pairing URL:   ${pairingUrl}`);
    console.log('');
    if (!startRequested) return null;
  }

  if (isProduction) {
    if (legacy) {
      const distPath = join(webDir, 'client', 'dist');
      if (!existsSync(distPath)) {
        console.error(style('warning', 'Production build not found.'));
        console.error('   From repo root: npm run build');
        console.error('   Then: npx course-professor web --legacy --production');
        process.exit(1);
      }
    } else {
      const studioIndex = join(REPO_ROOT, 'studio', 'dist', 'index.html');
      if (!existsSync(studioIndex)) {
        console.error(style('warning', 'Studio build not found.'));
        console.error('   Run: npx course-professor studio');
        console.error('   Or:  npm run build:studio');
        process.exit(1);
      }
    }
  }

  // `express`/`cors` are root dependencies, so an installed package needs no nested install.
  if (!canResolveFrom(webDir, 'express') && !existsSync(join(webDir, 'node_modules'))) {
    const spinner = ora('Installing web dependencies…').start();
    try {
      execSync('npm install', { cwd: webDir, stdio: 'pipe' });
      spinner.succeed('Web dependencies installed.');
    } catch (err) {
      spinner.fail('Web dependencies failed.');
      const message = String(err?.message || err);
      if (err?.code === 'EACCES' || /EACCES|permission denied|read-only/i.test(message)) {
        console.error(style('error',
          'Cannot install web dependencies: the package directory is read-only (npx cache). ' +
          'Install globally (`npm i -g course-professor`) or run from a git clone.'));
      } else {
        console.error(style('error', `Check your network and try: cd ${webDir} && npm install`));
      }
      process.exit(1);
    }
  }

  const clientDir = join(webDir, 'client');
  if (legacy && !isProduction && existsSync(clientDir) && !existsSync(join(clientDir, 'node_modules'))) {
    const spinner = ora('Installing client dependencies…').start();
    try {
      execSync('npm install', { cwd: clientDir, stdio: 'pipe' });
      spinner.succeed('Client dependencies installed.');
    } catch {
      spinner.fail('Client dependencies failed.');
      console.error(style('error', `Check your network and try: cd ${clientDir} && npm install`));
      process.exit(1);
    }
  }

  async function findApiKey() {
    if (process.env.ANTHROPIC_API_KEY) return { key: process.env.ANTHROPIC_API_KEY, source: 'env' };
    if (process.env.CLAUDE_API_KEY)    return { key: process.env.CLAUDE_API_KEY,    source: 'env' };
    if (process.env.OPENAI_API_KEY)    return { key: process.env.OPENAI_API_KEY,    source: 'env' };

    const envFile = join(process.cwd(), '.env');
    if (existsSync(envFile)) {
      try {
        const lines = readFileSync(envFile, 'utf-8').split('\n');
        for (const line of lines) {
          const m = line.match(/^(ANTHROPIC_API_KEY|CLAUDE_API_KEY|OPENAI_API_KEY)\s*=\s*(.+)$/);
          if (m) return { key: m[2].trim().replace(/^["']|["']$/g, ''), source: '.env' };
        }
      } catch {}
    }

    if (process.platform === 'darwin') {
      try {
        const { execSync: _exec } = await import('child_process');
        for (const svc of ['anthropic-api-key', 'Anthropic API Key', 'ANTHROPIC_API_KEY']) {
          try {
            const raw = _exec(`security find-generic-password -s "${svc}" -w`, {
              encoding: 'utf-8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'],
            }).trim();
            if (raw?.startsWith('sk-ant-api')) return { key: raw, source: `keychain:${svc}` };
          } catch {}
        }
      } catch {}
    }

    const home = process.env.HOME || '';
    for (const p of [
      join(home, '.claude', 'settings.json'),
      join(home, '.anthropic', 'config.json'),
    ]) {
      if (existsSync(p)) {
        try {
          const s = JSON.parse(readFileSync(p, 'utf-8'));
          const k = s.ANTHROPIC_API_KEY || s.apiKey || s.api_key;
          if (k) return { key: k, source: p };
        } catch {}
      }
    }
    return null;
  }

  function hasLocalProvider() {
    for (const cmd of ['claude', 'ollama', 'cursor-agent', 'opencode']) {
      try {
        execSync(`which ${cmd}`, { stdio: 'ignore' });
        return true;
      } catch {}
    }
    return false;
  }

  if (legacy) {
    let found = await findApiKey();
    const localProviderAvailable = hasLocalProvider();
    const shouldPromptForApiKey = cloudOnly || !localProviderAvailable;
    if (!found && shouldPromptForApiKey) {
      if (!process.stdin.isTTY) {
        console.log(style('info', 'No API key. Chat disabled.\n'));
      } else {
        console.log('');
        console.log(style('info', 'No Anthropic API key detected.'));
        console.log('   Get one at: https://console.anthropic.com/settings/keys');
        console.log('   (Key will be saved to .env if you paste one; otherwise chat will be disabled.)');
        console.log('');
        const { apiKeyInput } = await inquirer.prompt([{
          type: 'input',
          name: 'apiKeyInput',
          message: 'Paste your API key (or press Enter to skip):',
        }]);
        const trimmed = (apiKeyInput || '').trim();
        if (trimmed && trimmed.startsWith('sk-')) {
          const envPath = join(process.cwd(), '.env');
          const line = `ANTHROPIC_API_KEY=${trimmed}\n`;
          try {
            const existing = existsSync(envPath) ? readFileSync(envPath, 'utf-8') : '';
            if (!existing.includes('ANTHROPIC_API_KEY')) {
              writeFileSync(envPath, existing + line);
              console.log(`   ${style('success', "Saved to .env — won't ask again.")}\n`);
            }
          } catch {}
          found = { key: trimmed, source: '.env (just saved)' };
        } else {
          console.log('   Skipping. Chat disabled.\n');
        }
      }
    }

    const apiKey = found?.key;
    if (apiKey) {
      console.log(style('success', `API key loaded (${found.source}).\n`));
      process.env.ANTHROPIC_API_KEY = apiKey;
    } else if (localProviderAvailable) {
      console.log(style('info', 'No API key found. Local providers will be used when available.\n'));
    }
  }

  process.env.PORT = positionalPort;

  let defaultCourses = './courses';
  if (existsSync('./courses')) {
    if (readdirSync('./courses').length === 0) defaultCourses = './learning';
  } else if (existsSync('./learning')) {
    defaultCourses = './learning';
  }
  process.env.COURSES_DIR = process.env.COURSES_DIR || defaultCourses;

  const token =
    rotatedToken ||
    security.ensureStudioToken({
      env: process.env,
      legacyFile: security.legacyTokenPath(REPO_ROOT),
    });
  const expectedUiPort = resolveWebUiPort({
    legacy,
    production: isProduction,
    port: positionalPort,
  });

  const mode = isProduction ? 'production' : 'development';
  console.log('');
  console.log(style('info', 'Starting Professor Web UI…'));
  console.log(`   Mode: ${mode} | Port: ${positionalPort} | Courses: ${process.env.COURSES_DIR}`);
  console.log(`   Pairing token: ${security.maskToken(token)}`);

  const loadServer = startServerImpl || (await import(join(webDir, 'server.js'))).startServer;
  const started = await loadServer({
    legacy,
    port: positionalPort,
    host: process.env.HOST,
    logBanner: false,
  });
  const uiUrl = started?.uiUrl || `http://localhost:${expectedUiPort}`;
  const uiPort = (() => {
    try {
      return new URL(uiUrl).port || expectedUiPort;
    } catch {
      return expectedUiPort;
    }
  })();
  const { pairingUrl } = buildPairingUrl({
    studioPort: uiPort,
    apiPort: positionalPort,
    token,
  });
  console.log(`   UI:            ${uiUrl}`);
  console.log(`   Pairing URL:   ${pairingUrl}`);
  console.log('');
  return started;
}
