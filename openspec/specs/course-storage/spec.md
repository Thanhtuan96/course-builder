# course-storage Specification

## Purpose
Defines the single on-disk location for a Professor course (`learning/<slug>/`) and how every
reader — commands, agents, the CLI, the PreCompact hook and the web UI — resolves it.

## Requirements

### Requirement: One course location

The system SHALL treat `learning/<slug>/` as the only course location. No reader SHALL resolve a
course from `courses/`, and no code path SHALL fall back to it. A course SHALL leave
`learning/<slug>/` only through `skillforce archive`, which copies its contents to
`.course_archive/` before removing anything.

#### Scenario: Course only in learning is discovered
- **WHEN** a course exists only at `learning/sql/COURSE.md`
- **THEN** course discovery returns it with location `learning`

#### Scenario: Legacy courses folder is ignored
- **WHEN** a course exists only at `courses/old/COURSE.md`
- **THEN** course discovery returns no course for it

#### Scenario: Learning wins over a duplicate legacy folder
- **WHEN** the same slug exists in both `learning/x/` and `courses/x/`
- **THEN** discovery returns exactly one course, read from `learning/x/`

#### Scenario: A course leaves learning only through archive
- **WHEN** a course is removed from `learning/<slug>/`
- **THEN** its files already exist under `.course_archive/` and, for a programming course, its
  commits remain reachable on branch `archive/<slug>`

### Requirement: Explicit course directory override

Course discovery SHALL keep an explicit `--dir` override that reads a single course directory or a
parent of course directories, reporting location `custom`.

#### Scenario: Override points at a course directory
- **WHEN** the override directory contains `COURSE.md`
- **THEN** discovery returns that directory as one course with location `custom`

#### Scenario: Override points at a parent directory
- **WHEN** the override directory contains subdirectories with `COURSE.md`
- **THEN** discovery returns each of them with location `custom`

### Requirement: Capstone and syllabus find new courses

`professor:capstone` and `professor:syllabus` SHALL locate the active course under
`learning/<slug>/` and SHALL NOT require a `courses/` directory.

#### Scenario: Capstone reads learning
- **WHEN** the only course is at `learning/sql/` with a `CAPSTONE.md`
- **THEN** `professor:capstone` reads `learning/sql/CAPSTONE.md` and displays it

#### Scenario: Syllabus reads learning
- **WHEN** the only course is at `learning/sql/` with a `COURSE.md`
- **THEN** `professor:syllabus` reads `learning/sql/COURSE.md` and displays it

#### Scenario: No course at all
- **WHEN** no `learning/` course exists
- **THEN** both commands respond that no active course was found and point at
  `/professor:new-topic`

### Requirement: Canonical plugin files name only learning

Every canonical command, agent and `professor-skill/SKILL.md` SHALL describe `learning/<slug>/` as
the course location and SHALL NOT name `courses/` as one. The generated `shared/` tree SHALL stay
byte-identical to the canonical sources.

#### Scenario: Contract scan finds no legacy path
- **WHEN** the canonical command, agent and SKILL files are scanned for `courses/`
- **THEN** no file names `courses/` as a course location

#### Scenario: Shared tree is in sync
- **WHEN** `node scripts/sync-shared.mjs --check` runs after the edits
- **THEN** it exits 0 with no drift

### Requirement: PreCompact scans only learning

The PreCompact hook SHALL pick the most recently modified `COURSE.md` under `learning/` only, and
SHALL skip the save when no course is found there.

#### Scenario: Hook ignores legacy courses
- **WHEN** `learning/sql/COURSE.md` and a newer `courses/old/COURSE.md` both exist
- **THEN** the hook saves to `learning/sql/`

#### Scenario: Hook skips when learning is empty
- **WHEN** only `courses/old/COURSE.md` exists
- **THEN** the hook reports that it found no course and writes nothing

### Requirement: Web course directory defaults to learning

The web CLI SHALL default its course directory to `./learning`, while an explicit `COURSES_DIR`
or `--dir` value still wins.

#### Scenario: Default course dir
- **WHEN** `skillforce web` starts with no `COURSES_DIR` set
- **THEN** the printed course directory is `./learning`

#### Scenario: Explicit value wins
- **WHEN** `COURSES_DIR=./custom` is set before start
- **THEN** the printed course directory is `./custom`

### Requirement: Docs and CHANGELOG state the migration

`CLAUDE.md`, `README.md` and `CHANGELOG.md` `[Unreleased]` SHALL describe `learning/` as the only
course location and SHALL tell pre-0.1.0 users once to move `courses/<slug>/` to
`learning/<slug>/`. The plugin SHALL NOT move or delete user files automatically.

#### Scenario: CHANGELOG carries the migration note
- **WHEN** `CHANGELOG.md` is read at `[Unreleased]`
- **THEN** it states that `courses/<slug>/` must be moved to `learning/<slug>/` by hand

#### Scenario: Docs name one location
- **WHEN** `CLAUDE.md` and `README.md` are scanned for course locations
- **THEN** neither presents `courses/` as a supported course location
