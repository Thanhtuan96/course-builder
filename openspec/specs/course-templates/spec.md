# course-templates Specification

## Purpose
Define bundled, pre-written course templates as a first-class way to start a course in Studio: a
card on the New Course page, a provider-free seed through the repository API, and one complete,
reviewable topic per template — delivered here as the Boki 3級 仕訳 journal-entry course.

## Requirements

### Requirement: Bundled templates are offered as cards on the New Course page

The New Course page SHALL list each bundled template as a card that names the course it creates.
Starting a card SHALL create the course, its lessons, its lesson content and its exercises through
the repository API and navigate to the new course, without requiring a configured provider, an API
key or a model call.

#### Scenario: A template card is usable with no provider configured

- **WHEN** the learner opens the New Course page with no provider configured
- **THEN** the template card is enabled once its checklist is satisfied and no provider error is shown

#### Scenario: Starting the card creates and opens the course

- **WHEN** the learner starts a template card
- **THEN** a course is created with its lessons, lesson content and exercises, and the learner is taken to that course

#### Scenario: Template card copy follows the UI language

- **WHEN** the UI language is Vietnamese or English
- **THEN** the card's title, description and checklist are rendered in that language

### Requirement: The Boki 3級 — 仕訳 template is complete and accounting-correct

The bundled template SHALL contain three lessons — 現金・預金, 商品売買・掛取引 and 経費・その他 —
each with three to five `journal-entry` exercises, each exercise carrying a prompt, a chart of
accounts, an answer key and at most three hint layers. Entries SHALL follow 簿記3級 conventions
(three-account method for merchandise: cash sales credit 売上, credit sales use 売掛金, credit
purchases use 買掛金, returns reverse the original entry) with integer yen amounts.

#### Scenario: The template has the agreed lessons and exercise counts

- **WHEN** the template data is inspected
- **THEN** it has exactly three lessons named 現金・預金, 商品売買・掛取引 and 経費・その他, each with three to five exercises

#### Scenario: Answer keys follow the three-account method

- **WHEN** a merchandise exercise is inspected
- **THEN** a cash sale credits 売上, a credit sale debits 売掛金 and credits 売上, and a credit purchase debits 仕入 and credits 買掛金

#### Scenario: Every exercise is gradable and self-contained

- **WHEN** an exercise is inspected
- **THEN** its answer key balances, every account it uses is in its chart of accounts with a gloss, and its amounts are positive integers

#### Scenario: Every chart offers plausible distractors

- **WHEN** an exercise's chart is inspected
- **THEN** it lists at least six accounts, at least four of them are outside that exercise's answer key, and every key account from the confusable pairs comes with its partner

#### Scenario: Hints are layered, localized and give no answer

- **WHEN** an exercise's hints are inspected in either variant
- **THEN** it has between one and three non-empty layers written in that variant's UI language, and no layer contains an answer-key account name or amount

#### Scenario: Compound entries are exercised

- **WHEN** the template's exercises are inspected
- **THEN** at least one exercise has two or more rows on one side of the entry

### Requirement: Seeding a template is provider-free and idempotent

A template SHALL be seeded at most once, identified by its template-scoped course external id
(`template:boki-journal-3` for the Boki course) and never by title. The first seed fixes the course
content language to the client's UI language at that moment; a later start in another language SHALL
return that existing course instead of creating a second variant. Re-seeding MUST NOT duplicate
lessons, lesson content or exercises.

#### Scenario: A second start reuses the existing course

- **WHEN** the learner starts the same template card twice
- **THEN** the second start returns the existing course and the course count stays one

#### Scenario: The first seed fixes the language variant

- **WHEN** the learner starts the template for the first time while the UI language is Vietnamese
- **THEN** the created course and its lesson content are Vietnamese

#### Scenario: A later start in another language keeps the existing course

- **WHEN** the learner switches the UI to English and starts the same template card again
- **THEN** the existing Vietnamese course is returned, the course count stays one, and no English course is created

#### Scenario: Exercises keep stable identity across re-seeds

- **WHEN** the template is seeded and inspected again
- **THEN** every exercise carries a stable template-scoped external id and attempts remain attached to it

### Requirement: Template content ships in both UI languages

Each bundled template SHALL ship an English and a Vietnamese variant with the same structure and
key set, so a course created from either variant renders the same widgets. Japanese account names
SHALL be identical in both variants.

#### Scenario: Variants have the same shape

- **WHEN** the English and Vietnamese template variants are compared
- **THEN** lesson count, exercise count per lesson, exercise types and hint counts are identical

#### Scenario: Japanese account names are not translated

- **WHEN** the chart of accounts of both variants is compared
- **THEN** every account's Japanese name is identical, while its gloss differs by language
