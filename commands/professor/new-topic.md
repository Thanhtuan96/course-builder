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

After confirmation, write `COURSE.md`, `CAPSTONE.md`, and `NOTES.md` simultaneously into `courses/{topic-slug}/`.

The NOTES.md file should contain:
```markdown
# 📝 Notes: [Topic Name]

---

```

User may also pass a topic directly: $ARGUMENTS
