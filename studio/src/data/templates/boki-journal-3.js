/**
 * Bundled template — "Boki 3級 — Journal entry basics" (簿記3級 仕訳).
 *
 * Pre-written content only: seeding makes zero model calls, resolves no provider and touches no
 * network, so a learner with no API key gets the whole course. Every exercise ships a distractor-rich
 * chart, an answer key and three hint layers authored in this variant's UI language (design D1a/D6).
 */
import { normalizeLanguage } from '../../lib/i18n/languages.js';
import {
  createCourse,
  createExercise,
  getCourse,
  listCourses,
  listLessonExercises,
} from '../../lib/repo/index.js';
import { BOKI_TEMPLATE_VI } from './boki-journal-3.vi.js';

export const BOKI_TEMPLATE_ID = 'boki-journal-3';
export const BOKI_COURSE_EXTERNAL_ID = 'template:boki-journal-3';

/** Account glosses for this variant. Japanese names are never translated. */
const GLOSS = {
  現金: 'Cash',
  普通預金: 'Ordinary deposit',
  売掛金: 'Accounts receivable',
  貸付金: 'Loans receivable',
  買掛金: 'Accounts payable',
  借入金: 'Borrowings',
  預り金: 'Withholdings',
  売上: 'Sales',
  仕入: 'Purchases',
  地代家賃: 'Rent',
  水道光熱費: 'Utilities',
  通信費: 'Communication',
  消耗品費: 'Supplies expense',
  給料: 'Salaries',
};

/**
 * @param {string} id
 * @param {{ prompt: string, gloss: string, debit: [string, number][], credit: [string, number][], chart: string[], hints: string[] }} input
 */
function exercise(id, { prompt, gloss, debit, credit, chart, hints }) {
  const toRows = (rows) => rows.map(([account, amount]) => ({ account, amount }));
  return {
    version: 1,
    type: 'journal-entry',
    id,
    prompt,
    promptGloss: gloss,
    accounts: chart.map((name) => ({ name, gloss: GLOSS[name] })),
    answer: { debit: toRows(debit), credit: toRows(credit) },
    hints,
  };
}

