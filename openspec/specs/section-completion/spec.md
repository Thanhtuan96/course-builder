# section-completion Specification

## Purpose
Defines how a section is finished end to end: the Coach done gate, the confirm hand-off back to
Professor, the verdict contract, and how starting a section interacts with one already in progress.

## Requirements

### Requirement: Coach hands the confirm step back to the learner

After the done gate Coach SHALL NOT instruct the learner to run `professor:done` again. Coach
SHALL ask the learner to say "confirm" to complete the section, and Professor SHALL perform every
completion action.

#### Scenario: Solid verdict asks for confirmation
- **WHEN** the gate ends with a solid verdict
- **THEN** Coach says "Say 'confirm' to complete." and does not mention running `professor:done`

#### Scenario: Confirm completes the section once
- **WHEN** the learner says "confirm" after the gate
- **THEN** Professor marks the section ✅ Done, adds a progress log entry, clears the active
  exercise, updates the schedule, and the gate does not run a second time

### Requirement: Coach returns a verdict block for Professor to record

Coach SHALL end the done gate with a fenced `verdict` block containing the section, the hardest
concept, the question/answer summary and the verdict (`solid` or `watch-this: <concept>`). Coach
SHALL NOT write `LEARNING-LOG.md` itself.

#### Scenario: Verdict block is complete
- **WHEN** the gate ends in any verdict
- **THEN** the `verdict` block names the section, the hardest concept, each question with its
  answer, and one verdict value

#### Scenario: Professor records the block verbatim
- **WHEN** Professor receives the `verdict` block
- **THEN** Professor records it with the `verdict` CLI step and only then completes the section

### Requirement: Every Coach hand-off passes the course context

`professor:done` and `professor:spotter` SHALL run `npx ronin-skillforce context {slug} --json`
before delegating and SHALL pass that JSON to Coach verbatim. When the command fails, the command
SHALL show its error and ask the learner which course to use instead of guessing a slug or path.

#### Scenario: Done passes context
- **WHEN** `professor:done` runs for a valid course
- **THEN** it calls `skillforce context` and hands the JSON, the active exercise and the learner's
  input to Coach

#### Scenario: Spotter passes context to review
- **WHEN** a spotter check-in routes to Coach
- **THEN** the hand-off includes the `skillforce context` JSON

#### Scenario: Context failure is surfaced
- **WHEN** `skillforce context` exits non-zero
- **THEN** the command shows the error and asks the learner which course to use, and does not
  route to Coach with a guessed path

### Requirement: Next resumes a section already in progress

`professor:next` SHALL prefer the 🔄 In progress section over any ⬜ Not started section. When
only a new section would be started, it SHALL first ask the learner to finish the in-progress one
with `professor:done`. When no section is in progress, it SHALL load the first ⬜ section.

#### Scenario: In-progress section is resumed
- **WHEN** the syllabus has one 🔄 section and later ⬜ sections
- **THEN** `next` loads the 🔄 section and asks the learner to complete it with `professor:done`
  before starting a new one

#### Scenario: No section in progress starts the first todo section
- **WHEN** every section is either ✅ or ⬜
- **THEN** `next` loads the first ⬜ section
