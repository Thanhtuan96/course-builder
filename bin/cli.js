#!/usr/bin/env node

import { existsSync, mkdirSync, symlinkSync, readFileSync, writeFileSync, readdirSync, cpSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

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
  help              Show this help message

Examples:
  npx course-professor init              # Auto-detect and setup
  npx course-professor setup claude      # Setup for Claude Code
  npx course-professor setup opencode     # Setup for OpenCode
  npx course-professor setup gemini       # Setup for Gemini CLI

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

async function init() {
  const detected = detectAgent();
  
  if (detected.length === 0) {
    console.log(`
❓ No agent detected automatically.

Supported agents: ${SUPPORTED_AGENTS.join(', ')}

Usage:
  npx course-professor setup <agent>

Example:
  npx course-professor setup claude
    `.trim());
    return;
  }
  
  if (detected.length === 1) {
    console.log(`🔍 Detected: ${detected[0]}\n`);
    await setupAgent(detected[0]);
    return;
  }
  
  console.log(`🔍 Multiple agents detected: ${detected.join(', ')}\n`);
  
  console.log('Which agent would you like to set up?');
  console.log(`Enter a number or agent name:`);
  
  detected.forEach((agent, i) => {
    console.log(`  ${i + 1}. ${agent}`);
  });
  
  console.log('\nOr run: npx course-professor setup <agent>');
}

const args = process.argv.slice(2);
const command = args[0] || 'help';

switch (command) {
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
