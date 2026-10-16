# Feature Research: Local Web UI for Professor Plugin

**Domain:** Web-based Learning Interface / Split-Pane Educational Chat Application
**Researched:** 2026-03-08
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

These are non-negotiable features for any web-based learning interface. Users assume these exist in any modern learning application. Missing any of these results in an incomplete, broken-feeling product.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Split-pane layout (lecture + chat)** | Fundamental UI pattern for dual-content learning; learners need to reference lecture material while interacting with the AI tutor | MEDIUM | Implemented as 50/50 horizontal split; lecture on left, chat on right. WebSocket enables real-time lecture refresh. |
| **Streaming AI responses** | Modern chatbot UX standard; character-by-character streaming eliminates perception of latency; users expect instant feedback | MEDIUM | Implemented via Server-Sent Events (SSE) from Claude API; no waiting for full response |
| **Markdown rendering** | Lecture content and AI responses are markdown-based; code blocks, lists, headers must render properly | LOW | Uses `marked` library; code blocks need syntax highlighting |
| **Syntax highlighting** | Technical learning content requires readable code; plain monospace is insufficient for comprehension | LOW | Shiki or similar for code block highlighting; critical for tech topics |
| **Course/lesson selector** | Users must navigate between multiple courses; dropdown or list selector is standard pattern | LOW | Course switcher in top bar; displays course name and last active date |
| **Context-aware command interface** | Learning interfaces require structured actions beyond freeform chat; different phases (reading, exercise, review) need different available commands | MEDIUM | Command pills change based on learning phase; prevents user confusion about available actions |
| **Visual progress indicator** | Users need to know where they are in the course; progress bars or section markers are standard | LOW | Progress percentage or section count in top bar |
| **Message input with send** | Standard chat input; textarea with Enter to send, Shift+Enter for newline | LOW | Standard chat UX; disabled during streaming to prevent issues |

### Differentiators (Competitive Advantage)

These features set Professor's web UI apart from generic chat interfaces or other learning platforms. They align with the core Socratic methodology and leverage the existing plugin architecture.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Socratic method enforcement** | Unlike ChatGPT which eventually gives answers, Professor NEVER writes code for users; the web UI enforces this through UI design (no "show answer" buttons) | MEDIUM | Command pills only offer Socratic commands; no shortcut to skip to solution |
| **Phase-aware command pills** | Context-sensitive UI shows relevant commands based on learning phase (idle/lecture/exercise/review); reduces cognitive load and command memorization | MEDIUM | Prevents users from running wrong commands; UI guides correct behavior |
| **Real-time lecture refresh via WebSocket** | Lecture panel auto-updates when professor:next runs in chat; no manual refresh needed; seamless dual-panel experience | MEDIUM | WebSocket broadcasts file change events; lecture panel listens and reloads |
| **Dual CLI/Web interoperability** | Users can switch between web UI and CLI seamlessly; both read/write the same markdown files; no data lock-in | LOW | Both interfaces use same courses/ directory; file-based state is the integration point |
| **Integrated note-taking** | Per-course notes accessible within the learning interface; not a separate app or file | LOW | NOTES.md file rendered alongside lecture; quick-add button in UI |
| **System prompt integration** | Web UI uses exact same agent behavior as CLI (from agents/professor.md); consistent Socratic experience across interfaces | LOW | System prompt loaded from agent file; ensures behavioral consistency |

### Anti-Features (Commonly Requested, Often Problematic)

These features seem appealing but create significant problems for this specific product. They are explicitly NOT planned.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Real-time cursor/presence** | "Show when the other is typing" feels collaborative | Adds significant complexity; learning is async/solo; no second user to collaborate with | Keep it simple — single user focused |
| **Video/audio embedding** | "Add multimedia for richer learning" | Contradicts text-based Socratic method; video content invites passive consumption vs active learning | Stay text-focused; Socratic method relies on written dialogue |
| **Mobile-first responsive design** | "Make it work on phones" | Complex interactions (split-pane) don't translate well to mobile; requires separate mobile UX | Responsive is fine (scales down); dedicated mobile app is future consideration |
| **User authentication/accounts** | "Persist user data in the cloud" | Contradicts local-first philosophy; adds infrastructure complexity; CLI users prefer local control | File-based state remains; optional export to Notion/Obsidian for backup |
| **Collaborative learning features** | "Learn together with others" | Beyond v1 scope; adds moderation/complexity; learning is solo by design | Focus on individual learning excellence first |
| **Automated grading/scoring** | "Add quizzes with scores" | Quantifying learning contradicts Socratic qualitative approach; exercises have success criteria, not scores | Keep success criteria as checkboxes, not points |

## Feature Dependencies

```
[Course File API]
    └──requires──> [Express Server Routes]
                       └──requires──> [File System Access]

[Chat Panel with SSE]
    └──requires──> [Claude API Integration]
                       └──requires──> [System Prompt Loader]

[Lecture Panel Auto-Refresh]
    └──requires──> [WebSocket Server]
                       └──requires──> [File Watcher / Notification]

[Command Pills (Phase-Aware)]
    └──requires──> [Learning Phase Detection]
                       └──requires──> [Course State Parser]

[Split-Pane Layout]
    └──enhances──> [Lecture Panel] ──and──> [Chat Panel]
```

### Dependency Notes

