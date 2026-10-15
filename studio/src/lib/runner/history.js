/**
 * Run-result (de)serialisation for the history drawer (CODE-05).
 *
 * The Phase 22 `run_results` table has columns for the result but none for the code snapshot, so
 * we store a compact `{ checks, snapshot, hash }` object in its `checks_json` column. This module
 * owns that encoding so the schema change (a dedicated column, Phase 26) is a one-file swap.
 * Backwards compatible: a bare checks array (the original meaning) is still understood.
 */
import { hashFiles } from './hash.js';

/**
 * @param {{ checks?: any[], files?: Record<string,string>, entry?: string|null, language?: string|null }} input
 * @returns {{ checks: any[], snapshot: { files: Record<string,string>, entry: string|null, language: string|null, hash: string } }}
 */
export function encodeRunPayload({ checks = [], files = {}, entry = null, language = null } = {}) {
  const snapshot = { files, entry, language, hash: hashFiles(files) };
  return { checks: Array.isArray(checks) ? checks : [], snapshot };
}

/**
 * @param {object} row a `run_results` repo row
 * @returns {{ id:string, runner:string, language:string|null, stdout:string, stderr:string, exitCode:number|null, durationMs:number|null, createdAt:string, checks:any[], snapshot:object|null, hash:string|null }}
 */
export function decodeRunResult(row = {}) {
  let raw = null;
  if (row.checks_json) {
    try {
      raw = JSON.parse(row.checks_json);
    } catch {
      raw = null;
    }
  }
  const checks = Array.isArray(raw) ? raw : Array.isArray(raw?.checks) ? raw.checks : [];
  const snapshot = !Array.isArray(raw) && raw?.snapshot ? raw.snapshot : null;
  return {
    id: row.id,
    runner: row.runner || 'browser',
    language: row.language || null,
    stdout: row.stdout || '',
    stderr: row.stderr || '',
    exitCode: row.exit_code ?? null,
    durationMs: row.duration_ms ?? null,
    createdAt: row.created_at || '',
    checks,
    snapshot,
    hash: snapshot?.hash || null,
  };
}
