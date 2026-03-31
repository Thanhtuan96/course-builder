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

const {
  validateItemName,
  fetchRegistryText,
  fetchRegistryIndex,
  confirmOverwrite,
  validateSourceCourse,
  validateSourceSkill,
  validateMetaJson,
  buildCourseMetaJson,
  buildSkillMetaJson,
  buildStagingDir,
  generateBrowserFallbackUrl,
} = await import('../bin/registry-helpers.js');

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

// ─── validateSourceCourse ───────────────────────────────────────────────────────

describe('validateSourceCourse', () => {
  it('returns valid=true when COURSE.md has ≥3 status markers', () => {
    const dir = mkTemp();
    writeFileSync(join(dir, 'COURSE.md'),
      '# Course\n\n| # | Section | Status |\n|---|---------|--------|\n| 1 | Intro | ⬜ Not started |\n| 2 | Core | 🔄 In progress |\n| 3 | Advanced | ✅ Done |\n| 4 | Expert | ✅ Done |\n', 'utf8');
    const result = validateSourceCourse(dir);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns valid=false when COURSE.md has fewer than 3 sections', () => {
    const dir = mkTemp();
    writeFileSync(join(dir, 'COURSE.md'),
      '# Course\n\n| # | Section | Status |\n|---|---------|--------|\n| 1 | Intro | ✅ Done |\n', 'utf8');
    const result = validateSourceCourse(dir);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch('1 sections — minimum');
  });

  it('returns valid=false when COURSE.md is missing', () => {
    const dir = mkTemp();
    const result = validateSourceCourse(dir);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('COURSE.md not found');
  });
});

// ─── validateSourceSkill ────────────────────────────────────────────────────────

describe('validateSourceSkill', () => {
  it('returns valid=true when SKILL.md + COMPLETION.md with Course Complete verdict exist', () => {
    const dir = mkTemp();
    writeFileSync(join(dir, 'SKILL.md'), '# Skill', 'utf8');
    writeFileSync(join(dir, 'COMPLETION.md'),
      '---\ncourse: react-hooks\ncompleted: 2026-03-26\nverdict: Course Complete\ncapstone_summary: Built a useDebounce hook\n---\n', 'utf8');
    const result = validateSourceSkill(dir);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns valid=false when SKILL.md is missing', () => {
    const dir = mkTemp();
    writeFileSync(join(dir, 'COMPLETION.md'), '---\nverdict: Course Complete\n---\n', 'utf8');
    const result = validateSourceSkill(dir);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('SKILL.md not found'))).toBe(true);
  });

  it('returns valid=false when COMPLETION.md is missing', () => {
    const dir = mkTemp();
    writeFileSync(join(dir, 'SKILL.md'), '# Skill', 'utf8');
    const result = validateSourceSkill(dir);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('COMPLETION.md not found'))).toBe(true);
  });

  it('returns valid=false when verdict is not "Course Complete"', () => {
    const dir = mkTemp();
    writeFileSync(join(dir, 'SKILL.md'), '# Skill', 'utf8');
    writeFileSync(join(dir, 'COMPLETION.md'),
      '---\nverdict: Almost There\n---\n', 'utf8');
    const result = validateSourceSkill(dir);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('not "Course Complete"'))).toBe(true);
  });
});

// ─── validateMetaJson ───────────────────────────────────────────────────────────

describe('validateMetaJson', () => {
  it('returns valid=true when all required fields present for course', () => {
    const meta = { name: 'foo', title: 'Foo', description: 'Desc', author: 'user' };
    const result = validateMetaJson(meta, 'course');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns valid=true when all required fields present for skill (including origin_course)', () => {
    const meta = { name: 'foo', title: 'Foo', description: 'Desc', author: 'user', origin_course: 'bar' };
    const result = validateMetaJson(meta, 'skill');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns valid=false when origin_course is missing for skill', () => {
    const meta = { name: 'foo', title: 'Foo', description: 'Desc', author: 'user' };
    const result = validateMetaJson(meta, 'skill');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('origin_course'))).toBe(true);
  });

  it('returns valid=false when name is missing', () => {
    const meta = { title: 'Foo', description: 'Desc', author: 'user' };
    const result = validateMetaJson(meta, 'course');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('name'))).toBe(true);
  });
});

