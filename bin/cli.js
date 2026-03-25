#!/usr/bin/env node

import { existsSync, mkdirSync, symlinkSync, readFileSync, writeFileSync, readdirSync, cpSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SUPPORTED_AGENTS = ['claude', 'gemini', 'opencode', 'cursor'];

// Registry constants
const REGISTRY_INDEX_URL =
  'https://raw.githubusercontent.com/professor-skills-hub/courses-skills-registry/main/index.json';
const RAW_COURSES_BASE =
  'https://raw.githubusercontent.com/professor-skills-hub/courses-skills-registry/main/courses';
const RAW_SKILLS_BASE =
  'https://raw.githubusercontent.com/professor-skills-hub/courses-skills-registry/main/skills';

async function fetchRegistryText(url) {
  const { get } = await import('https');
  return new Promise((resolve, reject) => {
    get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
        res.resume();
        return;
      }
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function fetchRegistryIndex() {
  const text = await fetchRegistryText(REGISTRY_INDEX_URL);
  return JSON.parse(text);
}

// Theme: consistent symbols + colors (chalk respects NO_COLOR / FORCE_COLOR)
const THEME = {
  success: '✅',
  warning: '⚠️',
  error: '❌',
  info: '→',
};
const STYLE = {
  success: (s) => chalk.green(THEME.success + ' ' + s),
  warning: (s) => chalk.yellow(THEME.warning + ' ' + s),
  error: (s) => chalk.red(THEME.error + ' ' + s),
  info: (s) => chalk.dim(THEME.info + ' ' + s),
};
function style(type, text) {
  return STYLE[type](text);
}

async function detectAgent() {
  const detected = [];
  for (const name of SUPPORTED_AGENTS) {
    const { detect } = await import(`./platforms/${name}.js`);
    if (detect()) detected.push(name);
  }
  return detected;
}

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
        \\::/    /                |::|____|                \\::/____/
         \\/____/                  ~~                       ~~`;
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
  ${chalk.bold('web')} [port]           Start local web UI (default port: 3000)
  ${chalk.bold('web')} --production     Start web UI in production mode (requires build)
  ${chalk.bold('help')}                 Show this help message

FLAGS
  --global          Install globally (user-wide, e.g. ~/.claude/plugins/professor/)
  --local           Install locally in the current project (default)

EXAMPLES
  npx course-professor init                    # Auto-detect and setup
  npx course-professor setup claude            # Setup for Claude Code (prompts for scope)
  npx course-professor setup claude --global   # Install globally
  npx course-professor courses                        # Browse community courses
  npx course-professor search react                   # Search for React courses
  npx course-professor install react-hooks            # Install course → learning/react-hooks/
  npx course-professor install --skill react-hooks-reviewer           # Install skill (prompts scope)
  npx course-professor install --skill react-hooks-reviewer --global  # Install skill globally
  npx course-professor web                     # Start web UI on port 3000

SUPPORTED AGENTS
  ${SUPPORTED_AGENTS.join(', ')}
  `.trim());
}

function listAgents() {
  console.log('\nSupported agents:\n');
  SUPPORTED_AGENTS.forEach((agent, i) => {
    console.log(`  ${i + 1}. ${agent}`);
  });
  console.log('\nUse course-professor setup <agent> to install.\n');
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

  const { scope } = await inquirer.prompt([
    {
      type: 'list',
      name: 'scope',
      message: `Install scope for ${platform}:`,
      choices: [
        { name: `Global — ${globalPath} (available in all projects)`, value: 'global' },
        { name: 'Local — current project only', value: 'local' },
      ],
      default: 'local',
    },
  ]);
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
    console.error(style('error', "Non-interactive mode. Run with: course-professor setup <agent> --local or --global"));
    process.exit(1);
  }
  const { agent } = await inquirer.prompt([
    {
      type: 'list',
      name: 'agent',
      message: 'Which agent would you like to set up?',
      choices: agents.map((a) => ({ name: a, value: a })),
    },
  ]);
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

const args = process.argv.slice(2);
const isGlobal = args.includes('--global');
const isLocal  = args.includes('--local');
const command = args[0] || 'help';

switch (command) {
  case 'web': {
    const { execSync } = await import('child_process');
    const webDir = join(__dirname, '..', 'web');

    if (!existsSync(webDir)) {
      console.error(style('error', "Web UI not found. Ensure the package is fully installed (e.g. run from repo root or after npm install)."));
      process.exit(1);
    }

    // Check for --production flag
    const isProduction = args.includes('--production');
    if (isProduction) {
      process.env.NODE_ENV = 'production';
    }

    // In production mode, verify build exists
    if (isProduction) {
      const distPath = join(webDir, 'client', 'dist');
      if (!existsSync(distPath)) {
        console.error(style('warning', 'Production build not found.'));
        console.error('   From repo root: npm run build');
        console.error('   Then: npx course-professor web --production');
        process.exit(1);
      }
    }

    // Check for node_modules
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

    // Check for client node_modules (only in dev mode)
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

    // API key only needed for chat feature - not required to start server
    // Auto-detect from environment, .env file, Claude Code keychain, or config files
    async function findApiKey() {
      // 1. Environment variables (highest priority)
      if (process.env.ANTHROPIC_API_KEY) return { key: process.env.ANTHROPIC_API_KEY, source: 'env' };
      if (process.env.CLAUDE_API_KEY) return { key: process.env.CLAUDE_API_KEY, source: 'env' };
      if (process.env.OPENAI_API_KEY) return { key: process.env.OPENAI_API_KEY, source: 'env' };

      // 2. .env file in current working directory
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

      // 3. macOS Keychain — look for a raw sk-ant-api key (not OAuth tokens)
      if (process.platform === 'darwin') {
        try {
          const { execSync: _exec } = await import('child_process');
          for (const svc of ['anthropic-api-key', 'Anthropic API Key', 'ANTHROPIC_API_KEY']) {
            try {
              const raw = _exec(`security find-generic-password -s "${svc}" -w`, {
                encoding: 'utf-8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore']
              }).trim();
              if (raw?.startsWith('sk-ant-api')) return { key: raw, source: `keychain:${svc}` };
            } catch {}
          }
        } catch {}
      }

      // 4. Claude Code / Anthropic config files
      const home = process.env.HOME || '';
      for (const p of [join(home, '.claude', 'settings.json'), join(home, '.anthropic', 'config.json')]) {
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

    // Interactive prompt if no key found — save to .env so it's auto-detected next time
    if (!found) {
      if (!process.stdin.isTTY) {
        console.log(style('info', 'No API key. Chat disabled. Add ANTHROPIC_API_KEY to .env or environment later.\n'));
      } else {
        console.log('');
        console.log(style('info', 'No Anthropic API key detected.'));
        console.log('   Get one at: https://console.anthropic.com/settings/keys');
        console.log('   (Key will be saved to .env if you paste one; otherwise chat will be disabled.)');
        console.log('');
        const { apiKeyInput } = await inquirer.prompt([
          {
            type: 'input',
            name: 'apiKeyInput',
            message: 'Paste your API key (or press Enter to skip):',
          },
        ]);
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
          console.log('   Skipping. Chat disabled. You can add a key later to .env or environment.\n');
        }
      }
    }

    const apiKey = found?.key;
    if (apiKey) {
      console.log(style('success', `API key loaded (${found.source}).\n`));
      process.env.ANTHROPIC_API_KEY = apiKey;
    }

    // Optional port argument (not allowed with --production)
    let port = '3000';
    if (!isProduction) {
      port = args[1] || process.env.PORT || '3000';
    } else if (args[1] && args[1] !== '--production') {
      port = args[1];
    }
    process.env.PORT = port;
    // Default to ./courses if it has content, otherwise use ./learning
    let defaultCourses = './courses';
    if (existsSync('./courses')) {
      const coursesContent = readdirSync('./courses');
      if (coursesContent.length === 0) defaultCourses = './learning';
    } else if (existsSync('./learning')) {
      defaultCourses = './learning';
    }
    process.env.COURSES_DIR = process.env.COURSES_DIR || defaultCourses;

    const mode = isProduction ? 'production' : 'development';
    const coursesDir = process.env.COURSES_DIR || defaultCourses;
    console.log('');
    console.log(style('info', 'Starting Professor Web UI…'));
    console.log(`   Mode: ${mode} | Port: ${port} | Courses: ${coursesDir}`);
    console.log('');
    
    // Start the server
    await import(join(webDir, 'server.js'));
    break;
  }

  case 'init':
  case 'setup': {
    printBanner();
    console.log('');
    const agentArg = args.slice(1).find(a => !a.startsWith('--'));
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
    } catch (err) {
      spinner.fail(`Registry fetch failed: ${err.message}`);
    }
    break;
  }

  case 'search': {
    const keyword = args.slice(1).find((a) => !a.startsWith('--'));
    if (!keyword) { console.error(style('error', 'Usage: course-professor search <keyword>')); process.exit(1); }
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
    } catch (err) {
      spinner.fail(`Registry fetch failed: ${err.message}`);
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

    const spinner = ora('Fetching registry…').start();
    let index;
    try {
      index = await fetchRegistryIndex();
    } catch (err) {
      spinner.fail(`Registry fetch failed: ${err.message}`);
      process.exit(1);
    }

    if (isSkill) {
      // Install a skill — scope: local (.claude/skills/) or global (~/.claude/skills/)
      const skill = (index.skills || []).find((s) => s.name === itemName);
      if (!skill) {
        spinner.fail(`Skill "${itemName}" not found.`);
        const names = (index.skills || []).map((s) => s.name);
        console.error(names.length ? `Available skills: ${names.join(', ')}` : 'No skills published yet.');
        process.exit(1);
      }
      spinner.stop();

      // Resolve scope
      let scope;
      if (isGlobal) {
        scope = 'global';
      } else if (isLocal) {
        scope = 'local';
      } else if (!process.stdin.isTTY) {
        console.error(style('error', 'Non-interactive mode. Use --local or --global.'));
        process.exit(1);
      } else {
        const globalPath = join(os.homedir(), '.claude', 'skills', itemName);
        const { chosen } = await inquirer.prompt([{
          type: 'list',
          name: 'chosen',
          message: `Install scope for skill "${itemName}":`,
          choices: [
            { name: `Local — .claude/skills/${itemName}/ (this project only)`, value: 'local' },
            { name: `Global — ${globalPath} (all projects)`, value: 'global' },
          ],
          default: 'local',
        }]);
        scope = chosen;
      }

      const destDir = scope === 'global'
        ? join(os.homedir(), '.claude', 'skills', itemName)
        : join(process.cwd(), '.claude', 'skills', itemName);
      mkdirSync(destDir, { recursive: true });

      const spinner2 = ora(`Installing ${skill.title}…`).start();
      for (const file of ['SKILL.md', 'meta.json']) {
        spinner2.text = `Downloading ${file}…`;
        try {
          const text = await fetchRegistryText(`${RAW_SKILLS_BASE}/${itemName}/${file}`);
          writeFileSync(join(destDir, file), text, 'utf8');
        } catch (err) {
          spinner2.fail(`Failed to download ${file}: ${err.message}`);
          process.exit(1);
        }
      }
      spinner2.succeed(`Installed skill ${chalk.bold(skill.title)} (${scope})`);
      console.log('');
      console.log(style('info', `Skill installed at ${destDir}`));
      console.log(style('info', 'It will be available to Claude Code in this project automatically.'));
      console.log('');
    } else {
      // Install a course → learning/{name}/ in the current repo
      const course = (index.courses || []).find((c) => c.name === itemName);
      if (!course) {
        spinner.fail(`Course "${itemName}" not found.`);
        const names = (index.courses || []).map((c) => c.name);
        if (names.length) console.error(`Available courses: ${names.join(', ')}`);
        process.exit(1);
      }
      const destDir = join(process.cwd(), 'learning', itemName);
      mkdirSync(destDir, { recursive: true });
      for (const file of ['COURSE.md', 'meta.json']) {
        spinner.text = `Downloading ${file}…`;
        try {
          const text = await fetchRegistryText(`${RAW_COURSES_BASE}/${itemName}/${file}`);
          writeFileSync(join(destDir, file), text, 'utf8');
        } catch (err) {
          spinner.fail(`Failed to download ${file}: ${err.message}`);
          process.exit(1);
        }
      }
      spinner.succeed(`Installed ${chalk.bold(course.title)} (${course.sections} sections, ${course.level})`);
      console.log('');
      console.log(style('info', 'Course downloaded to:'), chalk.dim(`learning/${itemName}/COURSE.md`));
      console.log(style('info', 'To start learning, run in Claude Code:'));
      console.log(`   professor:new-topic`);
      console.log('');
    }
    break;
  }

  case 'list':
    listAgents();
    break;
    
  case 'help':
  default:
    printBanner();
    console.log('');
    printUsage();
    break;
}
