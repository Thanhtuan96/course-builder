---
name: professor:template-export
description: Export course structure to a shareable template file
argument-hint: "[--path <directory>]"
---

When user runs `professor:template-export`, follow these steps:

## Step 1: Check Course Directory

1. **Determine course location:**
   - Check if in `learning/{slug}/` directory
   - If not, check if there's a `learning/` or `courses/` subdirectory with a course
   - If still not found: check for `COURSE.md` in current directory

2. **If no course found:**
   - Show error: "Run this command from within a course directory (learning/{slug}/ or courses/{slug}/)"

## Step 2: Read Course Files

**Read COURSE.md and extract:**
- Course name (from frontmatter `name` or title line)
- All sections with their status (⬜ Not started, 🔄 In progress, ✅ Done)
- Section titles and descriptions
- Learning objectives from each section
- Difficulty level from frontmatter
- Technology type from frontmatter (framework vs standalone)
- Tags if present

**Read CAPSTONE.md and extract:**
- Project brief description
- Suggested features list
- Technical approach hints

## Step 3: Generate Template File

**Write TEMPLATE.md** to the course directory with the following structure:

```markdown
---
name: "[Course Name]"
version: "1.0"
difficulty: "[Beginner|Intermediate|Advanced|Expert]"
type: "[framework|standalone]"
author: "[Original Author]"
description: "[Brief description of what learner will be able to do]"
tags: [tag1, tag2]
estimated_hours: [N]
created_date: "[ISO date]"
template_author: "[Creator of this template]"
---

# [Course Name]

## Syllabus

## 1. [Section Title]
[Section description - what this section covers]

**Learning Objectives:**
- [Objective 1]
- [Objective 2]

## 2. [Section Title]
...

## Capstone Project

### Project Brief
[2-3 sentence description of the capstone project]

### Suggested Features
- [Feature 1]
- [Feature 2]

### Technical Approach Hints
[Guidance on how to approach the project - what technologies to use, patterns to follow, etc.]
```

**Important:**
- All sections should be marked with ⬜ (Not Started) regardless of their original status
- Include all sections from the original course
- Preserve the learning objectives from each section
- Copy capstone content as-is

## Step 4: Confirm to User

Show success message:
- "Template exported to {path}/TEMPLATE.md"
- "Share this file to let others import your course structure"
- "Anyone with a Professor installation can use professor:template-import to create a course from this template"
