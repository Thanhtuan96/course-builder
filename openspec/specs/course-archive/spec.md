# course-archive Specification

## Purpose

Defines how a finished Professor course is archived without losing learner work: the whole course
directory is copied out of `learning/<slug>/`, and the git history is kept on an `archive/<slug>`
branch.

## Requirements

### Requirement: Archive copies the whole course directory

`skillforce archive <slug>` SHALL copy the entire `learning/<slug>/` directory, including
`lectures/`, `exercises/`, `LEARNING-LOG.md`, `SCHEDULE.md`, `COMPLETION.md`, `SKILL.md`,
`LECTURE.md` and `SUMMARY.md`, into `.course_archive/<slug>/`. Only the `.git` file or directory
SHALL be skipped.

#### Scenario: Programming course keeps every file

- **WHEN** `learning/nextjs/` holds `COURSE.md`, `CAPSTONE.md`, `NOTES.md`, `LECTURE.md`,
  `LEARNING-LOG.md`, `SCHEDULE.md`, `exercises/01-state/README.md` and `lectures/01-intro.md`
- **THEN** after `skillforce archive nextjs` each of those files exists under
  `.course_archive/nextjs/` with identical content

#### Scenario: The course git metadata is not copied

- **WHEN** the course directory contains a `.git` file (worktree) or `.git/` directory (plain
  folder)
- **THEN** the archive contains no `.git` entry

### Requirement: An existing archive is never overwritten

When `.course_archive/<slug>/` already exists, the command SHALL write to the next free numeric
suffix (`<slug>-2`, `<slug>-3`, …). It SHALL NOT modify, merge into or delete any existing archive.

#### Scenario: Second archive of the same slug gets a suffix

- **WHEN** `.course_archive/nextjs/` already exists and `learning/nextjs/` is archived again
- **THEN** the new copy is written to `.course_archive/nextjs-2/` and `.course_archive/nextjs/`
  is unchanged

#### Scenario: Suffixes increment past the highest used one

- **WHEN** `.course_archive/nextjs/` and `.course_archive/nextjs-2/` both exist
- **THEN** the next archive is written to `.course_archive/nextjs-3/`

### Requirement: Programming courses keep their commits on an archive branch

For a programming course (registered worktree on `learning/<slug>`), the command SHALL first commit
pending work, then rename the branch to `archive/<slug>` instead of deleting it, then remove the
worktree without forcing the removal.

#### Scenario: Commits survive the archive

- **WHEN** a programming course has two commits made by `skillforce save` and is archived
- **THEN** `git log archive/<slug>` still shows both commits, `learning/<slug>/` no longer exists
  and the host repository's `git status` is clean

#### Scenario: Pending work is committed before the branch is renamed

- **WHEN** `learning/nextjs/` has uncommitted changes when it is archived
- **THEN** the archive branch contains a commit with those changes and the copy holds the same
  bytes

#### Scenario: An existing archive branch gets a suffix

- **WHEN** branch `archive/nextjs` already exists
- **THEN** the course branch is renamed to `archive/nextjs-2`

### Requirement: A worktree that cannot be removed cleanly is left in place

If the worktree is still dirty after the save, or `git worktree remove` fails, the command SHALL
stop with a clear error, leave the worktree and its branch untouched, and report that the copy was
already made. It SHALL NOT use `--force`, `git branch -D` or any other destructive fallback.

#### Scenario: Dirty worktree is not removed

- **WHEN** the worktree cannot be committed and `skillforce archive nextjs` runs
- **THEN** the command exits non-zero with an explanatory message, `learning/nextjs/` still exists,
  the branch is still `learning/nextjs`, and every course file is still present

#### Scenario: Removal failure leaves the branch intact

- **WHEN** `git worktree remove` fails for the course directory
- **THEN** the command fails without deleting the branch and the worktree stays registered

### Requirement: Plain-folder courses are removed only after a verified copy

For a plain-folder course, the command SHALL remove `learning/<slug>/` only after verifying that
every file exists in the archive with the same byte size. On any mismatch it SHALL keep the folder
and fail.

#### Scenario: Verified copy then removal

- **WHEN** a plain-folder course with `COURSE.md`, `NOTES.md` and `exercises/` is archived
- **THEN** every file exists under `.course_archive/<slug>/` and `learning/<slug>/` is gone

#### Scenario: Copy mismatch keeps the course

- **WHEN** the copy cannot be verified
- **THEN** `learning/<slug>/` is still present, the command exits non-zero and the error names the
  missing or mismatched path

### Requirement: Archive reports its result

The command SHALL return `{ archivedTo, branch, removed }`, where `branch` is the new
`archive/<slug>` branch name or `null` for a plain-folder course, and `removed` states whether the
course was removed from `learning/`. With `--json` the object SHALL be printed as one JSON line.

#### Scenario: JSON output for a programming course

- **WHEN** `skillforce archive nextjs --json` succeeds
- **THEN** stdout is one JSON object with `archivedTo` ending in `.course_archive/nextjs`,
  `branch` equal to `archive/nextjs` and `removed` equal to `true`

#### Scenario: JSON output for a plain-folder course

- **WHEN** a plain-folder course `chess` is archived with `--json`
- **THEN** the printed object has `branch` equal to `null`

### Requirement: The archive command delegates to the CLI

`professor:archive` SHALL generate `SUMMARY.md`, ask the learner to confirm before anything is
removed, and then run `npx ronin-skillforce archive <slug>`. The canonical command file SHALL NOT
contain `git worktree remove`, `git branch -D` or `--force`.

#### Scenario: Command file calls the CLI

- **WHEN** `commands/professor/archive.md` is read
- **THEN** it contains `skillforce archive` and contains neither `git branch -D` nor `--force`

#### Scenario: Learner confirms before removal

- **WHEN** the learner runs `professor:archive`
- **THEN** the command asks for confirmation with AskUserQuestion before invoking
  `npx ronin-skillforce archive`

#### Scenario: SUMMARY.md is still produced

- **WHEN** the learner confirms the archive
- **THEN** `SUMMARY.md` exists in the course before the CLI runs, so the copy contains it

### Requirement: The archive folder is excluded from the host git status

When the course lives in a git repository, `skillforce archive` SHALL add `/.course_archive/` to the
host repository's `<git-common-dir>/info/exclude` before copying, using the same mechanism that
keeps `learning/` out of `git status`. It SHALL NOT modify tracked files, SHALL NOT duplicate an
existing entry, and SHALL skip the exclusion when the directory is not a git repository.

#### Scenario: Host git status stays clean after archive

- **WHEN** a programming course is archived inside a git repository
- **THEN** `.course_archive/` is listed in `<git-common-dir>/info/exclude` and the host
  repository's `git status --porcelain` is empty afterwards

#### Scenario: Existing exclusion is not duplicated

- **WHEN** `info/exclude` already contains the `.course_archive/` entry
- **THEN** archiving again leaves exactly one such line

#### Scenario: Non-git directory still archives

- **WHEN** a plain-folder course is archived in a directory that is not a git repository
- **THEN** no exclusion is attempted and the course is still copied and removed

### Requirement: Archive rejects an unknown or unsafe slug

The command SHALL validate the slug with the same rule as `create`, and SHALL fail without touching
the filesystem when the slug is invalid or no course exists at `learning/<slug>/`.

#### Scenario: Missing course

- **WHEN** `skillforce archive does-not-exist` runs and no such course exists
- **THEN** the command exits non-zero with an error naming the slug and creates no archive

#### Scenario: Invalid slug

- **WHEN** the slug is `../etc`, `A` or `a--b`
- **THEN** the command exits non-zero with an invalid-slug error
