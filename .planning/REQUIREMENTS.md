# Requirements: Course Learning Plugin

**Defined:** 2026-03-05
**Core Value:** The learner builds real understanding by doing — not by reading Claude's code.

## v1.0 Requirements

Requirements for milestone v1.0. Each maps to roadmap phases.

### Plugin Structure

- [x] **PLG-01**: Plugin has `plugin.json` with metadata, version, and registration for agents/commands/hooks
- [x] **PLG-02**: Plugin directory layout follows Claude Code conventions (`agents/`, `commands/`, `hooks/`)
- [x] **PLG-03**: README contains install instructions, Notion MCP config, and Obsidian MCP config

### Agents

- [x] **AGT-01**: Professor agent packages professor-skill-v3 as a Claude Code agent with correct frontmatter

### Commands

- [x] **CMD-01**: User can run `professor:new-topic` to start a new course on a topic
- [x] **CMD-02**: User can run `professor:next` to advance to the next section
- [x] **CMD-03**: User can run `professor:review` to review a completed section
- [x] **CMD-04**: User can run `professor:done` to mark a section complete
- [x] **CMD-05**: User can run `professor:hint` to receive a hint without the answer being revealed
- [x] **CMD-06**: User can run `professor:stuck` to receive additional guidance when genuinely stuck
- [x] **CMD-07**: User can run `professor:syllabus` to view the course outline
- [x] **CMD-08**: User can run `professor:progress` to view learning progress
- [x] **CMD-09**: User can run `professor:discuss` to open discussion on a concept
- [x] **CMD-10**: User can run `professor:quiz` to run a quiz on the current topic
- [x] **CMD-11**: User can run `professor:capstone` to start the capstone project
- [x] **CMD-12**: User can run `professor:capstone-review` to review capstone progress
- [ ] **CMD-13**: User can run `professor:note` to append a note to the current course's NOTES.md
- [x] **CMD-14**: User can run `professor:export` to choose exporting the course to Notion or Obsidian

### Hooks

- [x] **HOK-01**: PreCompact hook displays a token warning to the user before context is compressed
- [x] **HOK-02**: PreCompact hook auto-saves current session state (active section, progress) to COURSE.md before context reset

### Notes

- [ ] **NOT-01**: NOTES.md file is automatically created in `courses/{slug}/` when a new course starts

### Export

- [ ] **EXP-01**: `professor:export` sends lecture notes + user answers + NOTES.md to Notion via MCP
- [x] **EXP-02**: `professor:export` sends course content to Obsidian via Obsidian MCP server
- [x] **EXP-03**: User can choose export destination (Notion or Obsidian) when running `professor:export`

## Future Requirements

### Syllabus Creation

- **SYL-01**: Hybrid course creation — Claude proposes syllabus → user reviews/edits → confirms before start

### Export

- **EXP-04**: File-based Obsidian export (YAML frontmatter .md files) as fallback when Obsidian MCP unavailable

## Out of Scope

| Feature | Reason |
|---------|--------|
| Automated grading/scoring | Learning is qualitative, not point-based |
| Multi-user/collaborative learning | Single user per plugin instance (v1) |
| Video or audio content | Text-based Socratic learning only |
| AI-generated quizzes with auto-grading | Socratic review is the evaluation mechanism |
| File-based Obsidian export (primary) | Using Obsidian MCP instead — cleaner integration |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PLG-01 | Phase 1 | Complete |
| PLG-02 | Phase 1 | Complete |
| PLG-03 | Phase 1 | Complete |
| AGT-01 | Phase 2 | Complete |
| CMD-01 | Phase 2 | Complete |
| CMD-02 | Phase 2 | Complete |
| CMD-03 | Phase 2 | Complete |
| CMD-04 | Phase 2 | Complete |
| CMD-05 | Phase 2 | Complete |
| CMD-06 | Phase 2 | Complete |
| CMD-07 | Phase 2 | Complete |
| CMD-08 | Phase 2 | Complete |
| CMD-09 | Phase 2 | Complete |
| CMD-10 | Phase 2 | Complete |
| CMD-11 | Phase 2 | Complete |
| CMD-12 | Phase 2 | Complete |
| CMD-13 | Phase 3 | Pending |
| NOT-01 | Phase 3 | Pending |
| HOK-01 | Phase 4 | Complete |
| HOK-02 | Phase 4 | Complete |
| CMD-14 | Phase 5 | Complete |
| EXP-01 | Phase 5 | Pending |
| EXP-02 | Phase 5 | Complete |
| EXP-03 | Phase 5 | Complete |

**Coverage:**
- v1.0 requirements: 24 total
- Mapped to phases: 24
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-05*
*Last updated: 2026-03-05 after roadmap creation — traceability complete*
