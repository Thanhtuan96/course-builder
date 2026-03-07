#!/bin/bash
# Sync root files to shared/ directory
# Run this after modifying agents/, commands/, or hooks/

set -e

echo "Syncing root → shared/ ..."

# Sync commands
cp commands/professor/*.md shared/commands/professor/
echo "✓ commands/professor/ synced"

# Sync agent
cp agents/professor.md shared/agents/professor.md
echo "✓ agents/professor.md synced"

# Sync hooks
cp hooks/pre-compact.js shared/hooks/pre-compact.js
echo "✓ hooks/pre-compact.js synced"

echo ""
echo "Sync complete!"

# Verify
echo ""
echo "Verification:"
echo "  commands: $(ls commands/professor/*.md | wc -l | tr -d ' ') files"
echo "  agent: $(wc -l < agents/professor.md) lines"
echo "  hooks: $(wc -l < hooks/pre-compact.js) lines"
