#!/usr/bin/env node

// Registry helpers (extracted for testability)
import {
  fetchRegistryText,
  fetchRegistryIndex,
  style,
  validateItemName,
  resolveScope,
  confirmOverwrite,
  installSkill,
  installCourse,
} from './registry-helpers.js';

import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, statSync, mkdtempSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SUPPORTED_AGENTS = ['claude', 'gemini', 'opencode', 'cursor'];

// ─── Agent / setup helpers ────────────────────────────────────────────────────

async function detectAgent() {
  const detected = [];
  for (const name of SUPPORTED_AGENTS) {
    try {
      const { detect } = await import(`./platforms/${name}.js`);
      if (detect()) detected.push(name);
    } catch {}
  }
  return detected;
}

async function promptScope(platform) {
  if (!process.stdin.isTTY) {
    console.error(style('error', 'Non-interactive mode. Run with --local or --global.'));
    process.exit(1);
  }
  const globalPath = {
    claude:   '~/.claude/plugins/professor/',
    gemini:   '~/GEMINI.md',
    opencode: '~/.opencode/professor.md',
    cursor:   '~/.cursor/rules/professor.mdc',
  }[platform] || '~/';

  const { scope } = await inquirer.prompt([{
    type: 'list',
    name: 'scope',
    message: `Install scope for ${platform}:`,
    choices: [
      { name: `Global — ${globalPath} (available in all projects)`, value: 'global' },
      { name: 'Local — current project only', value: 'local' },
    ],
    default: 'local',
  }]);
  return scope;
}

async function setupAgent(agent) {
  const agentLower = agent.toLowerCase();
  if (!SUPPORTED_AGENTS.includes(agentLower)) {
    console.error(style('error', `Unsupported agent: ${agent}. Supported: ${SUPPORTED_AGENTS.join(', ')}. Run 'course-professor list' for details.`));
    process.exit(1);
  }
  const scope = isGlobal ? 'global' : isLocal ? 'local' : await promptScope(agentLower);
  const { install } = await import(`./platforms/${agentLower}.js`);
  await install(scope);
}

async function promptAgentSelection(agents) {
  if (!process.stdin.isTTY) {
    console.error(style('error', 'Non-interactive mode. Run with: course-professor setup <agent> --local or --global'));
    process.exit(1);
  }
  const { agent } = await inquirer.prompt([{
    type: 'list',
    name: 'agent',
    message: 'Which agent would you like to set up?',
    choices: agents.map((a) => ({ name: a, value: a })),
  }]);
  return agent;
}

async function init() {
  const detected = await detectAgent();
  if (detected.length === 0) {
    console.log(style('info', 'No agent detected automatically.\n'));
    const choice = await promptAgentSelection(SUPPORTED_AGENTS);
    await setupAgent(choice);
    return;
  }
  if (detected.length === 1) {
    console.log(style('info', `Detected: ${detected[0]}\n`));
    await setupAgent(detected[0]);
    return;
  }
  console.log(style('info', `Multiple agents detected: ${detected.join(', ')}\n`));
  const choice = await promptAgentSelection(detected);
  await setupAgent(choice);
}

// ─── CLI entry point ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const isGlobal = args.includes('--global');
const isLocal  = args.includes('--local');
const isForce  = args.includes('--force');
const command  = args[0] || 'help';

