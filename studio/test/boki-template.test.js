/**
 * @vitest-environment node
 *
 * RON-266 — the bundled Boki 3級 仕訳 template: accounting-correct content, distractor-rich charts,
 * localized hints, bilingual parity, idempotent provider-free seeding and the New Course card.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import {
  BOKI_COURSE_EXTERNAL_ID,
  BOKI_TEMPLATE,
  BOKI_TEMPLATE_ID,
  bokiTemplateFor,
  findBokiTemplateCourse,
  seedBokiTemplate,
} from '../src/data/templates/boki-journal-3.js';
import { BOKI_TEMPLATE_VI } from '../src/data/templates/boki-journal-3.vi.js';
import { chartDistractorIssues, validateExerciseSpec } from '../src/lib/exercises/spec.js';
import { createMemoryAdapter } from '../src/lib/repo/memory-adapter.js';
import * as repo from '../src/lib/repo/index.js';
import { translate } from '../src/lib/i18n/index.js';
import { NewCourse } from '../src/pages/NewCourse.jsx';

const VARIANTS = [
  { code: 'en', variant: BOKI_TEMPLATE },
  { code: 'vi', variant: BOKI_TEMPLATE_VI },
];

const LESSON_NAMES = ['現金・預金', '商品売買・掛取引', '経費・その他'];

const allExercises = (variant) => variant.lessons.flatMap((lesson) => lesson.exercises);

const exerciseById = (variant, id) =>
  allExercises(variant).find((exercise) => exercise.id === id);

const keyAccounts = (exercise) =>
  new Set([...exercise.answer.debit, ...exercise.answer.credit].map((row) => row.account));

const keyAmounts = (exercise) =>
  [...exercise.answer.debit, ...exercise.answer.credit].map((row) => row.amount);

beforeEach(() => {
  repo.useAdapter(createMemoryAdapter());
});

describe('RON-266 boki: identity and variants', () => {
  it('exposes fixed ids and selects the variant by language', () => {
    expect(BOKI_TEMPLATE_ID).toBe('boki-journal-3');
    expect(BOKI_COURSE_EXTERNAL_ID).toBe('template:boki-journal-3');
    expect(bokiTemplateFor('vi').language).toBe('vi');
    expect(bokiTemplateFor('en').language).toBe('en');
    expect(bokiTemplateFor('fr').language).toBe('en');
    const copy = bokiTemplateFor('en');
    expect(copy).not.toBe(BOKI_TEMPLATE);
    expect(copy.kind).toBe('skill');
  });

  it('RON-266 boki: three lessons with three to five exercises each', () => {
    for (const { variant } of VARIANTS) {
      expect(variant.lessons).toHaveLength(3);
      variant.lessons.forEach((lesson, index) => {
        expect(lesson.title.startsWith(LESSON_NAMES[index])).toBe(true);
        expect(lesson.exercises.length).toBeGreaterThanOrEqual(3);
        expect(lesson.exercises.length).toBeLessThanOrEqual(5);
        expect(lesson.content_md.length).toBeGreaterThan(200);
        expect(lesson.quiz_seed).toHaveLength(3);
      });
      expect(allExercises(variant)).toHaveLength(14);
    }
  });
});

describe('RON-266 boki: accounting content', () => {
  it('RON-266 boki: merchandise answers follow the three-account method', () => {
    for (const { variant } of VARIANTS) {
      const cashSale = exerciseById(variant, 'l1-e1');
      expect(cashSale.answer.credit).toEqual([{ account: '売上', amount: 50000 }]);
      expect(cashSale.answer.debit).toEqual([{ account: '現金', amount: 50000 }]);

      const creditSale = exerciseById(variant, 'l2-e1');
      expect(creditSale.answer.debit).toEqual([{ account: '売掛金', amount: 120000 }]);
      expect(creditSale.answer.credit).toEqual([{ account: '売上', amount: 120000 }]);

      const creditPurchase = exerciseById(variant, 'l2-e2');
      expect(creditPurchase.answer.debit).toEqual([{ account: '仕入', amount: 90000 }]);
      expect(creditPurchase.answer.credit).toEqual([{ account: '買掛金', amount: 90000 }]);

      const salesReturn = exerciseById(variant, 'l2-e5');
      expect(salesReturn.answer.debit).toEqual([{ account: '売上', amount: 10000 }]);
      expect(salesReturn.answer.credit).toEqual([{ account: '売掛金', amount: 10000 }]);
    }
  });

  it('RON-266 boki: every exercise key balances and uses its own chart', () => {
    for (const { variant } of VARIANTS) {
      for (const exercise of allExercises(variant)) {
        expect(() => validateExerciseSpec(exercise)).not.toThrow();
        const names = exercise.accounts.map((account) => account.name);
        for (const account of keyAccounts(exercise)) expect(names).toContain(account);
        for (const account of exercise.accounts) expect(account.gloss.length).toBeGreaterThan(0);
        const debit = exercise.answer.debit.reduce((n, row) => n + row.amount, 0);
        const credit = exercise.answer.credit.reduce((n, row) => n + row.amount, 0);
        expect(debit).toBe(credit);
        for (const row of [...exercise.answer.debit, ...exercise.answer.credit]) {
          expect(Number.isInteger(row.amount)).toBe(true);
          expect(row.amount).toBeGreaterThan(0);
        }
      }
    }
  });

  it('RON-266 boki: every exercise chart has six accounts with four outside the key', () => {
    for (const { variant } of VARIANTS) {
      for (const exercise of allExercises(variant)) {
        const names = exercise.accounts.map((account) => account.name);
        const key = keyAccounts(exercise);
        expect(names.length).toBeGreaterThanOrEqual(6);
        expect(names.filter((name) => !key.has(name)).length).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it('RON-266 boki: charts carry the partner confusers', () => {
    const pairs = [
      ['現金', '普通預金'],
      ['売掛金', '買掛金'],
      ['売上', '仕入'],
      ['借入金', '預り金'],
    ];
    for (const { variant } of VARIANTS) {
      for (const exercise of allExercises(variant)) {
        expect(chartDistractorIssues(exercise)).toEqual([]);
        const names = exercise.accounts.map((account) => account.name);
        for (const [first, second] of pairs) {
          if (keyAccounts(exercise).has(first)) expect(names).toContain(second);
          if (keyAccounts(exercise).has(second)) expect(names).toContain(first);
        }
      }
    }
  });

  it('RON-266 boki: at least one exercise is compound', () => {
    for (const { variant } of VARIANTS) {
      const compound = allExercises(variant).filter(
        (exercise) => exercise.answer.debit.length > 1 || exercise.answer.credit.length > 1
      );
      expect(compound.length).toBeGreaterThanOrEqual(2);
      expect(exerciseById(variant, 'l3-e3').answer.credit).toHaveLength(2);
      expect(exerciseById(variant, 'l3-e5').answer.debit).toHaveLength(2);
    }
  });
});

describe('RON-266 boki: hints and quizzes', () => {
  it('RON-266 boki: hints are layered and never name a key account or amount', () => {
    for (const { variant } of VARIANTS) {
      for (const exercise of allExercises(variant)) {
        expect(exercise.hints.length).toBeGreaterThanOrEqual(1);
        expect(exercise.hints.length).toBeLessThanOrEqual(3);
        for (const hint of exercise.hints) {
          expect(hint.trim().length).toBeGreaterThan(10);
          for (const account of keyAccounts(exercise)) expect(hint).not.toContain(account);
          for (const amount of keyAmounts(exercise)) {
            const text = String(amount);
            expect(hint.replace(/,/g, '')).not.toContain(text);
          }
        }
      }
    }
  });

  it('RON-266 boki: hints are authored in the UI language', () => {
    for (const { variant } of VARIANTS) {
      for (const exercise of allExercises(variant)) {
        for (const hint of exercise.hints) {
          // Japanese may appear only as a category word in kanji; kana means a leftover Japanese hint.
          expect(hint, `${exercise.id}: ${hint}`).not.toMatch(/[\u3040-\u30ff]/);
        }
      }
    }
    const en = exerciseById(BOKI_TEMPLATE, 'l1-e1').hints;
    const vi = exerciseById(BOKI_TEMPLATE_VI, 'l1-e1').hints;
    expect(vi).not.toEqual(en);
    expect(vi[0]).toContain('Hãy');
  });

  it('ships three four-option quizzes per lesson', () => {
    for (const { variant } of VARIANTS) {
      for (const lesson of variant.lessons) {
        for (const item of lesson.quiz_seed) {
          expect(item.options).toHaveLength(4);
          expect(Number.isInteger(item.answerIndex)).toBe(true);
          expect(item.answerIndex).toBeGreaterThanOrEqual(0);
          expect(item.answerIndex).toBeLessThanOrEqual(3);
          expect(item.explanation.length).toBeGreaterThan(10);
        }
      }
    }
  });
});

describe('RON-266 boki: seeding', () => {
  it('RON-266 boki: starting the card seeds the course and navigates to it', async () => {
    const result = await seedBokiTemplate({ language: 'en' });
    expect(result.created).toBe(true);
    expect(result.course.title).toBe(BOKI_TEMPLATE.title);
    expect(result.course.kind).toBe('skill');
    expect(result.course.external_id).toBe(BOKI_COURSE_EXTERNAL_ID);
    expect(result.course.lessons).toHaveLength(3);
    expect(result.exercises).toHaveLength(14);

    const exercises = await repo.listCourseExercises(result.course.id);
    expect(Object.keys(exercises)).toHaveLength(3);
    const firstLesson = result.course.lessons[0];
    expect(exercises[firstLesson.id].map((row) => row.spec.id)).toEqual([
      'l1-e1',
      'l1-e2',
      'l1-e3',
      'l1-e4',
    ]);
    expect(exercises[firstLesson.id][0].external_id).toBe('template:boki-journal-3:1:l1-e1');

    const content = await repo.getLessonContent(firstLesson.id);
    expect(content.content_md).toContain('現金・預金');
    expect(content.provider).toBe('demo');
  });

  it('RON-266 boki: a second start reuses the seeded course', async () => {
    const first = await seedBokiTemplate({ language: 'en' });
    const second = await seedBokiTemplate({ language: 'en' });

    expect(second.created).toBe(false);
    expect(second.course.id).toBe(first.course.id);
    expect(await repo.listCourses()).toHaveLength(1);

    const found = await findBokiTemplateCourse();
    expect(found.course.id).toBe(first.course.id);

    const exercises = await repo.listCourseExercises(first.course.id);
    expect(Object.values(exercises).flat()).toHaveLength(14);
  });

  it('RON-266 boki: a later start in another language keeps the first variant', async () => {
    const first = await seedBokiTemplate({ language: 'vi' });
    expect(first.created).toBe(true);

    const second = await seedBokiTemplate({ language: 'en' });

    expect(second.created).toBe(false);
    expect(second.course.id).toBe(first.course.id);
    expect(second.course.language).toBe('vi');
    expect(second.course.title).toBe(BOKI_TEMPLATE_VI.title);
    expect(await repo.listCourses()).toHaveLength(1);
  });

  it('RON-266 boki: the seeded variant follows the client language', async () => {
    const result = await seedBokiTemplate({ language: 'vi' });
    expect(result.course.language).toBe('vi');
    expect(result.course.title).toBe(BOKI_TEMPLATE_VI.title);
    expect(result.course.lessons[0].title).toContain('Tiền mặt');
    const content = await repo.getLessonContent(result.course.lessons[0].id);
    expect(content.content_md).toContain('Bài này học gì');
  });

  it('RON-266 boki: exercise external ids are stable across re-seeds', async () => {
    const first = await seedBokiTemplate({ language: 'en' });
    const ids = first.exercises.map((exercise) => exercise.external_id).sort();
    expect(ids[0]).toBe('template:boki-journal-3:1:l1-e1');
    expect(ids).toContain('template:boki-journal-3:3:l3-e5');

    const second = await seedBokiTemplate({ language: 'en' });
    expect(second.exercises.map((exercise) => exercise.external_id).sort()).toEqual(ids);
  });

  it('RON-266 boki: en and vi variants have the same shape', () => {
    const shape = (variant) =>
      variant.lessons.map((lesson) => ({
        exercises: lesson.exercises.map((exercise) => ({
          id: exercise.id,
          type: exercise.type,
          accounts: exercise.accounts.map((account) => account.name),
          debit: exercise.answer.debit,
          credit: exercise.answer.credit,
          hints: exercise.hints.length,
          quizzes: lesson.quiz_seed.length,
        })),
      }));
    expect(shape(BOKI_TEMPLATE_VI)).toEqual(shape(BOKI_TEMPLATE));
  });

  it('RON-266 boki: account names stay Japanese in both variants', () => {
    for (const { variant } of VARIANTS) {
      for (const exercise of allExercises(variant)) {
        for (const account of exercise.accounts) {
          expect(account.name).toMatch(/[\u4e00-\u9fff]/);
          expect(account.name).not.toMatch(/[a-zA-Z]/);
        }
      }
    }
    expect(exerciseById(BOKI_TEMPLATE, 'l1-e1').accounts[0].gloss).toBe('Cash');
    expect(exerciseById(BOKI_TEMPLATE_VI, 'l1-e1').accounts[0].gloss).toBe('Tiền mặt');
    expect(exerciseById(BOKI_TEMPLATE_VI, 'l1-e4').accounts.find((a) => a.name === '仕入').gloss).toBe(
      'Mua hàng'
    );
    expect(
      exerciseById(BOKI_TEMPLATE_VI, 'l3-e3').accounts.find((a) => a.name === '預り金').gloss
    ).toBe('Tiền giữ lại (thuế khấu trừ)');
    expect(
      exerciseById(BOKI_TEMPLATE_VI, 'l1-e2').accounts.find((a) => a.name === '普通預金').gloss
    ).toBe('Tiền gửi không kỳ hạn');
  });
});

describe('RON-266 boki: New Course entry point', () => {
  it('RON-266 boki: the template card renders with no provider configured', () => {
    const html = renderToString(createElement(NewCourse));
    expect(html).toContain(translate('en', 'newCourse.bokiTemplate.title'));
    expect(html).toContain(translate('en', 'newCourse.bokiTemplate.description'));
    expect(html).toContain(translate('en', 'newCourse.bokiTemplate.cta'));
    expect(html.toLowerCase()).not.toContain('api key is required');
  });

  it('RON-266 boki: card copy follows the UI language', () => {
    expect(translate('en', 'newCourse.bokiTemplate.cta')).not.toBe(
      translate('vi', 'newCourse.bokiTemplate.cta')
    );
    expect(translate('vi', 'newCourse.bokiTemplate.description')).toContain('bài tập');
    expect(translate('en', 'newCourse.bokiTemplate.description')).toContain('exercises');
  });

  it('keeps the free-text form after the template cards', () => {
    const html = renderToString(createElement(NewCourse));
    expect(html.indexOf(translate('en', 'newCourse.bokiTemplate.title'))).toBeGreaterThan(
      html.indexOf(translate('en', 'playwrightTemplate.card.title'))
    );
    expect(html.indexOf(translate('en', 'newCourse.bokiTemplate.title'))).toBeLessThan(
      html.indexOf(translate('en', 'newCourse.topic.label'))
    );
  });
});
