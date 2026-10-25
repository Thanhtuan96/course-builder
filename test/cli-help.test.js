/**
 * Product boundary docs (RON-167, BOUND-01).
 *
 * Black-box tests over the real CLI: `help` is spawned from `bin/cli.js` (the same pattern as
 * `test/beta-aggregate.test.js`) and `setup claude --local` runs in a throwaway cwd/HOME so only
 * text is asserted. The remaining tests read the user-facing docs and pin the boundary wording:
 * Studio first, `web` as the Studio-only bridge, legacy only as a deprecated opt-in, and no
 * recommendation of unsafe options.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const CLI = join(REPO_ROOT, 'bin', 'cli.js');

const ANSI = /\u001B\[[0-9;]*m/g;
const HINT = 'Studio: npx course-professor studio (Studio app + local bridge, Node 22.5+)';

/** Spawn the real CLI with an absolute entry point and return de-coloured output. */
function runCli(args, { cwd = REPO_ROOT, env = process.env } = {}) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    env,
    encoding: 'utf8',
    timeout: 60_000,
  });
  return {
    status: result.status,
    text: `${result.stdout ?? ''}${result.stderr ?? ''}`.replace(ANSI, ''),
  };
}

/** The `web` command row plus its wrapped continuation line. */
function webRow(helpText) {
  const lines = helpText.split('\n');
  const start = lines.findIndex((line) => /^\s+web\b/.test(line));
  expect(start, 'help lists a web command').toBeGreaterThan(-1);
  return [lines[start], lines[start + 1] ?? ''].join('\n');
}

/** One flag's description line from the FLAGS block. */
function flagLine(helpText, flag) {
  const pattern = new RegExp(`^\\s+${flag}(?:\\s|$)`);
  const line = helpText.split('\n').find((entry) => pattern.test(entry));
  expect(line, `help documents ${flag}`).toBeDefined();
  return line;
}

const readRepoFile = (name) => readFileSync(join(REPO_ROOT, name), 'utf8');

describe('RON-167 CLI help via the real binary', () => {
  const { status, text } = runCli(['help']);

  it('RON-167 exits 0 and points new users at Studio with the Node requirement', () => {
    expect(status).toBe(0);
    expect(text).toContain('npx course-professor studio');
    expect(text).toContain('Node 22.5+');
  });

  it('RON-167 describes web as the Studio-only bridge server and keeps --production', () => {
    const row = webRow(text);
    expect(row).toMatch(/bridge/i);
    expect(row).not.toMatch(/web UI/i);
    expect(row).toContain('--production');
    expect(row).toMatch(/prebuilt Studio/i);
    expect(row).toMatch(/requires a build/i);
  });

  it('RON-167 lists --cloud as deprecated and legacy-only without an API-key pitch', () => {
    const line = flagLine(text, '--cloud');
    expect(line).toMatch(/deprecated/i);
    expect(line).toContain('--legacy');
    expect(line).not.toMatch(/api[\s-]?key/i);
  });

  it('RON-167 lists --legacy as deprecated with the environment opt-in', () => {
    const line = flagLine(text, '--legacy');
    expect(line).toMatch(/deprecated/i);
    expect(line).toContain('PROFESSOR_LEGACY=1');
  });

  it('RON-167 never runs web or legacy mode in an example', () => {
    const examples = text.slice(text.indexOf('\nEXAMPLES'), text.indexOf('\nSUPPORTED AGENTS'));
    expect(examples).toContain('npx course-professor studio');
    for (const line of examples.split('\n').filter((entry) => entry.trim().startsWith('npx '))) {
      expect(line).not.toContain('course-professor web');
      expect(line).not.toContain('--legacy');
    }
  });

  it('RON-167 never mentions unsafe options in help', () => {
    expect(text).not.toContain('--dangerously-skip-permissions');
    expect(text).not.toContain('STUDIO_ORIGINS');
  });

  it('RON-167 keeps printUsage internal instead of exporting it for tests', () => {
    expect(readRepoFile('bin/cli.js')).not.toMatch(/export\s+(?:async\s+)?function\s+printUsage/);
  });
});

