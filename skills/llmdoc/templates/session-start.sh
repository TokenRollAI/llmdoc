#!/usr/bin/env bash
set -eu

project_dir="${CLAUDE_PROJECT_DIR:-$PWD}"

if [ -d "$project_dir/llmdoc" ]; then
  cat <<'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "This project has llmdoc enabled. Load the llmdoc skill. Read llmdoc/index.md, then llmdoc/startup.md, then the MUST docs listed there. Before non-trivial edits, proactively read relevant guides and reflections and align with the user on approach."
  }
}
EOF
else
  cat <<'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "No llmdoc directory was detected. Fall back to README files and source code. If durable documentation would help, consider /llmdoc:init."
  }
}
EOF
fi
