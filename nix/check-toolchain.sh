#!/usr/bin/env bash
# Gate extension: locked native Bun/Electron only; no CLI/desktop closure claim.
set -euo pipefail
export PYTHONPATH="$PWD/nix"
fail() { printf 'TOOLCHAIN_GATE_FAILURE:%s\n' "$*" >&2; exit 1; }
[[ $# == 1 && -n $1 ]] || fail MISSING_EXPECTED_SYSTEM
export TOOLCHAIN_SYSTEM="$1"
dir="${TOOLCHAIN_LOG_DIR:-${TMPDIR:-/tmp}/nix-toolchain-$TOOLCHAIN_SYSTEM}"
mkdir -p "$dir"
run() {
  local label="$1" status=0; shift
  printf '%q ' "$@" >"$dir/$label.command"
  if "$@" >"$dir/$label.stdout" 2>"$dir/$label.stderr"; then status=0; else status=$?; fi
  printf '%s\n' "$status" >"$dir/$label.exit"
  cat "$dir/$label.stdout" "$dir/$label.stderr"
  return "$status"
}
require() {
  python3 - "$dir/$1.stderr" "$2" <<'PY'
import sys
from pathlib import Path
from toolchain_metadata import text
if sys.argv[2] not in text(sys.argv[1]):
    raise SystemExit("TOOLCHAIN_GATE_FAILURE:MISSING_LOG_EVIDENCE:" + sys.argv[2])
PY
}
trap 'status=$?; if ! git diff --exit-code -- flake.lock >"$dir/lock.diff"; then status=1; printf "TOOLCHAIN_GATE_FAILURE:LOCK_CHANGED\n" >&2; fi; exit "$status"' EXIT
git diff --exit-code -- flake.lock >"$dir/lock.diff"
run native-system nix eval --impure --raw --expr 'builtins.currentSystem'
[[ $(<"$dir/native-system.stdout") == "$TOOLCHAIN_SYSTEM" ]] || fail NATIVE_SYSTEM_MISMATCH
run declared-systems nix eval --impure --json --expr 'builtins.attrNames (builtins.getFlake (toString ./.)).packages'
python3 - "$dir" "$TOOLCHAIN_SYSTEM" <<'PY'
import base64, json, sys
from pathlib import Path
from toolchain_metadata import read_json, systems_from
def need(condition, name):
    if not condition: raise SystemExit("TOOLCHAIN_GATE_FAILURE:" + name)
out, system = Path(sys.argv[1]), sys.argv[2]
systems = systems_from(out / "declared-systems.stdout")
need(system in systems, "UNDECLARED_NATIVE_SYSTEM")
m = read_json("nix/toolchain-sources.json")
root = read_json("package.json")
desktop = read_json("packages/desktop/package.json")
need(root["packageManager"] == "bun@" + m["bun"]["version"], "ROOT_BUN_VERSION_DRIFT")
need(desktop["devDependencies"]["electron"] == m["electron"]["version"], "DESKTOP_ELECTRON_VERSION_DRIFT")
need(read_json("flake.lock")["nodes"]["nixpkgs"]["locked"]["rev"] == m["nixpkgsRevision"], "NIXPKGS_PIN_DRIFT")
for tool in ("bun", "electron"):
    need(set(m[tool]["sources"]) == set(systems), "SOURCE_SYSTEMS_MISMATCH:" + tool)
    for key, source in m[tool]["sources"].items():
        need(source["system"] == key, "SOURCE_SYSTEM_FIELD:" + tool)
        digest = base64.b64decode(source["hash"].removeprefix("sha256-"), validate=True)
        need(len(digest) == 32 and source["hash"].startswith("sha256-") and digest.hex() == source["sha256"] == source["publishedSha256"], "SOURCE_HASH_RECORD:" + tool)
    (out / (tool + "-expected.json")).write_text(json.dumps({"version": m[tool]["version"], **m[tool]["sources"][system]}))
PY
tools=(bun electron)
[[ ${#tools[@]} == 2 ]] || fail EMPTY_TOOL_LIST
completed=()
for tool in "${tools[@]}"; do
  export TOOLCHAIN_TOOL="$tool"
  base=$(cat <<'NIX'
    let
      flake = builtins.getFlake (toString ./.);
      pkgs = flake.inputs.nixpkgs.legacyPackages.${builtins.getEnv "TOOLCHAIN_SYSTEM"};
      tool = builtins.getEnv "TOOLCHAIN_TOOL";
      package = pkgs.callPackage (./nix + "/${tool}.nix") {};
NIX
  )
  render='in { inherit (package) version doInstallCheck installCheckPhase; buildCommand = package.buildCommand or null; source = { inherit (package.src) urls outputHash outputHashMode; }; }'
  run "$tool-render" nix eval --impure --json --expr "$base $render"
  python3 - "$dir" "$tool" <<'PY'
import json, sys
from pathlib import Path
from toolchain_metadata import read_json
out, tool = Path(sys.argv[1]), sys.argv[2]
expected = read_json(out / (tool + "-expected.json"))
actual = read_json(out / (tool + "-render.stdout"))
checks = {"version": actual["version"] == expected["version"], "doInstallCheck": actual["doInstallCheck"] is True,
          "sourceURL": actual["source"]["urls"] == [expected["url"]], "sourceHash": actual["source"]["outputHash"] == expected["hash"],
          "hashMode": actual["source"]["outputHashMode"] == "flat"}
for name, passed in checks.items():
    if not passed: raise SystemExit("TOOLCHAIN_GATE_FAILURE:RENDER_MISMATCH:" + tool + ":" + name)
PY
  expr="$base in package"
  run "$tool-build" nix build --impure --no-link --print-out-paths --print-build-logs --expr "$expr"
  run "$tool-rebuild" nix build --impure --no-link --rebuild --print-out-paths --print-build-logs --expr "$expr"
  require "$tool-rebuild" "TOOLCHAIN_INSTALL_CHECK_OK:$tool:"
  probe=$(cat <<'NIX'
    in package.overrideAttrs (old: {
      postInstallCheck = (old.postInstallCheck or "") + ''
        echo "TOOLCHAIN_INSTALL_CHECK_FAIL_PROBE:${tool}" >&2
        exit 97
      '';
    })
NIX
  )
  if run "$tool-check-mutant" nix build --impure --no-link --print-build-logs --expr "$base $probe"; then fail "INSTALL_CHECK_MUTANT_PASSED:$tool"; fi
  require "$tool-check-mutant" "TOOLCHAIN_INSTALL_CHECK_FAIL_PROBE:$tool"
  require "$tool-check-mutant" 'exit code 97'
  unsupported=$(cat <<'NIX'
    in (pkgs.callPackage (./nix + "/${tool}.nix") (
      if tool == "bun" then { stdenvNoCC = pkgs.stdenvNoCC // { hostPlatform = pkgs.stdenvNoCC.hostPlatform // { system = "toolchain-unsupported"; }; }; }
      else { stdenv = pkgs.stdenv // { hostPlatform = pkgs.stdenv.hostPlatform // { system = "toolchain-unsupported"; }; }; }
    )).src.drvPath
NIX
  )
  if run "$tool-unsupported" nix eval --impure --raw --expr "$base $unsupported"; then fail "UNSUPPORTED_SOURCE_PASSED:$tool"; fi
  label=Bun; if [[ $tool == electron ]]; then label=Electron; fi
  require "$tool-unsupported" "Unsupported $label toolchain system: toolchain-unsupported"
  hashProbe='in package.src.overrideAttrs (_: { outputHashAlgo = "sha256"; outputHash = builtins.hashString "sha256" "toolchain-wrong-hash"; })'
  if run "$tool-hash-mutant" nix build --impure --no-link --print-build-logs --expr "$base $hashProbe"; then fail "HASH_MUTANT_PASSED:$tool"; fi
  require "$tool-hash-mutant" 'hash mismatch in fixed-output derivation'
  python3 - "$dir" "$tool" <<'PY'
import json, re, sys
from pathlib import Path
from toolchain_metadata import read_json
out, tool = Path(sys.argv[1]), sys.argv[2]
expected = read_json(out / (tool + "-expected.json"))
got = re.findall(r"^\s*got:\s*(\S+)\s*$", (out / (tool + "-hash-mutant.stderr")).read_text(), re.M)
if got != [expected["hash"]]: raise SystemExit("TOOLCHAIN_GATE_FAILURE:HASH_PROBE_GOT:" + tool)
PY
  run "$tool-restored" nix build --impure --no-link --rebuild --print-out-paths --print-build-logs --expr "$expr"
  require "$tool-restored" "TOOLCHAIN_INSTALL_CHECK_OK:$tool:"
  store=$(<"$dir/$tool-build.stdout")
  [[ $store == /nix/store/* && $store != *$'\n'* ]] || fail "INVALID_OUTPUT_PATH:$tool"
  run "$tool-references" nix-store --query --references "$store"
  run "$tool-closure" nix path-info --recursive --json "$store"
  binary="$store/bin/bun"
  if [[ $tool == electron ]]; then
    binary="$store/libexec/electron/electron"
    if [[ $TOOLCHAIN_SYSTEM == *-darwin ]]; then binary="$store/Applications/Electron.app/Contents/MacOS/Electron"; fi
  fi
  python3 - "$binary" "$TOOLCHAIN_SYSTEM" >"$dir/$tool-native-image.json" <<'PY'
import json, struct, sys
from pathlib import Path
with Path(sys.argv[1]).open("rb") as binary:
    data = binary.read(64)
system = sys.argv[2]
arch, os = system.split("-")
if os == "linux":
    valid = data[:6] == b"\x7fELF\x02\x01" and struct.unpack_from("<H", data, 18)[0] == {"x86_64": 62, "aarch64": 183}[arch]
else:
    valid = data[:4] == b"\xcf\xfa\xed\xfe" and struct.unpack_from("<I", data, 4)[0] == {"x86_64": 0x1000007, "aarch64": 0x100000c}[arch]
if not valid: raise SystemExit("TOOLCHAIN_GATE_FAILURE:NATIVE_IMAGE_MISMATCH:" + system)
print(json.dumps({"binary": sys.argv[1], "system": system, "nativeImage": True}))
PY
  if [[ $tool == bun ]]; then
    run "$tool-execute" "$store/bin/bun" --version
  else
    run "$tool-execute" env ELECTRON_RUN_AS_NODE=1 "$store/bin/electron" -p 'process.versions.electron'
  fi
  python3 - "$dir" "$tool" <<'PY'
import json, sys
from pathlib import Path
from toolchain_metadata import read_json
out, tool = Path(sys.argv[1]), sys.argv[2]
expected = read_json(out / (tool + "-expected.json"))["version"]
if (out / (tool + "-execute.stdout")).read_text().strip() != expected:
    raise SystemExit("TOOLCHAIN_GATE_FAILURE:NATIVE_EXECUTION_VERSION:" + tool)
PY
  completed+=("$tool")
done
[[ ${completed[*]} == 'bun electron' ]] || fail INCOMPLETE_TOOL_COVERAGE
git diff --exit-code -- flake.lock >"$dir/lock.diff"
python3 nix/toolchain_metadata.py record "$dir"
printf 'TOOLCHAIN_GATE_OK:%s:%s\n' "$TOOLCHAIN_SYSTEM" "${completed[*]}" | tee "$dir/result.txt"
