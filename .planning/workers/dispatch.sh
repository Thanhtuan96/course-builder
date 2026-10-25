#!/usr/bin/env bash
# Usage: dispatch.sh <ISSUE-ID> <branch> <change-name> [split-from-surface]
#   e.g. dispatch.sh RON-168 feature/ron-168-v30-p12-full-loop-e2e-ci-completion-and-uat ron-168-full-loop-e2e
#
# Starts one OpenCode worker for one Linear issue, following the dev-orchestrator spec-driven cycle
# (~/.claude/skills/dev-orchestrator/references/openspec-cycle.md):
#   1. a git worktree <repo>-wt-<number> on <branch> from fresh origin/develop (use the issue's
#      Linear gitBranchName so commits and the PR link to the ticket);
#   2. a split-down cmux pane running opencode in that worktree;
#   3. the Stage 1 kickoff `/opsx-propose <change-name>`, reading the brief from the Linear issue
#      description through the Linear MCP.
# The worker stops after propose (CP1) and after apply + verify (CP2); the coordinator types the
# next /opsx-* command into the pane and reviews in between. The worker never merges.
#
# Before running: the issue description must hold the brief (templates/brief-openspec.md), the
# config .claude/dev-orchestrator.env must exist (scripts/init.sh), and develop must be pushed.
set -euo pipefail

ID="${1:?issue id, e.g. RON-168}"
BRANCH="${2:?branch (the issue gitBranchName)}"
CHANGE="${3:?OpenSpec change name, e.g. ron-168-full-loop-e2e}"
SKILL="${DEV_ORCH_DIR:-$HOME/.claude/skills/dev-orchestrator}"
REPO=/Users/tuankhuat/Documents/Pet-Projects/course-learning-plugin
W="$REPO/.planning/workers"

[ -x "$SKILL/scripts/dispatch.sh" ] || { echo "dev-orchestrator skill not found at $SKILL" >&2; exit 1; }
# shellcheck disable=SC1091
source "$REPO/.claude/dev-orchestrator.env"
[ -f "$REPO/.claude/dev-orchestrator.local.env" ] && source "$REPO/.claude/dev-orchestrator.local.env"
FROM="${4:-$REPORT_SURFACE}"

NUM="$(printf '%s' "$ID" | grep -oE '[0-9]+$')"
WT="$(cd "$REPO" && bash "$SKILL/scripts/new-worktree.sh" main "$BRANCH" "$NUM")"

KICKOFF="/opsx-propose $CHANGE (full input = the description of Linear issue $ID, read it first with the Linear MCP get_issue; use change name $CHANGE; after propose STOP and report via cmux)"
SURFACE="$(cd "$REPO" && bash "$SKILL/scripts/dispatch.sh" "$FROM" "$WT" "$ID" "$ID" "$KICKOFF")"

mkdir -p "$W"
echo "WORKER_START $ID $(date +%H:%M:%S) surface=$SURFACE branch=$BRANCH change=$CHANGE dir=$WT" >> "$W/status.log"
echo "$SURFACE"