const LESSON_1 = {
  title: '現金・預金 — Cash and deposits',
  summary: 'Cash and the bank account are both assets: record what came in and what went out.',
  content_md: `# 現金・預金 — Cash and deposits

## What this lesson covers

Two accounts carry most everyday money movements: 現金 (cash on hand) and 普通預金 (the ordinary
bank account). Both are **assets**, so the same rule decides every entry: an asset that increases is
written on the debit side, an asset that decreases on the credit side.

## ポイント (key points)

- Money entering the office increases 現金 → debit.
- Money leaving the office decreases 現金 → credit.
- Moving money between the safe and the bank changes nothing overall: one asset up, one asset down.
- Buying goods for resale is the three-account method (三分法): the cost is an expense at purchase,
  not an asset waiting to be sold.

## Worked example

The business paid ¥18,000 in cash for a one-year fire-insurance premium.

- Insurance belongs to this period's cost, so it is an expense → debit 保険料 18,000
- Cash left the office, so the asset decreased → credit 現金 18,000

## よくある間違い (common mistakes)

- Writing a deposit as revenue. Moving money into the bank does not earn anything.
- Recording a purchase of goods as an asset. Under 三分法 the cost is expensed when you buy.

## Summary

Ask two questions for every transaction: *which asset moved, and in which direction?* Then check that
the two sides are equal before you leave the page.`,
  quiz_seed: [
    {
      question: '商品を現金で売り上げた。貸方にくる勘定科目はどれか。',
      options: ['売上', '売掛金', '仕入', '買掛金'],
      answerIndex: 0,
      explanation: '現金売り上げでは、受け取った現金を借方、収益である売上を貸方に書く。',
    },
    {
      question: '銀行の普通預金口座から現金を引き出した。借方にくる勘定科目はどれか。',
      options: ['現金', '普通預金', '借入金', '貸付金'],
      answerIndex: 0,
      explanation: '手元の現金が増えるので借方。減った普通預金は貸方。',
    },
    {
      question: '商品を仕入れ、代金を現金で支払った。借方にくる勘定科目はどれか。',
      options: ['仕入', '売上', '現金', '買掛金'],
      answerIndex: 0,
      explanation: '三分法では、転売目的の商品の取得原価を仕入（費用）として借方に書く。',
    },
  ],
  exercises: [
    exercise('l1-e1', {
      prompt: '商品 50,000 円を現金で売り上げた。',
      gloss: 'Sold goods for ¥50,000 in cash.',
      debit: [['現金', 50000]],
      credit: [['売上', 50000]],
      chart: ['現金', '売上', '普通預金', '仕入', '売掛金', '買掛金'],
      hints: [
        'Name what the business received and what it gave up in this transaction.',
        'What came in is an asset (debit); what the business earned by giving something up is revenue (credit).',
        'Payment happened on the spot, so no right to collect later is created.',
      ],
    }),
    exercise('l1-e2', {
      prompt: '銀行の普通預金口座から現金 100,000 円を引き出した。',
      gloss: 'Withdrew ¥100,000 in cash from the ordinary deposit account.',
      debit: [['現金', 100000]],
      credit: [['普通預金', 100000]],
      chart: ['現金', '普通預金', '売掛金', '買掛金', '借入金', '貸付金'],
      hints: [
        'Money moved between two places the business keeps it.',
        'Both what increased and what decreased are assets; an asset increase goes on the debit side.',
        'What arrived at the office increased; what stayed at the bank decreased.',
      ],
    }),
    exercise('l1-e3', {
      prompt: '現金 80,000 円を普通預金口座に預け入れた。',
      gloss: 'Deposited ¥80,000 in cash into the ordinary deposit account.',
      debit: [['普通預金', 80000]],
      credit: [['現金', 80000]],
      chart: ['現金', '普通預金', '売掛金', '買掛金', '借入金', '貸付金'],
      hints: [
        'This is the reverse of withdrawing cash from the bank.',
        'The side that increased goes on the debit side; the side that decreased goes on the credit side.',
        'What you deposited is still an asset you can use later.',
      ],
    }),
    exercise('l1-e4', {
      prompt: '商品 60,000 円を仕入れ、代金は現金で支払った。',
      gloss: 'Purchased goods for ¥60,000 and paid in cash.',
      debit: [['仕入', 60000]],
      credit: [['現金', 60000]],
      chart: ['仕入', '現金', '売上', '普通預金', '売掛金', '買掛金', '消耗品費'],
      hints: [
        'Goods came in and the payment was made on the spot.',
        'The cost of the goods is an expense (debit); the payment reduces an asset (credit).',
        'Under the three-account method, goods bought for resale are recorded as a cost at purchase, not carried as an asset.',
      ],
    }),
  ],
};