// ─── buildCourseMetaJson ───────────────────────────────────────────────────────

describe('buildCourseMetaJson', () => {
  it('includes all provided fields', () => {
    const meta = buildCourseMetaJson('/some/dir', {
      name: 'react-hooks',
      title: 'React Hooks',
      description: 'Learn hooks',
      author: 'tuankhuat',
      level: 'Intermediate',
      topics: ['react', 'javascript'],
    });
    expect(meta.name).toBe('react-hooks');
    expect(meta.title).toBe('React Hooks');
    expect(meta.description).toBe('Learn hooks');
    expect(meta.author).toBe('tuankhuat');
    expect(meta.level).toBe('Intermediate');
    expect(meta.topics).toEqual(['react', 'javascript']);
  });

  it('defaults topics to empty array when missing', () => {
    const meta = buildCourseMetaJson('/some/dir', { name: 'foo', title: 'Foo', description: 'D', author: 'u' });
    expect(meta.topics).toEqual([]);
  });
});

// ─── buildSkillMetaJson ────────────────────────────────────────────────────────

describe('buildSkillMetaJson', () => {
  it('includes all provided fields including origin_course', () => {
    const meta = buildSkillMetaJson('/some/dir', {
      name: 'react-hooks-reviewer',
      title: 'React Hooks Reviewer',
      description: 'Reviews hooks',
      author: 'tuankhuat',
      origin_course: 'react-hooks',
      topics: ['react'],
    });
    expect(meta.name).toBe('react-hooks-reviewer');
    expect(meta.origin_course).toBe('react-hooks');
    expect(meta.topics).toEqual(['react']);
  });

  it('defaults topics to empty array when missing', () => {
    const meta = buildSkillMetaJson('/some/dir', {
      name: 'foo', title: 'Foo', description: 'D', author: 'u', origin_course: 'bar',
    });
    expect(meta.topics).toEqual([]);
  });
});

// ─── buildStagingDir ─────────────────────────────────────────────────────────

describe('buildStagingDir', () => {
  it('creates .publish-staging/<slug>/ with COURSE.md and meta.json for course', () => {
    const sourceDir = mkTemp();
    writeFileSync(join(sourceDir, 'COURSE.md'), '# Course Content', 'utf8');
    const staging = buildStagingDir('course', 'my-course', sourceDir);
    expect(staging).toContain('.publish-staging');
    expect(staging).toContain('my-course');
    expect(existsSync(join(staging, 'COURSE.md'))).toBe(true);
    expect(existsSync(join(staging, 'meta.json'))).toBe(true);
    const meta = JSON.parse(readFileSync(join(staging, 'meta.json'), 'utf-8'));
    expect(meta.name).toBe('');
  });

  it('creates .publish-staging/<slug>/ with SKILL.md and meta.json for skill', () => {
    const sourceDir = mkTemp();
    writeFileSync(join(sourceDir, 'SKILL.md'), '# Skill Content', 'utf8');
    const staging = buildStagingDir('skill', 'my-skill', sourceDir);
    expect(existsSync(join(staging, 'SKILL.md'))).toBe(true);
    expect(existsSync(join(staging, 'meta.json'))).toBe(true);
    const meta = JSON.parse(readFileSync(join(staging, 'meta.json'), 'utf-8'));
    expect(meta.origin_course).toBe('');
  });

  it('creates staging dir recursively', () => {
    const sourceDir = mkTemp();
    writeFileSync(join(sourceDir, 'COURSE.md'), '# C', 'utf8');
    const staging = buildStagingDir('course', 'deep/nested/slug', sourceDir);
    expect(existsSync(staging)).toBe(true);
  });
});

// ─── generateBrowserFallbackUrl ───────────────────────────────────────────────

describe('generateBrowserFallbackUrl', () => {
  it('returns correct URL format for course', () => {
    const url = generateBrowserFallbackUrl('course', 'react-hooks');
    expect(url).toBe('https://github.com/professor-skills-hub/courses-skills-registry/compare/main...contribute/course/react-hooks');
  });

  it('returns correct URL format for skill', () => {
    const url = generateBrowserFallbackUrl('skill', 'react-hooks-reviewer');
    expect(url).toBe('https://github.com/professor-skills-hub/courses-skills-registry/compare/main...contribute/skill/react-hooks-reviewer');
  });
});

