#!/bin/sh
# check-vendor.sh — fail when a vendored copy differs from herdr-shared.
# The mods carry these files so a gallery install of one mod folder is self-contained, but
# herdr-shared/bin is the only place they are edited; tools/vendor.sh writes the copies.
set -u
cd "$(dirname "$0")/.."

SHARED=${HERDR_SHARED:-$HOME/git-repo/herdr-shared}
if [ ! -d "$SHARED" ]; then
  printf 'check-vendor: %s not checked out; skipping\n' "$SHARED"
  exit 0
fi

status=0
while read -r target source; do
  [ -n "$target" ] || continue
  from=$SHARED/$source
  if [ ! -f "$from" ]; then
    printf 'check-vendor: missing source %s\n' "$from" >&2
    status=1
    continue
  fi
  if [ ! -f "$target" ]; then
    printf 'check-vendor: missing vendored %s\n' "$target" >&2
    status=1
    continue
  fi
  if ! cmp -s "$from" "$target"; then
    printf 'check-vendor: %s differs from %s (re-run tools/vendor.sh)\n' "$target" "$from" >&2
    status=1
    continue
  fi
  if [ -x "$from" ] && [ ! -x "$target" ]; then
    printf 'check-vendor: %s lost its exec bit\n' "$target" >&2
    status=1
  elif [ ! -x "$from" ] && [ -x "$target" ]; then
    printf 'check-vendor: %s gained an exec bit\n' "$target" >&2
    status=1
  fi
done <<EOF
mods/inkpaw-shed/cca bin/cca
mods/inkpaw-shed/usage-tap.sh bin/usage-tap.sh
mods/inkpaw-shed/usage-api.mjs bin/usage-api.mjs
mods/inkpaw-shed/codex-usage.mjs bin/codex-usage.mjs
mods/inkpaw-shed/models.mjs bin/models.mjs
mods/inkpaw-journal/scan.sh bin/scan.sh
mods/inkpaw-editor/hv bin/hv
mods/inkpaw-editor/hv-open bin/hv-open
EOF

[ "$status" -eq 0 ] || exit 1
printf 'check-vendor: all vendored files match %s\n' "$SHARED"
