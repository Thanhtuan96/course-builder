# Platform Roadmap Design
**Date:** 2026-03-13
**Author:** Brainstorming session
**Status:** Approved

---

## Vision

Build the **OSS plugin as the open protocol** for Socratic AI-guided learning, and the **paid platform as the discovery, publishing, and monetization layer** on top. Every learner is a potential creator. Every creator was a learner first.

**The core loop:**
```
Learn → Solve Real Problems → Distill into SKILL → Publish → Others Learn
```

---

## Architecture Decision

**OSS as engine, paid as layer (Option C)**

- The plugin format (SKILL.md, COURSE.md, LECTURE.md, CAPSTONE.md) is the open standard
- Anyone can fork, install, and run it locally for free — forever
- The paid platform is the best place to *discover*, *publish*, and *monetize* that format
- The web UI (in progress as v2.0) is not just a local tool — it *is* the platform foundation

---

## Target Users

**Learners:** Tech professionals, developers, and non-technical learners (designers, marketers, product managers, entrepreneurs). Anyone who wants to build real skills by solving real problems.

**Creators:** Learners who complete courses and distill their earned knowledge into SKILLs that others can use.

---

## Learning Formats

Two complementary modes, both Socratic:

1. **Project-based** — deliverable is an artifact (code, business plan, marketing campaign, wireframe, proposal). Professor reviews it Socratically.
2. **Scenario-based** — professor presents a real-world situation, learner responds and is coached through decision-making.

---

## Monetization Model

```
Free tier:    Community SKILLs (open, GitHub-backed registry)
Paid tier:    Verified premium SKILLs ($10-50 one-time or ~$15/mo all-access)
Creator cut:  70% revenue share (30% platform fee)
```

**Premium course criteria:**
- Creator completed the course themselves (learning artifacts as proof)
- Capstone solves a verified real-world problem (not synthetic)
- SKILL used by 10+ free learners with positive completion signal

---

## Roadmap

### v2.0 — Complete the Foundation *(current milestone)*

| Phase | Goal |
|---|---|
| 14 | CLI `web` command + production build + static file serving |
| 15 | Retention layer — SCHEDULE.md, spaced repetition, streaks |
| 16 | Course sharing — export/import SKILL bundles |
| 17 | Auto-generate exercise files |

---

### v2.1 — Public Launch *(parallel track)*

The local web UI becomes a hosted web app. This is the moment the platform exists publicly.

| Phase | Goal |
|---|---|
| 18 | Cloud deploy — public URL (Vercel/Railway), not just localhost |
| 19 | User accounts — email + GitHub OAuth, course state persists in cloud |
| 20 | OSS community page — GitHub-backed SKILL registry, `npm publish` flow |

**Success signal:** Real users on the OSS version before anything paid is built.

---

### v3.0 — Non-Tech Learner Expansion

Unlocks the broader market. The Socratic loop stays identical — only deliverable format changes.

| Phase | Goal |
|---|---|
| 21 | Scenario-based challenges — professor presents situations, learner responds, coach coaches |
| 22 | Document/artifact deliverables — capstones can be a marketing plan, wireframe, business proposal |
| 23 | Topic categories — programming, design, marketing, product, business. Web UI adapts to topic type |

---

### v3.1 — SKILL Creator Loop *(heart of the vision)*

Unlocked when a learner completes a course (all sections ✅ + capstone submitted).

| Phase | Goal |
|---|---|
| 24 | SKILL Generator — analyzes NOTES.md, COURSE.md, capstone artifacts; guided step-by-step SKILL.md authoring |
| 25 | Creator profile — public page showing published SKILLs, learner count, topics |
| 26 | SKILL publishing — free tier, open format, GitHub-backed registry. Fork, install, remix. |
| 27 | SKILL preview/test mode — creator simulates full learner experience before publishing |

---

### v4.0 — The Marketplace *(paid layer)*

| Phase | Goal |
|---|---|
| 28 | Freemium gating — basic community SKILLs free, verified premium behind paywall |
| 29 | Premium course criteria — real-world capstone evidence, creator reputation, quality review |
| 30 | Payment integration — Stripe, one-time purchase or monthly all-access pass |
| 31 | Creator revenue sharing — 70% creator / 30% platform, earnings dashboard |
| 32 | Discovery & recommendations — topic search, skill-level matching, "what to learn next" |
| 33 | Creator analytics — completion rate, drop-off points, most-asked questions, SKILL improvement signals |

---

## Full Visual

