---
name: professor:next
description: Load the next section of your course
---

Read `COURSE.md` and find the first section with status ⬜ Not started.

If no ⬜ sections remain, check for any 🔄 In progress sections and prompt the user to complete those first.

If no course exists at all, respond: "No active course found. Start one with `/professor:new-topic` first."

**Record Section Start Time and Update Streak:**

1. Get current timestamp: `sectionStartedAt = new Date().toISOString()` (e.g., "2026-03-14T15:30:00.000Z")
2. Update COURSE.md:
   - Set `**Current Section Started**: YYYY-MM-DDTHH:mm:ss` in Time Tracking section
   - Update `**Last active**: YYYY-MM-DD` to today's date
   - Update streak:
     - Read previous lastActiveDate from COURSE.md
     - If previous was yesterday: increment currentStreak
     - If previous was today: keep currentStreak
     - If previous was 2+ days ago: reset currentStreak to 1
   - Set `**Current streak**: N days` with 🔥 emoji if N ≥ 3
3. If advancing to a new section (not resuming), clear any previous sectionCompletedAt

**Streak Display:**
When greeting user at session start or after next, include streak info:
- "You're on a N-day streak! 🔥" (if streak ≥ 3)
- Or: "Streak: N days" (if streak < 3)

Research the section topic using web search for current, accurate content.

Write `LECTURE.md` for that section (overwrite any existing file). Update `COURSE.md` status to 🔄 In progress for that section and update "Last active" date.

**After writing LECTURE.md, auto-create the exercise file:**

1. **Determine course location**:
   - First check `learning/{slug}/` (worktree courses - Phase 7)
   - Fall back to `courses/{slug}/` (legacy)

2. **Detect topic type** (coding vs non-coding):
   - Scan section title and LECTURE.md content for keywords:
     - **Coding keywords** → coding exercise: "implement", "function", "write code", "program", "algorithm", "build", "create component", "API", "database", "query", "class", "method", "return", "input", "output"
     - **Non-coding keywords** → non-coding exercise: "analyze", "explain", "compare", "prove", "mark", "calculate", "design", "describe", "discuss", "evaluate", "assess"
   - Also detect from course name: React → coding, Python → coding, SQL → coding
   - Default to coding exercise if unclear

3. **Detect technology type** for file extension:
   - React/JS/Node → `.jsx` (or `.js` if no React detected)
   - TypeScript → `.ts`
   - Python → `.py`
   - SQL → `.sql`
   - Go → `.go`
   - Rust → `.rs`
   - Java → `.java`
   - Non-coding → `.md`

4. **Determine exercise file path**:
   - Use `exercises/{NN}-{section-slug}.{ext}` pattern
   - Extract section number from COURSE.md