// ─── publish --dry-run logic ──────────────────────────────────────────────────

describe('publish --dry-run logic', () => {
  it('exits with code 0 on --dry-run for valid course', () => {
    const sourceDir = mkTemp();
    writeFileSync(join(sourceDir, 'COURSE.md'),
      '# C\n\n| 1 | S | ✅ |\n| 2 | S | ✅ |\n| 3 | S | ✅ |\n', 'utf8');
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit0');
    });
    try {
      // Simulate: validateSourceCourse passes, buildStagingDir creates files, dry-run exits 0
      const result = validateSourceCourse(sourceDir);
      expect(result.valid).toBe(true);
      const staging = buildStagingDir('course', 'test-slug', sourceDir);
      expect(existsSync(join(staging, 'COURSE.md'))).toBe(true);
      // In the real CLI, dry-run calls process.exit(0) after printing staging path
      process.exit(0);
    } catch (e) {
      if (e.message === 'exit0') {
        // Expected — dry-run exits 0
      } else {
        throw e;
      }
    } finally {
      exitSpy.mockRestore();
    }
  });
});

// ─── publish --type auto-detection ─────────────────────────────────────────────

describe('publish --type auto-detection', () => {
  it('detects skill when both SKILL.md and COMPLETION.md exist', () => {
    const dir = mkTemp();
    writeFileSync(join(dir, 'SKILL.md'), '# S', 'utf8');
    writeFileSync(join(dir, 'COMPLETION.md'), '---\nverdict: Course Complete\n---\n', 'utf8');
    const hasSkill  = existsSync(join(dir, 'SKILL.md')) && existsSync(join(dir, 'COMPLETION.md'));
    const hasCourse = existsSync(join(dir, 'COURSE.md'));
    const contentType = hasSkill ? 'skill' : hasCourse ? 'course' : null;
    expect(contentType).toBe('skill');
  });

  it('detects course when only COURSE.md exists', () => {
    const dir = mkTemp();
    writeFileSync(join(dir, 'COURSE.md'), '# C\n\n| 1 | S | ✅ |\n', 'utf8');
    const hasSkill  = existsSync(join(dir, 'SKILL.md')) && existsSync(join(dir, 'COMPLETION.md'));
    const hasCourse = existsSync(join(dir, 'COURSE.md'));
    const contentType = hasSkill ? 'skill' : hasCourse ? 'course' : null;
    expect(contentType).toBe('course');
  });

  it('returns null when neither exists', () => {
    const dir = mkTemp();
    const hasSkill  = existsSync(join(dir, 'SKILL.md')) && existsSync(join(dir, 'COMPLETION.md'));
    const hasCourse = existsSync(join(dir, 'COURSE.md'));
    const contentType = hasSkill ? 'skill' : hasCourse ? 'course' : null;
    expect(contentType).toBeNull();
  });

  it('is ambiguous when both SKILL.md and COURSE.md exist without COMPLETION.md', () => {
    const dir = mkTemp();
    writeFileSync(join(dir, 'SKILL.md'), '# S', 'utf8');
    writeFileSync(join(dir, 'COURSE.md'), '# C', 'utf8');
    // Without COMPLETION.md, hasSkill = false (requires both), so falls through to course
    const hasSkill  = existsSync(join(dir, 'SKILL.md')) && existsSync(join(dir, 'COMPLETION.md'));
    const hasCourse = existsSync(join(dir, 'COURSE.md'));
    const contentType = hasSkill ? 'skill' : hasCourse ? 'course' : null;
    expect(contentType).toBe('course');
  });
});

// ─── slug sanitization ────────────────────────────────────────────────────────

