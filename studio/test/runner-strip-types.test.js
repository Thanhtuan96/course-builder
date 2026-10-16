import { describe, it, expect } from 'vitest';
import { stripTypes } from '../src/lib/runner/strip-types.js';

describe('runner strip-types: TS erasure', () => {
  it('removes interfaces and type aliases', () => {
    const out = stripTypes(`interface Point {\n  x: number;\n  y: number;\n}\ntype Id = string | number;\nconst p = 1;`);
    expect(out).not.toContain('interface');
    expect(out).not.toContain('type Id');
    expect(out).toContain('const p = 1;');
  });

  it('removes variable, parameter and return annotations', () => {
    const out = stripTypes(`function greet(name: string, times?: number): string {\n  const greeting: string = 'hi';\n  return greeting;\n}`);
    expect(out).toBe(`function greet(name, times) {\n  const greeting = 'hi';\n  return greeting;\n}`);
  });

  it('removes as-casts and import type', () => {
    const out = stripTypes(`import type { Foo } from './foo.js';\nconst value = raw as number;\nconst other = thing as const;`);
    expect(out).not.toContain('import type');
    expect(out).not.toContain('as number');
    expect(out).not.toContain('as const');
    expect(out).toContain('const value = raw;');
  });

  it('removes generics on calls', () => {
    const out = stripTypes(`const xs = parse<number>('42');`);
    expect(out).toBe(`const xs = parse('42');`);
  });

  it('leaves plain JavaScript untouched', () => {
    const js = `const config = { key: 'value', nested: { n: 1 } };\nfunction f(a, b) { return a + b; }\nconsole.log(config, f(1, 2));`;
    expect(stripTypes(js)).toBe(js);
  });

  it('does not corrupt object literals with Capitalized values', () => {
    const js = `const x = { Type: Number, value: 1 };`;
    expect(stripTypes(js)).toBe(js);
  });

  it('handles multi-line interface bodies with methods', () => {
    const out = stripTypes(`interface Service {\n  get(id: string): Promise<Item>;\n  list(): Item[];\n}\nconst s = 1;`);
    expect(out).not.toContain('interface');
    expect(out).toContain('const s = 1;');
  });
});
