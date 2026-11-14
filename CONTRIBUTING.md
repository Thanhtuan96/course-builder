# Contributing to Ronin SkillForce

Thanks for helping. Issues and pull requests are welcome at
https://github.com/Thanhtuan96/course-builder.

## Before you open a pull request

- Work on a branch from `develop` and open the PR against `develop`.
- Run `npm test` and `node scripts/sync-shared.mjs --check`; both must pass.
- Edit the canonical files only (`agents/`, `commands/professor/`, `hooks/pre-compact.js`,
  `professor-skill/SKILL.md`), then run `node scripts/sync-shared.mjs`. Never edit `shared/` by hand.
- Keep the core teaching rules in `CLAUDE.md` (never write the learner's working code, never
  fabricate sources).
- Do not add code under a copyleft licence (GPL, AGPL, SSPL) or copy code from such projects.

## Contributor licence agreement

The project is licensed under the Apache License 2.0, and the owner also builds commercial
offerings on top of it. By submitting a contribution (code, documentation or other material) you
agree that:

1. you wrote it, or have the right to submit it, and it is not subject to an incompatible licence;
2. it is licensed to the project and its users under the Apache License 2.0; and
3. you grant the project owner, Tuấn Khuất (ronnie), a perpetual, worldwide, non-exclusive,
   royalty-free, irrevocable licence to use, modify, sublicense and distribute your contribution
   under other terms as well, including in closed-source or commercial versions.

You keep the copyright in your contribution. If you cannot agree to these terms, please open an
issue describing the change instead of a pull request.

<!-- shortcut: plain-text agreement, not a signed CLA; switch to CLA Assistant (or a lawyer-reviewed ICLA) before accepting outside PRs at scale. -->
