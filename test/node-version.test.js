/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import {
  parseNodeVersion,
  nodeSupportsSqlite,
  studioNodeMessage,
  assertStudioNode,
  STUDIO_MIN_NODE,
} from '../bin/node-version.js';

describe('parseNodeVersion', () => {
  it('parses v-prefixed and bare versions', () => {
    expect(parseNodeVersion('v22.5.0')).toEqual({ major: 22, minor: 5 });
    expect(parseNodeVersion('18.20.4')).toEqual({ major: 18, minor: 20 });
  });

  it('returns null for nonsense', () => {
    expect(parseNodeVersion('not-a-version')).toBeNull();
    expect(parseNodeVersion('')).toBeNull();
  });
});

describe('nodeSupportsSqlite', () => {
  it('is false below the node:sqlite floor', () => {
    expect(nodeSupportsSqlite('v18.20.4')).toBe(false);
    expect(nodeSupportsSqlite('v20.19.0')).toBe(false);
    expect(nodeSupportsSqlite('v22.4.1')).toBe(false);
  });

  it('is true at and above 22.5', () => {
    expect(nodeSupportsSqlite('v22.5.0')).toBe(true);
    expect(nodeSupportsSqlite('v22.9.0')).toBe(true);
    expect(nodeSupportsSqlite('v24.0.0')).toBe(true);
  });

  it('matches the exported floor', () => {
    expect(STUDIO_MIN_NODE).toEqual({ major: 22, minor: 5 });
  });
});

describe('studioNodeMessage / assertStudioNode', () => {
  it('prints the actionable install hint including the current version', () => {
    const message = studioNodeMessage('v18.20.4');
    expect(message).toBe(
      'Professor Studio needs Node 22.5+ (you have v18.20.4). Install from https://nodejs.org'
    );
  });

  it('throws only when the version is too old', () => {
    expect(() => assertStudioNode('v18.20.4')).toThrow(/Node 22\.5\+/);
    expect(() => assertStudioNode('v22.5.0')).not.toThrow();
  });
});
