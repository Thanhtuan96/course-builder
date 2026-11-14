# agent-handoff-fallback Specification

## Purpose
Defines how a Professor command that normally delegates to Coach, Spotter or Navigator behaves on a
platform where those sub-agents are not installed, and where direct agent invocations may be offered.

## Requirements

### Requirement: Every agent hand-off states the inline fallback

Each hand-off to Coach or Navigator SHALL say that a platform without that agent runs the flow
inline, in the same file where the hand-off is described.

#### Scenario: Every delegating command carries the sentence

- **WHEN** `commands/professor/{review,done,stuck,spotter}.md` are scanned
- **THEN** each one states "If no Coach agent is available on this platform, run the Coach flow below
  inline." (or the same sentence naming Navigator)

#### Scenario: The skill document carries it for both agents

- **WHEN** `SKILL.md` is scanned where it hands off to Coach and to Navigator
- **THEN** both hand-offs state the inline fallback

### Requirement: The fallback flow is self-contained

The inline flow a command points to SHALL be usable without the delegated agent: it states the
opening self-assessment question, the step structure to follow, and the CLI call that records the
round when one is required.

#### Scenario: Review can complete inline

- **WHEN** a learner runs the review flow on a platform with no Coach agent
- **THEN** the command tells the model what to ask first, how to structure the feedback, and how to
  record the round with the `trail` CLI step

#### Scenario: Done can complete inline

- **WHEN** a learner runs the done flow on a platform with no Coach agent
- **THEN** the command tells the model to run the gate itself, then record the `verdict` block with
  the CLI before completing the section

### Requirement: Direct agent invocation is offered on Claude Code only

A file SHALL offer `/coach`, `@coach`, `/navigator`, `@navigator`, `/spotter` or `@spotter` as an
invocation only when it states that this applies to Claude Code, and SHALL NOT present them as
commands available on every platform.

#### Scenario: No unqualified agent invocation

- **WHEN** the canonical agent, command and skill files are scanned for `/coach`, `@coach`,
  `/navigator` or `@navigator`
- **THEN** every remaining occurrence is explicitly marked as Claude Code, and no occurrence appears
  outside that marking

#### Scenario: Non-Claude platforms get the flow instead

- **WHEN** a learner asks for a Navigator view on Gemini CLI, OpenCode or Cursor
- **THEN** the instructions tell the model to produce the concept thread itself instead of pointing at
  a `/navigator` or `@navigator` command