5. **Create exercise file** (skip if already exists):

   **For CODING exercises** - generate skeleton code:
   ```javascript
   // ========================================
   // Exercise: [Exercise Title]
   // ========================================
   //
   // Objective: [1-2 sentences what user should accomplish]
   //
   // Example:
   //   Input: [example input]
   //   Output: [expected output]
   //
   // Constraints:
   //   - [Constraint 1]
   //   - [Constraint 2]
   //
   // Work on this file directly - you can complete it without the lecture visible.
   // ========================================

   // TODO: [Task 1 description]
   function yourFunction(param) {
     // Your implementation here
   }

   // TODO: [Task 2 description - if applicable]
   // function anotherFunction() { }

   module.exports = { yourFunction };
   ```

   **For NON-CODING exercises** - generate decision exercise with real scenarios:

   **Detect decision exercise subtype** based on section content:
   - **Architecture/System Design** → option comparison format
   - **Debugging/Troubleshooting** → problem diagnosis format
   - **Strategy/Planning** → action prioritization format
   - **Analysis/Evaluation** → criteria assessment format

   Generate the appropriate decision exercise type:

   ```markdown
   # Exercise: [Exercise Title]

   > **Type**: Decision Exercise
   > Work through this scenario independently, then run `professor:review` to discuss your reasoning.

   ---

   ## Scenario

   [Real-world context - who's involved, what's the problem, what needs to be decided]
   
   Include:
   - **Stakeholders**: [Who cares about this decision]
   - **Context**: [Current situation]
   - **Problem**: [What needs to be solved]

   ## Constraints

   - [Hard constraint 1]
   - [Hard constraint 2]
   - [Budget/Time/Complexity limits]

   ---

   ## Your Options

   ### Option A: [Name]
   **What**: [Brief description of approach]
   - **Pros**: [Benefit 1], [Benefit 2]
   - **Cons**: [Risk 1], [Risk 2]

   ### Option B: [Name]
   **What**: [Brief description of approach]
   - **Pros**: [Benefit 1], [Benefit 2]
   - **Cons**: [Risk 1], [Risk 2]

   ### Option C: [Hybrid/Alternative]
   **What**: [Brief description]
   - **Pros**: [Benefit 1]
   - **Cons**: [Risk 1], [Risk 2]

   ---

   ## Your Decision

   > **I chose**: [Circle one: A / B / C]
   >
   > **My reasoning**: [Explain your choice in 2-3 sentences]
   >
   > **Risks I'm accepting**: [What trade-offs you're making]

   ---

   ## Follow-Up Challenges

   1. **If constraints changed**: How would your decision change if [constraint X] was removed/added?
   2. **Edge case**: What if [unexpected scenario] happened?
   3. **Consequence**: How does this decision impact [related system/stakeholder]?

   ---

   ## Verification Criteria

   Your decision demonstrates understanding when:
   - [ ] You can explain WHY you rejected the other options
   - [ ] You acknowledge the trade-offs you're making
   - [ ] You identify at least one risk you're accepting

   ---

   *Run `professor:review` to discuss your reasoning.*
   ```

   **For debugging/troubleshooting non-coding** (when section involves diagnosing issues):

   ```markdown
   # Exercise: [Exercise Title]

   > **Type**: Problem Diagnosis
   > Diagnose the issue, propose a solution, then run `professor:review`.

   ---

   ## The Problem

   [Describe the symptoms, error messages, or unexpected behavior]

   ## Evidence Collected

   - **Symptom 1**: [Description]
   - **Symptom 2**: [Description]
   - **Environment**: [Relevant context]

   ---

   ## Diagnosis

   > **Root Cause Hypothesis**: [Your best guess at what's causing this]
   >
   > **Evidence supporting this**: [Why you think this is the cause]
   >
   > **Evidence against this**: [What doesn't fit]

   ---

   ## Proposed Solution

   > **Solution**: [Steps to fix]
   >
   > **Why this will work**: [Reasoning]
   >
   > **Risks**: [What could go wrong]

   ---

   ## Verification

   How will you confirm the fix worked?

   ---

   *Run `professor:review` to validate your diagnosis approach.*
   ```

   **For analysis/evaluation non-coding** (when section involves assessing criteria):

   ```markdown
   # Exercise: [Exercise Title]

   > **Type**: Criteria Assessment
   > Evaluate the options against key criteria, then run `professor:review`.

   ---

   ## Decision Context

   [What needs to be evaluated and why]

   ## Evaluation Criteria

   Rate each criterion 1-5 and justify:
   
   | Criterion | Weight | Option A | Option B | Option C |
   |-----------|--------|----------|----------|----------|
   | [Criterion 1] | [High/Med/Low] | Score:/5 | Score:/5 | Score:/5 |
   | [Criterion 2] | [High/Med/Low] | Score:/5 | Score:/5 | Score:/5 |
   | [Criterion 3] | [High/Med/Low] | Score:/5 | Score:/5 | Score:/5 |

   ---

   ## Weighted Analysis

   Calculate your scores:
   
   - **Option A Total**: [Weighted score]
   - **Option B Total**: [Weighted score]  
   - **Option C Total**: [Weighted score]

   ---

   ## Recommendation

   > **I recommend**: [Option]
   >
   > **Because**: [Your analysis summary]
   >
   > **Tie-breaker**: [If scores are close, what tips the balance]

   ---

   ## Self-Check

   - [ ] Criteria weights are justified
   - [ ] Scores reflect real differences
   - [ ] Tie-breaker logic is sound

   ---

   *Run `professor:review` to discuss your evaluation framework.*
   ```

6. **Update COURSE.md**:
   - Add/update "Active exercise" field:
     ```
     **Active exercise**: exercises/01-intro.js
     ```
   - This field is read by review/hint/stuck commands

Present the section content in chat, then prompt the user to attempt the exercise on their own.

**Spotter Reminder:**

After presenting the lecture content, add this reminder:

> "If you get stuck at any point while working through this exercise, run `professor:spotter` for a quick check-in — I'll help you figure out where you are without giving you the answer."

This follows the spec: "Professor should remind learners of professor:spotter when delivering a new lecture."
