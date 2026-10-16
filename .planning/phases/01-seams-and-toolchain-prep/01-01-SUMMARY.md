---
phase: 1
plan: 1
plan_name: Milestone dependencies in one lockfile change
status: complete
commits:
  - ad717b5 chore(01): land milestone dependencies in one lockfile change
  - fac9245 chore(01): use zod 4 in studio as the research stack decided
---

# Plan 01-01: Milestone dependencies in one lockfile change — Summary

- Root devDeps: `supertest` (7.3.1), `@playwright/test` (1.64.1), `vitest` ^4.1.1 → ^5.0.5.
- `express` ^4.21.0 → ^4.22.3 in the manifests that already declared it (root, `web/`).
- `zod` added to `studio` dependencies; orchestrator review bumped it from 3.25 to ^4.6.7 to match the research stack.
- `packageManager: "npm@11.19.0"` pinned in the root manifest; `npm ci` verified in all four package roots.

Split out of the combined `01-SUMMARY.md` by the orchestrator so each plan has its completion record.
Verification for the whole phase: `01-VERIFICATION.md` (passed 4/4).
