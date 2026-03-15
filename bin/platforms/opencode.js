import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { substituteTokens } from './_shared.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = join(__dirname, '..', '..');

/** Returns true if an OpenCode project is present in cwd. */
export function detect() {
  return (
    existsSync(join(process.cwd(), '.opencode')) ||
    existsSync(join(process.cwd(), 'opencode.json'))
  );
}

/** Install professor for OpenCode. scope = 'global' → ~/.opencode/, 'local' → cwd/.opencode/ */
export async function install(scope = 'local') {
  const base = scope === 'global' ? (process.env.HOME || '') : process.cwd();
  const targetDir = join(base, '.opencode');
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
    console.log('✓ Created .opencode/ directory');
  }

  // 1. Write .opencode/professor.md with null substitution (inline text questions)
  const professorMdPath = join(targetDir, 'professor.md');
  if (!existsSync(professorMdPath)) {
    const skill = readFileSync(join(PLUGIN_DIR, 'shared', 'SKILL.md'), 'utf-8');
    const adapted = substituteTokens(skill, 'opencode');
    writeFileSync(professorMdPath, adapted);
    console.log('  + .opencode/professor.md');
  } else {
    console.log('  ↔ .opencode/professor.md (already exists)');
  }

  // 2. Read or create .opencode/opencode.json and merge instructions entry
  const opencodeJsonPath = join(targetDir, 'opencode.json');
  let config = {};
  if (existsSync(opencodeJsonPath)) {
    try { config = JSON.parse(readFileSync(opencodeJsonPath, 'utf-8')); } catch {}
  } else {
    const templatePath = join(PLUGIN_DIR, 'templates', 'opencode', 'opencode.json');
    if (existsSync(templatePath)) {
      try { config = JSON.parse(readFileSync(templatePath, 'utf-8')); } catch {}
    }
  }

  const instructionsEntry = scope === 'global'
    ? join(base, '.opencode', 'professor.md')
    : '.opencode/professor.md';
  if (!config.$schema) config.$schema = 'https://opencode.ai/config.json';
  if (!Array.isArray(config.instructions)) config.instructions = [];
  if (!config.instructions.includes(instructionsEntry)) {
    config.instructions.push(instructionsEntry);
  }

  writeFileSync(opencodeJsonPath, JSON.stringify(config, null, 2) + '\n');
  console.log('  + .opencode/opencode.json');

  console.log(`
✅ Setup complete for OpenCode!

Next steps:
1. Restart OpenCode
2. Type: professor:new-topic to start learning
  `.trim());
}
