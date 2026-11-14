# course-worktree Specification

## Purpose
Define how a programming course folder becomes an isolated git worktree: its own `learning/<slug>`
branch that holds only course files, with reattach, refusal, rollback and idempotency guarantees.

## Requirements

### Requirement: A new course branch starts with no history and no host files

When `skillforce create <slug> --kind programming` creates a branch that does not exist yet, the
resulting `learning/<slug>` branch SHALL be an orphan branch: it SHALL have no parent commit, no
commit shared with the host branch, and its worktree SHALL contain none of the host repository's
tracked files.

#### Scenario: Host files are absent from the new course worktree

- **WHEN** the learner runs `create sql --kind programming` in a repo whose HEAD tracks `README.md` and `src/app.js`
- **THEN** `learning/sql/` exists and contains neither `README.md` nor `src/app.js`

#### Scenario: The course branch shares no commit with the host branch

- **WHEN** the course branch has just been created and before any course file is saved
- **THEN** `learning/sql` has no commits, and after `save` its commits contain only course files and none of the host branch's commits

#### Scenario: Saving the course creates the branch history

- **WHEN** the learner runs `save` for a course on a newly created orphan branch
- **THEN** the course files are committed on `learning/<slug>` and the host branch's history is unchanged

### Requirement: Course worktrees are created on any supported git version

`create` SHALL produce the same orphan-branch result on every git version the project supports
(git 2.25 and newer). Where a single git invocation provides the orphan worktree it SHALL be used;
otherwise an equivalent multi-step procedure SHALL produce the same repository state.

#### Scenario: Native orphan worktree support

- **WHEN** the installed git supports creating an orphan worktree in one step
- **THEN** `create` uses it and the resulting branch and worktree are orphan and registered

#### Scenario: Fallback produces an identical result

- **WHEN** the fallback path is forced through its test hook on any git version
- **THEN** the course branch is orphan, registered as a worktree, and the host repository status stays clean

### Requirement: RON-249 worktree guarantees are preserved

Course creation SHALL keep every existing guarantee: registration verified against
`git worktree list --porcelain`, idempotent re-run, unchanged reattach of an existing
`learning/<slug>` branch, refusal of an occupied non-worktree directory, complete rollback on
failure, `learning/` excluded from the host status, and a clean host `git status --porcelain`.

#### Scenario: Re-run on an existing course worktree

- **WHEN** `create` is run again for a slug that is already a registered course worktree
- **THEN** it reports the course as reused and changes nothing

#### Scenario: Reattach after the worktree was removed

- **WHEN** the course worktree was removed but its `learning/<slug>` branch and commits still exist
- **THEN** `create` reattaches that branch unchanged and the committed course files are present again

#### Scenario: Refuse a foreign directory

- **WHEN** `learning/<slug>` exists as a plain directory that is not the course worktree
- **THEN** `create` fails with a message naming the directory and leaves its contents untouched

#### Scenario: Roll back a failed creation

- **WHEN** git cannot create the branch or worktree
- **THEN** the directory is removed, no course worktree remains registered, a branch created by this attempt is deleted, and nothing is kept

#### Scenario: Host status stays clean

- **WHEN** a programming course has been created and saved
- **THEN** `git status --porcelain` in the host repository is empty

### Requirement: A programming course still requires a git repository with a commit

`create <slug> --kind programming` SHALL fail with a user-facing message when the working directory
is not inside a git repository, or when the repository has no commits, and SHALL change nothing.

#### Scenario: Not a git repository

- **WHEN** the learner runs `create sql --kind programming` outside a git repository
- **THEN** the command fails and asks them to `git init` and make a first commit

#### Scenario: Repository without commits

- **WHEN** the repository exists but has no commits
- **THEN** the command fails with a message asking for a first commit and creates no worktree

### Requirement: Non-programming course kinds are unaffected

Course kinds other than `programming` SHALL continue to be plain folders without git involvement.

#### Scenario: A conceptual course is a plain folder

- **WHEN** the learner runs `create lich-su-viet-nam --kind conceptual`, inside or outside a git repository
- **THEN** `learning/lich-su-viet-nam/` is created as a plain directory with no branch and no worktree
