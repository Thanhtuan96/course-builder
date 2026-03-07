---
name: professor:hint
description: "Get the next hint layer without revealing the answer"
---

Give the next hint layer for the current exercise.

Infer the correct layer from the conversation history — count how many times `professor:hint` has been called this session for the current section. The layer logic and definitions are in the agent body (agents/professor.md).

Do not skip layers. Start from Layer 1 unless the user has already received it this session.

If the user asks for a 4th hint, do not provide one. Suggest `professor:stuck` instead.

$ARGUMENTS
