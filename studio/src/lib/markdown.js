/**
 * Shared Markdown pipeline config (LESSON-03, LESSON-06).
 *
 * Safe by design: remark-gfm (tables, task lists) is always on. Math (remark-math +
 * rehype-katex + the katex stylesheet) is loaded ONLY when the source actually contains math
 * delimiters, so katex stays out of the main bundle. NO rehype-raw — raw HTML stays escaped.
 */
import remarkGfm from 'remark-gfm';

/** Always-loaded remark plugins. */
export const baseRemarkPlugins = [remarkGfm];
/** Always-loaded rehype plugins (none — katex is lazy). */
export const baseRehypePlugins = [];

export const MERMAID_LANG = 'language-mermaid';

/** @param {string} [className] */
export function isMermaidClassName(className = '') {
  return /(^|\s)language-mermaid(\s|$)/.test(className);
}

// A literal backslash-n (`\n`, two characters) inside a Mermaid node label.
const MERMAID_LITERAL_NEWLINE = /\\n/g;
// `[label]`, `(label)` or `{label}` whose body carries a `<br/>` produced above.
const MERMAID_LABEL = /([\[({])([^\])}]*<br\/>[^\])}]*)([\])}])/g;

/**
 * Make model-generated Mermaid more robust before `mermaid.render`.
 *
 * Models often write a literal `\n` inside a node label (invalid Mermaid) instead of a line
 * break, so every render fails. Replace `\n` with `<br/>` and wrap any affected label in double
 * quotes so labels with punctuation/HTML parse reliably. Idempotent, and leaves already-quoted
 * labels untouched.
 * @param {string} code
 * @returns {string}
 */
export function sanitizeMermaid(code) {
  const replaced = String(code ?? '').replace(MERMAID_LITERAL_NEWLINE, '<br/>');
  return replaced.replace(MERMAID_LABEL, (match, open, body, close) => {
    const trimmed = body.trim();
    if (trimmed.startsWith('"') || trimmed.startsWith("'")) return match;
    return `${open}"${body}"${close}`;
  });
}

// `$$…$$` (display), `$…$` (inline, no whitespace just inside the delimiters so currency-like
// "$5 and $10" is NOT treated as math), `\(…\)` or `\[…\]`
const MATH_PATTERN = /\$\$[\s\S]*?\$\$|\$[^\s$](?:[^$\n]*[^\s$])?\$|\\\(|\\\[/;
const CODE_FENCE = /```[\s\S]*?```|`[^`]*`/g;

/**
 * Detect inline/block math, ignoring fenced and inline code.
 * @param {string} text
 */
export function hasMath(text) {
  const withoutCode = String(text || '').replace(CODE_FENCE, '');
  return MATH_PATTERN.test(withoutCode);
}

/**
 * Dynamically load the math remark/rehype plugins and the katex stylesheet.
 * @returns {Promise<{ remarkPlugins: object[], rehypePlugins: object[] }>}
 */
export async function loadMathPlugins() {
  const [remarkMath, rehypeKatex] = await Promise.all([
    import('remark-math'),
    import('rehype-katex'),
    import('katex/dist/katex.min.css'),
  ]);
  return {
    remarkPlugins: [remarkMath.default],
    rehypePlugins: [rehypeKatex.default],
  };
}
