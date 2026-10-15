import { describe, it, expect } from 'vitest';
import {
  languageForPath,
  normalizeLanguage,
  guessCourseLanguage,
  defaultEntry,
  isBrowserLanguage,
  isLocalLanguage,
  getLanguage,
  browserLanguages,
} from '../src/lib/runner/languages.js';

describe('runner languages: detection', () => {
  it('maps extensions to languages', () => {
    expect(languageForPath('main.js')).toBe('javascript');
    expect(languageForPath('main.ts')).toBe('typescript');
    expect(languageForPath('src/util.py')).toBe('python');
    expect(languageForPath('query.SQL')).toBe('sql');
    expect(languageForPath('index.html')).toBe('html');
    expect(languageForPath('style.css')).toBe('css');
    expect(languageForPath('main.go')).toBe('go');
    expect(languageForPath('Main.java')).toBe('java');
    expect(languageForPath('main.rs')).toBe('rust');
    expect(languageForPath('run.sh')).toBe('bash');
    expect(languageForPath('README.md')).toBeNull();
    expect(languageForPath(null)).toBeNull();
  });

  it('normalises aliases and fenced info strings', () => {
    expect(normalizeLanguage('JS')).toBe('javascript');
    expect(normalizeLanguage('language-python')).toBe('python');
    expect(normalizeLanguage('py')).toBe('python');
    expect(normalizeLanguage('golang')).toBe('go');
    expect(normalizeLanguage('nonsense')).toBeNull();
    expect(normalizeLanguage('')).toBeNull();
  });

  it('splits browser vs local backends', () => {
    expect(isBrowserLanguage('javascript')).toBe(true);
    expect(isBrowserLanguage('python')).toBe(true);
    expect(isBrowserLanguage('sql')).toBe(true);
    expect(isBrowserLanguage('go')).toBe(false);
    expect(isLocalLanguage('go')).toBe(true);
    expect(isLocalLanguage('rust')).toBe(true);
    expect(getLanguage('javascript').backend).toBe('browser');
    expect(browserLanguages().map((l) => l.id)).toContain('html');
  });

  it('guesses a course language without keyword traps', () => {
    expect(guessCourseLanguage({ title: 'Intro to Rust' })).toBe('rust');
    expect(guessCourseLanguage({ title: 'Learn JavaScript' })).toBe('javascript');
    expect(guessCourseLanguage({ goal: 'Write your first Go program' })).toBe('go');
    expect(guessCourseLanguage({ topics: ['python', 'basics'] })).toBe('python');
    expect(guessCourseLanguage({ title: 'JavaScript vs Java' })).toBe('javascript');
    expect(guessCourseLanguage({ title: 'Baking bread' })).toBeNull();
    expect(guessCourseLanguage({ language: 'python' })).toBe('python');
  });

  it('provides default entries', () => {
    expect(defaultEntry('python')).toBe('main.py');
    expect(defaultEntry('go')).toBe('main.go');
    expect(defaultEntry('unknown')).toBe('main.txt');
  });
});
