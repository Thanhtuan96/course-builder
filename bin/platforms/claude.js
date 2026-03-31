import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { copyDirectoryFiles, copySharedFiles } from './_shared.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = join(__dirname, '..', '..');

/** Returns true if Claude Code is present on this machine. */
export function detect() {
  return !!(
    process.env.ANTHROPIC_API_KEY ||
    existsSync(join(process.env.HOME || '', '.claude'))
  );
}

/** Install professor plugin. scope = 'global' → ~/.claude/plugins/professor/, 'local' → cwd/.claude/plugins/professor/ */
export async function install(scope = 'local') {
  const targetDir = scope === 'global'
    ? join(process.env.HOME || '', '.claude', 'plugins', 'professor')
    : join(process.cwd(), '.claude', 'plugins', 'professor');

  const dirLabel = scope === 'global' ? '~/.claude/plugins/professor/' : '.claude/plugins/professor/';
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
    console.log(`✓ Created ${dirLabel} directory`);
  } else {
    console.log(`⚠️  ${dirLabel} already exists. Merging...`);
  }

  // Copy templates/claude/ files (plugin.json, settings.json)
  const templateDir = join(PLUGIN_DIR, 'templates', 'claude');
  if (existsSync(templateDir)) {
    _copyTemplateDir(templateDir, targetDir);
  }

  // Copy shared/ files (agents/, commands/, hooks/, SKILL.md) with no-op substitution
  copySharedFiles(targetDir, 'claude');

  // Copy resources/ files used by command fallbacks (e.g., static research templates)
  const resourcesDir = join(PLUGIN_DIR, 'resources');
  if (existsSync(resourcesDir)) {
    copyDirectoryFiles(resourcesDir, join(targetDir, 'resources'), 'claude', { substitute: false });
  }

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
