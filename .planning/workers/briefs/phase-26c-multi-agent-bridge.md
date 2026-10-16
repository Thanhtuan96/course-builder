# Task brief: Phase 26c — make every local agent + OpenRouter + Ollama work (user-reported: only Claude works)

Own git worktree from `feat/studio-local-first`. Phase 33 (capstone) runs in parallel on `pages/*`, `components/capstone`,
`components/tutor`, `lib/prompts/*`, `lib/repo/*`, migrations — do NOT touch those. Small conventional commits. Do NOT push.

## Evidence (orchestrator, against the running server on :3000, main branch c2be47c/2d7d685)
`/api/studio/complete` without `model`: claude ✓, **opencode ✓ "Hello!" in 11 s**, cursor ✗ `Cursor Agent exited with
code 1` (real stderr: "Authentication required. Please run 'agent login' first, or set CURSOR_API_KEY"), ollama ✗
"not reachable at 127.0.0.1:11434" (daemon not running on this machine), **gemini / antigravity → empty stream that just
ends `[DONE]` with NO error** (unsupported agent silently ignored).
**Root cause for opencode in the UI**: `lib/ai/index.js` bridge case passes `model: settings.model` — the GLOBAL model
field shared by all providers (here `claude-opus-5-5` from earlier Anthropic use). Reproduced: `{"agent":"opencode",
"model":"claude-opus-5-5"}` → `OpenCode exited with code 1`. Same leak can hit openai-compatible/OpenRouter/Ollama.
Installed on this machine: `claude`, `opencode` (models like `opencode-go/deepseek-v4.1-flash`), `cursor-agent` (not
logged in; new CLI name is `agent`), `gemini` 0.34.0 (`-p/--prompt`, `-o/--output-format stream-json`, `-m`,
`--approval-mode plan` = read-only), Antigravity `agy` at ~/.local/bin/agy (`-p/--print`, `--output-format stream-json`,
`--model`, `--mode plan`, `--sandbox`, `--disable-slash-commands`).

## Requirements
1. **Per-provider / per-agent model (no global leak)**: settings get `bridge.models: { claude, opencode, cursor, gemini,
   antigravity, ollama }` (and providers keep their own `anthropic.model`, `openai.model`, `ollama.model`). `getProvider`
   must never read the top-level `settings.model` for bridge/openai/ollama; migrate old settings once (move a top-level
   model into the matching provider only if it is valid there, else drop it). Unit tests for the migration and for
   "Anthropic model never reaches the bridge".
2. **Model pickers**: new `GET /api/studio/agents/:agent/models` (guarded router) — opencode: `opencode models`;
   cursor: `cursor-agent models`/`agent models` if available; gemini/antigravity/claude: a curated list + "default";
   ollama: `/api/tags`. Settings → My local agent shows an Agent select + Model select (with "Default" = omit `--model`)
   + free-text custom model. Cache list for the session.
3. **Agents**: support `claude`, `opencode`, `cursor` (`cursor-agent` OR `agent` binary), `gemini`, `antigravity` (`agy`),
   `ollama` (via server, so no OLLAMA_ORIGINS needed). For EACH: run once by hand to capture its real stream-json event
   shape and write a fixture-based parser test. Read-only/no-tools isolation for each: temp empty cwd (already used),
   gemini `--approval-mode plan`, agy `--mode plan --disable-slash-commands` (+ `--sandbox` if it does not break print
   mode), opencode deny config (already), cursor read-only flags if any. Pass the system prompt the way each CLI
   supports (flag if available, else flattened into the prompt as today). `/health` lists all six with installed +
   `loggedIn`/`reachable` where detectable.
4. **Errors are never silent**: unknown/unsupported agent → SSE `{"error","code":"config"}`; a child exiting non-zero
   with no text → error message includes the first meaningful stderr line; map known cases to actionable hints:
   cursor auth → "Run `agent login` (or set CURSOR_API_KEY)"; gemini auth → "Run `gemini` once to sign in"; agy auth →
   "Open Antigravity and sign in"; ollama down → "Start the Ollama app or run `ollama serve`"; model not found → "Pick a
   model in Settings". Client shows `hint`.
5. **OpenRouter (browser, openai-compatible)**: verify with a stubbed `fetch` that the preset sends
   `POST https://openrouter.ai/api/v1/chat/completions` with `Authorization: Bearer`, `stream: true`, the OpenRouter model
   id (default `openrouter/auto`), optional `HTTP-Referer`/`X-Title` headers, parses its SSE (incl. `: OPENROUTER
   PROCESSING` comment lines) and maps 401/402/429 to auth / billing / rate_limit hints. Live test only if
   `OPENROUTER_API_KEY` is set in your env (it is not required).
6. **Ollama provider (browser)**: when direct browser calls fail with CORS, show the OLLAMA_ORIGINS hint AND offer
   "Use Ollama through the local server" (bridge agent `ollama`) as a one-click switch.

## Files you own
`web/studio-api.js` (agent runners, models route, health, errors), `studio/src/lib/ai/{index,bridge,openai-compatible,ollama,
errors,catalog,config}.js`, `studio/src/lib/settings.js` (models + migration), `studio/src/components/settings/*`,
`studio/src/pages/Settings.jsx`, tests (`test/studio-api*.test.js`, `studio/test/*ai*|*settings*|*bridge*`), `studio/README.md`
(agents section).

## Verify before reporting (paste outputs)
Start `NODE_ENV=production PORT=3015 node web/server.js` from your worktree with a clean env (`env -i HOME PATH USER LANG`)
and curl `/api/studio/complete` for claude, opencode (default + `opencode-go/deepseek-v4.1-flash`), gemini, antigravity,
cursor (expect the auth hint), ollama (expect the reachable hint unless running), and an unknown agent (expect a config
error). Plus all test suites + build.
