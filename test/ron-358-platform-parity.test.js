/**
 * RON-358 — Gemini, OpenCode and Cursor receive the current Markdown and the same flows as
 * Claude Code.
 *
 * One describe block per requirement in
 * `openspec/changes/ron-358-platform-parity/specs/**\/spec.md`.
 *
 * @vitest-environment node
 */
import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

import {
  createInstallRun,
  isLegacySkillDocument,
  substituteTokens,
  writeManagedBlock,
  writeManagedFile,
} from '../bin/platforms/_shared.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const read = (rel) => readFileSync(join(ROOT, rel), 'utf-8');

/** Every file under the given repository-relative directories. */
function walk(...dirs) {
  const out = [];
  const visit = (rel) => {
    const abs = join(ROOT, rel);
    if (statSync(abs).isDirectory()) {
      for (const name of readdirSync(abs)) visit(join(rel, name));
    } else {
      out.push(rel);
    }
  };
  for (const dir of dirs) visit(dir);
  return out;
}

const CANONICAL = [...walk('agents', 'commands/professor', 'professor-skill'), ...walk('shared')];

/** The `### \`professor:<command>\`` section of SKILL.md, up to the next heading. */
function skillSection(command) {
  const lines = read('professor-skill/SKILL.md').split('\n');
  const start = lines.findIndex((line) => line.trim() === `### \`professor:${command}\``);
  expect(start, `SKILL.md has a professor:${command} section`).toBeGreaterThan(-1);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^###\s/.test(line));
  return [lines[start], ...(end === -1 ? rest : rest.slice(0, end))].join('\n');
}

/** The `npx ronin-skillforce <command>` calls named in a text. */
function cliCalls(text) {
  return [...new Set([...text.matchAll(/npx ronin-skillforce\s+([a-z][a-z-]*)/g)].map((m) => m[1]))]
    .sort();
}

const COACH_FALLBACK =
  'If no Coach agent is available on this platform, run the Coach flow below inline.';
const NAVIGATOR_FALLBACK =
  'If no Navigator agent is available on this platform, run the Navigator flow below inline.';
const AGENT_INVOCATIONS = [/`\/coach`/, /`@coach`/, /`\/navigator`/, /`@navigator`/];

describe('The command prefix is spelled professor:', () => {
  it('RON-358 canonical content has no profesor: misspelling', () => {
    const offenders = CANONICAL.filter((rel) => !rel.startsWith('shared/'))
      .flatMap((rel) => read(rel).split('\n')
        .map((line, i) => (line.includes('profesor:') ? `${rel}:${i + 1}: ${line.trim()}` : null))
        .filter(Boolean));
    expect(offenders).toEqual([]);
  });

  it('RON-358 shipped shared/ content has no profesor: misspelling', () => {
    const offenders = walk('shared')
      .flatMap((rel) => read(rel).split('\n')
        .map((line, i) => (line.includes('profesor:') ? `${rel}:${i + 1}: ${line.trim()}` : null))
        .filter(Boolean));
    expect(offenders).toEqual([]);
  });
});

describe('SKILL.md mirrors the command files it restates', () => {
  it('RON-358 done names the same CLI steps as the done command', () => {
    expect(cliCalls(skillSection('done'))).toEqual(cliCalls(read('commands/professor/done.md')));
    expect(cliCalls(skillSection('done'))).toEqual(
      ['capstone-status', 'context', 'save', 'verdict']
    );
  });

  it('RON-358 next names the same CLI steps as the next command', () => {
    expect(cliCalls(skillSection('next'))).toEqual(cliCalls(read('commands/professor/next.md')));
    expect(cliCalls(skillSection('next'))).toEqual(['save']);
  });

  it('RON-358 review names the same CLI steps as the review command', () => {
    expect(cliCalls(skillSection('review'))).toEqual(cliCalls(read('commands/professor/review.md')));
    expect(cliCalls(skillSection('review'))).toEqual(['context', 'trail']);
  });

  it('RON-358 next covers resume, archive, exercise, Active exercise and the spotter reminder', () => {
    const next = skillSection('next');
    for (const needle of ['In progress', 'lectures/', 'exercises/', 'Active exercise', 'spotter']) {
      expect(next, needle).toContain(needle);
    }
  });
});

