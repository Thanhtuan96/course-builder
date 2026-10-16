# Task brief: Phase 37 — npm release packaging for `course-professor@1.6.0-beta.1` (DO NOT PUBLISH)

Own git worktree from `feat/studio-local-first`. Phase 35 runs in parallel on `studio/src/**` and `studio/README.md` — do not
touch those. Small conventional commits. **Never run `npm publish`, `npm login`, `git push` or create remote releases** —
the orchestrator/user will publish after review.

## Evidence (orchestrator, `npm pack --dry-run` on the current branch)
Published: `course-professor@1.5.1` (2026-03-31); branch is 117 commits ahead of tag `v1.5.1`; local package.json says
1.5.0. The `files` allowlist is from v2.0 and the tarball would be BROKEN: missing `web/studio-api.js`, `web/studio-db.js`,
`web/studio-runner.js`, `web/lecture-archive.js` (imported by `web/server.js` → `web` and `studio` crash on start) and all
of `studio/` (no built app, no migrations). `bin/commands/*` etc. are included.

## Requirements (REL-01..05)
1. **REL-01 files**: update `package.json` `files` so the tarball contains everything the CLI needs at runtime and nothing
   else: `bin/`, `templates/`, `shared/`, `plugin.json`, `web/server.js`, `web/studio-*.js`, `web/lecture-archive.js`,
   `web/package.json`, `web/package-lock.json`, the legacy `web/client` build inputs already listed (keep `web` command
   working), `studio/dist/`, `studio/migrations/`, `README.md`, `CHANGELOG.md`, `LICENSE`. No tests, fixtures, .planning,
   worktrees, node_modules, sourcemaps of secrets, or `web/.studio-token`.
2. **REL-02 build on publish**: `prepublishOnly` builds BOTH the legacy client and Studio (`npm run build && npm run
   build:studio`). `bin/commands/studio.js`: when `studio/src` is absent (installed package) never try to build — use the
   shipped `studio/dist`; only build when running from a git checkout with `studio/src` present and dist missing/stale.
   `web/` runtime deps: keep the existing "install web deps on first run" behaviour, but make it work when the package lives
   in the npx cache (print a clear message on EACCES); consider moving `express`/`cors` into the root `dependencies`
   instead so no runtime install is needed — choose the more robust option and explain.
3. **REL-03 Node version**: `node:sqlite` needs Node ≥ 22.5. `studio`, `review`, `import` must check the Node version first
   and print "Professor Studio needs Node 22.5+ (you have X). Install from https://nodejs.org" with exit 1; `doctor` reports
   it; setup/registry commands keep working on Node ≥ 18 (`engines` stays `>=18`, add a README note).
4. **REL-04 tarball smoke test**: `scripts/smoke-pack.mjs` (and `npm run smoke:pack`): `npm pack` → install the tarball into
   a fresh temp dir (`npm init -y && npm i <tgz>`) → run with a temp `PROFESSOR_HOME`: `course-professor --help`, `doctor`,
   `status` (empty ok), `import --all --dry-run` from a fixture dir, `studio --no-open --port 5197 --api-port 3019` → GET
   Studio URL = 200 HTML, `/api/studio/health` with the token = 200, `/api/studio/db/health` = sqlite + schemaVersion ≥ 4
   (migrations shipped) → stop. Fail loudly on any step. Add a GitHub Actions workflow
   `.github/workflows/release-smoke.yml` running it on Node 22 (and `--help`/`doctor` on Node 18).
5. **REL-05 version + docs**: version `1.6.0-beta.1`; `CHANGELOG.md` (new file) with a 1.6.0 section summarising v3.0
   (Studio, bridge agents, SQLite, CLI fast-path, capstone, course kinds, lecture archive, grounding rules, storage choice;
   Phase 35 i18n "in progress" note); README install section: `npx course-professor@next studio` for the beta, requirements
   (Node 22.5+ for Studio), uninstall/upgrade notes. Prepare (do not run) the publish commands in `RELEASING.md`:
   `npm publish --tag next` for betas, `npm publish` for 1.6.0, `git tag v1.6.0-beta.1`.

## Files you own
`package.json`, `package-lock.json` (root), `bin/commands/studio.js` (build logic only), `bin/commands/{review,import,doctor}.js`
(Node version check only), `bin/cli.js` (help text only), NEW `scripts/smoke-pack.mjs`, NEW `.github/workflows/release-smoke.yml`,
NEW `CHANGELOG.md`, NEW `RELEASING.md`, `README.md` (install/requirements section only), `.npmignore` if needed.

## Verify before reporting
`npm test`, `npm run build:studio`, `npm run smoke:pack` all pass locally — paste the smoke output and the final
`npm pack --dry-run` file list summary (count + size + confirmation that the 4 web/studio files, studio/dist and
studio/migrations are included and tests/.planning are not).