switch (command) {

  case 'web': {
    const { execSync } = await import('child_process');
    const webDir = join(__dirname, '..', 'web');

    if (!existsSync(webDir)) {
      console.error(style('error', 'Web UI not found. Ensure the package is fully installed.'));
      process.exit(1);
    }

    const isProduction = args.includes('--production');
    if (isProduction) process.env.NODE_ENV = 'production';

    if (isProduction) {
      const distPath = join(webDir, 'client', 'dist');
      if (!existsSync(distPath)) {
        console.error(style('warning', 'Production build not found.'));
        console.error('   From repo root: npm run build');
        console.error('   Then: npx course-professor web --production');
        process.exit(1);
      }
    }

    if (!existsSync(join(webDir, 'node_modules'))) {
      const spinner = ora('Installing web dependencies…').start();
      try {
        execSync('npm install', { cwd: webDir, stdio: 'pipe' });
        spinner.succeed('Web dependencies installed.');
      } catch {
        spinner.fail('Web dependencies failed.');
        console.error(style('error', `Check your network and try: cd ${webDir} && npm install`));
        process.exit(1);
      }
    }

    const clientDir = join(webDir, 'client');
    if (!isProduction && existsSync(clientDir) && !existsSync(join(clientDir, 'node_modules'))) {
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

    let found = await findApiKey();
    if (!found) {
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
    }

    let port = '3000';
    if (!isProduction) port = args[1] || process.env.PORT || '3000';
    else if (args[1] && args[1] !== '--production') port = args[1];
    process.env.PORT = port;

    let defaultCourses = './courses';
    if (existsSync('./courses')) {
      if (readdirSync('./courses').length === 0) defaultCourses = './learning';
    } else if (existsSync('./learning')) {
      defaultCourses = './learning';
    }
    process.env.COURSES_DIR = process.env.COURSES_DIR || defaultCourses;

    const mode = isProduction ? 'production' : 'development';
    console.log('');
    console.log(style('info', 'Starting Professor Web UI…'));
    console.log(`   Mode: ${mode} | Port: ${port} | Courses: ${process.env.COURSES_DIR}`);
    console.log('');
    await import(join(webDir, 'server.js'));
    break;
  }

  case 'init':
  case 'setup': {
    printBanner();
    console.log('');
    const agentArg = args.slice(1).find((a) => !a.startsWith('--'));
    if (agentArg) {
      await setupAgent(agentArg);
    } else {
      await init();
    }
    break;
  }

  case 'courses': {
    const spinner = ora('Fetching registry…').start();
    try {
      const index = await fetchRegistryIndex();
      spinner.stop();
      const courses = index.courses || [];
      if (courses.length === 0) { console.log('No courses found in registry.'); break; }
      const nw = Math.max(4, ...courses.map((c) => c.name.length));
      const tw = Math.max(5, ...courses.map((c) => c.title.length));
      const lw = Math.max(5, ...courses.map((c) => (c.level || '').length));
      const header = `${'Name'.padEnd(nw)}  ${'Title'.padEnd(tw)}  ${'Level'.padEnd(lw)}  Sections`;
      console.log('\n' + chalk.bold(header));
      console.log(chalk.dim('─'.repeat(header.length)));
      for (const c of courses) {
        console.log(`${c.name.padEnd(nw)}  ${c.title.padEnd(tw)}  ${(c.level || '').padEnd(lw)}  ${c.sections}`);
      }
      console.log('');
    } catch {
      spinner.fail('Registry fetch failed.');
    }
    break;
  }

  case 'search': {
    const keyword = args.slice(1).find((a) => !a.startsWith('--'));
    if (!keyword) {
      console.error(style('error', 'Usage: course-professor search <keyword>'));
      process.exit(1);
    }
    const spinner = ora('Searching registry…').start();
    try {
      const index = await fetchRegistryIndex();
      spinner.stop();
      const q = keyword.toLowerCase();
      const matches = (index.courses || []).filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.title || '').toLowerCase().includes(q) ||
          (c.description || '').toLowerCase().includes(q) ||
          (c.topics || []).some((t) => t.toLowerCase().includes(q))
      );
      if (matches.length === 0) { console.log(`No courses found matching "${keyword}".`); break; }
      for (const c of matches) {
        console.log(`\n${chalk.bold(c.name)}  ${chalk.dim(`(${c.level}, ${c.sections} sections)`)}`);
        console.log(`  ${c.title}`);
        console.log(`  ${chalk.dim(c.description)}`);
      }
      console.log('');
    } catch {
      spinner.fail('Registry fetch failed.');
    }
    break;
  }

  case 'install': {
    const isSkill = args.includes('--skill');
    const itemName = args.slice(1).find((a) => !a.startsWith('--'));
    if (!itemName) {
      console.error(style('error', 'Usage: course-professor install <name>'));
      console.error('       course-professor install --skill <name>   — install a skill instead');
      console.error('       course-professor courses                  — list available courses');
      process.exit(1);
    }
    validateItemName(itemName);

    const index = await fetchRegistryIndex();
    if (isSkill) {
      const scope = await resolveScope(itemName, 'skill', { isGlobal, isLocal });
      await installSkill(itemName, scope, { force: isForce, index });
    } else {
      await installCourse(itemName, { force: isForce, index });
    }
    break;
  }

  // ── TASK 2: new commands ─────────────────────────────────────────────────

  case 'update': {
    const isUpdateAll = args.includes('--all');
    const itemName = !isUpdateAll ? args.slice(1).find((a) => !a.startsWith('--')) : null;

    if (isUpdateAll) {
      // Update all installed skills
      const spinner = ora('Fetching registry…').start();
      let index;
      try {
        index = await fetchRegistryIndex();
      } catch {
        spinner.fail('Registry fetch failed.');
        process.exit(1);
      }
      spinner.stop();

      const localDir  = join(process.cwd(), '.claude', 'skills');
      const globalDir = join(os.homedir(), '.claude', 'skills');
      const scopes = isGlobal ? [['global', globalDir]] :
                     isLocal  ? [['local',  localDir]]  :
                               [['local', localDir], ['global', globalDir]];

      const results = { updated: 0, skipped: 0, failed: 0 };
      for (const [scope, dir] of scopes) {
        if (!existsSync(dir)) continue;
        let entries;
        try { entries = readdirSync(dir); } catch { continue; }
        for (const name of entries) {
          const skillDir = join(dir, name);
          if (!statSync(skillDir).isDirectory()) continue;
          if (!existsSync(join(skillDir, 'SKILL.md'))) continue;
          try {
            const skill = (index.skills || []).find((s) => s.name === name);
            if (!skill) {
              console.log(style('warning', `Skipped ${name}: not found in registry.`));
              results.skipped++;
              continue;
            }
            await installSkill(name, scope, { force: true, index });
            results.updated++;
          } catch (err) {
            console.log(style('warning', `Failed ${name}: ${err.message}`));
            results.failed++;
          }
        }
      }
      console.log(style('info', `Updated: ${results.updated} | Skipped: ${results.skipped} | Failed: ${results.failed}`));
      if (results.updated === 0) {
        console.error(style('error', 'No skills updated — all were manually installed or registry unavailable.'));
        process.exit(1);
      }
    } else {
      // Update a single skill
      if (!itemName) {
        console.error(style('error', 'Usage: course-professor update <skill-name>'));
        process.exit(1);
      }
      validateItemName(itemName);
      const scope = await resolveScope(itemName, 'skill', { isGlobal, isLocal });

      const destDir = scope === 'global'
        ? join(os.homedir(), '.claude', 'skills', itemName)
        : join(process.cwd(), '.claude', 'skills', itemName);

      if (!existsSync(join(destDir, 'SKILL.md'))) {
        console.error(style('error', `Skill "${itemName}" not installed. Run: course-professor install --skill ${itemName}`));
        process.exit(1);
      }

      const spinner = ora('Fetching registry…').start();
      let index;
      try {
        index = await fetchRegistryIndex();
      } catch {
        spinner.fail('Registry fetch failed.');
        process.exit(1);
      }
      spinner.stop();

      await installSkill(itemName, scope, { force: true, index });
    }
    break;
  }

  case 'installed': {
    const localDir  = join(process.cwd(), '.claude', 'skills');
    const globalDir = join(os.homedir(), '.claude', 'skills');

    /** @type {{ name: string; title: string; version: string; scope: string; path: string }[]} */
    const rows = [];

    for (const [scope, dir] of [['local', localDir], ['global', globalDir]]) {
      if (!existsSync(dir)) continue;
      let entries;
      try { entries = readdirSync(dir); } catch { continue; }
      for (const name of entries) {
        const skillDir = join(dir, name);
        if (!statSync(skillDir).isDirectory()) continue;
        if (!existsSync(join(skillDir, 'SKILL.md'))) continue;
        let title = name, version = '—';
        const metaPath = join(skillDir, 'meta.json');
        if (existsSync(metaPath)) {
          try {
            const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
            title   = meta.title   || name;
            version = meta.version || '—';
          } catch {}
        }
        rows.push({ name, title, version, scope, path: skillDir });
      }
    }

    if (rows.length === 0) {
      console.log(style('info', 'No skills installed. Run: course-professor search'));
      break;
    }

    const nw = Math.max(4, ...rows.map((r) => r.name.length));
    const tw = Math.max(5, ...rows.map((r) => r.title.length));
    const vw = Math.max(7, ...rows.map((r) => r.version.length));
    const sw = Math.max(7, ...rows.map((r) => r.scope.length));

    const header = `${'Name'.padEnd(nw)}  ${'Title'.padEnd(tw)}  ${'Ver'.padEnd(vw)}  ${'Scope'.padEnd(sw)}  Path`;
    console.log('\n' + chalk.bold(header));
    console.log(chalk.dim('─'.repeat(header.length + 30)));
    for (const r of rows) {
      console.log(
        `${r.name.padEnd(nw)}  ${r.title.padEnd(tw)}  ${r.version.padEnd(vw)}  ${r.scope.padEnd(sw)}  ${r.path}`
      );
    }
    console.log('');
    break;
  }

  case 'remove': {
    const itemName = args.slice(1).find((a) => !a.startsWith('--'));
    if (!itemName) {
      console.error(style('error', 'Usage: course-professor remove <skill-name> [--local|--global] [--force]'));
      process.exit(1);
    }
    validateItemName(itemName);

    const localDir  = join(process.cwd(), '.claude', 'skills', itemName);
    const globalDir = join(os.homedir(), '.claude', 'skills', itemName);
    const localExists  = existsSync(join(localDir,  'SKILL.md'));
    const globalExists = existsSync(join(globalDir, 'SKILL.md'));

    if (!localExists && !globalExists) {
      console.error(style('error', `Skill "${itemName}" not found.`));
      process.exit(1);
    }

    // Resolve scope
    let removeScopes = [];
    if (isGlobal) {
      removeScopes = ['global'];
    } else if (isLocal) {
      removeScopes = ['local'];
    } else if (localExists && globalExists) {
      // Both — must choose
      if (!process.stdin.isTTY) {
        console.error(style('error', 'Skill found in both scopes. Use --local, --global, or --force --local/--global.'));
        process.exit(1);
      }
      const { choice } = await inquirer.prompt([{
        type: 'list',
        name: 'choice',
        message: `Skill "${itemName}" is installed in both scopes. Which to remove?`,
        choices: [
          { name: `Local (${localDir})`,  value: 'local' },
          { name: `Global (${globalDir})`, value: 'global' },
          { name: 'Both',                 value: 'both' },
        ],
      }]);
      removeScopes = choice === 'both' ? ['local', 'global'] : [choice];
    } else {
      removeScopes = [localExists ? 'local' : 'global'];
    }

    // --force without scope when in both = error
    if (isForce && !isGlobal && !isLocal && localExists && globalExists) {
      // Already handled above — but double-check
      if (removeScopes.length > 1 && !removeScopes.includes('local') && !removeScopes.includes('global')) {
        console.error(style('error', 'Skill found in both scopes. Use --local, --global, or --force --local/--global.'));
        process.exit(1);
      }
    }

    // Confirm (unless --force)
    if (!isForce) {
      const scopeLabels = removeScopes.map((s) =>
        s === 'local' ? localDir : globalDir
      ).join(' and ');
      const { confirmed } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirmed',
        message: `Remove skill "${itemName}" from ${scopeLabels}? (y/N)`,
        default: false,
      }]);
      if (!confirmed) {
        console.log('Aborted.');
        process.exit(0);
      }
    }

    for (const scope of removeScopes) {
      const dir = scope === 'local' ? localDir : globalDir;
      rmSync(dir, { recursive: true, force: true });
      console.log(style('success', `Removed ${itemName} from ${dir}`));
    }
    break;
  }

  case 'publish': {
    const {
      validateSourceCourse,
      validateSourceSkill,
      buildStagingDir,
      generateBrowserFallbackUrl,
      style,
    } = await import('./registry-helpers.js');

    const { execSync } = await import('child_process');

    // Parse args
    const isDryRun = args.includes('--dry-run');
    const isForce  = args.includes('--force');
    const typeIdx  = args.indexOf('--type');
    const typeArg  = typeIdx !== -1 ? args[typeIdx + 1] : null;
    const pathIdx  = args.indexOf('--path');
    const pathArg  = pathIdx !== -1 ? args[pathIdx + 1] : null;
    const nameArg  = args.find((a) => a.startsWith('--name='))?.split('=')[1];

    const sourceDir = pathArg || process.cwd();
    const slug      = nameArg || basename(sourceDir);

    // Auto-detect type
    let contentType = typeArg;
    if (!contentType) {
      const hasSkill  = existsSync(join(sourceDir, 'SKILL.md')) && existsSync(join(sourceDir, 'COMPLETION.md'));
      const hasCourse = existsSync(join(sourceDir, 'COURSE.md'));
      if (hasSkill && hasCourse) {
        console.error(style('error', 'Both course and skill detected. Use --type course|skill to specify.'));
        process.exit(1);
      }
      contentType = hasSkill ? 'skill' : hasCourse ? 'course' : null;
      if (!contentType) {
        console.error(style('error', 'No COURSE.md or SKILL.md found. Run from a course directory.'));
        process.exit(1);
      }
    }
    if (contentType !== 'course' && contentType !== 'skill') {
      console.error(style('error', '--type must be "course" or "skill".'));
      process.exit(1);
    }

    // Validate source
    const validator = contentType === 'course' ? validateSourceCourse(sourceDir) : validateSourceSkill(sourceDir);
    if (!validator.valid) {
      for (const err of validator.errors) console.error(style('error', err));
      process.exit(1);
    }

    // Build staging dir
    const stagingDir = buildStagingDir(contentType, slug, sourceDir);

    if (isDryRun) {
      console.log(style('info', `Dry run — packaged files at: ${stagingDir}`));
      console.log(style('info', 'Contents:'));
      for (const f of readdirSync(stagingDir)) console.log(`  - ${f}`);
      process.exit(0);
    }

    // gh availability check
    const ghAvailable = (() => {
      try {
        execSync('gh --version', { stdio: 'ignore' });
        return true;
      } catch { return false; }
    })();

    if (!ghAvailable) {
      const url = generateBrowserFallbackUrl(contentType, slug);
      console.log(style('warning', 'gh CLI not found — using browser fallback.'));
      console.log(`  Open this URL to create a PR manually:`);
      console.log(chalk.blue(`  ${url}`));
      console.log(style('info', `Your packaged files are at: ${stagingDir}`));
      console.log(style('info', 'Upload them to the PR after opening the browser.'));
      process.exit(0);
    }

    // gh auth check
    try { execSync('gh auth status', { stdio: 'ignore' }); } catch {
      const url = generateBrowserFallbackUrl(contentType, slug);
      console.log(style('warning', 'gh not authenticated — using browser fallback.'));
      console.log(chalk.blue(`  ${url}`));
      console.log(style('info', `Your packaged files are at: ${stagingDir}`));
      process.exit(0);
    }

    // Setup git credentials (Eng Decision 2 — use gh auth setup-git, not token URL injection)
    try {
      execSync('gh auth setup-git', { stdio: 'pipe' });
    } catch {
      console.error(style('error', 'gh auth setup-git failed. Run gh auth login first.'));
      process.exit(1);
    }

    // Fork
    const forkSpinner = ora('Forking registry…').start();
    try {
      execSync('gh repo fork professor-skills-hub/courses-skills-registry --clone=false', { stdio: 'pipe' });
      forkSpinner.succeed();
    } catch (err) {
      forkSpinner.fail();
      console.error(style('error', `Fork failed: ${err.message}`));
      process.exit(1);
    }

    // Clone fork to temp dir
    let forkUrl;
    try {
      const remoteOut = execSync('git remote get-url origin', { encoding: 'utf-8', stdio: 'pipe' });
      forkUrl = remoteOut.trim();
    } catch {
      forkSpinner.fail();
      console.error(style('error', 'Could not get fork URL. Is your fork ready?'));
      process.exit(1);
    }

    const tmpDir    = mkdtempSync(join(os.tmpdir(), 'professor-publish-'));
    const repoDir   = join(tmpDir, 'repo');
    const cloneSpinner = ora('Cloning fork…').start();
    try {
      execSync(`git clone --depth=1 "${forkUrl}" "${repoDir}"`, { stdio: 'pipe' });
      cloneSpinner.succeed();
    } catch (err) {
      cloneSpinner.fail();
      console.error(style('error', `Clone failed: ${err.message}`));
      rmSync(tmpDir, { recursive: true, force: true });
      process.exit(1);
    }

    // Copy files to destination dir
    const destDir = join(repoDir, contentType === 'course' ? 'courses' : 'skills', slug);
    mkdirSync(destDir, { recursive: true });
    for (const f of readdirSync(stagingDir)) {
      const src = join(stagingDir, f);
      if (statSync(src).isFile()) {
        writeFileSync(join(destDir, f), readFileSync(src));
      }
    }

    // Branch, commit, push
    const branch    = `contribute/${contentType}/${slug}`;
    const commitMsg = `Add ${contentType}: ${slug}`;
    try {
      execSync(`git checkout -b "${branch}"`,           { cwd: repoDir, stdio: 'pipe' });
      execSync(`git add . && git commit -m "${commitMsg}"`, { cwd: repoDir, stdio: 'pipe' });
      const pushFlags = isForce ? '-f' : '';
      execSync(`git push origin "${branch}" ${pushFlags}`.trim(), { cwd: repoDir, stdio: 'pipe' });
    } catch (err) {
      console.error(style('error', `Git push failed: ${err.message}`));
      rmSync(tmpDir, { recursive: true, force: true });
      process.exit(1);
    }

    // Create PR
    const prSpinner = ora('Creating PR…').start();
    let prUrl;
    try {
      const prJson = execSync(
        `gh pr create --json url --jq .url --title "${commitMsg}" --body "Published via course-professor publish."`,
        { cwd: repoDir, encoding: 'utf-8', stdio: 'pipe' }
      );
      prUrl = JSON.parse(prJson.trim()).url;
      prSpinner.succeed();
      console.log(style('success', `PR created: ${prUrl}`));
    } catch (err) {
      prSpinner.fail();
      console.error(style('error', `PR creation failed: ${err.message}`));
      rmSync(tmpDir, { recursive: true, force: true });
      process.exit(1);
    }

    // Cleanup
    rmSync(tmpDir,    { recursive: true, force: true });
    rmSync(stagingDir, { recursive: true, force: true });
    process.exit(0);
  }

  case 'list':
    console.log('\nSupported agents:\n');
    SUPPORTED_AGENTS.forEach((agent, i) => {
      console.log(`  ${i + 1}. ${agent}`);
    });
    console.log('\nUse course-professor setup <agent> to install.\n');
    break;

  case 'help':
  default:
    printBanner();
    console.log('');
    printUsage();
    break;
}

