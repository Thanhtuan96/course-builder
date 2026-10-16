import { describe, it, expect } from 'vitest';
import { extractJson } from '../src/lib/json.js';

describe('extractJson', () => {
  it('parses bare JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('parses fenced JSON', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('```\n[1,2,3]\n```')).toEqual([1, 2, 3]);
  });

  it('parses JSON embedded in prose', () => {
    expect(extractJson('Sure! Here you go: {"a":1} Hope that helps.')).toEqual({ a: 1 });
  });

  it('parses arrays', () => {
    expect(extractJson('blah [{"x":1}] blah')).toEqual([{ x: 1 }]);
  });

  it('throws on empty or JSON-free text', () => {
    expect(() => extractJson('')).toThrow(/Empty/);
    expect(() => extractJson('no json here')).toThrow(/valid JSON/);
  });
});
