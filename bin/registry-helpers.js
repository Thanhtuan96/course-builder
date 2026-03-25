/**
 * Registry helpers — extracted for testability.
 * These functions are imported by bin/cli.js and test/cli.test.js.
 */
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, statSync } from 'fs';
import { join, dirname, basename } from 'path';
import os from 'os';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';

// ─── Registry constants ────────────────────────────────────────────────────────
export const REGISTRY_INDEX_URL =
  'https://raw.githubusercontent.com/professor-skills-hub/courses-skills-registry/main/index.json';
export const RAW_COURSES_BASE =
  'https://raw.githubusercontent.com/professor-skills-hub/courses-skills-registry/main/courses';
export const RAW_SKILLS_BASE =
  'https://raw.githubusercontent.com/professor-skills-hub/courses-skills-registry/main/skills';

// ─── Registry helpers ─────────────────────────────────────────────────────────

/**
 * Fetch raw text from the registry.
 * @param {string} url
 * @param {{ optional?: boolean }} opts
 * @returns {Promise<string|null>}
 */
export async function fetchRegistryText(url, { optional = false } = {}) {
  const { get } = await import('https');
  return new Promise((resolve, reject) => {
    get(url, (res) => {
      if (res.statusCode === 404 && optional) {
        res.resume();
        resolve(null);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
        res.resume();
        return;
      }
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

export async function fetchRegistryIndex() {
  try {
    const text = await fetchRegistryText(REGISTRY_INDEX_URL);
    return JSON.parse(text);
  } catch (err) {
    if (err instanceof SyntaxError) {
      console.error(
        style(
          'error',
          'Registry returned invalid data. Try again or check https://github.com/professor-skills-hub/courses-skills-registry'
        )
      );
    } else {
      console.error(style('error', `Registry fetch failed: ${err.message}`));
    }
    process.exit(1);
  }
}

// ─── Theme / styling ─────────────────────────────────────────────────────────
const THEME = {
  success: '✅',
  warning: '⚠️',
  error: '❌',
  info: '→',
};
const STYLE = {
  success: (s) => chalk.green(THEME.success + ' ' + s),
  warning: (s) => chalk.yellow(THEME.warning + ' ' + s),
  error:   (s) => chalk.red(THEME.error + ' ' + s),
  info:    (s) => chalk.dim(THEME.info + ' ' + s),
};
export function style(type, text) {
  return STYLE[type](text);
}

// ─── Input validation ────────────────────────────────────────────────────────

/**
 * Reject names that are empty, contain path separators, or are just ".".
 * @param {string} name
 */
export function validateItemName(name) {
  if (!name || basename(name) !== name || name === '.') {
    console.error(style('error', 'Invalid name'));
    process.exit(1);
  }
}

// ─── Scope resolution ─────────────────────────────────────────────────────────

/**
 * Resolve install/update scope for a skill.
 * @param {string} itemName
 * @param {'skill'} type
 * @param {{ isGlobal?: boolean, isLocal?: boolean }} opts
 * @returns {Promise<'local'|'global'>}
 */
export async function resolveScope(itemName, type, { isGlobal = false, isLocal = false } = {}) {
  if (isGlobal) return 'global';
  if (isLocal)  return 'local';
  if (!process.stdin.isTTY) {
    console.error(style('error', 'Non-interactive mode. Use --local or --global.'));
    process.exit(1);
  }
  const globalPath = join(os.homedir(), '.claude', 'skills', itemName);
  const { chosen } = await inquirer.prompt([{
    type: 'list',
    name: 'chosen',
    message: `Install scope for ${type} "${itemName}":`,
    choices: [
      { name: `Local — .claude/skills/${itemName}/ (this project only)`, value: 'local' },
      { name: `Global — ${globalPath} (all projects)`, value: 'global' },
    ],
    default: 'local',
  }]);
  return chosen;
}

// ─── Install helpers ──────────────────────────────────────────────────────────

/**
 * Overwrite prompt for existing installation directories.
 * @param {string} destDir
 * @param {string} markerFile
 * @param {boolean} force
 * @returns {Promise<boolean>}
 */
export async function confirmOverwrite(destDir, markerFile, force) {
  if (!existsSync(join(destDir, markerFile))) return true;
  if (force) return true;
  if (!process.stdin.isTTY) {
    console.error(style('error', `${markerFile} already exists. Use --force to overwrite.`));
    process.exit(1);
  }
  const { confirmed } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirmed',
    message: `${markerFile} already exists. Overwrite? (y/N)`,
    default: false,
  }]);
  if (!confirmed) {
    console.log('Aborted.');
    process.exit(0);
  }
  return true;
}

/**
 * Install a skill from the registry.
 * @param {string} itemName
 * @param {'local'|'global'} scope
 * @param {{ force?: boolean, index?: object, isGlobal?: boolean, isLocal?: boolean }} opts
 */
export async function installSkill(itemName, scope, { force = false, index = null } = {}) {
  let registryIndex = index;
  if (!registryIndex) {
    const spinner = ora('Fetching registry…').start();
    try {
      registryIndex = await fetchRegistryIndex();
    } catch {
      spinner.fail('Registry fetch failed.');
      process.exit(1);
    }
    spinner.stop();
  }

  const skill = (registryIndex.skills || []).find((s) => s.name === itemName);
  if (!skill) {
    console.error(style('error', `Skill "${itemName}" not found.`));
    const names = (registryIndex.skills || []).map((s) => s.name);
    if (names.length) console.error(`Available skills: ${names.join(', ')}`);
    else console.error('No skills published yet.');
    process.exit(1);
  }

  const destDir = scope === 'global'
    ? join(os.homedir(), '.claude', 'skills', itemName)
    : join(process.cwd(), '.claude', 'skills', itemName);

  await confirmOverwrite(destDir, 'SKILL.md', force);
  mkdirSync(destDir, { recursive: true });

  const spinner = ora(`Installing ${skill.title}…`).start();
  for (const file of ['SKILL.md', 'meta.json']) {
    spinner.text = `Downloading ${file}…`;
    const opts = file === 'meta.json' ? { optional: true } : {};
    const text = await fetchRegistryText(`${RAW_SKILLS_BASE}/${itemName}/${file}`, opts);
    if (text !== null) {
      writeFileSync(join(destDir, file), text, 'utf8');
    }
  }
  spinner.succeed(`Installed skill ${chalk.bold(skill.title)} (${scope})`);
  console.log('');
  console.log(style('info', `Skill installed at ${destDir}`));
  console.log(style('info', 'It will be available to Claude Code in this project automatically.'));
  console.log('');
}

/**
 * Install a course from the registry (always local).
 * @param {string} itemName
 * @param {{ force?: boolean, index?: object }} opts
 */
export async function installCourse(itemName, { force = false, index = null } = {}) {
  let registryIndex = index;
  if (!registryIndex) {
    const spinner = ora('Fetching registry…').start();
    try {
      registryIndex = await fetchRegistryIndex();
    } catch {
      spinner.fail('Registry fetch failed.');
      process.exit(1);
    }
    spinner.stop();
  }

  const course = (registryIndex.courses || []).find((c) => c.name === itemName);
  if (!course) {
    console.error(style('error', `Course "${itemName}" not found.`));
    const names = (registryIndex.courses || []).map((c) => c.name);
    if (names.length) console.error(`Available courses: ${names.join(', ')}`);
    process.exit(1);
  }

  const destDir = join(process.cwd(), 'learning', itemName);
  await confirmOverwrite(destDir, 'COURSE.md', force);
  mkdirSync(destDir, { recursive: true });

  const spinner = ora(`Installing course…`).start();
  for (const file of ['COURSE.md', 'meta.json']) {
    spinner.text = `Downloading ${file}…`;
    const opts = file === 'meta.json' ? { optional: true } : {};
    const text = await fetchRegistryText(`${RAW_COURSES_BASE}/${itemName}/${file}`, opts);
    if (text !== null) {
      writeFileSync(join(destDir, file), text, 'utf8');
    }
  }
  spinner.succeed(`Installed ${chalk.bold(course.title)} (${course.sections} sections, ${course.level})`);
  console.log('');
  console.log(style('info', 'Course downloaded to:'), chalk.dim(`learning/${itemName}/COURSE.md`));
  console.log(style('info', 'To start learning, run in Claude Code:'));
  console.log('   professor:new-topic');
  console.log('');
}
