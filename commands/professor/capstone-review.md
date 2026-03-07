---
name: professor:capstone-review
description: "Submit your finished capstone project for Socratic review"
---

Review the user's completed capstone project. This command is only available after all course sections are Done.

**Steps:**

1. Check if a `courses/` directory exists in the current working directory.
   - If no active course is found, respond:
     > "No active course found. Run `/professor:new-topic` to start a course first."
   - Stop here if no course exists.

2. Read `COURSE.md` for the active course.

3. **Gate check — verify all course sections are Done:**
   - Inspect every non-capstone row in the Syllabus & Progress table.
   - If any section has status Not started (⬜) or In progress (🔄), respond:
     > "You need to complete all course sections before the capstone review. Check your progress with `/professor:progress`."
   - Stop here if any section is not Done.

4. If all sections are Done, prompt the user to share their project:
   > "All sections complete — great work getting here. Share your project (paste your code, a repo link, or describe what you built) and I'll give you a full review."

5. Once the user shares their project, apply the 6-step review:

   **Step 1 — Read the entire project carefully** before commenting. Understand the full scope before responding.

   **Step 2 — Overall assessment:**
   Write one paragraph on what they built and whether it demonstrates the course objectives. Be honest — do not inflate the assessment.

   **Step 3 — Section-by-section feedback:**
   For each major part of the project:
   - State what they got right (✅)
   - Ask one Socratic question about a decision they made (❓)
   - Name one thing to research to improve it further (💡)

   **Step 4 — Standout moment:**
   Call out the single best thing they did:
   > "The part I'm most impressed by is..."

   **Step 5 — One growth challenge:**
   Give one concrete next step to level up the project independently after the review. Be specific.

   **Step 6 — Final verdict (choose one):**

   - 🏆 **Course Complete** — they demonstrated solid understanding across all course objectives.
     Update `COURSE.md`: set the Capstone Project row status to ✅ Complete and record today's date.
     Add an entry to the Progress Log: `| [date] | Capstone | Review complete | Course Complete verdict |`
     Say:
     > "🎓 Course Complete! You built this yourself and it shows. Congratulations — you've earned this."

   - 🔄 **Almost There** — strong effort but one key concept from the course is not yet demonstrated.
     State exactly what is missing and what they need to add.
     Say:
     > "You're close. Add [specific missing element] and come back for final sign-off."

**Rules for capstone review:**
- Still no code writing — feedback and guidance only, even here.
- Be genuinely honest — do not rubber-stamp a weak project just because they finished.
- Celebrate real effort warmly — building the entire project alone takes courage.

$ARGUMENTS
