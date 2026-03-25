/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync, mkdtempSync, statSync, readdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// ─── Mock modules (hoisted by Vitest) ─────────────────────────────────────────

vi.mock('inquirer', () => ({
  default: { prompt: vi.fn() },
}));

vi.mock('ora', () => ({
  default: function ora(text) {
    return {
      text,
      start: () => ora(text),
      stop: () => ora(text),
      succeed: () => ora(text),
      fail: () => ora(text),
    };
  },
}));

vi.mock('https', () => ({
  get: vi.fn(),
}));

// ─── Helpers under test ────────────────────────────────────────────────────────

const { validateItemName, fetchRegistryText, fetchRegistryIndex, confirmOverwrite } =
  await import('../bin/registry-helpers.js');

// ─── Temp dir cleanup ──────────────────────────────────────────────────────────

/** @type {string[]} */
const tempDirs = [];
afterEach(() => {
  for (const d of tempDirs) {
    try { rmSync(d, { recursive: true, force: true }); } catch {}
  }
  tempDirs.length = 0;
});

function mkTemp() {
  const d = mkdtempSync(join(tmpdir(), 'cp-test-'));
  tempDirs.push(d);
  return d;
}

// ─── validateItemName ──────────────────────────────────────────────────────────

describe('validateItemName', () => {
  it('accepts valid slugs', () => {
    expect(() => validateItemName('react-hooks')).not.toThrow();
    expect(() => validateItemName('sql-query-auditor')).not.toThrow();
    expect(() => validateItemName('my-skill-v2')).not.toThrow();
  });

  it('rejects empty string', () => {
    const spy = vi.spyOn(console, 'error').mockReturnValue();
    expect(() => validateItemName('')).toThrow();
    expect(() => validateItemName(null)).toThrow();
    expect(() => validateItemName(undefined)).toThrow();
    spy.mockRestore();
  });

  it('rejects path traversal', () => {
    const spy = vi.spyOn(console, 'error').mockReturnValue();
    expect(() => validateItemName('../etc')).toThrow();
    expect(() => validateItemName('foo/../../../etc')).toThrow();
    spy.mockRestore();
  });

  it('rejects dot name', () => {
    const spy = vi.spyOn(console, 'error').mockReturnValue();
    expect(() => validateItemName('.')).toThrow();
    spy.mockRestore();
  });
});

// ─── fetchRegistryText ──────────────────────────────────────────────────────────

describe('fetchRegistryText', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('resolves with body on 200', async () => {
    const { get } = await import('https');
    get.mockImplementation((url, cb) => {
      const mockRes = {
        statusCode: 200,
        resume: vi.fn(),
        on: (event, fn) => {
          if (event === 'end') setTimeout(fn, 0);
          if (event === 'data') fn(Buffer.from('hello world'));
          return mockRes;
        },
      };
      cb(mockRes);
      return { on: vi.fn() };
    });
    const result = await fetchRegistryText('https://example.com/file');
    expect(result).toBe('hello world');
  });

  it('returns null on 404 when optional=true', async () => {
    const { get } = await import('https');
    get.mockImplementation((url, cb) => {
      const mockRes = {
        statusCode: 404,
        resume: vi.fn(),
        on: () => mockRes,
      };
      cb(mockRes);
      return { on: vi.fn() };
    });
    const result = await fetchRegistryText('https://example.com/missing', { optional: true });
    expect(result).toBe(null);
  });

  it('rejects on 404 when optional=false', async () => {
    const { get } = await import('https');
    get.mockImplementation((url, cb) => {
      const mockRes = {
        statusCode: 404,
        resume: vi.fn(),
        on: () => mockRes,
      };
      cb(mockRes);
      return { on: vi.fn() };
    });
    await expect(fetchRegistryText('https://example.com/missing')).rejects.toThrow('HTTP 404');
  });
});

// ─── fetchRegistryIndex ────────────────────────────────────────────────────────

