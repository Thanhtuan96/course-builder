/**
 * PW-05 guard — the Studio local runner can never spawn `npm`, `npx`, `pnpm`, `yarn` or `playwright`.
 *
 * The runner's allowlist is a closed list of six language toolchains (`COMMANDS`) plus a
 * `COMMAND_DENYLIST` for shell/package-manager names. The gap this test closes (D-19) is that the
 * denylist used to be compared against a name that still carried its Windows shim extension, so
 * `npx.cmd`, `NPM.EXE` and `playwright.cmd` were accepted. `assertCommandAllowed` now normalizes
 * (basename → lowercase → repeated shim strip) before both the `bash` branch and the denylist check.
 *
 * Every assertion here is on pure functions: no Express server and no spawned process is needed.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  COMMANDS,
  COMMAND_DENYLIST,
  COMMAND_SHIM_EXTENSIONS,
  assertCommandAllowed,
  buildPipeline,
  normalizeCommandName,
} from '../web/studio-runner.js';

/** Commands that must stay unreachable through the runner. */
const DENIED_NAMES = ['npm', 'npx', 'pnpm', 'yarn', 'playwright'];

/**
 * The Phase 2 denylist baseline, copied here on purpose: a future refactor that drops an entry
 * fails this test instead of silently widening what the runner can execute.
 */
const DENYLIST_BASELINE = [
  'npm',
  'npx',
  'pnpm',
  'yarn',
  'playwright',
  'sh',
  'bash',
  'zsh',
  'fish',
  'cmd',
  'powershell',
];

/** The runner source, for defence-in-depth assertions that the guard is still wired up. */
const RUNNER_SOURCE = readFileSync(new URL('../web/studio-runner.js', import.meta.url), 'utf8');

/** The executable shims a command can be wrapped in on Windows / by npm's `.cmd` shims. */
const SHIM_EXTENSIONS = ['.exe', '.cmd', '.bat', '.com', '.ps1'];

/**
 * Every spelling of `name` the runner must reject: bare, path-qualified (POSIX and Windows),
 * case-varied, and with every executable shim extension.
 * @param {string} name
 * @returns {Array<{ label: string, value: string }>}
 */
function deniedForms(name) {
  const upper = name.toUpperCase();
  const mixed = name[0].toUpperCase() + name.slice(1);
  const forms = [
    { label: 'bare', value: name },
    { label: 'POSIX root', value: `/${name}` },
    { label: 'POSIX absolute', value: `/usr/local/bin/${name}` },
    { label: 'Windows absolute', value: `C:\\Program Files\\nodejs\\${name}` },
    { label: 'upper case', value: upper },
    { label: 'mixed case', value: mixed },
    { label: 'upper case + shim', value: `${upper}.EXE` },
    { label: 'mixed case + shim', value: `${mixed}.Cmd` },
  ];
  for (const ext of SHIM_EXTENSIONS) {
    forms.push({ label: `shim ${ext}`, value: `${name}${ext}` });
  }
  return forms;
}

/**
 * Run `assertCommandAllowed` and return the thrown error (failing the test if it does not throw).
 * @param {unknown} command
 * @param {{ allowBash?: boolean }} [opts]
 * @returns {Error & { code?: string }}
 */
function deniedError(command, opts) {
  try {
    assertCommandAllowed(command, opts);
  } catch (err) {
    return err;
  }
  throw new Error(`Expected assertCommandAllowed(${JSON.stringify(command)}) to throw, but it passed`);
}

