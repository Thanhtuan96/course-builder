---
name: professor:capstone
description: "View your capstone project brief"
---

Display the capstone project brief for the active course.

**Steps:**

1. Check if a `courses/` directory exists in the current working directory.
   - If no `courses/` directory or no active course is found, respond:
     > "No active course found. Run `/professor:new-topic` to start a course first."
   - Stop here if no course exists.

2. Identify the active course (read `COURSE.md` if only one course exists; ask the user which course if multiple exist).

3. Check if `CAPSTONE.md` exists in the active course folder (`courses/{topic-slug}/CAPSTONE.md`).
   - If `CAPSTONE.md` does not exist, respond:
     > "No capstone brief found. This may be an older course. Run `/professor:new-topic` to create a new course with a capstone brief."
   - Stop here if the file is missing.

4. Read `COURSE.md` to check course section statuses.

5. Display the full contents of `CAPSTONE.md` to the user.

6. After displaying, add one of the following contextual messages:

   **If any sections are still Not started or In progress (capstone not yet unlocked):**
   > "You can review your capstone brief anytime — but you cannot start building yet. The capstone unlocks when you run `professor:done` on the last course section. Focus on completing your remaining sections first."

   **If all sections are Done (capstone is unlocked):**
   > "All sections complete — the capstone is unlocked! This is your solo build. No hints, no `professor:stuck`, no code help. When you're finished, run `/professor:capstone-review` to submit your project."

$ARGUMENTS
