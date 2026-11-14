/**
 * RON-357 — the Coach/done flow ends cleanly, capstone rules hold, and LEARNING-LOG has one writer.
 *
 * One describe block per requirement in
 * `openspec/changes/ron-357-coach-done-flow/specs/**\/spec.md`.
 *
 * @vitest-environment node
 */
import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import {
  existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { appendVerdict, recordVerdict } from '../bin/commands/trail.js';
import { recordCapstoneStatus, setCapstoneStatus } from '../bin/commands/capstone-status.js';
import { parseCapstoneStatus, parseLearningLog, readCourse } from '../bin/course-reader.js';

const temps = [];
afterEach(() => { for (const d of temps.splice(0)) rmSync(d, { recursive: true, force: true }); });

const CLI = new URL('../bin/cli.js', import.meta.url).pathname;
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf-8');

const COURSE = `# 📚 Course: Playwright E2E

**Level**: beginner
**Kind**: programming
**Active exercise**: exercises/01-first-test.js
**Capstone status**: 🔒 Locked (complete all sections to unlock)

## 📖 Syllabus & Progress

| # | Section Title | Status | Completed |
|---|---|---|---|
| 1 | First test | 🔄 In progress | — |
| 2 | Locators | ⬜ Not started | — |
| 🏗️ | Capstone Project | 🔒 Locked | — |
`;

function mkCourse(slug = 'playwright-e2e') {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'cp-ron357-')));
  temps.push(root);
  const dir = join(root, 'learning', slug);
  mkdirSync(join(dir, 'exercises'), { recursive: true });
  writeFileSync(join(dir, 'COURSE.md'), COURSE);
  writeFileSync(join(dir, 'exercises', '01-first-test.js'), '// TODO\n');
  writeFileSync(join(dir, 'LECTURE.md'), '# Section 1: First test\n\n## Objectives\n- Write one test\n');
  return { root, dir };
}

const verdictEntry = (overrides = {}) => ({
  slug: 'playwright-e2e',
  section: '1 — First test',
  date: '2026-11-15',
  duration: '48 min',
  hardest: 'closures',
  answers: [
    { q: 'What was the hardest concept?', a: 'closures capturing loop variables' },
    { q: 'What happens when the input is empty?', a: 'I do not handle that yet' },
  ],
  verdict: 'solid',
  ...overrides,
});

