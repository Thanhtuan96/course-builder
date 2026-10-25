# Fake-agent reply fixtures

`lesson.md` has no column-0 `#` comment inside its Exercise fence, so Journey A can assert the
Workspace seeds that fence as the skeleton before the learner edits anything (RON-196).

- **RON-197** — `findExerciseSection` treats a `#` comment inside a fenced code block as a Markdown
  heading.

Remove the fixture constraint once RON-197 is fixed.
