# platform-setup-refresh Specification

## Purpose
Defines what `skillforce setup` owns on a learner's machine, how a repeated run refreshes that
content so upgrades take effect, how the previous version is preserved, and how a run reports what
it did.

## Requirements

### Requirement: Setup rewrites the files it manages on every run

`setup` SHALL write the current version of every managed file on every run, whether or not the
destination already exists. Managed files are the agents, commands, skill document and hooks that
the plugin itself installs for that platform.

#### Scenario: A changed managed file is refreshed

- **WHEN** `setup` runs a second time after a managed command file was edited or left over from an
  older release
- **THEN** the file on disk holds the current plugin content and the run counts it as updated

#### Scenario: Current managed files are not rewritten

- **WHEN** a managed file already matches the current plugin content
- **THEN** the run leaves it unchanged, counts it as unchanged, and writes no backup

#### Scenario: Every supported platform refreshes

- **WHEN** `setup` runs twice for Claude Code, Gemini CLI, OpenCode or Cursor
- **THEN** the second run updates the managed files that differ on each of the four platforms

### Requirement: A differing managed file is backed up once per run

Before overwriting a managed file whose content differs from the new content, `setup` SHALL save the
content being replaced as `<file>.bak` next to it. Each file is backed up at most once per run, and a
file that already matches gets no backup.

#### Scenario: First re-run keeps the replaced version

- **WHEN** `setup` overwrites a managed file whose content differs
- **THEN** `<file>.bak` exists next to it and holds the exact content that was replaced

#### Scenario: Backup contents follow the current version

- **WHEN** `setup` runs again after a second content change
- **THEN** `<file>.bak` holds the content replaced by that run, so a single backup per file is kept

#### Scenario: Unchanged files leave no backup

- **WHEN** a managed file already matches the current content
- **THEN** no `<file>.bak` is created for it

### Requirement: Setup never touches files it does not own

`setup` SHALL NOT create, modify, move or delete any file outside the set the plugin installs. A file
sitting in the same folder as managed files but installed by the learner, another tool or another
plugin SHALL remain byte-identical.

#### Scenario: Unrelated file in a managed folder survives

- **WHEN** a learner file such as `.claude/agents/my-agent.md` or `.opencode/commands/mine.md`
  exists before `setup` runs
- **THEN** the file is unchanged afterwards and no backup is written for it

#### Scenario: Setup never deletes learner content

- **WHEN** `setup` runs against a folder that holds managed and unmanaged files
- **THEN** no file is removed by the run

### Requirement: Block-managed files are refreshed in place

For files the learner may also edit, `setup` SHALL manage only a marker-delimited Professor block:
the block is replaced with the current version on every run, the rest of the file is preserved
verbatim, and the file is backed up before it is rewritten.

#### Scenario: Gemini block is replaced, the rest survives

- **WHEN** `setup` runs twice for Gemini CLI and `GEMINI.md` holds the learner's own text around the
  Professor block
- **THEN** the block between the Professor start and end markers holds the current content and the
  surrounding text is unchanged

#### Scenario: Gemini block is appended to an existing file

- **WHEN** `GEMINI.md` exists without a Professor block
- **THEN** the current block is appended and the existing content is kept

#### Scenario: OpenCode `AGENTS.md` block is replaced

- **WHEN** `setup` runs twice for OpenCode and `AGENTS.md` carries a marker-delimited Professor block
- **THEN** the block is refreshed to the current content and any learner text outside it is unchanged

#### Scenario: A legacy whole-file install is upgraded

- **WHEN** OpenCode's `AGENTS.md` has no Professor markers but is the skill document an older release
  wrote wholesale
- **THEN** the file is replaced with the current marked block, backed up first, and no stale skill
  text is left above the new block

### Requirement: Each run ends with a one-line summary

`setup` SHALL print one summary line per platform run that reports how many managed files were
updated, how many were already unchanged, and how many backups were written.

#### Scenario: Summary reports the counts

- **WHEN** a run updates two files, leaves ten unchanged and backs up two
- **THEN** the final summary line reports 2 updated, 10 unchanged and 2 backed up
