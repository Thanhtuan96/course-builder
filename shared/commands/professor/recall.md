---
name: professor:recall
description: Run an interactive recall session for due sections
---

**Read SCHEDULE.md** to identify sections needing review today or overdue.

**If no sections due:**
> "Great news! Nothing due for review today. Your next review is [Section X] on [date]."
> Show professor:schedule output for context.

**If sections are due:**

1. **Display due sections summary:**
   > "📚 You have [N] section(s) ready for review:"
   > - Section X (overdue by N days)
   > - Section Y (due today)

2. **For each due section, run recall session:**
   
   Read the 3 flashcards from SCHEDULE.md for this section.
   
   **Card 1: Conceptual**
   > **Reviewing: [Section Name]**
   > 
   > **Question:** [Socratic question from SCHEDULE.md]
   > 
   > Take your time to answer in your own words. When ready, say "ready" and I'll show the answer.
   
   Wait for user to respond with their answer or "ready".
   
   > **Answer:** [From SCHEDULE.md]
   > 
   > How well did you know this?
   > - **clear** — Knew it completely, could explain it to someone else
   > - **fuzzy** — Knew parts but not confident
   > - **forgot** — Didn't remember or got it wrong

3. **After user rates, update SCHEDULE.md:**
   
   For each card rated:
   - Update "Last Reviewed" to today
   - Calculate next review date based on rating:
     - **clear**: double the current interval (1d→2d→4d→8d→16d→30d max)
     - **fuzzy**: keep same interval
     - **forgot**: reset to 1 day
   - Update "Next Review" date
   - Update "Interval" field
   - Update "Status": new→learning→review→mastered (after 30d interval)
   
   Update Review Queue:
   - Move section to appropriate priority based on new due date
   - If next review is tomorrow: 🔴 High
   - If next review is 2-7 days: 🟡 Medium  
   - If next review is 8+ days: 🟢 Low

4. **After all sections reviewed:**
   > "✅ Recall session complete! You reviewed [N] sections."
   > 
   > **Today's ratings:**
   > - Clear: [N] | Fuzzy: [N] | Forgot: [N]
   > 
   > **Next reviews:**
   > - Tomorrow: [N] sections
   > - This week: [N] sections
   > 
   > Run `professor:schedule` anytime to see your full review calendar.

**Spaced Repetition Logic:**
- Intervals: 1d → 2d → 4d → 8d → 16d → 30d (max)
- All calculations use calendar days (not 24h periods)
- If overdue, calculate from today (not original due date)
