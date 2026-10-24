# Beta thresholds

**DRAFT — PENDING OWNER SIGN-OFF** — these numbers are proposals, not decisions.

## Metric formulas

Each metric is defined from fields the beta report already carries. Nothing here needs a new event,
a new export field or a manual tally.

- Activation — `activation.activated` is `true`.
- Week-1 active — `window.activeDayOffsets` contains at least one offset from 1 to 7.
- Week-2 return — `retention.week2Return` is `true`, that is, at least one meaningful action on days 8–14.
- Practice loop completion — `loops.byKind.exercise_completed` is at least 1 and `revisions.explicit` plus `revisions.inferred` is at least 1.
- Artifact in a real project — `capstone.externalEvidence` is at least 1, corroborated by the Day 14 answer.
- Qualitative evidence — the three check-in questions answered in at least 3 of the 4 check-ins, with an artifact reference for at least one of them.

## Proposed rule

Read the cohort against the outcome table once, after Day 14, and take the first row whose numeric
condition holds. The rows are ordered from most to least evidence, so a cohort that satisfies
Continue is not also judged as Change.

| Outcome | Numeric condition |
|---|---|
| Continue | At least 3 participants complete a practice loop, and at least 3 return in week 2, and at least 2 have an artifact in a real project |
| Change | 1 or 2 participants complete a loop, or 1 or 2 return in week 2, or qualitative evidence is missing for 2 or more check-ins |
| Stop | No participant completes a loop, or nobody returns in week 2, or 2 consecutive participants say the tool made their work worse |

## Where the draft numbers come from

The draft numbers come from REQUIREMENTS.md BETA-05 (at least 3 of 3–5 participants) and PROJECT.md
(week-2 return = at least one meaningful action on days 8–14), and the owner may change them before
signing. Nothing outside this file restates them: the decision memo links here instead.

## Sign-off

Fill this block in before cohort Day 0. The commit hash is the commit that freezes these numbers, so
sign after the last edit and before the first check-in.

- Name:
- Date:
- Commit:
