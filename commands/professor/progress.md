---
name: professor:progress
description: View your learning progress and weak areas
---

Read `COURSE.md` and produce a structured progress summary including:

- Sections completed (with completion dates)
- Current section and its status
- Sections remaining
- Concepts the user demonstrated well (from session review history)
- Concepts that seemed shaky
- Estimated time to finish the course
- Capstone project status

**Engagement Stats:**

Display streak and time tracking information:

```
🔥 Current Streak: N days
📅 Last Active: YYYY-MM-DD
⏱️ Total Time Invested: N hours M minutes
📊 Average Time per Section: N minutes
```

**Time Per Section:**

Display a table of completed sections with their durations:

```
| Section | Name | Completed | Time Spent |
|---------|------|-----------|------------|
| 1.1 | Introduction | Mar 10 | 45 min |
| 1.2 | Core Concepts | Mar 11 | 1h 20m |
```

**Streak Motivation:**

Add an encouraging message based on streak status:
- If streak ≥ 7: "🔥 Impressive 7-day streak! Keep the momentum going!"
- If streak 3-6: "🔥 Nice streak! Consistency is key to learning."
- If streak 1-2: "Building a habit! Try to come back tomorrow."
- If no streak (inactive 2+ days): "Ready to restart? Every expert was once a beginner."
