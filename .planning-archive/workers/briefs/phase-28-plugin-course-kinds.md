# Task brief: Phase 28 — Plugin Course Kinds

You implement one phase of milestone v3.0 in the Professor plugin (CLI/agent side, NOT `studio/`). You work in your own
git worktree (branched from `feat/studio-local-first`, which already contains Phase 27: lecture archiving to
`lectures/` + `LEARNING-LOG.md`). Commit in small conventional commits. Do NOT push. Do NOT touch `studio/` or `web/`.

Read first: `CLAUDE.md`, `professor-skill/SKILL.md` (esp. "LECTURE.md Format" ~line 304 and the level table ~line 417),
`agents/professor.md`, `commands/professor/new-topic.md`, `commands/professor/next.md`, `hint.md`, `review.md`,
and the requirements in /Users/tuankhuat/Documents/Pet-Projects/course-learning-plugin/.planning/REQUIREMENTS.md
(PLUG-04..06).

## Problem (orchestrator's review)
- There is no course type decided up front. `next.md` guesses coding vs non-coding PER SECTION from keywords and
  "defaults to coding if unclear", so general topics (history, marketing, languages) can get `.js` skeletons; the
  coding skeleton is hard-coded JavaScript (`module.exports`) even for Python.
- `new-topic.md` REQUIRES a git repo + worktree + `exercises/` scaffolding for every topic — pointless friction for
  non-programming subjects.
- The LECTURE.md template (Concept → Real-World Use Case with a company/product → Exercise → Resources) is
  tech-oriented and lacks learning-science essentials: objectives, worked example, misconceptions, retrieval
  questions, key takeaways.

## Requirements
- **PLUG-04** `professor:new-topic`: after the 4 questions + research, propose a **course kind** —
  `programming | quantitative | conceptual | skill` — with a one-line reason, inside the same syllabus confirmation
  (learner can change it). Write `**Kind**: <kind>` into COURSE.md metadata (right under `**Level**`). Commands that
  read COURSE.md treat a missing Kind as `programming` (backward compatible with existing courses).
- **PLUG-05**: only `programming` courses require git + worktree at `learning/{slug}/` + `exercises/` scaffolding
  (keep current behaviour). Other kinds: create a plain folder `learning/{slug}/` (no git requirement, no worktree, no
  framework scaffolding), with `exercises/` created lazily. All commands already look in `learning/` then `courses/` —
  make sure nothing assumes a worktree for non-programming kinds (archive/switch/worktrees commands: add a one-line
  note that non-programming courses are plain folders; do not rewrite those commands beyond that).
- **PLUG-06**: new LECTURE.md template in SKILL.md (and wherever agents/professor.md or next.md restate it):
  shared learning core (in this order) — 🎯 Objectives (2–3 "you will be able to…"), 🧠 Explanation, 🧩 Worked
  example, ⚠️ Common misconceptions, ❓ Check your understanding (2–3 retrieval questions; answers NOT in the lecture —
  the learner answers in chat and Professor responds Socratically), 🛠️ Exercise (+ success criteria), 📌 Key
  takeaways, 🔗 Resources — plus ONE kind-specific block after the worked example:
  * programming → 💻 Code walkthrough (annotated snippet, level-appropriate)
  * quantitative → 📐 Step-by-step worked problem (LaTeX `$…$` allowed)
  * conceptual → 📚 Case study / story + optional ```mermaid concept map or timeline (replaces the mandatory
    "company/product" use case)
  * skill → 🎭 Model examples (good vs. common mistake)
  Exercise files follow the COURSE kind, never keyword guessing:
  * programming → `exercises/NN-slug.<ext>` where ext/comment syntax/export style match the course language
    (Python: `# TODO`, `def`, `if __name__ == "__main__":` self-checks with asserts; JS/TS: `// TODO` + a tiny
    `console.assert` self-check; SQL: commented task + expected result description; etc.) — skeleton + self-checks
    only, never the implementation.
  * quantitative → `exercises/NN-slug.md` problem set with final answers in a separate "Answers (check after
    trying)" section at the bottom, no worked solutions.
  * conceptual → `exercises/NN-slug.md` analysis/argument prompt + 4-criterion rubric.
  * skill → `exercises/NN-slug.md` drills + self-assessment checklist + "turn these into flashcards" list.
  Update `hint.md` / `review.md` only where they assume code (make the 3 hint layers kind-aware:
  concept → pattern/approach → pseudo-code (programming) / partial setup (quantitative) / outline (conceptual) /
  scaffolded example (skill)).
- Keep Phase 27 behaviour (archive before overwrite, LEARNING-LOG) intact.
- Keep every `shared/` canonical copy in sync with its `commands/`/`agents/` counterpart (CLAUDE.md explains the
  `AskUserQuestion` placeholder convention).
- Update `CLAUDE.md` (Course Storage + Commands table rows for new-topic/next) to describe kinds.

## Files you own
`commands/professor/{new-topic,next,hint,review,archive,switch,worktrees}.md` and their `shared/commands/professor/`
copies, `professor-skill/SKILL.md`, `agents/professor.md` + `shared/agents/professor.md` (if it exists),
`CLAUDE.md`, `test/` (only if you add a JS helper).

## Verify before reporting
1. `npm test` at repo root still passes.
2. `diff -r` style check: every edited `commands/professor/X.md` matches `shared/commands/professor/X.md` except for
   intentional placeholder differences.
3. Walk through mentally (write it in your final summary): (a) "Lịch sử Việt Nam thế kỷ 20" → conceptual, no git,
   lecture with case study + timeline, `.md` exercise with rubric; (b) "Python cơ bản" → programming, worktree, `.py`
   skeleton with asserts.
Then commit and notify.
