#!/usr/bin/env bash
# Usage: dispatch.sh <worker-name> <brief-path> [worktree-branch]
# Opens an OpenCode TUI worker on a task brief so the user can watch it live in a cmux pane.
# With a branch arg, the worker runs in its own git worktree at .worktrees/<worker-name>
# (branched from feat/studio-local-first) so several workers can implement in parallel.
set -u
NAME="$1"; BRIEF="$2"; BRANCH="${3:-}"
REPO=/Users/tuankhuat/Documents/Pet-Projects/course-learning-plugin
W="$REPO/.planning/workers"
MODEL="${WORKER_MODEL:-opencode-go/deepseek-v4.1-flash}"
DIR="$REPO"
if [ -n "$BRANCH" ]; then
  DIR="$REPO/.worktrees/$NAME"
  if [ ! -d "$DIR" ]; then
    git -C "$REPO" worktree add -b "$BRANCH" "$DIR" feat/studio-local-first || exit 1
  fi
  [ ! -d "$DIR/node_modules" ] && (cd "$DIR" && npm install --silent)
  [ -f "$DIR/studio/package.json" ] && [ ! -d "$DIR/studio/node_modules" ] && (cd "$DIR/studio" && npm install --silent)
fi
echo "WORKER_START $NAME $(date +%H:%M:%S) model=$MODEL dir=$DIR" >> "$W/status.log"
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
opencode "$DIR" -m "$MODEL" --prompt "You are worker '$NAME'. Read the task brief at $BRIEF and execute it completely and autonomously; do not stop to ask questions — make reasonable decisions and note them. Your working directory is $DIR. When fully finished, as your LAST action run: $W/notify.sh $NAME DONE \"<one-line summary of what you produced>\" . If you cannot complete the task, run: $W/notify.sh $NAME BLOCKED \"<reason>\" ."
