#!/usr/bin/env node

import { existsSync, mkdirSync, symlinkSync, readFileSync, writeFileSync, readdirSync, cpSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SUPPORTED_AGENTS = ['claude', 'gemini', 'opencode', 'cursor'];

async function detectAgent() {
  const detected = [];
  for (const name of SUPPORTED_AGENTS) {
    const { detect } = await import(`./platforms/${name}.js`);
    if (detect()) detected.push(name);
  }
  return detected;
}

function printBanner() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║           📚 Course Professor - Socratic Learning            ║
║                                                               ║
║    Teaches by asking questions, not giving answers.          ║
╚══════════════════════════════════════════════════════════════╝
  `.trim());
}

function printUsage() {
  console.log(`
Usage: course-professor [command] [options]

Commands:
  setup [agent]     Set up Professor for a specific agent
  init              Auto-detect and set up
  list              List supported agents
  web [port]        Start local web UI (default port: 3000)
  web --production  Start web UI in production mode (requires build)
  help              Show this help message

Flags:
  --global          Install globally (user-wide, e.g. ~/.claude/plugins/professor/)
  --local           Install locally in the current project (default)

Examples:
  npx course-professor init              # Auto-detect and setup
  npx course-professor setup claude      # Setup for Claude Code (prompts for scope)
  npx course-professor setup claude --global   # Install globally
  npx course-professor setup opencode    # Setup for OpenCode
  npx course-professor setup gemini      # Setup for Gemini CLI
  npx course-professor web               # Start web UI on port 3000
  npx course-professor web 4000          # Start on port 4000
  npx course-professor web --production  # Start in production mode

Supported agents: ${SUPPORTED_AGENTS.join(', ')}
  `.trim());
}

function listAgents() {
  console.log('\nSupported agents:');
  SUPPORTED_AGENTS.forEach(agent => {
    console.log(`  - ${agent}`);
  });
  console.log('');
}

async function promptScope(platform) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  rl.on('SIGINT', () => { console.log('\n\nAborted.'); rl.close(); process.exit(0); });

  const globalPath = {
    claude:   '~/.claude/plugins/professor/',
    gemini:   '~/GEMINI.md',
    opencode: '~/.opencode/professor.md',
    cursor:   '~/.cursor/rules/professor.mdc',
  }[platform] || '~/';

  console.log(`\nInstall scope for ${platform}:`);
  console.log(`  1. Global — ${globalPath} (available in all projects)`);
  console.log(`  2. Local  — current project only`);

  const answer = await askQuestion(rl, '\n> ');
  rl.close();
  return (answer.trim() === '1' || answer.trim().toLowerCase() === 'global')
    ? 'global' : 'local';
}

async function setupAgent(agent) {
  const agentLower = agent.toLowerCase();
  if (!SUPPORTED_AGENTS.includes(agentLower)) {
    console.error(`❌ Unsupported agent: ${agent}`);
    console.log(`Supported: ${SUPPORTED_AGENTS.join(', ')}`);
    process.exit(1);
  }
  const scope = isGlobal ? 'global' : isLocal ? 'local' : await promptScope(agentLower);
  const { install } = await import(`./platforms/${agentLower}.js`);
  await install(scope);
}

function askQuestion(rl, prompt) {
  return new Promise(resolve => rl.question(prompt, resolve));
}

async function promptAgentSelection(agents) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  rl.on('SIGINT', () => {
    console.log('\n\nAborted.');
    rl.close();
    process.exit(0);
  });

  let choice;
  while (true) {
    const answer = (await askQuestion(rl, '\n> ')).trim();
    const num = parseInt(answer, 10);
    if (!isNaN(num) && num >= 1 && num <= agents.length) {
      choice = agents[num - 1];
      break;
    } else if (SUPPORTED_AGENTS.includes(answer.toLowerCase())) {
      choice = answer.toLowerCase();
      break;
    }
    console.log(`Invalid choice. Enter 1-${agents.length} or a supported agent name (${SUPPORTED_AGENTS.join(', ')}).`);
  }
  rl.close();
  return choice;
}

async function init() {
  const detected = await detectAgent();

  if (detected.length === 0) {
    console.log(`❓ No agent detected automatically.\n`);
    console.log('Which agent would you like to set up?');
    console.log('Enter a number or agent name:\n');
    SUPPORTED_AGENTS.forEach((agent, i) => {
      console.log(`  ${i + 1}. ${agent}`);
    });

    const choice = await promptAgentSelection(SUPPORTED_AGENTS);
    await setupAgent(choice);
    return;
  }

  if (detected.length === 1) {
    console.log(`🔍 Detected: ${detected[0]}\n`);
    await setupAgent(detected[0]);
    return;
  }

  console.log(`🔍 Multiple agents detected: ${detected.join(', ')}\n`);
  console.log('Which agent would you like to set up?');
  console.log('Enter a number or agent name:\n');
  detected.forEach((agent, i) => {
    console.log(`  ${i + 1}. ${agent}`);
  });

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
      console.error('❌ Web UI not found. Make sure the plugin is fully installed.');
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
        console.log('⚠️  Production build not found.');
        console.log('   Run: npm run build');
        console.log('   Then: npx course-professor web --production');
        process.exit(1);
      }
    }

    // Check for node_modules
    if (!existsSync(join(webDir, 'node_modules'))) {
      console.log('📦 Installing web dependencies...');
      try {
        execSync('npm install', { cwd: webDir, stdio: 'inherit' });
      } catch {
        console.error('❌ Failed to install web dependencies.');
        process.exit(1);
      }
    }

    // Check for client node_modules (only in dev mode)
    const clientDir = join(webDir, 'client');
    if (!isProduction && existsSync(clientDir) && !existsSync(join(clientDir, 'node_modules'))) {
      console.log('📦 Installing client dependencies...');
      try {
        execSync('npm install', { cwd: clientDir, stdio: 'inherit' });
      } catch {
        console.error('❌ Failed to install client dependencies.');
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
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      console.log('');
      console.log('🔑 No Anthropic API key detected.');
      console.log('   Get one at: https://console.anthropic.com/settings/keys');
      console.log('');
      const answer = await new Promise(resolve => {
        rl.question('   Paste your API key (or press Enter to skip chat): ', resolve);
      });
      rl.close();

      const trimmed = answer.trim();
      if (trimmed && trimmed.startsWith('sk-')) {
        // Save to .env for future runs
        const envPath = join(process.cwd(), '.env');
        const line = `ANTHROPIC_API_KEY=${trimmed}\n`;
        try {
          // Append only if not already present
          const existing = existsSync(envPath) ? readFileSync(envPath, 'utf-8') : '';
          if (!existing.includes('ANTHROPIC_API_KEY')) {
            writeFileSync(envPath, existing + line);
            console.log(`   ✅ Saved to .env — won't ask again.\n`);
          }
        } catch {}
        found = { key: trimmed, source: '.env (just saved)' };
      } else {
        console.log('   Skipping. Chat feature will be disabled.\n');
      }
    }

    const apiKey = found?.key;
    if (apiKey) {
      console.log(`✅ API key ready (${found.source})\n`);
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
    console.log(`
 📚 Starting Professor Web UI on port ${port} (${mode})...
   `);
    
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