describe('SKILL.md is sufficient without command files', () => {
  it('RON-358 completing a section needs only what SKILL.md says', () => {
    const done = skillSection('done');
    for (const needle of [
      'Coach gate', 'verdict', 'confirm', 'capstone-status', 'SCHEDULE.md',
      'Active exercise', 'COURSE.md',
    ]) {
      expect(done, needle).toContain(needle);
    }
  });

  it('RON-358 starting a section needs only what SKILL.md says', () => {
    const next = skillSection('next');
    for (const needle of ['resume first', 'research first', 'LECTURE.md', 'exercises/', 'save']) {
      expect(next.toLowerCase(), needle).toContain(needle.toLowerCase());
    }
  });
});

describe('Every agent hand-off states the inline fallback', () => {
  it('RON-358 every delegating command carries the Coach sentence', () => {
    for (const name of ['review', 'done', 'stuck', 'spotter']) {
      expect(read(`commands/professor/${name}.md`), name).toContain(COACH_FALLBACK);
    }
  });

  it('RON-358 SKILL.md carries it for Coach and for Navigator', () => {
    const doc = read('professor-skill/SKILL.md');
    expect(doc).toContain(COACH_FALLBACK);
    expect(doc).toContain(NAVIGATOR_FALLBACK);
  });

  it('RON-358 the Navigator hand-offs carry the Navigator sentence', () => {
    expect(read('commands/professor/navigator.md')).toContain(NAVIGATOR_FALLBACK);
    expect(read('agents/navigator.md')).toContain('If no Navigator agent is available on this platform');
    expect(read('agents/professor.md')).toContain('If no Navigator agent is available');
  });
});

describe('The fallback flow is self-contained', () => {
  it('RON-358 review and spotter can complete inline', () => {
    for (const rel of ['commands/professor/review.md', 'commands/professor/spotter.md']) {
      const doc = read(rel);
      expect(doc, rel).toContain("what do you think about it");
      expect(doc, rel).toContain('trail');
    }
  });

  it('RON-358 done can complete inline', () => {
    const doc = read('commands/professor/done.md');
    expect(doc).toContain(COACH_FALLBACK);
    expect(doc).toContain('hardest concept for you');
    expect(doc).toContain('verdict');
  });
});

