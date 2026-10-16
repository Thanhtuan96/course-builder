# Task brief: Features research — milestone v3.0 Professor Studio

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
- Use the template structure at: /Users/tuankhuat/.claude/gsd-core/templates/research-project/FEATURES.md

## Output
Write exactly one file: /Users/tuankhuat/Documents/Pet-Projects/course-learning-plugin/.planning/research/FEATURES.md

## Questions to answer
1. What exactly does Oboe (https://oboe.com/) offer: course creation flow, lesson formats (text, audio/podcast, quizzes, games, flashcards), personalization, pricing tiers, notable UX patterns.
2. Comparable products (Khanmigo, Duolingo Max, NotebookLM study guides, Quizlet, Coursera Coach): which features are common.
3. Classify for an MVP local-first web studio: table stakes vs differentiators vs anti-features, each with complexity (S/M/L) and dependencies.
4. Why the hybrid Socratic approach is a differentiator and how to express it in the UI (e.g. tutor modes: explain / hint / check my answer).
5. First-run onboarding for BYOK/local users: provider setup wizard, connection test, zero-key demo course, privacy messaging.
6. Recommend the minimal v3.0 feature set and what to defer to the SaaS milestone.
