#!/usr/bin/env bash
# Usage: notify.sh <worker-name> <status: DONE|BLOCKED> "<one-line summary>"
# Called by a worker as its last action: logs to status.log and types a report into the
# orchestrator's (Claude Code) terminal so it wakes up without polling.
W=/Users/tuankhuat/Documents/Pet-Projects/course-learning-plugin/.planning/workers
NAME="$1"; STATUS="$2"; SUMMARY="${3:-}"
SURFACE="${ORCH_SURFACE:-surface:126}"; WS="${ORCH_WORKSPACE:-workspace:9}"
echo "WORKER_$STATUS $NAME $(date +%H:%M:%S) $SUMMARY" >> "$W/status.log"
MSG="[worker-report] $NAME $STATUS — ${SUMMARY//$'\n'/ } (log: .planning/workers/status.log). Please review."
cmux send --workspace "$WS" --surface "$SURFACE" "$MSG" >/dev/null && sleep 0.3 && \
  cmux send-key --workspace "$WS" --surface "$SURFACE" enter >/dev/null
echo "notified orchestrator"
