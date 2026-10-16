# Task brief: TUI stack research (for milestone v3.1, seed SEED-001)

Research only. Write exactly one file: /Users/tuankhuat/Documents/Pet-Projects/course-learning-plugin/.planning/research/TUI.md
Do not modify anything else. Cite URLs; mark unverified claims **UNVERIFIED**. Use web search/fetch; check npm versions live.

Context: read .planning/seeds/SEED-001-professor-tui.md and .planning/PROJECT.md. The CLI is `bin/cli.js` (Node ≥18, ES
modules, published to npm as `course-professor`, run via `npx`). Studio core code lives in `studio/src/lib/` (repo over
SQLite via node:sqlite, AI adapters using fetch + @anthropic-ai/sdk, SM-2, runners).

Answer:
1. OpenTUI (github.com/sst/opentui): what it is, React reconciler status, runtime requirements (Bun only? Node support?
   native binaries per platform?), maturity/stability, who uses it (OpenCode), markdown/code rendering, input/textarea,
   scrolling, mouse, and how an `npx`-installed Node CLI could ship it (bundled Bun? `bunx`? separate binary?).
2. Ink (vadimdemedes/ink) + ecosystem (ink-text-input, ink-markdown alternatives, Pastel): same questions for Node.
3. Other options worth a line: Rezi, blessed/neo-blessed, terminal-kit.
4. Markdown in the terminal (marked-terminal, cli-markdown, custom renderer), syntax highlighting, KaTeX/mermaid fallbacks.
5. Commander vs cac for this CLI (subcommands, help, ESM, TS).
6. Packaging TypeScript `packages/core` shared by a Vite browser app (Studio) and Node CLI/TUI: workspace layout
   (npm workspaces), build (tsup/tsdown), conditional exports, node:sqlite in Node vs IndexedDB in browser.
7. Isolated test grading for exercises in a TUI: options from simple (child process + timeout) to stronger isolation
   (WASM runtimes, containers, nsjail/sandbox-exec) with trade-offs for a local-first free tool.
8. Recommendation with a concrete stack + versions, risks, and a phased v3.1 plan.