describe('Professor is the only writer of LEARNING-LOG.md', () => {
  /** Positive write instructions aimed at the log, ignoring negations and Professor-as-actor lines. */
  function writeInstructions(text) {
    const bad = [];
    let inWrite = false;
    for (const line of text.split('\n')) {
      if (/^###\s+Write\b/i.test(line)) { inWrite = true; continue; }
      if (/^#{2,3}\s+/.test(line)) inWrite = false;
      if (!/LEARNING-LOG\.md/.test(line)) continue;
      const allowed = /never|do not|don't|no write|Professor (appends|records|writes|stores|is the only)/i;
      if (inWrite || (/(append|write|edit|update|store|save|record)/i.test(line) && !allowed.test(line))) {
        bad.push(line.trim());
      }
    }
    return bad;
  }

  it('RON-357 no agent except professor instructs writing LEARNING-LOG.md', () => {
    const dir = new URL('../agents/', import.meta.url);
    const agents = readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'professor.md');
    expect(agents.length).toBeGreaterThan(3);
    const offenders = agents.flatMap((f) =>
      writeInstructions(readFileSync(new URL(f, dir), 'utf-8')).map((line) => `${f}: ${line}`));
    expect(offenders).toEqual([]);
  });

  it('RON-357 coach.md hands the role to Professor and never tells the learner to re-run done', () => {
    const coach = read('agents/coach.md');
    expect(coach).not.toContain('Run `professor:done`');
    expect(coach).toContain("Say 'confirm'");
    expect(coach).toMatch(/```verdict/);
    expect(coach).toContain('"hardest"');
    expect(coach).toContain('"answers"');
    expect(coach).toMatch(/never write `LEARNING-LOG\.md`/i);
  });

  it('RON-357 agents/spotter.md no longer claims write access to the log', () => {
    const spotter = read('agents/spotter.md');
    expect(spotter).not.toMatch(/### Write[\s\S]*?LEARNING-LOG\.md/);
    expect(spotter).toMatch(/Professor (appends|records|writes)/);
  });

  it('RON-357 the Spotter agent passes the context JSON to Coach', () => {
    expect(read('agents/spotter.md')).toMatch(/context[\s\S]{0,80}verbatim/i);
  });

  it('RON-357 Navigator returns a thread block and Professor records it', () => {
    const nav = read('agents/navigator.md');
    expect(nav).toMatch(/```thread/);
    expect(nav).toContain('preferred_format');
    expect(nav).toMatch(/never write `LEARNING-LOG\.md`/i);
    const cmd = read('commands/professor/navigator.md');
    expect(cmd).toContain('## 🧭 Concept Thread');
    expect(cmd).toContain('**Preferred format:**');
    expect(cmd).toMatch(/Professor is the only writer/i);
  });
});

describe('Section entries use the parser-compatible template', () => {
  it('RON-357 appendVerdict writes an entry parseLearningLog returns', () => {
    const { text } = appendVerdict('', verdictEntry());
    expect(text).toContain('## 📝 Section Entries');
    expect(text).toContain('- Date: 2026-11-15');
    expect(text).toContain('- Hardest: closures');
    expect(text).toContain('- Duration: 48 min');
    expect(text).toContain('- Q: "What was the hardest concept?" → A: "closures capturing loop variables"');
    expect(text).toContain('- Verdict: solid');
    expect(parseLearningLog(text)).toEqual([
      { date: '2026-11-15', section: 'Section 1 — First test', verdict: 'solid' },
    ]);
  });

  it('RON-357 parses a hand-written entry that follows the template', () => {
    const log = '## 📝 Section Entries\n\n### Section 3 — Scope\n\n- Date: 2026-11-15\n- Verdict: solid\n';
    expect(parseLearningLog(log)).toEqual([
      { date: '2026-11-15', section: 'Section 3 — Scope', verdict: 'solid' },
    ]);
  });

  it('RON-357 recording a verdict twice for one section replaces its entry only', () => {
    let { text } = appendVerdict('', verdictEntry());
    ({ text } = appendVerdict(text, verdictEntry({ section: '2 — Locators', verdict: 'solid' })));
    ({ text } = appendVerdict(text, verdictEntry({ verdict: 'watch-this: boundary conditions' })));
    const entries = text.slice(text.indexOf('## 📝 Section Entries'));
    expect(entries.match(/^### Section 1 — First test$/gm)).toHaveLength(1);
    expect(entries.match(/^### Section 2 — Locators$/gm)).toHaveLength(1);
    expect(parseLearningLog(text)).toHaveLength(2);
    expect(parseLearningLog(text)[0].verdict).toContain('watch-this: boundary conditions');
  });
});

describe('A flagged verdict marks the section trail once', () => {
  it('RON-357 keeps exactly one watch-this line under the section trail', () => {
    let { text } = appendVerdict('', verdictEntry({ verdict: 'watch-this: boundary conditions' }));
    ({ text } = appendVerdict(text, verdictEntry({ verdict: 'watch-this: guard clauses' })));
    expect(text.match(/^⚠️ watch-this: /gm)).toHaveLength(1);
    expect(text).toContain('⚠️ watch-this: guard clauses');
    expect(text).toContain('## 🗣️ Reasoning Trail');
  });

  it('RON-357 a solid verdict does not add a watch line', () => {
    const { text } = appendVerdict('', verdictEntry());
    expect(text).not.toMatch(/^⚠️ watch-this: /m);
  });
});

describe('Learner text reaches CLI writers only through stdin', () => {
  it('RON-357 keeps $(...) and backticks literal through the verdict heredoc', () => {
    const { root, dir } = mkCourse();
    const json = JSON.stringify({
      section: '1 — First test',
      hardest: 'shells',
      answers: [{ q: 'What ran?', a: 'I ran $(touch pwned) and `id`' }],
      verdict: 'solid',
    });
    execFileSync('sh', ['-c',
      `node "${CLI}" verdict playwright-e2e --stdin <<'VERDICT_EOF'\n${json}\nVERDICT_EOF`],
    { cwd: root });
    const log = readFileSync(join(dir, 'LEARNING-LOG.md'), 'utf-8');
    expect(log).toContain('$(touch pwned) and `id`');
    expect(existsSync(join(root, 'pwned'))).toBe(false);
    expect(parseLearningLog(log)[0].verdict).toBe('solid');
  });

  it('RON-357 refuses missing slug, hardest, answers or a bad verdict and writes nothing', () => {
    const { root, dir } = mkCourse();
    const log = join(dir, 'LEARNING-LOG.md');
    expect(() => recordVerdict({ cwd: root, ...verdictEntry(), slug: null })).toThrow(/slug/);
    expect(() => recordVerdict({ cwd: root, ...verdictEntry(), hardest: '' })).toThrow(/hardest/);
    expect(() => recordVerdict({ cwd: root, ...verdictEntry(), answers: [] })).toThrow(/answers/);
    expect(() => recordVerdict({ cwd: root, ...verdictEntry(), verdict: 'maybe' })).toThrow(/Invalid verdict/);
    expect(existsSync(log)).toBe(false);
  });

  it('RON-357 recordVerdict writes the log the next context read sees', () => {
    const { root, dir } = mkCourse();
    const r = recordVerdict({ cwd: root, ...verdictEntry({ verdict: 'watch-this: boundary conditions' }) });
    expect(r).toMatchObject({
      recorded: true, path: join(dir, 'LEARNING-LOG.md'), verdict: '⚠️ watch-this: boundary conditions',
    });
    expect(parseLearningLog(readFileSync(r.path, 'utf-8'))[0].section).toBe('Section 1 — First test');
  });
});

describe('The capstone status header and table row move together', () => {
  it('RON-357 active and done update both lines and the parser sees them', () => {
    const active = setCapstoneStatus(COURSE, 'active');
    expect(active).toContain('**Capstone status**: 🔄 In progress');
    expect(active).toMatch(/\| 🏗️ \| Capstone Project \| 🔄 In progress \|/);
    expect(parseCapstoneStatus(active)).toBe('active');

    const done = setCapstoneStatus(active, 'done');
    expect(done).toContain('**Capstone status**: ✅ Complete');
    expect(done).toMatch(/\| 🏗️ \| Capstone Project \| ✅ Complete \|/);
    expect(parseCapstoneStatus(done)).toBe('done');
  });

  it('RON-357 rewrites a stale header that disagrees with a correct row', () => {
    const stale = COURSE
      .replace('🔄 In progress | —', '⬜ Not started | —')
      .replace('🔄 In progress', '✅ Done')
      .replace('| 🏗️ | Capstone Project | 🔒 Locked |', '| 🏗️ | Capstone Project | 🔄 In progress |');
    const fixed = setCapstoneStatus(stale, 'active');
    expect(fixed).toContain('**Capstone status**: 🔄 In progress');
    expect(fixed).toMatch(/\| 🏗️ \| Capstone Project \| 🔄 In progress \|/);
    expect(parseCapstoneStatus(fixed)).toBe('active');
  });

  it('RON-357 refuses a COURSE.md without a capstone status line', () => {
    expect(() => setCapstoneStatus('# Course\n', 'active')).toThrow(/Capstone status/);
  });

  it('RON-357 tolerates a course without a capstone row', () => {
    const listCourse = `# 📚 Course: T

**Capstone status**: 🔒 Locked (complete all sections to unlock)

## Sections
- 🔄 1. Intro
`;
    const active = setCapstoneStatus(listCourse, 'active');
    expect(active).toContain('**Capstone status**: 🔄 In progress');
    expect(active).not.toMatch(/Capstone Project/);
    const { root, dir } = mkCourse('list-course');
    writeFileSync(join(dir, 'COURSE.md'), listCourse);
    expect(recordCapstoneStatus({ cwd: root, slug: 'list-course', status: 'done' }).status).toBe('done');
    expect(readCourse(dir).capstoneStatus).toBe('done');
  });

  it('RON-357 recordCapstoneStatus updates the file and readCourse reads it back', () => {
    const { root, dir } = mkCourse();
    const r = recordCapstoneStatus({ cwd: root, slug: 'playwright-e2e', status: 'active' });
    expect(r.status).toBe('active');
    expect(readCourse(dir).capstoneStatus).toBe('active');
    expect(() => recordCapstoneStatus({ cwd: root, slug: null, status: 'done' })).toThrow(/slug/);
    expect(() => recordCapstoneStatus({ cwd: root, slug: 'playwright-e2e' })).toThrow(/--set/);
  });

  it('RON-357 the capstone-status CLI updates COURSE.md', () => {
    const { root, dir } = mkCourse();
    execFileSync(process.execPath, [CLI, 'capstone-status', 'playwright-e2e', '--set', 'done'], { cwd: root });
    expect(parseCapstoneStatus(readFileSync(join(dir, 'COURSE.md'), 'utf-8'))).toBe('done');
  });
});

describe('Coach hands the confirm step back and passes context', () => {
  it('RON-357 done.md and spotter.md fetch the context first', () => {
    for (const p of ['commands/professor/done.md', 'commands/professor/spotter.md']) {
      const text = read(p);
      expect(text).toContain('npx ronin-skillforce context');
      expect(text).toMatch(/exits non-zero/i);
    }
  });

  it('RON-357 done.md records the verdict through the CLI before completing', () => {
    const done = read('commands/professor/done.md');
    expect(done).toContain('npx ronin-skillforce verdict');
    expect(done).toContain("<<'VERDICT_EOF'");
    expect(done).toMatch(/say "?confirm/i);
    expect(done).toContain('capstone-status');
  });
});

describe('Next resumes a section already in progress', () => {
  it('RON-357 next.md prefers the 🔄 section and asks for done first', () => {
    const next = read('commands/professor/next.md');
    expect(next).toMatch(/🔄 In progress/);
    expect(next).toMatch(/finish it with `professor:done`/);
    expect(next).toContain('first section with status ⬜ Not started');
  });

  it('RON-357 SKILL.md teaches the same resume rule', () => {
    const skill = read('professor-skill/SKILL.md');
    expect(skill).toMatch(/resume the first section with status 🔄/);
  });
});

describe('Hint and stuck refuse during the capstone phase', () => {
  it('RON-357 hint.md and stuck.md carry the guard and point to discuss', () => {
    for (const p of ['commands/professor/hint.md', 'commands/professor/stuck.md']) {
      const text = read(p);
      expect(text).toMatch(/capstone phase/i);
      expect(text).toContain('professor:discuss');
      expect(text).toMatch(/refuse/i);
      expect(text).toMatch(/every\s+syllabus section is ✅ Done/);
    }
    expect(read('commands/professor/hint.md')).toMatch(/not capstone/i);
  });

  it('RON-357 done.md and capstone-review.md update the capstone status', () => {
    const done = read('commands/professor/done.md');
    expect(done).toContain('capstone-status');
    expect(done).toContain('--set active');
    expect(read('commands/professor/capstone-review.md')).toContain('--set done');
  });

  it('RON-357 SKILL.md points the capstone unlock at the status line', () => {
    expect(read('professor-skill/SKILL.md')).toMatch(/Capstone status\*\*/);
  });
});

describe('Agent tools match the rules', () => {
  const toolsOf = (p) => (read(p).match(/^tools:\s*(.+)$/m) || [])[1] || '';

  it('RON-357 professor can fetch and edit', () => {
    const tools = toolsOf('agents/professor.md');
    expect(tools).toContain('WebFetch');
    expect(tools).toContain('Edit');
  });

  it('RON-357 researcher can search', () => {
    expect(toolsOf('agents/researcher.md')).toContain('WebSearch');
  });
});

describe('CLI surface', () => {
  it('RON-357 help lists verdict and capstone-status', () => {
    const out = execFileSync(process.execPath, [CLI, 'help'], { encoding: 'utf-8' });
    expect(out).toContain('verdict');
    expect(out).toContain('capstone-status');
  });
});
