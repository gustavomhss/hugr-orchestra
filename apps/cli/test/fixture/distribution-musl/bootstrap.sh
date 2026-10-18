#!/bin/sh
set -eu
fail() { printf '%s\n' "$1" >&2; exit 1; }
[ -f /.dockerenv ] && [ "$(id -u)" = 0 ] || fail MUSL_OWNED_DOCKER_GUEST_REQUIRED
[ "$#" = 4 ] || fail MUSL_BOOTSTRAP_ARGUMENTS_REQUIRED
[ "$(uname -m)" = "$1" ] || fail MUSL_GUEST_NATIVE_CPU_MISMATCH
. /etc/os-release
[ "$ID" = alpine ] || fail MUSL_ALPINE_DISTRO_REQUIRED
mkdir -p /proof/evidence /proof/home /proof/tmp /proof/apk-cache /proof/cargo /proof/bun-cache /proof/tools
# Bootstrap output survives failures, including dependency installation/build.
exec > /proof/evidence/bootstrap.log 2>&1
apk --cache-dir /proof/apk-cache add --no-cache build-base python3 nodejs npm openssl curl tar git binutils unzip coreutils bash
case "$1" in
  x86_64) bun_asset=bun-linux-x64-musl-baseline; bun_sha=56a7d6806cf155536c0178f0ea5fbd098e684fa509ebdb4fc0a7e19fb65382dc ;;
  aarch64) bun_asset=bun-linux-aarch64-musl; bun_sha=b98e0ad3625c5c00d1d5b5ff55605c7adddbfae151861e68ade57b2d3b8703bb ;;
  *) fail MUSL_UNSUPPORTED_GUEST_CPU ;;
esac
# SHA-256 pins from upstream bun-v1.3.14/SHASUMS256.txt, 2026-10-14.
curl --disable --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
  --output /proof/tools/bun.zip "https://github.com/oven-sh/bun/releases/download/bun-v1.3.14/$bun_asset.zip"
printf '%s  %s\n' "$bun_sha" /proof/tools/bun.zip | sha256sum --check --strict
unzip -q /proof/tools/bun.zip -d /proof/tools
mv "/proof/tools/$bun_asset/bun" /proof/tools/bun
chmod 755 /proof/tools/bun
printf '%s  %s\n' "$4" /proof/source.bundle | sha256sum --check --strict
export HOME=/proof/home TMPDIR=/proof/tmp CARGO_HOME=/proof/cargo RUSTUP_HOME=/proof/rustup BUN_INSTALL_CACHE_DIR=/proof/bun-cache
export PATH=/proof/tools:/usr/local/cargo/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
cp -a /usr/local/rustup /proof/rustup
git clone --no-hardlinks /proof/source.bundle /proof/source
git -C /proof/source checkout --detach "$2"
[ "$(git -C /proof/source rev-parse HEAD)" = "$2" ] || fail MUSL_SOURCE_HEAD_MISMATCH
[ "$(git -C /proof/source rev-parse 'HEAD^{tree}')" = "$3" ] || fail MUSL_SOURCE_TREE_MISMATCH
cd /proof/source
bun install --frozen-lockfile --ignore-scripts
# Verify Bun's actual running ELF, loaded libc, Node's running ABI and native
# kernel CPU before entering producer boundary. Guest mode creates no Docker.
bun --eval 'import { linuxRuntimeLibc } from "./packages/script/src/tree-sitter-prebuilds.ts"; const identity = linuxRuntimeLibc(); if (identity.kind !== "musl" || process.versions.bun !== "1.3.14") throw new Error("MUSL_BOOTSTRAP_BUN_ABI_MISMATCH"); console.log(JSON.stringify(identity))' > /proof/evidence/bun-runtime.json
cd /proof/source/native/omni
HUGR_BUILD_EXISTING_MUSL_GUEST=1 HUGR_PROOF_HEAD="$2" node scripts/build-artifacts.mjs "linux-$(node -p process.arch)-musl" --out /proof/omni-artifacts
HUGR_PROOF_REAL=true HUGR_PROOF_ID="linux-$(node -p process.arch)-musl" HUGR_PROOF_ARTIFACTS=/proof/omni-artifacts \
  node --test scripts/artifacts.node-smoke.mjs
triple=$(rustc -vV | sed -n 's/^host: //p')
case "$1:$triple" in x86_64:x86_64-unknown-linux-musl|aarch64:aarch64-unknown-linux-musl) ;; *) fail MUSL_RUST_NATIVE_HOST_MISMATCH ;; esac
mkdir -p target/release
cp "/proof/omni-artifacts/linux-$(node -p process.arch)-musl/hugr_omni.node" target/release/libhugr_omni_node.so
cp "/proof/omni-artifacts/linux-$(node -p process.arch)-musl/hugr-omni-supervisor" target/release/hugr-omni-supervisor
cp "/proof/omni-artifacts/linux-$(node -p process.arch)-musl/proof.json" /proof/evidence/omni-producer.json
cd /proof/source/apps/cli
exec env -i CI=true HOME=/proof/home TMPDIR=/proof/tmp PATH="$PATH" BUN_INSTALL_CACHE_DIR=/proof/bun-cache \
  ORCHESTRA_MUSL_GUEST=owned ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER=strict ORCHESTRA_OMNI_CONTROL=declared \
  bun test --preload /proof/source/script/test-omni-control.ts --timeout 3600000 \
  ./test/fixture/distribution-musl-guest.test.ts
