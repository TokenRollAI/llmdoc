#!/usr/bin/env bash
set -eu

skill_root="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
plugin_root="$(CDPATH= cd -- "$skill_root/../.." && pwd)"
project_dir="${1:-$plugin_root}"
session_script="$skill_root/templates/session-start.sh"
template_hooks="$skill_root/templates/codex-hooks.json"
bundled_hooks="$plugin_root/hooks/hooks.json"

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

assert_contains() {
  value="$1"
  expected="$2"
  printf '%s' "$value" | grep -F "$expected" >/dev/null \
    || fail "expected output to contain: $expected"
}

assert_not_contains() {
  value="$1"
  unexpected="$2"
  if printf '%s' "$value" | grep -F "$unexpected" >/dev/null; then
    fail "expected output not to contain: $unexpected"
  fi
}

cold_output="$(CDPATH= cd -- "$project_dir" && "$session_script" cold)"
resume_output="$(CDPATH= cd -- "$project_dir" && "$session_script" resume)"
compact_output="$(CDPATH= cd -- "$project_dir" && "$session_script" compact)"

assert_contains "$cold_output" "LLMDOC_COLD_START v1"
assert_contains "$cold_output" "Load the llmdoc skill once"
assert_contains "$resume_output" "LLMDOC_RESUME v1"
assert_contains "$compact_output" "LLMDOC_COMPACT_REENTRY v1"
assert_contains "$compact_output" "Do not reload the llmdoc skill"
assert_not_contains "$compact_output" "Load the llmdoc skill once"

cold_fingerprint="$(printf '%s' "$cold_output" | sed -n 's/.*startup-pack-fingerprint=\([0-9a-z-]*\).*/\1/p')"
compact_fingerprint="$(printf '%s' "$compact_output" | sed -n 's/.*startup-pack-fingerprint=\([0-9a-z-]*\).*/\1/p')"

[ -n "$cold_fingerprint" ] || fail "cold-start fingerprint is missing"
[ "$cold_fingerprint" = "$compact_fingerprint" ] \
  || fail "cold-start and compact fingerprints differ"

assert_contains "$(<"$template_hooks")" '"matcher": "^(startup|clear)$"'
assert_contains "$(<"$template_hooks")" '"matcher": "^resume$"'
assert_contains "$(<"$template_hooks")" '"matcher": "^compact$"'
assert_contains "$(<"$bundled_hooks")" '"matcher": "^(startup|clear)$"'
assert_contains "$(<"$bundled_hooks")" '"matcher": "^resume$"'
assert_contains "$(<"$bundled_hooks")" '"matcher": "^compact$"'

if command -v jq >/dev/null 2>&1; then
  jq -e . "$template_hooks" >/dev/null
  jq -e . "$bundled_hooks" >/dev/null
fi

printf 'Lifecycle hook verification passed. fingerprint=%s\n' "$cold_fingerprint"
