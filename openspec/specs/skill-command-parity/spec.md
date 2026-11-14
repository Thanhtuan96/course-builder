# skill-command-parity Specification

## Purpose
Defines `SKILL.md` as the complete behaviour on platforms that install no command files, and the
contract that keeps each of its command sections in step with the canonical command files.

## Requirements

### Requirement: SKILL.md mirrors the command files it restates

For every command that `SKILL.md` restates, its section SHALL describe the same steps as the
canonical command file and SHALL name the same `npx ronin-skillforce` CLI calls.

#### Scenario: Done matches the done command

- **WHEN** the CLI calls named in `SKILL.md`'s `professor:done` section and in
  `commands/professor/done.md` are compared
- **THEN** both name `context`, `verdict`, `capstone-status` and `save`, and neither omits one the
  other requires

#### Scenario: Next matches the next command

- **WHEN** the CLI calls named in `SKILL.md`'s `professor:next` section and in
  `commands/professor/next.md` are compared
- **THEN** both name `save`, and the section also covers the resume rule, the lecture archive, the
  exercise file, the `Active exercise` field and the spotter reminder

#### Scenario: Review matches the review command

- **WHEN** the CLI calls named in `SKILL.md`'s `professor:review` section and in
  `commands/professor/review.md` are compared
- **THEN** both name `context` and `trail` with `--stdin`

### Requirement: SKILL.md is sufficient without command files

On Cursor the skill document is the whole behaviour: a learner typing a `professor:` command SHALL
be able to complete the flow using only what `SKILL.md` says.

#### Scenario: Completing a section from SKILL.md alone

- **WHEN** a learner runs the done flow using only `SKILL.md`
- **THEN** the document states the Coach gate, the verdict block, the "confirm" step, the
  `COURSE.md` update, the schedule refresh and the capstone unlock check

#### Scenario: Starting a section from SKILL.md alone

- **WHEN** a learner runs the next flow using only `SKILL.md`
- **THEN** the document states the in-progress resume rule, the research and citation requirement, the
  lecture archive, the exercise file and the `save` step
