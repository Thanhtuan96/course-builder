import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { substituteTokens, generateCommandFiles, adaptAgentFrontmatter } from './_shared.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = join(__dirname, '..', '..');

/** Returns true if an OpenCode environment is detected. */
export function detect() {
  return (
    existsSync(join(process.cwd(), '.opencode')) ||
    existsSync(join(process.cwd(), 'opencode.json')) ||
    existsSync(join(process.env.HOME || '', '.config', 'opencode'))
  );
}

/**
 * Install professor for OpenCode.
 * scope = 'global' → ~/.config/opencode/
 * scope = 'local'  → cwd/.opencode/
 */
export async function install(scope = 'local') {
  const configBase = scope === 'global'
    ? join(process.env.HOME || '', '.config', 'opencode')
    : join(process.cwd(), '.opencode');

  if (!existsSync(configBase)) {
    mkdirSync(configBase, { recursive: true });
    console.log(`✓ Created ${scope === 'global' ? '~/.config/opencode/' : '.opencode/'} directory`);
  }

  // 1. Write AGENTS.md (OpenCode auto-loads this — no config entry needed)
  const agentsMdPath = scope === 'global'
    ? join(configBase, 'AGENTS.md')
    : join(process.cwd(), 'AGENTS.md');

  if (!existsSync(agentsMdPath)) {
    const skill = readFileSync(join(PLUGIN_DIR, 'shared', 'SKILL.md'), 'utf-8');
    const adapted = substituteTokens(skill, 'opencode');
    writeFileSync(agentsMdPath, adapted);
    console.log(`  + ${scope === 'global' ? '~/.config/opencode/AGENTS.md' : 'AGENTS.md'}`);
  } else {
    console.log(`  ↔ AGENTS.md (already exists)`);
  }

  // 2. Write command files into commands/ dir
  const commandsDir = scope === 'global'
    ? join(configBase, 'commands')
    : join(process.cwd(), '.opencode', 'commands');

  console.log('✓ Generating command files...');
  generateCommandFiles(commandsDir, 'opencode');

  // 3. Write agents/professor.md
  const agentsDir = join(configBase, 'agents');
  if (!existsSync(agentsDir)) {
    mkdirSync(agentsDir, { recursive: true });
  }
  const agentFilePath = join(agentsDir, 'professor.md');
  if (!existsSync(agentFilePath)) {
    let agentSrc = readFileSync(join(PLUGIN_DIR, 'shared', 'agents', 'professor.md'), 'utf-8');
    agentSrc = substituteTokens(agentSrc, 'opencode');
    agentSrc = adaptAgentFrontmatter(agentSrc, 'opencode');
    writeFileSync(agentFilePath, agentSrc);
    const displayPath = scope === 'global' ? '~/.config/opencode/agents/professor.md' : '.opencode/agents/professor.md';
    console.log(`  + ${displayPath}`);
  } else {
    console.log('  ↔ agents/professor.md (already exists)');
  }

  // 4. Write opencode.json — $schema only, no instructions[] field
  const opencodeJsonPath = join(configBase, 'opencode.json');
  let config = {};
  if (existsSync(opencodeJsonPath)) {
    try { config = JSON.parse(readFileSync(opencodeJsonPath, 'utf-8')); } catch {}
  }

  // Remove instructions key if present (no longer needed — AGENTS.md is auto-loaded)
  delete config.instructions;

  if (!config.$schema) config.$schema = 'https://opencode.ai/config.json';

  writeFileSync(opencodeJsonPath, JSON.stringify(config, null, 2) + '\n');
  const configDisplayPath = scope === 'global' ? '~/.config/opencode/opencode.json' : '.opencode/opencode.json';
  console.log(`  + ${configDisplayPath}`);

  console.log(`
✅ Setup complete for OpenCode!

Next steps:
1. Restart OpenCode
2. Type: professor:new-topic to start learning
  `.trim());
}
