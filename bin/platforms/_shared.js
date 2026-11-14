import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  statSync,
  existsSync,
  copyFileSync,
} from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Markers that delimit a plugin-managed region inside a learner-editable file. */
export const BLOCK_START = '<!-- professor:start -->';
export const BLOCK_END = '<!-- professor:end -->';

/**
 * Counter for one setup run: what was created or updated, what was already current, and how
 * many files were backed up.
 * @returns {{ updated: number, unchanged: number, backedUp: number, backedUpPaths: Set<string> }}
 */
export function createInstallRun() {
  return { updated: 0, unchanged: 0, backedUp: 0, backedUpPaths: new Set() };
}

/**
 * Save the content a write is about to replace, at most once per run per file.
 * @param {string} dest
 * @param {{ backedUp: number, backedUpPaths: Set<string> }} run
 */
function _backupOnce(dest, run) {
  if (run.backedUpPaths.has(dest)) return;
  copyFileSync(dest, `${dest}.bak`);
  run.backedUpPaths.add(dest);
  run.backedUp++;
}

/**
 * Write a file the plugin owns: create it, leave it alone when it matches, otherwise back it up and
 * replace it. This is what makes re-running setup refresh an upgrade.
 * @param {string} dest
 * @param {string} content
 * @param {ReturnType<typeof createInstallRun>} run
 * @param {string} [label] path shown in the log
 * @returns {'created'|'updated'|'unchanged'}
 */
export function writeManagedFile(dest, content, run, label = dest) {
  mkdirSync(dirname(dest), { recursive: true });

  if (!existsSync(dest)) {
    writeFileSync(dest, content);
    run.updated++;
    console.log(`  + ${label}`);
    return 'created';
  }

  if (readFileSync(dest, 'utf-8') === content) {
    run.unchanged++;
    console.log(`  = ${label} (unchanged)`);
    return 'unchanged';
  }

  _backupOnce(dest, run);
  writeFileSync(dest, content);
  run.updated++;
  console.log(`  ~ ${label} (updated, backup saved)`);
  return 'updated';
}

/**
 * Refresh the marker-delimited Professor block inside a file the learner may also edit.
 * Text outside the markers is preserved; a file without markers gets the block appended.
 * @param {string} dest
 * @param {string} blockContent
 * @param {ReturnType<typeof createInstallRun>} run
 * @param {string} [label]
 * @returns {'created'|'updated'|'unchanged'}
 */
export function writeManagedBlock(dest, blockContent, run, label = dest) {
  const block = `${BLOCK_START}\n${blockContent}\n${BLOCK_END}`;
  mkdirSync(dirname(dest), { recursive: true });

  if (!existsSync(dest)) {
    writeFileSync(dest, `${block}\n`);
    run.updated++;
    console.log(`  + ${label}`);
    return 'created';
  }

  const current = readFileSync(dest, 'utf-8');
  const start = current.indexOf(BLOCK_START);
  const end = start === -1 ? -1 : current.indexOf(BLOCK_END, start);
  let next;
  if (start !== -1 && end !== -1) {
    next = current.slice(0, start) + block + current.slice(end + BLOCK_END.length);
  } else {
    next = `${current}${current.endsWith('\n') ? '\n' : '\n\n'}${block}\n`;
  }

  if (next === current) {
    run.unchanged++;
    console.log(`  = ${label} (unchanged)`);
    return 'unchanged';
  }

  _backupOnce(dest, run);
  writeFileSync(dest, next);
  run.updated++;
  console.log(`  ~ ${label} (updated, backup saved)`);
  return 'updated';
}

/**
 * True when the content is the skill document an older release wrote wholesale into a file.
 * @param {string} content
 * @returns {boolean}
 */
export function isLegacySkillDocument(content) {
  const frontmatter = content.match(/^---\n([\s\S]*?)\n---/);
  return !!frontmatter && /^name:\s*professor\s*$/m.test(frontmatter[1]);
}

/**
 * One summary line per platform run.
 * @param {string} platform
 * @param {ReturnType<typeof createInstallRun>} run
 */
export function printInstallSummary(platform, run) {
  console.log(
    `✎ Setup summary (${platform}): ${run.updated} updated, ` +
      `${run.unchanged} unchanged, ${run.backedUp} backed up.`
  );
}

// Maps platform name → tool substitutions.
// null means: strip the AskUserQuestion call and replace with plain inline text.
export const TOOL_SUBSTITUTIONS = {
  claude:   { AskUserQuestion: 'AskUserQuestion' },  // no-op
  gemini:   { AskUserQuestion: 'ask_user' },
  opencode: { AskUserQuestion: 'question' },
  cursor:   { AskUserQuestion: null },
};

/**
 * Replace platform-specific tool call names in file content.
 *
 * Handles all three occurrence forms found in shared/ files:
 *   1. Backtick-wrapped:  `AskUserQuestion`
 *   2. Bare:              AskUserQuestion
 *
 * For null values (cursor), replaces with "ask the user directly in chat"
 * so instructions remain readable without referencing a non-existent tool.
 * For string values (gemini → ask_user, opencode → question), replaces with the platform tool name (preserving backticks).
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
  const run = createInstallRun();
  _copyRecursive(sharedDir, targetDir, platform, true, run);
  return run;
}

/**
 * Recursively copy any directory into targetDir.
 * By default, applies token substitution to .md/.js files.
 */
export function copyDirectoryFiles(sourceDir, targetDir, platform, { substitute = true } = {}) {
  const run = createInstallRun();
  _copyRecursive(sourceDir, targetDir, platform, substitute, run);
  return run;
}

function _copyRecursive(src, dest, platform, substitute, run) {
  if (!existsSync(src)) return;
  const stat = statSync(src);
  if (stat.isDirectory()) {
    for (const file of readdirSync(src)) {
      _copyRecursive(join(src, file), join(dest, file), platform, substitute, run);
    }
  } else {
    let content = readFileSync(src, 'utf-8');
    if (substitute && (src.endsWith('.md') || src.endsWith('.js'))) {
      content = substituteTokens(content, platform);
    }
    writeManagedFile(dest, content, run);
  }
}

/**
 * Adapt agent file frontmatter for a target platform.
 *
 * Claude Code uses: tools (comma string), model: inherit, color: name
 * OpenCode requires:
 *   tools → object/record { ToolName: true, ... }  (schema: additionalProperties: boolean)
 *   color → dropped (Claude color names/hex are not reliably compatible)
 *   model: inherit → dropped
 *
 * Returns the adapted content string.
 */
export function adaptAgentFrontmatter(content, platform) {
  if (platform !== 'opencode') return content;

  // Split on frontmatter boundaries
  const lines = content.split('\n');
  if (lines[0].trim() !== '---') return content;
  const endIdx = lines.indexOf('---', 1);
  if (endIdx === -1) return content;

  const adapted = [];
  for (let i = 1; i < endIdx; i++) {
    const line = lines[i];

    // tools: Read, Write, Bash → tools record: { Read: true, Write: true, ... }
    const toolsMatch = line.match(/^tools:\s*(.+)/);
    if (toolsMatch) {
      const toolList = toolsMatch[1].split(',').map(t => t.trim()).filter(Boolean);
      adapted.push('tools:');
      for (const t of toolList) adapted.push(`  ${t}: true`);
      continue;
    }

    // color — drop entirely (OpenCode only accepts 6-digit hex or specific enum values)
    if (/^color:\s*/.test(line)) continue;

    // model: inherit → drop (OpenCode needs a real model ID or omit)
    if (/^model:\s*inherit\s*$/.test(line)) continue;

    adapted.push(line);
  }

  return ['---', ...adapted, '---', ...lines.slice(endIdx + 1)].join('\n');
}

/**
 * Parse YAML frontmatter from a Markdown file content.
 * Returns { description, body } where body is the content after the frontmatter block.
 */
function _parseFrontmatter(content) {
  const lines = content.split('\n');
  if (lines[0].trim() !== '---') {
    return { description: '', body: content };
  }
  const endIdx = lines.indexOf('---', 1);
  if (endIdx === -1) {
    return { description: '', body: content };
  }
  const frontmatterLines = lines.slice(1, endIdx);
  const bodyLines = lines.slice(endIdx + 1);

  // Extract description — handles single-line and YAML block scalar (> or |)
  let description = '';
  for (let i = 0; i < frontmatterLines.length; i++) {
    const match = frontmatterLines[i].match(/^description:\s*(.*)/);
    if (match) {
      const inline = match[1].trim();
      if (inline === '>' || inline === '|') {
        // Block scalar: collect indented continuation lines
        const parts = [];
        for (let j = i + 1; j < frontmatterLines.length; j++) {
          if (/^\s+/.test(frontmatterLines[j])) {
            parts.push(frontmatterLines[j].trim());
          } else {
            break;
          }
        }
        description = parts.join(' ');
      } else {
        // Inline value — strip surrounding quotes if present
        description = inline.replace(/^["']|["']$/g, '');
      }
      break;
    }
  }

  // Drop leading blank line from body
  const body = bodyLines.join('\n').replace(/^\n/, '');
  return { description: description.trim(), body };
}

/**
 * Read every .md file from shared/commands/professor/, apply substituteTokens(),
 * then write per-platform command files into targetDir.
 *
 * platform = 'gemini'   → writes targetDir/<slug>.toml (arguments become {{args}})
 * platform = 'opencode' → writes targetDir/professor-<slug>.md
 *
 * @param {string} targetDir
 * @param {'gemini'|'opencode'} platform
 * @param {ReturnType<typeof createInstallRun>} [run]
 */
export function generateCommandFiles(targetDir, platform, run = createInstallRun()) {
  const sharedDir = join(__dirname, '..', '..', 'shared', 'commands', 'professor');
  if (!existsSync(sharedDir)) return run;

  for (const file of readdirSync(sharedDir)) {
    if (!file.endsWith('.md')) continue;
    const stem = file.slice(0, -3); // strip .md

    let raw = readFileSync(join(sharedDir, file), 'utf-8');
    raw = substituteTokens(raw, platform);
    if (platform === 'gemini') raw = raw.replaceAll('$ARGUMENTS', '{{args}}');
    const { description, body } = _parseFrontmatter(raw);

    if (platform === 'gemini') {
      const filename = `${stem}.toml`;
      const output = `description = "${description}"\n\nprompt = """\n${body}"""\n`;
      writeManagedFile(join(targetDir, filename), output, run, filename);
    } else if (platform === 'opencode') {
      const filename = `professor-${stem}.md`;
      const output = `---\ndescription: ${description}\nsubtask: true\n---\n\n${body}`;
      writeManagedFile(join(targetDir, filename), output, run, filename);
    }
  }

  return run;
}
