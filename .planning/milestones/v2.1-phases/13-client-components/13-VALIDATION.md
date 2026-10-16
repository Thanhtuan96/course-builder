---
phase: 13
slug: client-components
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-12
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest |
| **Config file** | client/vitest.config.js |
| **Quick run command** | `npm run test` in client/ |
| **Full suite command** | `npm run test:coverage` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test`
- **After every plan wave:** Run `npm run test:coverage`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 13-01-01 | 01 | 1 | WEB-09, WEB-10 | unit | `vitest run LecturePanel` | ❌ W0 | ⬜ pending |
| 13-01-02 | 01 | 1 | WEB-11 | integration | `vitest run useWebSocket` | ❌ W0 | ⬜ pending |
| 13-01-03 | 01 | 1 | WEB-12 | integration | `vitest run SSE` | ❌ W0 | ⬜ pending |
| 13-01-04 | 01 | 1 | WEB-13, WEB-14 | unit | `vitest run CommandPills` | ❌ W0 | ⬜ pending |
| 13-01-05 | 01 | 1 | WEB-15, WEB-16 | unit | `vitest run Header` | ❌ W0 | ⬜ pending |
| 13-01-06 | 01 | 1 | WEB-22 | unit | `vitest run sanitization` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `client/vitest.config.js` — test configuration
- [ ] `client/tests/LecturePanel.test.jsx` — covers WEB-09, WEB-10
- [ ] `client/tests/ChatPanel.test.jsx` — covers WEB-12, WEB-13
- [ ] `client/tests/CommandPills.test.jsx` — covers WEB-13, WEB-14
- [ ] `client/tests/Header.test.jsx` — covers WEB-15, WEB-16
- [ ] `client/tests/SplitPane.test.jsx` — covers WEB-09
- [ ] `client/tests/hooks/useWebSocket.test.js` — covers WEB-11
- [ ] `client/tests/sanitization.test.js` — covers WEB-22
- [ ] Framework install: `npm install` in client/ — if no framework detected

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual 40/60 split matches spec | WEB-09 | Layout needs visual verification | Compare screenshot to spec |
| Mobile tab switcher works at < 768px | WEB-09 | Responsive behavior | Resize browser below 768px |
| Streaming feels smooth character-by-character | WEB-12 | UX verification | Observe chat response flow |
| Command pills insert text into input | WEB-13 | UI interaction | Click pill, verify input updates |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
