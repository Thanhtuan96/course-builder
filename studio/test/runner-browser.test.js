import { describe, it, expect } from 'vitest';
import { buildPreviewDocument } from '../src/lib/runner/browser.js';

describe('browser runner: HTML preview document (CODE-02)', () => {
  it('inlines local stylesheets and scripts referenced by the entry', () => {
    const files = {
      'index.html': '<!doctype html><link rel="stylesheet" href="style.css"><h1>Hi</h1><script src="app.js"></script>',
      'style.css': 'h1 { color: red; }',
      'app.js': 'console.log("preview");',
    };
    const html = buildPreviewDocument(files, 'index.html');
    expect(html).toContain('h1 { color: red; }');
    expect(html).toContain('console.log("preview");');
    expect(html).not.toContain('href="style.css"');
    expect(html).not.toContain('src="app.js"');
  });

  it('leaves external references alone', () => {
    const files = { 'index.html': '<script src="https://cdn.example.com/x.js"></script>' };
    const html = buildPreviewDocument(files, 'index.html');
    expect(html).toContain('https://cdn.example.com/x.js');
  });

  it('handles nested resolve and missing files', () => {
    const files = { 'pages/index.html': '<link href="../styles/main.css">', 'styles/main.css': 'body{margin:0}' };
    const html = buildPreviewDocument(files, 'pages/index.html');
    expect(html).toContain('body{margin:0}');
    expect(buildPreviewDocument({}, 'index.html')).toContain('No HTML file to preview');
  });
});
