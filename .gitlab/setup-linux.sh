#!/usr/bin/env bash
set -euo pipefail

test "$(node --version)" = v24.15.0
apt-get update
apt-get install -y --no-install-recommends unzip python3-setuptools
version=$(node -p 'require("./package.json").packageManager.split("@")[1]')
tools=$(mktemp -d)
curl --fail --location --retry 3 "https://github.com/oven-sh/bun/releases/download/bun-v${version}/bun-linux-x64-baseline.zip" -o "$tools/bun.zip"
unzip -q "$tools/bun.zip" -d "$tools"
export PATH="$tools/bun-linux-x64-baseline:$PATH"
test "$(bun --version)" = "$version"
node --version
bun --version
bun install
