#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 QuakeC Studio contributors
#
# Parses every .qc file of id's QuakeC 1.01, from id-Software/Quake-Tools at the commit the
# vanilla language spec is written from, and fails if any parse has an ERROR or MISSING node.
#
# The files are fetched, never committed: test/id-1.01.sha256 pins each one, and a file that
# does not match is refused. QuakeC 1.06 has no license and is never fetched.
#
# Usage: TREE_SITTER=<cli> scripts/parse-corpus.sh   (default: tree-sitter on PATH)
set -euo pipefail

commit=c0d1b91c74eb654365ac7755bc837e497caaca73
root=$(cd "$(dirname "$0")/.." && pwd)
sums="$root/test/id-1.01.sha256"
tree_sitter=${TREE_SITTER:-tree-sitter}
cache="${XDG_CACHE_HOME:-$HOME/.cache}/tree-sitter-quakec/quake-tools-$commit"

verify() {
  (cd "$cache" && shasum -a 256 -c --quiet "$sums")
}

if ! verify 2>/dev/null; then
  mkdir -p "$cache"
  curl -fsSL "https://codeload.github.com/id-Software/Quake-Tools/tar.gz/$commit" |
    tar -xz -C "$cache" --strip-components=1 \
      "Quake-Tools-$commit/qcc/COPYING" "Quake-Tools-$commit/qcc/v101qc"
  verify
fi

files=()
while read -r _ path; do
  case "$path" in
  *.qc) files+=("$cache/$path") ;;
  esac
done <"$sums"

# Every .qc file in the directory is pinned, so none is skipped.
on_disk=$(find "$cache/qcc/v101qc" -name '*.qc' | wc -l | tr -d ' ')
if [ "$on_disk" != "${#files[@]}" ]; then
  echo "qcc/v101qc has $on_disk .qc files but $sums pins ${#files[@]}" >&2
  exit 1
fi

"$tree_sitter" parse --quiet --stat --grammar-path "$root" "${files[@]}"