// ─── UI helpers (used by switch cases above) ─────────────────────────────────

function printBanner() {
  const c = chalk.cyan;
  const art = `
          _____                   _______                   _____
         /\\    \\                 /::\\    \\                 /\\    \\
        /::\\    \\               /::::\\    \\               /::\\    \\
       /::::\\    \\             /::::::\\    \\             /::::\\    \\
      /::::::\\    \\           /::::::::\\    \\           /::::::\\    \\
     /:::/\\:::\\    \\         /:::/~~\\:::\\    \\         /:::/\\:::\\    \\
    /:::/__\\:::\\    \\       /:::/    \\:::\\    \\       /:::/__\\:::\\    \\
    \\:::\\   \\:::\\    \\     /:::/    / \\:::\\    \\     /::::\\   \\:::\\    \\
  ___\\:::\\   \\:::\\    \\   /:::/____/   \\:::\\____\\   /::::::\\   \\:::\\    \\
 /\\   \\:::\\   \\:::\\    \\ |:::|    |     |:::|    | /:::/\\:::\\   \\:::\\ ___\\
/::\\   \\:::\\   \\:::\\____\\|:::|____|     |:::|____|/:::/__\\:::\\   \\:::|    |
\\:::\\   \\:::\\   \\::/    / \\:::\\   _\\___/:::/    / \\:::\\   \\:::\\  /:::|____|
 \\:::\\   \\:::\\   \\/____/   \\:::\\ |::| /:::/    /   \\:::\\   \\:::\\/:::/    /
  \\:::\\   \\:::\\    \\        \\:::\\|::|/:::/    /     \\:::\\   \\::::::/    /
   \\:::\\   \\:::\\____\\        \\::::::::::/    /       \\:::\\   \\::::/    /
    \\:::\\  /:::/    /         \\::::::::/    /         \\:::\\  /:::/    /
     \\:::\\/:::/    /           \\::::::/    /           \\:::\\/:::/    /
      \\::::::/    /             \\::::/____/             \\::::::/    /
       \\::::/    /               |::|    |               \\::::/    /
        \\::/____/                |::|____|                \\::/____/
         ~~                       ~~                       ~~`;
  const line = chalk.dim('─'.repeat(52));
  console.log(
    '\n' + line + '\n' + c(art.trimEnd()) + '\n\n' + chalk.cyan.dim('  ◆  skill quest builder  ◆') + '\n' + line + '\n'
  );
}

