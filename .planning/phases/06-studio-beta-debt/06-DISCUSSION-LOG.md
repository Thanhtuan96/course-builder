# Phase 6: Studio Beta Debt - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-22
**Phase:** 6-Studio Beta Debt
**Areas discussed:** Wrong-language failure, i18n split layout, Loopback + pairing, CSP strictness

---

## Wrong-language failure

| Option | Description | Selected |
|--------|-------------|----------|
| Typed retryable error | Throw `WrongLanguageError` after the repair retry fails; never return bad JSON | ✓ |
| Accept + flag | Return the JSON but show a non-blocking banner | |
| Keep current | Log only, keep returning the second result | |

**User's choice:** Typed `WrongLanguageError`; cover syllabus, quiz, flashcards and capstone; the UI
shows a localized error with a Retry action; tests per call site.
**Notes:** Re-check language on the repair result; one repair attempt only.

## i18n split layout

| Option | Description | Selected |
|--------|-------------|----------|
| `i18n/<lang>/<namespace>.json` + `import.meta.glob` (eager) | One file per namespace per language, auto-merged | ✓ |
| One file per namespace containing both languages | Fewer files, but a language key change edits the same namespace file | |
| Keep single files | Fails the Wave 2 "add files only" requirement | |

**User's choice:** Per-language namespace files, auto-merged; keep keys and `t()` unchanged; prove
en/vi parity per namespace; language switch must not mutate shared state during render (effect/event
handler) with a test.
**Notes:** Wave 2 phases only add new namespace files.

## Loopback + pairing

| Option | Description | Selected |
|--------|-------------|----------|
| Strict loopback at save + use time | Only `localhost`, `127.0.0.0/8`, `[::1]` over http(s); reject `0.0.0.0`, LAN, tunnels | ✓ |
| UI warning only | Allow remote URLs with a caution | |
| Server-side only | Client keeps sending the token anywhere (Phase 2 covers servers) | |

**User's choice:** Enforce at settings save and again in `bridge.js` / `runner/local.js`; accept the
bare `#token=` fragment, store, scrub with `history.replaceState`; keep supporting and scrubbing the
existing hash form.
**Notes:** Token must never be attached to a non-loopback host.

## CSP strictness

| Option | Description | Selected |
|--------|-------------|----------|
| Strict script-src | `default-src 'self'`, `script-src 'self'`, no `unsafe-eval`, explicit connect-src | ✓ |
| Allow `unsafe-inline` scripts | Compatible with Vite dev preamble, weaker policy | |
| Header-only CSP | Would require server changes owned by Phase 2 | |

**User's choice:** Meta CSP in `studio/index.html` with `default-src 'self'`, connect-src including
loopback origins and the BYOK provider API origins, `object-src 'none'`, `base-uri 'none'`; omit
`frame-ancestors` because meta cannot set it.
**Notes:** Use recommended defaults for anything else.

## the agent's Discretion

- Exact localized wording for `wrong_language`.
- Whether `::ffff:127.0.0.1` is also accepted.
- Test file names within Phase 6's owned test globs.

## Deferred Ideas

- Server CSP headers / `frame-ancestors` (Phase 2 or deployment).
- Vite dev-server CSP relaxation (not owned by this phase).
- A Retry button inside `ErrorNotice` (unowned UI file; existing Generate action is the retry).
