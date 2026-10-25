# release-uat-checklist Specification

## Purpose

Define the committed manual UAT checklist for the beta release gate: macOS, a real provider and the
local bridge, covering both release flows, the beta report export and the eight deferred RON-169
checks, with a pass/fail line for every item.

## Requirements
### Requirement: A committed manual UAT checklist for the beta release gate

`docs/release/UAT-CHECKLIST.md` SHALL exist and SHALL describe a manual run on macOS with a real
provider, the local bridge and a real browser. It SHALL state prerequisites (Node version, real
provider key or signed-in agent CLI, clean `PROFESSOR_HOME`, release version under test) and SHALL
give every item a pass/fail line plus a field for the observed result.

#### Scenario: Checklist has runnable prerequisites

- **WHEN** a reviewer opens `docs/release/UAT-CHECKLIST.md`
- **THEN** it names macOS, the Studio + bridge startup command, the real provider setup, the app
  version field and the date/tester fields before the first check

#### Scenario: Every item is recordable

- **WHEN** a reviewer works through the checklist
- **THEN** each item has a checkable pass/fail line and a place to record evidence or notes

### Requirement: The checklist covers both release flows end to end

The checklist SHALL include one item per stage of the generated-course flow (new course, lesson,
quiz, tutor, workspace run with the one-time local-machine acknowledgement, revision with attempt
history) and one item per stage of the Playwright-template flow (five pre-flight items, five lessons,
capstone, real own-project Playwright run, external evidence, R1–R7 review, revise to
`course_complete`), plus the beta report export. Each item SHALL state the expected observable result
on macOS with a real provider.

#### Scenario: Generated-course stages are all present

- **WHEN** the checklist headings are read
- **THEN** every generated-course stage from new course through revision appears with its own
  pass/fail line

#### Scenario: Template and external-evidence stages are all present

- **WHEN** the checklist headings are read
- **THEN** the pre-flight gate, template lessons, capstone, external evidence, R1–R7 review and
  revise loop appear with their own pass/fail lines

#### Scenario: Beta report export is verified

- **WHEN** the reviewer reaches the export item
- **THEN** the expected result describes a downloaded, validated beta report file, confirms that
  nothing was uploaded, and says the report counts events from both flows

### Requirement: The eight deferred manual checks from RON-169 are included

The checklist SHALL include the 8 manual checks deferred from RON-164 and RON-165 with their expected
results: real-provider Vietnamese tutor review; real local run showing `Local machine` plus the
one-time acknowledgement; starting the Playwright template in a real browser; running Playwright in
the reviewer's own project and submitting real output; real-provider review against R1–R7 for a weak
and a strong spec; the full revise loop ending in `course_complete`; upload/clipboard edge cases; and
the Vietnamese variant.

#### Scenario: All eight deferred checks are present

- **WHEN** the checklist is compared with RON-169
- **THEN** all eight deferred checks appear, each with a pass/fail line and its expected result

#### Scenario: Vietnamese variant is covered

- **WHEN** the reviewer runs the Vietnamese variant item
- **THEN** the expected result covers the Vietnamese checklist, lessons, rubric labels and evidence
  form copy

### Requirement: The checklist states what remains manual

The checklist SHALL state that it is run by the release owner, not in CI, and SHALL not claim that
the automated E2E suite replaces it. Real-provider behaviour, visual judgement and platform-specific
runner behaviour SHALL stay manual.

#### Scenario: Manual-only scope is explicit

- **WHEN** a reviewer reads the checklist introduction
- **THEN** it says the run is manual, owner-executed, and complementary to `npm run test:e2e`

