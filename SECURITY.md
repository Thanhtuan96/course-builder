# Security Policy

Professor runs on the learner's own machine: a browser app, a loopback bridge server and a local
code runner. This document describes that boundary and how to report a problem in it.

## Supported versions

| Version | Supported |
| --- | --- |
| `1.6.x` (Professor Studio, `next` dist-tag) | Yes |
| `1.5.x` (latest stable, CLI only) | Yes |
| Older versions | No |

Fix releases ship on the `next` and `latest` dist-tags of `course-professor`.

## What runs where

Studio is three separate things. Knowing which one is responsible for what makes a report easier
to route.

1. **Browser app (Studio SPA).** A static Vite + React build that runs in your browser. AI provider
   keys you enter live in `localStorage` and are sent only to the provider you selected. Backups are
   plain JSON and never include keys.

2. **Bridge server (`web/`).** An Express server started by `course-professor studio` or
   `course-professor web`. It binds to loopback, accepts only allowlisted origins, and requires the
   pairing token (`X-Studio-Token`) on every route. The bridge is what spawns your own agent CLIs —
   Claude Code, OpenCode, Cursor Agent, Gemini, Antigravity or Ollama — in print/stream mode, in a
   temporary working directory, with per-agent restricted flags. It never passes
   `--dangerously-skip-permissions`, and it never writes files from model output.

3. **Local code runner (`web/studio-runner.js`).** A router mounted behind the same pairing token and
   origin allowlist. It writes the files you submit to `<workspacesRoot>/<courseSlug>/` (default
   `~/.professor/workspaces/`), validates slugs and relative paths, and runs an allowlisted
   toolchain with `spawn(..., { shell: false })`, a 20 s timeout and a 200 KB output cap, killing the
   process tree on timeout or disconnect. The runner does **not** start agent CLIs.

The local code runner executes your code with your own OS user permissions and your own network
access. It is **not a sandbox**: the allowlist, path confinement, timeout and output cap reduce
accidental damage and runaway output, but they are not a security boundary. Run code you trust.

## Reporting a vulnerability

Please report privately — do **not** open a public issue, pull request or discussion for a
suspected vulnerability.

- Use GitHub's private vulnerability reporting on the repository:
  <https://github.com/professor-skills/course-learning-plugin/security/advisories/new>.
- If that form is unavailable, contact the maintainers through the repository's listed maintainer
  accounts and ask for a private channel before sharing details.

Include:

- the version you ran (`npx course-professor --version`) and your OS/Node version;
- which of the three components above is affected (browser app, bridge, runner);
- the steps to reproduce, including the command you started and the settings involved;
- what you expected versus what happened, and the impact you believe it has.

Never include real API keys, pairing tokens or personal data in a report; rotate the pairing token
with `course-professor web --rotate-token` if you think it leaked.

## Scope

In scope: the browser app, the bridge server (token handling, CORS/origin checks, process
spawning), the local code runner (path confinement, command allowlist, timeouts, output limits), the
CLI help and setup flow, and prompt-injection or data-exfiltration paths that cross these
boundaries.

Out of scope: the deprecated legacy web UI (`--legacy` / `PROFESSOR_LEGACY=1`), which is scheduled
for removal and is reported by `course-professor doctor` as a failing check; issues that require an
attacker to already control your OS account, your browser profile or your agent CLI configuration;
and findings in third-party providers or agent CLIs themselves, which should be reported upstream.

We aim to acknowledge a report within a few days and to agree on a disclosure timeline with you.
Thank you for helping keep learners safe.
