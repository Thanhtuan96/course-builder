---
name: professor:done
description: Mark the current section complete after demonstrating understanding
---

Ask the user to explain the core concept of the current section in their own words before marking anything done.

If their explanation is solid:
- Update `COURSE.md`: change section status to ✅ Done and record the completion date
- Add a progress log entry in `COURSE.md`
- **Clear the "Active exercise" field**:
  - Option A: Remove the line entirely
  - Option B: Set to empty (e.g., **Active exercise**: —)
- **Create or update SCHEDULE.md** for spaced repetition (see below)
- Check if all sections are now ✅ Done — if so, trigger the Capstone Unlock message

If their explanation is shaky:
- Give Socratic feedback pointing to what is unclear
- Do not mark the section done until understanding is demonstrated

---

## SCHEDULE.md Creation

When marking a section complete, create or update `SCHEDULE.md` in the course directory.

**File location:**
- For worktree courses: `learning/{slug}/SCHEDULE.md`
- For legacy courses: `courses/{slug}/SCHEDULE.md`

**If SCHEDULE.md doesn't exist, create it:**

```markdown
---
created: YYYY-MM-DD
updated: YYYY-MM-DD
course: {course-slug}
---

# Spaced Repetition Schedule

## Flashcard Set

| Section | Question | Answer | Last Reviewed | Next Review | Interval | Status |
|---------|----------|--------|---------------|-------------|----------|--------|

## Review Queue

| Priority | Section | Due Date | Days Overdue | Flashcard Count |
|----------|---------|----------|--------------|-----------------|

## Stats

- Total Sections: 0
- Reviews Completed: 0
- Current Streak: 0 days
- Last Active: YYYY-MM-DD
```

**Generate 3 Socratic flashcards for the completed section:**

1. **Card 1 — Conceptual:** Question about the main topic (e.g., "What is the core purpose of X?")
2. **Card 2 — Application:** When/where to use it (e.g., "When would you use X instead of Y?")
3. **Card 3 — Synthesis:** Connect to prior knowledge (e.g., "How does X relate to [previous section concept]?")

**Add flashcards to the Flashcard Set table:**
- Section: Section number and name (e.g., "1.1 Introduction")
- Question: Socratic question (asks, doesn't tell)
- Answer: Brief, accurate answer
- Last Reviewed: "—"
- Next Review: Tomorrow's date (YYYY-MM-DD)
- Interval: "1 day"
- Status: "new"

**Add section to Review Queue:**
- Priority: 🔴 High (new items always high priority)
- Section: Section number and name
- Due Date: Tomorrow (YYYY-MM-DD)
- Days Overdue: "—"
- Flashcard Count: 3

**Update Stats section:**
- Increment Total Sections by 1
- Set Last Active to today's date
- Update `updated` field in frontmatter
