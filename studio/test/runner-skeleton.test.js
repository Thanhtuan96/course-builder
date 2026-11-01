import { describe, it, expect } from 'vitest';
import {
  extractFencedBlocks,
  findExerciseSection,
  extractSkeleton,
  planSeed,
  seedFiles,
  filesFromRows,
} from '../src/lib/runner/skeleton.js';

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
    const lesson = `# Lesson

## Exercise

\`\`\`javascript
const x = 1;
\`\`\`
`;
    expect(extractSkeleton(lesson, { language: 'python' })).toBeNull();
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

// RON-265 — a generated Docker lesson put the real skeleton (with TODO markers) in a `dockerfile`
// fence and a "provided, do not edit" reference file in a `js` fence after it. The first fence that
// normalised to the course language won, so the workspace seeded the reference file as `main.js`
// with the Browser runner and the exercise never appeared.
const UAT_LESSON = `# Bài 1: Dockerfile đầu tiên

## Giải thích

Một image được dựng từ Dockerfile.

## Bài tập

Hoàn thành Dockerfile dưới đây.

\`\`\`dockerfile
# TODO 1: chọn base image
FROM node:20-alpine

# TODO 2: copy package.json
COPY package.json .

# TODO 6: chạy ứng dụng
CMD ["node", "health.js"]
\`\`\`

health.js — có sẵn, không cần sửa:

\`\`\`js
// health.js — có sẵn, không cần sửa
console.log("ok");
\`\`\`

Tự kiểm tra:

\`\`\`bash
docker image inspect my-app:1 > /dev/null
docker build -t my-app:1 .
docker run --rm my-app:1
\`\`\`
`;

const DOCKER_COURSE = { title: 'Docker cơ bản', kind: 'programming', language: 'javascript' };

describe('RON-265 exercise skeleton in a language the runner cannot run', () => {
  it('RON-265 reports the dockerfile TODO skeleton instead of seeding the js reference file', () => {
    const skeleton = extractSkeleton(UAT_LESSON, { language: 'javascript' });
    expect(skeleton.language).toBeNull();
    expect(skeleton.unsupported).toBe('dockerfile');
    expect(skeleton.content).toContain('# TODO 1');

    const plan = planSeed({ content_md: UAT_LESSON }, DOCKER_COURSE);
    expect(plan.files).toEqual([]);
    expect(plan.unsupportedSkeleton.info).toBe('dockerfile');
    expect(plan.unsupportedSkeleton.content).toContain('# TODO 6');
  });

  it('RON-265 never seeds the bash self-check block as the entry file', () => {
    const plan = planSeed({ content_md: UAT_LESSON }, { title: 'Docker', language: 'bash' });
    expect(plan.files).toEqual([]);
    expect(plan.unsupportedSkeleton.info).toBe('dockerfile');
  });

  it('RON-265 reports the same skeleton when the course language is unknown', () => {
    const plan = planSeed({ content_md: UAT_LESSON }, { title: 'Docker cơ bản', kind: 'programming' });
    expect(plan.files).toEqual([]);
    expect(plan.unsupportedSkeleton.info).toBe('dockerfile');
  });

  it('RON-265 prefers a supported-language TODO fence that comes after a non-TODO fence', () => {
    const lesson = `# Lesson

## Exercise

The helper is provided:

\`\`\`python
def helper():
    return 1
\`\`\`

Complete the skeleton:

\`\`\`python
# TODO: implement add
def add(a, b):
    pass
\`\`\`
`;
    const skeleton = extractSkeleton(lesson, { language: 'python' });
    expect(skeleton.language).toBe('python');
    expect(skeleton.unsupported).toBeUndefined();
    expect(skeleton.content).toContain('# TODO: implement add');
    expect(skeleton.content).not.toContain('def helper');
  });

  it('RON-265 finds the TODO skeleton under an English exercise heading', () => {
    const lesson = `# Dockerfile

## Exercise

\`\`\`dockerfile
# TODO: pin the base image
FROM node:20-alpine
\`\`\`

\`\`\`js
// reference, do not edit
console.log("ok");
\`\`\`
`;
    const plan = planSeed({ content_md: lesson }, DOCKER_COURSE);
    expect(plan.files).toEqual([]);
    expect(plan.unsupportedSkeleton.info).toBe('dockerfile');
    expect(plan.unsupportedSkeleton.content).toBe('# TODO: pin the base image\nFROM node:20-alpine');
  });

  it('RON-265 keeps the first-matching-fence rule when the exercise has no TODO fence', () => {
    const lesson = `# Lesson

## Exercise

\`\`\`bash
echo "hello"
\`\`\`

\`\`\`js
console.log("check");
\`\`\`
`;
    expect(extractSkeleton(lesson, { language: 'bash' })).toEqual({ content: 'echo "hello"', language: 'bash' });
  });
});

describe('RON-265 TODO ranking', () => {
  it('RON-265 prefers a TODO fence in the course language over a TODO fence in another language', () => {
    const lesson = `# Lesson

## Exercise

\`\`\`bash
# TODO: run the checks afterwards
npm test
\`\`\`

\`\`\`javascript
// TODO: implement double
function double(n) {}
\`\`\`
`;
    const skeleton = extractSkeleton(lesson, { language: 'javascript' });
    expect(skeleton.language).toBe('javascript');
    expect(skeleton.content).toContain('function double');
  });

  it('RON-265 still takes a supported TODO fence when the course language differs', () => {
    const lesson = `# Lesson

## Exercise

\`\`\`typescript
// TODO: type the helper
function double(n: number): number {
  return n;
}
\`\`\`
`;
    const skeleton = extractSkeleton(lesson, { language: 'javascript' });
    expect(skeleton.language).toBe('typescript');
    expect(skeleton.content).toContain('function double');
  });
});

describe('RON-265 TODO marker is uppercase', () => {
  it('RON-265 does not take a lowercase todo in a reference file as the skeleton', () => {
    const lesson = `# Todo app

## Exercise

Start from this reference renderer:

\`\`\`python
# render the todo list
print("todo")
\`\`\`

Complete the skeleton:

\`\`\`javascript
function render(items) {}
\`\`\`
`;
    const skeleton = extractSkeleton(lesson, { language: 'javascript' });
    expect(skeleton.language).toBe('javascript');
    expect(skeleton.content).toBe('function render(items) {}');
  });
});
