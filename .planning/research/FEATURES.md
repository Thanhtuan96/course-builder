# Feature Research

**Domain:** Local-first AI learning studio (static web SPA) — hybrid pedagogy: explanatory lessons + Socratic exercises/tutor
**Milestone:** v3.0 Professor Studio
**Researched:** 2026-10-15
**Confidence:** HIGH for competitor features and provider mechanics; MEDIUM for exact current pricing tiers (they change); LOW/UNVERIFIED for items explicitly marked.

> Complexity scale used here: **S** ≈ <1 day, **M** ≈ 1–3 days, **L** ≈ >3 days (maps to LOW/MEDIUM/HIGH in the template).

---

## TL;DR — Recommended v3.0 Feature Set (answers Q6)

**Ship in v3.0 (all local, static, in `studio/`):**
1. Course-from-prompt with editable syllabus (hybrid: AI proposes → learner edits). *(COURSE-01/02, M)*
2. Lessons generated on demand, cached in IndexedDB, rendered safely from Markdown. *(LESSON-01/03, M)*
3. Quiz: 5 MCQs per lesson with per-question explanation + self-check score. *(PRACTICE-01, M)*
4. Flashcards + SM-2 review queue with due-count badge. *(PRACTICE-02/03, M; algorithm already seeded in `src/lib/srs.js`)*
5. Socratic tutor scoped to the lesson, with tutor-mode quick actions. *(TUTOR-01..04, L — this is the differentiator)*
6. Four AI sources: BYOK Anthropic, OpenAI-compatible, Ollama, local-agent bridge. *(AI-01..06, L)*
7. First-run onboarding wizard + connection test + **zero-key demo course**. *(new — see §5, M)*
8. JSON backup/restore (keys excluded) + `COURSE.md` export for plugin interop. *(DATA-01/02, S — `json.js`/`course.js` already seeded)*
9. Daily streak + days-studied on Home. *(PRACTICE-04, S — `streak()` already seeded in `course.js`)*
10. Static build + void.cloud deploy doc + `web/` bridge CORS/pairing hardening. *(DEPLOY-01..04, S/M)*

**Defer to v3.x (post-validation):** lesson regeneration polish, section notes, "explain simpler" quality tuning, accessibility pass, more quiz types (short-answer/fill-blank), per-topic glossary.

**Defer to the SaaS milestone:** accounts/sync, managed AI proxy + metering, billing, community course registry, audio/podcast lessons, capstone module, mobile app, collaboration, instructor tools. Rationale in §7.

The requirements already drafted in `.planning/REQUIREMENTS.md` are essentially correct; this research **validates them and adds the onboarding wizard + demo course framing as a launch-blocking differentiator-enabler** (see §5).

---

## 1. Oboe (oboe.com) — Deep Dive (answers Q1)

