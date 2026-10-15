# Releasing `course-professor`

This runbook is for maintainers. **Nothing here is run automatically** — publishing is a deliberate,
manual step after review.

## Prerequisites

- Node 22.5+ locally (Studio builds and the tarball smoke test use `node:sqlite`).
- `npm login` against the `course-professor` package owner, with 2FA enabled.
- A clean `main` (or the release branch) with a green `Release smoke` workflow.

## Preflight (must all pass)

```bash
npm ci
npm test                     # unit/integration suites
npm run build                # legacy web client → web/client/dist
npm run build:studio         # Studio → studio/dist
npm run smoke:pack           # pack → install into a temp dir → run --help/doctor/status/import/studio
npm pack --dry-run           # inspect the file list (see below)
```

`npm pack --dry-run` must list: `bin/`, `templates/`, `shared/`, `plugin.json`, the `web/server.js`
and `web/studio-*.js` runtime files, `web/lecture-archive.js`, `web/client` build inputs + `dist`,
`studio/dist/`, `studio/migrations/`, `studio/src/lib/`, `README.md`, `CHANGELOG.md`, `LICENSE`.
It must **not** list tests, fixtures, `.planning/`, `.worktrees/`, `node_modules/`, `web/.studio-token`
or any `*.map` sourcemaps.

## Version

Keep `package.json#version` and the `CHANGELOG.md` heading in sync.

## Publish

### Beta (dist-tag `next`)

Use this for prereleases such as `1.6.0-beta.1`. It does **not** move the `latest` tag.

```bash
npm publish --tag next
git tag v1.6.0-beta.1
git push origin v1.6.0-beta.1
```

Learners then install with:

```bash
npx course-professor@next studio
```

### Stable

Once the beta has soaked and the changelog is finalised:

```bash
npm publish                 # publishes under the default `latest` tag
git tag v1.6.0
git push origin v1.6.0
```

`prepublishOnly` builds both bundles before the tarball is created, so run the preflight above on the
same commit that you publish.

## Promoting a prerelease

`npm dist-tag add course-professor@1.6.0 latest` moves `latest` to a version already published,
without re-publishing.

## If a publish is wrong

- `npm unpublish course-professor@<version>` is only allowed within 72 hours and breaks anyone who
  already installed that exact version — prefer publishing a patch (`-beta.2` / `1.6.1`) and moving
  the dist-tag instead.

## Notes

- `npm pack`/`npm publish` never include the `studio/src` browser app beyond `studio/src/lib`; the
  built `studio/dist` is what ships.
- Never commit or publish `web/.studio-token`.
