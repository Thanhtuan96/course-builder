---
name: professor:template-import
description: Import a course template to create a new course
argument-hint: "[<path-to-template>]"
---

When user runs `professor:template-import` or `professor:template-import <path>`, follow these steps:

## Step 1: Locate Template File

1. **If path provided:**
   - Validate the path exists and is readable
   - If not found: show error with suggestion to check the path

2. **If no path provided:**
   - Check current directory for `TEMPLATE.md`
   - If not found: prompt user "Please provide the path to the template file"

## Step 2: Validate and Parse Template

**Read and parse TEMPLATE.md:**

1. **Validate JSON frontmatter:**
   - Must exist at top of file
   - Must contain `name` and `version` fields
   - If missing: reject with error "Invalid template: missing required frontmatter (name, version)"
   
2. **Validate version:**
   - Current version: "1.0"
   - If older version: attempt migration to current format
   - If unknown version: warn but proceed

3. **Extract sections:**
   - Must have ## N. Section Title format
   - Extract section number, title, description, objectives
   - If no sections found: reject with error "Invalid template: no sections found"

4. **Extract capstone:**
   - Look for "## Capstone Project" or similar heading
   - Extract project brief, features, hints
   - If no capstone: create default capstone section

## Step 3: Preview Template to User

Show the user a preview of what will be created:

```
Template Preview
================
Course: [Name]
Difficulty: [Level]
Author: [Template Author]
Sections: [N]
Estimated: [N] hours

Sections:
1. [Title] - [Description]
2. [Title] - [Description]
...

Capstone:
[Project brief]

---
Create course from this template? (yes/no)
```

Wait for user confirmation before proceeding.

## Step 4: Create New Course

**On user confirmation "yes":**

1. **Generate slug** from template name:
   - Convert to lowercase
   - Replace spaces with hyphens
   - Remove special characters
   - Example: "React Fundamentals" → "react-fundamentals"

2. **Ensure git repository exists**:
   - Verify current directory is a git repository
   - If not: show error "Courses require a git repository"

3. **Create git worktree** at `learning/{slug}/`:
   ```bash
   git worktree add learning/{slug}/ -b learning/{slug}
   ```

4. **Write COURSE.md** with:
   - Frontmatter: name, difficulty, type, author (from template), template_source (original template author)
   - All sections from template, all marked ⬜ Not Started
   - Progress tracker section

5. **Write CAPSTONE.md** with:
   - Project brief from template
   - Suggested features
   - Technical approach hints

6. **Write NOTES.md** (empty):
   ```markdown
   # 📝 Notes: [Course Name]

   ---
   ```

## Step 5: Confirm to User

Show success message:
- "Course '[Name]' created at learning/{slug}/"
- "Run professor:next to start your first section"
- "Your course uses the template by [Template Author]"
