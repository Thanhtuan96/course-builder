import { existsSync, mkdirSync, readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  substituteTokens,
  createInstallRun,
  writeManagedFile,
  printInstallSummary,
} from './_shared.js';

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
  const run = createInstallRun();

  if (!existsSync(base)) {
    mkdirSync(base, { recursive: true });
    console.log(`✓ Created ${label} directory`);
  }

  // 1. agents/ — one .md file per agent
  console.log('✓ Installing agents...');
  const agentsSrcDir = join(PLUGIN_DIR, 'shared', 'agents');
  const agentsDestDir = join(base, 'agents');
  for (const file of readdirSync(agentsSrcDir)) {
    if (!file.endsWith('.md')) continue;
    const content = substituteTokens(readFileSync(join(agentsSrcDir, file), 'utf-8'), 'claude');
    writeManagedFile(join(agentsDestDir, file), content, run, `agents/${file}`);
  }

  // 2. commands/professor/ — one .md file per command
  console.log('✓ Installing commands...');
  const commandsSrcDir = join(PLUGIN_DIR, 'shared', 'commands', 'professor');
  const commandsDestDir = join(base, 'commands', 'professor');
  for (const file of readdirSync(commandsSrcDir)) {
    if (!file.endsWith('.md')) continue;
    const content = substituteTokens(readFileSync(join(commandsSrcDir, file), 'utf-8'), 'claude');
    writeManagedFile(join(commandsDestDir, file), content, run, `commands/professor/${file}`);
  }

  // 3. hooks/ — pre-compact.js
  const hooksSrcDir = join(PLUGIN_DIR, 'shared', 'hooks');
  if (existsSync(hooksSrcDir)) {
    console.log('✓ Installing hooks...');
    const hooksDestDir = join(base, 'hooks');
    for (const file of readdirSync(hooksSrcDir)) {
      const content = readFileSync(join(hooksSrcDir, file), 'utf-8');
      writeManagedFile(join(hooksDestDir, file), content, run, `hooks/${file}`);
    }
  }

  // 4. skills/professor/ — SKILL.md
  const skillSrc = join(PLUGIN_DIR, 'shared', 'SKILL.md');
  const skillDest = join(base, 'skills', 'professor', 'SKILL.md');
  writeManagedFile(skillDest, readFileSync(skillSrc, 'utf-8'), run, 'skills/professor/SKILL.md');

  printInstallSummary('Claude Code', run);

  console.log(`
✅ Setup complete for Claude Code!

Next steps:
1. Restart Claude Code
2. Run: /professor:new-topic to start learning
  `.trim());
}
