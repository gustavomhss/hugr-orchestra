#!/usr/bin/env bash
# Gate extension, prepared only: native Nix CLI/Desktop output and hash capture.
# Invoked only by the lead's explicitly requested W6+Nix validation checkpoint.
set -euo pipefail
export PYTHONDONTWRITEBYTECODE=1
fail() { printf 'NIX_DISTRIBUTION_FAILURE:%s\n' "$*" >&2; exit 1; }
[[ $# == 4 || $# == 5 ]] || fail 'USAGE: measure|verify SYSTEM FULL_REV FRESH_LOG_DIR [MEASUREMENT_DIR]'
mode=$1; export DISTRIBUTION_SYSTEM=$2; revision=$3; dir=$4
[[ $mode == measure || $mode == verify ]] || fail UNKNOWN_MODE
[[ $mode != verify || $# == 5 ]] || fail MISSING_MEASUREMENT_DIRECTORY
[[ $mode != verify || ${GITHUB_ACTIONS:-} == true ]] || fail VERIFY_REQUIRES_REAL_ACTIONS_CONTEXT
[[ $mode != verify || ( -d ${MEASUREMENT_PROVENANCE_DIR:-/nonexistent} \
  && ${MEASUREMENT_RUN_ID:-} =~ ^[1-9][0-9]*$ && ${MEASUREMENT_RUN_ATTEMPT:-} =~ ^[1-9][0-9]*$ ) ]] || fail MISSING_MEASUREMENT_API_PROVENANCE
[[ $(git rev-parse HEAD) == "$revision" ]] || fail SOURCE_REVISION_MISMATCH
[[ -z $(git status --porcelain --untracked-files=all) ]] || fail DIRTY_SOURCE_TREE
[[ ! -e $dir && -d $(dirname "$dir") ]] || fail LOG_DIRECTORY_NOT_FRESH_OR_PARENT_MISSING
python3 - "$dir" <<'PY'
from pathlib import Path
import sys
root, out = Path.cwd().resolve(), Path(sys.argv[1]).resolve()
if out == root or root in out.parents:
    raise SystemExit("NIX_DISTRIBUTION_FAILURE:EVIDENCE_INSIDE_CHECKOUT")
PY
mkdir "$dir"
run() {
  local label=$1 status=0; shift
  printf '%q ' "$@" >"$dir/$label.command"
  local start=$SECONDS
  if "$@" >"$dir/$label.stdout" 2>"$dir/$label.stderr"; then status=0; else status=$?; fi
  printf '%s\n' "$status" >"$dir/$label.exit"
  printf '%s\n' "$((SECONDS - start))" >"$dir/$label.elapsed-seconds"
  cat "$dir/$label.stdout" "$dir/$label.stderr"
  return "$status"
}
trap 'status=$?; git status --porcelain --untracked-files=all >"$dir/final-status.txt"; if [[ -s "$dir/final-status.txt" ]]; then printf "NIX_DISTRIBUTION_FAILURE:SOURCE_CHANGED\n" >&2; status=1; fi; printf "%s\n" "$status" >"$dir/batch.exit"; exit "$status"' EXIT
git rev-parse HEAD >"$dir/source-revision.txt"
git rev-parse 'HEAD^{tree}' >"$dir/source-tree.txt"
git status --porcelain --untracked-files=all >"$dir/source-status.txt"
run nix-version nix --version
run native-system nix eval --impure --raw --expr 'builtins.currentSystem'
[[ $(<"$dir/native-system.stdout") == "$DISTRIBUTION_SYSTEM" ]] || fail NATIVE_SYSTEM_MISMATCH
run dependency-inputs python3 nix/scripts/dependency_measurement.py inputs "$dir"
run all-consumers nix eval --impure --no-write-lock-file --no-update-lock-file --json --expr '
  let
    flake = builtins.getFlake (toString ./.);
    lib = flake.inputs.nixpkgs.lib;
    manifest = builtins.fromJSON (builtins.readFile ./nix/toolchain-sources.json);
  in assert builtins.attrNames flake.packages == builtins.attrNames manifest.bun.sources;
  lib.mapAttrs (system: packages:
    assert builtins.all (path: builtins.pathExists (packages.node_modules.src + "/${path}/package.json")) packages.node_modules.workspacePaths;
    assert builtins.pathExists (packages.node_modules.src + "/packages/cli/script/artifact-darwin.c");
    {
    cli = { inherit (packages.orchestra) drvPath version cliTarget cliArtifacts nativeBuildInputs; };
    desktop = { inherit (packages.orchestra-desktop) drvPath version; electron = packages.orchestra-desktop.electron.version; };
    dependencies = { inherit (packages.node_modules) drvPath workspacePaths hashStatus; };
    bun = { inherit (packages.bun) version compileTarget; };
  }) flake.packages
'
run default-dependency nix eval --impure --no-write-lock-file --no-update-lock-file --raw --expr '
  let
    flake = builtins.getFlake (toString ./.);
    system = builtins.getEnv "DISTRIBUTION_SYSTEM";
    pkgs = flake.inputs.nixpkgs.legacyPackages.${system};
  in (pkgs.callPackage ./nix/orchestra.nix {
    bun = flake.packages.${system}.bun;
    nodejs = pkgs.nodejs_24;
  }).drvPath
'
if [[ $mode == measure ]]; then
  run hash-drv nix eval --no-write-lock-file --no-update-lock-file --raw ".#packages.$DISTRIBUTION_SYSTEM.node_modules_updater.drvPath"
  run hash-drv-info nix derivation show "$(<"$dir/hash-drv.stdout")"
  if run hash-build nix build --no-write-lock-file --no-update-lock-file \
    --option sandbox true --no-link --print-build-logs --log-format internal-json \
    ".#packages.$DISTRIBUTION_SYSTEM.node_modules_updater"; then
    fail UPDATER_UNEXPECTED_SUCCESS
  fi
  run hash-capture python3 nix/scripts/dependency_measurement.py capture "$dir" "$DISTRIBUTION_SYSTEM" "$revision"
  printf 'MEASUREMENT_CAPTURED_NOT_APPLIED:%s\n' "$DISTRIBUTION_SYSTEM" >"$dir/result.txt"
  exit 0
fi
measurement=$5
run measurement-provenance python3 nix/scripts/complete-distribution.py provenance \
  "$MEASUREMENT_PROVENANCE_DIR" "$MEASUREMENT_RUN_ID" "$MEASUREMENT_RUN_ATTEMPT" "$DISTRIBUTION_SYSTEM"
[[ $measurement == "$MEASUREMENT_PROVENANCE_DIR/workers/nix-distribution-measure-$MEASUREMENT_RUN_ID-$MEASUREMENT_RUN_ATTEMPT-$DISTRIBUTION_SYSTEM" ]] || fail MEASUREMENT_WORKER_PATH_MISMATCH
run provenance-controls python3 nix/scripts/probe-distribution-completion.py \
  "$MEASUREMENT_PROVENANCE_DIR" "$dir/provenance-controls" provenance
run matching-measurement python3 nix/scripts/dependency_measurement.py compare "$measurement"
run hash-capture-negative-controls python3 nix/scripts/probe-dependency-measurement.py "$measurement" "$dir/hash-probes"
run applied-hash python3 - "$measurement" "$DISTRIBUTION_SYSTEM" <<'PY'
import json, sys
from pathlib import Path
candidate = json.loads((Path(sys.argv[1]) / "candidate.json").read_text())
hashes = json.loads(Path("nix/hashes.json").read_text())
if candidate["system"] != sys.argv[2] or hashes["nodeModules"][sys.argv[2]] != candidate["hash"]:
    raise SystemExit("NIX_DISTRIBUTION_FAILURE:MEASURED_HASH_NOT_APPLIED")
PY
cp "$measurement/candidate.json" "$dir/measurement-candidate.json"
# Existing toolchain gate and its reach/hash/unsupported-system controls stay
# intact. This is the only scheduled invocation, after W6 and Nix preparation.
run toolchain env TOOLCHAIN_LOG_DIR="$dir/toolchain" bash nix/check-toolchain.sh "$DISTRIBUTION_SYSTEM"
run consumers nix build --no-write-lock-file --no-update-lock-file --option sandbox true \
  --no-link --print-out-paths --print-build-logs \
  ".#packages.$DISTRIBUTION_SYSTEM.orchestra" ".#packages.$DISTRIBUTION_SYSTEM.orchestra-desktop"
run outputs nix eval --no-write-lock-file --no-update-lock-file --json \
  ".#packages.$DISTRIBUTION_SYSTEM" --apply '
  packages: { cli = toString packages.orchestra; desktop = toString packages.orchestra-desktop;
    bun = toString packages.bun; version = packages.orchestra.version; electronVersion = packages.electron.version;
    source = toString packages.node_modules.src; modules = toString packages.node_modules;
  }
'
cli=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["cli"])' "$dir/outputs.stdout")
desktop=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["desktop"])' "$dir/outputs.stdout")
bun=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["bun"])' "$dir/outputs.stdout")
version=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$dir/outputs.stdout")
electronVersion=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["electronVersion"])' "$dir/outputs.stdout")
modules=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["modules"])' "$dir/outputs.stdout")
export HOME="$dir/home" XDG_CONFIG_HOME="$dir/home/config" XDG_DATA_HOME="$dir/home/data" XDG_CACHE_HOME="$dir/home/cache"
mkdir -p "$HOME" "$XDG_CONFIG_HOME" "$XDG_DATA_HOME" "$XDG_CACHE_HOME"
run native-outputs "$bun/bin/bun" --bun nix/scripts/verify-distribution.ts \
  --source "$PWD" --cli "$cli" --desktop "$desktop" --system "$DISTRIBUTION_SYSTEM" \
  --version "$version" --electron-version "$electronVersion"
