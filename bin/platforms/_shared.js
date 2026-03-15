import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Maps platform name → tool substitutions.
// null means: strip the AskUserQuestion call and replace with plain inline text.
export const TOOL_SUBSTITUTIONS = {
  claude:   { AskUserQuestion: 'AskUserQuestion' },  // no-op
  gemini:   { AskUserQuestion: 'ask_user' },
  opencode: { AskUserQuestion: null },
  cursor:   { AskUserQuestion: null },
};

/**
 * Replace platform-specific tool call names in file content.
 *
 * Handles all three occurrence forms found in shared/ files:
 *   1. Backtick-wrapped:  `AskUserQuestion`
 *   2. Bare:              AskUserQuestion
 *
 * For null values (cursor, opencode), replaces with "ask the user directly in chat"
 * so instructions remain readable without referencing a non-existent tool.
 * For string values (gemini), replaces with the platform tool name (preserving backticks).
 */
export function substituteTokens(content, platform) {
  const map = TOOL_SUBSTITUTIONS[platform];
  for (const [from, to] of Object.entries(map)) {
    if (to === null) {
      // Replace backtick-wrapped form first, then bare form
      content = content.replaceAll(`\`${from}\``, 'ask the user directly in chat');
      content = content.replaceAll(from, 'ask the user directly in chat');
    } else {
      // Replace backtick-wrapped form with backtick-wrapped replacement, then bare form
      content = content.replaceAll(`\`${from}\``, `\`${to}\``);
      content = content.replaceAll(from, to);
    }
  }
  return content;
}

/**
 * Recursively copy shared/ into targetDir, applying token substitution
 * to all .md and .js files.
 */
export function copySharedFiles(targetDir, platform) {
  const sharedDir = join(__dirname, '..', '..', 'shared');
  _copyRecursive(sharedDir, targetDir, platform);
}

function _copyRecursive(src, dest, platform) {
  if (!existsSync(src)) return;
  const stat = statSync(src);
  if (stat.isDirectory()) {
    if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
    for (const file of readdirSync(src)) {
      _copyRecursive(join(src, file), join(dest, file), platform);
    }
  } else if (!existsSync(dest)) {
    let content = readFileSync(src, 'utf-8');
    if (src.endsWith('.md') || src.endsWith('.js')) {
      content = substituteTokens(content, platform);
    }
    writeFileSync(dest, content);
  }
}
