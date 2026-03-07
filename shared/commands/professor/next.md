---
name: professor:next
description: Load the next section of your course
---

Read `COURSE.md` and find the first section with status ⬜ Not started.

If no ⬜ sections remain, check for any 🔄 In progress sections and prompt the user to complete those first.

If no course exists at all, respond: "No active course found. Start one with `/professor:new-topic` first."

Research the section topic using web search for current, accurate content.

Write `LECTURE.md` for that section (overwrite any existing file). Update `COURSE.md` status to 🔄 In progress for that section and update "Last active" date.

Present the section content in chat, then prompt the user to attempt the exercise on their own.
