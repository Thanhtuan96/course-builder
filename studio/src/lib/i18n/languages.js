/**
 * One learning language (LANG-01).
 *
 * The app stores a single BCP-47 language code (`settings.language`, `courses.language`). Older
 * builds stored display names ("English", "Vietnamese") and Phase 33 lesson label tables used the
 * same names, so `normalizeLanguage` accepts BOTH and is the single place that maps legacy values
 * to codes. Everything else (prompts, headings, detection) resolves through here.
 */

/** Supported learning languages, in display order. `code` is the BCP-47 value we store. */
export const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'ja', name: 'Japanese' },
  { code: 'zh', name: 'Chinese' },
];

/** The fallback / default learning language. */
export const DEFAULT_LANGUAGE = 'en';

/** Language options for selectors (code + display name). */
export function uiLanguageOptions() {
  return LANGUAGES;
}

const BY_CODE = new Map(LANGUAGES.map((l) => [l.code.toLowerCase(), l.code]));
const BY_NAME = new Map(LANGUAGES.map((l) => [l.name.toLowerCase(), l.code]));

/** Legacy display-name aliases that never matched a `LANGUAGES.name` exactly. */
const ALIASES = new Map([
  ['vietnamese', 'vi'],
  ['tiếng việt', 'vi'],
  ['viet', 'vi'],
  ['vi-vn', 'vi'],
  ['en-us', 'en'],
  ['en-gb', 'en'],
]);

/**
 * Normalise any stored/legacy language value to a supported BCP-47 code.
 * Unknown or empty values fall back to `DEFAULT_LANGUAGE`.
 * @param {unknown} value a code (`vi`), a display name (`Vietnamese`), or a legacy alias
 * @returns {string} a supported BCP-47 code
 */
export function normalizeLanguage(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return DEFAULT_LANGUAGE;
  if (ALIASES.has(raw)) return ALIASES.get(raw);
  // Accept a full tag like `vi-VN` by looking at the primary subtag too.
  const primary = raw.split(/[-_]/)[0];
  if (BY_CODE.has(raw)) return BY_CODE.get(raw);
  if (BY_NAME.has(raw)) return BY_NAME.get(raw);
  if (BY_CODE.has(primary)) return BY_CODE.get(primary);
  if (BY_NAME.has(primary)) return BY_NAME.get(primary);
  return DEFAULT_LANGUAGE;
}

/**
 * Display name for a language code (or legacy name). Falls back to the raw value when unknown so
 * a model instruction never says "in undefined".
 * @param {unknown} value
 * @returns {string}
 */
export function languageName(value) {
  const code = normalizeLanguage(value);
  return LANGUAGES.find((l) => l.code === code)?.name || DEFAULT_LANGUAGE;
}

/** True when the value resolves to English (the no-op language for prompts). */
export function isEnglish(value) {
  return normalizeLanguage(value) === 'en';
}

/** Whether the value is already a supported code (used by migration to detect legacy storage). */
export function isSupportedCode(value) {
  return BY_CODE.has(String(value ?? '').trim().toLowerCase());
}

/**
 * Best guess at the learning language from a `navigator.language` string (e.g. `vi-VN` → `vi`).
 * Used by onboarding to preselect the learner's language.
 * @param {unknown} navLanguage
 * @returns {string}
 */
export function languageFromNavigator(navLanguage) {
  const raw = String(navLanguage || '').trim();
  if (!raw) return DEFAULT_LANGUAGE;
  const primary = raw.toLowerCase().split(/[-_]/)[0];
  return BY_CODE.has(primary) ? BY_CODE.get(primary) : DEFAULT_LANGUAGE;
}