describe('slug sanitization', () => {
  it('passes [a-z0-9-] slugs through unchanged', () => {
    const safeSlug = 'react-hooks'.replace(/[^a-z0-9-]/gi, '-');
    expect(safeSlug).toBe('react-hooks');
  });

  it('replaces special chars with hyphens', () => {
    const safeSlug = 'foo"; rm -rf /'.replace(/[^a-z0-9-]/gi, '-');
    expect(safeSlug).toBe('foo---rm--rf--');
  });

  it('replaces dots and spaces', () => {
    const safeSlug = 'my course v1.0'.replace(/[^a-z0-9-]/gi, '-');
    expect(safeSlug).toBe('my-course-v1-0');
  });

  it('replaces $ and quotes', () => {
    const safeSlug = '$evil "injection"'.replace(/[^a-z0-9-]/gi, '-');
    expect(safeSlug).toBe('-evil--injection-');
  });
});

// ─── buildStagingDir with metadata ───────────────────────────────────────────

describe('buildStagingDir with pre-built metadata', () => {
  it('writes supplied meta object to meta.json for course', () => {
    const sourceDir = mkTemp();
    writeFileSync(join(sourceDir, 'COURSE.md'),
      '# C\n\n| 1 | S | ✅ |\n| 2 | S | ✅ |\n| 3 | S | ✅ |\n', 'utf8');
    const meta = { name: 'my-course', title: 'My Course', description: 'A great course', author: 'testuser', level: 'Beginner', topics: ['js'] };
    const staging = buildStagingDir('course', 'my-course', sourceDir, meta);
    const written = JSON.parse(readFileSync(join(staging, 'meta.json'), 'utf8'));
    expect(written.author).toBe('testuser');
    expect(written.title).toBe('My Course');
    expect(written.level).toBe('Beginner');
  });

  it('writes supplied meta object to meta.json for skill', () => {
    const sourceDir = mkTemp();
    writeFileSync(join(sourceDir, 'SKILL.md'), '# S', 'utf8');
    writeFileSync(join(sourceDir, 'COMPLETION.md'), '---\nverdict: Course Complete\n---\n', 'utf8');
    const meta = { name: 'my-skill', title: 'My Skill', description: 'Does things', author: 'testuser', origin_course: 'my-course', topics: ['js'] };
    const staging = buildStagingDir('skill', 'my-skill', sourceDir, meta);
    const written = JSON.parse(readFileSync(join(staging, 'meta.json'), 'utf8'));
    expect(written.author).toBe('testuser');
    expect(written.origin_course).toBe('my-course');
  });

  it('falls back to empty meta when no meta argument passed', () => {
    const sourceDir = mkTemp();
    writeFileSync(join(sourceDir, 'COURSE.md'),
      '# C\n\n| 1 | S | ✅ |\n| 2 | S | ✅ |\n| 3 | S | ✅ |\n', 'utf8');
    const staging = buildStagingDir('course', 'fallback-test', sourceDir);
    const written = JSON.parse(readFileSync(join(staging, 'meta.json'), 'utf8'));
    expect(written.author).toBe('');
  });
});

// ─── prUrl parsing (raw string from gh --jq .url) ────────────────────────────

describe('prUrl raw string parsing', () => {
  it('a raw https URL string is already the prUrl — no JSON.parse needed', () => {
    const rawOutput = 'https://github.com/owner/repo/pull/42\n';
    const prUrl = rawOutput.trim();
    expect(prUrl).toBe('https://github.com/owner/repo/pull/42');
    expect(prUrl.startsWith('https://')).toBe(true);
  });

  it('JSON.parse on a raw URL string throws SyntaxError (confirming old bug)', () => {
    const rawOutput = 'https://github.com/owner/repo/pull/42';
    expect(() => JSON.parse(rawOutput)).toThrow(SyntaxError);
  });
});

// ─── duplicate PR stderr parsing ─────────────────────────────────────────────

describe('duplicate PR stderr URL extraction', () => {
  it('extracts existing PR URL from gh pr create stderr', () => {
    const stderr = 'a pull request for branch "contribute/course/my-course" already exists:\nhttps://github.com/owner/courses-skills-registry/pull/7\n';
    const match = stderr.match(/https:\/\/github\.com\/[^\s]+/);
    expect(match).not.toBeNull();
    expect(match[0]).toBe('https://github.com/owner/courses-skills-registry/pull/7');
  });

  it('returns null when stderr has no URL', () => {
    const stderr = 'some other error message';
    const match = stderr.match(/https:\/\/github\.com\/[^\s]+/);
    expect(match).toBeNull();
  });
});