describe('Direct agent invocation is offered on Claude Code only', () => {
  it('RON-358 no unqualified /coach, @coach, /navigator or @navigator', () => {
    const offenders = [];
    for (const rel of CANONICAL) {
      if (rel.startsWith('shared/')) continue;
      read(rel).split('\n').forEach((line, i) => {
        if (!AGENT_INVOCATIONS.some((re) => re.test(line))) return;
        if (/claude/i.test(line)) return;
        offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('RON-358 non-Claude platforms are told to run the flow instead', () => {
    const professorAgent = read('agents/professor.md');
    expect(professorAgent).toMatch(/Claude Code only/);
    expect(professorAgent).toMatch(/Gemini CLI, OpenCode and Cursor install no sub-agents/);
    expect(read('agents/navigator.md')).toMatch(/no agent transition and no `\/agent` command/);
  });
});

// ─── Platform setup, refresh and rendering ──────────────────────────────────────────────────────

const CLI = join(ROOT, 'bin', 'cli.js');
const temps = [];

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A throwaway HOME that is also the working directory of the setup run. */
function mkHome() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'cp-ron358-')));
  temps.push(dir);
  return dir;
}

/** Run `skillforce setup <platform> --local` with HOME pointed at the fixture. */
function setup(home, platform) {
  return execFileSync(process.execPath, [CLI, 'setup', platform, '--local'], {
    cwd: home,
    env: { ...process.env, HOME: home, ANTHROPIC_API_KEY: '', GEMINI_API_KEY: '', GOOGLE_API_KEY: '' },
    encoding: 'utf-8',
  });
}

const summary = (out, platform) => {
  const match = out.match(
    new RegExp(`Setup summary \\(${platform}\\): (\\d+) updated, (\\d+) unchanged, (\\d+) backed up\\.`)
  );
  expect(match, `summary line for ${platform} in:\n${out}`).not.toBeNull();
  const [, updated, unchanged, backedUp] = match;
  return { updated: Number(updated), unchanged: Number(unchanged), backedUp: Number(backedUp) };
};

describe('Managed writes refresh, back up and count', () => {
  it('RON-358 writeManagedFile creates, leaves an identical file alone and backs up a change once', () => {
    const dir = mkHome();
    const dest = join(dir, 'nested', 'managed.md');
    const run = createInstallRun();

    expect(writeManagedFile(dest, 'v1', run)).toBe('created');
    expect(writeManagedFile(dest, 'v1', run)).toBe('unchanged');
    expect(writeManagedFile(dest, 'v2', run)).toBe('updated');

    expect(readFileSync(dest, 'utf-8')).toBe('v2');
    expect(readFileSync(`${dest}.bak`, 'utf-8')).toBe('v1');
    expect(run).toMatchObject({ updated: 2, unchanged: 1, backedUp: 1 });
  });

  it('RON-358 writeManagedBlock replaces only the marker block and keeps the rest', () => {
    const dir = mkHome();
    const dest = join(dir, 'AGENTS.md');
    writeFileSync(dest, '# Learner notes\n\nkeep me\n\n');
    const run = createInstallRun();

    writeManagedBlock(dest, 'v1', run);
    const first = readFileSync(dest, 'utf-8');
    expect(first.startsWith('# Learner notes\n\nkeep me\n\n')).toBe(true);
    expect(first).toContain('<!-- professor:start -->\nv1\n<!-- professor:end -->');

    expect(writeManagedBlock(dest, 'v1', run)).toBe('unchanged');
    writeManagedBlock(dest, 'v2', run);

    const next = readFileSync(dest, 'utf-8');
    expect(next).toContain('v2');
    expect(next).not.toContain('\nv1\n');
    expect(next.startsWith('# Learner notes\n\nkeep me\n\n')).toBe(true);
    expect(run).toMatchObject({ updated: 2, unchanged: 1, backedUp: 1 });
  });

  it('RON-358 isLegacySkillDocument only recognises our own earlier skill file', () => {
    expect(isLegacySkillDocument(read('shared/SKILL.md'))).toBe(true);
    expect(isLegacySkillDocument('# Team rules\n\nname: professor\n')).toBe(false);
    expect(isLegacySkillDocument('---\nname: other\n---\n')).toBe(false);
  });
});

describe('Setup rewrites the files it manages on every run', () => {
  it('RON-358 Claude Code refreshes a changed managed file and counts unchanged ones', () => {
    const home = mkHome();
    setup(home, 'claude');
    const managed = join(home, '.claude', 'agents', 'coach.md');
    writeFileSync(managed, 'stale agent\n');

    const run1 = summary(setup(home, 'claude'), 'Claude Code');
    expect(readFileSync(managed, 'utf-8')).toContain('Coach Agent');
    expect(readFileSync(`${managed}.bak`, 'utf-8')).toBe('stale agent\n');
    expect(run1.updated).toBe(1);
    expect(run1.backedUp).toBe(1);
    expect(run1.unchanged).toBeGreaterThan(20);

    const run2 = summary(setup(home, 'claude'), 'Claude Code');
    expect(run2).toMatchObject({ updated: 0, backedUp: 0 });
  });

  it('RON-358 Gemini CLI refreshes a changed .toml command and the GEMINI.md block', () => {
    const home = mkHome();
    setup(home, 'gemini');
    const toml = join(home, '.gemini', 'commands', 'professor', 'done.toml');
    writeFileSync(toml, 'stale toml\n');

    const run = summary(setup(home, 'gemini'), 'Gemini CLI');
    expect(readFileSync(toml, 'utf-8')).not.toContain('stale toml');
    expect(readFileSync(`${toml}.bak`, 'utf-8')).toBe('stale toml\n');
    expect(run.updated).toBe(1);
    expect(run.backedUp).toBe(1);
    expect(summary(setup(home, 'gemini'), 'Gemini CLI')).toMatchObject({ updated: 0, backedUp: 0 });
  });

  it('RON-358 OpenCode refreshes a changed command and agent file', () => {
    const home = mkHome();
    setup(home, 'opencode');
    const command = join(home, '.opencode', 'commands', 'professor-done.md');
    const agent = join(home, '.opencode', 'agents', 'professor.md');
    writeFileSync(command, 'stale command\n');
    writeFileSync(agent, 'stale agent\n');

    const run = summary(setup(home, 'opencode'), 'OpenCode');
    expect(readFileSync(command, 'utf-8')).not.toContain('stale command');
    expect(readFileSync(agent, 'utf-8')).not.toContain('stale agent');
    expect(existsSync(`${command}.bak`)).toBe(true);
    expect(existsSync(`${agent}.bak`)).toBe(true);
    expect(run.updated).toBeGreaterThanOrEqual(2);
    expect(run.backedUp).toBeGreaterThanOrEqual(2);
    expect(summary(setup(home, 'opencode'), 'OpenCode')).toMatchObject({ updated: 0, backedUp: 0 });
  });

  it('RON-358 Cursor refreshes the professor.mdc rules file', () => {
    const home = mkHome();
    setup(home, 'cursor');
    const mdc = join(home, '.cursor', 'rules', 'professor.mdc');
    writeFileSync(mdc, 'stale rules\n');

    const run = summary(setup(home, 'cursor'), 'Cursor');
    expect(readFileSync(mdc, 'utf-8')).toContain('Professor Skill');
    expect(readFileSync(`${mdc}.bak`, 'utf-8')).toBe('stale rules\n');
    expect(run).toMatchObject({ updated: 1, backedUp: 1 });
    expect(summary(setup(home, 'cursor'), 'Cursor')).toMatchObject({ updated: 0, backedUp: 0 });
  });
});

describe('Setup never touches files it does not own', () => {
  it('RON-358 learner files in managed folders survive every platform run', () => {
    const home = mkHome();
    const learner = {
      claude: join(home, '.claude', 'agents', 'my-agent.md'),
      gemini: join(home, '.gemini', 'commands', 'professor', 'mine.toml'),
      opencode: join(home, '.opencode', 'commands', 'mine.md'),
      cursor: join(home, '.cursor', 'rules', 'mine.mdc'),
    };
    for (const [platform, file] of Object.entries(learner)) {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, `learner ${platform}\n`);
    }

    for (const platform of ['claude', 'gemini', 'opencode', 'cursor']) {
      setup(home, platform);
      setup(home, platform);
    }

    for (const [platform, file] of Object.entries(learner)) {
      expect(readFileSync(file, 'utf-8'), platform).toBe(`learner ${platform}\n`);
      expect(existsSync(`${file}.bak`), platform).toBe(false);
    }
  });
});

