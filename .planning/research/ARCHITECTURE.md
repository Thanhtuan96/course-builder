# Architecture Research

**Domain:** Local-first static SPA (Vite + React 19) with multi-provider LLM access, a localhost agent bridge, and an IndexedDB store designed for a later sync/SaaS layer.
**Project:** Course Learning Plugin v3.0 — "Professor Studio" (`studio/`)
**Researched:** 2026-10-15
**Confidence:** HIGH for provider/bridge/security/data-model; MEDIUM for the exact CLI tool-restriction flags (one flag marked **UNVERIFIED**); HIGH for void.cloud static/SaaS path.

> Scope: this document answers the six architecture questions in `workers/briefs/research-architecture.md`.
> Provider/CORS/model-ID specifics belong to `STACK.md`; feature classification to `FEATURES.md`; failure modes to `PITFALLS.md`.
> Here we decide **shape**: interfaces, module boundaries, data schema, security boundaries, component tree, build order, SaaS seam.

---

## Decisions At A Glance (read this first)

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | One provider facade `streamText()` / `generateJson()` over four adapters: `anthropic`, `openai-compatible`, `ollama`, `bridge`. | One call site for course/lesson/quiz/cards/tutor; provider swap is config-only. |
| D2 | Anthropic + OpenAI-compatible + Ollama run **in the browser**; the bridge is only for local agents. | Browser→provider works for these (verified CORS); localhost from an https origin is the fragile path and is treated as opt-in/local-only. |
| D3 | **Add** `POST /api/studio/complete` to `web/server.js`; do **not** reuse `POST /api/chat`. | `/api/chat` drops the system prompt and all but the last user message on the CLI path, and strips `<file>` blocks + writes to `courses/`. Studio needs system + full history and no filesystem side effects. |
| D4 | Bridge is secured by an **origin allowlist + pairing token**, and the CLI is invoked with a **Professor system prompt and no auto-approved tools**. | CORS is not auth; the current `--dangerously-skip-permissions` on a chat-only path is unnecessary attack surface. |
| D5 | Split `lessons` out of `courses`; add `chats`; standardize a sync envelope (`id`, `createdAt`, `updatedAt`, `deletedAt`) on every record; add `_outbox`/`_sync` **in a later version**. | Removes write amplification, gives stable sync granularity; the envelope is the hook the future sync layer needs. |
| D6 | All reads/writes go through a `repo/` layer; components never touch `db.js`. | Single seam to swap local-only for local+remote, and to stamp sync metadata centrally. |
| D7 | BYOK keys live in a dedicated `meta` singleton, excluded from backups, behind a "Clear keys" action; Markdown renders with `react-markdown` **without** `rehype-raw` and with a URL transform. | Keys never leave the device; prevents script-URL XSS. |
| D8 | No router library, no state library, no UI kit. Tiny hash router + `useSyncExternalStore` store. | Matches the "minimal dependencies, no build step for core" project ethos; the app is ~7 screens. |
| D9 | Streaming updates are **buffered** (~50 ms / rAF), not one React setState per token. | Prevents re-render thrash on long lessons/answers. |
| D10 | SaaS arrives by adding a **remote adapter behind `repo/`**, an auth token, and a managed-AI proxy; nothing in the UI changes shape. | Local-first code path stays the offline path; sync/accounts are additive. |