describe('normalizeCommandName', () => {
  it('strips the path, lowercases, and removes a single shim extension', () => {
    expect(normalizeCommandName('NPM.EXE')).toBe('npm');
    expect(normalizeCommandName('/usr/local/bin/npx.cmd')).toBe('npx');
    expect(normalizeCommandName('C:\\Program Files\\nodejs\\playwright.CMD')).toBe('playwright');
    expect(normalizeCommandName('npx.cmd')).toBe('npx');
    expect(normalizeCommandName('playwright.ps1')).toBe('playwright');
  });

  it('strips stacked shim extensions repeatedly', () => {
    expect(normalizeCommandName('npm.cmd.exe')).toBe('npm');
    expect(normalizeCommandName('NPM.EXE.CMD')).toBe('npm');
    expect(normalizeCommandName('npx.cmd.COM')).toBe('npx');
  });

  it('leaves allowlisted names untouched', () => {
    expect(normalizeCommandName('node')).toBe('node');
    expect(normalizeCommandName('python3')).toBe('python3');
    expect(normalizeCommandName('node.exe')).toBe('node');
    expect(normalizeCommandName('  node  ')).toBe('node');
  });

  it('reduces a relative binary path to its basename', () => {
    expect(normalizeCommandName('./main')).toBe('main');
    expect(normalizeCommandName('./target/release/main')).toBe('main');
  });

  it('returns an empty name when nothing usable is left', () => {
    expect(normalizeCommandName('')).toBe('');
    expect(normalizeCommandName(null)).toBe('');
    expect(normalizeCommandName(undefined)).toBe('');
    expect(normalizeCommandName('   ')).toBe('');
    expect(normalizeCommandName('npx/')).toBe('');
  });

  it('exposes the exact shim extensions it strips, frozen', () => {
    expect(COMMAND_SHIM_EXTENSIONS).toEqual(['.exe', '.cmd', '.bat', '.com', '.ps1']);
    expect(Object.isFrozen(COMMAND_SHIM_EXTENSIONS)).toBe(true);
  });
});

describe('assertCommandAllowed denies package managers and Playwright in every form', () => {
  for (const name of DENIED_NAMES) {
    it(`denies ${name} bare, path-qualified, case-varied and shimmed`, () => {
      for (const { label, value } of deniedForms(name)) {
        const err = deniedError(value);
        expect(err.message, `${name} as ${label} (${value})`).toMatch(/not allowed/);
        expect(err.code, `${name} as ${label} (${value})`).toBe('command_denied');
      }
    });
  }

  it('denies stacked and paste-shaped shim combinations', () => {
    const stacked = [
      'npm.cmd.exe',
      'npm.EXE.CMD',
      'NPM.cmd.exe',
      'npx.cmd.COM',
      'npx.cmd.ps1',
      'playwright.CMD',
      'playwright.cmd.exe',
      'playwright.CMD.PS1',
      'pnpm.cmd.exe',
      'yarn.bat.cmd',
      'C:\\Program Files\\nodejs\\npx.CMD.EXE',
      '/usr/local/bin/yarn.cmd.exe',
    ];
    for (const value of stacked) {
      expect(() => assertCommandAllowed(value), value).toThrow(/not allowed/);
    }
  });

  it('denies the shimmed names even when bash is opted in', () => {
    for (const name of DENIED_NAMES) {
      expect(() => assertCommandAllowed(name, { allowBash: true }), name).toThrow(/not allowed/);
      expect(() => assertCommandAllowed(`${name}.cmd`, { allowBash: true })).toThrow(/not allowed/);
    }
  });
});

describe('assertCommandAllowed keeps its empty-command branch', () => {
  it('rejects empty, null and separators-only names with "No command supplied."', () => {
    for (const value of ['', null, undefined, '   ', 'npx/']) {
      const err = deniedError(value);
      expect(err.message, String(value)).toBe('No command supplied.');
      expect(err.code, String(value)).toBe('command_denied');
    }
  });
});

describe('the runner denylist is not weakened', () => {
  it('still contains every Phase 2 entry', () => {
    expect(COMMAND_DENYLIST).toBeInstanceOf(Set);
    for (const name of DENYLIST_BASELINE) {
      expect(COMMAND_DENYLIST.has(name), name).toBe(true);
    }
  });

  it('denies every baseline entry as a path-qualified command too', () => {
    for (const name of DENYLIST_BASELINE) {
      expect(() => assertCommandAllowed(name), name).toThrow(/not allowed/);
      expect(() => assertCommandAllowed(`/usr/bin/${name}`), name).toThrow(/not allowed/);
    }
  });
});

