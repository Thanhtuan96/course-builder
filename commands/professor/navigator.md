---
name: professor:navigator
description: View section bridges and concept thread, or generate new bridges between completed sections
---

# Professor:navigator — Navigator Command

This command provides manual access to the Navigator agent for viewing and generating section bridges.

## Behavior

### Invoking Navigator Directly

Learners can invoke Navigator anytime via `professor:navigator` to:

1. **Review all bridges** in their Concept Thread
2. **Generate a new bridge** between any two completed sections
3. **See how insights** from Coach thread forward

---

## Flow

### Step 1: Read LEARNING-LOG.md

Navigator reads the LEARNING-LOG.md file to access the Concept Thread section.

### Step 2: Display Concept Thread

If Concept Thread is empty:
> "No bridges yet — bridges appear after you complete sections with `professor:done` or advance with `professor:next`."

If Concept Thread has entries:
- Display all bridges chronologically
- Show the connection each bridge makes between sections

### Step 3: Offer New Bridge Generation

After displaying existing bridges, ask:
> "Would you like to generate a new bridge between two sections?"

If yes, ask which sections to connect.

### Step 4: Display Format

Ask learner which format to display the bridge:
- **text-summary** — Narrative explanation of the connection
- **concept-map** — Visual map with arrows showing relationships
- **socratic** — Questions that help learner discover connections

Or use the stored `preferred_format` from LEARNING-LOG.md if set.

---

## End Message

> "That's your concept thread so far. Run `professor:done` or `professor:next` to build more bridges as you progress through the course."

---

## Integration

- **Manual invocation:** `professor:navigator` command
- **Automatic triggers:** professor:done (brief bridge), professor:next (fuller bridge)
- **Data store:** LEARNING-LOG.md Concept Thread section

See also: [Navigator agent](../agents/navigator.md)
