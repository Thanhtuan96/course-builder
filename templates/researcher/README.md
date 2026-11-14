# Researcher Agent Template

This template configures the Researcher agent for the Course Professor plugin. The researcher agent is responsible for gathering information and researching topics to support the learning experience.

## Purpose

The Researcher agent assists the Professor agent by:
- Researching topics on the web
- Finding relevant resources and information
- Gathering context for course content
- Reading and analyzing existing materials

The Professor agent handles the Socratic teaching methodology (asking questions), while the Researcher focuses on information gathering.

## Tools Available

The Researcher agent has the following permissions:

| Tool | Purpose |
|------|---------|
| WebFetch | Fetch content from URLs for research |
| Read | Read existing files in the project |
| Grep | Search for specific content in files |
| Glob | Find files by pattern matching |
| Bash(ls, mkdir, cd, pwd) | Navigate and explore the filesystem |

## Permissions

**Allowed:**
- Read files and directories
- Search file contents
- Fetch web content
- Basic file system navigation

**Denied:**
- Write operations (modifying files)
- Destructive bash commands (rm -rf *)

The Researcher should NOT modify files directly. It provides research findings to the Professor agent, which handles all user-facing interactions and file modifications.

## Setup

The researcher template is automatically used when running:

```bash
npx ronin-skillforce setup researcher
```

This creates a `.researcher/` directory with the necessary configuration.

## Integration with Professor

The Researcher agent works in conjunction with the Professor agent:

1. Professor identifies a knowledge gap or needs more context
2. Professor delegates research task to Researcher
3. Researcher gathers information using allowed tools
4. Researcher reports findings back to Professor
5. Professor uses findings to guide the Socratic conversation

This separation allows each agent to focus on its core competency - Professor on teaching, Researcher on research.
