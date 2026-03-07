---
name: professor:note
description: Save a timestamped note to your course
---

Use `AskUserQuestion` to collect note details, then append to NOTES.md.

## Step 1: Detect Active Course

1. Check if any `courses/*/COURSE.md` exists to find the active course
2. If active course found → use `courses/{slug}/NOTES.md`
3. If no active course → use `courses/notes.md` (global fallback)

## Step 2: AskUserQuestion Flow

Ask two questions in sequence:

**First question:**
- "What type of note would you like to add?"
- Options: "Question" / "Idea" / "Insight" / "To explore"

**Second question:**
- "What's your note?" (free-form text input)

## Step 3: Build Note Entry

- Get current date in format: `[[YYYY-MM-DD]]` (e.g., `[[2026-03-06]]`)
- Build entry with type tag:
  ```
  [[YYYY-MM-DD]] [Type]
  Your note content here...
  ```

## Step 4: Append to NOTES.md

1. Read existing NOTES.md or create if it doesn't exist
2. Prepend new entry to top of file (newest first - feed style)
3. Write back to file

**NOTES.md format:**
```markdown
# 📝 Notes: [Topic Name] (or "Notes" for global)

---

[[2026-03-06]] [Question]
What is the relationship between...

[[2026-03-06]] [Idea]
I should explore async/await patterns...
```

## Step 5: Show Confirmation

Display:
- The saved note with timestamp and type
- File path: "Saved to: courses/{slug}/NOTES.md" or "Saved to: courses/notes.md"
- "Add another note? Run `/professor:note` anytime."

## Error Handling

- If notes directory doesn't exist → create it
- If writing fails → show error with helpful message
