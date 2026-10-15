/**
 * `course-professor next [slug]` — show the active lecture summary and the
 * agent command to continue. Never prints solutions.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { findCourses, parseLecture, readCourse, resolveExercise } from '../course-reader.js';
import { detectAgents } from './doctor.js';
import { style } from '../registry-helpers.js';

const AGENT_COMMANDS = {
  claude: '/professor:next',
  opencode: '/professor:next',
  gemini: '/professor:next',
  cursor: 'professor:next',
};

function flagValue(args, name) {
  const i = args.indexOf(name);
  if (i === -1) return null;
  const next = args[i + 1];
  return next && !next.startsWith('--') ? next : true;
}

function positionals(args) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir') { i++; continue; }
    if (args[i].startsWith('--')) continue;
    out.push(args[i]);
  }
  return out;
}

/**
 * Resolve which course `next` should show.
 * @param {object[]} courses
 * @param {string|null} slug
 * @returns {object|null}
 */
export function resolveActiveCourse(courses, slug) {
  if (slug) return courses.find((c) => c.slug === slug) || null;
  const active = courses.filter((c) => c.currentSection && c.currentSection.status === 'active');
  const pool = active.length ? active : courses;
  const byRecency = (a, b) => (b.lastActive || '').localeCompare(a.lastActive || '');
  return [...pool].sort(byRecency)[0] || null;
}

/**
 * @param {{ args: string[], cwd?: string, chalk?: object }} ctx
 */
export async function run({ args = [], cwd = process.cwd() } = {}) {
  const slug = positionals(args)[0] || null;
  const dir = flagValue(args, '--dir');
  const courses = findCourses(cwd, { dir: typeof dir === 'string' ? dir : undefined });

  if (courses.length === 0) {
    console.log('');
    console.log(style('info', 'No course found. Start one with /professor:new-topic.'));
    console.log('');
    return;
  }

  const descriptors = courses.map((c) => readCourse(c.dir, { slug: c.slug }));
  const chosen = resolveActiveCourse(descriptors, slug);

  if (!chosen) {
    console.log(style('error', `Course "${slug}" not found.`));
    console.log(`Available: ${courses.map((c) => c.slug).join(', ')}`);
    return;
  }

  const lecturePath = join(chosen.dir, 'LECTURE.md');
  const lecture = existsSync(lecturePath)
    ? parseLecture(readFileSync(lecturePath, 'utf-8'))
    : null;

  const section = chosen.currentSection;
  console.log('');
  const meta = `${chosen.kind}${chosen.level ? `, ${chosen.level}` : ''}`;
  console.log(style('info', `Course: ${chosen.title} (${meta})`));

  if (!section) {
    console.log('  All sections are done. It may be capstone time 🏗️');
    console.log('');
    return;
  }

  const heading = lecture && lecture.title ? lecture.title : section.title;
  console.log(`  Section ${section.n}: ${heading}`);
  console.log(`  Status: ${section.status === 'active' ? '🔄 In progress' : '⬜ Not started'}`);
  console.log('');

  if (lecture?.objectives?.length) {
    console.log('  🎯 Objectives');
    for (const objective of lecture.objectives) console.log(`    - ${objective}`);
    console.log('');
  }

  if (lecture?.explanation) {
    console.log('  🧠 Explanation (first paragraph)');
    console.log(`    ${lecture.explanation}`);
    console.log('');
  }

  const exercise = resolveExercise(chosen, { lecture });
  if (exercise.path) {
    const pending = exercise.exists ? '' : '  (not created yet — run professor:next)';
    console.log(`  🛠️  Exercise: ${exercise.path}${pending}`);
    if (lecture?.successCriteria?.length) {
      console.log('      Success criteria:');
      for (const criterion of lecture.successCriteria) console.log(`        - [ ] ${criterion}`);
    }
    console.log('');
  }

  const agents = await detectAgents();
  const list = agents.length ? agents : ['claude'];
  console.log('  Continue in your agent:');
  for (const agent of list) {
    const command = AGENT_COMMANDS[agent] || '/professor:next';
    console.log(`    ${agent.padEnd(9)} ${command}`);
  }
  console.log('');
}