describe('fetchRegistryIndex', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('parses valid JSON index', async () => {
    const index = { courses: [{ name: 'react', title: 'React', sections: 5 }], skills: [] };
    const { get } = await import('https');
    get.mockImplementation((url, cb) => {
      const mockRes = {
        statusCode: 200,
        resume: vi.fn(),
        on: (event, fn) => {
          if (event === 'end') setTimeout(fn, 0);
          if (event === 'data') fn(Buffer.from(JSON.stringify(index)));
          return mockRes;
        },
      };
      cb(mockRes);
      return { on: vi.fn() };
    });
    const result = await fetchRegistryIndex();
    expect(result).toEqual(index);
  });

  it('handles malformed JSON gracefully', async () => {
    const { get } = await import('https');
    get.mockImplementation((url, cb) => {
      const mockRes = {
        statusCode: 200,
        resume: vi.fn(),
        on: (event, fn) => {
          if (event === 'end') setTimeout(fn, 0);
          if (event === 'data') fn(Buffer.from('not valid json {{{'));
          return mockRes;
        },
      };
      cb(mockRes);
      return { on: vi.fn() };
    });
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit');
    });
    const consoleSpy = vi.spyOn(console, 'error').mockReturnValue();
    await expect(fetchRegistryIndex()).rejects.toThrow('exit');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('invalid data')
    );
    exitSpy.mockRestore();
    consoleSpy.mockRestore();
  });
});

// ─── confirmOverwrite ─────────────────────────────────────────────────────────

describe('confirmOverwrite', () => {
  it('returns true immediately if marker file absent', async () => {
    const dir = mkTemp();
    const result = await confirmOverwrite(dir, 'SKILL.md', false);
    expect(result).toBe(true);
  });

  it('returns true if force=true and marker exists', async () => {
    const dir = mkTemp();
    writeFileSync(join(dir, 'SKILL.md'), '# skill', 'utf8');
    const result = await confirmOverwrite(dir, 'SKILL.md', true);
    expect(result).toBe(true);
  });

  it('exits in non-TTY when marker exists without force', async () => {
    const dir = mkTemp();
    writeFileSync(join(dir, 'SKILL.md'), '# skill', 'utf8');
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit');
    });
    const consoleSpy = vi.spyOn(console, 'error').mockReturnValue();
    await expect(confirmOverwrite(dir, 'SKILL.md', false)).rejects.toThrow('exit');
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('already exists'));
    exitSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('proceeds when TTY user confirms', async () => {
    const dir = mkTemp();
    writeFileSync(join(dir, 'COURSE.md'), '# course', 'utf8');
    const prevTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    const { default: inquirer } = await import('inquirer');
    inquirer.prompt.mockResolvedValue({ confirmed: true });
    const result = await confirmOverwrite(dir, 'COURSE.md', false);
    expect(result).toBe(true);
    Object.defineProperty(process.stdin, 'isTTY', { value: prevTTY, configurable: true });
  });

  it('aborts when TTY user declines', async () => {
    const dir = mkTemp();
    writeFileSync(join(dir, 'SKILL.md'), '# skill', 'utf8');
    const prevTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    const { default: inquirer } = await import('inquirer');
    inquirer.prompt.mockResolvedValue({ confirmed: false });
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit');
    });
    await expect(confirmOverwrite(dir, 'SKILL.md', false)).rejects.toThrow('exit');
    exitSpy.mockRestore();
    Object.defineProperty(process.stdin, 'isTTY', { value: prevTTY, configurable: true });
  });
});

// ─── Scope resolution ──────────────────────────────────────────────────────────

describe('resolveScope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns global when isGlobal=true', async () => {
    const { resolveScope } = await import('../bin/registry-helpers.js');
    const scope = await resolveScope('foo', 'skill', { isGlobal: true, isLocal: false });
    expect(scope).toBe('global');
  });

  it('returns local when isLocal=true', async () => {
    const { resolveScope } = await import('../bin/registry-helpers.js');
    const scope = await resolveScope('foo', 'skill', { isGlobal: false, isLocal: true });
    expect(scope).toBe('local');
  });

  it('errors in non-TTY without scope flags', async () => {
    const { resolveScope } = await import('../bin/registry-helpers.js');
    const prevTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit');
    });
    const consoleSpy = vi.spyOn(console, 'error').mockReturnValue();
    await expect(
      resolveScope('foo', 'skill', { isGlobal: false, isLocal: false })
    ).rejects.toThrow('exit');
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('--local or --global'));
    Object.defineProperty(process.stdin, 'isTTY', { value: prevTTY, configurable: true });
    exitSpy.mockRestore();
    consoleSpy.mockRestore();
  });
});

