---
name: professor:done
description: Mark the current section complete after demonstrating understanding (via Coach agent)
---

# Professor:done → Coach Gate

This command routes to the **Coach agent** for self-assessment, then completes the section itself.

## Flow:

1. **Get the course context** — run `npx ronin-skillforce context {slug} --json`. It returns the
   absolute `dir`, `section`, `objectives`, `activeExercise`, `learningLog`, `watch` flags and the
   recent `trail`. If it exits non-zero, show its error and ask the learner which course — never
   guess a slug or path. Read `COURSE.md` from `dir` when you need more than the context gives.

2. **Coach Gate (first):** delegate to the Coach agent with:
   - The context JSON from step 1, **verbatim** (Coach must use its `dir`, not look for the course)
   - The active exercise content (if any)
   - The learner's input: $ARGUMENTS

   Coach asks "Looking back at this section — what was the hardest concept for you?", asks one
   follow-up targeting the weakest point, then decides:
   - **If solid:** "You demonstrate solid understanding. Say 'confirm' to complete."
   - **If shaky:** One more round, then complete with a ⚠️ watch-this flag, or ask the learner to
     try once more before completing.

3. **Record the verdict (required before completing):** Coach ends with a fenced `verdict` block
   containing one JSON object. Record it with the CLI — do not hand-write the section entry:

   ```bash
   npx ronin-skillforce verdict {slug} --stdin <<'VERDICT_EOF'
   {"section": "2.1 — Closures", "hardest": "closures capturing loop variables", "answers": [{"q": "What was the hardest concept?", "a": "closures capturing loop variables"}], "verdict": "watch-this: boundary conditions", "duration": "48 min", "lecture": "lectures/02-01-closures.md"}
   VERDICT_EOF
   ```

   Always use this quoted heredoc with JSON — never put the learner's words inside a shell flag,
   where the shell would expand `$(...)` or backticks. The command appends the section entry under
   `## 📝 Section Entries` and writes the ⚠️ watch-this line under the section's reasoning trail.
   **If it fails**, say "⚠️ This verdict was not recorded — <error>" and do not mark the section
   complete. Never say the verdict was saved unless the command succeeded.

4. **Wait for the learner to say "confirm":** after recording, say:
   > "Verdict recorded. Say 'confirm' to complete this section."

   Do not complete without "confirm", and do not run the gate a second time.

5. **Professor completes (once, after "confirm"):**
   - Calculate and record the duration (from section start to now)
   - Update `COURSE.md`: section status → ✅ Done, record the completion date
   - Add an entry to the Progress Log in `COURSE.md`
   - Clear the "Active exercise" field
   - Create/update `SCHEDULE.md` with flashcards for this section
   - **Capstone check:** if every section is now ✅ Done, run
     `npx ronin-skillforce capstone-status {slug} --set active` so the `**Capstone status**` header
     and the Capstone Project row both unlock, then give the **Capstone Unlock** message from
     `SKILL.md`
   - Programming courses: `npx ronin-skillforce save {slug} -m "course({slug}): complete section {N}"`
     so the progress is committed on the course branch
   - Confirm: "Section {N} complete." (followed by the unlock message when the capstone just opened)

## Watch-this Flag:

A `watch-this` verdict is written by the `verdict` command under the section's Reasoning Trail.
Coach never writes `LEARNING-LOG.md`, and Professor never hand-edits the flag: it comes from the
recorded verdict only.
