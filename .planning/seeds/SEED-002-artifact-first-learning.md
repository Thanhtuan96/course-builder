---
planted_during: v3.0 Professor Studio (2026-10-15)
trigger_when: starting milestone v3.2 / any milestone about course design, capstone, portfolio, "bring your own project", or practical/real-world learning
---

# SEED-002: Artifact-first learning (project spine)

## Idea
Every course is built around ONE real artifact the learner ships (repo, analysis, notebook, performance). The syllabus is
derived backward from that artifact; each lesson = knowledge for one milestone + the milestone task on the same artifact;
the capstone = "ship the artifact"; the course ends with a portfolio-ready deliverable and a case study.

## Why This Matters
User (2026-10-15): learning must be practical — "artifact thực tế là việc khá quan trọng trong quá trình học". Isolated toy
exercises don't transfer; proof-of-work does. Strong differentiator vs Oboe (content-first) when combined with the
Socratic rule (AI reviews and questions, never builds the artifact).

## Methods (design basis)
- Backward Design / Understanding by Design — start from the performance/artifact, derive lessons.
- 4C/ID (van Merriënboer) — whole authentic tasks, increasing complexity, just-in-time supportive info, part-task practice.
- Cognitive apprenticeship — model → coach → scaffold → fade (tutor hint generosity decreases toward the capstone).
- Authentic assessment — real-world criteria: tests pass, deploy works, rubric of practitioners, real data.
- Portfolio / proof-of-work — exportable deliverable + case study.

## Product shape (proposed)
1. Course creation asks "What do you want to have in your hands at the end?" → AI proposes artifact + definition of done
   → 4–10 milestones → syllabus derived backward (lesson ↔ milestone).
2. **Bring your own project**: point at an existing repo / document / dataset from the learner's real work; lessons,
   examples and tasks are about it (reuse worktree, local runner, bridge).
3. Per-milestone definition of done: programming → self-check tests + AI PR-style review; others → rubric + checklist.
4. Artifact history: snapshot per milestone (reuse workspace_files / run_results / lesson_versions); Studio "Artifact" tab
   timeline with reviews and learning log.
5. Capstone = ship the artifact (Phase 33 already framed this way in v3.0).
6. Portfolio export: repo / PDF / share page + case study generated FROM the learner's history (summary, not authorship).
   SaaS: public portfolio pages.

Artifacts by kind: programming → repo + tests + README + deployed demo; conceptual → analysis/report/slides/concept map;
quantitative → notebook/spreadsheet on real data + report; skill → recordings + practice log + portfolio pieces.

## Technical notes
New tables `artifacts`, `milestones` (lesson.milestone_id), `evidence` (test results, rubric reviews, snapshots) —
D1-compatible migrations. Prompt changes: syllabus-from-artifact, milestone-task lessons. Plugin: `new-topic` asks for the
artifact; `next` assigns milestone tasks on the real worktree; `check` runs the definition of done.

## Suggested process
Full GSD cycle (discuss-milestone → research → requirements → roadmap) — it changes the learning model, not just features.
