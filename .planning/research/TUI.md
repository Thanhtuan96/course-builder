# TUI stack research — for milestone v3.1 (seed SEED-001)

**Author**: research worker `research-tui`
**Date**: 2026-10-15
**Scope**: pick a terminal-UI stack for `course-professor learn`, a TypeScript `packages/core`
shared by Studio (browser) and the CLI/TUI, and an isolated code-grading approach.
**Method**: live `npm view` against the registry, official docs, GitHub, and web search.
npm versions and weekly download counts below were fetched **2026-10-15**.
Claims I could not confirm from a primary source are tagged **UNVERIFIED**.

> **One-line answer**: Ship v3.1's TUI on **Ink 8 + React 19** (Node >= 22), not OpenTUI.
> OpenTUI has the better component model but cannot run inside `npx` on any current Node LTS
> (it needs Node 26.4+ with `--experimental-ffi`, or Bun). Keep a documented OpenTUI path for
> when it either drops the experimental-FFI requirement or we add a bundled-Bun binary channel.

---

## 0. Ground truth about this repo

- `package.json`: name `course-professor`, `"type": "module"`, `engines.node >= 18`,
  bins `course-professor` and `professor` -> `./bin/cli.js`.
  Deps: `chalk@^5`, `inquirer@^9`, `ora@^8`.
  Dev: `vitest@^4`.
- There is **no `packages/` dir and no npm workspace today** — the repo is a flat CLI plus a
  separate `studio/` Vite app (`professor-studio`, private, `engines.node >= 20`, React 19.3.1,
  vite 8, vitest 5, `fake-indexeddb`, `katex`, `mermaid`, `react-markdown`).
- `studio/src/lib/` is **ES-module JavaScript with JSDoc** (not TS): `repo/` with
  `idb-adapter.js`, `memory-adapter.js`, `remote-adapter.js`, `schema.js`; `ai/` (anthropic,
  ollama, openai-compatible, bridge, sse, `useStream.js`, catalog/config/errors/status);
  `prompts/`, `srs.js`, `course.js`, `ids.js`, `json.js`, `markdown.js`, `router.js`, `settings.js`.
- `studio/migrations/0001_init.sql` exists. `grep "node:sqlite"` across the repo returns
  **nothing** — the SQLite repository ("Phase 26") is *planned*, not implemented. Studio today
  runs on IndexedDB (`createIdbAdapter()` in `studio/src/lib/repo/index.js:13`).
- Dev machine has Bun 1.4.0 installed; end users cannot be assumed to.

So v3.1 is genuinely greenfield for: `packages/core` extraction, a TS TUI, a build pipeline,
and (optionally) a real SQLite repo.

---

## 1. OpenTUI (github.com/sst/opentui → opentui.com)

### What it is
- Native terminal-UI **core written in Zig** (GitHub language breakdown ~20% Zig) exposing a C ABI
  with **TypeScript bindings**; layered packages: `@opentui/core`, `@opentui/react`,
  `@opentui/solid`, `@opentui/keymap`, `@opentui/qrcode`, `@opentui/three`, `@opentui/ssh`.
  Source: https://opentui.com / https://github.com/anomalyco/opentui (the old `sst/opentui` URL
  redirects to the `anomalyco` org). MIT license. ~12.5k stars, 110 contributors, 90 releases.
- It is the TUI engine behind **OpenCode in production** (stated in the repo README and on
  opentui.com: "OpenCode uses it in production for millions of users"). OpenCode's TUI imports
  `@opentui/solid` (`packages/tui/src/app.tsx`), not React — see
  https://github.com/anomalyco/opencode/blob/dev/packages/tui/src/app.tsx.
- `terminal.shop` is listed as a future consumer (README).

### React reconciler status
- `@opentui/react@0.6.6` is a real reconciler (`react-reconciler@^0.33.0`), requires
  **React >= 19.2.0**, API is `createRoot(renderer).render(<App/>)` (the old `render()` export was
  removed). Docs: https://opentui.com/docs/bindings/react/
