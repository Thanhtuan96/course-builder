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
