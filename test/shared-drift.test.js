/**
 * Shared drift guard (BOUND-02).
 *
 * Black-box checks around `scripts/sync-shared.mjs`:
 *   1. the committed `shared/` tree is clean and `--check` never writes,
 *   2. every drift class (changed, missing, orphan, non-regular target, symlink escape)
 *      is detected against a temp fixture,
 *   3. write mode removes managed orphans,
 *   4. command/agent/hook registration and versions stay aligned across manifests.
 *
 * @vitest-environment node
 */
import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { basename, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const SYNC_SCRIPT = join(REPO_ROOT, 'scripts', 'sync-shared.mjs');
const MANAGED_DIRS = ['shared/agents', 'shared/commands/professor', 'shared/hooks'];

const fixtures = [];

afterEach(() => {
  while (fixtures.length > 0) {
    rmSync(fixtures.pop(), { recursive: true, force: true });
  }
});

function runCheck(rootDir) {
  return spawnSync(process.execPath, [join(rootDir, 'scripts', 'sync-shared.mjs'), '--check'], {
    cwd: rootDir,
    encoding: 'utf-8',
  });
}

function runSync(rootDir) {
  return spawnSync(process.execPath, [join(rootDir, 'scripts', 'sync-shared.mjs')], {
    cwd: rootDir,
    encoding: 'utf-8',
  });
}

function listMarkdown(sourceDir) {
  return readdirSync(join(REPO_ROOT, sourceDir))
    .filter((name) => !name.startsWith('.') && name.endsWith('.md'))
    .sort();
}

function canonicalPairs() {
  const pairs = [];
  for (const name of listMarkdown('agents')) {
    pairs.push({ source: `agents/${name}`, dest: `shared/agents/${name}` });
  }
  for (const name of listMarkdown('commands/professor')) {
    pairs.push({ source: `commands/professor/${name}`, dest: `shared/commands/professor/${name}` });
  }
  pairs.push({ source: 'hooks/pre-compact.js', dest: 'shared/hooks/pre-compact.js' });
  pairs.push({ source: 'professor-skill/SKILL.md', dest: 'shared/SKILL.md' });
  return pairs;
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function hashManagedTree(rootDir) {
  const relPaths = ['shared/SKILL.md'];
  for (const dirRel of MANAGED_DIRS) {
    const dirAbs = join(rootDir, dirRel);
    if (!existsSync(dirAbs)) continue;
    for (const name of readdirSync(dirAbs).sort()) {
      if (name.startsWith('.')) continue;
      relPaths.push(`${dirRel}/${name}`);
    }
  }
  return relPaths
    .sort()
    .map((rel) => `${rel}:${sha256File(join(rootDir, rel))}`)
    .join('\n');
}

function readManifest(relativePath) {
  return JSON.parse(readFileSync(join(REPO_ROOT, relativePath), 'utf-8'));
}

function makeFixture() {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'shared-drift-')));
  fixtures.push(tmp);

  mkdirSync(join(tmp, 'scripts'), { recursive: true });
  copyFileSync(SYNC_SCRIPT, join(tmp, 'scripts', 'sync-shared.mjs'));

  mkdirSync(join(tmp, 'agents'), { recursive: true });
  mkdirSync(join(tmp, 'commands', 'professor'), { recursive: true });
  mkdirSync(join(tmp, 'hooks'), { recursive: true });
  mkdirSync(join(tmp, 'professor-skill'), { recursive: true });

  writeFileSync(join(tmp, 'agents', 'alpha.md'), '# Alpha agent\n');
  writeFileSync(join(tmp, 'commands', 'professor', 'hello.md'), '# Hello command\n');
  writeFileSync(join(tmp, 'hooks', 'pre-compact.js'), 'module.exports = {};\n');
  writeFileSync(join(tmp, 'professor-skill', 'SKILL.md'), '# Skill\n');

  const baseline = runSync(tmp);
  expect(baseline.status, `fixture baseline sync failed: ${baseline.stderr}`).toBe(0);

  const check = runCheck(tmp);
  expect(check.status, `fixture baseline is not clean: ${check.stdout}${check.stderr}`).toBe(0);
  expect(check.stdout).toContain('OK shared/ is in sync');

  const hookCopy = join(tmp, 'shared', 'hooks', 'pre-compact.js');
  expect(existsSync(hookCopy), 'fixture baseline is missing shared/hooks/pre-compact.js').toBe(true);
  expect(readFileSync(hookCopy).equals(readFileSync(join(tmp, 'hooks', 'pre-compact.js')))).toBe(
    true
  );

  return tmp;
}

