import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const serverSource = readFileSync(new URL('../web/server.js', import.meta.url), 'utf8');

describe('web provider prompt-contract wiring', () => {
  it('uses the shared runtime-input builder in every provider adapter', () => {
    for (const adapter of [
      'streamViaCLI',
      'streamViaOllama',
      'streamViaCursor',
      'streamViaOpenCode',
    ]) {
      const start = serverSource.indexOf(`function ${adapter}`);
      const end = serverSource.indexOf('\nfunction ', start + 1);
      const body = serverSource.slice(start, end === -1 ? undefined : end);

      expect(start, `${adapter} should exist`).toBeGreaterThanOrEqual(0);
      expect(body).toContain('assembleRuntimeInput(messages)');
    }
  });

  it('uses the shared contract for cloud API requests and removes the old inline prompt', () => {
    expect(serverSource).toContain("const runtimeInput = assembleRuntimeInput(messages);");
    expect(serverSource).toContain('content: runtimeInput.systemPrompt');
    expect(serverSource).toContain('system: runtimeInput.systemPrompt');
    expect(serverSource).not.toContain('const PROFESSOR_SYSTEM_PROMPT =');
  });
});
