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

Write `LECTURE.md` for that section (overwrite any existing file). Update `COURSE.md` status to 🔄 In progress for that section and update "Last active" date.

**After writing LECTURE.md, auto-create the exercise file:**

1. **Determine course location**:
   - First check `learning/{slug}/` (worktree courses - Phase 7)
   - Fall back to `courses/{slug}/` (legacy)

2. **Detect topic type** (coding vs non-coding):
   - Scan section title and LECTURE.md content for keywords:
     - **Coding keywords** → coding exercise: "implement", "function", "write code", "program", "algorithm", "build", "create component", "API", "database", "query", "class", "method", "return", "input", "output"
     - **Non-coding keywords** → non-coding exercise: "analyze", "explain", "compare", "prove", "mark", "calculate", "design", "describe", "discuss", "evaluate", "assess"
   - Also detect from course name: React → coding, Python → coding, SQL → coding
   - Default to coding exercise if unclear

3. **Detect technology type** for file extension:
   - React/JS/Node → `.jsx` (or `.js` if no React detected)
   - TypeScript → `.ts`
   - Python → `.py`
   - SQL → `.sql`
   - Go → `.go`
   - Rust → `.rs`
   - Java → `.java`
   - Non-coding → `.md`

4. **Determine exercise file path**:
   - Use `exercises/{NN}-{section-slug}.{ext}` pattern
   - Extract section number from COURSE.md

5. **Create exercise file** (skip if already exists):

   **For CODING exercises** - generate skeleton code:
   ```javascript
   // ========================================
   // Exercise: [Exercise Title]
   // ========================================
   //
   // Objective: [1-2 sentences what user should accomplish]
   //
   // Example:
   //   Input: [example input]
   //   Output: [expected output]
   //
   // Constraints:
   //   - [Constraint 1]
   //   - [Constraint 2]
   //
   // Work on this file directly - you can complete it without the lecture visible.
   // ========================================

   // TODO: [Task 1 description]
   function yourFunction(param) {
     // Your implementation here
   }

   // TODO: [Task 2 description - if applicable]
   // function anotherFunction() { }

   module.exports = { yourFunction };
   ```

   **For NON-CODING exercises** - generate pure instructions:
   ```markdown
   # Exercise: [Exercise Title]

   ## Objective
   [What user should accomplish - 1-2 sentences]

   ## Instructions
   Complete the following:
   
   1. [Instruction 1]
   2. [Instruction 2]
   3. [Instruction 3]

   ## Your Answer
   [Space for user's response - either free text or specific format]

   ## Verification
   [What makes a good answer - criteria for self-verification]

   ## Resources
   - [Reference to LECTURE.md section]
   - [Any additional hints without giving the answer]
   ```

6. **Update COURSE.md**:
   - Add/update "Active exercise" field:
     ```
     **Active exercise**: exercises/01-intro.js
     ```
   - This field is read by review/hint/stuck commands

Present the section content in chat, then prompt the user to attempt the exercise on their own.
