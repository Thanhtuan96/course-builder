import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { substituteTokens } from './_shared.js';

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
  // 1. Create .gemini/ and write settings.json
  const geminiDir = join(base, '.gemini');
  if (!existsSync(geminiDir)) {
    mkdirSync(geminiDir, { recursive: true });
    console.log('✓ Created .gemini/ directory');
  }

  const settingsSrc = join(PLUGIN_DIR, 'templates', 'gemini', 'settings.json');
  const settingsDest = join(geminiDir, 'settings.json');
  if (!existsSync(settingsDest) && existsSync(settingsSrc)) {
    writeFileSync(settingsDest, readFileSync(settingsSrc, 'utf-8'));
    console.log('  + .gemini/settings.json');
  } else if (existsSync(settingsDest)) {
    console.log('  ↔ .gemini/settings.json (already exists)');
  }

  // 2. Compile GEMINI.md from preamble + shared/SKILL.md, with ask_user substitution
  const preamblePath = join(PLUGIN_DIR, 'templates', 'gemini', 'GEMINI.md');
  const skillPath = join(PLUGIN_DIR, 'shared', 'SKILL.md');
  const preamble = existsSync(preamblePath) ? readFileSync(preamblePath, 'utf-8') : '';
  const skill = readFileSync(skillPath, 'utf-8');
  const professorBlock =
    `<!-- professor:start -->\n${preamble}\n${skill}\n<!-- professor:end -->`;
  const adapted = substituteTokens(professorBlock, 'gemini');

  const geminiMdPath = join(base, 'GEMINI.md');
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

  console.log(`
✅ Setup complete for Gemini CLI!

Next steps:
1. Restart Gemini
2. Type: professor:new-topic to start learning
  `.trim());
}
