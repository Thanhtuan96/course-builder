import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  substituteTokens,
  generateCommandFiles,
  adaptAgentFrontmatter,
  createInstallRun,
  writeManagedFile,
  writeManagedBlock,
  isLegacySkillDocument,
  printInstallSummary,
  BLOCK_START,
  BLOCK_END,
} from './_shared.js';

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

  const run = createInstallRun();

  if (!existsSync(configBase)) {
    mkdirSync(configBase, { recursive: true });
    console.log(`✓ Created ${scope === 'global' ? '~/.config/opencode/' : '.opencode/'} directory`);
  }

  // 1. Refresh the Professor block in AGENTS.md (OpenCode auto-loads it — no config entry needed)
  const agentsMdPath = scope === 'global'
    ? join(configBase, 'AGENTS.md')
    : join(process.cwd(), 'AGENTS.md');
  const agentsLabel = scope === 'global' ? '~/.config/opencode/AGENTS.md' : 'AGENTS.md';
  const skillDoc = readFileSync(join(PLUGIN_DIR, 'shared', 'SKILL.md'), 'utf-8');
  const skill = substituteTokens(skillDoc, 'opencode');

  const existingAgentsMd = existsSync(agentsMdPath) ? readFileSync(agentsMdPath, 'utf-8') : null;
  const isLegacyWholeFile = existingAgentsMd !== null
    && !existingAgentsMd.includes(BLOCK_START)
    && isLegacySkillDocument(existingAgentsMd);

  if (isLegacyWholeFile) {
    writeManagedFile(agentsMdPath, `${BLOCK_START}\n${skill}\n${BLOCK_END}\n`, run, agentsLabel);
  } else {
    writeManagedBlock(agentsMdPath, skill, run, agentsLabel);
  }

  // 2. Write command files into commands/ dir
  console.log('✓ Generating command files...');
  const commandsDir = scope === 'global'
    ? join(configBase, 'commands')
    : join(process.cwd(), '.opencode', 'commands');
  generateCommandFiles(commandsDir, 'opencode', run);

  // 3. Write agents/professor.md
  const agentsDir = join(configBase, 'agents');
  let agentSrc = readFileSync(join(PLUGIN_DIR, 'shared', 'agents', 'professor.md'), 'utf-8');
  agentSrc = substituteTokens(agentSrc, 'opencode');
  agentSrc = adaptAgentFrontmatter(agentSrc, 'opencode');
  const displayPath = scope === 'global' ? '~/.config/opencode/agents/professor.md' : '.opencode/agents/professor.md';
  writeManagedFile(join(agentsDir, 'professor.md'), agentSrc, run, displayPath);

  // 4. Merge opencode.json — $schema only, no instructions[] field. Not plugin-owned content,
  // so it is counted but never backed up.
  const opencodeJsonPath = join(configBase, 'opencode.json');
  let config = {};
  if (existsSync(opencodeJsonPath)) {
    try { config = JSON.parse(readFileSync(opencodeJsonPath, 'utf-8')); } catch {}
  }

  // Remove instructions key if present (no longer needed — AGENTS.md is auto-loaded)
  delete config.instructions;

  if (!config.$schema) config.$schema = 'https://opencode.ai/config.json';

  const configDisplayPath = scope === 'global' ? '~/.config/opencode/opencode.json' : '.opencode/opencode.json';
  const json = JSON.stringify(config, null, 2) + '\n';
  const previous = existsSync(opencodeJsonPath) ? readFileSync(opencodeJsonPath, 'utf-8') : null;
  if (previous === json) {
    run.unchanged++;
    console.log(`  = ${configDisplayPath} (unchanged)`);
  } else {
    writeFileSync(opencodeJsonPath, json);
    run.updated++;
    console.log(`  ${previous === null ? '+' : '~'} ${configDisplayPath}`);
  }

  printInstallSummary('OpenCode', run);

  console.log(`
✅ Setup complete for OpenCode!

Next steps:
1. Restart OpenCode
2. Type: professor:new-topic to start learning
  `.trim());
}