describe('committed shared/ tree', () => {
  it('passes --check without mutating managed files', () => {
    const before = hashManagedTree(REPO_ROOT);
    const result = runCheck(REPO_ROOT);
    const after = hashManagedTree(REPO_ROOT);

    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toContain('OK shared/ is in sync');
    expect(result.stdout).not.toMatch(/^(MISSING|CHANGED|ORPHAN) /m);
    expect(after, '--check mutated the committed shared/ tree').toBe(before);
  });

  it('keeps every canonical file byte-identical to its shared copy', () => {
    for (const { source, dest } of canonicalPairs()) {
      expect(existsSync(join(REPO_ROOT, dest)), `missing managed copy: ${dest}`).toBe(true);
      expect(
        readFileSync(join(REPO_ROOT, dest)).equals(readFileSync(join(REPO_ROOT, source))),
        `drifted copy: ${dest}`
      ).toBe(true);
    }
  });
});

describe('fixture drift detection', () => {
  it('matches the absolute-path result when invoked by a relative path', () => {
    const tmp = makeFixture();
    const absolute = runCheck(tmp);
    const relative = spawnSync(
      process.execPath,
      ['scripts/sync-shared.mjs', '--check'],
      { cwd: tmp, encoding: 'utf-8' }
    );

    expect(absolute.status).toBe(0);
    expect(relative.status, relative.stdout + relative.stderr).toBe(absolute.status);
  });

  it('reports a changed agent copy', () => {
    const tmp = makeFixture();
    appendFileSync(join(tmp, 'shared', 'agents', 'alpha.md'), 'drift\n');

    const result = runCheck(tmp);
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain('CHANGED shared/agents/alpha.md');
  });

  it('reports a missing command copy', () => {
    const tmp = makeFixture();
    rmSync(join(tmp, 'shared', 'commands', 'professor', 'hello.md'));

    const result = runCheck(tmp);
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain('MISSING shared/commands/professor/hello.md');
  });

  it('reports a command orphan without deleting it', () => {
    const tmp = makeFixture();
    const orphan = join(tmp, 'shared', 'commands', 'professor', 'orphan.md');
    writeFileSync(orphan, 'orphan bytes\n');

    const result = runCheck(tmp);
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain('ORPHAN shared/commands/professor/orphan.md');
    expect(existsSync(orphan)).toBe(true);
    expect(readFileSync(orphan, 'utf-8')).toBe('orphan bytes\n');
  });

  it('reports an agent orphan without deleting it', () => {
    const tmp = makeFixture();
    const orphan = join(tmp, 'shared', 'agents', 'orphan-agent.md');
    writeFileSync(orphan, 'agent orphan\n');

    const result = runCheck(tmp);
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain('ORPHAN shared/agents/orphan-agent.md');
    expect(existsSync(orphan)).toBe(true);
    expect(readFileSync(orphan, 'utf-8')).toBe('agent orphan\n');
  });

  it('reports a changed hook copy', () => {
    const tmp = makeFixture();
    appendFileSync(join(tmp, 'shared', 'hooks', 'pre-compact.js'), 'drift\n');

    const result = runCheck(tmp);
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain('CHANGED shared/hooks/pre-compact.js');
  });

  it('reports a hook orphan without deleting it', () => {
    const tmp = makeFixture();
    const orphan = join(tmp, 'shared', 'hooks', 'orphan-hook.js');
    writeFileSync(orphan, 'hook orphan\n');

    const result = runCheck(tmp);
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain('ORPHAN shared/hooks/orphan-hook.js');
    expect(existsSync(orphan)).toBe(true);
    expect(readFileSync(orphan, 'utf-8')).toBe('hook orphan\n');
  });

  it('reports a directory occupying shared/SKILL.md as drift', () => {
    const tmp = makeFixture();
    const skillPath = join(tmp, 'shared', 'SKILL.md');
    rmSync(skillPath);
    mkdirSync(skillPath);
    writeFileSync(join(skillPath, 'inner.md'), 'inner\n');

    const result = runCheck(tmp);
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain('shared/SKILL.md');
    expect(lstatSync(skillPath).isDirectory()).toBe(true);
    expect(existsSync(join(skillPath, 'inner.md'))).toBe(true);
  });

  it('reports a symlinked destination escape without following it', () => {
    const tmp = makeFixture();
    const outside = join(tmp, 'outside.md');
    writeFileSync(outside, 'outside bytes\n');
    const escape = join(tmp, 'shared', 'agents', 'escape.md');
    symlinkSync(outside, escape);

    const result = runCheck(tmp);
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain('shared/agents/escape.md');
    expect(lstatSync(escape).isSymbolicLink()).toBe(true);
    expect(readFileSync(outside, 'utf-8')).toBe('outside bytes\n');
  });
});

