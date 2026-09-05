#!/usr/bin/env bash
set -euo pipefail

SKIP_PATTERN='^game client routes migrated cards through the command engine$'
GROUPS=(
  '[0-9a-dA-D]'
  '[e-hE-H]'
  '[i-lI-L]'
  '[m-pM-P]'
  '[q-tQ-T]'
  '[u-zU-Z]'
)

for group in "${GROUPS[@]}"; do
  files=(tests/${group}*.test.mjs)
  if (( ${#files[@]} == 0 )); then
    continue
  fi
  node --test --test-skip-pattern="$SKIP_PATTERN" "${files[@]}"
done
