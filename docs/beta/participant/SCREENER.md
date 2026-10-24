# Screener

Paste the block below into the candidate's message thread and fill it in place. There is nothing to
assemble and nothing to score outside the block.

```
Screener — private beta, four weeks, macOS

Knockouts — all five must pass
- [ ] macOS 13 or newer
- [ ] Node 22.5 or newer available (node:sqlite is required)
- [ ] An existing web project you own and can change
- [ ] Willing to run terminal commands
- [ ] Willing to export a beta report on Day 7 and Day 14

Fit signals — at least two of three must be true
- [ ] Already ship to a real user or teammate
- [ ] Use an AI coding assistant daily
- [ ] Have one specific feature you want to finish in the next two weeks

Decision rule: Accept only if all five knockouts pass and at least two of three fit signals are true. Reject otherwise — do not score, do not average.
```

## How to read the answers

A failed knockout ends the conversation: the beta cannot run on an older macOS, and a participant
without `node:sqlite` cannot store local events. Fit signals only break ties; they never compensate
for a failed knockout, and the result is a yes or a no, never a number.
