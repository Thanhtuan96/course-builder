import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, relative } from 'path';
import { resolveCourse } from './trail.js';
import { style } from '../registry-helpers.js';

const HEADER_RE = /^(\s*[-*]?\s*\*\*Capstone status\*\*\s*:?\s*).*$/mi;
const EMOJI_RE = /(⬜|🔄|✅|🔒)/;
const LIST_ROW_RE = /^\s*(?:[-*+]\s*)?(⬜|🔄|✅|🔒)/;

export const CAPSTONE_STATES = {
  locked: { emoji: '🔒', label: 'Locked', header: '🔒 Locked (complete all sections to unlock)' },
  active: { emoji: '🔄', label: 'In progress', header: '🔄 In progress' },
  done: { emoji: '✅', label: 'Complete', header: '✅ Complete' },
};

/** Keep the `**Capstone status**` header and the capstone row telling the same story. */
export function setCapstoneStatus(text, status) {
  const state = CAPSTONE_STATES[status];
  if (!state) throw new Error(`Unknown capstone status "${status}" — use locked, active or done.`);
  if (!HEADER_RE.test(text)) {
    throw new Error('No **Capstone status** line in COURSE.md — nothing was updated.');
  }

  const lines = text.replace(HEADER_RE, (m, prefix) => `${prefix}${state.header}`).split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!/capstone/i.test(lines[i])) continue;

    if (/^\s*\|.*\|\s*$/.test(lines[i])) {
      const cells = lines[i].split('|');
      const at = cells.findIndex((c, idx) =>
        idx > 0 && idx < cells.length - 1 && EMOJI_RE.test(c) && !/capstone/i.test(c));
      if (at === -1) continue;
      cells[at] = ` ${state.emoji} ${state.label} `;
      lines[i] = cells.join('|');
      continue;
    }

    if (LIST_ROW_RE.test(lines[i])) {
      lines[i] = lines[i].replace(EMOJI_RE, state.emoji);
    }
  }
  return lines.join('\n');
}

export function recordCapstoneStatus({ cwd, slug, status }) {
  if (!slug) throw new Error('Pass the course slug — capstone-status never guesses which course to write.');
  if (!status) throw new Error('Pass --set locked|active|done — nothing was updated.');
  const found = resolveCourse(cwd, slug);
  const path = join(found.dir, 'COURSE.md');
  if (!existsSync(path)) throw new Error(`No COURSE.md in ${found.dir}`);
  const next = setCapstoneStatus(readFileSync(path, 'utf-8'), status);
  writeFileSync(path, next);
  return { updated: true, path, section: found.slug, status };
}

function flagValue(args, name) {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] !== undefined && !args[i + 1].startsWith('--') ? args[i + 1] : null;
}

function positionals(args) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--set') { i++; continue; }
    if (!args[i].startsWith('--')) out.push(args[i]);
  }
  return out;
}

export async function run({ args = [], cwd = process.cwd() } = {}) {
  const slug = positionals(args)[0] || null;
  const json = args.includes('--json');
  try {
    const r = recordCapstoneStatus({ cwd, slug, status: flagValue(args, '--set') });
    if (json) console.log(JSON.stringify(r));
    else console.log(style('success', `Capstone status set to ${r.status} in ${relative(cwd, r.path)}`));
  } catch (err) {
    if (json) console.log(JSON.stringify({ error: err.message }));
    else console.error(style('error', err.message));
    process.exitCode = 1;
  }
}
