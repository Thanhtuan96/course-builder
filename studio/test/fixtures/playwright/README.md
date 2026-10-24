# Playwright reporter fixtures

Static captures of Playwright Test reporter output, used by
`studio/test/capstone-evidence.test.js` to prove that `studio/src/lib/capstone-evidence.js` turns a
pasted report into the same normalized facts every time.

## Provenance

| Property | Value |
|----------|-------|
| Captured with | `@playwright/test@1.64.1` |
| Captured on | 2026-10-24 (macOS, Node 24, Chromium + Firefox installed) |
| Storage | Plain committed files — **no generation script, no CI step** |

These files are **static**. `@playwright/test` is a root dev dependency (`^1.50.0`), so CI may resolve
a different minor version. Regenerating the fixtures in CI would silently change the parser's inputs,
so it is forbidden: only a human, running the one-off commands below on a pinned version, may refresh
them. Studio code and Studio tests must **never** import `@playwright/test` (or any `playwright`
package) — the fixtures exist so the parser can be tested without Playwright being installed in
Studio.

## Inventory

| File | Shape | What it pins |
|------|-------|--------------|
| `json-pass.json` | JSON reporter, 1 project, 2 green tests | counts, `config.version`, `chromium: 'confirmed'` |
| `json-fail.json` | JSON reporter, 1 pass + 1 failure with `errors`, `errorLocation`, `attachments`, `stdout` | failure counts + **no** attachments/stdout/stderr survive parsing |
| `json-flaky.json` | JSON reporter, `results: [failed retry 0, passed retry 1]` | `status: 'flaky'`, `retryCount: 1` |
| `json-multi-project.json` | JSON reporter, same spec on `chromium` (green) + `firefox` (red) | `stats.projects`, `chromium: 'confirmed'`, `failed: 1` |
| `json-zero-tests.json` | JSON reporter, `suites: []`, `errors: ["No tests found"]` | `total: 0` + `no_tests` |
| `json-config-error.json` | JSON reporter, broken config → every test `unexpected`, `projectName: ''` | `chromium: 'none'` even with a single unnamed project |
| `json-expected-failure.json` | JSON reporter, `test.fail()` (`expectedStatus: 'failed'`) | `stats.expected` is **never** read as a pass |
| `list-pass.txt` | list reporter, plain UTF-8 | per-row parsing, durations in `ms` and `s` |
| `list-fail.txt` | list reporter with a retry row, a skipped row without duration and a failure body | flaky grouping, skipped rows carry no duration, failure bodies are ignored |
| `list-color.txt` | `list-pass.txt` wrapped in real SGR sequences (`ESC[32m`, `ESC[2m`, `ESC[39m`, `ESC[22m`) | ANSI colour parses identically to the plain paste |
| `list-1.4x.txt` | hand-authored older list layout without the `[project] ›` bracket | `project: ''` and `chromium: 'assumed'` |
| `line-fail.txt` | line reporter (`[i/total]` progress lines + summary) | counts come from the summary block, `reporter: 'line'` |
| `mixed-list-json.txt` | list rows, a locator containing `{`, then a full pretty-printed JSON report | detection anchors on `{\n  "config":` (not the first `{`) and parses exactly once |
| `truncated.json` | a JSON report cropped mid-`suites`, without a `config` key | unparseable input → `format: 'unknown'` + `unrecognized_format`, never a throw |

`list-1.4x.txt`, `list-color.txt` and `truncated.json` are deliberately hand-authored variants of the
verified formats (older layout, colour wrapping, broken paste). The rest follow the shapes recorded in
`.planning/phases/09-playwright-template-and-verify-externally/09-RESEARCH.md` §A, §B and §F.

## One-off regeneration commands

Run once, manually, on `@playwright/test@1.64.1`. Never in CI.

```bash
mkdir -p tmp-pw && cd tmp-pw && npm init -y && npm i -D @playwright/test@1.64.1
npx playwright install chromium firefox

# pass:             npx playwright test --project=chromium --grep "signs in" --reporter=json > json-pass.json
# fail (+ retries): npx playwright test --reporter=json > json-fail.json
# flaky:            retries: 1 plus a test that fails only on retry 0
# multi-project:    projects: [chromium, firefox] in playwright.config.js
# zero tests:       npx playwright test --grep zzz --reporter=json > json-zero-tests.json
# expected failure: test.fail() around an intentionally failing body
# list:             npx playwright test --reporter=list > list-pass.txt
# list + colour:    FORCE_COLOR=1 npx playwright test --reporter=list > list-color.txt
# line:             npx playwright test --reporter=line > line-fail.txt
# mixed:            npx playwright test --reporter=list,json > mixed-list-json.txt
```

The config-error fixture comes from a `playwright.config.js` with an invalid `browserName` (for
example `"netscape"`); the truncated fixture is the result of cutting a report mid-`suites` (and
deliberately cropping the leading `"config"` object) to model a paste that lost its head.

## Related contract

The normalized payload produced from these fixtures is the cross-phase evidence contract documented
in `studio/src/lib/capstone-evidence.js` (schema version 1). Do not rename its fields or the closed
warning-code set when refreshing a fixture.
