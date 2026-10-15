/**
 * Tiny, dependency-free TypeScript → JavaScript type eraser (CODE-02).
 *
 * The brief allows either `esbuild-wasm` (lazy) or a "tiny transform". We deliberately avoid the
 * ~10 MB esbuild wasm: only type *syntax* needs removing, not transpilation. This handles the
 * constructs a teaching skeleton actually contains:
 *   - `interface X { … }`, `type X = …`, `import type …`, `declare …`
 *   - `as T` casts, `satisfies T`, non-null `!` on member access
 *   - parameter / variable / return type annotations, generics `foo<T>(…)`, optional `?:`
 *
 * It is intentionally conservative: primitives and Capitalized type names only, so object
 * literals (`{ key: value }`) are left untouched. Advanced TS (enums, decorators, namespaces)
 * is out of scope — the worker surfaces a clear SyntaxError telling the learner to use `.js`.
 * Pure module → unit-tested against both TS samples and plain JS (must stay unchanged).
 */

const PRIMITIVE = "(?:string|number|boolean|any|unknown|void|never|object|symbol|bigint|undefined|null)";
// A Capitalized name only counts as a type when it is clearly one: `Foo<T>` or `Foo[]`. Object
// literals (`key: 'value'`, `nested: { n: 1 }`, `Type: Number`) therefore survive untouched.
const NAMED_TYPE = "[A-Z][\\w$]*(?:<[^<>()]*>|\\[\\])";
const TYPE_ATOM = `(?:${PRIMITIVE}|${NAMED_TYPE})`;
const TYPE_EXPR = `${TYPE_ATOM}(?:\\s*\\|\\s*${TYPE_ATOM})*`;
// identifier? (":" | "?:") Type
const ANNOTATION = new RegExp(`([A-Za-z_$][\\w$]*)\\s*\\??\\s*:\\s*(${TYPE_EXPR})`, 'g');
const RETURN_TYPE = new RegExp(`(\\))\\s*:\\s*${TYPE_EXPR}(?=\\s*(?:=>|\\{))`, 'g');

/**
 * @param {string} source
 * @returns {string} the source with type annotations removed
 */
export function stripTypes(source) {
  let code = String(source ?? '');
  code = removeLineStatement(code, /^\s*import\s+type\s[^\n]*$/gm);
  code = removeLineStatement(code, /^\s*export\s+type\s+\{[^}]*\}\s*[^\n]*$/gm);
  code = removeLineStatement(code, /^\s*declare\s+[^\n]*$/gm);
  code = removeBalancedBlocks(code, /\b(?:export\s+)?interface\s+[A-Za-z_$][\w$]*(?:\s+extends\s+[^{]+)?\s*\{/g);
  code = removeTypeAliases(code);
  code = code.replace(/\b(?:as|satisfies)\s+const\b/g, '');
  code = code.replace(/\s(?:as|satisfies)\s+[A-Za-z_$][\w$.]*(?:<[^<>()]*>)?(?:\s*\|\s*[A-Za-z_$][\w$.]*)*(\[\])?/g, '');
  code = code.replace(RETURN_TYPE, '$1');
  code = code.replace(/([A-Za-z_$][\w$]*)\s*<[A-Za-z_$][\w$,\s[\]|]*>\s*(?=\()/g, '$1');
  code = code.replace(ANNOTATION, '$1');
  code = code.replace(/([)\]A-Za-z_$"])(?:!)(?=\s*[.[(;])/g, '$1');
  return code;
}

/**
 * @param {string} code
 * @param {RegExp} pattern line-matching pattern (with `m`)
 */
function removeLineStatement(code, pattern) {
  return code.replace(pattern, '');
}

/**
 * Remove blocks opened by `pattern` (which ends at the opening `{`) up to the matching `}`.
 * @param {string} code
 * @param {RegExp} pattern global regex whose match ends with `{`
 */
function removeBalancedBlocks(code, pattern) {
  let result = code;
  let match;
  pattern.lastIndex = 0;
  while ((match = pattern.exec(result))) {
    const open = match.index + match[0].length - 1;
    const close = matchBrace(result, open);
    if (close < 0) break;
    result = result.slice(0, match.index) + result.slice(close + 1);
    pattern.lastIndex = 0;
  }
  return result;
}

/**
 * Remove `type X = …;` alias declarations (balanced to the terminating `;`).
 * @param {string} code
 */
function removeTypeAliases(code) {
  let result = code;
  let searchFrom = 0;
  const re = /\btype\s+[A-Za-z_$][\w$]*(?:<[^<>]*>)?\s*=/g;
  for (;;) {
    re.lastIndex = searchFrom;
    const m = re.exec(result);
    if (!m) break;
    const start = m.index;
    let i = re.lastIndex;
    let depth = 0;
    let inString = null;
    for (; i < result.length; i++) {
      const ch = result[i];
      const prev = result[i - 1];
      if (inString) {
        if (ch === inString && prev !== '\\') inString = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') inString = ch;
      else if (ch === '(' || ch === '[' || ch === '{') depth += 1;
      else if (ch === ')' || ch === ']' || ch === '}') depth -= 1;
      else if (ch === ';' && depth === 0) break;
      else if (ch === '\n' && depth === 0) break;
    }
    let end = i;
    if (result[i] === ';') end = i + 1;
    result = result.slice(0, start) + result.slice(end);
    searchFrom = start;
  }
  return result;
}

/**
 * Index of the `}` matching the `{` at `open`, or -1.
 * @param {string} text
 * @param {number} open
 */
function matchBrace(text, open) {
  let depth = 0;
  let inString = null;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    const prev = text[i - 1];
    if (inString) {
      if (ch === inString && prev !== '\\') inString = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') inString = ch;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}