```
OSS ENGINE (protocol, always free)          PLATFORM LAYER (paid on top)
─────────────────────────────────          ────────────────────────────

v2.0  Finish foundation
      14. CLI web integration
      15. Retention / spaced repetition
      16. Course sharing
      17. Auto-generate exercises

v2.1  Public launch                    →   Deploy + user accounts + SKILL registry
      18. Cloud deploy
      19. Auth (email + GitHub)
      20. OSS community page

v3.0  Non-tech expansion
      21. Scenario-based challenges
      22. Document/artifact deliverables
      23. Topic categories

v3.1  Creator loop                     →   SKILL Generator + creator profiles
      24. SKILL Generator
      25. Creator profiles
      26. SKILL publishing
      27. SKILL preview/test

v4.0  Marketplace                      →   Freemium + payments + revenue share
      28. Freemium gating
      29. Premium course criteria
      30. Payment (Stripe)
      31. Creator revenue sharing
      32. Discovery & recommendations
      33. Creator analytics
```

---

## Learner → Creator Transition

The transition gate is: all sections ✅ **AND** `professor:capstone-review` completed (professor feedback received, not just capstone submitted). This is the existing `professor:capstone-review` command — the platform checks for its completion record before unlocking the SKILL Generator.

```
All sections ✅ + capstone-review completed → SKILL Generator unlocked → SKILL authored + tested → Published (free) → Eligible for premium verification
```

There is no manual creator application — earned completion is the only gate.

## Creator Pricing Rules

- Creator sets their own price within platform bounds: $10–$50 per course, or free
- Platform takes 30% of all paid per-course transactions
- Monthly all-access pass (~$15/mo) is a platform-level bundle. Revenue from the all-access pass is distributed to creators pro-rata by consumption: a creator earns (their course's learner-hours / total platform learner-hours) × 70% of monthly pass revenue. Exact calculation is deferred to Phase 31 (revenue sharing dashboard).

## Premium Verification Process

In v4.0, verification is manual (platform team reviews). Criteria:
1. Creator completed the course themselves (learning artifacts stored in platform)
2. Capstone solves a documented real-world problem (not a tutorial clone)
3. SKILL has been used by 10+ free learners with >50% section completion rate (tracked by platform, not by OSS plugin)

The 10+ completions count is stored in the platform database per published SKILL. It cannot be gamed by throwaway accounts because free learner progress requires a verified account (email or GitHub OAuth, Phase 19).

## Free Tier / GitHub Registry

"GitHub-backed" means: creators publish SKILLs by opening a PR to the `professor-skills/` GitHub org. The platform indexes this registry and surfaces SKILLs in search. Updates sync via GitHub webhook on push. A platform account is not required to publish to the free tier — attribution is by GitHub identity (commit author / PR opener).

Note: "npm publish" in Phase 20 refers to the CLI distribution mechanism (`npx course-professor install <skill-name>`), not the SKILL format itself. The SKILL format is Markdown files, not a Node package. The CLI resolves a SKILL name by looking it up in the `professor-skills/` registry index.

## SKILL Format Versioning

The SKILL format (SKILL.md + associated files) is treated as stable from v2.0 onward. Breaking format changes require a major version bump in `plugin.json` and a migration guide. Versioning details are deferred to Phase 20 (OSS community page) when the registry is established. Implementers of Phases 20 and 24 must define the format version field at that point.

## Success Criteria Per Milestone

| Milestone | Success Signal |
|---|---|
| v2.0 | CLI `web` command works end-to-end; 5 real users complete a course locally |
| v2.1 | 50 registered users; at least 3 complete a course on the hosted platform |
| v3.0 | At least 1 non-tech course (marketing/product/design) completed by a non-developer |
| v3.1 | At least 1 learner completes a course AND publishes a SKILL via the generator |
| v4.0 | At least 1 paid course purchase; at least 1 creator earns revenue |

## Key Principles

1. **OSS first** — the plugin format is always open. The platform adds value, never locks it in.
2. **Proof before paywall** — get real learners completing courses before gating anything.
3. **Earned knowledge only** — creators must be learners first. No synthetic courses.
4. **Socratic everywhere** — the "no giving answers" rule applies across all topics and formats.
5. **Parallel tracks** — Phase 18 (cloud deploy) is blocked on Phase 14 (production build) being stable. Phases 19–20 (auth, registry) can start in parallel with Phases 15–17. The point is: v2.1 is not a sequential gate after v2.0 is 100% complete — Phase 14 completion unblocks cloud work while remaining OSS phases continue.
