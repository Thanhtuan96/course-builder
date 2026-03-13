#!/usr/bin/env node

import { existsSync, mkdirSync, symlinkSync, readFileSync, writeFileSync, readdirSync, cpSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SUPPORTED_AGENTS = ['claude', 'opencode', 'gemini', 'agent', 'cursor', 'researcher'];

function detectAgent() {
  const detected = [];
  
  if (process.env.CLAUDE_API_KEY || existsSync(join(process.env.HOME || '', '.claude'))) {
    detected.push('claude');
  }
  if (process.env.OPENCODE_API_KEY || existsSync(join(process.env.HOME || '', '.opencode'))) {
    detected.push('opencode');
  }
  if (process.env.GEMINI_API_KEY || existsSync(join(process.env.HOME || '', '.gemini'))) {
    detected.push('gemini');
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

Examples:
  npx course-professor init              # Auto-detect and setup
  npx course-professor setup claude      # Setup for Claude Code
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

async function setupAgent(agent) {
  const agentLower = agent.toLowerCase();
  
  if (!SUPPORTED_AGENTS.includes(agentLower)) {
    console.error(`❌ Unsupported agent: ${agent}`);
    console.log(`Supported: ${SUPPORTED_AGENTS.join(', ')}`);
    process.exit(1);
  }
  
  const targetDir = join(process.cwd(), `.${agentLower}`);
  
  if (existsSync(targetDir)) {
    console.log(`⚠️  .${agentLower} already exists. Skipping...`);
  } else {
    mkdirSync(targetDir, { recursive: true });
    console.log(`✓ Created .${agentLower}/ directory`);
  }
  
  const templateDir = join(__dirname, '..', 'templates', agentLower);
  
  if (existsSync(templateDir)) {
    const files = readdirSync(templateDir);
    for (const file of files) {
      const src = join(templateDir, file);
      const dest = join(targetDir, file);
      const isDir = statSync(src).isDirectory();
      if (isDir) {
        if (!existsSync(dest)) {
          mkdirSync(dest, { recursive: true });
          console.log(`  + ${file}/`);
        }
      } else if (existsSync(dest)) {
        console.log(`  ↔ ${file} (already exists)`);
      } else {
        const content = readFileSync(src, 'utf-8');
        writeFileSync(dest, content);
        console.log(`  + ${file}`);
      }
    }
  }
  
  const sharedDir = join(__dirname, '..', 'shared');
  
  function copyRecursive(src, dest) {
    if (!existsSync(src)) return;
    
    const stat = statSync(src);
    if (stat.isDirectory()) {
      if (!existsSync(dest)) {
        mkdirSync(dest, { recursive: true });
      }
      const files = readdirSync(src);
      for (const file of files) {
        copyRecursive(join(src, file), join(dest, file));
      }
    } else {
      if (!existsSync(dest)) {
        const content = readFileSync(src, 'utf-8');
        writeFileSync(dest, content);
        const relativePath = dest.replace(targetDir + '/', '');
        console.log(`  + ${relativePath}`);
      }
    }
  }
  
  if (existsSync(sharedDir)) {
    copyRecursive(sharedDir, targetDir);
  }
  
  const pluginJson = join(__dirname, '..', 'plugin.json');
  const destPlugin = join(targetDir, 'plugin.json');
  if (!existsSync(destPlugin)) {
    const content = readFileSync(pluginJson, 'utf-8');
    writeFileSync(destPlugin, content);
    console.log(`  + plugin.json`);
  }
  
  console.log(`
✅ Setup complete for ${agent}!

Next steps:
1. Restart your ${agent} agent
2. Run: professor:new-topic to start learning
3. Or try: professor:help for commands

Course files will be created in: ./courses/
  `.trim());
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
  const detected = detectAgent();

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

    // Check for API key (auto-detect from common env vars)
    const apiKey = process.env.ANTHROPIC_API_KEY 
      || process.env.CLAUDE_API_KEY 
      || process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      // Detect agent for helpful message
      const detected = detectAgent();
      console.error('❌ ANTHROPIC_API_KEY not set.');
      console.log('   Run: export ANTHROPIC_API_KEY=your-key');
      console.log('   Or: export CLAUDE_API_KEY=your-key');
      console.log(`   Detected agent: ${detected[0] || 'none'}`);
      console.log('   Then: npx course-professor web');
      process.exit(1);
    }

    // Optional port argument (not allowed with --production)
    let port = '3000';
    if (!isProduction) {
      port = args[1] || process.env.PORT || '3000';
    } else if (args[1] && args[1] !== '--production') {
      port = args[1];
    }
    process.env.PORT = port;
    process.env.COURSES_DIR = process.env.COURSES_DIR || './courses';

    const mode = isProduction ? 'production' : 'development';
    console.log(`
 📚 Starting Professor Web UI on port ${port} (${mode})...
   `);
    
    // Start the server
    await import(join(webDir, 'server.js'));
    break;
  }

  case 'init':
  case 'setup':
    printBanner();
    console.log('');
    if (args[1]) {
      await setupAgent(args[1]);
    } else {
      await init();
    }
    break;
    
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
