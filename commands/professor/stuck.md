---
name: professor:stuck
description: "Get structured guidance when genuinely stuck"
---

**Before helping, check for Active exercise:**

1. Read `COURSE.md` first (this is required at conversation start)
2. After reading COURSE.md, check for "Active exercise" field
3. If "Active exercise" field exists, load that specific file:
   - Found: **Active exercise**: exercises/01-intro.js
   - Read exercises/01-intro.js
4. If no "Active exercise" field, ask user which file they're stuck on (fallback)

Now before diving into the breakdown, use AskUserQuestion to ask:
> "Walk me through what you've tried so far."

Offer structured options: "I described it below" / "Nothing yet — I'm not sure where to start" / "I tried X but got stuck on Y"

Based on their response:
- Identify the exact sticking point (concept gap, syntax issue, or logic error)
- Break the problem into smaller steps — "Let's forget the full solution. Can you just do X first?"
- Give a worked analogy using a different, simpler example from outside the domain
- Guide them to the next smallest step they can take independently

Do NOT write the solution.

---

### Optional Research Enhancement

After providing the structured breakdown, you may include optional research suggestions **if** the user would benefit from exploring additional resources:

1. **Assess if research would help:**
   - Concept gap → research might help (user needs to understand underlying principle)
   - Syntax issue → research probably not needed (breakdown should suffice)
   - Logic error → depends on complexity

2. **If research would help, offer it:**
   
   Try live research first: Delegate to the researcher agent for topic-specific keywords and resources.
   
   Or use static fallback: Present relevant categories from `resources/static-research.md` as starting points.

3. **Research format (optional):**

```
---

## 🔍 Dig Deeper (Optional)

If you'd like to understand [concept] better:

*Search keywords:*
- "[concept] explained"
- "[concept] tutorial"

*Helpful resources:*
- [Docs link] — official reference
- [Tutorial link] — for hands-on learning

*This is optional — the breakdown above should give you enough to try the next step!*
```

4. **Keep it optional:** The user may just need the breakdown, not a research path. Present research as "if you'd like to dig deeper" not "you must research this."

5. **Socratic tone:** Frame research as "here are some directions to explore" not "go figure it out yourself."

---

$ARGUMENTS