function printUsage() {
  console.log(`
Usage: course-professor [command] [options]

Description:
  Socratic learning assistant — teaches by asking questions. Set up for your
  agent (Claude Code, Gemini, OpenCode, Cursor) or start the web UI.

COMMANDS
  ${chalk.bold('setup')} [agent]        Set up Professor for a specific agent
  ${chalk.bold('init')}                 Auto-detect and set up
  ${chalk.bold('list')}                 List supported agents
  ${chalk.bold('courses')}              List all courses in the registry
  ${chalk.bold('search')} <keyword>     Search registry courses by keyword
  ${chalk.bold('install')} <name>          Install a course locally (→ learning/{name}/)
  ${chalk.bold('install')} --skill <name>  Install a skill locally (→ .claude/skills/{name}/)
  ${chalk.bold('update')} <skill-name>     Update an installed skill to the latest version
  ${chalk.bold('update')} --all             Update all installed skills
  ${chalk.bold('installed')}                List all installed skills
  ${chalk.bold('remove')} <skill-name>     Remove an installed skill
  ${chalk.bold('web')} [port]           Start local web UI (default port: 3000)
  ${chalk.bold('publish')} [options]     Publish a course or skill to the community registry
  ${chalk.bold('web')} --production     Start web UI in production mode (requires build)
  ${chalk.bold('help')}                 Show this help message

FLAGS
  --global          Target global scope (user-wide, e.g. ~/.claude/skills/)
  --local           Target local scope (current project, .claude/skills/)
  --force           Bypass overwrite/removal confirmation prompts
  --all             Apply to all items (update --all)

EXAMPLES
  npx course-professor init                    # Auto-detect and setup
  npx course-professor setup claude            # Setup for Claude Code (prompts for scope)
  npx course-professor setup claude --global   # Install globally
  npx course-professor courses                        # Browse community courses
  npx course-professor search react                   # Search for React courses
  npx course-professor install react-hooks            # Install course → learning/react-hooks/
  npx course-professor install --skill react-hooks-reviewer           # Install skill (prompts scope)
  npx course-professor install --skill react-hooks-reviewer --global  # Install skill globally
  npx course-professor update react-hooks-reviewer     # Update a skill
  npx course-professor update --all                    # Update all installed skills
  npx course-professor installed                        # List installed skills
  npx course-professor remove react-hooks-reviewer     # Remove a skill
  npx course-professor publish --dry-run                 # Preview packaged files (no GitHub)
  npx course-professor publish --type skill --name foo   # Publish a skill
  npx course-professor web                     # Start web UI on port 3000

SUPPORTED AGENTS
  ${SUPPORTED_AGENTS.join(', ')}
  `.trim());
}
