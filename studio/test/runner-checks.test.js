import { describe, it, expect } from 'vitest';
import {
  summarize,
  listJsChecks,
  instrumentJs,
  splitPythonAssert,
  instrumentPython,
  parseSqlChecks,
  compareSqlRows,
} from '../src/lib/runner/checks.js';

describe('runner checks: shared self-check convention', () => {
  it('summarises results', () => {
    expect(summarize([{ name: 'a', passed: true }, { name: 'b', passed: false }])).toEqual({ passed: 1, failed: 1, total: 2 });
    expect(summarize(undefined)).toEqual({ passed: 0, failed: 0, total: 0 });
  });

  it('finds JS check names from console.assert and check()', () => {
    const source = `
      console.assert(add(1, 2) === 3, 'add works');
      check('empty input', () => first([]) === undefined);
      console.assert(isEven(2) === true);
    `;
    const names = listJsChecks(source);
    expect(names).toContain('add works');
    expect(names).toContain('empty input');
    expect(names.some((n) => n.startsWith('console.assert #'))).toBe(true);
  });

  it('handles assert messages containing commas and parens', () => {
    const names = listJsChecks(`console.assert(f(1, 2) === 3, 'ok, (really)');`);
    expect(names).toEqual(['ok, (really)']);
  });

  it('JS instrumentation keeps source and lists checks', () => {
    const { code, checks } = instrumentJs(`console.assert(1 === 1, 'one');`);
    expect(code).toContain('console.assert');
    expect(checks).toEqual(['one']);
  });

  it('splits a python assert into expression and message', () => {
    expect(splitPythonAssert(`x == 1`)).toEqual({ expr: 'x == 1', message: null });
    expect(splitPythonAssert(`x == 1, "expected one"`)).toEqual({ expr: 'x == 1', message: 'expected one' });
    expect(splitPythonAssert(`foo(a, b) == (1, 2)`)).toEqual({ expr: 'foo(a, b) == (1, 2)', message: null });
    expect(splitPythonAssert(`result == expected, f"got {result}"`)).toEqual({
      expr: 'result == expected',
      message: 'f"got {result}"',
    });
  });

  it('rewrites python asserts into recorded checks', () => {
    const { code, checks } = instrumentPython(`def f():\n    return 1\n\nif __name__ == "__main__":\n    assert f() == 1\n    assert f() == 2, "should be two"\n`);
    expect(checks).toEqual(['f() == 1', 'should be two']);
    expect(code).toContain('__check(');
    expect(code).toContain('    __check(');
  });

  it('parses SQL @check/@expect directives', () => {
    const source = `-- @check top scorer\n-- @expect [{"name": "Ada", "score": 9}]\nSELECT name, score FROM people;`;
    const checks = parseSqlChecks(source);
    expect(checks).toHaveLength(1);
    expect(checks[0].name).toBe('top scorer');
    expect(checks[0].expected).toEqual([{ name: 'Ada', score: 9 }]);
  });

  it('compares SQL rows loosely and order-insensitively', () => {
    expect(compareSqlRows([{ a: 1, b: 'x' }], [{ a: '1', b: 'x' }])).toBe(true);
    expect(compareSqlRows([{ a: 1 }], [{ a: 2 }])).toBe(false);
    expect(compareSqlRows([{ a: 1 }, { a: 2 }], [{ a: 2 }, { a: 1 }])).toBe(true);
    expect(compareSqlRows([{ a: 1 }], 'nope')).toBe(false);
  });
});
