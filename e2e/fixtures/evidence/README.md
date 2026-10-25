# Committed Playwright evidence fixture (RON-168)

`chromium-green.json` is **not hand-written**. It is the JSON reporter output of a real local
Chromium run of `workflow.spec.js` against the static page `index.html`.

## Exact authoring command

```bash
cd e2e/fixtures/evidence
PLAYWRIGHT_JSON_OUTPUT_NAME=chromium-green.json \
  npx playwright test --reporter=json --project=chromium
```

Captured on **2026-10-25** with **Playwright 1.64.1** on macOS (Chromium, 1 worker).

## What the fixture proves

- One passing Chromium test (`stats.passed = 1`, `stats.failed = 0`).
- A named `chromium` project, so Studio reports `chromium: confirmed`.
- The reported spec path is `workflow.spec.js`, matching the spec path submitted in E2E journey B.

It passes Studio's own parser (`studio/src/lib/capstone-evidence.js`) with no warnings.

## Do not regenerate automatically

This is a one-time snapshot used as the learner's "verify externally" paste. The E2E suite must
never run Playwright itself, and this project is outside the suite's `testDir`. If the fixture must
be refreshed, run the command above deliberately and update the date/version here.
