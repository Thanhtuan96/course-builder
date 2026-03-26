import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { substituteTokens, generateCommandFiles } from './_shared.js';

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
  // 1. Create .gemini/ directory
  const geminiDir = join(base, '.gemini');
  if (!existsSync(geminiDir)) {
    mkdirSync(geminiDir, { recursive: true });
    console.log('✓ Created .gemini/ directory');
  }

  // 2. Compile GEMINI.md from preamble + shared/SKILL.md, with ask_user substitution
  const preamblePath = join(PLUGIN_DIR, 'templates', 'gemini', 'GEMINI.md');
  const skillPath = join(PLUGIN_DIR, 'shared', 'SKILL.md');
  const preamble = existsSync(preamblePath) ? readFileSync(preamblePath, 'utf-8') : '';
  const skill = readFileSync(skillPath, 'utf-8');
  const professorBlock =
    `<!-- professor:start -->\n${preamble}\n${skill}\n<!-- professor:end -->`;
  const adapted = substituteTokens(professorBlock, 'gemini');

  // Global: GEMINI.md lives inside ~/.gemini/; local: GEMINI.md lives at cwd/ (Gemini CLI walks upward)
  const geminiMdPath = scope === 'global' ? join(geminiDir, 'GEMINI.md') : join(base, 'GEMINI.md');
  if (existsSync(geminiMdPath)) {
    const existing = readFileSync(geminiMdPath, 'utf-8');
    if (existing.includes('<!-- professor:start -->')) {
      console.log('  ↔ GEMINI.md (professor block already present, skipping)');
    } else {
      writeFileSync(geminiMdPath, existing + '\n\n' + adapted);
      console.log('  + GEMINI.md (professor block appended to existing file)');
    }
  } else {
    writeFileSync(geminiMdPath, adapted);
    console.log('  + GEMINI.md');
  }

  // 3. Generate .toml command files for Gemini CLI
  const commandsDir = scope === 'global'
    ? join(geminiDir, 'commands', 'professor')
    : join(base, '.gemini', 'commands', 'professor');
  generateCommandFiles(commandsDir, 'gemini');

  console.log(`
✅ Setup complete for Gemini CLI!

Next steps:
1. Restart Gemini
2. Type: professor:new-topic to start learning
  `.trim());
}
