import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { substituteTokens } from './_shared.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = join(__dirname, '..', '..');

/** Returns true if a Cursor project is present in cwd. */
export function detect() {
  return existsSync(join(process.cwd(), '.cursor'));
}

/** Install professor for Cursor: writes .cursor/rules/professor.mdc. */
export async function install() {
  const rulesDir = join(process.cwd(), '.cursor', 'rules');
  if (!existsSync(rulesDir)) {
    mkdirSync(rulesDir, { recursive: true });
    console.log('✓ Created .cursor/rules/ directory');
  }

  const mdcPath = join(rulesDir, 'professor.mdc');
  if (existsSync(mdcPath)) {
    console.log('  ↔ .cursor/rules/professor.mdc (already exists)');
  } else {
    const frontmatterPath = join(PLUGIN_DIR, 'templates', 'cursor', 'professor.mdc');
    const frontmatter = existsSync(frontmatterPath)
      ? readFileSync(frontmatterPath, 'utf-8')
      : '---\ndescription: Socratic learning assistant - professor mode\nglobs: ""\nalwaysApply: false\n---\n';
    const skill = readFileSync(join(PLUGIN_DIR, 'shared', 'SKILL.md'), 'utf-8');
    const combined = frontmatter + '\n' + skill;
    const adapted = substituteTokens(combined, 'cursor');
    writeFileSync(mdcPath, adapted);
    console.log('  + .cursor/rules/professor.mdc');
  }

  console.log(`
✅ Setup complete for Cursor!

Next steps:
1. Restart Cursor
2. Type in chat: professor:new-topic to start learning
  `.trim());
}
