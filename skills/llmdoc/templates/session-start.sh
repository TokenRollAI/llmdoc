#!/usr/bin/env bash
set -eu

session_mode="${1:-cold}"
project_dir="${CLAUDE_PROJECT_DIR:-$PWD}"

if command -v git >/dev/null 2>&1; then
  git_root="$(git -C "$project_dir" rev-parse --show-toplevel 2>/dev/null || true)"
  if [ -n "$git_root" ]; then
    project_dir="$git_root"
  fi
fi

if [ ! -d "$project_dir/llmdoc" ]; then
  if [ "$session_mode" = compact ]; then
    exit 0
  fi

  cat <<'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "No llmdoc directory was detected. Fall back to README files and source code. If durable documentation would help, consider /llmdoc:init."
  }
}
EOF
  exit 0
fi

list_startup_files() {
  [ -f "$project_dir/llmdoc/index.md" ] && printf '%s\n' "$project_dir/llmdoc/index.md"
  [ -f "$project_dir/llmdoc/startup.md" ] && printf '%s\n' "$project_dir/llmdoc/startup.md"
  if [ -d "$project_dir/llmdoc/must" ]; then
    find "$project_dir/llmdoc/must" -type f -print
  fi
}

file_digest() {
  file_path="$1"
  if command -v git >/dev/null 2>&1; then
    git hash-object "$file_path"
  else
    cksum < "$file_path" | awk '{ print $1 "-" $2 }'
  fi
}

startup_manifest() {
  list_startup_files \
    | LC_ALL=C sort \
    | while IFS= read -r file_path; do
        relative_path="${file_path#"$project_dir"/}"
        byte_count="$(wc -c < "$file_path" | tr -d '[:space:]')"
        printf '%s %s %s\n' "$(file_digest "$file_path")" "$byte_count" "$relative_path"
      done
}

manifest="$(startup_manifest)"
startup_bytes="$(printf '%s\n' "$manifest" | awk '{ total += $2 } END { print total + 0 }')"

if command -v git >/dev/null 2>&1; then
  startup_fingerprint="$(printf '%s' "$manifest" | git hash-object --stdin)"
else
  startup_fingerprint="cksum-$(printf '%s' "$manifest" | cksum | awk '{ print $1 "-" $2 }')"
fi

startup_budget="${LLMDOC_STARTUP_MAX_BYTES:-24576}"
case "$startup_budget" in
  ''|*[!0-9]*) startup_budget=24576 ;;
esac

if [ "$startup_bytes" -gt "$startup_budget" ]; then
  budget_note="The startup pack exceeds the recommended byte budget; load it for this cold start, then use /llmdoc:update to shrink MUST docs or add layered routing."
else
  budget_note="The startup pack is within the recommended byte budget."
fi

case "$session_mode" in
  compact)
    cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "LLMDOC_COMPACT_REENTRY v1. Current startup-pack-fingerprint=${startup_fingerprint}; startup-pack-bytes=${startup_bytes}. Continue the same task from the compacted summary. Do not reload the llmdoc skill, llmdoc/index.md, llmdoc/startup.md, MUST docs, lessons, or already-loaded task docs merely because compaction occurred. Re-read only when the summary is insufficient, the preserved fingerprint differs, a relevant file changed, a new subsystem is entered, or evidence conflicts. Prefer the smallest targeted read; a compact event alone never authorizes a full llmdoc reload. Preserve or refresh the compact LLMDOC_STATE block on the next compaction."
  }
}
EOF
    ;;
  resume)
    cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "LLMDOC_RESUME v1. Current startup-pack-fingerprint=${startup_fingerprint}; startup-pack-bytes=${startup_bytes}. If the resumed summary contains a usable LLMDOC_STATE with the same fingerprint, continue from it without reloading already-loaded docs. If the state is absent, stale, or insufficient, perform the cold-start read once: load the llmdoc skill, then llmdoc/index.md, llmdoc/startup.md, and its listed MUST docs. Read only task-relevant guides, reflections, and subsystem docs. ${budget_note}"
  }
}
EOF
    ;;
  *)
    cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "LLMDOC_COLD_START v1. startup-pack-fingerprint=${startup_fingerprint}; startup-pack-bytes=${startup_bytes}; recommended-max-bytes=${startup_budget}. Load the llmdoc skill once. Read llmdoc/index.md, then llmdoc/startup.md, then the MUST docs listed there. If llmdoc/memory/lessons-learned.md exists, read it as the archived memory summary. Read only task-relevant guides, reflections, and subsystem docs. Before non-trivial edits, align with the user. In future compaction summaries preserve a compact LLMDOC_STATE containing this fingerprint, active goal, loaded doc paths, invariants, decisions, changed files, validation status, next action, and unresolved risks; never copy full document bodies into that state. ${budget_note}"
  }
}
EOF
    ;;
esac
