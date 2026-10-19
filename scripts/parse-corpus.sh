#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 QuakeC Studio contributors
#
# Parses every .qc and .qh file of the codebases in test/corpora/codebases.tsv: id's QuakeC
# 1.01, the six Quake rerelease codebases, and the FTEQCC corpus mods. A strict codebase fails
# on any ERROR or MISSING node; another may list a file in test/corpora/not-covered.tsv, and
# the check fails if a listed file parses cleanly or an unlisted one does not, or if README.md
# does not list it.
#
# The sources are fetched at the commits in test/corpora/sources.tsv into
# ~/.cache/tree-sitter-quakec/ (or $XDG_CACHE_HOME), never committed: test/corpora/<id>.sha256
# pins every file read, and a source whose files do not match is refused. QuakeC 1.06 has no
# license and is never fetched.
#
# Usage: TREE_SITTER=<cli> scripts/parse-corpus.sh   (default: tree-sitter on PATH)
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
corpora="$root/test/corpora"
tree_sitter=${TREE_SITTER:-tree-sitter}
cache_root="${XDG_CACHE_HOME:-$HOME/.cache}/tree-sitter-quakec"

work=$(mktemp -d)
trap 'rm -f "$work"/*; rmdir "$work"' EXIT

rows() { grep -v -e '^#' -e '^$' "$1"; }

source_dir() { # <source id>
  rows "$corpora/sources.tsv" | awk -F '\t' -v id="$1" -v c="$cache_root" \
    '$1 == id { print c "/" $1 "-" $3 }'
}

verify() { # <source id>
  (cd "$(source_dir "$1")" && shasum -a 256 -c --quiet "$corpora/$1.sha256")
}

while IFS=$'\t' read -r id repo commit members; do
  if ! verify "$id" >/dev/null 2>&1; then
    dir=$(source_dir "$id")
    mkdir -p "$dir"
    prefix="${repo#*/}-$commit"
    paths=()
    for member in $members; do
      if [ "$member" = . ]; then paths+=("$prefix"); else paths+=("$prefix/$member"); fi
    done
    curl -fsSL "https://codeload.github.com/$repo/tar.gz/$commit" |
      tar -xz -C "$dir" --strip-components=1 "${paths[@]}"
    verify "$id"
  fi
done < <(rows "$corpora/sources.tsv")

rows "$corpora/not-covered.tsv" | cut -f 1,2 >"$work/listed"
: >"$work/listed-seen"

status=0
# The README's "Not covered" table is the list readers see, so it names every listed file.
while IFS=$'\t' read -r _ path; do
  if ! grep -qF "\`$path\`" "$root/README.md"; then
    echo "README.md does not list $path, which test/corpora/not-covered.tsv does" >&2
    status=1
  fi
done <"$work/listed"

while IFS=$'\t' read -r codebase id directory strict; do
  dir=$(source_dir "$id")
  (cd "$dir" && find "$directory" -type f \( -iname '*.qc' -o -iname '*.qh' \)) |
    sed 's|^\./||' | LC_ALL=C sort >"$work/files"
  awk '{ print $2 }' "$corpora/$id.sha256" >"$work/pinned"

  # Every file parsed is pinned, so none can change unseen.
  while IFS= read -r path; do
    if ! grep -qxF "$path" "$work/pinned"; then
      echo "$codebase: $path is not pinned in test/corpora/$id.sha256" >&2
      status=1
    fi
  done <"$work/files"

  files=()
  while IFS= read -r path; do files+=("$path"); done <"$work/files"
  (cd "$dir" && "$tree_sitter" parse --quiet --stat --grammar-path "$root" "${files[@]}") \
    >"$work/output" 2>&1 || true
  grep -E '\((ERROR|MISSING)' "$work/output" | awk '{ print $1 }' >"$work/failed" || true

  listed=0
  while IFS= read -r path; do
    if [ "$strict" != yes ] && grep -qxF "$id"$'\t'"$path" "$work/listed"; then
      listed=$((listed + 1))
    else
      echo "$codebase: $path has an ERROR or MISSING node" >&2
      status=1
    fi
  done <"$work/failed"

  while IFS=$'\t' read -r listed_id path; do
    if [ "$listed_id" != "$id" ] || ! grep -qxF "$path" "$work/files"; then
      continue
    fi
    echo "$id"$'\t'"$path" >>"$work/listed-seen"
    if [ "$strict" = yes ]; then
      echo "$codebase: $path is listed as not covered, but $codebase is strict" >&2
      status=1
    elif ! grep -qxF "$path" "$work/failed"; then
      echo "$codebase: $path parses cleanly; remove it from test/corpora/not-covered.tsv" >&2
      status=1
    fi
  done <"$work/listed"

  total=${#files[@]}
  failed=$(wc -l <"$work/failed" | tr -d ' ')
  echo "$codebase: $((total - failed)) of $total files parse cleanly, $listed listed as not covered"
done < <(rows "$corpora/codebases.tsv")

if [ "$(sort -u "$work/listed-seen" | wc -l)" -ne "$(wc -l <"$work/listed")" ]; then
  echo "test/corpora/not-covered.tsv lists a file no codebase parses" >&2
  status=1
fi
exit "$status"
