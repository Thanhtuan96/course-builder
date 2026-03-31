# TODOS

## Registry hash verification / supply chain integrity

**What:** Before writing any file from the registry to disk, verify a SHA-256 checksum against a manifest published in the registry index.

**Why:** SKILL.md files execute as Claude Code context — a compromised registry URL (DNS hijack, CDN cache poisoning) is a prompt injection vector, not just a file placement risk. This should be closed before v3.0 marketplace where community-contributed skills are installed by strangers.

**Pros:** Closes the supply chain attack surface at the cheapest time (before registry has real traffic). Standard pattern: npm uses package integrity hashes. The registry build pipeline (validate.js + build-index.js) already exists — hashes could be added to index.json with minimal registry changes.

**Cons:** Requires registry to publish hash fields in index.json + skill manifests. Adds one extra field per skill to the index. Adds ~30 lines of Node.js crypto code in cli.js.

**Context:** Deferred from Phase 20 (CLI skill registry). The registry org (professor-skills-hub) already has a build pipeline — adding integrity hashes is a registry-side change before a CLI-side change.

**Depends on:** Registry team (professor-skills-hub/courses-skills-registry) adding `integrity` hash fields to index.json entries and skill manifests.

---

## Multi-platform `installed` command (Gemini CLI, OpenCode, Cursor)

**What:** Extend the `installed` command to enumerate skill directories for non-CC platforms: Gemini CLI's skill path, OpenCode's skill path, Cursor's `.cursorrules/skills` pattern.

**Why:** Currently `installed` only shows `.claude/skills/`. A user running Professor on Gemini CLI or Cursor gets an incomplete picture of what they've installed. Inconsistent with the multi-platform positioning of the product.

**Pros:** Completes the lifecycle feature for platforms already supported by `setup`. Users with multiple platforms installed get a unified view.

**Cons:** Non-CC skill path conventions are not yet confirmed or standardized. Cannot implement until paths are verified per platform.

**Context:** Deferred from Phase 20 because skill directory conventions for non-CC platforms were not confirmed at time of writing. The `installed` command is CC-only in v1 for this reason.

**Depends on:** Phase 21-04 platform compatibility checklist — must confirm the skill install path for Gemini CLI, OpenCode, and Cursor before implementing.

---

## Version pinning / channel support (alpha/stable)

**What:** Allow `course-professor install --skill react-hooks-reviewer@1.0` to pin to a specific skill version, and `--channel stable` / `--channel alpha` to target a release channel.

**Why:** Without pinning, `update --all` always pulls latest, which can silently break a learner's workflow if a skill author publishes a breaking change. Version pinning is the standard answer in every package manager.

**Pros:** Makes the skill ecosystem production-grade. Enables skill authors to ship breaking changes safely. Required for the v3.0 revenue-share marketplace where installed skills have implicit SLAs.

**Cons:** Requires significant registry infrastructure work (versioned artifact storage, tag/channel support in index.json) before the CLI work makes sense. Wave 3 / v3.0 concern.

**Context:** Deferred from Phase 20. This is a post-marketplace feature — do not start until the registry versioning scheme is designed.

**Depends on:** Registry versioning support — not yet designed. Start with `/gsd:plan-phase` for registry versioning before touching the CLI.

---

## execFileSync hardening for publish shell commands (P3)

**What:** Replace all `execSync(string, ...)` calls in the `publish` case of `bin/cli.js` with `execFileSync(cmd, args[])` to eliminate shell invocation entirely — no string interpolation, no injection surface.

**Why:** Currently `safeSlug` sanitization (`[a-z0-9-]`) closes the immediate shell injection risk. But string-interpolated shell commands remain the wrong long-term pattern for any user-controlled input. `execFileSync(['git', 'checkout', '-b', branch])` passes args directly to the OS without a shell — zero injection surface regardless of input.

**Pros:** Eliminates the shell injection class entirely. Consistent with Node.js security best practices. Makes future slug validation rule changes irrelevant to security.

**Cons:** Requires restructuring ~8 `execSync` calls in the publish case. Some multi-command strings (`git add . && git commit -m ...`) need splitting into two calls. Medium diff, no behavior change.

**Context:** Deferred from CEO review (2026-03-26). The `safeSlug` fix from this session closes the immediate risk. This is a v3.0 security hardening pass concern.

**Effort:** M (human: ~2h) → S (CC+gstack: ~10min)
**Priority:** P3 — no urgency while safeSlug is in place.
**Depends on:** Nothing — standalone refactor.

---

## Archive previous LECTURE.md before `profesor:next` overwrites it

**What:** Before the server writes a new `LECTURE.md` during `profesor:next`, rename/move the previous content to an archive location (e.g. `courses/{slug}/lectures/LECTURE-01-section-name.md`). Keep the last 3–5 archives; delete older ones automatically.

**Why:** The skill states `LECTURE.md is disposable — overwritten by each profesor:next`, but this means completed lecture content is silently lost. Learners often want to revisit earlier sections for review. Archive gives them that without complicating the core syllabus tracker.

**Pros:** Zero friction — transparent to the user experience. No behavior change for the happy path. Enables `profesor:review` or a new `profesor:review-section` to pull up past lecture content. Simple to implement in `saveFilesFromResponse()` in `server.js`.

**Cons:** Adds a filesystem operation before each write. Archive files add clutter to course dirs — mitigated by capping at N versions.

**Context:** Discovered during web investigation (2026-03-27). The overwrite is explicit in the skill and the server — no backup step exists.

**Effort:** S (human: ~15min)
**Priority:** P3 — useful quality-of-life, not blocking
**Depends on:** Nothing — standalone change in `web/server.js`

---

## NOTES.md — Per-course learner insights and session summaries

**What:** After each `profesor:done`, generate or update `courses/{slug}/NOTES.md` to capture:
- **Session recap**: what was covered in the session (topic, key concepts)
- **User strengths**: demonstrated strong understanding of X, explained Y well
- **Growth areas**: struggled with Z, needs review of concept W
- **Suggested next focus**: based on review history, what to double down on
- **Struggle log**: patterns across sessions (e.g., "keeps mixing up closures and callbacks")

The `NOTES.md` acts as the Professor's "gradebook" — giving both learner and AI a persistent view of the learning trajectory beyond the raw syllabus checklist.

**Why:** `COURSE.md` tracks what was done, not how well or what patterns emerged. A learner who finishes all sections but consistently struggled with async patterns has a gap that `profesor:done` alone doesn't surface. NOTES.md closes that gap.

**Pros:** Enables smarter `profesor:review` calls — the AI can reference past struggles. Helps learners self-reflect. Creates a natural "learner profile" over time. Low implementation surface — append to NOTES.md after each `profesor:done` response.

**Cons:** Requires `profesor:done` to generate insight text, which adds latency. Risk of generic/boilerplate analysis if not prompted carefully. Needs a structured format to avoid becoming a messy journal.

**Context:** Not yet designed — plan phase needed to define:
- Who writes NOTES.md: the AI (auto-generate) or the learner (self-reflect)?
- Format: freeform Markdown, or structured fields (strengths[], gaps[], nextFocus[])?
- Trigger: only on `profesor:done`, or also on `profesor:review` cycles?
- Should NOTES.md be visible in the web UI's LecturePanel?

**Effort:** M — requires plan phase first
**Priority:** P2 — meaningful learning value, but needs design before implementation
**Depends on:** Plan phase — do not start implementation until NOTES.md format is designed
