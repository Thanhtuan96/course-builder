import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { copySharedFiles } from './_shared.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = join(__dirname, '..', '..');

/** Returns true if Claude Code is present on this machine. */
export function detect() {
  return !!(
    process.env.ANTHROPIC_API_KEY ||
    existsSync(join(process.env.HOME || '', '.claude'))
  );
}

/** Install professor plugin into .claude/ in the current working directory. */
export async function install() {
  const targetDir = join(process.cwd(), '.claude');

  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
    console.log('✓ Created .claude/ directory');
  } else {
    console.log('⚠️  .claude/ already exists. Merging...');
  }

  // Copy templates/claude/ files (plugin.json, settings.json)
  const templateDir = join(PLUGIN_DIR, 'templates', 'claude');
  if (existsSync(templateDir)) {
    _copyTemplateDir(templateDir, targetDir);
  }

  // Copy shared/ files (agents/, commands/, hooks/, SKILL.md) with no-op substitution
  copySharedFiles(targetDir, 'claude');

  console.log(`
✅ Setup complete for Claude Code!

Next steps:
1. Restart Claude Code
2. Run: professor:new-topic to start learning
  `.trim());
}

function _copyTemplateDir(src, dest, prefix = '') {
  for (const file of readdirSync(src)) {
    const srcPath = join(src, file);
    const destPath = join(dest, file);
    const label = prefix ? `${prefix}/${file}` : file;
    if (statSync(srcPath).isDirectory()) {
      if (!existsSync(destPath)) mkdirSync(destPath, { recursive: true });
      _copyTemplateDir(srcPath, destPath, label);  // recurse into subdirectories
    } else if (existsSync(destPath)) {
      console.log(`  ↔ ${label} (already exists)`);
    } else {
      writeFileSync(destPath, readFileSync(srcPath, 'utf-8'));
      console.log(`  + ${label}`);
    }
  }
}
