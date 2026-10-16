# Task brief: Phase 34b — Grounded lessons & verification in Studio (GROUND-01..06)

Own git worktree from `feat/studio-local-first` AFTER Phase 33 is merged (you are the only Studio worker). Small
conventional commits. Do NOT push.

Read first: `.planning/REQUIREMENTS.md` (GROUND-01..06, main repo), `studio/docs/FOLLOW-UPS.md`, `lib/prompts/{base,lesson,
tutor,practice,capstone}.js`, `lib/ai/*` (providers, generateJson, useStream), `components/course/LessonContent.jsx`,
`components/ui/Markdown.jsx`, `lib/repo/*` + `studio/migrations/*` (next number), `web/studio-api.js` (router, token/CORS,
runners), `lib/runner/*` (Phase 29). Evidence: an E2E lesson's Resources said "Wikipedia entries on … Verify links before
use" with zero URLs — lessons are generated from model memory only.

## Design
### 1. Source gathering (GROUND-01) — `lib/research/` (new)
`gatherSources({ course, lesson, language, signal }) → Source[]` where `Source = { id, url, title, publisher, tier,
accessedAt, excerpt, text }` (text capped ~6k chars each, 3–6 sources). Backends, picked automatically:
- **Local server present** (bridge configured): new route `POST /api/studio/research` in `web/studio-api.js` (inside the
  guarded router): searches Wikipedia (REST/Action API, the course language's wiki first, then en), Crossref (works
  search), arXiv (Atom API) and — for programming courses — a small allowlist of official docs search/sitemaps you can
  query without keys (e.g. MDN search API, docs.python.org search index is NOT an API → instead use Wikipedia + fetch the
  official docs URL the model proposes, validated against an allowlist of domains). Fetch pages server-side with:
  GET only, 8 s timeout, 1.5 MB cap, follow ≤3 redirects, **block private/loopback/link-local IPs after DNS resolution
  (SSRF)**, strip HTML to text (no new heavy deps; a small tag stripper + `<title>` extraction is enough).
- **BYOK Anthropic without server**: use the server tools `web_search_20260209` + `web_fetch_20260209` (citations) on the
  same request — read the claude-api docs in the SDK/README for the exact block shapes; map `web_search_tool_result` /
  citations to `Source` objects. Handle the error object shape (HTTP 200 with an error content block).
- **Fallback (no server, non-Anthropic)**: Wikipedia API directly from the browser (CORS-enabled with `origin=*`).
- Credibility tier rules: official/standard (official docs, standards bodies, .gov/.edu primary), peer-reviewed/textbook
  (Crossref/arXiv DOI), reference work (Wikipedia, Britannica), news, community/blog.
### 2. Grounded writing (GROUND-02)
`buildLessonMessages` takes `sources` and puts them in `<sources>` blocks with ids (via `wrapUntrusted`). Rules: cite key
claims as `[n]` using ONLY provided source ids; never invent URLs/titles/quotes; a claim with no source must be marked
`⚠️` inline; end with a Sources section rendered by the APP (not by the model) from the stored sources list. Store
sources: migration (`sources`, `lesson_version_sources(lesson_version_id, source_id, n)`), D1-safe, + repo functions.
### 3. Verification pass (GROUND-03, GROUND-04)
After generation (show the lesson immediately; verification runs after and updates badges):
- link check via the local server (`HEAD`/GET with the same SSRF guard) → alive + title similarity;
- excerpt check: quoted spans in the lesson must appear (normalized) in the source text;
- claim check: one `generateJson` call that extracts key claims with their `[n]` and judges each against the source text →
  `supported | unverified | contradicted` + short reason. Store in `claims` table (lesson_version_id, text, source_n,
  status, reason). UI: inline badges ✓ / ⚠️ / ✗ with a popover (source title, excerpt, "open source").
- programming: extract fenced code blocks marked runnable; run them with the Phase 29 runner (browser or local); mark
  "✓ ran" / "✗ failed: <first error line>".
### 4. Learner verification habit (GROUND-05)
- Lesson prompt adds a `🔎 Verify it yourself` section (SIFT: Stop · Investigate the source · Find better coverage · Trace
  to the original) — localized per course language (reuse Phase 33's localization helper).
- Tutor quick action "How can I verify this?" + tutor rule: ask "Where did you get that?" occasionally; never state
  uncited claims as certain.
- Practice: quiz generator includes one source-credibility question when sources exist.
- Capstone rubric: add "use and citation of sources" criterion (coordinate with Phase 33's capstone prompt — edit it).
### 5. Report wrong (GROUND-06)
Per-paragraph "Report" menu → reason → stored (`reports` table or a `notes` row with kind) → "Regenerate this section"
creates a NEW lesson version (never overwrite) with the report text fed to the prompt; history visible.

## Files you own
NEW `studio/src/lib/research/*`, `web/studio-api.js` (research + linkcheck routes only), NEW `web/studio-research.js`
(server-side fetch/search helpers), `studio/migrations/000N_grounding.sql`, `lib/repo/schema.js` + `lib/repo/index.js`
(sources/claims/reports functions), `lib/prompts/{lesson,tutor,practice,capstone}.js`, `lib/ai/anthropic.js` (server
tools option), `components/course/*`, NEW `components/sources/*`, `components/tutor/QuickActions.jsx`, tests, docs.

## Verify before reporting
1. All suites + build pass; SSRF tests (private IPs, redirects to private IPs, oversized bodies) for the server fetch.
2. Real run: `node bin/cli.js studio --no-open --port 5194 --api-port 3014` with a temp `PROFESSOR_HOME`, bridge provider
   (Claude Code): create a Vietnamese conceptual course, generate a lesson → Sources show real working URLs with tiers,
   claims have badges, `🔎 Verify it yourself` present. Paste the Sources section and claim summary in your report.
