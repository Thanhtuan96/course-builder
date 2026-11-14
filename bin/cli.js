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
  scanSkillDirs,
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
    gemini:   '~/.gemini/GEMINI.md',
    opencode: '~/.config/opencode/',
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
    console.error(style('error', `Unsupported agent: ${agent}. Supported: ${SUPPORTED_AGENTS.join(', ')}. Run 'skillforce list' for details.`));
    process.exit(1);
  }
  const scope = isGlobal ? 'global' : isLocal ? 'local' : await promptScope(agentLower);
  const { install } = await import(`./platforms/${agentLower}.js`);
  await install(scope);
}

async function promptAgentSelection(agents) {
  if (!process.stdin.isTTY) {
    console.error(style('error', 'Non-interactive mode. Run with: skillforce setup <agent> --local or --global'));
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

// Registry commands are beta until they work end to end. One notice, one place: printed to stderr
// so `--json` output stays machine-clean.
const BETA_COMMANDS = new Set(['courses', 'search', 'install', 'update', 'installed', 'remove', 'publish']);
if (BETA_COMMANDS.has(command)) {
  console.error(chalk.dim('[beta] Registry commands are in beta and may not work as expected.'));
}

function warnBrokenLink(name) {
  console.error(chalk.dim(`skipped ${name}: broken link`));
}

switch (command) {

  case 'web': {
    const { run } = await import('./commands/web.js');
    await run({ args: args.slice(1), cwd: process.cwd(), chalk, style });
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
    console.log(
      chalk.dim('\n  Studio: npx ronin-skillforce studio (Studio app + local bridge, Node 22.5+)')
    );
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
      console.error(style('error', 'Usage: skillforce search <keyword>'));
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
    const noImport = args.includes('--no-import');
    const itemName = args.slice(1).find((a) => !a.startsWith('--'));
    if (!itemName) {
      console.error(style('error', 'Usage: skillforce install <name>'));
      console.error('       skillforce install --skill <name>   — install a skill instead');
      console.error('       skillforce courses                  — list available courses');
      process.exit(1);
    }
    validateItemName(itemName);

    const index = await fetchRegistryIndex();
    if (isSkill) {
      const scope = await resolveScope(itemName, 'skill', { isGlobal, isLocal });
      await installSkill(itemName, scope, { force: isForce, index });
    } else {
      await installCourse(itemName, { force: isForce, index, importToStudio: !noImport });
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
        for (const skillDir of scanSkillDirs(dir, { onSkip: warnBrokenLink })) {
          const name = basename(skillDir);
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
        console.error(style('error', 'Usage: skillforce update <skill-name>'));
        process.exit(1);
      }
      validateItemName(itemName);
      const scope = await resolveScope(itemName, 'skill', { isGlobal, isLocal });

      const destDir = scope === 'global'
        ? join(os.homedir(), '.claude', 'skills', itemName)
        : join(process.cwd(), '.claude', 'skills', itemName);

      if (!existsSync(join(destDir, 'SKILL.md'))) {
        console.error(style('error', `Skill "${itemName}" not installed. Run: skillforce install --skill ${itemName}`));
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
      for (const skillDir of scanSkillDirs(dir, { onSkip: warnBrokenLink })) {
        const name = basename(skillDir);
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
      console.log(style('info', 'No skills installed. Run: skillforce search'));
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
      console.error(style('error', 'Usage: skillforce remove <skill-name> [--local|--global] [--force]'));
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
      validateItemName,
      validateSourceCourse,
      validateSourceSkill,
      buildStagingDir,
      buildCourseMetaJson,
      buildSkillMetaJson,
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

    // Parse metadata flags (collected interactively in professor:publish, passed through to CLI)
    const authorArg      = args.find((a) => a.startsWith('--author='))?.split('=')[1];
    const titleArg       = args.find((a) => a.startsWith('--title='))?.split('=')[1];
    const descArg        = args.find((a) => a.startsWith('--description='))?.split('=')[1];
    const topicsArg      = args.find((a) => a.startsWith('--topics='))?.split('=')[1];
    const levelArg       = args.find((a) => a.startsWith('--level='))?.split('=')[1];
    const originCourseArg = args.find((a) => a.startsWith('--origin-course='))?.split('=')[1];

    const sourceDir = pathArg || process.cwd();
    const slug      = nameArg || basename(sourceDir);

    // Guard: validate slug before use
    validateItemName(slug);
    // Sanitize slug to [a-z0-9-] for safe use in shell commands and branch names
    const safeSlug = slug.replace(/[^a-z0-9-]/gi, '-');

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

    // Build metadata from flags (collected interactively by professor:publish)
    const metaOverrides = contentType === 'course'
      ? { name: safeSlug, title: titleArg, description: descArg, author: authorArg, level: levelArg, topics: topicsArg?.split(',') }
      : { name: safeSlug, title: titleArg, description: descArg, author: authorArg, origin_course: originCourseArg, topics: topicsArg?.split(',') };
    const builtMeta = contentType === 'course'
      ? buildCourseMetaJson(sourceDir, metaOverrides)
      : buildSkillMetaJson(sourceDir, metaOverrides);

    // Build staging dir with populated metadata
    const stagingDir = buildStagingDir(contentType, safeSlug, sourceDir, builtMeta);

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
      console.log(style('warning', 'gh CLI not found — manual submission required.'));
      console.log(style('info', 'Steps to submit manually:'));
      console.log(`  1. Fork: https://github.com/professor-skills-hub/courses-skills-registry`);
      console.log(`  2. Create branch: contribute/${contentType}/${safeSlug}`);
      console.log(`  3. Upload files from: ${stagingDir}`);
      console.log(`  4. Open a PR to main`);
      console.log(style('info', 'Install gh: https://cli.github.com'));
      process.exit(0);
    }

    // gh auth check
    try { execSync('gh auth status', { stdio: 'ignore' }); } catch {
      console.log(style('warning', 'gh not authenticated — manual submission required.'));
      console.log(style('info', 'Steps to submit manually:'));
      console.log(`  1. Fork: https://github.com/professor-skills-hub/courses-skills-registry`);
      console.log(`  2. Create branch: contribute/${contentType}/${safeSlug}`);
      console.log(`  3. Upload files from: ${stagingDir}`);
      console.log(`  4. Open a PR to main`);
      console.log(style('info', 'Run: gh auth login'));
      process.exit(0);
    }

    // Setup git credentials (Eng Decision 2 — use gh auth setup-git, not token URL injection)
    try {
      execSync('gh auth setup-git', { stdio: 'pipe' });
    } catch {
      console.error(style('error', 'gh auth setup-git failed. Run gh auth login first.'));
      process.exit(1);
    }

    // Fork (ignore non-zero — fork may already exist from a prior publish run)
    const forkSpinner = ora('Forking registry…').start();
    try {
      execSync('gh repo fork professor-skills-hub/courses-skills-registry --clone=false', { stdio: 'pipe' });
    } catch {
      // Fork already exists or transient — continue; clone will fail if truly broken
    }
    forkSpinner.succeed('Fork ready');

    // Resolve fork URL via GitHub API (not local git remote — that points to the user's own repo)
    let forkUrl;
    try {
      const login = execSync('gh api user --jq .login', { encoding: 'utf-8', stdio: 'pipe' }).trim();
      forkUrl = `https://github.com/${login}/courses-skills-registry.git`;
    } catch {
      console.error(style('error', 'Could not resolve GitHub username. Run: gh auth login'));
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
    const destDir = join(repoDir, contentType === 'course' ? 'courses' : 'skills', safeSlug);
    mkdirSync(destDir, { recursive: true });
    for (const f of readdirSync(stagingDir)) {
      const src = join(stagingDir, f);
      if (statSync(src).isFile()) {
        writeFileSync(join(destDir, f), readFileSync(src));
      }
    }

    // Branch, commit, push
    const branch    = `contribute/${contentType}/${safeSlug}`;
    const commitMsg = `Add ${contentType}: ${safeSlug}`;
    try {
      execSync(`git checkout -b "${branch}"`,               { cwd: repoDir, stdio: 'pipe' });
      execSync(`git add . && git commit -m "${commitMsg}"`, { cwd: repoDir, stdio: 'pipe' });
      const pushFlags = isForce ? '-f' : '';
      execSync(`git push origin "${branch}" ${pushFlags}`.trim(), { cwd: repoDir, stdio: 'pipe' });
    } catch (err) {
      console.error(style('error', `Git push failed: ${err.message}`));
      rmSync(tmpDir, { recursive: true, force: true });
      process.exit(1);
    }

    // Create PR against the upstream registry (not the fork's own main)
    const prSpinner = ora('Creating PR…').start();
    let prUrl;
    try {
      const prOutput = execSync(
        `gh pr create --json url --jq .url --repo professor-skills-hub/courses-skills-registry --title "${commitMsg}" --body "Published via skillforce publish."`,
        { cwd: repoDir, encoding: 'utf-8', stdio: 'pipe' }
      );
      prUrl = prOutput.trim();
      if (!prUrl.startsWith('https://')) throw new Error(`Unexpected gh output: ${prUrl}`);
      prSpinner.succeed();
      console.log(style('success', `PR created: ${prUrl}`));
    } catch (err) {
      // Check if a PR already exists for this branch (gh exits non-zero with existing URL in stderr)
      const stderr = err.stderr || '';
      const existingMatch = stderr.match(/https:\/\/github\.com\/[^\s]+/);
      if (existingMatch) {
        prSpinner.succeed('PR already open');
        console.log(style('success', `Existing PR: ${existingMatch[0]}`));
        prUrl = existingMatch[0];
      } else if (err.message?.includes('Unexpected gh output')) {
        // gh returned something unexpected — PR may still have been created
        prSpinner.fail();
        console.log(style('warning', `gh returned unexpected output: ${err.message}`));
        console.log(style('info', 'PR may have been created — check: https://github.com/professor-skills-hub/courses-skills-registry/pulls'));
        rmSync(tmpDir, { recursive: true, force: true });
        process.exit(0);
      } else {
        prSpinner.fail();
        console.error(style('error', `PR creation failed: ${err.message}`));
        rmSync(tmpDir, { recursive: true, force: true });
        process.exit(1);
      }
    }

    // Cleanup temp clone (staging dir kept intentionally — user can inspect submitted files)
    rmSync(tmpDir, { recursive: true, force: true });
    console.log(style('info', `Submitted files kept at: ${stagingDir}`));
    process.exit(0);
  }

  // ── Dev CLI fast-path (Phase 30) ─────────────────────────────────────────
  // `status`, `next`, `check` and `doctor` live in bin/commands/* and keep
  // cli.js thin — each case just delegates with the parsed args.

  case 'status':
  case 'next':
  case 'check':
  case 'doctor':
  case 'studio':
  case 'review':
  case 'import':
  case 'create':
  case 'save':
  case 'context':
  case 'trail': {
    const file = { save: 'create', context: 'trail' }[command] || command;
    const { run } = await import(`./commands/${file}.js`);
    await run({ args: args.slice(1), cwd: process.cwd(), chalk, style, command });
    break;
  }

  case 'list':
    console.log('\nSupported agents:\n');
    SUPPORTED_AGENTS.forEach((agent, i) => {
      console.log(`  ${i + 1}. ${agent}`);
    });
    console.log('\nUse skillforce setup <agent> to install.\n');
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

/** One REGISTRY (BETA) row, padded to a fixed description column. */
function registryRow(command, description) {
  const pad = ' '.repeat(Math.max(1, 23 - command.length));
  return `  ${chalk.bold(command)}${pad}${description}`;
}

function printUsage() {
  console.log(`
Usage: skillforce [command] [options]

Description:
  Socratic learning assistant — teaches by asking questions. Set up for your
  agent (Claude Code, Gemini, OpenCode, Cursor), then start Professor Studio
  with npx ronin-skillforce studio (Node 22.5+).

COMMANDS
  ${chalk.bold('status')} [--json]      Show every course: progress, current section, due cards, streak
  ${chalk.bold('next')} [slug]          Show the active lecture summary and how to continue
  ${chalk.bold('check')} [slug]         Run the active exercise's self-checks
  ${chalk.bold('create')} <slug> --kind K  Create a course folder (programming = verified git worktree)
  ${chalk.bold('save')} <slug> [-m msg]   Commit a programming course's worktree
  ${chalk.bold('context')} [slug] --json  Course context for Coach (path, section, exercise, trail)
  ${chalk.bold('trail')} <slug> --learner .. --asked .. --concept ..  Record a Coach review round
  ${chalk.bold('doctor')}               Check the local environment (Node, git, agents, Ollama, port, DB)
  ${chalk.bold('studio')}               Start local server + Studio, pair and open the browser (Node 22.5+)
  ${chalk.bold('review')} [--limit N]   Review due flashcards in the terminal (SM-2) (Node 22.5+)
  ${chalk.bold('import')} [slug|--all]  Import CLI courses into Studio's SQLite database (Node 22.5+)
  ${chalk.bold('setup')} [agent]        Set up Professor for a specific agent
  ${chalk.bold('init')}                 Auto-detect and set up
  ${chalk.bold('list')}                 List supported agents
  ${chalk.bold('web')} [port] [--production]   Studio bridge + built Studio app (default port 3000);
                              --production requires an existing Studio build
  ${chalk.bold('help')}                 Show this help message

REGISTRY (BETA)
  Community registry commands — not reliable yet, expect rough edges.
${registryRow('courses', 'List all courses in the registry')}
${registryRow('search <keyword>', 'Search registry courses by keyword')}
${registryRow('install <name>', 'Install a course locally (→ learning/{name}/)')}
${registryRow('install --skill <name>', 'Install a skill locally (→ .claude/skills/{name}/)')}
${registryRow('update <skill-name>', 'Update an installed skill to the latest version')}
${registryRow('update --all', 'Update all installed skills')}
${registryRow('installed', 'List all installed skills')}
${registryRow('remove <skill-name>', 'Remove an installed skill')}
${registryRow('publish [options]', 'Publish a course or skill to the community registry')}

FLAGS
  --global          Target global scope (user-wide, e.g. ~/.claude/skills/)
  --local           Target local scope (current project, .claude/skills/)
  --force           Bypass overwrite/removal confirmation prompts
  --all             Apply to all items (update --all)
  --no-import       For \`install <course>\`, skip the automatic import into Studio
  --cloud           Deprecated: legacy only — no effect without web --legacy
  --legacy          Deprecated: mount the legacy web UI in web (or set PROFESSOR_LEGACY=1)
  --rotate-token    For web/studio, generate a new Studio pairing token and exit
  --port <n>        For \`studio\`, the Studio port (default 5180)
  --api-port <n>    For \`studio\`, the local server port (default 3000)
  --no-open         For \`studio\`, do not open the browser
  --limit <n>       For \`review\`, max cards to review (default 20)
  --dry-run         For \`import\`, print what would be imported without writing

EXAMPLES
  npx ronin-skillforce status                  # See every course + overall streak
  npx ronin-skillforce status --json           # Machine-readable status
  npx ronin-skillforce next                    # What to work on, and how to continue
  npx ronin-skillforce check nextjs            # Run the active exercise's self-checks
  npx ronin-skillforce doctor                  # Diagnose your local setup
  npx ronin-skillforce studio                  # One command: server + Studio + pairing
  npx ronin-skillforce review                  # Review due flashcards in the terminal
  npx ronin-skillforce import --all            # Import every CLI course into Studio
  npx ronin-skillforce import react-hooks      # Import one course
  npx ronin-skillforce import --all --dry-run  # Preview the import, write nothing
  npx ronin-skillforce init                    # Auto-detect and setup
  npx ronin-skillforce setup claude            # Setup for Claude Code (prompts for scope)
  npx ronin-skillforce setup claude --global   # Install globally
  npx ronin-skillforce courses                        # Browse community courses
  npx ronin-skillforce search react                   # Search for React courses
  npx ronin-skillforce install react-hooks            # Install course → learning/react-hooks/
  npx ronin-skillforce install --skill react-hooks-reviewer           # Install skill (prompts scope)
  npx ronin-skillforce install --skill react-hooks-reviewer --global  # Install skill globally
  npx ronin-skillforce update react-hooks-reviewer     # Update a skill
  npx ronin-skillforce update --all                    # Update all installed skills
  npx ronin-skillforce installed                        # List installed skills
  npx ronin-skillforce remove react-hooks-reviewer     # Remove a skill
  npx ronin-skillforce publish --dry-run                 # Preview packaged files (no GitHub)
  npx ronin-skillforce publish --type skill --name foo   # Publish a skill

SUPPORTED AGENTS
  ${SUPPORTED_AGENTS.join(', ')}
  `.trim());
}
