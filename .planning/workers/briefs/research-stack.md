# Task brief: Stack research — milestone v3.0 Professor Studio

## Context
Repo: /Users/tuankhuat/Documents/Pet-Projects/course-learning-plugin (Course Learning Plugin, "Professor" — a Socratic learning assistant for Claude Code / Cursor / Gemini CLI / OpenCode).
Read first: .planning/PROJECT.md (project + "Current Milestone: v3.0 Professor Studio").

Milestone v3.0 adds **Professor Studio** in `studio/`: a static Vite SPA (React 19, Tailwind v4, IndexedDB, hash routing) where a learner
generates a course from a prompt (topic + level + goal → syllabus), studies AI-generated Markdown lessons, takes quizzes,
reviews flashcards (SM-2 spaced repetition), and chats with a Socratic tutor per lesson. Pedagogy is HYBRID: lessons explain
fully (like https://oboe.com/), exercises/capstone and the tutor stay Socratic (never do the learner's work).
AI sources: BYOK Anthropic (official @anthropic-ai/sdk in the browser), OpenAI-compatible endpoints (OpenAI/OpenRouter/Groq/LM Studio),
Ollama local, and a "local agent bridge" to the existing `web/server.js` Express server on localhost (it spawns the learner's
Claude Code / OpenCode / Cursor CLIs; POST /api/chat streams SSE `data: {content}` then `data: [DONE]`).
Storage is local-first (IndexedDB), with JSON backup/restore. Deploy: static build on void.cloud (https://void.cloud/).
Long-term: an Oboe-style hosted SaaS (accounts, sync, managed AI).
Already present in studio/: package.json (react 19.3, react-markdown 10, remark-gfm 4, @anthropic-ai/sdk 0.134, vite 8.3,
@vitejs/plugin-react 6.1, tailwindcss + @tailwindcss/vite 4.3, vitest 5, fake-indexeddb 6.2) and seed modules
src/lib/db.js, srs.js, json.js, course.js.

Focus ONLY on what is needed for these NEW features (the CLI plugin itself is already validated).

## Rules
- Research only. Do NOT modify any file except your single output file below.
- Use web search / fetch to verify facts; cite sources (URLs) inline. Mark anything you could not verify as **UNVERIFIED**.
- Be concrete and prescriptive — the output feeds requirements and roadmap writing.
- Use the template structure at: /Users/tuankhuat/.claude/gsd-core/templates/research-project/STACK.md

## Output
Write exactly one file: /Users/tuankhuat/Documents/Pet-Projects/course-learning-plugin/.planning/research/STACK.md

## Questions to answer
1. Calling Anthropic from the browser with @anthropic-ai/sdk: `dangerouslyAllowBrowser`, the `anthropic-dangerous-direct-browser-access` CORS header, streaming via `client.messages.stream`, abort. Current model IDs to offer (verify on docs.anthropic.com / platform.claude.com).
2. OpenAI-compatible streaming from the browser (fetch + SSE parsing vs `openai` npm package) for OpenAI, OpenRouter, Groq, LM Studio; which of them allow browser CORS.
3. Ollama from a browser: OpenAI-compatible `/v1/chat/completions`, `OLLAMA_ORIGINS` setup per OS, model listing via `/api/tags`.
4. IndexedDB: keep the raw wrapper vs `idb` vs Dexie — recommend one considering a future sync layer.
5. void.cloud: what it is, how to deploy a Vite static build there (CLI commands, config file, SPA routing, env vars), free tier, and any built-in DB/KV/auth/AI that would help the later SaaS. Verify from void.cloud docs.
6. Markdown rendering safety and extras: sanitization needs with react-markdown (no rehype-raw), code highlighting, math (KaTeX) — which libs/versions, or explicitly "don't add".
7. What NOT to add (state managers, routers, UI kits) for this size of app, with reasons.
