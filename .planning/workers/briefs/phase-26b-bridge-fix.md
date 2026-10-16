# Task brief: Phase 26b — fix the local agent bridge (found in orchestrator E2E test)

Own git worktree branched from `feat/studio-local-first` (Phase 26 merged). Only edit `web/studio-api.js`,
`test/studio-api.test.js` and `studio/README.md` (bridge section). Small conventional commits. Do NOT push.

## Evidence (orchestrator E2E, 2026-10-15)
Server started with `NODE_ENV=production PORT=3000 node web/server.js` (clean env). Health/auth work
(no token → 401, foreign origin → 403, `/api/studio/health` lists claude/opencode/cursor/ollama, SQLite at
~/.professor/professor.db). But BOTH of these hang ~120 s and then emit `data: {"error":"<agent> exited with code null"}`:
```
curl -sN -X POST -H 'Content-Type: application/json' -H 'Origin: http://localhost:5180' -H "X-Studio-Token: $T" \
  http://127.0.0.1:3000/api/studio/complete \
  -d '{"agent":"claude","system":"Reply in one short sentence.","messages":[{"role":"user","content":"What is spaced repetition?"}]}'
# same with "agent":"opencode","model":"opencode-go/deepseek-v4.1-flash"
```
Running the same CLIs directly works (claude finishes in ~11 s; opencode in ~28 s).

## Root causes
1. **Child killed immediately.** `/complete` does `req.on('close', () => { runner.kill(); ended = true; })`. On Node ≥16 the
   request's `'close'` fires as soon as the body has been consumed by `express.json()`, NOT on client disconnect. So the
   child is SIGTERM'd at once (exit code null) and, because `ended` is already true, the response is never ended →
   client hangs until its own timeout. Fix: detect disconnect with `res.on('close', () => { if (!res.writableEnded) kill })`
   (or `req.socket` close), never with `req.on('close')`; make `done()` always end the response exactly once.
2. **OpenCode output not parsed.** `opencode run --format json` emits JSON lines like
   `{"type":"text","part":{"type":"text","text":"hello",...}}` plus `step_start`/`step_finish` (and possibly
   `tool_use`). The parser only reads `delta.text / message.content / content / text / result`. Read `part.text` for
   `type === "text"`; ignore other types. Add a fixture test with those exact lines.
3. **OpenCode runs as a full coding agent** (≈37K input tokens for a one-word reply, tools enabled, cwd = web/). For a
   tutor it must not touch files: spawn it with `cwd` = a fresh empty temp dir (`fs.mkdtempSync(os.tmpdir()+'/professor-')`,
   removed afterwards) and env `OPENCODE_CONFIG_CONTENT='{"permission":{"edit":"deny","bash":"deny","webfetch":"deny"}}'`
   (merge with any existing value). Do the same temp-cwd for `cursor-agent`. Document the token overhead in the README.
4. Add a heartbeat: write an SSE comment line `: ping\n\n` every 15 s while waiting for the first token so proxies and the
   browser don't time out, and send `data: {"status":"thinking"}` once at start (client ignores unknown keys).

## Tests (test/studio-api.test.js)
- Use a fake runner injected through the router options (or a tiny fake CLI script on PATH) to prove: the child is NOT
  killed when the body is consumed; it IS killed when the client aborts mid-stream; the response always ends with
  `data: [DONE]`.
- OpenCode JSON-line parser fixture (text/step events).
- Then run for real (manual, paste output in your summary): start the server, run the two curl commands above
  (token from web/.studio-token) — each must stream text and end with `[DONE]` well under 60 s.

## 5. Addendum (orchestrator) — mount the Phase 29 local runner
Phase 29 was merged into `feat/studio-local-first` after your worktree was created. First run
`git merge feat/studio-local-first` in your worktree (no conflicts expected), then in `web/studio-api.js` mount the runner
INSIDE the token/CORS-guarded router: `import { createRunnerRouter } from './studio-runner.js';` +
`router.use('/run', createRunnerRouter());` (see `studio/HANDOFF-29.md` §1). Add a test that `/api/studio/run/toolchains`
is 401 without the token and 200 with it. You may now also edit `studio/HANDOFF-29.md` to mark §1 done.
