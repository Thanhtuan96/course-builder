# product-boundary-docs Specification

## Purpose

Define the user-facing product boundary: which surface each entry point (CLI help, `init`/`setup`,
the READMEs, CHANGELOG) sends a new user to, how the bridge and the local code runner are described,
how the deprecated legacy web mode is presented, and what `SECURITY.md` promises about where code
runs.
## Requirements
### Requirement: Studio is the first documented entry point

Every entry point a new user can reach SHALL direct them to Professor Studio before any other web
surface, and SHALL state the Node requirement (22.5+) where the command is first introduced.

#### Scenario: Help names Studio and its Node requirement
- **WHEN** a user runs `node bin/cli.js help`
- **THEN** the output contains `npx course-professor studio` and `Node 22.5+`

#### Scenario: README introduces Studio before the manual bridge
- **WHEN** `README.md` is read top to bottom
- **THEN** the first occurrence of `course-professor studio` precedes the first occurrence of
  `course-professor web`

#### Scenario: Studio README introduces Studio before the manual bridge
- **WHEN** `studio/README.md` is read top to bottom
- **THEN** the first occurrence of `course-professor studio` precedes the first occurrence of
  `course-professor web`, and the manual bridge section is labelled as the alternative to the
  one-command path

#### Scenario: init and setup close with a Studio hint
- **WHEN** `course-professor init` or `course-professor setup <agent>` completes setup
- **THEN** one additional line recommends `npx course-professor studio` (Node 22.5+) without
  changing any platform-specific "Next steps" text

### Requirement: Help describes `web` as the Studio-only bridge server

The `web` command SHALL remain listed in CLI help, SHALL be described as the bridge server that
Studio uses by default, and SHALL NOT be described as "the web UI" or as an API-key flow. The
merged row SHALL keep `--production` documented as serving the prebuilt Studio, which requires a
build.

#### Scenario: Help describes web as a bridge
- **WHEN** a user runs `node bin/cli.js help`
- **THEN** the `web` command row contains "bridge" and its description does not contain "web UI"

#### Scenario: Help keeps the production mode documented
- **WHEN** a user runs `node bin/cli.js help`
- **THEN** the `web` command row mentions `--production` and says it serves the prebuilt Studio and
  requires a build

#### Scenario: Help does not advertise a cloud API-key path for web
- **WHEN** a user runs `node bin/cli.js help`
- **THEN** the `--cloud` flag is listed as deprecated and effective only with `--legacy`, its
  description does not mention an API-key prompt or a preferred cloud flow, and no example starts
  `web` as the primary UI

### Requirement: Legacy web mode is documented only as deprecated and opt-in

Any mention of legacy web mode in user-facing text SHALL call it deprecated and SHALL identify the
explicit opt-in (`--legacy` or `PROFESSOR_LEGACY=1`). No example command SHALL run `--legacy`.

#### Scenario: Help lists the legacy flag as deprecated
- **WHEN** a user runs `node bin/cli.js help`
- **THEN** the FLAGS section contains `--legacy` together with the word "deprecated" and
  `PROFESSOR_LEGACY=1`

#### Scenario: No example runs legacy mode
- **WHEN** the `EXAMPLES` section of `node bin/cli.js help` is inspected
- **THEN** no example line contains `--legacy` or starts the legacy web UI

#### Scenario: README explains the opt-in without recommending it
- **WHEN** `README.md` mentions legacy web mode
- **THEN** the same passage says it is deprecated, gives `--legacy` and `PROFESSOR_LEGACY=1` as the
  opt-in, and does not present it as the way to use the product

#### Scenario: CHANGELOG records the Studio-only default and corrects the beta note
- **WHEN** `CHANGELOG.md` is read
- **THEN** an `[Unreleased]` section states that `web` now serves Studio only, explains the
  `--legacy` / `PROFESSOR_LEGACY=1` opt-in, and says the `1.6.0-beta.1` "unchanged" note no longer
  applies, while the released `1.6.0-beta.1` section itself is not rewritten

### Requirement: Unsafe options appear only as warnings

No user-facing doc or help text SHALL recommend `--dangerously-skip-permissions` or
`STUDIO_ORIGINS=*`. Where documentation mentions them, it SHALL state that they are not used or
are unsafe.

#### Scenario: Help never mentions unsafe flags
- **WHEN** a user runs `node bin/cli.js help`
- **THEN** the output does not contain `--dangerously-skip-permissions` or `STUDIO_ORIGINS`

#### Scenario: Studio README keeps its warnings
- **WHEN** `studio/README.md` mentions `STUDIO_ORIGINS=*` or `--dangerously-skip-permissions`
- **THEN** the surrounding text says the wildcard origin is unsafe and that the bridge does not
  pass the skip-permissions flag

### Requirement: SECURITY.md states what runs where and how to report a vulnerability

The repository SHALL contain a `SECURITY.md` with a "What runs where" section that describes three
separate items: the browser app, the bridge server and the local code runner. The bridge is
loopback-only, guarded by a pairing token plus an origin allowlist, and is the component that
spawns the learner's own agent CLIs. The local code runner (`web/studio-runner.js`) writes the
learner's workspace to `<workspacesRoot>/<slug>/` and runs an allowlisted toolchain with
`shell: false`, a 20 s timeout and a 200 KB output cap behind the same pairing token and origin
allowlist; it SHALL NOT be described as driving agent CLIs, and SHALL NOT be presented as a
sandbox. The document SHALL describe how to report a vulnerability privately.

#### Scenario: What runs where keeps the bridge and the runner separate
- **WHEN** `SECURITY.md` is read
- **THEN** its "What runs where" section names the browser app, the loopback bridge with a pairing
  token, and the local code runner as distinct items, and attributes agent CLI spawning to the
  bridge rather than to the runner

#### Scenario: Runner is described by what it actually does
- **WHEN** `SECURITY.md` describes the local code runner
- **THEN** it says the runner writes the learner workspace under `<workspacesRoot>/<slug>/`, runs
  an allowlisted toolchain with `shell: false`, a 20 s timeout and a 200 KB output cap, and runs
  learner code with the learner's own permissions

#### Scenario: Sandbox is only ever negated
- **WHEN** `SECURITY.md` is searched for the word "sandbox"
- **THEN** every line containing it also negates it (for example "not a sandbox"); the document
  never claims the runner is sandboxed or is a security boundary

#### Scenario: Reporting path is documented
- **WHEN** `SECURITY.md` is read
- **THEN** it explains how to report a vulnerability privately instead of opening a public issue

#### Scenario: README links the security document
- **WHEN** `README.md` is read
- **THEN** it links to `SECURITY.md`

#### Scenario: Security document stays out of the published package
- **WHEN** the npm packlist is produced from `package.json` `files`
- **THEN** `SECURITY.md` is not added to that allowlist and the existing packlist assertion is
  unchanged

### Requirement: Help output is verified through the real binary

The CLI help contract SHALL be covered by a test that spawns the real entry point rather than
importing internals.

#### Scenario: Test spawns bin/cli.js
- **WHEN** `npm test` runs
- **THEN** `test/cli-help.test.js` spawns `process.execPath` with `bin/cli.js help`, asserts exit
  code 0, and verifies the boundary wording, with test names containing `RON-167`

#### Scenario: No internal refactor required
- **WHEN** the help test is written
- **THEN** `printUsage()` remains unexported and CLI behavior, flags, ports and output of
  `bin/commands/web.js` and `bin/commands/studio.js` are unchanged