describe('Block-managed files are refreshed in place', () => {
  it('RON-358 Gemini replaces the block and keeps the learner text around it', () => {
    const home = mkHome();
    const geminiMd = join(home, 'GEMINI.md');
    writeFileSync(
      geminiMd,
      '# My notes\n\nkeep me\n\n<!-- professor:start -->\nOLD SKILL\n<!-- professor:end -->\n\n## Tail\n'
    );

    setup(home, 'gemini');

    const after = readFileSync(geminiMd, 'utf-8');
    expect(after.startsWith('# My notes\n\nkeep me\n\n')).toBe(true);
    expect(after.endsWith('\n\n## Tail\n')).toBe(true);
    expect(after).not.toContain('OLD SKILL');
    expect(after).toContain('Professor Skill');
    expect(after.match(/<!-- professor:start -->/g)).toHaveLength(1);
    expect(readFileSync(`${geminiMd}.bak`, 'utf-8')).toContain('OLD SKILL');

    setup(home, 'gemini');
    expect(readFileSync(geminiMd, 'utf-8')).toBe(after);
  });

  it('RON-358 Gemini appends the block to a GEMINI.md that has none', () => {
    const home = mkHome();
    const geminiMd = join(home, 'GEMINI.md');
    writeFileSync(geminiMd, '# My notes\n\nkeep me\n');

    setup(home, 'gemini');

    const after = readFileSync(geminiMd, 'utf-8');
    expect(after.startsWith('# My notes\n\nkeep me\n')).toBe(true);
    expect(after).toContain('<!-- professor:start -->');
    expect(after).toContain('Professor Skill');
  });

  it('RON-358 OpenCode replaces the AGENTS.md block and keeps learner rules', () => {
    const home = mkHome();
    const agentsMd = join(home, 'AGENTS.md');
    writeFileSync(
      agentsMd,
      '# Team rules\n\nuse tabs\n\n<!-- professor:start -->\nOLD SKILL\n<!-- professor:end -->\n'
    );

    setup(home, 'opencode');

    const after = readFileSync(agentsMd, 'utf-8');
    expect(after.startsWith('# Team rules\n\nuse tabs\n\n')).toBe(true);
    expect(after).not.toContain('OLD SKILL');
    expect(after).toContain('Professor Skill');
    expect(readFileSync(`${agentsMd}.bak`, 'utf-8')).toContain('OLD SKILL');

    setup(home, 'opencode');
    expect(readFileSync(agentsMd, 'utf-8')).toBe(after);
  });

  it('RON-358 a legacy whole-file AGENTS.md is upgraded, not appended to', () => {
    const home = mkHome();
    const agentsMd = join(home, 'AGENTS.md');
    const legacy = read('shared/SKILL.md').replace('## Core Philosophy', '## OLD Core Philosophy');
    writeFileSync(agentsMd, legacy);

    setup(home, 'opencode');

    const after = readFileSync(agentsMd, 'utf-8');
    expect(after.startsWith('<!-- professor:start -->')).toBe(true);
    expect(after).not.toContain('OLD Core Philosophy');
    expect(after.match(/<!-- professor:start -->/g)).toHaveLength(1);
    expect(readFileSync(`${agentsMd}.bak`, 'utf-8')).toContain('OLD Core Philosophy');
  });

  it('RON-358 a learner-owned AGENTS.md keeps its text and gains the block', () => {
    const home = mkHome();
    const agentsMd = join(home, 'AGENTS.md');
    writeFileSync(agentsMd, '# My rules\n\nbe terse\n');

    setup(home, 'opencode');

    const after = readFileSync(agentsMd, 'utf-8');
    expect(after.startsWith('# My rules\n\nbe terse\n')).toBe(true);
    expect(after).toContain('<!-- professor:start -->');
    expect(after).toContain('Professor Skill');
  });
});

