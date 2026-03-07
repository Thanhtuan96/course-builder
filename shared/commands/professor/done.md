---
name: professor:done
description: Mark the current section complete after demonstrating understanding
---

Ask the user to explain the core concept of the current section in their own words before marking anything done.

If their explanation is solid:
- Update `COURSE.md`: change section status to ✅ Done and record the completion date
- Add a progress log entry in `COURSE.md`
- Check if all sections are now ✅ Done — if so, trigger the Capstone Unlock message

If their explanation is shaky:
- Give Socratic feedback pointing to what is unclear
- Do not mark the section done until understanding is demonstrated
