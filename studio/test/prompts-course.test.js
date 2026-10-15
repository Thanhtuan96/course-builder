import { describe, it, expect } from 'vitest';
import { validateSyllabus, syllabusValidator, buildSyllabusMessages, MIN_LESSONS, MAX_LESSONS } from '../src/lib/prompts/course.js';

const valid = {
  title: 'Kubernetes Networking',
  description: 'Understand how pods talk to each other.',
  kind: 'programming',
  kindReason: 'Detected: Programming — hands-on cluster config',
  lessons: [
    { title: 'Pods', summary: 'What a pod is.' },
    { title: 'Services', summary: 'Stable virtual IPs.' },
    { title: 'Ingress', summary: 'HTTP routing into the cluster.' },
    { title: 'Network policy', summary: 'Firewall rules for pods.' },
  ],
};

describe('validateSyllabus', () => {
  it('accepts and normalises a valid syllabus', () => {
    const res = validateSyllabus(valid);
    expect(res.ok).toBe(true);
    expect(res.value.title).toBe('Kubernetes Networking');
    expect(res.value.kind).toBe('programming');
    expect(res.value.lessons).toHaveLength(4);
    expect(res.value.lessons[0]).toEqual({ title: 'Pods', summary: 'What a pod is.' });
  });

  it('defaults an unknown or missing kind to conceptual', () => {
    expect(validateSyllabus({ ...valid, kind: 'nonsense' }).value.kind).toBe('conceptual');
    const { kind, ...rest } = valid;
    expect(validateSyllabus(rest).value.kind).toBe('conceptual');
  });

  it('accepts bare string lessons and trims whitespace', () => {
    const res = validateSyllabus({
      title: '  Music theory  ',
      lessons: ['  Notes ', 'Chords', 'Scales', 'Keys'],
    });
    expect(res.ok).toBe(true);
    expect(res.value.title).toBe('Music theory');
    expect(res.value.lessons[0]).toEqual({ title: 'Notes', summary: '' });
  });

  it('rejects malformed input', () => {
    expect(validateSyllabus(null).ok).toBe(false);
    expect(validateSyllabus([]).ok).toBe(false);
    expect(validateSyllabus({ title: '', lessons: valid.lessons }).ok).toBe(false);
    expect(validateSyllabus({ title: 'X' }).ok).toBe(false);
  });

  it('enforces the 4–10 lesson range', () => {
    const tooFew = { ...valid, lessons: valid.lessons.slice(0, MIN_LESSONS - 1) };
    const tooMany = { ...valid, lessons: Array.from({ length: MAX_LESSONS + 1 }, (_, i) => ({ title: `L${i}`, summary: '' })) };
    expect(validateSyllabus(tooFew).ok).toBe(false);
    expect(validateSyllabus(tooMany).ok).toBe(false);
    expect(validateSyllabus(tooMany).error).toMatch(/4–10/);
  });

  it('syllabusValidator returns true or an error string (for generateJson)', () => {
    expect(syllabusValidator(valid)).toBe(true);
    expect(typeof syllabusValidator({ title: 'x' })).toBe('string');
  });
});

describe('buildSyllabusMessages', () => {
  it('includes the topic, level, goal and JSON shape', () => {
    const { system, messages } = buildSyllabusMessages({ topic: 'Rust', level: 'Advanced', goal: 'Ship a CLI' });
    const joined = `${system}\n${messages[0].content}`;
    expect(joined).toContain('Rust');
    expect(joined).toContain('Advanced');
    expect(joined).toContain('Ship a CLI');
    expect(joined).toContain('"lessons"');
    expect(joined).toMatch(/programming, quantitative, conceptual, skill/);
    expect(messages[0].role).toBe('user');
  });

  it('appends a language instruction when not English', () => {
    const { system } = buildSyllabusMessages({ topic: 'Rust', language: 'Vietnamese' });
    expect(system).toContain('Write your entire response in Vietnamese');
  });

  it('omits the language instruction for English', () => {
    const { system } = buildSyllabusMessages({ topic: 'Rust', language: 'English' });
    expect(system).not.toContain('Write your entire response in');
  });
});
