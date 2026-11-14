# learning-log Specification

## Purpose
Defines ownership and the on-disk contract of `LEARNING-LOG.md` — reasoning trail, attempt log and
section entries — so Coach, Professor, the CLI and Studio agree on one file and one format.

## Requirements

### Requirement: Professor is the only writer of LEARNING-LOG.md

The Coach, Spotter and Navigator agents SHALL NOT create or modify `LEARNING-LOG.md` in any
phase. They SHALL return their round, verdict, attempt-log line or concept-thread entry as a fenced
block or a single line, and Professor SHALL be the only actor that persists it.

#### Scenario: Coach returns a done verdict without writing the file
- **WHEN** the done gate ends with a `solid` or `watch-this` verdict
- **THEN** Coach returns a fenced `verdict` block and `LEARNING-LOG.md` is unchanged until
  Professor records it

#### Scenario: Coach returns a review round without writing the file
- **WHEN** a review or stuck round completes
- **THEN** Coach returns a fenced `trail` block and Professor records it with the `trail` CLI step

#### Scenario: Spotter returns the attempt-log line
- **WHEN** a spotter check-in ends
- **THEN** the attempt-log line is returned to Professor, which appends it, and the Spotter agent
  does not edit `LEARNING-LOG.md` itself

#### Scenario: Navigator returns the concept-thread entry
- **WHEN** a section bridge is presented
- **THEN** Navigator returns a fenced `thread` block and Professor appends it to
  `## 🧭 Concept Thread`, including a `preferred_format` when the block carries one

### Requirement: Section entries use the parser-compatible template

A section entry SHALL live under a `## 📝 Section Entries` heading, start with
`### Section <number> — <title>`, and carry `- Date:` and `- Verdict:` lines. `parseLearningLog`
SHALL return the date, section and verdict of every entry.

#### Scenario: Verdict CLI appends one parser-compatible entry
- **WHEN** `skillforce verdict <slug> --stdin` receives a complete verdict JSON
- **THEN** `LEARNING-LOG.md` gains one entry under `## 📝 Section Entries` and
  `parseLearningLog` returns its date, section and verdict

#### Scenario: Hand-written entries follow the same template
- **WHEN** any tool or human writes an entry with the template under `## 📝 Section Entries`
- **THEN** `parseLearningLog` returns its date, section and verdict

#### Scenario: Re-recording a section replaces its entry
- **WHEN** a verdict is recorded twice for the same section
- **THEN** the section has exactly one entry and the later verdict wins

### Requirement: A flagged verdict marks the section trail once

When the verdict is `watch-this: <concept>`, Professor SHALL add `⚠️ watch-this: <concept>` under
that section in `## 🗣️ Reasoning Trail` exactly once, replacing any earlier flag for the section.

#### Scenario: First flagged verdict adds the line
- **WHEN** a flagged verdict is recorded for a section with no flag
- **THEN** the reasoning trail for that section contains one `⚠️ watch-this` line

#### Scenario: Second flagged verdict does not duplicate the line
- **WHEN** a flagged verdict is recorded again with a different concept
- **THEN** the section trail contains exactly one `⚠️ watch-this` line with the newer concept

### Requirement: Learner text reaches CLI writers only through stdin

Every CLI step that records learner-authored text SHALL read it as JSON on stdin from a quoted
heredoc, and SHALL NOT accept it inside a shell flag. Learner text containing `$(...)` or backticks
SHALL be stored literally.

#### Scenario: Command substitution stays literal
- **WHEN** a verdict or trail round contains `$(touch pwned)` and is piped through a quoted heredoc
- **THEN** the log stores the text literally and no file named `pwned` is created

#### Scenario: Missing input is refused
- **WHEN** `skillforce verdict` is called without a slug or without a required verdict field
- **THEN** it exits non-zero, names the missing input, and writes nothing