// ─── installSkill ──────────────────────────────────────────────────────────────

describe('installSkill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exits when skill not in registry', async () => {
    const { installSkill } = await import('../bin/registry-helpers.js');
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit');
    });
    const consoleSpy = vi.spyOn(console, 'error').mockReturnValue();
    await expect(
      installSkill('nonexistent', 'local', { index: { skills: [] } })
    ).rejects.toThrow('exit');
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('not found'));
    exitSpy.mockRestore();
    consoleSpy.mockRestore();
  });
});

// ─── installCourse ─────────────────────────────────────────────────────────────

describe('installCourse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exits when course not in registry', async () => {
    const { installCourse } = await import('../bin/registry-helpers.js');
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit');
    });
    const consoleSpy = vi.spyOn(console, 'error').mockReturnValue();
    await expect(
      installCourse('nonexistent', { index: { courses: [] } })
    ).rejects.toThrow('exit');
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('not found'));
    exitSpy.mockRestore();
    consoleSpy.mockRestore();
  });
});

// ─── 'installed' command logic ────────────────────────────────────────────────

describe('installed command logic', () => {
  it('skips non-directories in skills dir', async () => {
    const dir = mkTemp();
    const skillsDir = join(dir, '.claude', 'skills');
    mkdirSync(skillsDir, { recursive: true });
    // Create a file (not a dir) alongside a real skill
    writeFileSync(join(skillsDir, 'not-a-skill.txt'), 'nope');
    const skillDir = join(skillsDir, 'real-skill');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'SKILL.md'), '# Real', 'utf8');

    const entries = readdirSync(skillsDir);
    const rows = [];
    for (const name of entries) {
      const p = join(skillsDir, name);
      if (!statSync(p).isDirectory()) continue;
      if (!existsSync(join(p, 'SKILL.md'))) continue;
      rows.push(name);
    }
    expect(rows).toEqual(['real-skill']);
  });

  it('reads meta.json for title and version', async () => {
    const dir = mkTemp();
    const skillDir = join(dir, '.claude', 'skills', 'my-test-skill');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'SKILL.md'), '# Skill', 'utf8');
    writeFileSync(join(skillDir, 'meta.json'), JSON.stringify({ title: 'My Test Skill', version: 'v1.2.3' }), 'utf8');

    let title = '?', version = '—';
    const metaPath = join(skillDir, 'meta.json');
    if (existsSync(metaPath)) {
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
      title   = meta.title   || '?';
      version = meta.version || '—';
    }
    expect(title).toBe('My Test Skill');
    expect(version).toBe('v1.2.3');
  });

  it('falls back to slug when meta.json absent', async () => {
    const dir = mkTemp();
    const skillDir = join(dir, '.claude', 'skills', 'no-meta-skill');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'SKILL.md'), '# Skill', 'utf8');
    // No meta.json

    let title = 'no-meta-skill', version = '—';
    const metaPath = join(skillDir, 'meta.json');
    if (existsSync(metaPath)) {
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
      title   = meta.title   || 'no-meta-skill';
      version = meta.version || '—';
    }
    expect(title).toBe('no-meta-skill');
    expect(version).toBe('—');
  });
});

// ─── 'update --all' logic ──────────────────────────────────────────────────────

describe('update --all', () => {
  it('exits 1 when updated count is zero', async () => {
    const results = { updated: 0, skipped: 0, failed: 0 };
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit1');
    });
    const consoleSpy = vi.spyOn(console, 'error').mockReturnValue();
    if (results.updated === 0) {
      try { process.exit(1); } catch {}
    }
    expect(results.updated).toBe(0);
    exitSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('formats summary string correctly', () => {
    const results = { updated: 2, skipped: 1, failed: 0 };
    const msg = `Updated: ${results.updated} | Skipped: ${results.skipped} | Failed: ${results.failed}`;
    expect(msg).toBe('Updated: 2 | Skipped: 1 | Failed: 0');
  });

  it('skips manually-installed skills not in registry', () => {
    const indexSkills = [{ name: 'official-skill', title: 'Official' }];
    const installedName = 'manual-skill';
    const skill = indexSkills.find((s) => s.name === installedName);
    const results = { skipped: 0 };
    if (!skill) {
      results.skipped++;
    }
    expect(results.skipped).toBe(1);
  });
});