describe('fixture write-mode orphan removal', () => {
  it('removes a command orphan and leaves the tree clean', () => {
    const tmp = makeFixture();
    const orphan = join(tmp, 'shared', 'commands', 'professor', 'orphan.md');
    writeFileSync(orphan, 'orphan\n');

    const sync = runSync(tmp);
    expect(sync.status, sync.stdout + sync.stderr).toBe(0);
    expect(existsSync(orphan)).toBe(false);

    const check = runCheck(tmp);
    expect(check.status).toBe(0);
    expect(check.stdout).toContain('OK shared/ is in sync');
  });

  it('removes a hook orphan and leaves the tree clean', () => {
    const tmp = makeFixture();
    const orphan = join(tmp, 'shared', 'hooks', 'orphan-hook.js');
    writeFileSync(orphan, 'orphan\n');

    const sync = runSync(tmp);
    expect(sync.status, sync.stdout + sync.stderr).toBe(0);
    expect(existsSync(orphan)).toBe(false);

    const check = runCheck(tmp);
    expect(check.status).toBe(0);
    expect(check.stdout).toContain('OK shared/ is in sync');
  });
});

describe('manifest parity', () => {
  const manifests = () => [
    { label: 'plugin.json', data: readManifest('plugin.json') },
    { label: 'templates/claude/plugin.json', data: readManifest('templates/claude/plugin.json') },
  ];

  it('registers every command in both manifests, one-to-one', () => {
    const commandFiles = listMarkdown('commands/professor');
    const canonical = new Set(commandFiles);

    for (const { label, data } of manifests()) {
      const entries = data.commands;
      expect(new Set(entries.map((entry) => entry.name)).size, `duplicate command name in ${label}`).toBe(
        entries.length
      );
      expect(new Set(entries.map((entry) => entry.file)).size, `duplicate command file in ${label}`).toBe(
        entries.length
      );

      for (const name of commandFiles) {
        const expectedFile = `commands/professor/${name}`;
        const expectedName = `professor:${name.replace(/\.md$/, '')}`;
        const matches = entries.filter((entry) => entry.file === expectedFile);
        expect(matches.length, `missing command entry for ${expectedFile} in ${label}`).toBe(1);
        expect(matches[0].name, `wrong command name for ${expectedFile} in ${label}`).toBe(expectedName);
      }

      for (const entry of entries) {
        const file = basename(entry.file);
        expect(canonical.has(file), `unregistered command file ${entry.file} declared in ${label}`).toBe(
          true
        );
        expect(existsSync(join(REPO_ROOT, entry.file)), `declared command is missing: ${entry.file}`).toBe(
          true
        );
      }
    }
  });

  it('registers every agent in both manifests, one-to-one', () => {
    const agentFiles = listMarkdown('agents');
    const canonical = new Set(agentFiles);

    for (const { label, data } of manifests()) {
      const entries = data.agents;
      expect(new Set(entries.map((entry) => entry.name)).size, `duplicate agent name in ${label}`).toBe(
        entries.length
      );
      expect(new Set(entries.map((entry) => entry.file)).size, `duplicate agent file in ${label}`).toBe(
        entries.length
      );

      for (const name of agentFiles) {
        const expectedFile = `agents/${name}`;
        const expectedName = name.replace(/\.md$/, '');
        const matches = entries.filter((entry) => entry.file === expectedFile);
        expect(matches.length, `missing agent entry for ${expectedFile} in ${label}`).toBe(1);
        expect(matches[0].name, `wrong agent name for ${expectedFile} in ${label}`).toBe(expectedName);
      }

      for (const entry of entries) {
        expect(canonical.has(basename(entry.file)), `unregistered agent ${entry.file} in ${label}`).toBe(
          true
        );
        expect(existsSync(join(REPO_ROOT, entry.file)), `declared agent is missing: ${entry.file}`).toBe(
          true
        );
      }
    }
  });

  it('declares the PreCompact hook in both manifests', () => {
    for (const { label, data } of manifests()) {
      const hook = data.hooks.find(
        (entry) => entry.event === 'PreCompact' && entry.file === 'hooks/pre-compact.js'
      );
      expect(hook, `missing PreCompact hook declaration in ${label}`).toBeDefined();
    }
  });

  it('aligns all four manifest versions with package.json', () => {
    const version = readManifest('package.json').version;
    expect(readManifest('plugin.json').version).toBe(version);
    expect(readManifest('templates/claude/plugin.json').version).toBe(version);

    const marketplace = readManifest('.claude-plugin/marketplace.json');
    expect(marketplace.metadata.version).toBe(version);
    expect(marketplace.plugins[0].version).toBe(version);
  });
});