describe('the runner allowlist stays closed', () => {
  it('pins COMMANDS to exactly the six language toolchains', () => {
    expect(Object.keys(COMMANDS)).toEqual(['javascript', 'python', 'go', 'java', 'rust', 'bash']);
    expect(Object.values(COMMANDS)).toEqual(['node', 'python3', 'go', 'javac', 'rustc', 'bash']);
  });

  it('lets every allowlisted command pass, including node', () => {
    for (const cmd of Object.values(COMMANDS)) {
      expect(() => assertCommandAllowed(cmd, { allowBash: true }), cmd).not.toThrow();
    }
    expect(() => assertCommandAllowed('node')).not.toThrow();
    expect(() => assertCommandAllowed('/usr/local/bin/node')).not.toThrow();
    expect(assertCommandAllowed('node')).toBe(true);
  });

  it('still requires the explicit allowBash opt-in for bash', () => {
    expect(() => assertCommandAllowed('bash')).toThrow(/not allowed/);
    expect(() => assertCommandAllowed('bash', { allowBash: false })).toThrow(/not allowed/);
    // Normalization runs before the bash exception, so a shimmed bash gets the same gating.
    expect(() => assertCommandAllowed('BASH.CMD')).toThrow(/not allowed/);
    expect(() => assertCommandAllowed('BASH.CMD', { allowBash: false })).toThrow(/not allowed/);
    expect(assertCommandAllowed('bash', { allowBash: true })).toBe(true);
  });
});

describe('every pipeline the runner can build is allowlist-clean', () => {
  const PIPELINES = [
    { language: 'javascript', entry: 'main.js' },
    { language: 'python', entry: 'main.py' },
    { language: 'go', entry: 'main.go' },
    { language: 'java', entry: 'Main.java' },
    { language: 'rust', entry: 'main.rs' },
  ];

  for (const { language, entry } of PIPELINES) {
    it(`builds a ${language} pipeline whose steps are all allowed and never a package manager`, () => {
      const steps = buildPipeline(language, entry, {});

      expect(steps.length).toBeGreaterThan(0);
      for (const step of steps) {
        const normalized = normalizeCommandName(step.cmd);
        expect(() => assertCommandAllowed(step.cmd), `${language}: ${step.cmd}`).not.toThrow();
        expect(COMMAND_DENYLIST.has(normalized), `${language}: ${step.cmd}`).toBe(false);
        expect(DENIED_NAMES.includes(normalized), `${language}: ${step.cmd}`).toBe(false);
      }
      // The first step is the language's allowlisted compiler/interpreter.
      expect(steps[0].cmd).toBe(COMMANDS[language]);
    });
  }

  it('documents the steps that are allowed without being COMMANDS values', () => {
    const allowlist = new Set(Object.values(COMMANDS));
    const javaSteps = buildPipeline('java', 'Main.java', {});
    const rustSteps = buildPipeline('rust', 'main.rs', {});

    expect(javaSteps.map((step) => step.cmd)).toEqual(['javac', 'java']);
    expect(rustSteps.map((step) => step.cmd)).toEqual(['rustc', './main']);
    // `java` (the JVM, run after `javac`) and `./main` (the compiled Rust binary) are allowed by the
    // denylist-only check even though they are not COMMANDS entries — so the pipeline assertions
    // above are denylist-shaped, never "every step is an allowlist value".
    expect(allowlist.has('java')).toBe(false);
    expect(allowlist.has('./main')).toBe(false);
    for (const cmd of ['java', './main']) {
      expect(() => assertCommandAllowed(cmd), cmd).not.toThrow();
    }
  });

  it('still refuses the bash pipeline without the opt-in', () => {
    expect(() => buildPipeline('bash', 'run.sh', {}, { allowBash: false })).toThrow(
      /Bash is not enabled/
    );
    const steps = buildPipeline('bash', 'run.sh', {}, { allowBash: true });
    expect(steps).toEqual([{ cmd: 'bash', args: ['run.sh'] }]);
  });
});

describe('the runner source keeps its containment guarantees', () => {
  it('spawns without a shell', () => {
    expect(RUNNER_SOURCE).toContain('shell: false');
    expect(RUNNER_SOURCE).not.toContain('shell: true');
  });

  it('has exactly one injected spawn call site', () => {
    const spawnCalls = RUNNER_SOURCE.match(/spawnImpl\s*\(/g) || [];
    expect(spawnCalls).toHaveLength(1);
  });

  it('spells all eleven denied names in the denylist literal itself', () => {
    const literal = RUNNER_SOURCE.match(/COMMAND_DENYLIST\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
    expect(literal, 'COMMAND_DENYLIST literal not found').not.toBeNull();
    const body = literal[1];
    for (const name of DENYLIST_BASELINE) {
      expect(body, name).toMatch(new RegExp(`["']${name}["']`));
    }
  });
});