describe('RON-167 setup closes with a single Studio hint', () => {
  it('RON-167 prints the hint once after setup, without the words "web UI"', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'professor-ron167-cwd-'));
    const home = mkdtempSync(join(tmpdir(), 'professor-ron167-home-'));
    try {
      const { status, text } = runCli(['setup', 'claude', '--local'], {
        cwd,
        env: { ...process.env, HOME: home },
      });
      expect(status).toBe(0);
      expect(text.split(HINT)).toHaveLength(2);
      expect(text).not.toMatch(/web UI/i);
      expect(text.indexOf('Setup complete for Claude Code')).toBeLessThan(text.indexOf(HINT));
    } finally {
      rmSync(cwd, { recursive: true, force: true });
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('RON-167 keeps the init hint in one place in bin/cli.js', () => {
    const source = readRepoFile('bin/cli.js');
    expect(source.split(HINT)).toHaveLength(2);
  });
});

describe('RON-167 READMEs put Studio before the manual bridge', () => {
  it('RON-167 places the studio command before web in README.md', () => {
    const readme = readRepoFile('README.md');
    const studio = readme.search(/course-professor(?:@next)? studio/);
    const web = readme.search(/course-professor(?:@next)? web/);
    expect(studio).toBeGreaterThan(-1);
    expect(web).toBeGreaterThan(-1);
    expect(studio).toBeLessThan(web);
  });

  it('RON-167 places the studio command before web in studio/README.md', () => {
    const readme = readRepoFile('studio/README.md');
    const studio = readme.search(/course-professor(?:@next)? studio/);
    const web = readme.search(/course-professor(?:@next)? web/);
    expect(studio).toBeGreaterThan(-1);
    expect(web).toBeGreaterThan(-1);
    expect(studio).toBeLessThan(web);
  });

  it('RON-167 documents the deprecated opt-in and links SECURITY.md from README', () => {
    const readme = readRepoFile('README.md');
    expect(readme).toContain('PROFESSOR_LEGACY=1');
    expect(readme).toMatch(/\[`SECURITY\.md`\]\(SECURITY\.md\)/);
    expect(readme).toMatch(/deprecated/i);
  });
});

describe('RON-167 SECURITY.md boundary', () => {
  it('RON-167 documents what runs where with bridge and runner separate', () => {
    const security = readRepoFile('SECURITY.md');
    expect(security).toContain('## What runs where');
    expect(security).toMatch(/bridge server/i);
    expect(security).toMatch(/local code runner/i);
    expect(security).toContain('studio-runner.js');
    expect(security).toMatch(/does \*\*not\*\* start agent CLIs/);
  });

  it('RON-167 negates every mention of sandbox', () => {
    const lines = readRepoFile('SECURITY.md')
      .split('\n')
      .filter((line) => /sandbox/i.test(line));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line, `unnegated sandbox claim: ${line.trim()}`).toMatch(
        /not a sandbox|never a sandbox|no sandbox/i
      );
    }
  });

  it('RON-167 explains private reporting and stays out of the package allowlist', () => {
    const security = readRepoFile('SECURITY.md');
    expect(security).toMatch(/Report|report/);
    expect(security).toMatch(/privately/i);
    expect(security).toMatch(/do \*\*not\*\* open a public issue/i);

    const pkg = JSON.parse(readRepoFile('package.json'));
    expect(pkg.files).not.toContain('SECURITY.md');
  });
});

describe('RON-167 CHANGELOG records the Studio-only default', () => {
  it('RON-167 adds an Unreleased section before the released beta', () => {
    const changelog = readRepoFile('CHANGELOG.md');
    const unreleased = changelog.indexOf('## [Unreleased]');
    const beta = changelog.indexOf('## [1.6.0-beta.1]');
    expect(unreleased).toBeGreaterThan(-1);
    expect(beta).toBeGreaterThan(unreleased);

    const section = changelog.slice(unreleased, beta);
    expect(section).toContain('PROFESSOR_LEGACY=1');
    expect(section).toMatch(/serves Studio only|Studio only/i);
    expect(section).toMatch(/no longer applies/i);
    expect(section).toMatch(/legacy `web` command is unchanged/);
  });
});
