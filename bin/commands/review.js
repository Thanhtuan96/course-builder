/**
 * `course-professor review [--limit 20]` (CLI-06) — flashcard review in the terminal.
 *
 * Cards live in the shared Studio SQLite DB (`~/.professor/professor.db`) and are graded through
 * the same repository as Studio (`studio/src/lib/repo/index.js`), so SM-2 scheduling, the
 * `reviews` row and the activity log are identical whether you review here or in the browser.
 *
 * TTY: front → Space/Enter flips → 1 again · 2 hard · 3 good · 4 easy · q to quit, with a summary.
 * Non-TTY: prints the due count and exits (safe for scripts/CI).
 */
import { installStudioStore } from '../studio-store.js';
import { useAdapter, listDueCards, gradeCard, logActivity } from '../../studio/src/lib/repo/index.js';

export const DEFAULT_LIMIT = 20;

/** 1–4 keys → repository grades (0 again | 1 hard | 2 good | 3 easy). */
export const GRADE_BY_KEY = { 1: 0, 2: 1, 3: 2, 4: 3 };
export const GRADE_LABELS = ['again', 'hard', 'good', 'easy'];

/**
 * @param {string[]} [args]
 * @returns {{ limit: number }}
 */
export function parseReviewArgs(args = []) {
  const valueOf = (name, fallback) => {
    const eq = args.find((a) => a.startsWith(`${name}=`));
    if (eq) return eq.slice(name.length + 1);
    const i = args.indexOf(name);
    if (i !== -1 && args[i + 1] && !args[i + 1].startsWith('--')) return args[i + 1];
    return fallback;
  };
  const n = Number.parseInt(valueOf('--limit', String(DEFAULT_LIMIT)), 10);
  return { limit: Number.isInteger(n) && n > 0 ? n : DEFAULT_LIMIT };
}

/** Soonest future `due_at` across all live cards, or null. */
export function nextDueAt(cards, now = Date.now()) {
  const at = typeof now === 'number' ? now : Date.parse(now);
  let soonest = null;
  for (const card of cards || []) {
    const due = Date.parse(card.due_at);
    if (Number.isNaN(due) || due <= at) continue;
    if (soonest === null || due < soonest) soonest = due;
  }
  return soonest;
}

/** @param {number|null} due @returns {string} */
export function emptyStateMessage(due) {
  if (!due) return 'All caught up — no cards scheduled.';
  return `All caught up — next card due ${new Date(due).toISOString()}`;
}

/**
 * @param {object} ctx
 * @param {string[]} [ctx.args]
 * @param {object} [ctx.chalk]
 * @param {(type:string,text:string)=>string} [ctx.style]
 * @param {object} [ctx.store] inject a StorageAdapter (tests); otherwise the real SQLite store
 * @param {boolean} [ctx.tty] force TTY/non-TTY behaviour
 * @param {number} [ctx.now]
 */
export async function run(ctx = {}) {
  const { args = [], chalk, style = (t, m) => m, tty, now = Date.now() } = ctx;
  const { limit } = parseReviewArgs(args);

  const ownStore = !ctx.store;
  const store = ctx.store || (await installStudioStore());
  useAdapter(store);
  const interactive = tty ?? Boolean(process.stdin.isTTY && process.stdout.isTTY);

  try {
    const due = (await listDueCards(now)).slice(0, limit);

    if (!interactive) {
      const all = await store.list('cards', { orderBy: { field: 'due_at', dir: 'asc' } });
      if (due.length === 0) {
        const upcoming = nextDueAt(all, now);
        console.log('');
        console.log(style('success', emptyStateMessage(upcoming)));
        console.log('');
      } else {
        console.log('');
        console.log(style('info', `${due.length} card${due.length === 1 ? '' : 's'} due. Run in an interactive terminal to review.`));
        console.log('');
      }
      return { due: due.length, reviewed: 0 };
    }

    if (due.length === 0) {
      const all = await store.list('cards', { orderBy: { field: 'due_at', dir: 'asc' } });
      console.log('');
      console.log(style('success', emptyStateMessage(nextDueAt(all, now))));
      console.log('');
      return { due: 0, reviewed: 0 };
    }

    return await runInteractive({ cards: due, style, chalk });
  } finally {
    if (ownStore && store.close) store.close();
  }
}

/**
 * Interactive key-driven loop. Returns a summary.
 * @param {{ cards: object[], style: Function, chalk?: object }} opts
 */
async function runInteractive({ cards, style, chalk }) {
  const stdin = process.stdin;
  const stdout = process.stdout;
  const wasRaw = Boolean(stdin.isRaw);
  stdin.setRawMode?.(true);
  stdin.resume?.();

  const summary = { due: cards.length, reviewed: 0, again: 0, hard: 0, good: 0, easy: 0 };
  let index = 0;
  let flipped = false;
  let busy = false;

  const clear = () => stdout.write('\x1b[2J\x1b[H');
  const line = (text = '') => stdout.write(`${text}\n`);

  const renderFront = () => {
    const card = cards[index];
    clear();
    line(chalk ? chalk.bold(`Card ${index + 1}/${cards.length}`) : `Card ${index + 1}/${cards.length}`);
    line('');
    line(card.front || '(empty front)');
    line('');
    line(style('info', 'Space/Enter to flip · q to quit'));
  };

  const renderBack = () => {
    const card = cards[index];
    clear();
    line(chalk ? chalk.bold(`Card ${index + 1}/${cards.length}`) : `Card ${index + 1}/${cards.length}`);
    line('');
    line(card.front || '(empty front)');
    line(chalk ? chalk.dim('─'.repeat(20)) : '─'.repeat(20));
    line(card.back || '(empty back)');
    line('');
    line(style('info', '1 again · 2 hard · 3 good · 4 easy · q to quit'));
  };

  const finish = () => {
    return new Promise((resolve) => {
      stdin.off('data', onData);
      try {
        stdin.setRawMode?.(wasRaw);
      } catch { /* ignore */ }
      stdin.pause?.();
      clear();
      line(chalk ? chalk.bold('Review summary') : 'Review summary');
      line(`  reviewed: ${summary.reviewed}`);
      line(`  again: ${summary.again}  hard: ${summary.hard}  good: ${summary.good}  easy: ${summary.easy}`);
      line('');
      resolve(summary);
    });
  };

  async function onData(buffer) {
    if (busy) return;
    const key = buffer.toString();
    if (key === '\u0003' || key === 'q' || key === 'Q') {
      busy = true;
      resolveFinish(await finish());
      return;
    }
    if (!flipped && (key === ' ' || key === '\r' || key === '\n' || key === 'f')) {
      flipped = true;
      renderBack();
      return;
    }
    if (flipped && GRADE_BY_KEY[key] !== undefined) {
      busy = true;
      const grade = GRADE_BY_KEY[key];
      try {
        await gradeCard(cards[index].id, grade);
        await logActivity('review', cards[index].id);
      } catch (err) {
        line(style('error', `Could not grade card: ${err.message}`));
      }
      summary.reviewed += 1;
      summary[GRADE_LABELS[grade]] += 1;
      index += 1;
      flipped = false;
      busy = false;
      if (index >= cards.length) {
        resolveFinish(await finish());
      } else {
        renderFront();
      }
    }
  }

  let resolveFinish = () => {};
  const result = new Promise((resolve) => {
    resolveFinish = resolve;
  });

  renderFront();
  stdin.on('data', onData);
  return result;
}
