import { describe, it, expect } from 'vitest';
import { esmToCjs } from '../src/lib/runner/esm-cjs.js';

describe('runner esm→cjs shim', () => {
  it('rewrites default, named and namespace imports', () => {
    expect(esmToCjs(`import x from './y.js';`)).toContain("const x = __interop(require(\"./y.js\"));");
    expect(esmToCjs(`import { a, b as c } from './y.js';`)).toContain("const { a, b: c } = require(\"./y.js\");");
    expect(esmToCjs(`import * as ns from './y.js';`)).toContain("const ns = require(\"./y.js\");");
    expect(esmToCjs(`import './polyfill.js';`)).toContain("require(\"./polyfill.js\");");
  });

  it('rewrites named exports and records them on the module', () => {
    const out = esmToCjs(`export function add(a, b) { return a + b; }\nexport const pi = 3.14;`);
    expect(out).toContain('function add(a, b)');
    expect(out).not.toMatch(/^export /m);
    expect(out).toContain('__module.exports.add = add;');
    expect(out).toContain('__module.exports.pi = pi;');
  });

  it('rewrites export default and re-export lists', () => {
    expect(esmToCjs(`export default function f() {}`)).toContain('__module.exports.default = function f() {}');
    expect(esmToCjs(`export { a, b as c };`)).toContain('__module.exports.a = a;');
    expect(esmToCjs(`export { a, b as c };`)).toContain('__module.exports.c = b;');
  });

  it('leaves plain script code untouched', () => {
    const js = `const x = 1;\nconsole.log(x);`;
    expect(esmToCjs(js)).toBe(js);
  });
});
