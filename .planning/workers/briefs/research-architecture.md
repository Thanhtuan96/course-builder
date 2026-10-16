# Task brief: Architecture research — milestone v3.0 Professor Studio

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
- Use the template structure at: /Users/tuankhuat/.claude/gsd-core/templates/research-project/ARCHITECTURE.md

## Output
Write exactly one file: /Users/tuankhuat/Documents/Pet-Projects/course-learning-plugin/.planning/research/ARCHITECTURE.md

## Also read
- web/server.js (especially POST /api/chat, streamViaCLI, getAgentCapabilities, CORS setup)
- studio/src/lib/db.js, studio/src/lib/course.js

## Questions to answer
1. Provider abstraction for studio: one interface (e.g. `streamText({system, messages, signal, onText})` and `generateJson(...)`) covering anthropic | openai-compatible | ollama | bridge; error taxonomy (auth, CORS/network, rate limit, refusal, bad JSON).
2. Bridge: reuse /api/chat as-is or add a minimal endpoint (e.g. POST /api/studio/complete accepting system+messages, returning plain SSE text, with CORS restricted to Studio origins + a pairing token). Note: for the claude CLI path the server forwards only the LAST user message and no system prompt — judge the impact.
3. Data model + IndexedDB schema versioning so a later sync layer can be added (ids, updatedAt, tombstones, per-store versions).
4. Security: BYOK keys in browser storage; a public https origin calling http://localhost (Private Network Access, CORS, token); XSS via rendered Markdown.
5. Component/page structure for the SPA and suggested build order with dependencies.
6. SaaS evolution path: what changes when adding accounts, sync and a managed-AI proxy (e.g. serverless function holding the provider key, metering).
