import { existsSync, mkdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  substituteTokens,
  generateCommandFiles,
  createInstallRun,
  writeManagedBlock,
  printInstallSummary,
} from './_shared.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = join(__dirname, '..', '..');

/** Returns true if Gemini CLI is present on this machine. */
export function detect() {
  return !!(
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    existsSync(join(process.env.HOME || '', '.gemini'))
  );
}

/** Install professor for Gemini CLI. scope = 'global' → ~/, 'local' → cwd/ */
export async function install(scope = 'local') {
  const base = scope === 'global' ? (process.env.HOME || '') : process.cwd();
  const run = createInstallRun();

  // 1. Create .gemini/ directory
  const geminiDir = join(base, '.gemini');
  if (!existsSync(geminiDir)) {
    mkdirSync(geminiDir, { recursive: true });
    console.log('✓ Created .gemini/ directory');
  }

  // 2. Refresh the Professor block in GEMINI.md (preamble + shared/SKILL.md), ask_user substituted
  const preamblePath = join(PLUGIN_DIR, 'templates', 'gemini', 'GEMINI.md');
  const skillPath = join(PLUGIN_DIR, 'shared', 'SKILL.md');
  const preamble = existsSync(preamblePath) ? readFileSync(preamblePath, 'utf-8') : '';
  const skill = readFileSync(skillPath, 'utf-8');
  const adapted = substituteTokens(`${preamble}\n${skill}`, 'gemini');

  // Global: GEMINI.md lives inside ~/.gemini/; local: GEMINI.md lives at cwd/ (Gemini CLI walks upward)
  const geminiMdPath = scope === 'global' ? join(geminiDir, 'GEMINI.md') : join(base, 'GEMINI.md');
  const geminiLabel = scope === 'global' ? '~/.gemini/GEMINI.md' : 'GEMINI.md';
  writeManagedBlock(geminiMdPath, adapted, run, geminiLabel);

  // 3. Generate .toml command files for Gemini CLI
  console.log('✓ Generating command files...');
  const commandsDir = scope === 'global'
    ? join(geminiDir, 'commands', 'professor')
    : join(base, '.gemini', 'commands', 'professor');
  generateCommandFiles(commandsDir, 'gemini', run);

  printInstallSummary('Gemini CLI', run);

  console.log(`
✅ Setup complete for Gemini CLI!

Next steps:
1. Restart Gemini
2. Type: professor:new-topic to start learning
  `.trim());
}