run output-negative-controls "$bun/bin/bun" --bun nix/scripts/probe-distribution.ts \
  --source "$PWD" --cli "$cli" --desktop "$desktop" --system "$DISTRIBUTION_SYSTEM" \
  --version "$version" --electron-version "$electronVersion" --directory "$dir/probes" --modules "$modules"
run references-cli nix-store --query --references "$cli"
run references-desktop nix-store --query --references "$desktop"
run closure nix path-info --recursive --json "$cli" "$desktop"
if [[ $DISTRIBUTION_SYSTEM == *-darwin ]]; then
  run app-identity python3 - "$desktop" "$version" <<'PY'
import plistlib, sys
from pathlib import Path
info = plistlib.loads((Path(sys.argv[1]) / "Applications/HuGR Orchestra.app/Contents/Info.plist").read_bytes())
if info["CFBundleIdentifier"] != "ai.hugr.orchestra" or info["CFBundleShortVersionString"] != sys.argv[2]:
    raise SystemExit("NIX_DISTRIBUTION_FAILURE:DARWIN_APP_IDENTITY")
print(info)
PY
fi
printf 'NATIVE_DISTRIBUTION_CHECK_OK:%s:%s\n' "$DISTRIBUTION_SYSTEM" "$revision" >"$dir/result.txt"
