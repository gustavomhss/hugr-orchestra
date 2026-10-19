#!/bin/sh
# Builds one released musl CLI payload and archive inside the pinned rust:1-alpine guest that
# distribution-bundle qualifies (apps/cli/test/distribution-musl.test.ts): pinned musl Bun,
# omni built in the guest, musl tree-sitter parsers, then build.ts and release.ts payload.
# Usage (as root in the guest): musl-release.sh <x86_64|aarch64> <version> <source repo> <out dir> <models.json>
set -eu
fail() { printf '%s\n' "$1" >&2; exit 1; }
[ -f /.dockerenv ] && [ "$(id -u)" = 0 ] || fail MUSL_RELEASE_DOCKER_GUEST_REQUIRED
[ "$#" = 5 ] || fail MUSL_RELEASE_ARGUMENTS_REQUIRED
[ "$(uname -m)" = "$1" ] || fail MUSL_RELEASE_NATIVE_CPU_MISMATCH
. /etc/os-release
[ "$ID" = alpine ] || fail MUSL_RELEASE_ALPINE_REQUIRED
case "$1" in
  x86_64) bun_asset=bun-linux-x64-musl-baseline; bun_sha=56a7d6806cf155536c0178f0ea5fbd098e684fa509ebdb4fc0a7e19fb65382dc; target=linux-x64-baseline-musl ;;
  aarch64) bun_asset=bun-linux-aarch64-musl; bun_sha=b98e0ad3625c5c00d1d5b5ff55605c7adddbfae151861e68ade57b2d3b8703bb; target=linux-arm64-musl ;;
  *) fail MUSL_RELEASE_UNSUPPORTED_CPU ;;
esac
version=$2 source=$3 out=$4 models=$5
apk add --no-cache build-base python3 nodejs npm openssl curl tar git binutils unzip coreutils bash
mkdir -p /build/tools /build/home /build/tmp
# Same SHA-256 pins as the qualified guest (bun-v1.3.14/SHASUMS256.txt).
curl --disable --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
  --output /build/tools/bun.zip "https://github.com/oven-sh/bun/releases/download/bun-v1.3.14/$bun_asset.zip"
printf '%s  %s\n' "$bun_sha" /build/tools/bun.zip | sha256sum --check --strict
unzip -q /build/tools/bun.zip -d /build/tools
mv "/build/tools/$bun_asset/bun" /build/tools/bun
chmod 755 /build/tools/bun
export HOME=/build/home TMPDIR=/build/tmp CARGO_HOME=/build/cargo
export PATH=/build/tools:/usr/local/cargo/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
# A clean clone of the checked-out commit keeps host node_modules and build output out of the guest.
git config --global --add safe.directory "$source"
git clone --no-hardlinks --quiet "$source" /build/source
head=$(git -C "$source" rev-parse HEAD)
git -C /build/source checkout --quiet --detach "$head"
cd /build/source
bun install --frozen-lockfile --ignore-scripts
bun --eval 'import { linuxRuntimeLibc } from "./packages/script/src/tree-sitter-prebuilds.ts"; if (linuxRuntimeLibc().kind !== "musl" || process.versions.bun !== "1.3.14") throw new Error("MUSL_RELEASE_BUN_ABI_MISMATCH")'
(cd native/omni && HUGR_BUILD_EXISTING_MUSL_GUEST=1 HUGR_PROOF_HEAD="$head" node scripts/build-artifacts.mjs "linux-$(node -p process.arch)-musl" --out /build/omni-artifacts)
bun --eval 'import { exportTreeSitter, requireTreeSitterBundle } from "./packages/script/src/tree-sitter-prebuilds.ts"; const parsers = exportTreeSitter({ root: "/build/source", os: "linux", arch: process.arch, abi: "musl", out: "/build/parser-artifacts" }); requireTreeSitterBundle(parsers.exported, { os: "linux", arch: process.arch, abi: "musl" })'
cd apps/cli
ORCHESTRA_VERSION="$version" ORCHESTRA_CHANNEL=latest MODELS_DEV_API_JSON="$models" \
  OMNI_ARTIFACTS=/build/omni-artifacts TREE_SITTER_ARTIFACTS=/build/parser-artifacts \
  bun script/build.ts --single --skip-install --target "$target"
reported=$("dist/cli-$target/bin/orchestra" --version)
[ "$reported" = "$version" ] || fail "MUSL_RELEASE_BUILT_VERSION_MISMATCH: $reported"
bun script/release.ts payload --version "$version" --target "$target" --out "$out"
