# Changelog

All notable changes to **ronin-skillforce** are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0-beta.0] — 2026-11-15

### Changed

- **License: Apache-2.0** from this release (was MIT). Adds a `NOTICE` file with attribution,
  third-party licences and a trademark note. Version 0.1.0 and all `course-professor` releases stay MIT.


### Added

- `skillforce studio --autostart on|off` starts Professor Studio at login on macOS through a
  LaunchAgent (`com.ronin-skillforce.studio`), pins the ports the first time so the URL and pairing
  URL stop changing, and refuses to install from an npx cache (use a global install).
- `skillforce studio --status` reports whether Studio runs, its URL and pairing URL, the autostart
  state and the log path (`${PROFESSOR_HOME:-~/.professor}/logs/studio.log`). `--stop` stops it —
  through launchd when the login item is installed, otherwise through the pid in
  `${PROFESSOR_HOME:-~/.professor}/studio.json` — and never signals a process that is not Studio.
- `skillforce studio --strict-port` fails instead of moving to another port when one is busy.

### Changed

- Courses live only in `learning/<slug>/`. The legacy `courses/` location is no longer read:
  `professor:capstone` and `professor:syllabus` now find every course created since 0.1.0, and the
  CLI and PreCompact hook look in `learning/` only. If you still have a pre-0.1.0 `courses/<slug>/`
  folder, move it to `learning/<slug>/` by hand — nothing is migrated automatically.

### Fixed

- New programming courses are created on an **orphan** branch: `learning/<slug>/` holds only course
  files, never a copy of your project, and shares no history with it.
- `professor:archive` keeps everything: the whole course is copied to `.course_archive/<slug>/`
  (never overwritten), course commits stay on branch `archive/<slug>`, and nothing is removed before
  the copy is verified (`skillforce archive`).
- `professor:done` no longer loops: Coach asks you to say "confirm"; the section verdict is recorded
  with `skillforce verdict` in the format the CLI reads, and the capstone status line now updates.
- `professor:hint` and `professor:stuck` refuse during the capstone phase; `professor:next` resumes
  an in-progress section instead of skipping it.
- Re-running `setup` now refreshes the files the plugin installed (a changed file is kept once as
  `.bak`); Gemini CLI, OpenCode and Cursor get current instructions, an inline Coach flow, and
  Gemini commands receive their arguments.
- `skillforce studio` polls and prints `http://127.0.0.1:<port>` instead of `http://localhost:<port>`,
  matching the loopback bind. On macOS `localhost` resolves to `::1` first, so a health poll could
  reach another dev server holding `[::1]:3000` and fail with "did not become healthy … (HTTP 404)".
- `skillforce studio` checks both loopback families before starting. A busy default port moves to the
  next free one with a notice, a busy `--port` / `--api-port` fails with a message naming the port and
  the flag to change, and a health answer that is not Studio says another app is on that port.
- `skillforce web` prints its UI URL on `127.0.0.1` (legacy Vite dev is unchanged).

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
