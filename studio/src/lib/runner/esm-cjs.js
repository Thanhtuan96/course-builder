/**
 * Minimal ESM → CommonJS transform so multi-file JavaScript exercises can run in a Web Worker
 * (CODE-01/02). The worker compiles every workspace file as a CommonJS module and supplies a
 * tiny `require` that resolves sibling files; this module belongs to that loader.
 *
 * Scope: single-line `import` / `export` forms used in teaching skeletons. It is a *shim*, not a
 * bundler — dynamic `import()`, `export * from`, and bare package specifiers are left for the
 * worker to report clearly. Pure module → unit-tested.
 */

/**
 * @param {string} code
 * @returns {string}
 */
export function esmToCjs(code) {
  const text = String(code ?? '');
  const lines = text.split('\n');
  const namedExports = new Set();
  const out = [];
  let touched = false;

  for (const line of lines) {
    let m;

    // import x from 'p'  |  import { a, b as c } from 'p'  |  import * as ns from 'p'  |  import 'p'
    if ((m = /^\s*import\s+([A-Za-z_$][\w$]*)\s+from\s+(['"])([^'"]+)\2\s*;?\s*$/.exec(line))) {
      touched = true;
      out.push(`const ${m[1]} = __interop(require(${JSON.stringify(m[3])}));`);
      continue;
    }
    if ((m = /^\s*import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+(['"])([^'"]+)\2\s*;?\s*$/.exec(line))) {
      touched = true;
      out.push(`const ${m[1]} = require(${JSON.stringify(m[3])});`);
      continue;
    }
    if ((m = /^\s*import\s+\{([^}]*)\}\s+from\s+(['"])([^'"]+)\2\s*;?\s*$/.exec(line))) {
      touched = true;
      out.push(`const { ${specifiersToBinding(m[1])} } = require(${JSON.stringify(m[3])});`);
      continue;
    }
    if ((m = /^\s*import\s+(['"])([^'"]+)\1\s*;?\s*$/.exec(line))) {
      touched = true;
      out.push(`require(${JSON.stringify(m[2])});`);
      continue;
    }

    // export default <expr>
    if ((m = /^\s*export\s+default\s+(.*)$/.exec(line))) {
      touched = true;
      out.push(`__module.exports.default = ${m[1]}; __module.exports.__esModule = true;`);
      continue;
    }

    // export { a, b as c };
    if ((m = /^\s*export\s+\{([^}]*)\}\s*;?\s*$/.exec(line))) {
      touched = true;
      for (const assignment of namedExportAssignments(m[1])) out.push(assignment);
      continue;
    }

    // export const/let/var/function/class Name …
    if ((m = /^(\s*)export\s+(const|let|var|function|class|async\s+function)\s+([A-Za-z_$][\w$]*)/.exec(line))) {
      touched = true;
      namedExports.add(m[3]);
      out.push(line.replace(/^(\s*)export\s+/, '$1'));
      continue;
    }

    out.push(line);
  }

  if (namedExports.size) {
    const tail = [...namedExports].map((n) => `__module.exports.${n} = ${n};`).join(' ');
    out.push(tail);
  }
  return touched ? out.join('\n') : text;
}

/**
 * @param {string} specifiers `a, b as c`
 */
function specifiersToBinding(specifiers) {
  return String(specifiers)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const as = /^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/.exec(s);
      return as ? `${as[1]}: ${as[2]}` : s;
    })
    .join(', ');
}

/**
 * @param {string} specifiers `a, b as c`
 * @returns {string[]}
 */
function namedExportAssignments(specifiers) {
  return String(specifiers)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const as = /^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/.exec(s);
      return as
        ? `__module.exports.${as[2]} = ${as[1]};`
        : `__module.exports.${s} = ${s};`;
    });
}
