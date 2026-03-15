---
name: professor:schedule
description: Display review schedule dashboard (read-only)
---

**Read SCHEDULE.md** and display a formatted review dashboard.

**If SCHEDULE.md doesn't exist:**
> "No review schedule found. Complete some sections with `professor:done` to build your spaced repetition queue."

**Dashboard Layout:**

```
📅 REVIEW SCHEDULE — [Course Name]

═══════════════════════════════════════════════════
🔴 OVERDUE ([N] sections)
═══════════════════════════════════════════════════

Priority | Section        | Due Date   | Days Over | Cards
---------|----------------|------------|-----------|-------
🔴 High   | 1.1 Intro      | 2026-03-10 | 2 days    | 3
🔴 High   | 1.2 Concepts   | 2026-03-11 | 1 day     | 3

═══════════════════════════════════════════════════
🟡 DUE TODAY ([N] sections)
═══════════════════════════════════════════════════

Priority | Section        | Due Date   | Status    | Cards
---------|----------------|------------|-----------|-------
🟡 Med    | 1.3 Practice   | 2026-03-12 | Due today | 3

═══════════════════════════════════════════════════
🟢 UPCOMING ([N] sections)
═══════════════════════════════════════════════════

Priority | Section        | Due Date   | In        | Cards
---------|----------------|------------|-----------|-------
🟢 Low    | 1.4 Advanced   | 2026-03-14 | 2 days    | 3
🟢 Low    | 2.1 Deep Dive  | 2026-03-16 | 4 days    | 3

═══════════════════════════════════════════════════
📊 STATS
═══════════════════════════════════════════════════

Total Sections in Queue: [N]
Reviews Completed: [N]
Mastered (30d+ interval): [N]
Current Streak: [N] days 🔥

Next 7 Days: [N] reviews scheduled
Next 30 Days: [N] reviews scheduled

═══════════════════════════════════════════════════
💡 TIP
═══════════════════════════════════════════════════

Run `professor:recall` to start your review session.
Short daily reviews are more effective than cramming!
```

**Sorting Rules:**
- Overdue: sorted by days overdue (most overdue first)
- Due today: sorted by section number
- Upcoming: sorted by due date (soonest first)

**Color coding (if terminal supports it):**
- 🔴 Red = overdue or due today
- 🟡 Yellow = due within 3 days  
- 🟢 Green = due in 4+ days

**Read-only Behavior:**
- This command never modifies SCHEDULE.md
- Use professor:recall to actually perform reviews and update schedule
- Use this command anytime to check your learning pipeline
