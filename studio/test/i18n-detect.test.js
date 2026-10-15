/**
 * @vitest-environment node
 *
 * LANG-04 — dependency-free output-language detection.
 */
import { describe, it, expect } from 'vitest';
import {
  stripCode,
  vietnameseRatio,
  asciiRatio,
  detectLanguage,
  checkLanguage,
  collectStrings,
  checkJsonLanguage,
} from '../src/lib/i18n/detect.js';

const VI_PROSE =
  'Học tập không phải là đọc — mà là truy hồi. Não bạn củng cố một ký ức mỗi lần bạn kéo nó ra khỏi ký ức.';

const EN_PROSE =
  'Learning is not reading — it is retrieval. Your brain strengthens a memory each time you pull it back out.';

const VI_CODE_LESSON = `${VI_PROSE}

## Ví dụ

Đoạn mã dưới đây minh hoạ vòng lặp và cách ta kiểm tra từng phần tử một:

\`\`\`javascript
function sum(items) {
  return items.reduce((total, item) => total + item.price, 0);
}
\`\`\`

Hãy thử sửa hàm trên để xử lý mảng rỗng một cách an toàn.`;

const EN_CODE_LESSON = `${EN_PROSE}

## Example

The snippet below demonstrates the loop and how we check each item:

\`\`\`javascript
function sum(items) {
  return items.reduce((total, item) => total + item.price, 0);
}
\`\`\`

Try to fix the function above so it handles an empty array safely.`;

describe('stripCode', () => {
  it('removes fenced blocks and inline code from the measured text', () => {
    const stripped = stripCode('Use `map` here.\n```js\nconst x = 1;\n```');
    expect(stripped).not.toContain('map');
    expect(stripped).not.toContain('const x');
  });
});

describe('ratios', () => {
  it('Vietnamese prose has diacritics; English does not', () => {
    expect(vietnameseRatio(VI_PROSE)).toBeGreaterThan(0.1);
    expect(vietnameseRatio(EN_PROSE)).toBe(0);
    expect(asciiRatio(EN_PROSE)).toBeGreaterThan(0.95);
    expect(asciiRatio(VI_PROSE)).toBeLessThan(0.95);
  });
});

describe('detectLanguage', () => {
  it('detects Vietnamese and English', () => {
    expect(detectLanguage(VI_PROSE)).toBe('vi');
    expect(detectLanguage(EN_PROSE)).toBe('en');
  });

  it('ignores fenced code so code-heavy lessons are still detected', () => {
    expect(detectLanguage(VI_CODE_LESSON)).toBe('vi');
    expect(detectLanguage(EN_CODE_LESSON)).toBe('en');
  });

  it('detects CJK scripts', () => {
    expect(detectLanguage('これは日本語の文章です。')).toBe('ja');
    expect(detectLanguage('这是一个中文句子。')).toBe('zh');
  });
});

describe('checkLanguage', () => {
  it('accepts the matching language', () => {
    expect(checkLanguage(VI_PROSE, 'vi').ok).toBe(true);
    expect(checkLanguage(EN_PROSE, 'en').ok).toBe(true);
  });

  it('rejects the wrong language', () => {
    expect(checkLanguage(EN_PROSE, 'vi').ok).toBe(false);
    expect(checkLanguage(VI_PROSE, 'en').ok).toBe(false);
  });

  it('accepts either a code or a legacy display name', () => {
    expect(checkLanguage(VI_PROSE, 'Vietnamese').ok).toBe(true);
    expect(checkLanguage(EN_PROSE, 'English').ok).toBe(true);
  });

  it('does not fail a payload with no letters to measure', () => {
    expect(checkLanguage('123 + 456 = 579', 'vi').ok).toBe(true);
  });
});

describe('checkJsonLanguage', () => {
  it('checks every string field of a JSON value', () => {
    const syllabus = {
      title: 'Học máy cơ bản',
      lessons: [{ title: 'Giới thiệu', summary: 'Tổng quan về học máy.' }],
    };
    expect(checkJsonLanguage(syllabus, 'vi').ok).toBe(true);
    expect(checkJsonLanguage(syllabus, 'en').ok).toBe(false);
    expect(collectStrings(syllabus)).toHaveLength(3);
  });

  it('passes when there are no strings', () => {
    expect(checkJsonLanguage({ lessons: 4 }, 'vi').ok).toBe(true);
  });
});
