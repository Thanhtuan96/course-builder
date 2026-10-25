# Fake-agent reply fixtures

`lesson.md` deliberately has no column-0 `#` comment inside its Exercise fence, and Journey A
types the exercise instead of relying on skeleton seeding. This works around two product bugs:

- **RON-196** — the workspace seeds from `lesson.content_md`, but generated content lives in
  `lesson_versions`.
- **RON-197** — `findExerciseSection` treats a `#` comment inside a fenced code block as a Markdown
  heading.

Remove the fixture constraint and the typing workaround in `e2e/specs/01-generated-course.spec.js`
once both are fixed.
