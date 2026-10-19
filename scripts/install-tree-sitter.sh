#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 QuakeC Studio contributors
#
# Downloads the pinned tree-sitter CLI into .tools/, checks its SHA-256 and prints its path:
#   TREE_SITTER=$(scripts/install-tree-sitter.sh)
# The checksums are the release's own asset digests.
set -euo pipefail

version=0.27.1
root=$(cd "$(dirname "$0")/.." && pwd)

case "$(uname -s)-$(uname -m)" in
Linux-x86_64)
  asset=tree-sitter-linux-x64.gz
  sha256=d01042f94ba3d6827ddc9788e235f75d8366431be42bdf90ade534d960c98b7d
  ;;
Linux-aarch64)
  asset=tree-sitter-linux-arm64.gz
  sha256=404be5d54a4955571c4067c21d4699660eab3a534cefb0659341b207f7139ec5
  ;;
Darwin-arm64)
  asset=tree-sitter-macos-arm64.gz
  sha256=46cb97d9a2c52c94e22d9a76c2f1116156b8b61f98360e2a9cce05fcb197cd4d
  ;;
Darwin-x86_64)
  asset=tree-sitter-macos-x64.gz
  sha256=b740262cb0f35be64e39b50ad68b020433924a7bcee5ae5c8e40e68d71215647
  ;;
*)
  echo "no pinned tree-sitter CLI for $(uname -s)-$(uname -m)" >&2
  exit 1
  ;;
esac

dest="$root/.tools/tree-sitter-$version"
if [ ! -x "$dest" ]; then
  mkdir -p "$root/.tools"
  curl -fsSL -o "$dest.gz" \
    "https://github.com/tree-sitter/tree-sitter/releases/download/v$version/$asset"
  echo "$sha256  $dest.gz" | shasum -a 256 -c --quiet
  gunzip -f "$dest.gz"
  chmod +x "$dest"
fi
echo "$dest"
