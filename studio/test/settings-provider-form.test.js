/**
 * @vitest-environment node
 *
 * SEC-12 — the bridge form warns, without blocking, when the URL is not loopback.
 */
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { ProviderFields } from '../src/components/settings/ProviderForm.jsx';
import { translate } from '../src/lib/i18n/index.js';

function settings(overrides = {}) {
  return {
    provider: 'bridge',
    anthropic: { apiKey: '', model: 'claude-opus-5-5' },
    openai: { preset: 'openai', baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o-mini' },
    ollama: { baseUrl: 'http://localhost:11434/v1', model: 'llama3.2' },
    bridge: {
      bridgeUrl: 'http://localhost:3000',
      bridgeToken: 'tok',
      agent: 'claude',
      models: {},
    },
    ...overrides,
  };
}

describe('ProviderFields loopback warning', () => {
  it('shows a non-blocking role=status message for a remote bridge URL', () => {
    const html = renderToString(
      createElement(ProviderFields, {
        settings: settings({ bridge: { bridgeUrl: 'https://evil.example', bridgeToken: 'tok', agent: 'claude', models: {} } }),
        update: () => {},
      })
    );
    expect(html).toContain('role="status"');
    expect(html).toContain(translate('en', 'provider.loopbackOnly'));
  });

  it('does not show the warning for a loopback bridge URL', () => {
    const html = renderToString(createElement(ProviderFields, { settings: settings(), update: () => {} }));
    expect(html).not.toContain(translate('en', 'provider.loopbackOnly'));
  });
});
