# capstone-phase Specification

## Purpose
Defines what the capstone phase forbids and allows, and how `COURSE.md` reports the capstone's
status so the CLI, Studio and every command agree on whether the capstone is locked.

## Requirements

### Requirement: Hint and stuck refuse during the capstone phase

When every course section is ✅ Done and the capstone is unlocked, or `**Capstone status**` is 🔄
or ✅, `professor:hint` and `professor:stuck` SHALL refuse. They SHALL state that the rules differ
in the capstone phase and point the learner to `professor:discuss`.

#### Scenario: Hint is refused after the last section
- **WHEN** all sections are ✅ Done and the learner runs `professor:hint`
- **THEN** the command refuses with the capstone message and points to `professor:discuss`

#### Scenario: Stuck is refused while building the capstone
- **WHEN** `**Capstone status**` is 🔄 In progress and the learner runs `professor:stuck`
- **THEN** the command refuses with the capstone message and points to `professor:discuss`

#### Scenario: Hint still works before the capstone
- **WHEN** any course section is ⬜ or 🔄 and the capstone status is 🔒 Locked
- **THEN** `professor:hint` gives the next hint layer as before

### Requirement: The capstone status header and table row move together

When the last section is completed and when `capstone-review` ends, Professor SHALL update both
the `**Capstone status**` header line and the Capstone Project table row. `parseCapstoneStatus`
SHALL return the new status rather than a stale 🔒 Locked.

#### Scenario: Last section unlocks the capstone
- **WHEN** the final section is marked ✅ Done
- **THEN** the header and table row show 🔄 In progress and `parseCapstoneStatus` returns `active`

#### Scenario: Capstone review completes the course
- **WHEN** `capstone-review` ends with the 🏆 Course Complete verdict
- **THEN** the header and table row show ✅ Complete and `parseCapstoneStatus` returns `done`

#### Scenario: Stale header cannot hide an unlock
- **WHEN** the table row says 🔄 In progress while the header still says 🔒 Locked
- **THEN** the update step rewrites both to the same status
