import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { substituteTokens } from './_shared.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = join(__dirname, '..', '..');

/** Returns true if Claude Code is present on this machine. */
export function detect() {
  return !!(
    process.env.ANTHROPIC_API_KEY ||
    existsSync(join(process.env.HOME || '', '.claude'))
  );
}

/**
 * Install professor for Claude Code.
 * scope = 'global' → ~/.claude/   (agents/, commands/professor/, hooks/, skills/professor/)
 * scope = 'local'  → .claude/     (same structure, project-local)
 */
export async function install(scope = 'local') {
  const base = scope === 'global'
    ? join(process.env.HOME || '', '.claude')
    : join(process.cwd(), '.claude');

  const label = scope === 'global' ? '~/.claude/' : '.claude/';

  if (!existsSync(base)) {
    mkdirSync(base, { recursive: true });
    console.log(`✓ Created ${label} directory`);
  }

  // 1. agents/ — one .md file per agent
  const agentsDestDir = join(base, 'agents');
  mkdirSync(agentsDestDir, { recursive: true });
  const agentsSrcDir = join(PLUGIN_DIR, 'shared', 'agents');
  console.log('✓ Installing agents...');
  for (const file of readdirSync(agentsSrcDir)) {
    if (!file.endsWith('.md')) continue;
    const dest = join(agentsDestDir, file);
    if (existsSync(dest)) {
      console.log(`  ↔ agents/${file} (already exists)`);
    } else {
      const content = substituteTokens(readFileSync(join(agentsSrcDir, file), 'utf-8'), 'claude');
      writeFileSync(dest, content);
      console.log(`  + agents/${file}`);
    }
  }

  // 2. commands/professor/ — one .md file per command
  const commandsDestDir = join(base, 'commands', 'professor');
  mkdirSync(commandsDestDir, { recursive: true });
  const commandsSrcDir = join(PLUGIN_DIR, 'shared', 'commands', 'professor');
  console.log('✓ Installing commands...');
  for (const file of readdirSync(commandsSrcDir)) {
    if (!file.endsWith('.md')) continue;
    const dest = join(commandsDestDir, file);
    if (existsSync(dest)) {
      console.log(`  ↔ commands/professor/${file} (already exists)`);
    } else {
      const content = substituteTokens(readFileSync(join(commandsSrcDir, file), 'utf-8'), 'claude');
      writeFileSync(dest, content);
      console.log(`  + commands/professor/${file}`);
    }
  }

  // 3. hooks/ — pre-compact.js
  const hooksDestDir = join(base, 'hooks');
  mkdirSync(hooksDestDir, { recursive: true });
  const hooksSrcDir = join(PLUGIN_DIR, 'shared', 'hooks');
  if (existsSync(hooksSrcDir)) {
    console.log('✓ Installing hooks...');
    for (const file of readdirSync(hooksSrcDir)) {
      const dest = join(hooksDestDir, file);
      if (existsSync(dest)) {
        console.log(`  ↔ hooks/${file} (already exists)`);
      } else {
        writeFileSync(dest, readFileSync(join(hooksSrcDir, file), 'utf-8'));
        console.log(`  + hooks/${file}`);
      }
    }
  }

  // 4. skills/professor/ — SKILL.md
  const skillsDestDir = join(base, 'skills', 'professor');
  mkdirSync(skillsDestDir, { recursive: true });
  const skillSrc = join(PLUGIN_DIR, 'shared', 'SKILL.md');
  const skillDest = join(skillsDestDir, 'SKILL.md');
  if (existsSync(skillDest)) {
    console.log('  ↔ skills/professor/SKILL.md (already exists)');
  } else {
    writeFileSync(skillDest, readFileSync(skillSrc, 'utf-8'));
    console.log('  + skills/professor/SKILL.md');
  }

  console.log(`
✅ Setup complete for Claude Code!

Next steps:
1. Restart Claude Code
2. Run: /professor:new-topic to start learning
  `.trim());
}
