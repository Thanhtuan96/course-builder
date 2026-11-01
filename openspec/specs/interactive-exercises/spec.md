# interactive-exercises Specification

## Purpose
Define how Studio turns declarative exercise data into gradable in-page practice for non-code
courses: a typed widget surface, deterministic answer-preserving journal-entry grading with layered
hints, and attempt history that survives a reload in every storage adapter.

## Requirements

### Requirement: Exercises are rendered from declarative, validated data

Studio SHALL render interactive exercises only from a validated, declarative specification that
names a widget `type` and carries the exercise content as data. Studio MUST NOT execute, evaluate or
inject template or learner text as code or markup, MUST NOT use `dangerouslySetInnerHTML` with
spec-derived strings, and MUST NOT use an iframe, sandbox or model-generated HTML to host a widget.

#### Scenario: An unknown widget type does not break the lesson

- **WHEN** a lesson carries an exercise whose `type` has no registered widget
- **THEN** the lesson page still renders, that exercise is skipped, and the remaining exercises are shown

#### Scenario: Spec text is escaped, never executed

- **WHEN** an exercise prompt, account name or hint contains markup such as `<img src=x onerror=...>`
- **THEN** the text is displayed literally in the page and no script, image request or handler runs

### Requirement: A lesson with interactive exercises replaces the code editor

When a lesson has at least one interactive exercise, the lesson's workspace area SHALL show the
exercise surface instead of the code editor, and the surface MUST be reachable from the lesson's tab
strip regardless of the course `kind`. A lesson without interactive exercises MUST behave exactly as
before this change.

#### Scenario: Exercises replace the code editor in the lesson

- **WHEN** a learner opens a lesson that has one or more interactive exercises
- **THEN** the exercise surface is rendered with one widget per exercise, and no code editor is mounted

#### Scenario: A programming lesson without exercises keeps the code editor

- **WHEN** a learner opens a programming-course lesson that has no interactive exercises
- **THEN** the workspace tab shows the code editor exactly as it did before this change

#### Scenario: A non-programming lesson without exercises has no exercise surface

- **WHEN** a learner opens a non-programming lesson that has no interactive exercises
- **THEN** no exercise surface is offered and the Practice and Tutor tabs behave as before

### Requirement: The journal-entry widget accepts compound entries from a chart of accounts

The `journal-entry` widget SHALL present debit (借方) rows and credit (貸方) rows, each row pairing
an account chosen from the exercise's chart of accounts (勘定科目) with a yen amount. It SHALL allow
several rows on each side, SHALL let the learner add and remove rows, SHALL show each account's
Japanese name together with its gloss in the UI language, and SHALL accept only positive integer yen
amounts.

#### Scenario: The learner builds a compound entry

- **WHEN** the learner adds a second debit row, a second credit row, chooses accounts and enters amounts on all four rows
- **THEN** all four rows are kept in the submitted entry and the entry can be checked

#### Scenario: Accounts come from the exercise chart with a localized gloss

- **WHEN** the learner opens an account selector
- **THEN** every option is an account from the exercise chart, the Japanese name is shown unchanged, and the gloss is shown in the current UI language

#### Scenario: Non-integer or empty amounts are refused locally

- **WHEN** the learner enters a decimal, a negative, zero or empty amount and presses Check
- **THEN** the widget reports which rows have an invalid amount and does not save an attempt

### Requirement: Every exercise chart offers plausible distractors

The chart attached to a journal-entry exercise SHALL contain at least six accounts, SHALL include at
least four accounts that the answer key does not use, and SHALL include the partner of every
answer-key account that belongs to a confusable pair (現金/普通預金, 売掛金/買掛金, 売上/仕入,
借入金/預り金). A specification whose chart breaks the minimum SHALL be rejected.

#### Scenario: The chart offers six accounts with four outside the key

- **WHEN** an exercise's chart is inspected
- **THEN** it lists at least six accounts and at least four of them do not appear in that exercise's answer key

#### Scenario: Charts carry the partner confuser

- **WHEN** an answer key uses an account that belongs to one of the confusable pairs
- **THEN** its partner is also offered in that exercise's chart

#### Scenario: A chart below the minimum is rejected