- Caveat, straight from the docs: *"React has no Node.js CI lane, so the repository does not
  establish the same Node.js confidence for React that it establishes for Core and Solid."*
  The **Solid** binding is the battle-tested path (that's what OpenCode ships).
  Source: https://opentui.com/docs/getting-started/runtime-support/

### Runtime requirements (the decisive constraint)
- **Bun 1.3.14+** (Bun 1.4 supported) — first-class, uses matching optional native package.
- **Node.js 26.4.0 or later**, **ESM only**, and **`--experimental-ffi` required** for native
  rendering. `require("@opentui/core")` fails (`ERR_REQUIRE_ASYNC_MODULE`).
  Source: https://opentui.com/docs/getting-started/runtime-support/
- Native binaries ship per platform via `optionalDependencies` (verified with `npm view`):
  `@opentui/core-{linux,win32,darwin}-{x64,arm64}` plus `-musl` variants for Linux. Root
  `@opentui/core` resolves `"bun"`/`"node"` conditioned entry points (`index.bun.js` vs
  `index.node.js`). `@opentui/three` and the runtime-plugin entry points are **Bun-only**.
- `@opentui/react` peers: `react >= 19.2.0`, optional `ws@^8`, `react-devtools-core@^7`.

### Maturity / stability
- Version **0.6.6** (pre-1.0). 346 published versions; **0.6.0 → 0.6.6 shipped in 4 days**
  (10–14 Oct 2026) — rapid, churning release cadence => pin exact versions.
- Weekly downloads `@opentui/core` ≈ **1,059,000/wk** (npm downloads API, 2026-10-15) — large,
  but inflated by being an OpenCode transitive dep, so it is not a proxy for third-party adoption.
- Node support is brand-new (PR #1149 "support Node.js 26 alongside Bun" merged 2026-06-08) and
  explicitly described as a *second target*. Treat Node as the beta lane.

### Components relevant to us (all from https://opentui.com/docs/components/)
- **Markdown** renderable: document structure + fenced code highlighted by Tree-sitter,
  `streaming:true` incremental mode (perfect for a streaming Socratic tutor), `conceal`,
  tables, `renderNode` override hook.
- **Code** renderable (Tree-sitter highlight, JS/TS/TSX/Markdown/Zig bundled), **Diff**,
  **LineNumberGutter**, **TextTable**.
- **Input** (single line), **Textarea** (multiline, cursor/selection/undo/redo, configurable key
  bindings), **Select**, **TabSelect**, **Slider**.
- **ScrollBox**/**ScrollBar** (real clipped scrolling + scrollbars).
- **Mouse is enabled by default** — `onMouseDown/Up/Move/Drag/Scroll`, text selection
  (double/triple click), `useMouse:false` to opt out.
  Source: https://opentui.com/docs/core-concepts/interaction/
- Focus: one focused renderable per renderer, `focus()/blur()`, focusable by default for
  Input/Textarea/Select/ScrollBox.

### How an `npx`-installed Node CLI could ship it
This is the crux and the docs address it directly (https://opentui.com/docs/ship/deploy/):
1. **Node ESM lane** — require Node 26.4+, ESM, `--experimental-ffi`, and the matching native
   package. A user on Node 20/22/24 gets a hard failure. **Not viable as the default `npx` path.**
2. **Node SEA** — bundle into a single Node executable; only build-time `getNodeAssets()` +
   extracting assets at startup + `OTUI_ASSET_ROOT` before Core loads. Acceptance CI is Linux x64
   only. Heavy, fragile, and still Node-26-only.
3. **Bun standalone executable** (the recommended production path) — `bun build --compile
   --target=<os>-<arch>[-musl]` once per platform, then publish binaries as npm
   `optionalDependencies` (the "archgate/esbuild" pattern) with a tiny Node shim that `spawn`s the
   right binary. Costs: a 5–8 target CI matrix, ~tens-of-MB binaries, macOS code-signing +
   notarization to avoid Gatekeeper quarantine. Bun also needs `bun install --os="*" --cpu="*"`
   to pull all native variants at build time.
4. **`bunx` / `npx bun`** — requires the user to have Bun, or downloads Bun (`bun` npm package
   `1.4.3` exposes `bun`/`bunx` bins). Adds a ~90MB runtime download for a tool that already
   needs Node. Ugly ordering, but a zero-CI fallback.

**Conclusion**: shipping OpenTUI inside the existing `npx course-professor` is only honest with a
per-platform compiled-binary channel. There is no "just works on Node LTS" path today.

---

## 2. Ink (vadimdemedes/ink) + ecosystem

- **ink@8.0.0** (published 2026-10-03), `"type":"module"`, **`engines.node >= 22`**; deps include
  `chalk@^6`, `yoga-layout@~3.2.1`, `react-reconciler@^0.34.0`, `wrap-ansi`, `string-width`.
  ~**7,900,000 downloads/wk** — the default React-for-terminal library.
- React 19; `render()`, `<Box>`, `<Text>`, `useInput`, `useFocus`, `usePaste`, Suspense,
  concurrent mode, Kitty keyboard, synchronized output (DEC 2026).
- Reported production users (third-party comparison, **UNVERIFIED** individually): Gatsby, Prisma,
  Terraform CDK, Shopify CLI, Claude Code. Source: https://silvery.dev/guide/silvery-vs-ink.html
- **Known gaps** (matter a lot for our "lesson reader + streaming tutor + notes" app):
  - **Scrolling**: `overflow` only supports `visible`/`hidden`; scroll support is the #1 open
    feature request (#222, open since 2019) per that comparison. You assemble it yourself or use
    `ink-scroll-view@0.4.0` (tiny, 2022-era).
  - **Mouse**: no support (that comparison; and `tui.json`-style mouse features are an OpenTUI
    thing). Click-to-focus / wheel scrolling must be hand-rolled.
  - **Text input**: not in core — use `ink-text-input@6.0.0` (single line; peers `ink>=5`,
    `react>=18`) or `@inkjs/ui@2.0.0` (`TextInput`, `Select`, `MultiSelect`, `Spinner`,
    `ProgressBar`, `ConfirmInput`, … ; ~498k/wk). No rich multiline editor with selection/undo by
    default.
  - **Syntax highlighting / markdown**: not built in (see §4).
  - Bundle cost: the comparison reports ~116.6 KB gzipped incl. the Yoga WASM blob.
- **Pastel@4.0.1** (`vadimdemedes/pastel`): Next.js-like file-based command framework on Ink
  (`commands/*.tsx` -> commands, `_app.tsx`, Zod options, auto help). Peers: `ink>=6`,
  `react>=19`, `zod>=4`; **uses Commander underneath**. ~25.2k/wk. Last publish 2026-03-21.
  Useful if you want conventions, but it constrains routing to its file layout and adds a layer
  over Ink + Commander. For a single `learn` command it is probably overkill.
- Related but out of scope: **Silvery** (`silvery@0.26.0`) — an Ink-compatible reimplementation
  claiming scroll/mouse/selection in core and better perf; very new, third-party, treat as
  **UNVERIFIED** and not a foundation choice.
- `tuil`/`@mwillbanks/tuil@1.0.2` and similar "Ink app frameworks" exist but are immature.

---

## 3. Other options (one line each)

- **Rezi** (`@rezi-ui/core`/`@rezi-ui/node@0.1.0-beta.2`, docs https://rezitui.dev): declarative
  `ui.*` widget API, routing/focus/forms/tables, rendered by a native **Zireael C engine via
  N-API prebuilt `.node` binaries**; Node >= 18.18 / Bun 1.3. TypeScript-first and genuinely
  interesting, but **0.1.0-beta**, tiny adoption (`@rezi-ui/core` ≈ 6.5k/wk; note an unrelated
  `rezi@1.0.0` package also exists with ~8/wk), and it ships native binaries — same distribution
  friction as OpenTUI with far less maturity. Watch, don't adopt.
- **blessed@0.1.81** — the 2015-era workhorse; effectively unmaintained, callback/imperative,
  no JSX. Skip.
- **neo-blessed@0.2.0** — community fork that revives blessed; still unmaintained-ish and no
  TS/JSX story. Skip.
- **terminal-kit@3.1.4** (~165k/wk, Node >= 16.13) — very capable imperative toolkit (widgets,
  tables, images, input, even inline graphics). Powerful but a big hand-rolled API surface with no
  React model; a reasonable fallback if we ever want zero-React and zero-native.

---

## 4. Markdown in the terminal

Options and their real constraints (all versions live-verified 2026-10-15):

| Library | Version | Notes |
|---|---|---|
| `marked-terminal` | 7.3.0 | ~8.0M/wk. **Peer is `marked >=1 <16`** — incompatible with `marked@18.1.1`. Must pin `marked@15.0.12`. Bundles `cli-highlight` (highlight.js), `cli-table3`, `node-emoji`, hyperlink support. |
| `cli-markdown` | 3.5.1 | markdown-it based, Node >= 16, ~3.2k/wk, includes `cli-highlight`. Small community. |
| `marked` + custom renderer | 18.1.1 | Full control; you own ANSI styling. |
| `ink-markdown` | 1.0.4 | Old/thin; probably unusable with ink@8. |
| OpenTUI `Markdown` renderable | 0.6.6 | Best UX: Tree-sitter highlighting, streaming mode, tables, conceal. Only inside OpenTUI. |

**Recommendation**: for Ink, render with `marked@15` + `marked-terminal@7.3.0` into an ANSI string
and wrap in Ink `<Text>`; use `cli-highlight`/highlight.js for fenced code. Keep the renderer
behind a `renderMarkdown(md): StyledText` seam in `packages/core` so a future OpenTUI port can
swap in `@opentui/core`'s `Markdown` renderable without touching lesson code.

**KaTeX / mermaid** — there is **no credible terminal renderer** for either (UNVERIFIED that any
production one exists):
- KaTeX: fall back to a Unicode/ASCII math transform (e.g. convert `\frac{a}{b}` to `(a)/(b)`,
  map common symbols), or show the raw `$$…$$` with dim styling and a one-line hint to open in
  Studio. Do **not** attempt a DOM render in the TUI.
- mermaid: no terminal renderer; show the fenced block as text, or auto-generate an ASCII/Unicode
  diagram for the common `graph`/`sequenceDiagram` cases, else hint "open in Studio". Treat both
  as **Studio-first content** in the TUI for v3.1.

---

## 5. Commander vs cac for this CLI

| | commander | cac |
|---|---|---|
| Latest | **15.0.0** (2026-05-29) | **7.1.0** (2026-10-11) |
| Node engine | **>= 22.12.0** | **>= 20.19.0** (older `cac@6` supported >= 8) |
| ESM / TS | ESM-first; bundled `.d.ts`; `@commander-js/extra-typings` for typed opts | Written in TS; ESM; good types |
| Deps / size | ~25 KB, no runtime deps | ~5 KB, zero deps, single file |
| Downloads | ~538M/wk | ~50.9M/wk |
| Strengths | Deeply nested subcommands, help groups, lifecycle hooks, custom help, stand-alone executable subcommands, huge ecosystem (Pastel uses it) | 4 APIs (`option/version/help/parse`), dot-nested options (`--env.X`), fast to learn |
| Gotcha | Bigger API; Node 22.12 floor | **Rejects unknown options**; less structure for deep nesting |

**Recommendation**: **Commander 15.0.0** for the TS CLI/TUI. The command surface is growing
(`init`, `setup`, `list`, `web`, and now `learn`/`run`/`check`/`review`), we want typed options in
TS, nested `learn` subcommands and help groups, and its ecosystem/maturity de-risks the choice.
Use `cac@7` only if the 20 KB footprint and npx cold-start are a hard priority. Either way the
**engine floor becomes Node >= 22.12** (commander 15) or **>= 20.19** (cac 7) for the modern CLI,
which pairs with the Ink-8 floor of Node >= 22. Note the existing `bin/cli.js` targets Node >= 18;
keep the plugin-installer paths (`init`/`setup`) on the legacy JS entry so `npx course-professor
init` keeps working on older Node, and only load the Ink/Commander TUI when `learn` is actually
invoked on a supported runtime.

---

## 6. Packaging TypeScript `packages/core` for both Studio (browser) and CLI/TUI (Node)

### Workspace layout (npm workspaces)
Adopt npm workspaces at the repo root (no Turborepo needed at this size):

```
package.json                     # "workspaces": ["packages/*", "apps/*"], private root
packages/core/                   # NEW TypeScript; extracted from studio/src/lib
  package.json  tsconfig.json  src/{repo,ai,prompts,srs,runner,course-reader}/index.ts
apps/cli/                        # existing bin/cli.js (+ new learn.ts) — ESM
apps/tui/                        # NEW Ink app (or OpenTUI later)
apps/studio/                     # move studio/ here; stays JS+JSDoc per seed decision
```
The seed already fixes this: **`packages/core` is TypeScript** (repo+migrations, ai adapters,
prompts, srs, runner, course-reader); **Studio and CLI stay JS+JSDoc and consume core.**

### Build: tsdown 0.23.1 (primary) vs tsup 9.0.0 (fallback)
- **tsdown** (Rolldown-based) — ESM-first, auto `.d.ts` when `types`/`typings` present, infers the
  compile target from `engines.node`, `workspace: 'packages/*'` monorepo mode, `exports: true`
  auto-generates the `exports` map, built-in `publint`/`attw` validation, and `exe: true` for a
  Node SEA. Docs: https://tsdown.dev/guide/how-it-works.
- **tsup 9.0.0** (esbuild) — the mature, boring choice; `tsdown`'s docs describe it as the
  spiritual predecessor and provide a migration path.
- Both are **build-time only** and require Node `^22.18 || ^24.11 || >=26` to run.
- `typescript@7.0.2` is current. Note TS 7 is the new compiler line — verify jsdoc/`checkJs`
  interop with the JS Studio consumer before committing.

**Recommendation**: **tsdown 0.23.1** for `packages/core` (ESM-only, auto-declaration, workspace
build, exports validation), with tsup 9 as the escape hatch if Rolldown/TS7 causes friction.

### Conditional exports (keep `node:sqlite` out of the browser bundle)
`packages/core/package.json`:
```jsonc
{
  "type": "module",
  "sideEffects": false,
  "engines": { "node": ">=22.13" },
  "exports": {
    ".":          { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./browser":  { "types": "./dist/browser.d.ts", "import": "./dist/browser.js" },
    "./node":     { "types": "./dist/node.d.ts",    "import": "./dist/node.js" }
  }
}
```
- `./browser` must contain **no** `node:*` imports; it exports the `IndexedDbAdapter` (reusing
  `studio/src/lib/repo/idb-adapter.js` logic) and browser AI adapters.
- `./node` exports the `SqliteAdapter` and the local-agent bridge.
- Studio's Vite config resolves `@professor/core` -> `@professor/core/browser` (or set a
  `browser` condition/alias); the CLI/TUI import `@professor/core/node`.
- Define a **`StorageAdapter`/`AiAdapter` interface in core's root** so both sides are typed
  against the same contract, mirroring today's `repo/index.js` adapter swap (`useAdapter()`).

### node:sqlite in Node vs IndexedDB in browser
- `node:sqlite` is built into Node (no native addon): available from **22.5**, unflagged from
  **22.13**, and **Release Candidate (Stability 1.2)** in Node 25.7+/26. It ties your SQLite
  version to the Node release but removes the `better-sqlite3` native-build pain — which fits the
  "local-first, no native binaries" goal. Source: https://nodejs.org/api/sqlite.html and
  https://github.com/photostructure/node-sqlite/blob/main/doc/library-comparison.md.
- Recommendation: set the **CLI/TUI floor to Node >= 22.13** (or 24 LTS) so the SQLite repo needs
  no flag. Studio keeps IndexedDB unchanged (browser has no `node:sqlite`).
- **Do not** import `node:sqlite` from the root entry; import it lazily/only inside `./node` so
  Vite never tries to bundle it.

---

## 7. Isolated grading of exercises in a TUI

**Threat model first.** In this product the "untrusted" code is *the learner's own exercise
solution*, typed seconds earlier. The realistic failure modes are accidental — infinite loops,
filling the disk, `rm -rf` in the wrong place, unexpected network calls, spawning a GUI — not a
determined sandbox escape. That justifies **lighter** isolation by default and makes heavyweight
containers overkill for v3.1, while still offering opt-in hardening.

Options, weakest → strongest:

1. **Child process + timeout + temp cwd** (baseline, should always exist)
   `spawn(langRunner, [], { cwd: jobDir, timeout, env: minimalEnv })`; kill the process tree on
   timeout; run inside a scratch dir seeded from the exercise; capture stdout/stderr/exit code;
   grade by parsing the language-native test runner's output. Portable, zero deps, works for any
   language. Cannot stop filesystem/network abuse on its own.
2. **Resource limits** — `setrlimit` via `ulimit`/`prlimit` (nproc, fsize, nofile),
   `OOMScoreAdjust`, wall-clock + CPU timeouts. Add per-job output caps. Cheap, big safety win.
3. **Node Permission Model** (`--permission`, experimental) — for JS/TS exercises, launch the
   child with `node --permission --allow-fs-read=<jobdir>` and no `--allow-child-process` /
   `--allow-net` / `--allow-workers`. Blocks fs write, child processes and network at the runtime
   level. Caveat: **experimental**, and incompatible with some native addons unless
   `--allow-addons`.
4. **`isolated-vm`** — a true separate V8 isolate: hard memory limit, CPU timeout, no Node API
   surface unless injected. Downsides: native addon (build/dist friction), **maintenance mode**,
   **no async/await or Promises inside the sandbox**, requires `--no-node-snapshot` on Node 20+.
   Good only for JS, sync-shaped exercises.
5. **`quickjs-emscripten`** (WASM) — strongest in-process isolation: a separate JS *engine* in a
   WASM linear memory with `setMemoryLimit()` + `setInterruptHandler()` timeouts, and no fs/net
   unless bridged. Downside: ES2020-ish, no npm/Node APIs, slower (interpreter), manual handle
   disposal; only useful for pure-JS exercises.
6. **OS sandbox** (strongest per-process, cross-language)
   - macOS: **`sandbox-exec` / Seatbelt** profiles. Formally **deprecated** by Apple and the SBPL
     language is undocumented, but it still works and is what Claude Code's `sandbox-runtime`,
     OpenAI Codex, Chromium and others use; Apple's own daemons rely on Seatbelt internally.
     Deprecation ≠ removal in the near term. Source:
     https://github.com/apple/containerization/issues/737 and
     https://developer.apple.com/forums/thread/661939.
   - Linux: **bubblewrap (`bwrap`) + seccomp** (namespaces + syscall filtering) or `nsjail`.
     Well-documented kernel features; needs `bwrap` installed (not always present).
   - Windows: no good lightweight equivalent today — fall back to baseline.
7. **Containers / microVMs** (Docker, gVisor, Apple Containerization) — strongest but require a
   container runtime, add ~hundreds of ms + hundreds of MB, break the "free, local-first, no
   setup" promise. Reserve for a future hosted/SaaS grader, not the local TUI.
8. **Avoid**: bare `node:vm` and **`vm2`**. `vm2` was deprecated in 2023 after repeated escapes,
   briefly revived, then hit **CVE-2026-22709 (CVSS 9.8)**; same-isolate Proxy sandboxes are
   fundamentally unsuited for untrusted code.
  Source: https://simonwillison.net/2026/mar/22/javascript-sandboxing-research/

**Recommended grading pipeline for v3.1** (all behind one `GradeRunner` interface in `core`):
1. Always: scratch temp dir + process tree kill + wall/CPU timeout + `ulimit`/`prlimit` +
   output caps (tiers 1–2). Language-native test command from the exercise spec
   (`node --test` / `vitest run` / `pytest` / `cargo test` …).
2. Add the **Node Permission Model** automatically for JS/TS exercises (tier 3).
3. If the platform sandbox binary exists (`/usr/bin/sandbox-exec` on macOS, `bwrap` on Linux),
   wrap the child automatically with a deny-by-default profile; if missing, log a one-line
   "reduced isolation" note. (tier 6)
4. Expose an opt-in `--strict` mode using `isolated-vm`/`quickjs-emscripten` for JS-only and
   containers for advanced users — not on the default path.
This is portable, dependency-light, honest about its limits, and degrades gracefully — the right
trade for a local-first free tool.

---

## 8. Recommendation, risks, and phased v3.1 plan

### Recommended stack (concrete versions)
- **Runtime floor**: Node **>= 22.13** for the CLI/TUI (`node:sqlite` unflagged; Ink 8 & Commander
  15 need >= 22). Keep the legacy `bin/cli.js` (`init`/`setup`) working on older Node.
- **TUI**: **`ink@8.0.0` + `react@19.3.1`**, with `@inkjs/ui@2.0.0` (inputs/select/spinner/
  progress) and `ink-text-input@6.0.0` where a single line is enough; `ink-scroll-view@0.4.0` or a
  small custom scrollbox for the lesson pane.
- **CLI parsing**: **`commander@15.0.0`** (+ `@commander-js/extra-typings` for typed options).
- **Markdown**: **`marked@15.0.12` + `marked-terminal@7.3.0`** (pin marked to 15; do not use
  marked 18), with `cli-highlight`. KaTeX/mermaid degrade to Unicode/text with a "open in Studio"
  hint. Keep it behind a `renderMarkdown()` seam.
- **Shared core**: **`packages/core` in TypeScript**, built with **`tsdown@0.23.1`** (fallback
  `tsup@9.0.0`), published internally via npm workspaces with `./browser` and `./node` conditional
  exports; `sideEffects:false`; `typescript@7.0.2`.
- **Storage**: `StorageAdapter` interface in core; **`node:sqlite`** adapter for Node (reuse the
  `migrations/0001_init.sql` lineage), **IndexedDB** adapter for Studio (today's code).
- **AI**: move the existing `studio/src/lib/ai/*` adapters (anthropic, openai-compatible, ollama,
  bridge, sse) into core unchanged; `@anthropic-ai/sdk@0.134.0`.
- **Grading**: child-process + timeout + `ulimit` + language test runner, then Node Permission
  Model for JS/TS, then auto-detected Seatbelt/bubblewrap; containers opt-in only.

### Why Ink over OpenTUI (the honest trade)
- OpenTUI has the **better components** (Markdown/Textarea/ScrollBox/mouse/streaming out of the
  box) and is production-proven in OpenCode — but it **cannot run under `npx` on Node 20/22/24**
  (needs Node 26.4 + `--experimental-ffi`, or Bun), and its **React binding has no Node CI lane**
  (Solid is the proven path; we want React per the seed). Shipping it means a per-platform
  compiled-binary channel with code-signing/notarization — disproportionate for v3.1.
- Ink runs wherever Node runs, has no native binaries, and its gaps (scroll/mouse/textarea/
  highlight) are all solvable with small, well-understood packages. We pay some UX and some
  plumbing; we keep a one-command `npx` install.

### Risks / open questions
- **Ink scrolling/mouse** are hand-rolled — budget real time for the lesson viewer and flashcard
  review; validate keyboard-only flows first (mouse protocols vary by terminal anyway).
- **`marked-terminal` peer mismatch** (`<16` vs marked 18): a silent foot-gun — pin `marked@15`.
- **TS 7.0.2 is new** — confirm `checkJs`/JSDoc interop for the JS Studio consumer, or build core
  with TS 6.x if TS 7 misbehaves (**UNVERIFIED** TS7 stability).
- **OpenTUI churn** — 0.6.x ships multiple releases/week; if we ever adopt it, pin exact versions
  and follow the Bun-compiled-binary path.
- **Node engine bump** from `>=18` to `>=22.13` for the TUI may surprise existing users; keep the
  legacy installer path Node-18-safe and gate only the `learn` command.
- **Permission Model / Seatbelt** are experimental or deprecated respectively; always fall back to
  tier-1 isolation and tell the user when isolation is reduced.
- **Rezi/Silvery** are pre-1.0 and native/third-party — watch only.

### Phased v3.1 plan
- **Phase 0 — Scaffold (workspaces + core extraction).** Add root npm workspaces; create
  `packages/core` (TS) by moving `studio/src/lib/{repo,ai,prompts,srs,course,settings,…}`; keep
  Studio on JS+JSDoc consuming `@professor/core/browser`. tsdown + `./browser`/`./node` exports +
  `publint`/`attw` in CI. **No user-visible change.**
- **Phase 1 — Node storage + runner ports.** Implement `SqliteAdapter` on `node:sqlite` (reuse
  `studio/migrations/0001_init.sql`), the `GradeRunner` (tier 1–2), and the markdown
  `renderMarkdown` seam. Port the existing CLI (`init/setup/list/web`) to `commander@15` behind
  the same `bin/cli.js` entry.
- **Phase 2 — Ink TUI MVP.** `course-professor learn`: dashboard (progress/streak/due cards) ->
  Markdown lesson pane (scrolling) -> exercise Run/Check -> streaming Socratic tutor (reuse
  `ai/useStream.js` / `sse.js`) -> flashcard review, all on the same SQLite DB as Studio and the
  CLI. Keyboard-first; a plain-text/`--no-tui` fallback when stdout is not a TTY.
- **Phase 3 — Hardening + polish (optional in 3.1, else 3.1.x).** Node Permission Model for JS/TS
  grading, auto-detected Seatbelt/bubblewrap, `--strict` mode; mouse/keyboard polish; `professor
  note`/`progress` parity in the TUI.
- **Phase 4 — Re-evaluate OpenTUI (v3.2+).** Trigger conditions: (a) OpenTUI supports Node LTS
  without `--experimental-ffi` and gains a React Node CI lane, **or** (b) we decide the bundled-Bun
  `optionalDependencies` binary channel is worth it. If so, port `apps/tui` from Ink to
  `@opentui/react`, swapping in native `Markdown`/`Textarea`/`ScrollBox` — the `packages/core`
  seams (`renderMarkdown`, `GradeRunner`, `StorageAdapter`) make this a UI-only port.

---

## Appendix — versions verified live 2026-10-15

| Package | Version | Node engine | Notes |
|---|---|---|---|
| `@opentui/core` / `@opentui/react` | 0.6.6 | Bun 1.3.14+ / Node 26.4+ (`--experimental-ffi`) | React needs React >=19.2; ~1.06M dl/wk (mostly transitive) |
| `ink` | 8.0.0 | >= 22 | ~7.9M dl/wk |
| `ink-text-input` | 6.0.0 | peers ink>=5, react>=18 | single line |
| `@inkjs/ui` | 2.0.0 | — | ~498k dl/wk |
| `pastel` | 4.0.1 | peers ink>=6, react>=19, zod>=4 | Commander inside; ~25k dl/wk |
| `marked` / `marked-terminal` | 18.1.1 / 7.3.0 | — | peer `marked >=1 <16` → pin marked@15.0.12 |
| `cli-markdown` | 3.5.1 | >= 16 | ~3.2k dl/wk |
| `terminal-kit` | 3.1.4 | >= 16.13 | ~165k dl/wk |
| `blessed` / `neo-blessed` | 0.1.81 / 0.2.0 | — | unmaintained |
| `@rezi-ui/core` / `@rezi-ui/node` | 0.1.0-beta.2 | Node >=18.18 / Bun 1.3 | native Zireael C engine; beta |
| `commander` | 15.0.0 | >= 22.12 | ~538M dl/wk |
| `cac` | 7.1.0 | >= 20.19 | ~50.9M dl/wk |
| `tsdown` / `tsup` | 0.23.1 / 9.0.0 | `^22.18 || ^24.11 || >=26` | build-time only |
| `typescript` | 7.0.2 | — | new compiler line |
| `react` | 19.3.1 | — | Studio already on ^19.3.1 |
| `@anthropic-ai/sdk` | 0.134.0 | — | already a Studio dep |
| `bun` (npm runtime pkg) | 1.4.3 | — | exposes `bun`/`bunx` bins |

### Key sources
- OpenTUI: https://opentui.com · runtime support https://opentui.com/docs/getting-started/runtime-support/
  · components https://opentui.com/docs/components/ · deploy https://opentui.com/docs/ship/deploy/
  · repo https://github.com/anomalyco/opentui · OpenCode TUI https://opencode.ai/docs/tui/
- Ink: https://github.com/vadimdemedes/ink · Pastel https://github.com/vadimdemedes/pastel
  · Ink vs Silvery comparison https://silvery.dev/guide/silvery-vs-ink.html (third-party, partly **UNVERIFIED**)
- Rezi: https://rezitui.dev
- `node:sqlite`: https://nodejs.org/api/sqlite.html
  · status table https://github.com/photostructure/node-sqlite/blob/main/doc/library-comparison.md
- Sandboxing: https://simonwillison.net/2026/mar/22/javascript-sandboxing-research/
  · https://github.com/justjake/quickjs-emscripten
  · macOS Seatbelt deprecation https://github.com/apple/containerization/issues/737
- Build: https://tsdown.dev/guide/how-it-works · Bun standalone https://bun.com/docs/bundler/executables
