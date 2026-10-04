#!/usr/bin/env bash
set -euo pipefail

nix --version
nix flake metadata
nix flake show --all-systems
for system in x86_64-linux aarch64-linux x86_64-darwin aarch64-darwin; do
  for target in "packages.$system.opencode" "devShells.$system.default"; do
    printf 'Evaluating %s\n' "$target"
    nix eval ".#$target.drvPath" --raw
  done
  # Existing nix-eval.yml exception: desktop is diagnostic until upstream #11755 is fixed.
  if output=$(nix eval ".#packages.$system.desktop.drvPath" --raw 2>&1); then
    printf '%s\n' "$output"
  else
    printf 'WARNING: packages.%s.desktop evaluation failed (existing #11755 exception)\n%s\n' "$system" "$output" >&2
  fi
done