- **Course File API is foundational:** All other features depend on reading/writing the markdown course files; this must be the first backend feature implemented
- **Claude API Integration is core:** Without streaming responses, the web UI loses its primary value proposition; must work reliably before launch
- **WebSocket requires server running:** Lecture auto-refresh only works when Express server is active; CLI users won't get this feature
- **Phase detection requires COURSE.md parsing:** Command pills must read current section status to determine which commands to show; COURSE.md format is the contract
- **Split-pane layout is the container:** Both panels exist simultaneously; neither can work without the other in the main UI

## MVP Definition

### Launch With (v1)

These features constitute the minimum viable product for the web UI. Without any of these, the product fails its core promise of "better UX than CLI."

- [x] **Split-pane layout** — Lecture panel (left) + Chat panel (right), resizable or fixed 50/50
- [x] **Streaming chat responses** — Character-by-character streaming via SSE from Claude API
- [x] **Markdown rendering** — Lecture content and chat messages render markdown properly
- [x] **Syntax highlighting** — Code blocks in lecture and chat have readable syntax colors
- [x] **Course selector dropdown** — Top bar allows switching between courses; loads LECTURE.md for selected course
- [x] **Context-aware command pills** — Buttons below chat change based on learning phase; only shows valid commands
- [x] **Basic progress display** — Shows course name, last active date in top bar
- [x] **WebSocket lecture refresh** — Lecture panel auto-updates when professor:next runs in chat
- [x] **CLI interoperability** — Both interfaces use same courses/ directory; can switch freely

### Add After Validation (v1.x)

Features to add once the core is validated and working. These enhance the experience but aren't required for initial launch.

- [ ] **Session timer** — Tracks time spent on current section; helps users plan learning sessions
- [ ] **Exercise checklist in lecture panel** — Interactive checkboxes for success criteria; directly in lecture UI
- [ ] **Visual section navigation** — Clickable section list in lecture panel to jump to previous sections
- [ ] **Quick note button** — One-click to open notes panel or add note to current course

### Future Consideration (v2+)

Features to defer until product-market fit is established. These require significant work and may change based on user feedback.

- [ ] **Spaced repetition reminders** — System-initiated review prompts after 1/3/7 days
- [ ] **Learning streak calendar** — GitHub-style contribution graph showing daily activity
- [ ] **Quiz card-flip UI** — Interactive quiz cards instead of text-based professor:quiz
- [ ] **Multi-course dashboard** — Grid view of all courses with progress percentages
- [ ] **Mobile responsive optimization** — Vertical stacked layout for mobile devices

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Split-pane layout | HIGH | MEDIUM | P1 |
| Streaming responses | HIGH | MEDIUM | P1 |
| Markdown rendering | HIGH | LOW | P1 |
| Syntax highlighting | HIGH | LOW | P1 |
| Course selector | HIGH | LOW | P1 |
| Command pills (phase-aware) | HIGH | MEDIUM | P1 |
| Progress display | MEDIUM | LOW | P1 |
| WebSocket refresh | HIGH | MEDIUM | P1 |
| CLI interoperability | HIGH | LOW | P1 |
| Session timer | MEDIUM | LOW | P2 |
| Exercise checklist | MEDIUM | MEDIUM | P2 |
| Section navigation | MEDIUM | MEDIUM | P2 |
| Quick notes | LOW | LOW | P2 |
| Spaced repetition | MEDIUM | HIGH | P3 |
| Streak calendar | LOW | MEDIUM | P3 |
| Quiz card UI | MEDIUM | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch — any P1 missing means product is not viable
- P2: Should have, add when core is stable — enhances experience significantly
- P3: Nice to have, future consideration — depends on user demand and validation

## Competitor Feature Analysis

| Feature | ChatGPT Web | Khan Academy | Duolingo | Our Approach |
|---------|-------------|--------------|----------|---------------|
| Split-pane content + chat | No — single panel | Yes — video + exercises | Yes — lessons + chat | Yes — lecture + Socratic chat |
| Streaming responses | Yes | Partial | Yes | Yes — via SSE |
| Context-aware commands | No — freeform only | Yes — guided path | Yes — skill tree | Yes — phase-aware pills |
| Syntax highlighting | Yes — GPT-4 | Yes — code examples | N/A | Yes — Shiki integration |
| Progress visualization | No | Yes — mastery % | Yes — XP + streaks | Basic — course name + last active |
| AI never gives answers | No — will explain | Partial — hints available | Partial — hints available | Yes — core differentiator |
| File-based state | No — cloud only | No — cloud only | No — cloud only | Yes — local markdown files |
| Works offline | No | No | Limited | N/A — requires API key anyway |

**Key insight:** No major competitor combines split-pane layout with strict Socratic methodology. This is Professor's unique positioning. ChatGPT is too freeform, Khan Academy is video-based, Duolingo is gamified. Professor's value is the structured Socratic conversation with lecture reference in a clean dual-panel layout.

## Sources

- Project context from `.planning/PROJECT.md` — defines core value proposition and constraints
- Implementation plan from `docs/plans/2026-03-08-web-ui-implementation.md` — detailed technical approach
- UX analysis from `.planning/PRODUCT_UX_ANALYSIS.md` — competitive positioning and user needs
- Design specification from `docs/plans/2026-03-08-web-ui-design.md` — UI layout and data flow

---

*Feature research for: Professor Plugin Local Web UI*
*Researched: 2026-03-08*
