import { describe, it, expect } from 'vitest';
import {
  allLessonsDone,
  capstoneUnlocked,
  capstoneProgress,
  capstoneHasTests,
  runCapstoneTests,
  summarizeChecks,
  artifactLabel,
  capstoneCopy,
  verdictLabel,
  toCompletionMarkdown,
  completionFilename,
} from '../src/lib/capstone.js';

const course = (lessons) => ({ id: 'c1', title: 'Ship a URL shortener', level: 'Intermediate', kind: 'programming', language: 'English', lessons });

describe('capstone unlock', () => {
  it('is locked until every lesson is done', () => {
    expect(capstoneUnlocked(course([{ status: 'done' }, { status: 'todo' }]))).toBe(false);
    expect(capstoneUnlocked(course([{ status: 'done' }, { status: 'done' }]))).toBe(true);
    expect(capstoneUnlocked(course([]))).toBe(false);
  });

  it('ignores tombstoned lessons and reports progress', () => {
    const c = course([{ status: 'done' }, { status: 'done' }, { status: 'todo', deleted_at: '2026-01-01' }]);
    expect(capstoneUnlocked(c)).toBe(true);
    expect(capstoneProgress(c)).toEqual({ done: 2, total: 2, pct: 100 });
  });
});

describe('runCapstoneTests', () => {
  const capstone = {
    tests: {
      language: 'python',
      entry: 'capstone_test.py',
      files: { 'capstone_test.py': 'assert True' },
    },
  };

  it('merges the test files over the submission and reports failed checks', async () => {
    let seen = null;
    const runImpl = async (input) => {
      seen = input;
      return { runner: 'browser', exitCode: 1, checks: [{ name: 'a', passed: true }, { name: 'b', passed: false }], stdout: '', stderr: '' };
    };
    const result = await runCapstoneTests({ capstone, files: { 'main.py': 'x' }, runImpl });
    expect(seen.language).toBe('python');
    expect(seen.entry).toBe('capstone_test.py');
    expect(Object.keys(seen.files).sort()).toEqual(['capstone_test.py', 'main.py']);
    expect(result.failed).toBe(true);
    expect(result.checks).toHaveLength(2);
  });

  it('falls back to a non-zero exit code when there are no named checks', async () => {
    const result = await runCapstoneTests({
      capstone,
      files: {},
      runImpl: async () => ({ runner: 'browser', exitCode: 1, checks: [] }),
    });
    expect(result.failed).toBe(true);
  });

  it('returns null when the capstone has no tests', async () => {
    expect(capstoneHasTests({ tests: null })).toBe(false);
    expect(await runCapstoneTests({ capstone: { tests: null }, files: {} })).toBeNull();
  });

  it('summarizeChecks counts pass/fail/total', () => {
    expect(summarizeChecks([{ passed: true }, { passed: false }, { passed: true }])).toEqual({ passed: 2, failed: 1, total: 3 });
    expect(summarizeChecks(null)).toEqual({ passed: 0, failed: 0, total: 0 });
  });
});

describe('copy + artifact helpers', () => {
  it('artifactLabel prefers the title', () => {
    expect(artifactLabel({ title: 'Playbook', deliverable: 'x' })).toBe('Playbook');
    expect(artifactLabel({ deliverable: 'x' })).toBe('x');
    expect(artifactLabel(null)).toBe('');
  });

  it('localises the page copy (English + Vietnamese)', () => {
    expect(capstoneCopy('English').yourArtifact).toBe('Your artifact');
    expect(capstoneCopy('Vietnamese').yourArtifact).toBe('Sản phẩm của bạn');
    expect(capstoneCopy('Unknown').yourArtifact).toBe('Your artifact');
  });

  it('verdictLabel maps stored verdicts', () => {
    expect(verdictLabel('course_complete')).toBe('Course Complete');
    expect(verdictLabel('needs_work')).toBe('Needs work');
  });
});

describe('toCompletionMarkdown', () => {
  const capstone = {
    artifact: { title: 'A deployed URL shortener', deliverable: 'A mini-app + repo.' },
  };
  const submission = {
    content_md: 'I built a shortener with a Node backend. '.repeat(10),
    repo_url: 'https://github.com/learner/shortener',
    created_at: '2026-10-15T10:00:00.000Z',
    review: { verdict: 'course_complete', criteria: [{ name: 'Correctness', rating: 'solid' }], nextAction: 'Add rate limiting' },
  };

  it('writes the plugin frontmatter plus the artifact and rubric', () => {
    const md = toCompletionMarkdown({ course: course([]), capstone, submission });
    expect(md).toContain('verdict: Course Complete');
    expect(md).toContain('course: ship-a-url-shortener');
    expect(md).toContain('completed: 2026-10-15');
    expect(md).toContain('artifact: A deployed URL shortener');
    expect(md).toContain('artifact_link: https://github.com/learner/shortener');
    expect(md).toMatch(/capstone_summary: I built a shortener/);
    expect(md).toContain('- **Correctness** — solid');
    expect(md).toContain('**You built this yourself.**');
  });

  it('names the export file after the course slug', () => {
    expect(completionFilename(course([]))).toBe('ship-a-url-shortener-COMPLETION.md');
  });
});