- **WHEN** a specification lists five accounts for a journal-entry exercise
- **THEN** validation rejects the specification instead of the widget rendering it

### Requirement: Journal-entry grading is deterministic and order-independent

Grading SHALL be a pure function of the exercise answer key and the submitted rows, with no model
call and no network access. An entry is correct if and only if the debit total equals the credit
total and the multiset of `(side, account, amount)` in the submission equals the answer key's, so row
order and row count of duplicates do not matter and amounts are integer yen.

#### Scenario: A correct entry passes in any row order

- **WHEN** the learner submits exactly the answer key's rows in a different order (including compound entries)
- **THEN** the attempt is graded correct

#### Scenario: An unbalanced entry fails

- **WHEN** the debit total differs from the credit total, with every account otherwise valid
- **THEN** the attempt is graded incorrect and the feedback names the imbalance

#### Scenario: A wrong account is reported without naming the right one

- **WHEN** the entry balances but uses an account that the answer key does not use on that side
- **THEN** the attempt is graded incorrect and the feedback says an account on that side is not right

#### Scenario: A wrong amount is reported without naming the right one

- **WHEN** the entry balances and every account matches but one amount differs from the answer key
- **THEN** the attempt is graded incorrect and the feedback says that row's amount is off

#### Scenario: Repeated rows must be repeated in the answer key

- **WHEN** the learner submits two identical rows where the answer key has one
- **THEN** the attempt is graded incorrect

### Requirement: Feedback and hints never reveal the answer

Exercise feedback SHALL name only the side and the kind of problem. It MUST NOT state or imply the
correct account, the correct amount, the correct combination, or the correct side for a given
account. Hints SHALL be authored in the exercise data, SHALL be at most three layers, SHALL unlock
one layer per request, and the UI MUST NOT offer any control that shows the answer.

#### Scenario: Incorrect feedback contains no answer

- **WHEN** the learner submits an incorrect entry and any amount of hints is revealed
- **THEN** no text on the exercise surface names a correct account or a correct amount for the entry

#### Scenario: Hints unlock one layer at a time

- **WHEN** the learner requests a hint
- **THEN** exactly one further hint layer becomes visible and the hint control is disabled after the last layer exists

#### Scenario: Hints are authored in the variant's language

- **WHEN** the English and Vietnamese variants of an exercise are inspected
- **THEN** every hint is written in that variant's UI language, both variants have the same number of layers, and Japanese appears only as an account-category word

#### Scenario: Correct feedback does not echo the key

- **WHEN** an attempt is graded correct
- **THEN** the surface confirms the entry is correct without rendering any account or amount the learner did not enter

### Requirement: Exercise attempts persist and survive a reload

Each checked attempt SHALL be written through the repository API as a row carrying the exercise id,
the submitted rows and the grading result, and the surface SHALL read attempts back per exercise so
the learner sees a small attempt history. The behaviour MUST hold in the IndexedDB, memory and
SQLite-backed adapters, with no adapter-specific UI branch.

#### Scenario: A checked attempt is stored with its rows and result

- **WHEN** the learner checks an entry
- **THEN** one attempt row is written with the exercise id, the submitted rows and the grading result

#### Scenario: Attempt history survives a reload

- **WHEN** the page is reloaded and the exercise is opened again
- **THEN** the stored attempts are listed for that exercise in chronological order

#### Scenario: Every adapter stores and returns attempts

- **WHEN** the same check-and-reload flow runs against the memory adapter, the IndexedDB adapter and a SQLite-backed remote adapter
- **THEN** each adapter returns the attempt with the same rows and result

### Requirement: The exercise surface is fully localized

Every new learner-facing string SHALL exist in both the `en` and `vi` catalogs with the same keys,
and the widget chrome, feedback and hint controls SHALL follow the current UI language. Japanese
account names SHALL stay Japanese in both languages.

#### Scenario: Both catalogs carry the same exercise keys

- **WHEN** the `en` and `vi` catalogs are compared
- **THEN** the exercise namespace has identical flattened keys in both

#### Scenario: Switching language relabels the widget only

- **WHEN** the learner switches the UI language
- **THEN** labels, feedback and hint controls change language while the Japanese account names stay unchanged
