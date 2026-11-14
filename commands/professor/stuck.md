---
name: professor:stuck
description: Get structured guidance when genuinely stuck (via Coach agent)
argument-hint: "[describe what you're stuck on]"
---

# Professor:stuck → Coach Agent

This command routes to the **Coach agent** which provides help through self-assessment dialogue.

## Capstone guard — check before routing:

`professor:stuck` is refused during the **capstone phase**: when every syllabus section is ✅ Done,
or when `**Capstone status**` is 🔄 In progress or ✅ Complete. Read `COURSE.md` first, then refuse:

> "No `professor:stuck` in the capstone phase — the rules change here: build the project yourself,
> with no hints and no stuck-coaching. You can run `professor:discuss` to talk a concept through, but
> I won't touch your code."

Stop there and do not route to Coach. A course with at least one ⬜ or 🔄 section and
`**Capstone status**: 🔒 Locked` (or no status line) is not capstone — continue normally.

## Before routing to Coach:

1. **Get the course context** — run `npx ronin-skillforce context {slug} --json`. If it exits non-zero, show its error and ask the learner which course — never guess a slug or path.
2. If `activeExercise` is set, read that file for context

## Route to Coach:

> "Coach will help you work through this. Let's start with a check-in — where are you right now?"

Delegate to the Coach agent with:
- The context JSON from step 1, **verbatim**
- Active exercise content (if any)
- User's stuck description: $ARGUMENTS

Coach will guide through self-assessment to identify the exact blocker, then break into smaller steps.

## If no Coach agent is available:

> If no Coach agent is available on this platform, run the Coach flow below inline.

Run the stuck flow yourself — you are the Coach here:

1. Open with the check-in: *"Walk me through what you've tried so far."*
2. Identify the **exact sticking point** — a concept gap, a syntax issue, or a logic error?
3. Break the problem into **smaller steps**: *"Let's forget the full solution. Can you just do X first?"*
4. Give a **worked analogy** from a different, simpler domain.
5. Still no solution — name the next smallest step they can take and stop there.

When Coach returns a `trail` block, record it with `npx ronin-skillforce trail {slug} --stdin` and a quoted `<<'TRAIL_EOF'` heredoc of JSON, exactly as in `professor:review`. If that fails, say "⚠️ This round was not recorded" — never claim it was saved.
