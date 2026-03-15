---
name: professor:spotter
description: >
  Quick mid-work check-in during exercises. Spotter asks where you are and helps
  you assess your position without giving hints.
---

# professor:spotter — Exercise Companion Check-In

A quick check-in command that helps learners assess their current position during an exercise.

---

## When to Use

Run `professor:spotter` whenever:
- You start working on an exercise and want to clarify your approach
- You hit a wall and need to articulate what's blocking you
- You have something working but want to think through whether it's right
- You're ready for feedback and want to route to Coach

---

## Behavior

### Step 1: Present Position Check-in

When invoked, Spotter presents the position prompt:

```
Quick check-in — where are you right now?

a) I have a rough idea but haven't started writing yet
b) I've started but hit a wall
c) I have something working but not sure it's right
d) I think I'm done — ready for review
```

### Step 2: Route Response

Based on learner's response:

- **(a)** → Ask: "What's the first smallest thing you could try?"
- **(b)** → Ask: "What exactly is the wall? Describe it."
- **(c)** → Ask: "What makes you unsure? Walk me through your logic."
- **(d)** → Say "Let me hand you off to Coach for review" and invoke Coach

### Step 3: Append Attempt Log

After each check-in, append an entry to `LEARNING-LOG.md`:

```markdown
## 📋 Attempt Log

### Section N.M — [Title]

- HH:MM — check-in: "[learner response]" → sticking point: [description]
- HH:MM — check-in: "ready for review" → routed to Coach
```

---

## File Paths

- Course: `learning/{slug}/` (worktree) or `courses/{slug}/` (legacy)
- LEARNING-LOG.md: In the course directory alongside COURSE.md

---

## Delegation

For position (d), Spotter hands off to Coach:

> "Let me hand you off to Coach for review. Coach will ask you a self-assessment question first."

Then invoke the Coach agent with `professor:review`.
