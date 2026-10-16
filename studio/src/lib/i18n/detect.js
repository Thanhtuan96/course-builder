/**
 * Dependency-free output-language detection (LANG-04).
 *
 * After a generation we check that the text is actually in the learner's language. The check is
 * deliberately simple and robust:
 *   • `vi` → ratio of Vietnamese diacritic letters among all letters (>= a low threshold).
 *   • `en` → ASCII-letter ratio (English has almost none; Vietnamese diacritics pull it down).
 *   • generic fallback → stopword hit-rate across the supported languages.
 *
 * Fenced code blocks and inline `code` are stripped first so a code-heavy programming lesson does
 * not skew the measurement.
 */
import { DEFAULT_LANGUAGE, normalizeLanguage } from './languages.js';

/** Vietnamese letters that carry a diacritic (the strongest signal for `vi`). */
const VI_DIACRITIC = /[ăâđêôơưàảãáạằẳẵắặầẩẫấậèẻẽéẹềểễếệìỉĩíịòỏõóọồổỗốộờởỡớợùủũúụừửữứựỳỷỹýỵ]/i;

/** Character ranges for scripts that are unambiguous without a stopword list. */
const JA_RE = /[\u3040-\u30ff]/; // hiragana / katakana
const ZH_RE = /[\u4e00-\u9fff]/; // CJK ideographs

/** Small, high-signal stopword lists for the generic fallback. */
const STOPWORDS = {
  en: ['the', 'and', 'of', 'to', 'in', 'is', 'are', 'for', 'that', 'with', 'you', 'this', 'it'],
  vi: ['và', 'của', 'là', 'các', 'cho', 'với', 'một', 'này', 'được', 'trong', 'những', 'khi', 'để'],
  es: ['el', 'la', 'de', 'que', 'y', 'en', 'los', 'una', 'para', 'con', 'por', 'es', 'no'],
  fr: ['le', 'la', 'de', 'et', 'les', 'des', 'une', 'pour', 'dans', 'est', 'que', 'pas', 'sur'],
  de: ['der', 'die', 'und', 'das', 'ist', 'ein', 'eine', 'nicht', 'mit', 'auf', 'für', 'den', 'zu'],
};

/** Remove fenced ``` blocks and inline `code` spans so code never counts as prose. */
export function stripCode(text) {
  return String(text ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ');
}

/** @param {string} text @returns {string[]} */
function letters(text) {
  return String(text).match(/\p{L}/gu) || [];
}

/** Fraction of letters carrying a Vietnamese diacritic. @param {string} text */
export function vietnameseRatio(text) {
  const all = letters(stripCode(text));
  if (!all.length) return 0;
  return all.filter((ch) => VI_DIACRITIC.test(ch)).length / all.length;
}

/** Fraction of letters that are plain ASCII (English signal). @param {string} text */
export function asciiRatio(text) {
  const all = letters(stripCode(text));
  if (!all.length) return 0;
  return all.filter((ch) => ch.codePointAt(0) < 128).length / all.length;
}

/** Stopword hit-rate for one language. @param {string} text @param {string} code */
export function stopwordRate(text, code) {
  const words = String(stripCode(text)).toLowerCase().match(/\p{L}+/gu) || [];
  if (!words.length) return 0;
  const set = new Set(STOPWORDS[code] || []);
  let hits = 0;
  for (const word of words) if (set.has(word)) hits += 1;
  return hits / words.length;
}

/** Vietnamese diacritic ratio needed to accept `vi` (low — prose easily clears it). */
export const VI_THRESHOLD = 0.03;
/** ASCII-letter ratio needed to accept `en`. */
export const EN_THRESHOLD = 0.9;

/**
 * Guess the language of a text. Returns a supported code, or null when there is no signal.
 * @param {string} text
 * @returns {string|null}
 */
export function detectLanguage(text) {
  const prose = stripCode(text);
  if (JA_RE.test(prose)) return 'ja';
  if (ZH_RE.test(prose)) return 'zh';
  if (vietnameseRatio(prose) >= VI_THRESHOLD) return 'vi';
  // Spanish/French/German prose is also mostly ASCII, so let stopwords decide before the ASCII
  // ratio falls back to English.
  let best = null;
  let bestRate = 0;
  for (const code of Object.keys(STOPWORDS)) {
    const rate = stopwordRate(prose, code);
    if (rate > bestRate) {
      bestRate = rate;
      best = code;
    }
  }
  if (best && best !== 'en') return best;
  if (asciiRatio(prose) >= EN_THRESHOLD) return 'en';
  return best;
}

/**
 * Check whether text is written in the expected language.
 * @param {unknown} text
 * @param {unknown} expected a BCP-47 code or legacy display name
 * @returns {{ ok: boolean, expected: string, detected: string|null, score: number, reason: string }}
 */
export function checkLanguage(text, expected) {
  const code = normalizeLanguage(expected);
  const prose = stripCode(text);
  if (!letters(prose).length) {
    // Nothing to measure (e.g. a JSON payload of pure code/numbers) — never block on it.
    return { ok: true, expected: code, detected: null, score: 1, reason: 'no-letters' };
  }

  if (code === 'vi') {
    const score = vietnameseRatio(prose);
    return {
      ok: score >= VI_THRESHOLD,
      expected: code,
      detected: detectLanguage(prose),
      score,
      reason: score >= VI_THRESHOLD ? 'vietnamese-diacritics' : 'missing-vietnamese-diacritics',
    };
  }

  if (code === 'en') {
    const score = asciiRatio(prose);
    const detected = detectLanguage(prose);
    const ok = score >= EN_THRESHOLD && (detected === 'en' || detected === null);
    return { ok, expected: code, detected, score, reason: ok ? 'ascii' : 'non-ascii-letters' };
  }

  if (code === 'ja') return { ok: JA_RE.test(prose), expected: code, detected: detectLanguage(prose), score: JA_RE.test(prose) ? 1 : 0, reason: 'kana' };
  if (code === 'zh') return { ok: ZH_RE.test(prose), expected: code, detected: detectLanguage(prose), score: ZH_RE.test(prose) ? 1 : 0, reason: 'cjk' };

  // Generic fallback: the expected language must be the strongest stopword match.
  const detected = detectLanguage(prose);
  const score = stopwordRate(prose, code);
  return { ok: detected === code, expected: code, detected, score, reason: 'stopwords' };
}

/**
 * Recursively collect every string value inside a JSON-like structure.
 * @param {unknown} value
 * @returns {string[]}
 */
export function collectStrings(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (value && typeof value === 'object') {
    return Object.values(value).flatMap(collectStrings);
  }
  return [];
}

/**
 * Check every string field of a generated JSON value (syllabus, quiz, flashcards, capstone).
 * @param {unknown} value
 * @param {unknown} expected
 */
export function checkJsonLanguage(value, expected) {
  const joined = collectStrings(value).join('\n');
  if (!joined.trim()) return { ok: true, expected: normalizeLanguage(expected), detected: null, score: 1, reason: 'no-strings' };
  return checkLanguage(joined, expected);
}