---

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        React SPA (studio/src)  — static, hash-routed           │
│                                                                                │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐  │
│  │  Home    │ │NewCourse │ │  Course  │ │  Lesson  │ │  Review  │ │Settings│  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └───┬────┘  │
│       └────────────┴────────────┴─────┬──────┴────────────┴───────────┘       │
│                                       │  (React Context: settings + active)   │
│        ┌──────────────────────────────┴───────────────────────────────┐       │
│        │  components/ : LessonView · Markdown · ChatPanel · QuizCard   │       │
│        │                FlashcardReview · ProviderForm · ProgressRing   │       │
│        └──────────────────────────────┬───────────────────────────────┘       │
├───────────────────────────────────────┼─────────────────────────────────────┤
│                         Application services (framework-free JS)              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ prompts/     │  │ providers/   │  │ repo/        │  │ lib/ (pure)      │   │
│  │ syllabus.ts  │  │ index.js     │  │ courses.js   │  │ srs.js json.js   │   │
│  │ lesson,quiz  │  │ anthropic.js │  │ lessons.js   │  │ course.js slug   │   │
│  │ cards,tutor  │  │ openai.js    │  │ cards.js     │  │ dayKey streak    │   │
│  │ (system+msg) │  │ ollama.js    │  │ chats.js     │  └──────────────────┘   │
│  └──────────────┘  │ bridge.js    │  │ meta.js      │                         │
│                    └──────┬───────┘  └──────┬───────┘                         │
├───────────────────────────┼─────────────────┼────────────────────────────────┤
│                  Transport │                 │ Storage                         │
│        ┌──────────────────┴───┐   ┌─────────┴──────────┐                     │
│        │ fetch + SSE (EventSrc)│   │ IndexedDB wrapper  │                     │
│        │ AbortController       │   │ db.js (v2 schema)  │──► memory fallback  │
│        └───────┬───────────────┘   └────────────────────┘                     │
└────────────────┼─────────────────────────────────────────────────────────────┘
                 │
   ┌─────────────┼──────────────────────────────────────────────┐
   │             ▼                                               ▼
   │  Direct (https, browser CORS)               Local agent bridge (http://localhost)
   │  ┌────────────┐ ┌───────────────────┐        ┌──────────────────────────────┐
   │  │ Anthropic  │ │ OpenAI-compatible │        │ web/server.js (Express)       │
   │  │ api.anthropic│ │ OpenAI/OpenRouter│        │  POST /api/studio/complete    │
   │  │ .com        │ │ /Groq/LM Studio  │        │   ├ spawn claude / cursor /   │
   │  └────────────┘ └───────────────────┘        │   │   opencode  (no tools)     │
   │  ┌────────────┐                              │   ├ ollama passthrough        │
   │  │ Ollama     │                              │   └ console API-key fallback  │
   │  │ :11434     │                              │  CORS allowlist + token       │
   │  └────────────┘                              └──────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| `providers/index.js` | Provider registry, resolve settings → adapter, export `streamText`/`generateJson`/`testConnection`. | Plain module; switch on `settings.provider`. |
| `providers/<name>.js` | Adapter: build request, parse SSE, map errors → `ProviderError`. | `fetch` + `ReadableStream` reader (SSE), or `@anthropic-ai/sdk`. |
| `prompts/*.js` | System prompts + message builders for syllabus, lesson, quiz, cards, tutor. Pure strings/functions. | Exports `system()`, `buildMessages(ctx)`, plus JSON shape hints. |
| `repo/*.js` | Domain CRUD; stamps sync envelope; filters tombstones; hides storage backend. | Wraps `db.js`; one module per entity. |
| `lib/db.js` | Raw IndexedDB open/upgrade + get/put/list/remove + memory fallback. | Existing seed, extended to v2. |
| `lib/*.js` | Pure helpers: `srs`, `json.extractJson`, `course.slugify/toCourseMarkdown`, streaks. | Existing seed modules. |
| `store/appStore.js` | In-memory UI state (active course, streaming buffers, toasts); subscribable. | `useSyncExternalStore` + module-level store. |
| `router.js` | Hash route parsing + `navigate()`. | ~40 lines, no dependency. |
| `web/server.js` `/api/studio/complete` | Local-agent streaming endpoint with system prompt + full history, origin allowlist, token. | Express handler + `streamVia…` helpers (reuse/spawn). |

### Structure Rationale

- **`providers/` separate from `prompts/`:** adapters deal with transport/errors; prompts deal with pedagogy. Changing a model or a prompt never touches the other. Both are pure modules so they unit-test without a DOM (only `fetch` needs mocking).
- **`repo/` separate from `db.js`:** `db.js` is a dumb key-value layer; `repo/` owns domain invariants and the sync envelope. This is the exact seam the SaaS milestone replaces (local-only → local+remote).
- **`pages/` vs `components/`:** pages are route owners (fetch + compose); components are presentational and reusable (`Markdown`, `ChatPanel` used by Lesson and stand-alone tutor).
- **No framework in services:** everything under `src/lib`, `src/repo`, `src/providers`, `src/prompts` is framework-free ES modules — testable with Vitest's node environment, matching the existing `vite.config.js` (`environment: 'node'`).

## Recommended Project Structure

```
studio/
├── index.html
├── vite.config.js                 # base './', hash routing, vitest node env
├── src/
│   ├── main.jsx                   # createRoot + <App/>
│   ├── App.jsx                    # providers (AppContext) + <Router/>
│   ├── router.js                  # hash route parse/match/navigate
│   ├── lib/
│   │   ├── db.js                  # IndexedDB v2 (extended seed)
│   │   ├── json.js                # extractJson (seed — keep)
│   │   ├── srs.js                 # SM-2 (seed — keep)
│   │   ├── course.js              # slugify, makeCourse, toCourseMarkdown (seed)
│   │   ├── activity.js            # dayKey, streak, markStudied()
│   │   ├── errors.js              # ProviderError + ErrorCode enum
│   │   └── ids.js                 # uid(prefix)
│   ├── repo/                      # storage-agnostic domain layer
│   │   ├── courses.js
│   │   ├── lessons.js
│   │   ├── cards.js
│   │   ├── chats.js
│   │   ├── meta.js                # settings (incl. secrets), activity, schemaVersion
│   │   └── backup.js              # dumpAll/restoreAll (excludes secrets)
│   ├── providers/
│   │   ├── index.js               # streamText, generateJson, testConnection
│   │   ├── sse.js                 # shared SSE line parser + buffer flush
│   │   ├── anthropic.js
│   │   ├── openai-compatible.js   # openai | openrouter | groq | lmstudio
│   │   ├── ollama.js              # /api/tags + OpenAI-compat /v1
│   │   └── bridge.js              # http://localhost:3000/api/studio/*
│   ├── prompts/
│   │   ├── pedagogy.js            # shared hybrid rules block
│   │   ├── syllabus.js
│   │   ├── lesson.js
│   │   ├── quiz.js
│   │   ├── cards.js
│   │   └── tutor.js
│   ├── store/
│   │   └── appStore.js            # useSyncExternalStore store + selectors
│   ├── components/
│   │   ├── Markdown.jsx           # react-markdown + remark-gfm, safe config
│   │   ├── StreamText.jsx         # buffered streaming renderer
│   │   ├── ChatPanel.jsx          # tutor UI (used by Lesson)
│   │   ├── LessonView.jsx
│   │   ├── QuizCard.jsx
│   │   ├── FlashcardReview.jsx
│   │   ├── ProgressRing.jsx
│   │   └── ProviderForm.jsx       # settings form + Test connection
│   ├── pages/
│   │   ├── Home.jsx               # course list + streak + due badge
│   │   ├── NewCourse.jsx          # prompt → editable syllabus → confirm
│   │   ├── Course.jsx             # syllabus/progress + continue
│   │   ├── Lesson.jsx             # lesson + quiz + tutor
│   │   ├── Review.jsx             # flashcard queue
│   │   └── Settings.jsx           # providers, keys, backup, clear keys
│   └── data/
│       └── demoCourse.json        # zero-key demo (COURSE-04)
└── docs/SAAS-ROADMAP.md           # DEPLOY-03
```

---

## 1. Provider Abstraction (Q1)

### Interface

Two entry points cover every feature; nothing else in the app talks to a model.

```js
// src/providers/index.js
/**
 * @typedef {Object} StreamTextOptions
 * @property {string}   [system]                     // system prompt (pedagogy)
 * @property {{role:'user'|'assistant', content:string}[]} messages
 * @property {string}   [model]
 * @property {number}   [maxTokens]
 * @property {number}   [temperature]
 * @property {AbortSignal} [signal]
 * @property {(text: string) => void} onText         // called per token
 * @property {(meta: {sessionId?: string, usage?: object}) => void} [onMeta]
 * @property {string}   [sessionId]                  // bridge/CLI resume
 */

/**
 * @returns {Promise<{ text: string, sessionId?: string, usage?: object, stopReason?: string }>}
 * @throws {ProviderError}
 */
export async function streamText(opts, settings) {}

/**
 * Calls streamText, then parses JSON out of the reply with extractJson(),
 * retrying once with a "return ONLY valid JSON" repair turn on failure.
 */
export async function generateJson({ system, messages, model, signal }, settings) {}

/** Tiny probe used by Settings → "Test connection". Returns {ok, detail} or throws ProviderError. */
export async function testConnection(settings) {}
```

- `settings.provider` ∈ `'anthropic' | 'openai' | 'ollama' | 'bridge'`. `openai` covers every OpenAI-compatible endpoint via `settings.baseUrl` (OpenAI, OpenRouter, Groq, LM Studio). Adapter selection is a `switch`, not a plugin system — four adapters do not justify indirection.
- `generateJson` is intentionally built on `streamText` so that "stop generation" (AI-04) and error handling are shared. It returns the parsed value; the caller validates the shape.
- **Anthropic adapter** uses `@anthropic-ai/sdk` with `dangerouslyAllowBrowser: true` (the SDK then sends `anthropic-dangerous-direct-browser-access: true` automatically) and `client.messages.stream(...)`; abort via `stream.controller.abort()` / the `signal` option. Sources: [TypeScript SDK](https://platform.claude.com/docs/en/api/sdks/typescript), [browser header PR](https://github.com/anthropics/anthropic-sdk-typescript/pull/504), [SDK browser option](https://github.com/anthropics/anthropic-sdk-typescript/issues/248).
- **OpenAI-compatible adapter** uses raw `fetch` + an SSE reader rather than the `openai` npm package. Reason: homegrown SSE gives one place to enforce `AbortSignal`, avoid the SDK's extra `x-stainless-*` preflight headers (which some local servers reject — [ollama#4388](https://github.com/ollama/ollama/issues/4388)), and produce identical streaming semantics for OpenAI, OpenRouter, Groq and LM Studio. Browser CORS: OpenAI/OpenRouter/Groq all return `Access-Control-Allow-Origin` ([BYOK compatibility table](https://openpencil.dev/programmable/byok-provider-compatibility)); error responses may lack the header, which is why the taxonomy below matters.
- **Ollama adapter** calls the OpenAI-compatible `POST http://localhost:11434/v1/chat/completions` (same code path as `openai-compatible`) and lists models via `GET /api/tags`. Requires `OLLAMA_ORIGINS` for any non-local origin ([Ollama OpenAI compat](https://docs.ollama.com/api/openai-compatibility), [OLLAMA_ORIGINS guide](https://objectgraph.com/blog/ollama-cors/)).
- **Bridge adapter** streams from `POST /api/studio/complete` (see §2).

### Error taxonomy

One error type, one code enum, mapped by each adapter. Every thrown error carries an `actionable` hint so `ProviderForm` can render AI-02 exactly once, with no provider-specific branching in the UI.

```js
// src/lib/errors.js
export const ErrorCode = {
  AUTH:           'auth',            // 401/403, bad/revoked key, org disabled CORS
  RATE_LIMIT:     'rate_limit',      // 429 / quota exhausted
  NETWORK:        'network',         // fetch TypeError: offline, CORS, mixed content, DNS
  MODEL_NOT_FOUND:'model_not_found', // 404 model / unknown model name
  CONTEXT_TOO_LONG:'context_too_long',
  REFUSAL:        'refusal',         // model declines (stop_reason/refusal field)
  BAD_JSON:       'bad_json',        // generateJson only, after repair turn
  ABORTED:        'aborted',         // user pressed Stop (never shown as error)
  SERVER:         'server',          // 5xx / bridge CLI exit != 0
  CONFIG:         'config',          // missing key/baseUrl/model before any call
  UNKNOWN:        'unknown',
};

export class ProviderError extends Error {
  constructor(code, message, { retryable = false, fix = null, cause = null } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
    this.retryable = retryable;
    this.fix = fix;          // e.g. "Run: ollama serve" / "Check the key in Settings"
    this.cause = cause;
  }
}
```

Mapping rules (uniform across adapters):

| Observed | Code | Notes |
|----------|------|-------|
| HTTP 401/403, Anthropic `authentication_error` | `AUTH` | Include the Anthropic "CORS disabled for organization" body verbatim — it is actionable ([issue #741](https://github.com/anthropics/anthropic-sdk-typescript/issues/741)). |
| HTTP 429, provider quota message | `RATE_LIMIT` | `retryable: true`. |
| `fetch` rejects with `TypeError` before a response | `NETWORK` | Cannot distinguish offline vs CORS vs mixed-content from JS; message says "Could not reach this endpoint from the browser — check the URL, your network, and whether the provider/bridge allows browser (CORS) access." |
| Bridge not reachable / `ECONNREFUSED` | `NETWORK` | `fix: "Start the bridge: node web/server.js"`. |
| Ollama `404`/`model` in body | `MODEL_NOT_FOUND` | `fix: "Run: ollama pull <model>"`. |
| Anthropic `stop_reason: 'refusal'` | `REFUSAL` | Render as readable text (AI-05). |
| `extractJson` fails twice | `BAD_JSON` | Offer "Retry" and "Regenerate". |
| `AbortError` | `ABORTED` | Swallowed by the UI. |
| Bridge returns `{error, code}` SSE event | mapped code | Bridge reuses the same enum names. |

### Shared SSE parser

`providers/sse.js` owns the one non-obvious thing: correct SSE chunk-boundary handling. It reads a `ReadableStream`, keeps a text buffer, splits on `\n`, accumulates `data:` lines until a blank line, and invokes a callback with each complete event payload. All adapters use it, so abort/partial-line bugs live in one file (relevant to PITFALLS §4).

---

## 2. Local Agent Bridge (Q2)

### Verdict: add a minimal endpoint; do not reuse `/api/chat`

Why `/api/chat` is wrong for Studio (`web/server.js:372` `streamViaCLI`):

1. **Context loss.** On the claude path the server takes `[...messages].reverse().find(m => m.role === 'user')` and passes **only that one string** to the CLI (`web/server.js:373`, `:392`). The tutor (TUTOR-01) needs the system pedagogy prompt + the lesson content + prior turns. As-is, the tutor cannot stay scoped to a lesson or reference a previous answer.
2. **No system prompt.** The only system prompt in the CLI path is absent; `PROFESSOR_SYSTEM_PROMPT` exists (`web/server.js:253`) but is not injected in `streamViaCLI`. Without it the CLI answers as a general coding agent with a toolbelt — which directly risks violating the project's core rule ("never write working code for the user").
3. **Filesystem side effects.** `/api/chat` parses `<file>` blocks out of the reply and writes into `courses/` (`saveFilesFromResponse`, `web/server.js:338`). Studio persists to IndexedDB; it must not silently write to the repo.
4. **`--dangerously-skip-permissions`** (`web/server.js:383`) is unnecessary and unsafe for chat-only tutoring.

The existing `/api/chat` remains the CLI web UI's endpoint; the new endpoint shares helper functions but has Studio semantics.

### Proposed endpoint

```
POST /api/studio/complete
Headers: Content-Type: application/json
         X-Studio-Token: <pairing token>          (required)
Body:    { system?: string,
           messages: [{role:'user'|'assistant', content:string}],
           provider?: 'auto'|'claude'|'cursor'|'opencode'|'ollama'|'cloud',
           model?: string,
           sessionId?: string }
Reply:   text/event-stream
         data: {"content":"token"}                 (repeated)
         data: {"sessionId":"..."}                 (once, when a CLI session exists)
         data: {"error":"...","code":"auth"}       (on failure, then end)
         data: [DONE]

GET /api/studio/health
Reply:   { ok:true, version:"1", capabilities:{...} }   // used by "Test connection"
```

Bridge-side behavior per provider:

- **claude**: `spawn('claude', ['--print','--output-format','stream-json','--include-partial-messages','--verbose', ...])`. Pass the persona with `--system-prompt "<system>"` (documented flag, [CLI reference](https://code.claude.com/docs/en/cli-reference)) — replacement is appropriate because a tutor needs no tool guidance. Do **not** pass `--dangerously-skip-permissions`. First turn sends the flattened conversation; later turns send `--resume <sessionId>` with only the new user message (a session per lesson keeps context cheap).
- **cursor / opencode**: keep their existing streaming helpers but feed the system prompt through their supported mechanism and pass the full conversation; same "no auto-approve tools" stance. (**UNVERIFIED**: the exact per-tool-restriction flag for `cursor-agent`/`opencode`; verify during implementation before shipping. Fallback if a tool prompt appears: run the bridge with a dedicated minimal workspace directory.)
- **ollama**: forward `messages` (with the system message unshifted) to `http://127.0.0.1:11434/api/chat` — reuse `streamViaOllama` (`web/server.js:635`) but without the `<file>` extraction.
- **cloud**: reuse the existing Anthropic/OpenAI REST branch (`web/server.js:1031`) but with **Studio's** `system` and **all** messages, and no file extraction.

### Flattening multi-turn for the CLI

For the first turn of a lesson chat, the bridge builds one prompt string:

```
[assistant context is the system prompt]
USER: <turn 1>
ASSISTANT: <turn 2>
USER: <turn 3>
...
```

Subsequent turns use `--resume <sessionId>` so only the new user message is sent. This preserves history without resending it and avoids the "only last message" trap.

### CORS + pairing token (DEPLOY-04)

- Replace the blanket `app.use(cors())` (`web/server.js:23`) for the Studio route with an **origin allowlist** from `STUDIO_ORIGINS` (comma-separated), defaulting to `http://localhost:5180,http://127.0.0.1:5180` plus the deployed Studio origin(s). Respond `Access-Control-Allow-Headers: Content-Type, X-Studio-Token` and handle `OPTIONS`.
- **Pairing token**: the bridge reads `STUDIO_BRIDGE_TOKEN` from env, else generates one on startup, prints it, and writes it to `web/.studio-token` (git-ignored). The learner pastes it into Studio → Settings → "Local agent bridge". The token is checked on every Studio route and is **not** a substitute for origin checks — treat both as required (CORS is not authentication; see §4).
- The bridge should bind to `127.0.0.1` only by default (`app.listen(PORT, '127.0.0.1')`) and never to `0.0.0.0` automatically.

### The https→localhost problem (must be documented, not hidden)

`localhost` is a "potentially trustworthy origin," so a **local** Studio (`http://localhost:5180`) calling `http://localhost:3000` is same-scheme and fine. A **deployed https** Studio calling `http://localhost:3000` is a mixed-content/local-network request:

- Chrome 142+ gates it behind the **Local Network Access** permission (`loopback-network`), and only grants it from secure contexts; if granted, it also relaxes mixed-content blocking. Chrome previously used PNA preflights; PNA is now superseded/on hold ([Chrome LNA blog](https://developer.chrome.com/blog/local-network-access), [Blink intent](https://groups.google.com/a/chromium.org/g/blink-dev/c/lRnFRIfzDMU), [PNA on hold](https://developer.chrome.com/blog/pna-on-hold)).
- To be forward-compatible, the bridge adapter should annotate its fetch with `targetAddressSpace: 'loopback'` ([MDN Request.targetAddressSpace](https://developer.mozilla.org/en-US/docs/Web/API/Request/targetAddressSpace), [MDN Local network access](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Local_network_access)).
- Firefox/WebKit support is **not** guaranteed (**UNVERIFIED** as of writing; Safari has no public signal). 

**Prescription:** treat the bridge as a *local-development / desktop* feature. The hosted static build defaults to BYOK providers (https→https, no mixed content). Settings shows the bridge as "Local agent (this computer only)" and, when the app is served over https, warns that Chrome may ask for local-network permission and other browsers may block it. Do not promise bridge support on the deployed origin.

---

## 3. Data Model + IndexedDB Schema Versioning (Q3)

### Envelope (every syncable record)

```js
{
  id:        'c_a1b2c3d4e5f6',   // uid(); stable across devices, never reused
  createdAt: '2026-10-15T10:00:00.000Z',
  updatedAt: '2026-10-15T10:05:00.000Z',  // ISO-8601 UTC → sorts lexicographically
  deletedAt: null,               // tombstone; null = live
  schema:    2,                  // per-record shape version (see below)
}
```

- **Stable `id`** for cross-device identity; **`updatedAt` (ISO UTC)** for last-write-wins and for a future `(updatedAt, id)` keyset cursor (matches the changefeed pattern in [Backlex offline sync](https://backlex.com/docs/offline-sync/)). ISO strings are chosen over epoch ms because they sort correctly and are already used throughout the seed (`course.js`).
- **`deletedAt` tombstone, never a hard delete**, so a future pull cannot resurrect a deleted record ([offline-first skill](https://github.com/agents-inc/skills)). `repo` filters `deletedAt !== null` on all reads; `purge()` sweeps tombstones only after they have synced.
- Do **not** add `_syncStatus`/`_serverRev` in v3.0 — add them together with `_outbox` in the sync version, so the local-only build carries no dead weight.

### Stores (target schema v2)

| Store | keyPath | Indexes | Record |
|-------|---------|---------|--------|
| `courses` | `id` | `updatedAt`, `slug` | `{...envelope, slug, title, description, level, topics[], goal, source, registryName, capstone, notes, lessonIds[], lastStudiedAt}` |
| `lessons` | `id` | `courseId`, `updatedAt` | `{...envelope, courseId, index, title, summary, status, content, quiz, quizScore, completedAt}` |
| `cards` | `id` | `courseId`, `lessonId`, `due` | `{...envelope, courseId, lessonId, front, back, srs:{ease,interval,reps,lapses,due}}` |
| `chats` | `id` | `courseId`, `lessonId`, `updatedAt` | `{...envelope, courseId, lessonId, sessionId, messages:[{role,content,at}]}` |
| `meta` | `key` | — | singletons: `settings`, `secrets`, `activity`, `schema` |

Rationale for **splitting `lessons` out of `courses`** (the seed embeds them, `db.js:15`): regenerating one lesson otherwise rewrites the whole course record (write amplification), and a future sync would ship every lesson to move one. The seed already models a lesson with its own `id` (`course.js:21`), so the split is natural. Chat `messages` stay embedded in the `chats` record because a chat is small and the whole record is written once per completed turn (see "streaming writes" below) — splitting messages is a documented v3.1 option if chats grow.

### `db.js` v2 upgrade (structural)

```js
const DB_NAME = 'professor-studio';
const DB_VERSION = 2;                       // was 1
const STORES = ['courses', 'lessons', 'cards', 'chats', 'meta'];

req.onupgradeneeded = (event) => {
  const db = req.result;
  const tx = req.transaction;

  if (event.oldVersion < 1) {               // fresh install path
    db.createObjectStore('meta', { keyPath: 'key' });
  }
  if (event.oldVersion < 2) {
    const courses = tx.objectStore('courses');
    // pull existing embedded lessons into their own store, then strip them
    const rows = [];
    courses.openCursor().onsuccess = (e) => { /* collect */ };
    // (transform is idempotent: only runs while oldVersion === 1)
    if (!db.objectStoreNames.contains('lessons')) {
      db.createObjectStore('lessons', { keyPath: 'id' }).createIndex('courseId', 'courseId');
    }
    if (!db.objectStoreNames.contains('chats')) {
      const chats = db.createObjectStore('chats', { keyPath: 'id' });
      chats.createIndex('courseId', 'courseId');
      chats.createIndex('lessonId', 'lessonId');
    }
    // add updatedAt indexes on courses/cards, stamp updatedAt on existing rows
  }
};
```

Rules (from [IndexedDB migration practice](https://beefed.ai/en/indexeddb-pwa-schemas-sync-migrations)):
- **Never mutate a previous version step**; every change is a new `if (oldVersion < N)` block keyed by the old version. Upgrades must be idempotent/resumable.
- Keep `onupgradeneeded` short — for the lesson-unembed transform, collect rows with a cursor and write them back within the same upgrade transaction; if it ever grows, do the schema change first and migrate records lazily at read time via `repo`.
- Other-tab coordination: hold the single `dbPromise` connection and handle `versionchange` by closing it (so a tab with an older schema does not block an upgrade).

### Per-store migrations that survive sync

A single IndexedDB version handles **structural** changes. **Field-shape** changes that must remain sync-safe are handled by the per-record `schema` number plus a `storeVersions` map in the `meta:schema` singleton:

```js
// meta:schema
{ key: 'schema', value: { courses: 2, lessons: 1, cards: 1, chats: 1, global: 2 } }
```

`repo` calls `migrate(record)` on read, upgrading the record in memory (and writing it back lazily) when `record.schema < storeVersions[store]`. This is the pattern that lets a device on an old build keep syncing with one on a new build ([schema lenses](https://syncular.dev/blog/offline-first-writes/)).

### Future sync seam (design now, build later)

- `repo` is the only writer. In the sync milestone it gains: `_outbox` (durable mutation queue written in the **same transaction** as the local change), `_sync` (cursor + server revision), and `_serverRev`. The offline pattern is: persist locally + enqueue in one transaction → optimistically update UI → flush the queue on `online`/app start with backoff → apply server changefeed `(updatedAt, id)` deltas, delete tombstones, last-write-wins on `updatedAt` ([durable queue pattern](https://beefed.ai/en/indexeddb-pwa-schemas-sync-migrations)).
- `navigator.storage.persist()` should be requested on first course creation (Safari eviction is a real risk; see PITFALLS §5).
- `dumpAll`/`restoreAll` (`db.js:91`) must be updated: exclude `meta:secrets` (already excludes `settings` — extend), and exclude `_outbox`/`_sync` when they exist (device-local, not content).

### Streaming writes to the chat store

Do **not** write per token. Keep the in-progress assistant message in `appStore`, and persist the `chats` record on: (a) turn completion, (b) Stop, (c) route change/unmount, and (d) a ~1 s debounce during streaming. This keeps IndexedDB transactions short (long transactions block other tabs — a known IndexedDB footgun).

---

## 4. Security (Q4)

### BYOK keys in browser storage

- Store keys in `meta:secrets` (a single record), **not** in `settings`, so backup code has one obvious thing to exclude. `repo/backup.js` and `dumpAll` must whitelist rather than blacklist stores.
- IndexedDB is **not encrypted** and is readable by any same-origin script. Mitigations for v3.0 are architectural, not cryptographic:
  1. **No third-party scripts** in the Studio bundle; strict CSP (`default-src 'self'; connect-src 'self' https: http://localhost:3000 http://127.0.0.1:11434; script-src 'self'; object-src 'none'`). Note `connect-src` must list the provider origins you allow.
  2. A **"Clear all keys"** button (AI-03) that deletes `meta:secrets` and resets the settings key fields.
  3. Backups exclude secrets, and the UI says so in one line.
  4. **(Optional, future)** wrap key values with WebCrypto AES-GCM under a user passphrase — flagged as a SaaS-time consideration, not v3.0.
- Never log keys. `ProviderError` messages must be built from status codes and provider-safe text, never by echoing the request headers.

### XSS via rendered Markdown (LESSON-03)

- `react-markdown` **does not execute raw HTML by default** and the project must **never** add `rehype-raw`. This is the single most important control.
- Add a **URL transform**: only allow `http:`, `https:`, `mailto:` link targets; drop/blunt `javascript:`, `data:` (except an image allowlist if images are enabled), and unknown schemes. react-markdown exposes a `urlTransform` hook for exactly this; verify the current default behavior against the installed v10 and add the transform explicitly regardless.
- Enable `remark-gfm` (tables, task lists, autolinks) — needed for lesson tables — but note autolinks can surface `javascript:` only if the URL transform allows it, so the transform is the guard.
- Code blocks: render as **text** (`<code>`), never `dangerouslySetInnerHTML`. Syntax highlighting is a `STACK.md` decision; if added, ensure the highlighter does not inject HTML from the source.
- No `dangerouslySetInnerHTML` anywhere in Studio, and no `eval`.

### A public https origin calling http://localhost

Covered in §2. Summary of the boundary: **the bridge is a local feature**. On the deployed origin, Settings marks the bridge as unsupported-over-https, Chrome 142+ will require the Local Network Access permission (`loopback-network`), and Safari/Firefox may block it as mixed content ([Chrome LNA](https://developer.chrome.com/blog/local-network-access), [MDN](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Local_network_access)). The bridge adapter annotates `fetch(..., { targetAddressSpace: 'loopback' })` for forward compatibility. This is a documented limitation, not a bug.

### Bridge hardening checklist

- Origin allowlist (`STUDIO_ORIGINS`) + `X-Studio-Token` on every Studio route; `OPTIONS` handled.
- Bind to `127.0.0.1` only.
- Do **not** pass `--dangerously-skip-permissions` on the Studio path (contrast `web/server.js:383`).
- Cap request size and message count; cap `--max-budget-usd` if available for the CLI path to bound cost.
- The bridge already spawns the learner's own CLIs, so the threat model is "a malicious web page tricking the user's bridge into spending the user's subscription / reading the repo." The origin allowlist + token + `127.0.0.1` binding is the mitigation; document that `STUDIO_ORIGINS=*` is unsafe.

---

## 5. Component/Page Structure and Build Order (Q5)

### Routing (hash, static-host-safe — SHELL-02/DEPLOY-01)

```
#/                         Home
#/new                      NewCourse
#/course/:id               Course
#/course/:id/lesson/:index Lesson
#/review                   Review
#/settings                 Settings
```

`router.js` parses `location.hash`, matches a small pattern table, and `navigate(path)` sets `location.hash`. A `hashchange` listener updates `appStore.route`. No router dependency: raw hash routing needs ~40 lines and survives refresh/deep-link on any static host with `base: './'` (already set in `vite.config.js:9`).

### State (no state library)

- One `appStore.js` with `getState()`, `setState(patch)`, `subscribe(fn)`, consumed via `useSyncExternalStore`. React 19's `useSyncExternalStore` gives correct tearing-free external-store reads, which a hand-rolled `useState`+listener pattern does not.
- `AppContext` carries the async-ready *settings* object and the router route; everything else is read from the store.
- Streaming tokens: `providers` push into a **buffer**, and a `requestAnimationFrame`/50 ms flush calls `setState` once per frame (D9). `StreamText.jsx` renders the buffer.

### Layer map (what depends on what)

```
pages/  ──► components/ ──► store/ ──► repo/ ──► lib/db.js
   │            │
   └────────────┴──► providers/ ──► prompts/ + lib/{json,errors}
```

Nothing in `components/` imports `db.js` or `providers/` directly.

### Build order (phases + dependency gate)

| Phase | Deliverable | Depends on | Unlocks |
|-------|-------------|------------|---------|
| P1 | Shell: main/App/router/hash, `appStore`, `db.js` v2 + `repo/*`, Settings skeleton, Home empty-state, responsive layout | — | everything |
| P2 | Provider layer (`anthropic`, `openai-compatible`, `ollama`) + `ProviderForm` + `testConnection` + demo course loader | P1 | P3–P7 |
| P3 | Course creation: `prompts/syllabus` → `generateJson` → editable syllabus → confirm; Home list + progress | P2 | P4 |
| P4 | Lesson: `prompts/lesson` → `Markdown` render → mark done → progress/continue | P3 | P5, P6, P7 |
| P5 | Quiz: `prompts/quiz` → `QuizCard` → score + explanations | P4 | — |
| P6 | Flashcards: `prompts/cards` → SRS queue → `Review` page + due badge + streak | P4 | — |
| P7 | Tutor: `prompts/tutor` + `ChatPanel` + per-lesson chat persistence | P2, P4 | P8 |
| P8 | Bridge endpoint in `web/server.js` + `providers/bridge.js` + Settings "Local agent" + token UI | P2 (provider layer) | — |
| P9 | Backup/restore + `COURSE.md` export | P1, P3 | — |
| P10 | Static build check, void.cloud deploy docs, `SAAS-ROADMAP.md` | P1 | — |

P5/P6/P7 are independent and can run in parallel git worktrees **only if** the shared files are frozen: `db.js`, `repo/*`, `providers/index.js`, `store/appStore.js`, `router.js`, and `package.json`. Each parallel worker must own distinct files (e.g. `prompts/quiz.js` + `components/QuizCard.jsx` + `pages/Lesson.jsx`). See PITFALLS §9 for the coordination rules; a plan that lets two workers touch `App.jsx` or `db.js` at once will conflict.

---

## Architectural Patterns

### Pattern 1: Adapter facade with a normalized error type

**What:** Callers use one `streamText`/`generateJson`; each provider adapter translates transport + errors into the shared enum.
**When to use:** Two or more interchangeable backends behind identical product behavior.
**Trade-offs:** One extra indirection, but the UI has exactly one error-rendering path and one abort path.

### Pattern 2: Repo seam over a dumb store

**What:** `db.js` is key-value only; `repo/*` owns invariants (envelope stamping, tombstone filtering, migrations).
**Trade-offs:** Slightly more files now; the SaaS milestone replaces `repo`'s backend without touching pages/components.

### Pattern 3: Buffered streaming state

**What:** Provider `onText` appends to a buffer; a rAF/throttle flushes to the external store.
**Trade-offs:** Adds ~10 lines and a tiny latency (≤ one frame); prevents re-rendering the whole lesson per token.

### Pattern 4: Durable local write then network (future sync)

**What:** Local persist + enqueue in one transaction; network happens outside the transaction.
**Trade-offs:** Requires an outbox store (deferred to the sync version), but it is the only pattern that never loses a user action.

---

## Data Flow

### Syllabus generation (COURSE-01/02)

```
NewCourse form (topic, level, goal)
    ↓
appStore.startGenerate()
    ↓
prompts/syllabus.buildMessages(ctx)
    ↓
providers.streamText()  → onText → buffer → StreamText (live preview)
    ↓ (onDone)
generateJson validation (4–10 lessons, each {title, summary})
    ↓
repo.courses.create() + repo.lessons.bulkCreate()  → IndexedDB
    ↓
navigate('#/course/:id')
```

### Tutor turn (TUTOR-01..04)

```
Lesson page → ChatPanel.send(text)
    ↓
prompts/tutor.buildMessages({ lesson, course, history })
    ↓
providers.streamText({system, messages, sessionId, signal})
    ↓ (if provider===bridge)
POST http://localhost:3000/api/studio/complete  ← origin+token checked
    ↓ spawns claude/cursor/opencode (system-prompt, no tools) OR ollama
SSE: data:{content} … data:[DONE]
    ↓
buffer → StreamText ; on turn end repo.chats.save()
```

### State management

```
                 subscribe()
appStore ◄────────────────────── components (useSyncExternalStore)
   ▲                                   │
   │ setState(patch)                   │ user events
   └────────── actions ◄───────────────┘
                 │
                 ▼
              repo/*  ──► lib/db.js ──► IndexedDB (or memory fallback)
```

### Key data flows

1. **Generate-and-cache:** any AI artifact (lesson, quiz, cards) is generated once and stored; regeneration is explicit (LESSON-02). The repo is the cache.
2. **Progress:** `repo.lessons.setStatus()` → `appStore` recompute → Home progress ring + "continue learning" + streak.
3. **Review queue:** `repo.cards.due(now)` → `FlashcardReview` → `lib/srs.review()` → `repo.cards.save()`.

---

## Scaling Considerations

This is a **single-learner, local-first** app in v3.0, so scaling is about the SaaS transition, not traffic on day one.

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0–1k (v3.0) | Static bundle + IndexedDB + BYOK direct calls. No backend except the optional localhost bridge. Nothing to scale. |
| 1k–100k (hosted beta) | Add auth + a sync API + a managed-AI proxy. Serve the static site from a CDN/edge (void.cloud already edges static assets). Meter and rate-limit the proxy. |
| 100k+ | Add managed Postgres (or D1), read replicas/caching for the sync feed, queue-based generation for expensive artifacts, per-tenant quotas and billing. Evaluate whether sync stays last-write-wins or needs CRDTs. |

### Scaling priorities

1. **First bottleneck (hosted):** the shared provider key behind the managed proxy — rate limits, cost, abuse. Fix with per-user quotas, metering, and a queue; never expose the key client-side.
2. **Second bottleneck:** the sync changefeed — keep it a keyset cursor on `(updatedAt, id)` so it stays O(change), not O(data).
3. **Third:** chat/session storage for CLI bridge users (one process per session) — cap concurrent sessions and add timeouts.

## Anti-Patterns

### Anti-Pattern 1: Components talking to `db.js` directly

**What people do:** `useEffect(() => list('cards'), [])` inside `FlashcardReview`.
**Why it's wrong:** Every new write path must remember envelope stamping and tombstone filtering; the sync milestone must then touch every component.
**Do this instead:** call `repo.cards.due()`; components only know the repo.

### Anti-Pattern 2: `setState` per streamed token

**What people do:** `onText: (t) => setText(prev => prev + t)`.
**Why it's wrong:** Hundreds of renders per lesson; React 19 may batch some but long-form output still thrashes, and it fights the streaming render.
**Do this instead:** buffer + rAF/throttle flush (Pattern 3).

### Anti-Pattern 3: Adding `rehype-raw` "to render HTML in lessons"

**What people do:** enable raw HTML so generated lessons can include tags.
**Why it's wrong:** Turns model output into an XSS vector; a malicious/hallucinated `<script>` or event handler executes.
**Do this instead:** keep `react-markdown` defaults, add a URL transform, and instruct the model to emit GFM only.

### Anti-Pattern 4: Reusing `/api/chat` for Studio

**What people do:** point the bridge adapter at the existing SSE endpoint.
**Why it's wrong:** Drops the system prompt and prior turns on the CLI path, and writes `<file>` blocks into the repo — breaking pedagogy and the filesystem contract.
**Do this instead:** the dedicated `/api/studio/complete` (§2).

### Anti-Pattern 5: Treating CORS as authentication

**What people do:** "Only my origin is allowed, so the bridge is safe."
**Why it's wrong:** CORS is enforced by browsers, not servers; a local process (or the user's own curl) ignores it, and a user can set `STUDIO_ORIGINS=*`.
**Do this instead:** require the pairing token too, bind to `127.0.0.1`, and document the threat model.

### Anti-Pattern 6: One giant `courses` record holding every lesson's Markdown

**What people do:** keep the seed's embedded `lessons` array.
**Why it's wrong:** regenerating one lesson rewrites the whole record; a future sync transfers all lessons to move one.
**Do this instead:** the `lessons` store keyed by `courseId` (§3).

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Anthropic API | `@anthropic-ai/sdk` in browser, `dangerouslyAllowBrowser: true` → sends `anthropic-dangerous-direct-browser-access: true`; `messages.stream()` | Key in `meta:secrets`; org-level CORS may be disabled (surface the body verbatim). |
| OpenAI / OpenRouter / Groq / LM Studio | raw `fetch` + SSE to `<baseUrl>/chat/completions` | `ACAO` present on success; error responses may omit it → map to `NETWORK`. |
| Ollama `:11434` | `POST /v1/chat/completions` (OpenAI-compat) + `GET /api/tags` | Needs `OLLAMA_ORIGINS`; browser-only origin support. |
| Local `web/server.js` bridge | `POST /api/studio/complete` + `GET /api/studio/health`, SSE | Origin allowlist + `X-Studio-Token`; `127.0.0.1` only; https origin limited by LNA/mixed content. |
| void.cloud | `void deploy` / `void deploy --dir dist --spa` for static; later a Void app for API routes + D1/KV/R2 + auth | Static SPA supported; Void apps infer D1/KV/R2 bindings and support Workers AI — a natural home for the managed proxy and sync ([void deployment](https://void.cloud/guide/deployment), [app types](http://void.cloud/guide/app-types), [Cloudflare integration](https://void.cloud/integrations/cloudflare)). |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `pages` ↔ `components` | props + context | Components stay presentational. |
| `components`/`pages` ↔ `store` | `useSyncExternalStore` | Single external store; no prop-drilling of global state. |
| app ↔ `repo` | direct async calls | Only writer; owns envelope + tombstones + migrations. |
| `repo` ↔ `db.js` | promisified IndexedDB | `db.js` stays domain-ignorant; memory fallback preserved. |
| app ↔ `providers` | `streamText`/`generateJson`/`testConnection` | Adapter chosen by settings; one error enum. |
| app ↔ bridge | HTTP SSE | Token + origin gated; no filesystem side effects. |

---

## SaaS Evolution Path (Q6)

The local-first design is deliberately the offline half of the future system. Additions:

1. **Accounts / auth.** Add an auth token (opaque/refresh) in `meta:secrets` and an owner id on every record. A Void app with its built-in auth (or an external IdP) is a candidate host. UI: a Sign-in route; local-first data merges into the account on first sign-in.
2. **Sync.** Introduce the `_outbox` + `_sync` stores and a **remote adapter behind `repo/`**. Push: flush the mutation queue (idempotent ops, `updatedAt` precondition). Pull: keyset changefeed on `(updatedAt, id)` including tombstones; last-write-wins on `updatedAt`, with a "server wins on tombstones" rule. Ship `navigator.storage.persist()` and a visible sync status. No UI shape changes — only `repo` gains a backend.
3. **Managed AI proxy.** A serverless function (e.g. a Void API route on Workers) that holds the provider key, streams SSE back, and enforces per-user quota + metering. In the client, add a fifth provider `'managed'` that calls the proxy with the auth token; `providers/index.js` already isolates this. The BYOK adapters remain as the "bring your own key" escape hatch, so the offline/local path never breaks.
4. **Billing.** Metering records (tokens/calls per user) feed a plan entitlement check in the proxy; Stripe or Void's equivalents handle checkout/subscription. Not a v3.0 concern, but the proxy is where the seam belongs.
5. **Feature parity roadmap (Oboe-like):** audio/podcast lessons, richer lesson formats, community registry import, capstone. All are additive pages/services; none invalidate the architecture above. Documented in `studio/docs/SAAS-ROADMAP.md` (DEPLOY-03).

**Migration safety:** because `repo` is the only writer and the envelope already carries `id`/`updatedAt`/`deletedAt`, the client can be upgraded with sync **without a data migration for users** — the existing rows are already valid syncable records.

## Decisions & Assumptions (worker notes)

- **Chose a dedicated bridge endpoint** over extending `/api/chat`, because the CLI path's last-message-only + no-system-prompt behavior is unacceptable for a lesson-scoped Socratic tutor; extending `/api/chat` would also break the CLI web UI's `<file>` contract.
- **Chose to split `lessons`** out of `courses` now (schema v2) rather than later, because the app is pre-UI and the change is cheap; this avoids a painful migration once users have data.
- **Chose ISO-8601 UTC `updatedAt`** (consistent with the seed) over epoch ms; it sorts correctly and is human/backup friendly.
- **Chose raw `fetch`+SSE** for OpenAI-compatible over the `openai` package, to unify streaming/abort and dodge extra preflight headers with local servers.
- **Assumed feedback-loop-tooling is out of scope** for the tutor (chat only); if a future feature needs tool calls, the bridge's no-tools stance and the provider interface both need revisiting.
- **Assumed void.cloud** for both the static deploy and the later SaaS backend; the docs confirm static SPA deploys and D1/KV/R2/Workers AI bindings.
- **Marked UNVERIFIED:** the exact per-tool-restriction flags for `cursor-agent` and `opencode`; Safari/Firefox Local Network Access behavior; whether Anthropic's `/v1/models` list endpoint is universally available (prefer a tiny completion for `testConnection`).

## Sources

- Anthropic TypeScript SDK — browser + streaming + abort: https://platform.claude.com/docs/en/api/sdks/typescript
- Anthropic CORS browser header (PR + explanation): https://github.com/anthropics/anthropic-sdk-typescript/pull/504 , https://simonwillison.net/2024/Aug/23/anthropic-dangerous-direct-browser-access/
- Anthropic browser option + org CORS error: https://github.com/anthropics/anthropic-sdk-typescript/issues/248 , https://github.com/anthropics/anthropic-sdk-typescript/issues/741
- Claude Code CLI reference (`--print`, `--system-prompt`, `--append-system-prompt`, `--output-format stream-json --verbose --include-partial-messages`): https://code.claude.com/docs/en/cli-reference , https://code.claude.com/docs/en/headless
- OpenAI-compatible browser CORS reality: https://openpencil.dev/programmable/byok-provider-compatibility , https://community.openai.com/t/chat-completions-api-endpoint-down-blocked-any-web-browser-request/1362527
- OpenRouter quickstart: https://openrouter.ai/docs/quickstart
- Ollama OpenAI compatibility: https://docs.ollama.com/api/openai-compatibility
- Ollama CORS / `OLLAMA_ORIGINS`: https://objectgraph.com/blog/ollama-cors/ , https://github.com/ollama/ollama/issues/4388
- Local Network Access (supersedes Private Network Access): https://developer.chrome.com/blog/local-network-access , https://groups.google.com/a/chromium.org/g/blink-dev/c/lRnFRIfzDMU , https://developer.chrome.com/blog/pna-on-hold
- `fetch` `targetAddressSpace` / LNA defense guide: https://developer.mozilla.org/en-US/docs/Web/API/Request/targetAddressSpace , https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Local_network_access
- IndexedDB schema/migration + offline sync patterns: https://beefed.ai/en/indexeddb-pwa-schemas-sync-migrations , https://github.com/agents-inc/skills , https://backlex.com/docs/offline-sync/ , https://syncular.dev/blog/offline-first-writes/
- void.cloud deployment / app types / Cloudflare: https://void.cloud/guide/deployment , http://void.cloud/guide/app-types , https://void.cloud/integrations/cloudflare , https://void.cloud/reference/cli/deploy
- Repo sources read: `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md`, `web/server.js`, `studio/src/lib/{db,course,srs,json}.js`, `studio/vite.config.js`, `studio/index.html`, `studio/package.json`

---
*Architecture research for: Professor Studio (local-first multi-provider Socratic learning SPA)*
*Researched: 2026-10-15*
