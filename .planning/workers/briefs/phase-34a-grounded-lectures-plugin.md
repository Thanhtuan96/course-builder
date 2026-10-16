# Task brief: Phase 34a — Grounded lectures in the CLI plugin (GROUND-07)

Own git worktree from `feat/studio-local-first`. Phase 33 runs in parallel on `studio/**` and `bin/commands/import.js` —
do NOT touch `studio/` or `bin/`. Small conventional commits. Do NOT push.

## Problem (orchestrator evidence)
Lectures are written from model memory. The plugin's `professor:next` says "Research the section topic using web search",
but the LECTURE template has only a free-text "🔗 Resources" section with no rule against invented links, no citations,
and nothing that teaches the learner to verify information. In a Studio E2E the Resources section literally said
"Wikipedia entries on …, Britannica … Verify links before use" with zero real URLs.

## Requirements (GROUND-07)
Update the lecture contract so every `professor:next` lecture is grounded:
1. **Research first**: before writing, search + fetch 3–6 sources for the section (official docs/standards first for
   programming; encyclopedias/peer-reviewed/textbooks/primary sources for conceptual & quantitative). Keep a list of the
   URLs actually opened.
2. **Citations**: key factual claims carry `[n]`; `## 🔗 Sources` lists ONLY URLs that were actually fetched in this session:
   `[n] Title — Publisher (credibility tier) — URL — accessed YYYY-MM-DD`. Credibility tiers:
   `official/standard`, `peer-reviewed/textbook`, `reference work`, `news`, `community/blog`.
3. **Never invent**: if no source can be found for a claim, keep the claim but mark it `⚠️ unverified` and tell the
   learner how to check it; never fabricate a URL, title or quote. If web tools are unavailable, say so at the top of the
   lecture and mark all claims ⚠️.
4. **Programming**: code shown in the lecture must be runnable as-is or clearly marked as a fragment; prefer verifying
   behaviour by running it (Bash) when the agent can, and note "✓ ran on <runtime version>".
5. **🔎 Verify it yourself** section in every lecture (after Check your understanding), teaching SIFT
   (Stop · Investigate the source · Find better coverage · Trace to the original): pick ONE claim from the lecture, open
   the cited source, find the supporting passage, then find a second independent source; the learner records the result
   with `professor:note` (or LEARNING-LOG). Keep it short (≤ 6 lines).
6. **Tutor habits**: in `professor:discuss` / `hint` / `review` behaviour text, add: when the learner asserts a fact,
   occasionally ask "Where did you get that? How could you verify it?"; never present an uncited claim as certain.
7. **Quiz**: `professor:quiz` includes one question about source credibility or verification each time.
8. **Capstone review**: rubric gains a "use and citation of sources" criterion (conceptual/quantitative: required;
   programming: README cites the docs used).

## Files you own
`professor-skill/SKILL.md` + `shared/SKILL.md` (LECTURE.md Format: Sources/citations/⚠️/Verify-it-yourself; Absolute
Rules: add "never fabricate sources"), `commands/professor/{next,quiz,discuss,hint,review,capstone-review}.md` and their
`shared/commands/professor/` copies, `agents/professor.md` + `shared/agents/professor.md`, `agents/researcher.md` +
shared copy (it already exists for research — make it return a source list with tiers), `CLAUDE.md` (Core Behavior Rules).

## Verify before reporting
- `npm test` passes; shared copies in sync (`diff` each pair).
- Show in your summary the new LECTURE.md template excerpt (Sources + Verify it yourself) and the new Absolute Rule text.
