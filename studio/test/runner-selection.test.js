import { describe, it, expect } from 'vitest';
import { selectRunner, describeRunner, canUseWorkers } from '../src/lib/runner/index.js';

describe('runner backend selection', () => {
  it('uses the browser for browser-supported languages', () => {
    expect(selectRunner({ language: 'javascript', localAvailable: true })).toBe('browser');
    expect(selectRunner({ language: 'python' })).toBe('browser');
    expect(selectRunner({ language: 'sql' })).toBe('browser');
    expect(selectRunner({ language: 'html' })).toBe('browser');
  });

  it('uses local for toolchain languages only when available', () => {
    expect(selectRunner({ language: 'go', localAvailable: true })).toBe('local');
    expect(selectRunner({ language: 'go', localAvailable: false })).toBeNull();
    expect(selectRunner({ language: 'java', localAvailable: true })).toBe('local');
    expect(selectRunner({ language: 'rust', localAvailable: true })).toBe('local');
  });

  it('honours preferLocal and falls back to browser when workers are missing', () => {
    expect(selectRunner({ language: 'javascript', localAvailable: true, preferLocal: true })).toBe('local');
    expect(selectRunner({ language: 'javascript', browserUsable: false, localAvailable: true })).toBe('local');
    expect(selectRunner({ language: 'javascript', browserUsable: false, localAvailable: false })).toBeNull();
  });

  it('describes the runner for the UI badge', () => {
    expect(describeRunner('javascript')).toMatchObject({ kind: 'browser', ready: true });
    expect(describeRunner('go', { toolchains: { go: true } })).toMatchObject({ kind: 'local', ready: true, command: 'go' });
    expect(describeRunner('go', { toolchains: { go: false } })).toMatchObject({ kind: 'local', ready: false });
    expect(describeRunner('go')).toMatchObject({ kind: 'local', ready: false });
    expect(describeRunner('unknown')).toMatchObject({ kind: null, ready: false });
  });

  it('canUseWorkers is false in the node test environment', () => {
    expect(canUseWorkers()).toBe(false);
  });
});
