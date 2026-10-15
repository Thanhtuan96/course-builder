---
name: professor:next
description: Load the next section of your course
---

Read `COURSE.md` and find the first section with status ⬜ Not started.

If no ⬜ sections remain, check for any 🔄 In progress sections and prompt the user to complete those first.

If no course exists at all, respond: "No active course found. Start one with `/professor:new-topic` first."

**Record Section Start Time and Update Streak:**

1. Get current timestamp: `sectionStartedAt = new Date().toISOString()` (e.g., "2026-03-14T15:30:00.000Z")
2. Update COURSE.md:
   - Set `**Current Section Started**: YYYY-MM-DDTHH:mm:ss` in Time Tracking section
   - Update `**Last active**: YYYY-MM-DD` to today's date
   - Update streak:
     - Read previous lastActiveDate from COURSE.md
     - If previous was yesterday: increment currentStreak
     - If previous was today: keep currentStreak
     - If previous was 2+ days ago: reset currentStreak to 1
   - Set `**Current streak**: N days` with 🔥 emoji if N ≥ 3
3. If advancing to a new section (not resuming), clear any previous sectionCompletedAt

**Streak Display:**
When greeting user at session start or after next, include streak info:
- "You're on a N-day streak! 🔥" (if streak ≥ 3)
- Or: "Streak: N days" (if streak < 3)

Research the section topic using web search for current, accurate content.

**Archive the previous lecture, then write the new one (ordered):**

1. **Archive the existing `LECTURE.md`** (skip if it does not exist, and skip if you are not moving to a different section):
   - **Only archive when the section number changes.** If the existing and new lecture share the same section number, this is an in-place edit — do NOT archive (it would create duplicate `NN-x.md`, `NN-x-2.md` files). If either lecture has no section number, archive only when both the content and the title differ.
   - Determine the course directory: check `learning/{slug}/` first, then fall back to `courses/{slug}/`
   - Parse the section number from the existing lecture's `# Section N:` / `# 📖 Section N:` heading
   - Move (rename) the file to `lectures/NN-<section-slug>.md`:
     - `NN` = zero-padded section number (e.g. `02`); if the heading has no number, use the next free number after the files already in `lectures/`
     - `<section-slug>` = lowercased, hyphenated section title, transliterated to ASCII (e.g. `closures-and-scope`; Vietnamese `Biến và kiểu dữ liệu` → `bien-va-kieu-du-lieu`)
     - Create the `lectures/` directory if it does not exist
   - **Never delete or overwrite an archive** — the full lecture history is kept; if a target name already exists, append `-2`, `-3`, …
2. **Write the new `LECTURE.md`** for the current section (overwriting the now-archived file). Use the **LECTURE.md Format** from `SKILL.md`: the shared learning core plus **exactly one** kind-specific block matching the course Kind. Update `COURSE.md` status to 🔄 In progress for that section and update "Last active" date.

**After writing LECTURE.md, auto-create the exercise file:**

1. **Determine course location**:
   - First check `learning/{slug}/` (worktree courses - Phase 7)
   - Fall back to `courses/{slug}/` (legacy)

2. **Read the course Kind** from `COURSE.md` metadata (`**Kind**: ...`, right under `**Level**`):
   - If the field is missing, treat it as `programming` (backward compatible).
   - The Kind is authoritative — **never guess** coding vs non-coding from section keywords.

3. **Determine the exercise path**:
   - Use the `exercises/{NN}-{section-slug}.{ext}` pattern
   - `{NN}` = zero-padded section number from `COURSE.md`
   - `{section-slug}` = lowercased, hyphenated, ASCII-transliterated section title
   - Create `exercises/` lazily only when the first exercise file is written

4. **Create the exercise file** (skip if it already exists) following the **course Kind**:

   **`programming`** → `exercises/{NN}-{section-slug}.{ext}` where the extension, comment syntax, and export style match the course language. Skeleton + self-check ONLY — never the implementation.
   - JavaScript/TypeScript → `.js` / `.ts`, `// TODO`, `console.assert` self-check (`module.exports` for plain Node CJS; `export` for ESM/modules)
   - React → `.jsx` (or `.tsx`), `// TODO`, `export default` component stub + a render/log self-check
   - Python → `.py`, `# TODO`, `def` stub, `if __name__ == "__main__":` block with `assert` self-checks
   - SQL → `.sql`, commented task + the expected result described in a comment
   - Go/Rust/Java → `.go` / `.rs` / `.java`, matching comment syntax + a minimal self-check
   - Example (Python):
     ```python
     # ========================================
     # Exercise: [Title]
     # Objective: [1-2 sentences]
     # ========================================

     # TODO: [Task 1]
     def your_function(param):
         # your implementation here
         pass

     if __name__ == "__main__":
         # self-checks — make these pass
         assert your_function(...) == ...
     ```
   - Example (JS/TS):
     ```javascript
     // ========================================
     // Exercise: [Title]
     // Objective: [1-2 sentences]
     // ========================================

     // TODO: [Task 1]
     function yourFunction(param) {
       // your implementation here
     }

     console.assert(yourFunction(...) === ..., 'expected ...');
     ```

   **`quantitative`** → `exercises/{NN}-{section-slug}.md` — a problem set with final answers in a separate section at the bottom (no worked solutions):
   ```markdown
   # Exercise: [Title]

   ## Objective
   [1-2 sentences]

   ## Problems
   1. [problem]
   2. [problem]
   3. [problem]

   ## Answers (check after trying)
   1. [final answer only]
   2. [final answer only]
   3. [final answer only]
   ```

   **`conceptual`** → `exercises/{NN}-{section-slug}.md` — an analysis/argument prompt + 4-criterion rubric:
   ```markdown
   # Exercise: [Title]

   ## Prompt
   [An analysis, comparison, or argument question about this section]

   ## Your Answer
   [space for the learner's response]

   ## Rubric (4 criteria)
   - [ ] [Criterion 1 — accurate use of concepts]
   - [ ] [Criterion 2 — evidence / examples cited]
   - [ ] [Criterion 3 — clear, structured argument]
   - [ ] [Criterion 4 — considers counter-arguments]
   ```

   **`skill`** → `exercises/{NN}-{section-slug}.md` — drills + self-assessment checklist + flashcard list:
   ```markdown
   # Exercise: [Title]

   ## Drills
   1. [drill]
   2. [drill]

   ## Self-assessment checklist
   - [ ] [what good looks like]
   - [ ] [...]

   ## Turn these into flashcards
   - [question]
   - [question]
   ```

5. **Update COURSE.md**:
   - Add/update "Active exercise" field:
     ```
     **Active exercise**: exercises/01-intro.js
     ```
   - This field is read by review/hint/stuck commands

Present the section content in chat, then prompt the user to attempt the exercise on their own.

**Spotter Reminder:**

After presenting the lecture content, add this reminder:

> "If you get stuck at any point while working through this exercise, run `professor:spotter` for a quick check-in — I'll help you figure out where you are without giving you the answer."

This follows the spec: "Professor should remind learners of professor:spotter when delivering a new lecture."
