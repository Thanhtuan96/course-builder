# Changelog

All notable changes to **ronin-skillforce** are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-11-14

First release under the new name. Earlier versions were published as `course-professor`
(1.x, now deprecated on npm); their history is in
[`docs/history/CHANGELOG-course-professor.md`](docs/history/CHANGELOG-course-professor.md).
This release also ships everything listed there under `[Unreleased]` (for example `web` now serves
Studio only).

### Changed

- Package renamed to `ronin-skillforce`; the CLI command is `skillforce`
  (`npx ronin-skillforce <command>`). `course-professor` and `professor` still work as aliases.
- Version reset to `0.1.0`.

### Added

- `skillforce create <slug> --kind <kind>` / `skillforce save <slug>` — programming courses are
  verified git worktrees on `learning/<slug>`, rolled back on failure, and committed as you go.
- `skillforce context [slug] --json` / `skillforce trail <slug> --stdin` — Coach gets the real course
  instead of guessing paths, and every review round is kept in `LEARNING-LOG.md`.