const LESSON_2 = {
  title: '商品売買・掛取引 — Merchandise and credit transactions',
  summary: 'Selling and buying on credit creates a claim or an obligation; settle it in a second entry.',
  content_md: `# 商品売買・掛取引 — Merchandise and credit transactions

## What this lesson covers

Most business-to-business trade happens on credit. The sale and the cash arrive at different times,
so each trade produces two entries: one when goods change hands, one when the money follows.

## ポイント (key points)

- Selling on credit: the right to collect is an asset (売掛金, debit); the sale is revenue (売上,
  credit).
- Buying on credit: the cost of the goods is an expense (仕入, debit); the obligation to pay is a
  liability (買掛金, credit).
- Collecting or paying later only moves an asset against a claim or an obligation — no new revenue or
  expense.
- A return reverses the original entry for the returned part.

## Worked example

The business sold goods for ¥150,000 on credit, then received the money into the bank account.

1. At the sale: debit 売掛金 150,000 / credit 売上 150,000
2. At the collection: debit 普通預金 150,000 / credit 売掛金 150,000

## よくある間違い (common mistakes)

- Recording revenue a second time when the customer pays.
- Debiting the expense again when a payable is settled.

## Summary

Ask when the money moves: now, later, or never (a return). That decides whether you write a new
claim, settle an old one, or reverse the entry.`,
  quiz_seed: [
    {
      question: '商品を掛けで売り上げた。貸方にくる勘定科目はどれか。',
      options: ['売上', '売掛金', '買掛金', '現金'],
      answerIndex: 0,
      explanation: '掛け売りでも収益は売上。受け取る権利である売掛金は借方。',
    },
    {
      question: '商品を掛けで仕入れた。貸方にくる勘定科目はどれか。',
      options: ['買掛金', '売掛金', '仕入', '現金'],
      answerIndex: 0,
      explanation: '後で払う義務が買掛金（負債）。仕入は借方の費用。',
    },
    {
      question: '売掛金を普通預金口座で回収した。貸方にくる勘定科目はどれか。',
      options: ['売掛金', '普通預金', '売上', '現金'],
      answerIndex: 0,
      explanation: '回収すると受け取る権利が消えるので、売掛金を貸方に書く。',
    },
  ],
  exercises: [
    exercise('l2-e1', {
      prompt: '商品 120,000 円を売り上げ、代金は掛けとした。',
      gloss: 'Sold goods for ¥120,000 on credit.',
      debit: [['売掛金', 120000]],
      credit: [['売上', 120000]],
      chart: ['売掛金', '売上', '買掛金', '仕入', '現金', '普通預金'],
      hints: [
        'The goods went out, but the cash has not come in yet.',
        'The right to collect later is an asset (debit); the sale is revenue (credit).',
        'What the business received today is a claim, not money.',
      ],
    }),
    exercise('l2-e2', {
      prompt: '商品 90,000 円を仕入れ、代金は掛けとした。',
      gloss: 'Purchased goods for ¥90,000 on credit.',
      debit: [['仕入', 90000]],
      credit: [['買掛金', 90000]],
      chart: ['仕入', '買掛金', '売上', '売掛金', '現金', '普通預金'],
      hints: [
        'The goods came in, but the cash has not been paid yet.',
        'The cost of the goods is an expense (debit); the obligation to pay later is a liability (credit).',
        'Under the three-account method, the cost is expensed at purchase instead of being carried as an asset.',
      ],
    }),
    exercise('l2-e3', {
      prompt: '売掛金 120,000 円を普通預金口座で回収した。',
      gloss: 'Collected ¥120,000 of receivables into the ordinary deposit account.',
      debit: [['普通預金', 120000]],
      credit: [['売掛金', 120000]],
      chart: ['普通預金', '売掛金', '現金', '買掛金', '売上', '仕入'],
      hints: [
        'A right recorded earlier has turned into money.',
        'The asset that came in goes on the debit side; the right that disappeared goes on the credit side.',
        'The sale was already recorded, so revenue does not increase again.',
      ],
    }),
    exercise('l2-e4', {
      prompt: '買掛金 90,000 円を普通預金口座から支払った。',
      gloss: 'Paid ¥90,000 of payables from the ordinary deposit account.',
      debit: [['買掛金', 90000]],
      credit: [['普通預金', 90000]],
      chart: ['買掛金', '普通預金', '現金', '売掛金', '売上', '仕入'],
      hints: [
        'An obligation recorded earlier has been settled.',
        'The liability that disappeared goes on the debit side; the asset that went out goes on the credit side.',
        'The cost of the purchase was already recorded, so the expense does not increase again.',
      ],
    }),
    exercise('l2-e5', {
      prompt: '掛けで売り上げた商品のうち 10,000 円分が返品された。',
      gloss: '¥10,000 of goods sold on credit were returned.',
      debit: [['売上', 10000]],
      credit: [['売掛金', 10000]],
      chart: ['売上', '売掛金', '仕入', '買掛金', '現金', '普通預金'],
      hints: [
        'Part of an earlier sale has been undone.',
        'The original entry is reversed: the revenue is reduced and so is the claim on the customer.',
        'The customer no longer owes the returned part, so the amount to collect falls.',
      ],
    }),
  ],
};