Oboe is the closest reference product. Launched **2025-09-10** by Anchor co-founders Nir Zicherman and Mike Mignano; raised **$16M from a16z (announced 2025-12-10)** ([TechCrunch launch](https://techcrunch.com/2025/09/10/after-selling-to-spotify-anchors-co-founders-are-back-with-oboe-an-ai-powered-app-for-learning/), [TechCrunch raise](https://techcrunch.com/2025/12/10/oboe-raises-16-million-from-a16z-for-its-ai-powered-course-generation-platform/)).

**Course creation flow** ([Getting Started](https://oboe.com/getting-started), [Oboe method/FAQ](https://oboe.com/faq)):
- One prompt box: *"I want to learn…"*, plus suggested topics.
- Oboe asks **one calibration question** ("I'm a complete beginner, keep it super basic") to pitch the level.
- It **works backwards from the learner's outcome** and builds a step-by-step learning path, then teaches through it in a chat.
- In v2 (Dec 2025) output was restructured into **chapters** that can be consumed as **text or podcast** ([Introducing the All New Oboe](https://oboe.com/blog/introducing-the-all-new-oboe)). Courses are freely shareable via public links.

**Lesson formats / artifacts** ([Tom's Guide review](https://www.tomsguide.com/ai/i-spent-a-week-using-the-latest-ai-learning-tool-heres-why-it-is-replacing-chatgpt-for-me), [FAQ](https://oboe.com/faq), [v2 blog](https://oboe.com/blog/introducing-the-all-new-oboe)):
- ~10-min reading "deep dive" (tables, real images from the web — not AI-generated) + ~2-min "key takeaways."
- **AI-generated podcast** (~7 min) and AI-generated **lecture** (~20 min); podcast tone adapts to the material.
- **Quizzes**, **FAQ**, **flashcards**, and a **game**; v2 embeds the *right format at the right time* contextually (quiz after material, flashcards as check-in points).
- Artifacts pulled on demand by slash commands: `/diagram`, `/podcast`, `/song`, `/studyguide`, `/flashcards`.
- A **Skills page** "tracks everything you've learned so far and levels up."

**Personalization:** publishes itself on a **multi-agent architecture** — parallel agents build course architecture, generate and *verify* base material, write podcast scripts, and pull real images; some agents audit others "LLM checks LLM" to reduce hallucination ([TechCrunch](https://techcrunch.com/2025/09/10/after-selling-to-spotify-anchors-co-founders-are-back-with-oboe-an-ai-powered-app-for-learning/), [The Verge](https://www.theverge.com/ai-artificial-intelligence/783624/oboe-ai-education-learning)). Claims to improve with usage like a human tutor.

**Pricing** ([TechCrunch, Dec 2025](https://techcrunch.com/2025/12/10/oboe-raises-16-million-from-a16z-for-its-ai-powered-course-generation-platform/), [FAQ](https://oboe.com/faq)):
- Free: unlimited course **creation**, but limited **chapter access**, rate-limited daily; every format available.
- **Oboe Plus — $15/mo ($144/yr):** more usage/chapters, priority support.
- **Oboe Pro — $40/mo ($384/yr):** unlimited chapters, priority generation, **export/download** courses for offline use.
- Note: an earlier launch model was **5 free courses/month** ([TechCrunch launch](https://techcrunch.com/2025/09/10/after-selling-to-spotify-anchors-co-founders-are-back-with-oboe-an-ai-powered-app-for-learning/)); the model changed to free creation + paid depth in Dec 2025.

**Notable UX patterns worth copying:**
- Single prompt box + calibration question (low blank-page friction).
- One integrated chat, with the *right format injected contextually* rather than a library of separate tools.
- Courselike chapter structure + a persistent "Skills" progress surface.
- Shareable public course links (viral loop) — note this is a **hosted** feature, so it belongs to our SaaS milestone.

**Weaknesses / open problems (our opportunities):**
- **Sourcing/citations were absent at launch**; The Verge could not verify a stat and had to find the source itself ([The Verge](https://www.theverge.com/ai-artificial-intelligence/783624/oboe-ai-education-learning)). Oboe said citations were "coming." Tremendous noted flashcards/quizzes appear in *some* sections but not all ([Tremendous](https://tremendous.blog/2025/12/12/how-to-make-a-great-ai-product-oboe/)).
- **Learner review flagged passivity**: "felt like a reading list vs. learning with a tutor… the joy is in the back-and-forth" — and Oboe's own v4 blog (2026-05-12) is a response to that ([Oboe v4](https://oboe.com/blog/v4)). **This is exactly the gap Professor's Socratic tutor fills.**
- Paywall friction is a common complaint ([Tom's Guide](https://www.tomsguide.com/ai/i-spent-a-week-using-the-latest-ai-learning-tool-heres-why-it-is-replacing-chatgpt-for-me)).

**UNVERIFIED:** the exact contents of Oboe's "Four New Features" (v4, 2026-05-12) — the fetched page body was truncated; only the framing (more interactivity) was readable. Also UNVERIFIED: whether Oboe now ships citations and whether the "game" format is still active post-v2.

---

## 2. Comparable Products — Common Features (answers Q2)

| Product | What it is | Notable features | Pricing |
|---------|-----------|------------------|---------|
| **Khanmigo** ([pricing](https://www.khanmigo.ai/pricing), [learners](https://www.khanmigo.ai/learners)) | Socratic AI tutor on top of Khan Academy content (GPT-4) | Explicitly **does not give answers**, "guides learners to find the answer themselves"; tutoring, writing coach, coding (JS/HTML/Python/SQL); parent view + moderation alerts; teacher tools free | **$4/mo ($44/yr)** US learners/parents; free for teachers |
| **Duolingo Max** ([Max](https://blog.duolingo.com/duolingo-max/), [Video Call](https://blog.duolingo.com/video-call/)) | Top subscription tier above Super Duolingo | **Video Call** with character "Lily" (real-time spoken convo, adapts to level, transcript after); **Roleplay** scenarios with AI feedback; Adventures; DuoRadio podcasts; speaking lessons | Max tier (above Super Duolingo) — exact price varies by region **UNVERIFIED** |
| **NotebookLM / Gemini Notebook** ([flashcards & quizzes](https://support.google.com/notebooklm/answer/16958963), [student features](https://blog.google/innovation-and-ai/models-and-research/google-labs/notebooklm-student-features/)) | Source-grounded study tool | Auto **flashcards + quizzes from your docs** with difficulty/size controls; **"Explain"** on any card/answer with in-line citations; Got it/Missed it progress that persists; shuffle; **Learning Guide** Socratic mode (probing open questions); Audio Overviews (Brief/Critique/Debate) | Free tier rate-limited; Pro tiers higher limits |
| **Quizlet** ([study modes](https://help.quizlet.com/hc/en-us/articles/360030841732-Studying-on-Quizlet), [spaced repetition](https://quizlet.com/gb/features/spaced-repetition)) | Flashcards-first study platform | 8 study modes; adaptive **Learn** (MCQ → written "retrieval"); **Test**; AI **Practice Tests**; **spaced repetition** with Again/Hard/Good/Easy (auto for 100+ card sets); smart grading; progress | Free + Plus / Plus Unlimited |
| **Coursera Coach** ([award](https://blog.coursera.org/coach-wins-newsweek-ai-impact-award/), [research](https://blog.coursera.org/coursera-coach-leveraging-genai-to-empower-learners/)) | LLM tutor grounded in course material | Persistent memory; **"Help me practice"** Socratic probing; 97% of catalog, 26 languages; authoring-side Dialogue/Role Play; higher first-attempt quiz pass rates | Bundled with Coursera; launched beta → broad rollout |

**Common features across comparables (the "market baseline"):**
- **Generate learning material from a prompt or from your own sources.**
- **Flashcards + quizzes**, often auto-generated, with an **explain** affordance.
- **Spaced repetition / adaptive review** (Quizlet, Anki-adjacent; NotebookLM's Got-it/Missed-it is lighter scheduling).
- **A Socratic/guiding tutor that deliberately withholds answers** (Khanmigo, Coach) — this is now table stakes among serious learning products, not just a nicety.
- **Progress tracking** (streaks, mastery, Skills page, per-item progress).
- **A chat surface** as the primary interaction.
- **Grounding/citations** to combat hallucination (NotebookLM's strongest differentiator).

**Where the market is weak — our wedge:**
- Socratic *tutoring* and *explanatory lessons* live in **separate products**. Oboe explains well but is passive; Khanmigo/Coach tutor but don't generate a full course; Quizlet drills but doesn't teach. **Professor's hybrid = one product that does both, deliberately.**
- Nothing local-first/BYOK in this list — every comparable is hosted, account-based, and meters AI usage. Professor Studio is **free, private, and offline-capable**, which is a distinct positioning on its own.

---

## 3. Feature Landscape (answers Q3)

### Table Stakes (Users Expect These)

Missing any of these and Studio feels like a demo, not a product. Complexity = S/M/L. Dependencies noted.

| Feature | Why Expected | Complexity | Notes / Dependencies |
|---------|--------------|------------|----------------------|
| Static SPA shell with hash routing + persistent data | It's a web app; deep links + refresh must work on a static host | S | Existing Vite scaffold; `db.js` already falls back to memory if IndexedDB unavailable |
| Course-from-prompt with **editable** syllabus | Every comparable starts here; hybrid (propose→edit) avoids blank-page + AI-fiat | M | `course.js` `makeCourse`/`parseCourseMarkdown` seeded; needs the syllabus-generation prompt + edit UI |
| Lessons generated on demand + cached | Core loop; regenerate to fix a bad lesson | M | Requires an AI provider (§4/§5) and IndexedDB caching |
| Safe Markdown rendering (GFM) | Lesson/quiz content is Markdown; raw HTML must not execute | S | `react-markdown` + `remark-gfm` already deps; **do not enable `rehype-raw`** |
| 5-question MCQ quiz w/ per-q explanation + score | Retrieval practice is the #1 expectation for "did I learn it" | M | Generated from lesson; self-check, not graded (see Anti-Features) |
| Flashcards + spaced-repetition review (Again/Hard/Good/Easy) | Quizlet/NotebookLM/Anki baseline; without it there's no retention loop | M | `srs.js` (SM-2) already seeded; needs Review page + due badge |
| Socratic tutor chat scoped to the lesson | Khanmigo/Coach baseline — a course without a tutor is just a doc | L | Prompt must carry lesson + course context; see §4 |
| Streaming responses + stop | Latency perception + trust; also needed for long generations | M | Anthropic SDK stream + `stream.controller.abort()`; bridge already sends SSE |
| Progress display (per-course bars, "continue learning") | Users must see movement | S | `progress()` + `nextLesson()` seeded |
| Local data persistence + JSON backup/restore | Trust: "my data is mine," survives browser reset | S | `dumpAll`/`restoreAll` seeded; **must exclude keys** (already excluded for `settings`) |
| Mobile-width responsive layout | Learners study on phones; Virus/leaders all do it | S | Tailwind v4; keep no-horizontal-scroll |
| Privacy message (keys/local) | Differentiator turned expectation once you claim local-first | S | Copy + one-click "clear keys" |

### Differentiators (Competitive Advantage)

These align with Core Value ("build real understanding by doing") and are what justifies Studio over ChatGPT/Oboe.

| Feature | Value Proposition | Complexity | Notes / Dependencies |
|---------|-------------------|------------|----------------------|
| **Hybrid pedagogy enforced in one product** | Lessons explain *fully* (Oboe-like), exercises/capstone/tutor stay Socratic (Khanmigo-like). No comparable does both | M (policy) + L (tutor) | Two distinct system prompts + a mode switch in the UI; see §4 |
| **Tutor modes as first-class UI** (Explain simpler / Give me a hint / Check my answer / Quiz me) | Turns abstract "Socratic" into buttons a beginner can use; layered hints mirror the CLI's hint layers | M | Quick-action chips in TUTOR-03; maps to SKILL.md hint layers |
| **Bring-your-own-key *and* local-agent bridge for free** | Zero marginal cost; works with a Claude Code/OpenCode/Cursor subscription; offline LLM via Ollama | L | 4 providers + connection test; bridge reuses `web/server.js` SSE contract |
| **Local-first, no account, no server DB** | Privacy + works offline; strongest non-price differentiator vs. every comparable | M | Already architectural (IndexedDB); express it in copy + onboarding |
| **`COURSE.md` interop with the Professor plugin/CLI** | A course started in the browser continues in Claude Code/Cursor/Gemini and vice-versa — unique in the market | S | `course.js` `toCourseMarkdown`/`courseFromMarkdown` seeded |
| **Zero-key demo course** | Lets a brand-new user feel the whole loop (lesson → quiz → flashcards → tutor) before configuring anything | M | Needs 1 bundled lesson + quiz + cards + a canned tutor persona (see §5) |
| **Streak + days-studied** | Habit loop; cheap retention win | S | `streak()` seeded |
| **Answer withheld by design, with guardrails tested** | Purpose-built vs. a general chatbot told to "act Socratic" | M | Guardrail prompt + refusal handling; evidence supports guarded tutors (see §4) |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Video lessons / embedded media** | "Richer learning" | Cost/complexity; invites passive consumption and contradicts text-first + already out of scope; Oboe only reaches it with a funded multi-agent pipeline | Text + diagrams (SVG/markdown), defer audio to SaaS |
| **"Show me the answer" button** | Frustration, time pressure | Directly violates the immutable Socratic rule; once shipped it's the most-clicked control and destroys the product's reason to exist | Layered `profesor:hint` (concept → pattern → pseudo-code) and `Check my answer` feedback |
| **Automated grading of open-ended exercises / points & XP** | Feels motivating, measurable | Project decision: learning is qualitative; scoring open-ended work contradicts Socratic method and invites gaming | Success-criteria checkboxes (as in CLI) + quiz self-check scores only |
| **Accounts / cloud sync in v3.0** | "Use it on my phone + laptop" | Breaks local-first and static-deploy constraints; adds auth/DB infra owned by the SaaS milestone | JSON backup/restore now; sync in SaaS |
| **Server-side storage of learner data in v3.0** | Convenience | Explicitly out of scope; contradicts "keys stay local" and static build | IndexedDB + user-controlled export |
| **Community course registry / leaderboards / classrooms** | Growth, social proof | Multi-user scope, moderation, and infrastructure; not needed to validate the solo loop | Defer to SaaS; local templates/imports only |
| **Real-time Oboe-style multi-agent content-verification pipeline** | Higher content quality, fewer hallucinations | 6+ parallel model calls per lesson is cost/latency-prohibitive for a free BYOK/local app and bursts learners' token budgets | Single-pass generation + an optional cheap "self-critique/regenerate" action; encourage citations in prompts |
| **Full audio/podcast generation in v3.0** | Oboe's signature, "listen on the go" | Cross-provider TTS is inconsistent (Ollama/local likely has none), adds cost and format plumbing | Defer to SaaS (AUDIO-01); keep lessons text/GFM |
| **Mobile native app** | Reach | Out of scope; a responsive PWA-width web app covers the need for v3 | Responsive SPA now; native later |

---

## 4. Why Hybrid Socratic Is the Differentiator, and How to Express It in the UI (answers Q4)

**Why it matters (evidence-backed):**
- The market's own reviews show the gap: Oboe was criticized as a "reading list vs. learning with a tutor" and shipped v4 explicitly to add interactivity ([Oboe v4](https://oboe.com/blog/v4)). Meanwhile Khanmigo and Coursera Coach differentiate precisely by *not giving answers* ([Khanmigo](https://www.khanmigo.ai/learners), [Coach](https://blog.coursera.org/coursera-coach-leveraging-genai-to-empower-learners/)).
- Controlled evidence that design (not raw model access) drives outcomes: a 2025 PNAS field experiment (~1,000 students) found that after AI support was removed, students using a **general** GPT interface scored **17% lower** than the no-AI control, while a **guardrailed hint-only tutor largely mitigated the loss** ([summarized here](https://blueapprentice.com/ai-tutor-vs-homework-help/)).
- Khanmigo is the only AI tool in the category to score 4/5 from Common Sense Media specifically because it guides rather than answers ([Khanmigo](https://www.khanmigo.ai/)).
- Socratic **prompting alone is fragile** — a determined learner can talk a general chatbot past "never give the answer" ([Ken Arnold / GPT-4 example](https://kenarnold.org/posts/simplify-context/)). This argues for **UI-level enforcement** (no answer button) *and* a strong guardrail prompt with refusal handling, exactly as the plugin's Absolute Rules prescribe.

**Product framing:** *"Lessons teach. Practice and the tutor make you think."* Explainability in lessons is not a compromise — it's what Oboe proves learners want; withholding answers in exercises/tutor is what Khanmigo/Coach prove improves outcomes. Professor is the first product that switches behavior deliberately based on *where you are*.

**UI expression (concrete):**
1. **Two system prompts, one mode switch.** `lesson` context → "explain fully, use analogies, no withholding." `exercise`/`tutor` context → Socratic rules from SKILL.md (never write the work; layered hints; ask before answering). The tutor prompt should include the lesson content + course goal + level so it can pitch explanations.
2. **Tutor mode chips** (TUTOR-03) — the abstract method made tangible:
   - **Explain simpler** → "explain fully but at a lower level" (allowed: this is explanation, not the exercise answer).
   - **Give me a hint** → layer 1 conceptual → layer 2 pattern/tool → layer 3 pseudo-code shape; never the working solution.
   - **Check my answer** → structured Socratic feedback (what's working → one question → one concept → next action), never a rewrite.
   - **Quiz me** → 5 retrieval questions at the learner's level.
3. **No answer affordance.** Do not render a "reveal solution" control anywhere in the exercise/capstone surfaces. (Anti-feature, enforced in the component tree.)
4. **Guardrail behavior surfaced.** If a provider refuses or the tutor is pressured for the answer, show a readable message that reframes toward a hint (AI-05 requires surfacing refusals).
5. **Lesson vs. practice visually distinct.** Lessons read like an article (calm, explanatory); the tutor/exercise panel reads like a conversation with hint states. This prevents users from expecting answers in the Socratic surface.
6. **The capstone rule is a phase** (deferred to v3.x/SaaS): when unlocked, hints and `profesor:stuck` disappear. Document the rule now, implement later (CAP-01).

**One nuance to design for:** the "Explain simpler" chip is the most likely vector for answer leakage (a "simpler explanation" of an exercise can be the solution). Scope "Explain simpler" to *lesson concepts*, and in exercise context restrict it to rephrasing the *problem*, not solving it.

---

## 5. First-Run Onboarding for BYOK / Local Users (answers Q5)

**Goal:** a first-time user reaches "≥1 lesson + quiz loop in the first session" (the milestone success metric) **without a wall of configuration**. Every comparable has zero-setup onboarding; BYOK/local is our differentiator but also our biggest activation risk.

**Recommended flow (single wizard, skippable):**

1. **Welcome + privacy line first.** One sentence: "Everything stays in your browser. Your API keys are never uploaded or included in backups." This is a genuine differentiator — lead with it.
2. **Pick your AI source** (radio + short "why choose me" descriptions):
   - **Anthropic (API key)** — paste key; default model selectable (Sonnet/Haiku/Opus per AI-05).
   - **OpenAI-compatible** — base URL + key + model (OpenAI, OpenRouter, Groq, LM Studio).
   - **Ollama (local)** — URL (default `http://localhost:11434`) + model picker.
   - **Local agent bridge** — URL of the `web/` server (default `http://localhost:3000`); no key needed.
3. **Connection test** (`AI-02`) with **provider-specific, actionable errors**:
   - Anthropic: "Invalid API key" / "Rate limited — try again" / model-not-found.
   - OpenAI-compatible: distinguish "bad key" from "endpoint reached but CORS blocked" — these look identical to fetch. Message: "Could not reach this endpoint from the browser — check the base URL and that the provider allows browser (CORS) calls." (Verification recipe and rationale in [OpenPencil BYOK compatibility](https://github.com/open-pencil/open-pencil/blob/master/packages/docs/programmable/byok-provider-compatibility.md).)
   - Ollama: detect "not running" vs "CORS/`OLLAMA_ORIGINS` not set." Default Ollama allows only `localhost`/`127.0.0.1`/`0.0.0.0` origins; a hosted static origin needs `OLLAMA_ORIGINS` set (and restart), e.g. `OLLAMA_ORIGINS=https://your-app.example ollama serve` ([Ollama FAQ](https://docs.ollama.com/faq), [ObjectGraph](https://objectgraph.com/blog/ollama-cors/)). Surface that exact instruction.
   - Bridge: "Bridge not running — start it with `node web/server.js`" and confirm the SSE contract (`data: {content}` … `data: [DONE]`).
4. **Zero-key demo course** (COURSE-04) — the safety net. If the user skips or the test fails, offer "Try a demo course" that is fully bundled (one lesson, one quiz, a few flashcards, a scripted tutor persona) so the loop is walkable with **no provider at all**. This protects the success metric.
5. **First course prompt** — topic + level + goal, then the editable syllabus (COURSE-01/02).
6. **Key management** — Settings: masked key, "Replace", and **"Clear all keys" one-click** (AI-03); keys stored only in `meta.settings` and filtered out of `dumpAll()` (already implemented in `db.js`).

**Onboarding decisions to log:** make the wizard **skippable** (power users hate gates); the demo course must be **bundled, not generated** (no provider dependency); show the privacy statement on the welcome step, not buried in Settings.

**Bridge security (ties to DEPLOY-04):** the local bridge must accept the Studio origin via a **CORS allowlist + a pairing token** (not `*`), and its docs must explain running it. This is both a security requirement and part of onboarding ("how do I use my Claude Code subscription for free").

---

## 6. Feature Dependencies

```
[Course from prompt]
    └──requires──> [AI Provider (any of 4)]
                       └──requires──> [Connection test]

[Lesson generation]
    └──requires──> [AI Provider] ──and──> [Safe Markdown renderer]

[Quiz generation] ──requires──> [Lesson]
[Flashcards generation] ──requires──> [Lesson] ──and──> [SM-2 queue (srs.js)]

[Socratic tutor chat]
    └──requires──> [Lesson context in prompt]
    └──requires──> [Streaming]
    └──requires──> [Tutor-mode rule set (hybrid pedagogy)]

[Progress / streak] ──requires──> [Lesson done events]

[JSON backup/restore] ──requires──> [IndexedDB layer (db.js)]
[COURSE.md export] ──requires──> [Course model (course.js)]

[Dynamic deploy to void.cloud]
    └──requires──> [Static build + relative base + hash routing]

[Zero-key demo course] ──requires──> [bundled content only]   ← intentionally NOT dependent on AI Provider

[Local agent bridge] ──requires──> [web/server.js SSE] ──and──> [CORS allowlist + pairing token]

[Managed AI / sync / billing] ──requires──> [accounts backend]  ← SaaS milestone only
```

### Dependency Notes

- **Course → Provider.** Nothing generates without a provider or the demo course; the provider layer (and its test) must be the first Studio feature built. The demo course intentionally breaks this dependency so the product is walkable at zero setup.
- **Quiz/Flashcards → Lesson.** Both are derived artifacts; lesson caching is a prerequisite for regeneration economics and for offline review.
- **Tutor → lesson context + hybrid rules.** The tutor is the highest-value and highest-risk feature: it needs the lesson in-prompt *and* the Socratic guardrails to avoid becoming "ChatGPT with a costume."
- **Bridge conflicts with `*` CORS.** The bridge cannot be opened wide for convenience without becoming a local RCE-adjacent footgun; use allowlist + pairing token (DEPLOY-04).
- **Audio conflicts with "provider-agnostic."** TTS isn't uniformly available across Ollama/OpenAI-compatible/local; it would force a hosted dependency — defer.
- **SM-2 already exists** in `src/lib/srs.js` (grade 0–3, ease floor 1.3, 10-min relearn on lapse) — a faithful, simplified SM-2 vs. the original 0–5 scale ([SuperMemo SM-2](https://www.super-memory.com/english/ol/sm2.htm)). The Review UI is the missing piece, not the algorithm.

---

## 7. MVP Definition

### Launch With (v3.0)

- [ ] **AI provider layer (4 sources) + connection test** — everything depends on it; the demo course covers the no-provider path
- [ ] **Course from prompt with editable syllabus** — the entry point and hybrid-creation contract
- [ ] **Lesson generation + cache + safe GFM rendering** — the core learning artifact
- [ ] **Quiz (5 MCQ, explained, self-scored)** — retrieval practice; validates the loop
- [ ] **Flashcards + SM-2 review page + Home due-badge** — retention; algorithm already seeded
- [ ] **Socratic tutor scoped to lesson + tutor-mode chips** — the differentiator; must ship in v3.0
- [ ] **Progress + streak + "continue learning"** — habit and orientation
- [ ] **IndexedDB persistence + JSON backup/restore (keys excluded)** — trust and portability
- [ ] **`COURSE.md` export/import interop** — unique cross-tool story, cheap (seeded)
- [ ] **Zero-key demo course** — protects the activation metric
- [ ] **Static build + void.cloud deploy doc + bridge CORS/pairing hardening** — required to be real
- [ ] **Responsive layout + privacy messaging + one-click key clear**

### Add After Validation (v3.x)

- [ ] **Lesson regeneration polish + self-critique pass** — trigger: users report low-quality lessons
- [ ] **More quiz types (short answer, fill-in-blank, multi-select)** — trigger: MCQ too easy/guessable (NotebookLM is adding these, [Sept 2026](https://blog.google/innovation-and-ai/products/gemini-notebook/new-study-tools-september-2026/))
- [ ] **Per-topic glossary / key-terms artifact** — trigger: requests for quick-reference (Oboe "key takeaways")
- [ ] **Notes per course (NOTES.md parity)** — trigger: learners want to annotate lessons
- [ ] **Improved "Explain simpler" tuning + accessibility pass** — trigger: UX review
- [ ] **Deep-link sharing of a single lesson** (local file export) — trigger: sharing requests

### Future Consideration (SaaS milestone)

- [ ] **Accounts + cloud sync (SYNC-01)** — needs backend; enables multi-device
- [ ] **Managed AI proxy + metering (MANAGED-01)** — turns free/BYOK into paid convenience
- [ ] **Billing / subscription tiers** — the Plus/Pro analogue (Oboe $15/$40; Khanmigo $4)
- [ ] **Community course registry import (REG-01)** — needs hosted hub
- [ ] **Audio/podcast lessons (AUDIO-01)** — Oboe's signature; needs TTS infra
- [ ] **Capstone module with unlock (CAP-01)** — complete the "hybrid" arc across a milestone, not just a lesson
- [ ] **Mobile app / PWA install** — after web validates
- [ ] **Multi-agent content verification pipeline** — only when unit economics allow

---

## 8. Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| AI provider layer (4 sources) + test | HIGH | HIGH | P1 |
| Course from prompt (editable syllabus) | HIGH | MEDIUM | P1 |
| Lesson generation + cache | HIGH | MEDIUM | P1 |
| Safe Markdown rendering | HIGH | LOW | P1 |
| Quiz (5 MCQ + explanations) | HIGH | MEDIUM | P1 |
| Flashcards + SM-2 review | HIGH | MEDIUM | P1 |
| Socratic tutor + mode chips | HIGH | HIGH | P1 |
| Progress + streak | MEDIUM | LOW | P1 |
| JSON backup/restore (no keys) | HIGH | LOW | P1 |
| `COURSE.md` interop | MEDIUM | LOW | P1 |
| Zero-key demo course | HIGH | MEDIUM | P1 |
| Static deploy + bridge hardening | HIGH | MEDIUM | P1 |
| Responsive + privacy messaging | MEDIUM | LOW | P1 |
| Lesson regeneration polish | MEDIUM | LOW | P2 |
| More quiz types | MEDIUM | MEDIUM | P2 |
| Notes / glossary | LOW | LOW | P2 |
| Deep-link lesson share | LOW | LOW | P3 |
| Audio lessons | MEDIUM | HIGH | P3 |
| Capstone module | MEDIUM | MEDIUM | P3 |
| Accounts/sync/billing/managed AI | HIGH | HIGH | P3 (SaaS) |

**Priority key:** P1 = launch-blocking for v3.0; P2 = add after validation; P3 = future/deferred.

---

## 9. Competitor Feature Analysis

| Feature | Oboe | Khanmigo / Coach | Quizlet / NotebookLM | Our Approach (v3.0) |
|---------|------|------------------|----------------------|---------------------|
| Generate course from prompt | ✅ chapters, calibration question | ❌ (tutor over existing content) | ⚠️ NotebookLM needs sources; Quizlet user-authored | ✅ topic+level+goal → editable syllabus |
| Explanatory lessons | ✅ text + podcast + lecture | ⚠️ tutoring only | ⚠️ summaries/study guides | ✅ Markdown lessons, full explanation (Oboe-like) |
| Socratic tutor that withholds answers | ❌ (passive; v4 adds interactivity) | ✅ core feature | ⚠️ NotebookLM Learning Guide; Quizlet drills | ✅ hybrid: Socratic in exercises/tutor only |
| Quizzes | ✅ contextual | ⚠️ practice questions | ✅ customizable, explain-on-wrong | ✅ 5 MCQ with explanations |
| Flashcards + SRS | ✅ (lighter scheduling) | ❌ | ✅✅ (Quizlet SRS, NotebookLM got-it/missed-it) | ✅ true SM-2 (already seeded) |
| Progress / streaks / Skills | ✅ Skills page | ✅ mastery | ✅ progress + streak-like | ✅ progress + streak (local) |
| BYOK / local model / offline | ❌ hosted only | ❌ cloud (GPT-4) | ❌ cloud only | ✅ 4 sources incl. Ollama + local agent bridge |
| No account, data stays local | ❌ | ❌ | ❌ | ✅ local-first IndexedDB |
| Citations / grounding | ⚠️ weak (improving) | ✅ grounded in Khan content | ✅✅ grounded in sources | ⚠️ prompt for sources; not a v3 hard guarantee |
| Export / interop | ✅ Pro tier | ❌ | ❌ | ✅ JSON + `COURSE.md` (plugin interop) |
| Price to learner | Free (limits) / $15 / $40 | $4/mo | Free / Plus | **Free** with own key/agent |

**Key insight:** Oboe proves the market wants generated courses but is *passive*; Khanmigo/Coach prove learners benefit from guided, answer-withholding tutoring but *don't generate courses*. Professor's unique position: **one free, local-first studio that explains when you read and withholds when you practice** — plus plugin interop no competitor can match.

---

## 10. Sources

**Reference product (Oboe):** [oboe.com FAQ](https://oboe.com/faq), [Getting Started](https://oboe.com/getting-started), [Introducing the All New Oboe (Dec 2025)](https://oboe.com/blog/introducing-the-all-new-oboe), [Four New Features (v4, May 2026)](https://oboe.com/blog/v4), [TechCrunch launch](https://techcrunch.com/2025/09/10/after-selling-to-spotify-anchors-co-founders-are-back-with-oboe-an-ai-powered-app-for-learning/), [TechCrunch $16M raise + pricing](https://techcrunch.com/2025/12/10/oboe-raises-16-million-from-a16z-for-its-ai-powered-course-generation-platform/), [The Verge (sourcing critique)](https://www.theverge.com/ai-artificial-intelligence/783624/oboe-ai-education-learning), [Tom's Guide review](https://www.tomsguide.com/ai/i-spent-a-week-using-the-latest-ai-learning-tool-heres-why-it-is-replacing-chatgpt-for-me), [Tremendous review](https://tremendous.blog/2025/12/12/how-to-make-a-great-ai-product-oboe/)

**Comparables:** [Khanmigo pricing](https://www.khanmigo.ai/pricing), [Khanmigo learners](https://www.khanmigo.ai/learners); [Duolingo Max](https://blog.duolingo.com/duolingo-max/), [Duolingo Video Call](https://blog.duolingo.com/video-call/), [Duolingo updates](https://blog.duolingo.com/duolingo-updates/); [NotebookLM flashcards/quizzes help](https://support.google.com/notebooklm/answer/16958963), [NotebookLM student features](https://blog.google/innovation-and-ai/models-and-research/google-labs/notebooklm-student-features/), [NotebookLM new study tools (Sept 2026)](https://blog.google/innovation-and-ai/products/gemini-notebook/new-study-tools-september-2026/); [Quizlet study modes](https://help.quizlet.com/hc/en-us/articles/360030841732-Studying-on-Quizlet), [Quizlet spaced repetition](https://quizlet.com/gb/features/spaced-repetition); [Coursera Coach award](https://blog.coursera.org/coach-wins-newsweek-ai-impact-award/), [Coursera Coach research](https://blog.coursera.org/coursera-coach-leveraging-genai-to-empower-learners/)

**Provider / technical mechanics:** [Anthropic TypeScript SDK (browser)](https://platform.claude.com/docs/en/api/sdks/typescript), [Anthropic SDK `dangerouslyAllowBrowser`](https://github.com/anthropics/anthropic-sdk-typescript/blob/main/src/client.ts), [Simon Willison on Anthropic CORS](https://simonwillison.net/2024/Aug/23/anthropic-dangerous-direct-browser-access/), [Ollama FAQ (`OLLAMA_ORIGINS`)](https://docs.ollama.com/faq), [ObjectGraph Ollama CORS guide](https://objectgraph.com/blog/ollama-cors/), [OpenPencil BYOK provider compatibility](https://github.com/open-pencil/open-pencil/blob/master/packages/docs/programmable/byok-provider-compatibility.md), [Groq OpenAI compatibility](https://console.groq.com/docs/openai)

**Pedagogy evidence:** [PNAS 2025 field experiment summary (guarded vs. general AI)](https://blueapprentice.com/ai-tutor-vs-homework-help/), [Ken Arnold on Socratic prompt fragility](https://kenarnold.org/posts/simplify-context/), [Coursera "Help me practice" Socratic design](https://blog.coursera.org/coursera-coach-leveraging-genai-to-empower-learners/), [SuperMemo SM-2 original algorithm](https://www.super-memory.com/english/ol/sm2.htm)

**Project-internal:** `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md`, `.planning/PRODUCT_STRATEGY.md`, `studio/src/lib/{db,srs,course,json}.js`, `web/server.js` (`/api/chat` SSE contract)

---

## Decisions & Assumptions Log (for the orchestrator)

1. **Complexity scale** mapped to template LOW/MEDIUM/HIGH as S/M/L per the brief.
2. **Recommended MVP = the drafted REQUIREMENTS.md v1**, with one addition elevated to launch-blocking: the **zero-key demo course** as the safety net for the activation metric (it already exists as COURSE-04 but is framed here as a first-run pillar).
3. **Capstone stays out of v3.0** (CAP-01 is already v2) — the hybrid arc across a whole course is a fast-follow, not a launch gate.
4. **Audio, sync, registry, billing, managed AI confirmed as SaaS-milestone** — consistent with PROJECT.md Out of Scope.
5. **Multi-agent verification pipeline explicitly rejected for v3.0** (anti-feature) on cost/latency grounds for a free BYOK app.
6. **UNVERIFIED items** flagged inline: Oboe v4 feature list (page body truncated), exact Duolingo Max pricing, whether Oboe still ships a "game" format, and current Oboe citations status.

---
*Feature research for: Professor Studio v3.0 — local-first hybrid-pedagogy learning app*
*Researched: 2026-10-15*
