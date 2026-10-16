---
name: professor:hint
description: "Get the next hint layer without revealing the answer"
---

**Before giving hints, check for Active exercise:**

1. Read `COURSE.md` first (this is required at conversation start)
2. After reading COURSE.md, check for "Active exercise" field
3. If "Active exercise" field exists, load that specific file:
   - Found: **Active exercise**: exercises/01-intro.js
   - Read exercises/01-intro.js
4. If no "Active exercise" field, ask user which file to provide hints for (fallback)

**Read LEARNING-LOG.md Attempt Log:**

Before applying hint layers, check if LEARNING-LOG.md exists in the course directory:
1. First check `learning/{slug}/LEARNING-LOG.md` (worktree courses)
2. Fall back to `courses/{slug}/LEARNING-LOG.md` (legacy)
3. If found, read the **## 📋 Attempt Log** section for the current section
4. If attempt log has entries for this section:
   - Acknowledge the learner's stated sticking point from the log
   - Example: "I see you've been working on [sticking point]. Let's look at that."
   - Incorporate this context into your hint delivery
5. If no attempt log entries, proceed with standard hint layers

The goal: hints are warmer when Spotter check-ins happened first.

**Tutor habit:** when the learner asserts a fact, occasionally ask "Where did you get that? How could you verify it?" — never present an uncited claim as certain, and never invent a source.

Now give the next hint layer for the current exercise.

Infer the correct layer from the conversation history — count how many times `professor:hint` has been called this session for the current section. The layer logic and definitions are in the agent body (agents/professor.md).

Do not skip layers. Start from Layer 1 unless the user has already received it this session.

If the user asks for a 4th hint, do not provide one. Suggest `professor:stuck` instead.

---

### Hint Layer Definitions

The three layers always advance **concept → approach → structural hint**. What Layer 2 and Layer 3 look like depends on the **course Kind** (`**Kind**: ...` in `COURSE.md`; missing → `programming`). Never reveal the answer.

| Kind | Layer 1 — Concept | Layer 2 — Approach | Layer 3 — Structural hint |
|---|---|---|---|
| `programming` | the underlying concept in plain language, analogies, no code | the specific tool / pattern / language feature to use | minimal pseudo-code outline (shape only, no working logic) |
| `quantitative` | the underlying idea / formula in plain language | the method or technique to apply | partial setup — the first step(s) and the shape of the solution, not the answer |
| `conceptual` | the framing idea in plain language | the lens / framework to analyse with | an outline of the argument (points to cover), not the finished argument |
| `skill` | the principle in plain language | the technique / focus point to practise | a scaffolded mini-example, not the full performance |

The **programming** row is the default; for the other kinds, read the kind first and adapt Layer 2 and Layer 3 as shown. Do NOT mention code for non-programming kinds.

---

### Layer 3 Research Enhancement

After providing the Layer 3 pseudo-code hint, attempt to provide research keywords:

1. **Try live research first:** Delegate to the researcher agent with the current section context. Ask for:
   - 3-5 search keywords the user can copy-paste directly into Google
   - 2-3 helpful resources with URLs and brief annotations

2. **If live research succeeds:** Present the keywords and resources in this format:

```
---

## 🔍 Research This

*Search keywords you can copy-paste:*
- [keyword 1]
- [keyword 2]
- [keyword 3]

*Helpful resources:*
- [Resource name](url) — [why useful]
- [Resource name](url) — [why useful]
```

3. **If live research fails or times out:** Use the static fallback from `resources/static-research.md`. Present relevant category templates as starting points for the user's own research.

4. **Important:** Keep the Socratic tone — present research as "here are some directions to explore" not "go figure it out yourself."

---

### Layer 3 Research Template

```
---

## 🔍 Research This

*Search keywords you can copy-paste:*
- "[topic] tutorial"
- "[topic] explained"
- "[topic] best practices"

*Helpful resources:*
- [Official documentation] — for comprehensive reference
- [Tutorial name] — for step-by-step learning

*When you're ready, come back and we can apply what you've learned!*
```

---

$ARGUMENTS
