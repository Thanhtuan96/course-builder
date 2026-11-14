/**
 * RON-372 — an exercise Studio cannot run explains itself instead of showing a runner error.
 *
 * The rule is pure text: no language runner, a build tool named in the file, or (for a language the
 * local server runs) a build tool named only in the lecture. A plain runnable exercise stays as is.
 */
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import {
  BUILD_TOOL_COMMAND,
  detectProjectBound,
  findBuildToolCommand,
} from '../src/lib/runner/project-bound.js';
import { ProjectBoundNotice } from '../src/components/workspace/ProjectBoundNotice.jsx';

const SPRING = `// Run inside your own project: ./mvnw spring-boot:run
class ProjectAnatomy {
    // TODO: name the auto-configuration
}`;

const LECTURE = 'Open `exercises/01-project-anatomy.java`. Then run `./mvnw spring-boot:run`.';

describe('RON-372 project-bound rule', () => {
  it('RON-372 a markdown exercise has nothing to run', () => {
    expect(detectProjectBound({ language: null, file: '# Balance the ledger\n' })).toMatchObject({
      bound: true,
      reason: 'no-runner',
      command: null,
    });
  });

  it('RON-372 a build tool in the file makes it project-bound with its command', () => {
    expect(detectProjectBound({ language: 'java', file: SPRING, lecture: '' })).toEqual({
      bound: true,
      reason: 'build-tool',
      command: './mvnw spring-boot:run',
    });
  });

  it('RON-372 a build tool only in the lecture binds a local-runtime language', () => {
    expect(detectProjectBound({ language: 'java', file: 'class A {}', lecture: LECTURE })).toEqual({
      bound: true,
      reason: 'lecture-build-tool',
      command: './mvnw spring-boot:run',
    });
  });

  it('RON-372 a plain python exercise still runs', () => {
    expect(detectProjectBound({ language: 'python', file: 'print("hi")\n', lecture: '' })).toMatchObject({
      bound: false,
      reason: null,
      command: null,
    });
  });

  it('RON-372 a lecture mention cannot silence a browser-runnable exercise', () => {
    expect(
      detectProjectBound({ language: 'javascript', file: 'console.log(1)\n', lecture: 'Then run `npm run lint`.' })
    ).toMatchObject({ bound: false });
  });

  it('RON-372 a .md lecture line naming a written exercise does not bind a code file', () => {
    expect(detectProjectBound({ language: 'python', file: 'x = 1\n', lecture: 'make sure you print x' })).toMatchObject({
      bound: false,
    });
  });

  it('RON-372 extracts the command without the prose around it', () => {
    expect(findBuildToolCommand('Run it with `./gradlew bootRun` in your project.')).toBe('./gradlew bootRun');
    expect(findBuildToolCommand('Then: npm run dev')).toBe('npm run dev');
    expect(findBuildToolCommand('nothing here')).toBeNull();
    expect(BUILD_TOOL_COMMAND.test('docker compose up')).toBe(true);
  });

  it('RON-372 the notice names the command, or the lecture, or nothing to run', () => {
    const withCommand = renderToString(
      createElement(ProjectBoundNotice, { command: './mvnw spring-boot:run', reason: 'build-tool' })
    );
    expect(withCommand).toContain('runs in your own project');
    expect(withCommand).toContain('./mvnw spring-boot:run');

    const fallback = renderToString(createElement(ProjectBoundNotice, { reason: 'lecture-build-tool' }));
    expect(fallback).toContain('runs in your own project');
    expect(fallback).toContain('lecture says how to run it');

    const written = renderToString(createElement(ProjectBoundNotice, { reason: 'no-runner' }));
    expect(written).toContain('not run in Studio');
    expect(written).toContain('written exercise');
  });
});
