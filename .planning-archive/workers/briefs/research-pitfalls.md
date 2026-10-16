# Task brief: Pitfalls research — milestone v3.0 Professor Studio

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
- Use the template structure at: /Users/tuankhuat/.claude/gsd-core/templates/research-project/PITFALLS.md

## Output
Write exactly one file: /Users/tuankhuat/Documents/Pet-Projects/course-learning-plugin/.planning/research/PITFALLS.md

## Questions to answer
For each pitfall give: warning signs, prevention, and which phase should address it.
1. Browser CORS per provider (Anthropic direct browser header, OpenAI, OpenRouter, Ollama OLLAMA_ORIGINS, LM Studio).
2. Mixed content / Private Network Access when an https site calls http://localhost (Chrome, Safari, Firefox behaviour).
3. Small local models producing invalid JSON for syllabus/quiz/flashcards; robust parsing + retry strategies.
4. Streaming parse bugs (SSE chunk boundaries, abort handling, React state updates per token).
5. IndexedDB pitfalls: Safari private mode, schema upgrades, storage eviction (`navigator.storage.persist`), quota.
6. API key leakage: backups, logs, error messages, XSS via rendered Markdown.
7. LLM hallucination in lessons; prompt injection; cost runaway (long lessons, retries).
8. SPA deep-linking / refresh on static hosts.
9. Pitfalls of delegating implementation to autonomous coding agents in parallel git worktrees (scope drift, merge conflicts on shared files, untested code, invented APIs) and how plans/briefs should prevent them.
