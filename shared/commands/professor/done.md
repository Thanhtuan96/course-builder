---
name: professor:done
description: Mark the current section complete after demonstrating understanding (via Coach agent)
---

# Professor:done → Coach Gate

This command routes to the **Coach agent** for self-assessment before marking complete.

## Flow:

1. **Coach Gate (first):**
   - Read LEARNING-LOG.md for Reasoning Trail
   - Coach asks: "Looking back at this section — what was the hardest concept for you?"
   - Coach asks follow-up targeting weakest point
   - Coach decides:
     - **If solid:** "You demonstrate solid understanding. Say 'confirm' to complete."
     - **If shaky:** One more round, then Coach decides:
       - Mark done with ⚠️ watch-this flag, OR
       - Ask learner to try once more

2. **Professor completes (after Coach approval):**
   - User says "confirm" after Coach approval
   - Professor calculates and records duration
   - Professor updates COURSE.md (section status → ✅ Done)
   - Professor adds Progress Log entry
   - Professor clears "Active exercise" field
   - Professor creates/updates SCHEDULE.md with flashcards
   - Professor checks if all sections done → trigger Capstone Unlock if complete

## Watch-this Flag:

If Coach marks done with ⚠️ watch-this:
- Coach writes to LEARNING-LOG.md Reasoning Trail: "⚠️ watch-this: [concept]"
- Navigator reads this flag when building bridges in future sections
- Professor does NOT write watch-this flags (Coach owns that)
