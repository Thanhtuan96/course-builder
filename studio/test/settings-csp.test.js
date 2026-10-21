/**
 * @vitest-environment node
 *
 * SEC-12 — strict production CSP meta plus the serve-only dev relaxation.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import config, { relaxCspForDev } from '../vite.config.js';

const STUDIO = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = readFileSync(join(STUDIO, 'index.html'), 'utf8');

function cspContent(html = HTML) {
  const match = html.match(/http-equiv="Content-Security-Policy"[^>]*content="([^"]+)"/);
  return match ? match[1] : '';
}

const REQUIRED = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  'http://localhost:*',
  'http://*.localhost:*',
  'http://127.0.0.1:*',
  'https://localhost:*',
  'https://*.localhost:*',
  'https://127.0.0.1:*',
  'https://api.anthropic.com',
  'https://api.openai.com',
  'https://openrouter.ai',
  'https://api.groq.com',
  'https://cdn.jsdelivr.net',
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
];

describe('production CSP meta', () => {
  it('is present in <head> before any script', () => {
    const policyAt = HTML.indexOf('http-equiv="Content-Security-Policy"');
    const scriptAt = HTML.indexOf('<script');
    expect(policyAt).toBeGreaterThan(-1);
    expect(scriptAt).toBeGreaterThan(-1);
    expect(policyAt).toBeLessThan(scriptAt);
  });

  it('contains every locked directive and source', () => {
    const content = cspContent();
    for (const directive of REQUIRED) expect(content).toContain(directive);
  });

  it('allows the data: favicon through img-src', () => {
    expect(HTML).toContain('href="data:image/svg+xml');
    expect(cspContent()).toContain("img-src 'self' data:");
  });

  it('never allows unsafe-eval or frame-ancestors', () => {
    expect(cspContent()).not.toContain("'unsafe-eval'");
    expect(cspContent()).not.toContain('frame-ancestors');
  });

  it('omits IPv6 loopback host-sources Chrome ignores', () => {
    expect(cspContent()).not.toContain('[::1]');
    expect(relaxCspForDev(HTML)).not.toContain('ws://[::1]');
  });

  it('loads the HTML preview from a CSP-free same-origin document, not srcdoc', () => {
    const preview = readFileSync(join(STUDIO, 'public', 'preview.html'), 'utf8');
    const panel = readFileSync(join(STUDIO, 'src', 'components', 'workspace', 'OutputPanel.jsx'), 'utf8');
    expect(preview).toContain("data.type !== 'preview-html'");
    expect(preview).toContain('document.write(data.html)');
    expect(preview).not.toContain('Content-Security-Policy');
    expect(panel).toContain('src="./preview.html"');
    expect(panel).toContain('sandbox="allow-scripts"');
    expect(panel).toContain("postMessage({ type: 'preview-html'");
    expect(panel).not.toContain('srcDoc=');
  });
});

describe('dev-only CSP relaxation', () => {
  it('adds the React-refresh inline allowance and HMR websocket sources', () => {
    const relaxed = cspContent(relaxCspForDev(HTML));
    expect(relaxed).toContain("script-src 'self' 'unsafe-inline'");
    expect(relaxed).toContain('ws://localhost:*');
    expect(relaxed).toContain('ws://127.0.0.1:*');
    expect(relaxed).not.toContain("'unsafe-eval'");
    expect(relaxed).toContain("'wasm-unsafe-eval'");
    expect(relaxed).toContain('https://api.anthropic.com');
  });

  it('leaves HTML without a CSP meta unchanged', () => {
    const plain = '<html><head><title>x</title></head></html>';
    expect(relaxCspForDev(plain)).toBe(plain);
  });

  it('ships as a serve-only Vite plugin', () => {
    const plugin = config.plugins.find((entry) => entry && entry.name === 'studio-dev-csp');
    expect(plugin).toBeTruthy();
    expect(plugin.apply).toBe('serve');
  });

  it('keeps the strict source meta free of script unsafe-inline', () => {
    const scriptDirective = cspContent().split(';').find((part) => part.trim().startsWith('script-src'));
    expect(scriptDirective).not.toContain("'unsafe-inline'");
  });
});
