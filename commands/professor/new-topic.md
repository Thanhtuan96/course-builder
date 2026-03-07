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

Propose the syllabus **inline in chat** — do NOT write any files yet. Frame each section description around how it moves the user toward their stated goal.

Wait for the user to confirm or request adjustments.

**After user confirmation, perform these steps:**

1. **Generate tech slug** from topic name:
   - Convert to lowercase
   - Replace spaces with hyphens
   - Remove special characters
   - Example: "React Fundamentals" → "react-fundamentals"

2. **Ensure git repository exists**:
   - Verify current directory is a git repository
   - If not in a git repo: Show error "Courses require a git repository. Please initialize git first."

3. **Create git worktree** at `learning/{slug}/`:
   ```bash
   git worktree add learning/{slug}/ -b learning/{slug}
   ```

4. **Write course files** to `learning/{slug}/`:
   - `COURSE.md` — syllabus with all sections starting ⬜ Not started
   - `CAPSTONE.md` — project brief for the capstone
   - `NOTES.md` — empty notes file:
     ```markdown
     # 📝 Notes: [Topic Name]

     ---

     ```

5. **Update paths**:
   - All course files now live in `learning/{slug}/` alongside user's project code
   - Reference `learning/{slug}/` instead of `courses/{slug}/`
