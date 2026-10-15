import { describe, it, expect } from 'vitest';
import { extractFencedBlocks, findExerciseSection, extractSkeleton, seedFiles, filesFromRows } from '../src/lib/runner/skeleton.js';

const LESSON = `# Functions

## Concept

Here is a quick sample:

\`\`\`javascript
const x = 1;
\`\`\`

## Exercise

Write a function that doubles a number.

\`\`\`javascript
// TODO: implement double
function double(n) {
}

console.assert(double(2) === 4, 'double works');
\`\`\`
`;

describe('runner skeleton extraction', () => {
  it('finds fenced blocks', () => {
    const blocks = extractFencedBlocks(LESSON);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].info).toBe('javascript');
  });

  it('finds the exercise section body', () => {
    const section = findExerciseSection(LESSON);
    expect(section).toBeTruthy();
    expect(section.body).toContain('double');
    expect(section.body).not.toContain('quick sample');
  });

  it('prefers the exercise block matching the course language', () => {
    const skeleton = extractSkeleton(LESSON, { language: 'javascript' });
    expect(skeleton.content).toContain('function double');
    expect(skeleton.language).toBe('javascript');
  });

  it('returns null when no block matches the requested language', () => {
    expect(extractSkeleton(LESSON, { language: 'python' })).toBeNull();
  });

  it('falls back to any block when the language is unknown', () => {
    const skeleton = extractSkeleton(LESSON, { language: null });
    expect(skeleton.content).toContain('function double');
  });

  it('seeds a workspace file from the skeleton', () => {
    const files = seedFiles({ content_md: LESSON }, { title: 'JS basics' });
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe('main.js');
    expect(files[0].content).toContain('function double');
  });

  it('falls back to an empty main file without an exercise', () => {
    const files = seedFiles({ content_md: '# Just prose' }, { title: 'Intro to Go' });
    expect(files[0].path).toBe('main.go');
    expect(files[0].content).toBe('');
  });

  it('normalises rows into files, dropping rows without a path', () => {
    const rows = [
      { path: 'main.js', content: 'a', language: 'javascript' },
      { path: '', content: 'orphan' },
      { path: 'util.py', content: 'b' },
    ];
    expect(filesFromRows(rows).map((f) => f.path)).toEqual(['main.js', 'util.py']);
    expect(filesFromRows(rows)[1].language).toBe('python');
  });
});
