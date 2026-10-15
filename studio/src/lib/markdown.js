/**
 * Shared Markdown pipeline config (LESSON-03, LESSON-06).
 *
 * Safe by design: remark-gfm (tables, task lists) + remark-math/rehype-katex for equations.
 * NO rehype-raw — raw HTML stays escaped. Mermaid fences are rendered client-side by the
 * Markdown component (lazy-loaded, `securityLevel: 'strict'`).
 */
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

export const remarkPlugins = [remarkGfm, remarkMath];
export const rehypePlugins = [rehypeKatex];

export const MERMAID_LANG = 'language-mermaid';

/** @param {string} [className] */
export function isMermaidClassName(className = '') {
  return /(^|\s)language-mermaid(\s|$)/.test(className);
}
