import DOMPurify from 'dompurify';

/**
 * Configuration for DOMPurify - allowed tags and attributes
 */
const DOMPURIFY_CONFIG = {
  ALLOWED_TAGS: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'br', 'hr',
    'ul', 'ol', 'li',
    'code', 'pre', 'blockquote',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'a', 'img',
    'strong', 'em', 'del', 's',
    'input' // for task lists
  ],
  ALLOWED_ATTR: [
    'class',
    'href',
    'src',
    'alt',
    'title',
    'type',
    'checked',
    'disabled',
    'id'
  ],
  ALLOW_DATA_ATTR: false
};

/**
 * Sanitize markdown-converted HTML content
 * @param {string} content - Raw HTML content from markdown
 * @returns {string} Sanitized HTML
 */
export function sanitizeMarkdown(content) {
  return DOMPurify.sanitize(content, DOMPURIFY_CONFIG);
}

/**
 * Check if content contains potentially dangerous HTML
 * @param {string} content - Content to check
 * @returns {boolean} True if content is safe
 */
export function isSafeContent(content) {
  const clean = DOMPurify.sanitize(content, DOMPURIFY_CONFIG);
  return clean === content;
}

export default { sanitizeMarkdown, isSafeContent };