const LESSON_3 = {
  title: '経費・その他 — Expenses and other transactions',
  summary: 'Period costs, compound entries and the transactions that are not revenue.',
  content_md: `# 経費・その他 — Expenses and other transactions

## What this lesson covers

Expenses are costs used up in this period: rent, utilities, salaries, supplies. Some transactions
touch several accounts at once, and some only change the shape of the balance sheet.

## ポイント (key points)

- A period cost goes on the debit side; whatever was handed over goes on the credit side.
- Compound entries simply mean several rows on one side. Every debit row still has to be matched by
  the credit side.
- Tax withheld from a salary is not the employee's money: it is held for the tax office, so it is a
  liability until it is paid over.
- Borrowing brings in an asset and creates a liability of the same amount; it is never revenue.

## Worked example

The business paid ¥40,000 of salaries, withholding ¥4,000 for tax, and handed over the rest in cash.

- Debit 給料 40,000 (the whole cost of this period)
- Credit 預り金 4,000 (kept for the tax office) and 現金 36,000 (actually paid out)

## よくある間違い (common mistakes)

- Recording only the cash handed over and losing the whole salary cost.
- Treating a loan as income because cash came in.

## Summary

Total the cost first, then split the credit side into what was handed over and what was kept back.`,
  quiz_seed: [
    {
      question: '給料から所得税を差し引き、残額を現金で支払った。差し引いた分の貸方にくる勘定科目はどれか。',
      options: ['預り金', '給料', '現金', '借入金'],
      answerIndex: 0,
      explanation: '差し引いた税額は一時的に預かる負債なので預り金（貸方）。',
    },
    {
      question: '事務所の家賃を支払った。借方にくる勘定科目はどれか。',
      options: ['地代家賃', '水道光熱費', '消耗品費', '通信費'],
      answerIndex: 0,
      explanation: '家賃は地代家賃という費用。当期の費用は借方に書く。',
    },
    {
      question: '銀行からお金を借り入れた。貸方にくる勘定科目はどれか。',
      options: ['借入金', '貸付金', '現金', '売上'],
      answerIndex: 0,
      explanation: '借りたお金は返す義務なので借入金（負債）を貸方に書く。',
    },
  ],
  exercises: [
    exercise('l3-e1', {
      prompt: '事務所の家賃 80,000 円を現金で支払った。',
      gloss: 'Paid ¥80,000 office rent in cash.',
      debit: [['地代家賃', 80000]],
      credit: [['現金', 80000]],
      chart: ['地代家賃', '現金', '普通預金', '水道光熱費', '通信費', '消耗品費', '売上'],
      hints: [
        'The business consumed a service and paid for it at the same time.',
        'A cost belonging to this period is an expense (debit); the payment reduces an asset (credit).',
        'The benefit is used up now, so it does not become an asset.',
      ],
    }),
    exercise('l3-e2', {
      prompt: '水道光熱費 12,000 円を普通預金口座から支払った。',
      gloss: 'Paid ¥12,000 of utilities from the ordinary deposit account.',
      debit: [['水道光熱費', 12000]],
      credit: [['普通預金', 12000]],
      chart: ['水道光熱費', '普通預金', '現金', '地代家賃', '通信費', '消耗品費'],
      hints: [
        'This is the same shape as paying rent, only the payment method differs.',
        'The expense goes on the debit side; the deposit that decreased goes on the credit side.',
        'The money left a bank account, not the cash box.',
      ],
    }),
    exercise('l3-e3', {
      prompt: '給料 300,000 円のうち所得税の預り金 20,000 円を差し引き、残額を現金で支払った。',
      gloss: 'Salaries of ¥300,000, less ¥20,000 income tax withheld; the rest was paid in cash.',
      debit: [['給料', 300000]],
      credit: [
        ['預り金', 20000],
        ['現金', 280000],
      ],
      chart: [
        '給料',
        '預り金',
        '現金',
        '普通預金',
        '借入金',
        '貸付金',
        '売掛金',
        '買掛金',
      ],
      hints: [
        'One payment settles two recipients at once.',
        'The expense goes on the debit side; the credit side splits into the part actually handed over and the part kept back.',
        'What the employee received plus what was kept for the tax office equals the total.',
      ],
    }),
    exercise('l3-e4', {
      prompt: '銀行から 200,000 円を借り入れ、現金で受け取った。',
      gloss: 'Borrowed ¥200,000 from the bank and received it in cash.',
      debit: [['現金', 200000]],
      credit: [['借入金', 200000]],
      chart: ['現金', '借入金', '普通預金', '貸付金', '預り金', '売掛金'],
      hints: [
        'The business received money and took on an obligation at the same time.',
        'The asset that increased goes on the debit side; the liability that increased goes on the credit side.',
        'The money must be repaid, so it is not revenue.',
      ],
    }),
    exercise('l3-e5', {
      prompt: '事務用品 15,000 円と通信費 5,000 円を現金で支払った。',
      gloss: 'Paid ¥15,000 for office supplies and ¥5,000 for communication in cash.',
      debit: [
        ['消耗品費', 15000],
        ['通信費', 5000],
      ],
      credit: [['現金', 20000]],
      chart: ['消耗品費', '通信費', '現金', '普通預金', '地代家賃', '水道光熱費', '給料'],
      hints: [
        'One payment covered two different costs.',
        'Each cost gets its own debit row; the single payment is one credit row.',
        'Add the two costs first, then check that the credit side matches that total.',
      ],
    }),
  ],
};

