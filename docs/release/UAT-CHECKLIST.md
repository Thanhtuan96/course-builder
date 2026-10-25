# Professor Studio — manual UAT checklist (1.6.0-beta.x)

Manual, owner-executed release gate for macOS with a **real provider** and the **local bridge**.
This checklist is complementary to the automated suite (`npm run test:e2e`); it does not replace
it, and the E2E suite does not replace this run. Real-provider quality, visual judgement and
platform-specific runner behaviour can only be judged here.

| Field | Value |
| --- | --- |
| App version under test | `1.6.0-beta.___` |
| Date | |
| Tester | |
| macOS version / machine | |
| Provider used (Anthropic / signed-in agent CLI / other) | |
| `PROFESSOR_HOME` used | |

Record every item as **Pass** or **Fail** plus a short note (or a defect id). A fail blocks the
release; file product bugs as a new Linear issue under RON-168 rather than changing this checklist.

## 0. Setup (macOS, real provider, local bridge)

- [ ] **Clean state** — use a fresh `PROFESSOR_HOME` (e.g. `export PROFESSOR_HOME="$(mktemp -d)"`)
      and a fresh browser profile so no prior course, token or provider leaks in.
- [ ] **Start Studio + bridge** — `npx course-professor studio --no-open` from the repository root
      (Node 22.5+). Expected: the bridge prints a pairing URL and Studio serves on its own port.
- [ ] **Pair the browser** — open the printed URL, confirm **Settings → AI source → My local agent**
      is selected, the bridge URL is loopback, and **Test connection** returns a real reply.
- [ ] **Real provider is ready** — the header shows the provider as Ready (real key or signed-in
      agent CLI), and a second Test connection still succeeds.
- [ ] **Record the baseline** — note the app version, macOS version and provider in the table above.

**Pass / Fail:** ____  **Notes:**

## A. Generated-course flow (real provider)

- [ ] **A1 New course** — Home → New course → enter a topic → **Propose syllabus**. Expected: a
      syllabus with lessons, an artifact and a Definition of Done; **Start course** opens the
      course page. **Pass / Fail:** ____  **Notes:**
- [ ] **A2 Lesson** — open lesson 1 → **Generate lesson**. Expected: Markdown lesson with the
      required sections; the status becomes In progress. **Pass / Fail:** ____  **Notes:**
- [ ] **A3 Quiz** — Practice → **Check your understanding** → answer all five. Expected: immediate
      right/wrong feedback with explanations, a score, and the attempt listed under Past attempts.
      **Pass / Fail:** ____  **Notes:**
- [ ] **A4 Tutor** — Tutor → send a learner message. Expected: a streamed Socratic reply; no
      complete solution and no code the learner should have written. **Pass / Fail:** ____
      **Notes:**
- [ ] **A5 Workspace run shows `Local machine` + one-time acknowledgement** — Workspace tab.
      Expected: the `Local machine` badge; the "Code runs on your machine" notice before the first
      run; the first Run is intercepted with nothing executed; after "I understand — run my code"
      the run executes; a second run does not re-prompt; a fresh profile or different runner URL
      re-prompts. **Pass / Fail:** ____  **Notes:**
- [ ] **A6 Workspace run + revision** — run the lesson exercise (failing), then fix it and run again;
      then Tutor → **Review my attempt** → one unmet criterion with a Socratic question →
      **Revise this attempt** → send the revision → review again. Expected: green run; attempt
      history shows both runs; the second review is all met and the history shows the transition.
      **Pass / Fail:** ____  **Notes:**

## B. Playwright template flow (real provider, own Playwright run)

- [ ] **B1 Pre-flight gate** — New course → the template card. Expected: the start button is
      disabled until all five pre-flight items are ticked; after ticking, **Start the Playwright
      course** opens the seeded five-lesson course with no API call. **Pass / Fail:** ____
      **Notes:**
- [ ] **B2 Template lessons** — open all five lessons and mark each done. Expected: five written
      lessons and the capstone unlocks with the R1–R7 rubric. **Pass / Fail:** ____  **Notes:**
- [ ] **B3 Run Playwright in your own project (green)** — follow the evidence form's Chromium
      command in a real project. Expected: the JSON/list output shows a real passing Chromium test
      with 0 failures; facts, Playwright version, Chromium state and spec files match the terminal.
      **Pass / Fail:** ____  **Notes:**
- [ ] **B4 Paste/confirm evidence** — paste the green output and tick the confirmation. Expected:
      the facts block shows Chromium, passed > 0, failed 0, the "self-reported evidence" label, and
      the uploaded spec path matches the submitted spec source (no mismatch warning).
      **Pass / Fail:** ____  **Notes:**
- [ ] **B5 Real-provider R1–R7 review (strong spec)** — submit the spec + write-up. Expected: one
      status per criterion R1–R7, one Socratic question per unmet criterion, no corrected code or
      diff, verdict only from the code-owned rules; a clean green Chromium run can pass.
      **Pass / Fail:** ____  **Notes:**
