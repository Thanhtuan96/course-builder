/**
 * Language metadata + detection for the code workspace (CODE-02, CODE-04).
 *
 * `backend` is the deliberate split the brief asks for:
 *   - 'browser' — runs with no install (JS/TS, Python via Pyodide, SQL via sql.js, HTML/CSS preview)
 *   - 'local'   — needs the learner's own toolchain through `web/studio-runner.js`
 *
 * This module is pure (no DOM, no imports) so it is unit-testable and safe to use everywhere.
 */

/** @typedef {'javascript'|'typescript'|'python'|'sql'|'html'|'css'|'go'|'java'|'rust'|'bash'} LanguageId */

/**
 * @typedef {object} LanguageSpec
 * @property {LanguageId} id
 * @property {string} label
 * @property {string[]} extensions        lower-case, with the leading dot
 * @property {'browser'|'local'} backend
 * @property {string|null} codeMirror      CodeMirror language key (Editor.jsx maps it to a grammar)
 * @property {string} entry                default entry filename
 * @property {string} comment              line-comment token (used when writing seeds / hints)
 * @property {string} [command]            local allowlist command
 */

/** @type {Record<LanguageId, LanguageSpec>} */
export const LANGUAGES = {
  javascript: {
    id: 'javascript',
    label: 'JavaScript',
    extensions: ['.js', '.mjs', '.cjs', '.jsx'],
    backend: 'browser',
    codeMirror: 'javascript',
    entry: 'main.js',
    comment: '//',
    command: 'node',
  },
  typescript: {
    id: 'typescript',
    label: 'TypeScript',
    extensions: ['.ts', '.tsx', '.mts', '.cts'],
    backend: 'browser',
    codeMirror: 'typescript',
    entry: 'main.ts',
    comment: '//',
  },
  python: {
    id: 'python',
    label: 'Python',
    extensions: ['.py', '.pyw'],
    backend: 'browser',
    codeMirror: 'python',
    entry: 'main.py',
    comment: '#',
    command: 'python3',
  },
  sql: {
    id: 'sql',
    label: 'SQL',
    extensions: ['.sql'],
    backend: 'browser',
    codeMirror: 'sql',
    entry: 'main.sql',
    comment: '--',
    command: 'sqlite3',
  },
  html: {
    id: 'html',
    label: 'HTML',
    extensions: ['.html', '.htm'],
    backend: 'browser',
    codeMirror: 'html',
    entry: 'index.html',
    comment: '<!--',
  },
  css: {
    id: 'css',
    label: 'CSS',
    extensions: ['.css'],
    backend: 'browser',
    codeMirror: 'css',
    entry: 'style.css',
    comment: '/*',
  },
  go: {
    id: 'go',
    label: 'Go',
    extensions: ['.go'],
    backend: 'local',
    codeMirror: 'go',
    entry: 'main.go',
    comment: '//',
    command: 'go',
  },
  java: {
    id: 'java',
    label: 'Java',
    extensions: ['.java'],
    backend: 'local',
    codeMirror: 'java',
    entry: 'Main.java',
    comment: '//',
    command: 'javac',
  },
  rust: {
    id: 'rust',
    label: 'Rust',
    extensions: ['.rs'],
    backend: 'local',
    codeMirror: 'rust',
    entry: 'main.rs',
    comment: '//',
    command: 'rustc',
  },
  bash: {
    id: 'bash',
    label: 'Bash',
    extensions: ['.sh', '.bash'],
    backend: 'local',
    codeMirror: null,
    entry: 'main.sh',
    comment: '#',
    command: 'bash',
  },
};

export const LANGUAGE_IDS = /** @type {LanguageId[]} */ (Object.keys(LANGUAGES));

/**
 * Aliases seen in fenced-code info strings / course metadata.
 * @type {Record<string, LanguageId>}
 */
const ALIASES = {
  js: 'javascript',
  javascript: 'javascript',
  mjs: 'javascript',
  node: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  typescript: 'typescript',
  tsx: 'typescript',
  py: 'python',
  python: 'python',
  python3: 'python',
  sql: 'sql',
  sqlite: 'sql',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'css',
  go: 'go',
  golang: 'go',
  java: 'java',
  rust: 'rust',
  rs: 'rust',
  sh: 'bash',
  bash: 'bash',
  shell: 'bash',
};

/**
 * Normalise a user/course-supplied language string to a known id.
 * @param {string|null|undefined} value
 * @returns {LanguageId|null}
 */
export function normalizeLanguage(value) {
  if (!value) return null;
  const key = String(value).trim().toLowerCase().replace(/^language-/, '');
  if (ALIASES[key]) return ALIASES[key];
  if (LANGUAGES[/** @type {LanguageId} */ (key)]) return /** @type {LanguageId} */ (key);
  return null;
}

/**
 * @param {string|null|undefined} path
 * @returns {LanguageId|null}
 */
export function languageForPath(path) {
  if (!path) return null;
  const match = /\.([a-z0-9]+)$/i.exec(String(path));
  if (!match) return null;
  const ext = `.${match[1].toLowerCase()}`;
  for (const spec of Object.values(LANGUAGES)) {
    if (spec.extensions.includes(ext)) return spec.id;
  }
  return null;
}

/** @param {string} id */
export function getLanguage(id) {
  return LANGUAGES[/** @type {LanguageId} */ (id)] || null;
}

/** @param {string} id */
export function isBrowserLanguage(id) {
  return getLanguage(id)?.backend === 'browser';
}

/** @param {string} id */
export function isLocalLanguage(id) {
  return getLanguage(id)?.backend === 'local';
}

/** @param {string} id */
export function defaultEntry(id) {
  return getLanguage(id)?.entry || 'main.txt';
}

/**
 * The languages the UI advertises for the "browser" runner.
 * @returns {LanguageSpec[]}
 */
export function browserLanguages() {
  return Object.values(LANGUAGES).filter((l) => l.backend === 'browser');
}

/**
 * Guess a course's primary language from its kind + lesson text.
 * Programming courses usually name the language in the goal/topics/title.
 * @param {{ kind?: string, title?: string, goal?: string, topics?: string[]|string, language?: string }} course
 * @returns {LanguageId|null}
 */
export function guessCourseLanguage(course = {}) {
  const explicit = normalizeLanguage(course.language);
  if (explicit) return explicit;

  const haystack = [
    course.title,
    course.goal,
    Array.isArray(course.topics) ? course.topics.join(' ') : course.topics,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (!haystack) return null;

  // Ordered so more specific names win over substrings ("javascript" before "java").
  const ordered = [
    'typescript',
    'javascript',
    'python',
    'rust',
    'golang',
    'go',
    'java',
    'sql',
    'html',
    'css',
    'bash',
  ];
  for (const needle of ordered) {
    const re = new RegExp(`(^|[^a-z])${needle}([^a-z]|$)`);
    if (re.test(haystack)) {
      const id = normalizeLanguage(needle);
      if (id) return id;
    }
  }
  return null;
}
