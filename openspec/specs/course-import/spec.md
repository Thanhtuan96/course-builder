# course-import Specification

## Purpose
Bring a `learning/<slug>/` course folder into Studio storage from the CLI: what each source file
becomes, what a re-import may and may not change, and what `--dry-run` reports before writing.

## Requirements

### Requirement: Exercise files become the lesson's workspace files

`skillforce import` SHALL read `learning/<slug>/exercises/NN-*.<ext>` and attach each file to the
lesson whose position is `NN`, as a workspace file whose path is the file name and whose language
comes from the extension through Studio's language map. A `.md` exercise SHALL be attached the same
way with no language.

#### Scenario: A programming course imports one exercise per lesson

- **WHEN** a course has `exercises/01-project-anatomy-and-auto-configuration.java` and `exercises/02-warm-up.py` and at least two lessons
- **THEN** after import the first lesson's stored workspace files contain `01-project-anatomy-and-auto-configuration.java` with language `java`, and the second lesson's contain `02-warm-up.py` with language `python`

#### Scenario: A conceptual exercise is attached with no language

- **WHEN** a conceptual course has `exercises/01-balance-the-ledger.md`
- **THEN** after import the matching lesson stores that file with path `01-balance-the-ledger.md` and no language

#### Scenario: An exercise numbered past the last lesson is not attached

- **WHEN** a course has two lessons and `exercises/07-extra.py`
- **THEN** import reports the file but no lesson stores it, and the run does not fail

### Requirement: Re-import keeps learner work and refreshes what it wrote

Import SHALL insert a workspace file that does not exist yet and SHALL update an existing one only
while its current content still equals the content the previous import wrote. Any other existing
file MUST be left unchanged and reported as kept.

#### Scenario: An untouched imported file follows the source

- **WHEN** an exercise source file changed since the last import and the learner never edited the stored copy
- **THEN** re-import replaces the stored content with the new source content

#### Scenario: A learner-edited file survives

- **WHEN** the learner edited the imported file in Studio and re-import runs
- **THEN** the stored content is exactly the learner's version and the summary reports "kept your version of <path>"

#### Scenario: A file added to the course is inserted

- **WHEN** `exercises/03-loop.py` appears after a first import
- **THEN** re-import inserts it for lesson 3 without touching the files of other lessons

### Requirement: Import never deletes learner content

Import MUST NOT remove a stored workspace file that has content, that a run result refers to, or
that a previous import wrote — including when the source exercise file no longer exists in the
course folder. The only removal import performs is the empty seed described below.

#### Scenario: A source exercise disappears

- **WHEN** `exercises/02-warm-up.py` is removed from the course folder and import runs again
- **THEN** lesson 2 still has its stored workspace file and import reports no deletion

#### Scenario: A file the learner typed into is never removed

- **WHEN** a lesson that receives an exercise file also has a stored `main.js` with the learner's code
- **THEN** `main.js` is still stored after import and the summary mentions it was kept

### Requirement: Import clears the empty seed Studio made before the exercise arrived

When import attaches at least one exercise file to a lesson, it SHALL remove that lesson's stored
workspace files that are empty, that no run result refers to, and that import did not write. Any
file with content, any file a run result refers to, and any file import wrote SHALL be kept and
mentioned in the summary.

#### Scenario: The empty editor that was opened before import is gone

- **WHEN** the learner opened lesson 1 in Studio first, so an empty `main.java` row exists with no run result, and import then attaches `exercises/01-project-anatomy-and-auto-configuration.java` to that lesson
- **THEN** the lesson's stored files contain the exercise file and no empty `main.java`, and `main.java` no longer appears in the workspace

#### Scenario: An empty file with a run result is kept

- **WHEN** the lesson's empty `main.java` has a run result and import attaches an exercise file
- **THEN** `main.java` is still stored and the summary says it was kept because it has run results

#### Scenario: A lesson without exercise files is left alone

- **WHEN** import attaches no exercise file to a lesson that has an empty `main.js`
- **THEN** that lesson's stored files are exactly as they were

### Requirement: Dry-run lists the exercise files of every lesson

With `--dry-run` the command SHALL print, per lesson, each exercise file it would attach, update or
keep, and SHALL write nothing to Studio storage.

#### Scenario: Dry-run plans without writing

- **WHEN** a course with exercise files is imported with `--dry-run`
- **THEN** the output lists each lesson's exercise file name with whether it is new, updated or kept, and the store still has no workspace rows for that course

### Requirement: Import summary counts exercise files

The import summary SHALL report how many exercise files were attached or kept, so a learner can
tell the exercises reached Studio.

#### Scenario: Summary mentions exercises

- **WHEN** import attaches two exercise files
- **THEN** the summary for that course includes a count of 2 exercise files
