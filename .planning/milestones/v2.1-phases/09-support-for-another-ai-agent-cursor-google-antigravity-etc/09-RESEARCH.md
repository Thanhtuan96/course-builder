# Phase 9: Support for Another AI Agent - Research

**Researched:** 2026-03-08 (simplified)
**Domain:** CLI + templates pattern
**Confidence:** HIGH

## Summary

Use existing templates/ pattern and CLI system. Just add cursor to both.

---

## Existing Pattern

### templates/ structure
```
templates/
├── claude/
│   ├── plugin.json
│   └── settings.json
├── opencode/
├── gemini/
├── agent/
└── cursor/ (new)
```

### CLI (bin/cli.js)
```javascript
const SUPPORTED_AGENTS = ['claude', 'opencode', 'gemini', 'agent'];
```

### What CLI does on setup:
1. Create .{$agent}/ directory
2. Copy templates/{$agent}/* to .{$agent}/
3. Copy shared/* to .{$agent}/
4. Copy root plugin.json to .{$agent}/

---

## Implementation

1. Create templates/cursor/settings.json
2. Add 'cursor' to SUPPORTED_AGENTS
3. Update README

---

## Phase Requirements

| ID | Description |
|----|-------------|
| AGENT-01 | CLI supports cursor: npx course-professor setup cursor |

---

**Research date:** 2026-03-08
