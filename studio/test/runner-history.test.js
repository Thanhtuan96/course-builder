import { describe, it, expect } from 'vitest';
import { encodeRunPayload, decodeRunResult } from '../src/lib/runner/history.js';
import { hashFiles } from '../src/lib/runner/hash.js';

describe('runner history: run payload encoding', () => {
  it('round-trips checks + code snapshot', () => {
    const checks = [{ name: 'works', passed: true }];
    const files = { 'main.js': 'console.log(1);' };
    const payload = encodeRunPayload({ checks, files, entry: 'main.js', language: 'javascript' });
    const decoded = decodeRunResult({
      id: 'r1',
      runner: 'browser',
      language: 'javascript',
      stdout: '1\n',
      stderr: '',
      exit_code: 0,
      duration_ms: 12,
      created_at: '2026-01-01T00:00:00.000Z',
      checks_json: JSON.stringify(payload),
    });
    expect(decoded.checks).toEqual(checks);
    expect(decoded.snapshot.files).toEqual(files);
    expect(decoded.hash).toBe(hashFiles(files));
    expect(decoded.exitCode).toBe(0);
  });

  it('understands a legacy bare checks array', () => {
    const decoded = decodeRunResult({ checks_json: JSON.stringify([{ name: 'x', passed: false }]) });
    expect(decoded.checks).toEqual([{ name: 'x', passed: false }]);
    expect(decoded.snapshot).toBeNull();
  });

  it('survives malformed json', () => {
    const decoded = decodeRunResult({ checks_json: '{not json' });
    expect(decoded.checks).toEqual([]);
    expect(decoded.snapshot).toBeNull();
  });
});

describe('runner hash', () => {
  it('is stable and order independent', () => {
    expect(hashFiles({ a: '1', b: '2' })).toBe(hashFiles({ b: '2', a: '1' }));
    expect(hashFiles({ a: '1' })).not.toBe(hashFiles({ a: '2' }));
  });
});