describe("Gemini commands receive the learner's arguments", () => {
  it('RON-358 generated .toml files use {{args}} and never $ARGUMENTS', () => {
    const home = mkHome();
    setup(home, 'gemini');
    const dir = join(home, '.gemini', 'commands', 'professor');

    for (const file of ['review.toml', 'done.toml', 'stuck.toml']) {
      const doc = readFileSync(join(dir, file), 'utf-8');
      expect(doc, file).toContain('{{args}}');
      expect(doc, file).not.toContain('$ARGUMENTS');
    }

    const progress = readFileSync(join(dir, 'progress.toml'), 'utf-8');
    expect(progress).not.toContain('{{args}}');
    expect(progress).not.toContain('$ARGUMENTS');
  });
});

describe("Cursor's rendering of a command reads as instructions", () => {
  it('RON-358 no canonical command renders as a spliced tool sentence', () => {
    const commands = walk('commands/professor').filter((rel) => rel.endsWith('.md'));
    expect(commands.length).toBeGreaterThan(20);

    const artefacts = [/Use ask the user directly in chat/, /the ask the user directly in chat tool/];
    const offenders = commands.flatMap((rel) => {
      const rendered = substituteTokens(read(rel), 'cursor');
      return artefacts
        .filter((re) => re.test(rendered))
        .map((re) => `${rel}: ${rendered.match(re)[0]}`);
    });
    expect(offenders).toEqual([]);
  });

  it('RON-358 the new-topic questions read correctly after substitution', () => {
    const rendered = substituteTokens(read('commands/professor/new-topic.md'), 'cursor');
    expect(rendered).toContain(
      'Ask all four questions in a single call: ask the user directly in chat — one call, four questions.'
    );
    expect(rendered).not.toContain('AskUserQuestion');
  });

  it('RON-358 the generated professor.mdc carries no tool artefact', () => {
    const home = mkHome();
    setup(home, 'cursor');
    const mdc = readFileSync(join(home, '.cursor', 'rules', 'professor.mdc'), 'utf-8');
    expect(mdc).not.toContain('Use ask the user directly in chat');
    expect(mdc).not.toContain('the ask the user directly in chat tool');
    expect(mdc).toContain('Always read COURSE.md first');
  });
});
