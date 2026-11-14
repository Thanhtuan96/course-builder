# lesson-workspace Specification

## Purpose
Define what a lesson's workspace opens with — stored files versus the lesson Markdown seed — which
lessons offer a workspace surface, and how Studio declines to run an exercise that belongs to the
learner's own project.

## Requirements

### Requirement: Stored workspace files of an imported lesson win over the Markdown seed

When a lesson has stored workspace files written by import, Studio SHALL open them, including when
their content is blank or identical to a code fence in the lesson Markdown. It MUST NOT replace them
with the Markdown skeleton or treat them as a stale reference seed.

#### Scenario: Imported exercise opens instead of an empty editor

- **WHEN** a lesson has an imported workspace file `01-project-anatomy-and-auto-configuration.java` and its Markdown Exercise section has no fenced code block
- **THEN** the workspace opens that file with its content and stores nothing new

#### Scenario: An imported blank file is not re-seeded

- **WHEN** the imported exercise file is empty and the lesson has never run
- **THEN** the workspace still opens the imported file rather than an empty `main.<ext>` seed

#### Scenario: An imported file matching a lesson fence is kept

- **WHEN** the imported file's content equals a fenced block in the lesson Markdown and the learner has not edited it
- **THEN** the workspace opens the imported file and does not re-seed or delete it

#### Scenario: A Studio-generated lesson seeds as before

- **WHEN** a lesson has only rows Studio seeded itself (no imported rows) and its skeleton changed in the lesson Markdown
- **THEN** the workspace re-seeds from the skeleton exactly as it did before this change

### Requirement: The lesson opens on the imported exercise file

When a lesson has imported workspace files, the workspace SHALL open on one of them as the active
file, ahead of any other stored file that was kept.

#### Scenario: A kept file does not steal the editor

- **WHEN** a lesson keeps a non-empty `main.js` next to the imported `02-warm-up.py`
- **THEN** the workspace opens `02-warm-up.py` and `main.js` is available but not active

#### Scenario: Several imported files keep their numeric order

- **WHEN** a lesson has imported `01-a.java` and `02-b.java`
- **THEN** the workspace orders both imported files by path and opens `01-a.java`

### Requirement: Lessons with workspace files offer a workspace surface

A lesson that has stored workspace files SHALL offer its workspace surface whatever the course kind,
so a `.md` exercise of a conceptual, quantitative or skill course is visible. A lesson with no
exercise and no workspace files MUST behave as before.

#### Scenario: A conceptual exercise is visible

- **WHEN** a conceptual course lesson has the imported file `01-balance-the-ledger.md`
- **THEN** the lesson offers an exercise/workspace tab that shows that file's text

#### Scenario: A conceptual lesson without files keeps no surface

- **WHEN** a conceptual course lesson has no interactive exercise and no workspace files
- **THEN** no workspace tab is offered and Practice/Tutor behave as before

#### Scenario: Interactive exercises still win

- **WHEN** a lesson has both a renderable interactive exercise and imported workspace files
- **THEN** the exercise surface is shown, as before this change

### Requirement: Studio explains exercises that run in the learner's own project

When the active exercise cannot run in Studio's runners — its language has no runner, or its file or
the lesson lecture names a build tool such as `./mvnw`, `./gradlew`, `npm run`, `pnpm run`, `yarn`,
`make`, `docker compose` — Studio SHALL show a notice that the exercise runs in the learner's own
project, with the command it found when there is one, and MUST NOT start a run or surface a raw
runner error.

#### Scenario: A Spring Boot exercise explains itself

- **WHEN** the active file mentions `./mvnw spring-boot:run`
- **THEN** the Run area shows "This exercise runs in your own project" with that command and no run starts

#### Scenario: A written exercise has nothing to run

- **WHEN** the active file is a `.md` exercise with no language
- **THEN** the Run area explains that this exercise is not run in Studio and no run starts

#### Scenario: A runnable exercise still runs

- **WHEN** the active file is a plain `.py` or `.js` exercise that names no build tool
- **THEN** Run and Check work exactly as before this change

### Requirement: The lecture supplies the command when the file does not

When the exercise file itself names no command but the lesson lecture does, Studio SHALL show the
command taken from the lecture.

#### Scenario: Command found only in the lecture

- **WHEN** the exercise file has no build-tool line and the lesson lecture says `./mvnw spring-boot:run`
- **THEN** the notice shows `./mvnw spring-boot:run`
