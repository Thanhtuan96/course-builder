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

  it('finds a localised (Vietnamese) exercise section by its stable id', () => {
    const vi = LESSON
      .replace('## Concept', '## Giải thích')
      .replace('## Exercise', '## Bài tập');
    const section = findExerciseSection(vi);
    expect(section).toBeTruthy();
    expect(section.body).toContain('double');
    const skeleton = extractSkeleton(vi, { language: 'javascript' });
    expect(skeleton.content).toContain('function double');
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

// A `#` comment at column 0 is code in Bash/Python/Ruby, but it matches the Markdown heading
// pattern. The exercise section must not end inside its own fence (RON-197).
describe('RON-197 heading-looking lines inside fenced code blocks', () => {
  const BASH_LESSON = `# Your first Bash script

## Explanation

\`\`\`bash
# Not an exercise heading: this is a comment.
echo "hello"
\`\`\`

## Exercise

Complete the script so it exits successfully.

\`\`\`bash
#!/usr/bin/env bash
# Print the completion message.
echo "TODO: finish the exercise"
exit 1
\`\`\`

## Key takeaways

Exit status 0 means success.
`;

  const PYTHON_LESSON = `# Your first Python script

## Concept

\`\`\`python
print("concept")
\`\`\`

## Exercise

\`\`\`python
# Print a greeting.
print("hello")
\`\`\`

## Recap

That is all.
`;

  it('extracts a Bash exercise whose comments start at column 0', () => {
    const section = findExerciseSection(BASH_LESSON);
    expect(section.body).toContain('# Print the completion message.');
    expect(section.body).toContain('exit 1');

    const skeleton = extractSkeleton(BASH_LESSON, { language: 'bash' });
    expect(skeleton.language).toBe('bash');
    expect(skeleton.content).toBe(
      '#!/usr/bin/env bash\n# Print the completion message.\necho "TODO: finish the exercise"\nexit 1'
    );
  });

  it('extracts a Python exercise whose comments start at column 0', () => {
    const section = findExerciseSection(PYTHON_LESSON);
    expect(section.body).toContain('# Print a greeting.');
    expect(section.body).not.toContain('concept');

    const skeleton = extractSkeleton(PYTHON_LESSON, { language: 'python' });
    expect(skeleton.language).toBe('python');
    expect(skeleton.content).toBe('# Print a greeting.\nprint("hello")');
  });

  it('still ends the exercise section at a real heading after the fence', () => {
    const section = findExerciseSection(BASH_LESSON);
    expect(section.body).not.toContain('Key takeaways');
    expect(section.body).not.toContain('Exit status 0 means success.');
    expect(section.end).toBe(BASH_LESSON.indexOf('## Key takeaways'));
  });

  it('handles ~~~ fences the same way as ``` fences', () => {
    const lesson = `# Tilde lesson

## Exercise

~~~bash
# Tilde comment at column 0.
echo "hi"
~~~

## After

Done.
`;
    const section = findExerciseSection(lesson);
    expect(section.body).toContain('# Tilde comment at column 0.');
    expect(section.end).toBe(lesson.indexOf('## After'));

    const skeleton = extractSkeleton(lesson, { language: 'bash' });
    expect(skeleton.content).toBe('# Tilde comment at column 0.\necho "hi"');
  });

  it('ignores a heading-looking line inside a non-exercise fence earlier in the lesson', () => {
    const lesson = `# Lesson

## Concept

\`\`\`bash
# Exercise is not a heading here.
echo "concept"
\`\`\`

## Exercise

Do the real exercise.

\`\`\`bash
echo "real"
\`\`\`
`;
    const section = findExerciseSection(lesson);
    expect(section.start).toBe(lesson.indexOf('## Exercise'));
    expect(section.body).toContain('Do the real exercise.');
    expect(section.body).not.toContain('concept');
  });

  it('finds no exercise section when every candidate line is inside a fence', () => {
    const lesson = `# Lesson

## Concept

\`\`\`bash
# Exercise: only a comment, not a heading.
echo "concept"
\`\`\`
`;
    expect(findExerciseSection(lesson)).toBeNull();
  });
});
