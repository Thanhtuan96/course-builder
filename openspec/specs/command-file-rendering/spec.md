# command-file-rendering Specification

## Purpose
Defines the per-platform form of a canonical command: how command names are spelled, how Gemini CLI
commands receive the learner's arguments, and how Cursor's plain-language rendering of tool calls
must read.

## Requirements

### Requirement: The command prefix is spelled `professor:`

Every command reference in the canonical plugin content and in the shipped `shared/` copy SHALL use
the prefix `professor:`. The misspelling `profesor:` SHALL NOT appear anywhere in those files.

#### Scenario: Canonical content has no misspelling

- **WHEN** the canonical agents, commands and skill document are scanned for `profesor:`
- **THEN** no occurrence is found

#### Scenario: Shipped content has no misspelling

- **WHEN** `shared/**` is scanned for `profesor:`
- **THEN** no occurrence is found, and `node scripts/sync-shared.mjs --check` reports no drift

### Requirement: Gemini commands receive the learner's arguments

A Gemini CLI command generated from a canonical command that takes arguments SHALL pass them through
the Gemini placeholder `{{args}}` and SHALL NOT contain a literal `$ARGUMENTS`.

#### Scenario: Generated command carries arguments

- **WHEN** `setup` writes the Gemini command files
- **THEN** every file whose canonical command uses learner input contains `{{args}}` and no
  `$ARGUMENTS`

#### Scenario: Argument-free commands are unaffected

- **WHEN** a canonical command does not use learner input
- **THEN** its generated Gemini file contains neither `{{args}}` nor `$ARGUMENTS`

### Requirement: Cursor's rendering of a command reads as instructions

When a tool call is rendered for Cursor, which has no such tool, the resulting text SHALL read as a
plain instruction to the model rather than a spliced sentence fragment.

#### Scenario: No spliced tool sentence

- **WHEN** the canonical commands and the skill document are rendered for Cursor, and the generated
  `.cursor/rules/professor.mdc` is scanned
- **THEN** none of them contains "Use ask the user directly in chat" or
  "the ask the user directly in chat tool", and the new-topic instruction still asks all questions in
  a single call

#### Scenario: Substituted text still names the platform behaviour

- **WHEN** a canonical command asks the learner questions through a tool call
- **THEN** the Cursor rendering tells the model to ask the user directly in chat without referring to
  a tool that does not exist
