---
name: professor:export
description: "Export course to Notion or Obsidian"
---

When user runs `professor:export`, follow the instructions in `agents/professor.md` for the export behavior, with these additional SCHEDULE.md export requirements:

## SCHEDULE.md Export

Include flashcards and review history in exports:

1. **Read SCHEDULE.md** from course directory
2. **If exists, include in export payload:**
   - Flashcard Set (all questions/answers)
   - Review Queue (what's due when)
   - Stats (reviews completed, mastered sections)

### Notion Export (SCHEDULE.md section)

Create a child page under the course parent page:
- **Title:** "Flashcards & Retention"
- **Content:**
  ```
  # Flashcards & Retention Schedule

  ## Flashcard Set

  | Section | Question | Answer |
  |---------|----------|--------|
  | 1.1 | What is X? | X is... |
  | 1.1 | When to use X? | Use X when... |
  | ... | ... | ... |

  ## Review Schedule

  | Section | Next Review | Interval | Status |
  |---------|-------------|----------|--------|
  | 1.1 | 2026-03-15 | 4 days | learning |
  | 1.2 | 2026-03-16 | 2 days | new |

  ## Stats

  - Total Flashcards: [N]
  - Reviews Completed: [N]
  - Mastered Sections: [N] (30+ day intervals)
  - Current Streak: [N] days
  ```

### Obsidian Export (SCHEDULE.md section)

Create file: `{course-slug}/Retention Schedule.md`

Include SCHEDULE.md content as-is (raw Markdown), preserving:
- Frontmatter
- All tables (Flashcard Set, Review Queue)
- Stats section
- Any user notes or modifications

This allows Obsidian users to continue using their preferred spaced repetition plugin if desired.

### Export Flow

When user runs professor:export:
1. Check for SCHEDULE.md existence
2. If exists:
   - Notion: Create "Flashcards & Retention" child page
   - Obsidian: Create "Retention Schedule.md" file
3. If doesn't exist:
   - Include note: "No retention schedule found. Complete sections to build flashcards."