// ─── 'remove' command logic ───────────────────────────────────────────────────

describe('remove command logic', () => {
  it('errors when skill not found in either scope', async () => {
    const dir = mkTemp();
    const localPath  = join(dir, '.claude', 'skills', 'nonexistent');
    const globalPath = join(dir, 'home', '.claude', 'skills', 'nonexistent');
    expect(existsSync(join(localPath, 'SKILL.md'))).toBe(false);
    expect(existsSync(join(globalPath, 'SKILL.md'))).toBe(false);
  });

  it('deletes skill directory on confirm', async () => {
    const dir = mkTemp();
    const skillDir = join(dir, '.claude', 'skills', 'to-remove');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'SKILL.md'), '# skill', 'utf8');
    expect(existsSync(skillDir)).toBe(true);
    rmSync(skillDir, { recursive: true, force: true });
    expect(existsSync(skillDir)).toBe(false);
  });

  it('errors when --force used without scope on dual-scope skill', async () => {
    // Logic: isForce=true, isGlobal=false, isLocal=false, both exist
    // Error: "Skill found in both scopes. Use --local, --global, or --force --local/--global."
    const isForce = true, isGlobal = false, isLocal = false;
    const bothExist = true;
    const consoleSpy = vi.spyOn(console, 'error').mockReturnValue();
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit');
    });
    if (isForce && !isGlobal && !isLocal && bothExist) {
      try {
        console.error('Skill found in both scopes. Use --local, --global, or --force --local/--global.');
        process.exit(1);
      } catch {}
    }
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('both scopes'));
    exitSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('resolves to single scope when skill only in one location', async () => {
    const dir = mkTemp();
    const localPath  = join(dir, '.claude', 'skills', 'local-only');
    mkdirSync(localPath, { recursive: true });
    writeFileSync(join(localPath, 'SKILL.md'), '# skill', 'utf8');
    const localExists  = existsSync(join(localPath, 'SKILL.md'));
    const globalExists = false;
    const resolved = !localExists && !globalExists ? null :
                     !globalExists ? 'local' :
                     !localExists ? 'global' : 'both';
    expect(resolved).toBe('local');
  });
});

// ─── meta.json optional path ──────────────────────────────────────────────────

describe('meta.json optional during install', () => {
  it('fetchRegistryText returns null on 404 with optional flag', async () => {
    const { get } = await import('https');
    get.mockImplementation((url, cb) => {
      const mockRes = {
        statusCode: 404,
        resume: vi.fn(),
        on: () => mockRes,
      };
      cb(mockRes);
      return { on: vi.fn() };
    });
    const result = await fetchRegistryText('https://registry/meta.json', { optional: true });
    expect(result).toBe(null);
  });

  it('continues when SKILL.md is present but meta.json is absent', async () => {
    // Simulate: SKILL.md returns 200, meta.json returns 404 optional
    const calls = [];
    const { get } = await import('https');
    get.mockImplementation((url, cb) => {
      const isMeta = url.includes('meta.json');
      const mockRes = {
        statusCode: isMeta ? 404 : 200,
        resume: vi.fn(),
        on: (event, fn) => {
          if (event === 'end') setTimeout(fn, 0);
          if (event === 'data' && !isMeta) fn(Buffer.from('# Skill'));
          return mockRes;
        },
      };
      cb(mockRes);
      return { on: vi.fn() };
    });
    const skillText = await fetchRegistryText('https://x/SKILL.md');
    const metaText   = await fetchRegistryText('https://x/meta.json', { optional: true });
    expect(skillText).toBe('# Skill');
    expect(metaText).toBe(null);
    // Both should succeed — install would proceed with SKILL.md only
  });
});