- [ ] **B6 Real-provider R1–R7 review (weak spec)** — repeat with a weak spec (CSS/XPath locators,
      `waitForTimeout`, no isolation). Expected: the weak criteria are `partial`/`not_met` with
      questions, no rewritten test, and the course is not completed. **Pass / Fail:** ____
      **Notes:**
- [ ] **B7 Full revise loop** — failing run → revise → clean run → submit. Expected: the second
      attempt is linked, history and the completion export show per-attempt evidence, only changed
      criteria are listed, and the final verdict is `course_complete`. **Pass / Fail:** ____
      **Notes:**
- [ ] **B8 Upload/clipboard edge cases** — try a >1 MB file, a binary file, and deny clipboard
      permission. Expected: localised errors / `copyFailed`, never a crash; the form stays usable.
      **Pass / Fail:** ____  **Notes:**
- [ ] **B9 Vietnamese variant** — switch the learning language to `vi` and repeat the template item
      labels. Expected: Vietnamese checklist, lessons, rubric labels and evidence-form copy.
      **Pass / Fail:** ____  **Notes:**

## C. Beta report export

- [ ] **C1 Preview** — Settings → **Preview beta report**. Expected: the preview matches the file
      and shows counts from **both** flows (quizzes, workspace runs from A; capstone checkpoints
      and external evidence from B). **Pass / Fail:** ____  **Notes:**
- [ ] **C2 Download + validate** — **Download beta report**. Expected: one JSON file downloads,
      validates against schema v1, contains no course text, code, prompts or keys, and nothing is
      uploaded. **Pass / Fail:** ____  **Notes:**

## D. Eight deferred manual checks from RON-169

These are the checks deferred from RON-164 (P8) and RON-165 (P9). Each one is still required.

- [ ] **D1 Real-provider Vietnamese tutor review** — language `vi`, real provider, send an attempt,
      press **Nhận xét bài của tôi**. Expected: one met/partial/not_met chip per criterion, exactly
      one Vietnamese Socratic question per unmet/partial criterion, no code/diff/corrected answer;
      a second review keeps the same criterion keys. **Pass / Fail:** ____  **Notes:**
- [ ] **D2 Real local run shows `Local machine` + one-time acknowledgement** — as A5, with a real
      provider. Expected: badge, notice, first-click interception, then execution; no re-prompt on
      the second run; a different runner URL or fresh profile re-prompts. **Pass / Fail:** ____
      **Notes:**
- [ ] **D3 Start the Playwright template in a real browser** — as B1/B2. Expected: the CTA enables
      only when all five pre-flight items are ticked; five lessons and an R1–R7 capstone with no
      runner. **Pass / Fail:** ____  **Notes:**
- [ ] **D4 Run Playwright in your own project, submit real output (one green, one failing)** — as
      B3. Expected: facts, version, Chromium state, spec files and mismatch warnings match the
      terminal; the "self-reported evidence" label is shown; the failing output is accepted but
      cannot complete the course. **Pass / Fail:** ____  **Notes:**
- [ ] **D5 Real-provider review against R1–R7 (weak + strong spec)** — as B5/B6. Expected: one
      status per criterion, one Socratic question per unmet criterion, no corrected code; only the
      clean green Chromium run can pass. **Pass / Fail:** ____  **Notes:**
- [ ] **D6 Full revise loop** — as B7. Expected: failing run → revise → clean run → `course_complete`;
      history and completion export show linked attempts, per-attempt evidence and only changed
      criteria. **Pass / Fail:** ____  **Notes:**
- [ ] **D7 Upload/clipboard edge cases** — as B8. Expected: >1 MB file, binary file and denied
      clipboard permission produce localised errors and `copyFailed`, never a crash.
      **Pass / Fail:** ____  **Notes:**
- [ ] **D8 Vietnamese variant** — as B9. Expected: Vietnamese checklist, lessons, rubric labels and
      evidence-form copy. **Pass / Fail:** ____  **Notes:**

## Results and defect log

| Item | Result | Evidence / notes | Linear issue |
| --- | --- | --- | --- |
| A1 | | | |
| A2 | | | |
| A3 | | | |
| A4 | | | |
| A5 | | | |
| A6 | | | |
| B1 | | | |
| B2 | | | |
| B3 | | | |
| B4 | | | |
| B5 | | | |
| B6 | | | |
| B7 | | | |
| B8 | | | |
| B9 | | | |
| C1 | | | |
| C2 | | | |
| D1–D8 | | | |

**Release decision:** Pass / Fail  **Signed-off by:** ______________________  **Date:** __________

Product bugs found during UAT go to a **new Linear issue under RON-168** (one issue per bug). Do
not fix them inside this UAT item and do not change this checklist to match a bug.