export const BOKI_TEMPLATE = {
  id: BOKI_TEMPLATE_ID,
  title: 'Boki 3級 — Journal entry basics',
  description:
    'Practise 仕訳 (journal entries) for the Japanese Bookkeeping 3rd grade exam: cash and deposits, merchandise and credit trade, expenses and other transactions. Three written lessons, 14 graded exercises with hints, no API key needed.',
  level: 'Beginner',
  kind: 'skill',
  goal: 'Record everyday business transactions as correct debit/credit entries in 簿記3級 style.',
  topics: ['bookkeeping', 'journal entries', '簿記3級'],
  language: 'en',
  lessons: [LESSON_1, LESSON_2, LESSON_3],
};

/**
 * Pick the variant for a UI language. English is the fallback.
 * @param {string} [language] a BCP-47 code or a legacy display name
 * @returns {object} a shallow copy, so a caller cannot mutate the module constant
 */
export function bokiTemplateFor(language) {
  const variant = normalizeLanguage(language) === 'vi' ? BOKI_TEMPLATE_VI : BOKI_TEMPLATE;
  return { ...variant };
}

/**
 * Find the already-seeded template course, if any. A template course is identified by
 * `courses.external_id` — no title matching, so language variants and renames stay safe.
 * @returns {Promise<{ course: object } | null>}
 */
export async function findBokiTemplateCourse() {
  const courses = await listCourses();
  for (const course of courses) {
    if (course.deleted_at) continue;
    if (course.external_id !== BOKI_COURSE_EXTERNAL_ID) continue;
    const withLessons = await getCourse(course.id);
    return { course: withLessons || course };
  }
  return null;
}

let seeding = null;
let seedingLanguage = null;

/**
 * Seed the Boki template course once, through the repo API only.
 *
 * Zero model calls: no provider is resolved and nothing touches the network, so it works with no API
 * key (RON-266). Idempotent: the second call returns the existing course and writes nothing, and the
 * in-flight promise is memoised per language so React StrictMode's double invoke cannot seed twice.
 *
 * @param {{ language?: string }} [options] the course language; Vietnamese gets its own variant
 * @returns {Promise<{ course: object, exercises: object[], created: boolean }>}
 */
export function seedBokiTemplate({ language } = {}) {
  const code = normalizeLanguage(language);
  if (seeding) {
    if (seedingLanguage === code) return seeding;
    return seeding.then(() => seedBokiTemplate({ language: code }));
  }
  seedingLanguage = code;
  seeding = doSeedBokiTemplate(code).finally(() => {
    seeding = null;
    seedingLanguage = null;
  });
  return seeding;
}

/** @param {string} code a normalized language code */
async function doSeedBokiTemplate(code) {
  const existing = await findBokiTemplateCourse();
  if (existing) return { ...existing, exercises: await lessonExercises(existing.course), created: false };

  const variant = bokiTemplateFor(code);
  const course = await createCourse({
    title: variant.title,
    description: variant.description,
    level: variant.level,
    kind: variant.kind,
    goal: variant.goal,
    topics: variant.topics,
    language: variant.language,
    source: 'manual',
    externalId: BOKI_COURSE_EXTERNAL_ID,
    lessons: variant.lessons.map(({ title, summary, content_md, quiz_seed }) => ({
      title,
      summary,
      content_md,
      quiz_seed,
    })),
  });

  const exercises = [];
  for (let i = 0; i < variant.lessons.length; i++) {
    const lesson = variant.lessons[i];
    const lessonId = course.lessons[i]?.id;
    for (let j = 0; j < lesson.exercises.length; j++) {
      const spec = lesson.exercises[j];
      exercises.push(
        await createExercise({
          courseId: course.id,
          lessonId,
          position: j + 1,
          type: spec.type,
          spec,
          externalId: `template:${BOKI_TEMPLATE_ID}:${i + 1}:${spec.id}`,
        })
      );
    }
  }

  return { course, exercises, created: true };
}

/** @param {object} course */
async function lessonExercises(course) {
  const out = [];
  for (const lesson of course.lessons || []) {
    out.push(...(await listLessonExercises(lesson.id)));
  }
  return out;
}
