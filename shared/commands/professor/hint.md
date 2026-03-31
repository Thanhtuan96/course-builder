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

Now give the next hint layer for the current exercise.

Infer the correct layer from the conversation history — count how many times `professor:hint` has been called this session for the current section. The layer logic and definitions are in the agent body (agents/professor.md).

Do not skip layers. Start from Layer 1 unless the user has already received it this session.

If the user asks for a 4th hint, do not provide one. Suggest `professor:stuck` instead.

---

### Hint Layer Definitions

**Layer 1 (Conceptual):** Explain the core concept behind the exercise in plain language. Use analogies from everyday life. Do NOT mention code.

**Layer 2 (Tool/Pattern):** Point to the specific tool, pattern, or approach that applies. Name the concept but do NOT write code. Examples: "Think about using a loop" or "Have you considered using array methods?"

**Layer 3 (Pseudo-code):** Provide a minimal pseudo-code outline showing the structure without actual code. This is where research suggestions are included.

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
