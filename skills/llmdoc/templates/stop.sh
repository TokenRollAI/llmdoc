#!/usr/bin/env bash
set -eu

project_dir="${CLAUDE_PROJECT_DIR:-$PWD}"

if command -v git >/dev/null 2>&1; then
  git_root="$(git -C "$project_dir" rev-parse --show-toplevel 2>/dev/null || true)"
  if [ -n "$git_root" ]; then
    project_dir="$git_root"
  fi
fi

tmp_dir="$project_dir/.llmdoc-tmp/hooks"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"

mkdir -p "$tmp_dir"
cat > "$tmp_dir/stop-$timestamp.json"

active_memory_count=0
if [ -d "$project_dir/llmdoc/memory" ]; then
  active_memory_count="$(
    find "$project_dir/llmdoc/memory" -type f \
      ! -path "$project_dir/llmdoc/memory/archive/*" \
      ! -name "lessons-learned.md" \
      ! -name "doc-gaps.md" \
      | wc -l \
      | tr -d '[:space:]'
  )"
fi

if [ "$active_memory_count" -gt 5 ]; then
  cat <<EOF
{
  "systemMessage": "Best-effort reminder: llmdoc active memory currently has ${active_memory_count} files, which exceeds the archive threshold of 5. The precise checkpoint is /llmdoc:update after any new reflection is written; then summarize recurring lessons into llmdoc/memory/lessons-learned.md and archive summarized raw memory per skills/llmdoc/references/lessons-learned.md."
}
EOF
else
  cat <<'EOF'
{
  "systemMessage": "If this turn produced durable knowledge or useful reflections, consider asking whether to run /llmdoc:update."
}
EOF
fi
