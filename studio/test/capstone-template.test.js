/**
 * @vitest-environment node
 *
 * PW-01 / PW-02 — the bundled Playwright E2E template.
 *
 * Part 1 (Task 1) covers the pure content: syllabus, five pre-written lessons with quizzes, the
 * pre-flight checklist, the fixed R1–R7 rubric, bilingual parity and the "no complete spec in lesson
 * text" teaching rule.
 *
 * Part 2 (Task 2) covers idempotent seeding through `createCourse` + `createCapstone`.
 * Part 3 (Task 3) covers the New Course entry point and the `playwrightTemplate` i18n namespace.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import {
  PLAYWRIGHT_CAPSTONE_EXTERNAL_ID,
  PLAYWRIGHT_RUBRIC_KEYS,
  PLAYWRIGHT_TEMPLATE_ID,
  PLAYWRIGHT_TEMPLATE,
  findPlaywrightTemplateCourse,
  playwrightTemplateFor,
  seedPlaywrightTemplate,
} from '../src/data/templates/playwright-e2e.js';
import { PLAYWRIGHT_TEMPLATE_VI } from '../src/data/templates/playwright-e2e.vi.js';
import { createMemoryAdapter } from '../src/lib/repo/memory-adapter.js';
import * as repo from '../src/lib/repo/index.js';
import { translate } from '../src/lib/i18n/index.js';
import { NewCourse } from '../src/pages/NewCourse.jsx';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = join(HERE, '..', 'src', 'data', 'templates');
const EN_SOURCE = readFileSync(join(TEMPLATE_DIR, 'playwright-e2e.js'), 'utf8');
let adapter = createMemoryAdapter();

const VARIANTS = [
  { code: 'en', variant: PLAYWRIGHT_TEMPLATE },
  { code: 'vi', variant: PLAYWRIGHT_TEMPLATE_VI },
];

const PREFLIGHT_IDS = ['own_app', 'node', 'playwright', 'chromium', 'no_execution'];

describe('Playwright template: identity and variant selection', () => {
  it('exposes the fixed ids', () => {
    expect(PLAYWRIGHT_TEMPLATE_ID).toBe('playwright-e2e');
    expect(PLAYWRIGHT_CAPSTONE_EXTERNAL_ID).toBe('template:playwright-e2e');
    expect([...PLAYWRIGHT_RUBRIC_KEYS]).toEqual(['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7']);
    expect(Object.isFrozen(PLAYWRIGHT_RUBRIC_KEYS)).toBe(true);
  });

  it('ships the reviewed English title verbatim', () => {
    expect(playwrightTemplateFor('en').title).toBe(
      'Ship your first reliable Playwright E2E test for a real web workflow'
    );
  });

  it('selects the Vietnamese variant for the code and the legacy display name', () => {
    expect(playwrightTemplateFor('vi').language).toBe('vi');
    expect(playwrightTemplateFor('Vietnamese').language).toBe('vi');
    expect(playwrightTemplateFor('vi-VN').language).toBe('vi');
  });

  it('falls back to English for English, other languages and missing input', () => {
    expect(playwrightTemplateFor('en').language).toBe('en');
    expect(playwrightTemplateFor('es').language).toBe('en');
    expect(playwrightTemplateFor().language).toBe('en');
    expect(playwrightTemplateFor('en').title).toBe(PLAYWRIGHT_TEMPLATE.title);
  });

  it('returns a copy so a caller cannot mutate the module constant', () => {
    const first = playwrightTemplateFor('en');
    first.title = 'mutated';
    expect(PLAYWRIGHT_TEMPLATE.title).toBe(
      'Ship your first reliable Playwright E2E test for a real web workflow'
    );
  });
});

describe.each(VARIANTS)('Playwright template content ($code)', ({ code, variant }) => {
  it('is a programming course at intermediate level in its own language', () => {
    expect(variant.kind).toBe('programming');
    expect(variant.level).toBe('Intermediate');
    expect(variant.language).toBe(code);
    expect(variant.title.length).toBeGreaterThan(10);
    expect(variant.description.length).toBeGreaterThan(40);
    expect(variant.goal.length).toBeGreaterThan(20);
    expect(Array.isArray(variant.topics)).toBe(true);
    expect(variant.topics.length).toBeGreaterThan(0);
  });

  it('carries exactly five lessons in order, each a written lesson', () => {
    expect(variant.lessons).toHaveLength(5);
    variant.lessons.forEach((lesson) => {
      expect(typeof lesson.title).toBe('string');
      expect(lesson.title.length).toBeGreaterThan(5);
      expect(typeof lesson.summary).toBe('string');
      expect(lesson.summary.length).toBeGreaterThan(10);
      expect(lesson.content_md.length).toBeGreaterThanOrEqual(600);
    });
  });

  it('gives every lesson exactly five four-option quiz questions with valid answers', () => {
    variant.lessons.forEach((lesson) => {
      expect(lesson.quiz_seed).toHaveLength(5);
      lesson.quiz_seed.forEach((quiz) => {
        expect(typeof quiz.question).toBe('string');
        expect(quiz.question.length).toBeGreaterThan(5);
        expect(quiz.options).toHaveLength(4);
        quiz.options.forEach((option) => expect(typeof option).toBe('string'));
        expect(quiz.answerIndex).toBeGreaterThanOrEqual(0);
        expect(quiz.answerIndex).toBeLessThanOrEqual(3);
        expect(typeof quiz.explanation).toBe('string');
        expect(quiz.explanation.length).toBeGreaterThan(10);
      });
    });
  });

  it('keeps the seven-criterion rubric keyed R1…R7 with course-language text', () => {
    const rubric = variant.capstone.rubric;
    expect(rubric.map((criterion) => criterion.key)).toEqual([...PLAYWRIGHT_RUBRIC_KEYS]);
    rubric.forEach((criterion) => {
      expect(Object.keys(criterion).sort()).toEqual(['key', 'name', 'solid']);
      expect(criterion.name.trim().length).toBeGreaterThan(5);
      expect(criterion.solid.trim().length).toBeGreaterThan(30);
    });
  });

  it('ships an immutable programming capstone that Studio never runs', () => {
    expect(variant.capstone.kind).toBe('programming');
    expect(variant.capstone.tests).toBeNull();
    expect(variant.capstone.hiddenAnswers).toBeNull();
    expect(variant.capstone.externalId).toBe('template:playwright-e2e');
    expect(variant.capstone.brief_md.length).toBeGreaterThan(500);
    expect(Object.keys(variant.capstone.artifact).sort()).toEqual([
      'definitionOfDone',
      'deliverable',
      'title',
    ]);
    expect(variant.capstone.artifact.definitionOfDone.length).toBeGreaterThanOrEqual(3);
  });

  it('lists the five pre-flight checks in the fixed order', () => {
    expect(variant.preflight.map((item) => item.id)).toEqual(PREFLIGHT_IDS);
    variant.preflight.forEach((item) => {
      expect(item.label.length).toBeGreaterThan(10);
    });
  });

  it('never puts a complete runnable spec or a copyable run command in lesson text', () => {
    const offenders = [];
    for (const lesson of variant.lessons) {
      const body = lesson.content_md;
      if (body.includes('import { test, expect }')) offenders.push([lesson.title, 'import']);
      if (body.includes('test.describe(')) offenders.push([lesson.title, 'describe']);
      if (body.includes('npx playwright test')) offenders.push([lesson.title, 'run command']);
    }
    expect(offenders).toEqual([]);
  });

  it('keeps the brief headings the capstone renderer and rubric parser expect', () => {
    const headings = variant.capstone.brief_md
      .split('\n')
      .filter((line) => line.startsWith('## ') || line.startsWith('### '));
    expect(headings.length).toBeGreaterThanOrEqual(6);
    if (code === 'en') {
      expect(variant.capstone.brief_md).toContain("## What you'll ship");
      expect(variant.capstone.brief_md).toContain("## What you're proving");
      expect(variant.capstone.brief_md).toContain('## Definition of Done');
    } else {
      expect(variant.capstone.brief_md).toContain('## Bạn sẽ tạo ra gì');
      expect(variant.capstone.brief_md).toContain('## Định nghĩa hoàn thành');
    }
  });
});

describe('Playwright template: bilingual parity (Gate A)', () => {
  it('cannot drift structurally between the two languages', () => {
    const shape = (variant) => ({
      lessons: variant.lessons.length,
      quizzes: variant.lessons.map((lesson) => lesson.quiz_seed.length),
      options: variant.lessons.map((lesson) => lesson.quiz_seed.map((quiz) => quiz.options.length)),
      rubric: variant.capstone.rubric.map((criterion) => criterion.key),
      preflight: variant.preflight.map((item) => item.id),
      kind: variant.kind,
      level: variant.level,
    });
    expect(shape(PLAYWRIGHT_TEMPLATE_VI)).toEqual(shape(PLAYWRIGHT_TEMPLATE));
    expect(PLAYWRIGHT_TEMPLATE_VI.capstone.externalId).toBe(PLAYWRIGHT_TEMPLATE.capstone.externalId);
    expect(PLAYWRIGHT_TEMPLATE_VI.capstone.tests).toBe(PLAYWRIGHT_TEMPLATE.capstone.tests);
  });

  it('actually translates the text rather than reusing the English strings', () => {
    expect(PLAYWRIGHT_TEMPLATE_VI.title).not.toBe(PLAYWRIGHT_TEMPLATE.title);
    PLAYWRIGHT_TEMPLATE.lessons.forEach((lesson, index) => {
      expect(PLAYWRIGHT_TEMPLATE_VI.lessons[index].title).not.toBe(lesson.title);
      expect(PLAYWRIGHT_TEMPLATE_VI.lessons[index].content_md).not.toBe(lesson.content_md);
    });
    PLAYWRIGHT_TEMPLATE.capstone.rubric.forEach((criterion, index) => {
      expect(PLAYWRIGHT_TEMPLATE_VI.capstone.rubric[index].name).not.toBe(criterion.name);
    });
  });
});

describe('Playwright template: provider-free by construction (T-09-15)', () => {
  it('imports no provider, network or capstone-generation path', () => {
    const forbidden = [
      'getProvider',
      'createGenerateJson',
      'generateCapstoneForCourse',
      'validateCapstone',
      'fetch(',
    ];
    const found = forbidden.filter((symbol) => EN_SOURCE.includes(symbol));
    expect(found).toEqual([]);
  });
});

beforeEach(() => {
  adapter = createMemoryAdapter();
  repo.useAdapter(adapter);
});

async function rowCounts() {
  return {
    courses: (await adapter.list('courses')).length,
    lessons: (await adapter.list('lessons')).length,
    capstones: (await adapter.list('capstones')).length,
    versions: (await adapter.list('lesson_versions')).length,
  };
}

describe('Playwright template: seeding is idempotent and provider-free (PW-01, D-02)', () => {
  it('seeds one course with five readable lessons and their quizzes', async () => {
    const variant = playwrightTemplateFor('en');
    const result = await seedPlaywrightTemplate({ language: 'en' });

    expect(result.created).toBe(true);
    expect(result.course.title).toBe(variant.title);
    expect(result.course.source).toBe('manual');
    expect(result.course.language).toBe('en');
    expect(result.course.lessons).toHaveLength(5);
    expect(await rowCounts()).toEqual({ courses: 1, lessons: 5, capstones: 1, versions: 5 });

    for (const [index, lesson] of result.course.lessons.entries()) {
      expect(lesson.position).toBe(index + 1);
      const stored = await repo.getLessonContent(lesson.id);
      expect(stored.content_md).toBe(variant.lessons[index].content_md);
      const quiz = JSON.parse(lesson.quiz_seed);
      expect(quiz).toHaveLength(5);
      expect(quiz[0].options).toHaveLength(4);
    }
  });

  it('seeds the fixed seven-criterion capstone with tests: null and its keys intact', async () => {
    const variant = playwrightTemplateFor('en');
    const result = await seedPlaywrightTemplate({ language: 'en' });

    expect(result.capstone.external_id).toBe('template:playwright-e2e');
    expect(result.capstone.tests).toBeNull();
    expect(result.capstone.kind).toBe('programming');
    expect(result.capstone.rubric.map((criterion) => criterion.key)).toEqual([
      'R1',
      'R2',
      'R3',
      'R4',
      'R5',
      'R6',
      'R7',
    ]);
    expect(result.capstone.rubric.map((criterion) => criterion.name)).toEqual(
      variant.capstone.rubric.map((criterion) => criterion.name)
    );
    expect(result.capstone.brief_md).toBe(variant.capstone.brief_md);

    const found = await findPlaywrightTemplateCourse();
    expect(found.course.id).toBe(result.course.id);
    expect(found.capstone.id).toBe(result.capstone.id);
  });

  it('creates nothing on a second seed and returns the identical immutable row (T-09-07)', async () => {
    const first = await seedPlaywrightTemplate({ language: 'en' });
    const before = await rowCounts();
    const second = await seedPlaywrightTemplate({ language: 'en' });

    expect(second.created).toBe(false);
    expect(second.course.id).toBe(first.course.id);
    expect(second.capstone.id).toBe(first.capstone.id);
    expect(second.capstone.brief_md).toBe(first.capstone.brief_md);
    expect(second.capstone.rubric).toEqual(first.capstone.rubric);
    expect(await rowCounts()).toEqual(before);
  });

  it('collapses two concurrent seeds into one course (React StrictMode double invoke)', async () => {
    const [a, b] = await Promise.all([
      seedPlaywrightTemplate({ language: 'en' }),
      seedPlaywrightTemplate({ language: 'en' }),
    ]);

    expect(a.course.id).toBe(b.course.id);
    expect(a.capstone.id).toBe(b.capstone.id);
    expect((await rowCounts()).courses).toBe(1);
  });

  it('seeds the Vietnamese course on a fresh adapter with the same rubric keys', async () => {
    const variant = playwrightTemplateFor('vi');
    const result = await seedPlaywrightTemplate({ language: 'vi' });

    expect(result.course.title).toBe(variant.title);
    expect(result.course.language).toBe('vi');
    expect(result.course.lessons).toHaveLength(5);
    const stored = await repo.getLessonContent(result.course.lessons[0].id);
    expect(stored.content_md).toBe(PLAYWRIGHT_TEMPLATE_VI.lessons[0].content_md);
    expect(result.capstone.rubric.map((criterion) => criterion.key)).toEqual([
      ...PLAYWRIGHT_RUBRIC_KEYS,
    ]);
    expect(result.capstone.rubric[0].name).toBe(PLAYWRIGHT_TEMPLATE_VI.capstone.rubric[0].name);
  });

  it('never calls a model: seeding works with an empty settings object and no fetch', async () => {
    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = (...args) => {
      fetchCalls += 1;
      return originalFetch?.(...args);
    };
    try {
      await seedPlaywrightTemplate({});
      await seedPlaywrightTemplate({ language: 'vi' });
    } finally {
      globalThis.fetch = originalFetch;
    }
    expect(fetchCalls).toBe(0);
    expect(EN_SOURCE).not.toContain('loadSettings');
  });
});

describe('Playwright template: New Course entry point (D-15)', () => {
  it('renders the template card with all five pre-flight labels above the free-text form', () => {
    const html = renderToString(createElement(NewCourse));

    expect(html).toContain(translate('en', 'playwrightTemplate.card.title'));
    expect(html).toContain(translate('en', 'playwrightTemplate.card.description'));
    expect(html).toContain(translate('en', 'playwrightTemplate.card.checklistTitle'));
    expect(html).toContain(translate('en', 'playwrightTemplate.card.checklistHint'));
    for (const item of PLAYWRIGHT_TEMPLATE.preflight) {
      expect(html, `missing pre-flight label ${item.id}`).toContain(item.label);
    }
    expect((html.match(/type="checkbox"/g) || []).length).toBeGreaterThanOrEqual(6);

    // The CTA stays disabled until every item is ticked.
    const cta = html.match(/<button[^>]*>[^<]*<\/button>/g) || [];
    const templateButton = cta.find((button) =>
      button.includes(translate('en', 'playwrightTemplate.card.notReady'))
    );
    expect(templateButton).toBeDefined();
    expect(templateButton).toContain('disabled');
  });

  it('keeps the free-text and skip-AI affordances so the template is additive', () => {
    const html = renderToString(createElement(NewCourse));

    expect(html).toContain(translate('en', 'newCourse.topic.label'));
    expect(html).toContain(translate('en', 'newCourse.skipAi'));
    expect(html).toContain(translate('en', 'newCourse.propose'));

    // The template card comes first, in document order.
    expect(html.indexOf(translate('en', 'playwrightTemplate.card.title'))).toBeLessThan(
      html.indexOf(translate('en', 'newCourse.topic.label'))
    );
  });
});
