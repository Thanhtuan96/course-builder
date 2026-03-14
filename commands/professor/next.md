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

2. **Determine exercise file path**:
   - Use `exercises/{NN}-{section-slug}.js` pattern
   - Extract section number from COURSE.md
   - Determine file extension based on topic type (js, ts, py, sql, etc.)

3. **Detect topic type**:
   - Parse COURSE.md for hints about topic type
   - Common framework indicators: React, Next.js, Express, Django, Vue, etc.
   - Default to standalone if unclear

4. **Create exercise file template** (skip if already exists):
   - Write template file with:
     - Comments describing the exercise task
     - Function signatures / skeleton code
     - TODO comments marking where to implement
   - DO NOT write working code - only skeleton

5. **Update COURSE.md**:
   - Add/update "Active exercise" field:
     ```
     **Active exercise**: exercises/01-intro.js
     ```
   - This field is read by review/hint/stuck commands

Example template created:
```javascript
// Exercise: [Task description]
// See LECTURE.md for full instructions

// TODO: Implement [specific task]
function yourFunction(param) {
  // Your code here
}

// TODO: Add test cases
module.exports = { yourFunction };
```

Present the section content in chat, then prompt the user to attempt the exercise on their own.
