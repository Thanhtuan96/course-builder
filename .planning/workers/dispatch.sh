#!/usr/bin/env bash
# Usage: dispatch.sh <phase-number> [branch-slug]
# Opens an OpenCode TUI worker in its own git worktree (.worktrees/phase-NN, branch gsd/phase-NN-<slug>)
# branched from develop. The worker runs the full GSD cycle for that phase via
# /gsd-autonomous --only N --interactive (discuss -> plan -> execute -> verify), pausing in the TUI
# for the human's decisions, and reports back to the orchestrator pane with notify.sh.
# Run it inside a new cmux pane, e.g.:
#   cmux new-split right --command ".planning/workers/dispatch.sh 1 seams"
set -u
PHASE="$1"; SLUG="${2:-work}"
REPO=/Users/tuankhuat/Documents/Pet-Projects/course-learning-plugin
W="$REPO/.planning/workers"
NN=$(printf '%02d' "$PHASE")
NAME="phase-$NN"
BRANCH="gsd/phase-$NN-$SLUG"
DIR="$REPO/.worktrees/$NAME"
MODEL="${WORKER_MODEL:-opencode-go/deepseek-v4.1-flash}"

if [ ! -d "$DIR" ]; then
  git -C "$REPO" worktree add -b "$BRANCH" "$DIR" develop || exit 1
fi
[ ! -d "$DIR/node_modules" ] && (cd "$DIR" && npm install --silent)
[ -f "$DIR/studio/package.json" ] && [ ! -d "$DIR/studio/node_modules" ] && (cd "$DIR/studio" && npm install --silent)

mkdir -p "$W/logs"
echo "WORKER_START $NAME $(date +%H:%M:%S) model=$MODEL branch=$BRANCH dir=$DIR" >> "$W/status.log"
export OPENCODE_CONFIG_CONTENT='{"permission":{"edit":"allow","bash":"allow","webfetch":"allow","external_directory":"allow"}}'
cd "$DIR"

# OpenCode TUI's --prompt only pre-fills the input box; submit it once the TUI is ready.
if [ -n "${CMUX_SURFACE_ID:-}" ]; then
  (
    for _ in $(seq 1 45); do
      sleep 2
      SCREEN=$(cmux read-screen --workspace "${CMUX_WORKSPACE_ID:-}" --surface "$CMUX_SURFACE_ID" 2>/dev/null)
      echo "$SCREEN" | grep -q "interrupt" && exit 0
      if echo "$SCREEN" | grep -q "You are worker"; then
        cmux send-key --workspace "${CMUX_WORKSPACE_ID:-}" --surface "$CMUX_SURFACE_ID" enter >/dev/null 2>&1
        exit 0
      fi
    done
  ) &
fi

PROMPT="You are worker '$NAME' for GSD Phase $PHASE of this repo. Your git worktree is $DIR (branch $BRANCH, from develop); work only there. Run the full GSD cycle for Phase $PHASE by executing the GSD command /gsd-autonomous with arguments '--only $PHASE --interactive' — read ~/.config/opencode/commands/gsd-autonomous.md and follow its workflow exactly (discuss -> plan -> execute -> verify; verifier is enabled). Ask the human in this TUI whenever the workflow needs a decision. Rules from .planning/ROADMAP.md 'Execution Rules': edit only files listed under Phase $PHASE 'Owns' (plus its 'Touch points'); never add a migration other than the one your phase owns; commit atomically on your branch; do NOT merge into develop and do NOT push. When the phase is executed and verified, as your LAST action run: $W/notify.sh $NAME DONE \"<one-line summary incl. verification result>\" . If blocked, run: $W/notify.sh $NAME BLOCKED \"<reason>\" ."

opencode "$DIR" -m "$MODEL" --prompt "$PROMPT"
