---
name: professor:new-topic
description: Start a new Socratic learning course on a topic
argument-hint: "[topic]"
---

Use `AskUserQuestion` with these four questions in a single call:

1. "What do you want to learn?"
2. "What is your current experience with this topic?"
3. "What level are you aiming for? (Beginner / Intermediate / Advanced / Expert)"
4. "What do you want to be able to build or do after this course?"

Research the topic using web search before proposing anything.

**Propose a course kind** (PLUG-04). Based on the topic and the learner's stated goal, pick exactly one:

| Kind | Use when the topic is about… | Example |
|---|---|---|
| `programming` | writing/running code, software, data structures, frameworks, queries | "Python cơ bản", "React", "SQL" |
| `quantitative` | numbers, formulas, proofs — math, statistics, finance, physics | "Linear algebra", "Statistics" |
| `conceptual` | ideas, history, theory, social science, culture | "Lịch sử Việt Nam thế kỷ 20", "Marketing" |
| `skill` | a practical craft or performance practised by drill | "Public speaking", "Chess openings", "Guitar" |

Propose the syllabus **and the kind** inline in chat — do NOT write any files yet. Use this shape:

> **Proposed course kind**: `conceptual` — because you want to understand causes and narratives, not write code.
> (You can change this — the other kinds are `programming`, `quantitative`, `skill`.)

Frame each section description around how it moves the user toward their stated goal.

Wait for the user to confirm or request adjustments (including a different kind).

**After user confirmation, perform these steps:**

1. **Generate slug** from topic name:
   - Convert to lowercase
   - Transliterate diacritics to ASCII (e.g. "Lịch sử Việt Nam" → "lich-su-viet-nam")
   - Replace spaces with hyphens
   - Remove special characters
   - Example: "React Fundamentals" → "react-fundamentals"

2. **Create the course folder** with the CLI — never with hand-written `git`/`mkdir` commands:
   ```bash
   npx course-professor create {slug} --kind {kind}
   ```
   - `programming`: creates and **verifies** a registered git worktree at `learning/{slug}/` on branch `learning/{slug}` (reattaches the branch if it already exists), keeps `learning/` out of the host repo's `git status`, and rolls everything back if any step fails.
   - `quantitative` / `conceptual` / `skill` (PLUG-05): creates a plain folder `learning/{slug}/` — no git, no scaffolding. `exercises/` is created lazily by `professor:next`.
   - **If the command exits non-zero, stop.** Show its error message to the user and do **not** write any course file anywhere (no fallback folder, no `courses/`).
   - **Programming only — scaffolding:** framework courses (React, Vue, Django, …) get a basic project structure (`package.json` or equivalent, `src/`, README with setup instructions); standalone courses get an empty `exercises/` directory. Do **not** create per-section exercise files — `professor:next` creates each one when its section starts.

3. **Write course files** to `learning/{slug}/`:
   - `COURSE.md` — syllabus with all sections starting ⬜ Not started, and `**Kind**: {kind}` in the metadata **right under `**Level**`**
   - `CAPSTONE.md` — capstone project brief, fitted to the kind (a program for `programming`; an analysis/report for `conceptual`; a solved problem set or model build for `quantitative`; a demonstrated performance for `skill`)
   - `NOTES.md` — empty notes file:
     ```markdown
     # 📝 Notes: [Topic Name]

     ---

     ```

4. **Initial "Active exercise" field**: leave empty — `professor:next` creates the first exercise file.

5. **Save** (programming only): commit the new course on its own branch so it survives restarts and pruned worktrees:
   ```bash
   npx course-professor save {slug} -m "course({slug}): create"
   ```
   All course files live in `learning/{slug}/`; reference that path from now on.

6. **Tell the user**: *"Course created as a **{kind}** course! Your capstone brief is saved in CAPSTONE.md — you'll build it solo after all sections. Run `professor:next` to load your first section."*

**Backward compatibility (PLUG-04):** Commands that read `COURSE.md` treat a **missing Kind as `programming`**, so courses created before this feature keep working unchanged.
