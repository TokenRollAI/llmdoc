#!/usr/bin/env bash
set -eu

project_dir="${CLAUDE_PROJECT_DIR:-$PWD}"
tmp_dir="$project_dir/.llmdoc-tmp/hooks"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"

mkdir -p "$tmp_dir"
cat > "$tmp_dir/stop-$timestamp.json"

cat <<'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "Stop",
    "additionalContext": "If this turn produced durable knowledge or useful reflections, consider asking whether to run /llmdoc:update."
  }
}
EOF
