"""Rebuild retained host prebuilds whose binary targets another CPU.

Run after prune-foreign-prebuilds.py. Upstream packages can mislabel prebuilds: for
example tree-sitter-typescript 0.23.2 and tree-sitter-javascript 0.23.1 publish x86-64
ELF files under prebuilds/linux-arm64. Every retained prebuilds/<host>/*.node must be
an addon for the host CPU. A mismatched one is rebuilt offline from the package's own
binding.gyp against the Nix Node headers (N-API addons are ABI-stable across Node and
Electron), then the built addon replaces it under the same name.
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

# system -> (prebuild directory, binary format, ELF e_machine or Mach-O cputype)
HOSTS = {
    "x86_64-linux": ("linux-x64", "elf", 62),
    "aarch64-linux": ("linux-arm64", "elf", 183),
    "x86_64-darwin": ("darwin-x64", "macho", 0x01000007),
    "aarch64-darwin": ("darwin-arm64", "macho", 0x0100000C),
}


def require(condition, code):
    if not condition:
        raise SystemExit("NIX_DESKTOP_NATIVE_FAILURE:" + code)


def main():
    require(len(sys.argv) == 5, "ARGUMENTS")
    root, system, nodedir, node_gyp = Path(sys.argv[1]).resolve(), sys.argv[2], Path(sys.argv[3]), Path(sys.argv[4])
    require(system in HOSTS, "UNSUPPORTED_SYSTEM")
    host, kind, machine = HOSTS[system]
    node = nodedir / "bin" / "node"
    require(node.is_file() and (nodedir / "include" / "node" / "node_api.h").is_file(), "NODE_HEADERS_MISSING")
    require(node_gyp.is_file(), "NODE_GYP_MISSING")
    trees = [root / "node_modules"] + [
        path
        for directory in (root / "packages", root / "apps")
        for path in directory.glob("*/node_modules")
        if path.is_dir()
    ]
    require(trees[0].is_dir(), "DEPENDENCY_SOURCE_MISSING")
    addons = host_prebuilds(trees, host)
    require(addons, "NO_HOST_PREBUILDS")
    mismatched = {}
    for addon in addons:
        package = addon.parent.parent.parent
        # Linux x64 npm tree-sitter prebuilds loaded in Bun end the process silently (exit 0, no output), so on
        # Linux every tree-sitter binding is built here with the same Nix toolchain as the arm64 rebuilds.
        if machine not in machines(addon, kind) or (kind == "elf" and package.name.startswith("tree-sitter")):
            mismatched.setdefault(package, []).append(addon)
    rebuilt = [rebuild(package, files, root, kind, machine, node, nodedir, node_gyp) for package, files in sorted(mismatched.items())]
    print(json.dumps({"status": "HOST_PREBUILDS_VERIFIED", "system": system, "checked": len(addons), "rebuilt": rebuilt}))


def host_prebuilds(trees, host):
    addons = set()
    for tree in trees:
        for directory, dirs, _ in os.walk(tree, followlinks=False):
            if Path(directory).name != "prebuilds":
                continue
            for name in dirs:
                if name == host or name.startswith(host + "+") or name.startswith(host + "."):
                    addons.update(path.resolve() for path in (Path(directory) / name).glob("*.node") if not path.is_symlink())
            dirs.clear()
    return sorted(addons)


def machines(path, kind):
    """CPU identifiers a native image declares; empty when it is not a recognised image."""
    with path.open("rb") as file:
        data = file.read(4096)
    if kind == "elf":
        if len(data) < 20 or data[:4] != b"\x7fELF" or data[5] not in (1, 2):
            return set()
        return {int.from_bytes(data[18:20], "little" if data[5] == 1 else "big")}
    if len(data) < 8:
        return set()
    if int.from_bytes(data[:4], "little") in (0xFEEDFACE, 0xFEEDFACF):
        return {int.from_bytes(data[4:8], "little")}
    magic = int.from_bytes(data[:4], "big")
    if magic not in (0xCAFEBABE, 0xCAFEBABF):
        return set()
    # Universal binary: big-endian fat_arch (20 bytes) or fat_arch_64 (32 bytes) records.
    size = 20 if magic == 0xCAFEBABE else 32
    offsets = [8 + index * size for index in range(int.from_bytes(data[4:8], "big"))]
    return {int.from_bytes(data[offset:offset + 4], "big") for offset in offsets if offset + 4 <= len(data)}


def rebuild(package, files, root, kind, machine, node, nodedir, node_gyp):
    label = str(package.relative_to(root)) if package.is_relative_to(root) else str(package)
    require(package.is_relative_to(root) and "/nix/store/" not in str(package), "REBUILD_ROOT_ESCAPE:" + label)
    require((package / "binding.gyp").is_file(), "BINDING_GYP_MISSING:" + label)
    build = package / "build"
    # node-gyp-build loads build/Release before prebuilds; never mix a foreign build tree in.
    require(not build.exists() and not build.is_symlink(), "BUILD_DIRECTORY_PRESENT:" + label)
    metadata = json.loads((package / "package.json").read_text())
    previous = {str(file.relative_to(package)): sorted(hex(value) for value in machines(file, kind)) for file in files}
    # gyp writes dependency makefiles and stamps through ../ paths beside build/ (for
    # example <package>/node-addon-api@8.8.0/); every entry it adds must not ship.
    ancestors = [package] + [path for path in package.parents if path.is_relative_to(root)]
    before = {directory: set(os.listdir(directory)) for directory in ancestors}
    command = [str(node), str(node_gyp), "rebuild", "--release", "--jobs=max", "--nodedir=" + str(nodedir), "--python=" + sys.executable]
    require(subprocess.run(command, cwd=package, stdout=sys.stderr).returncode == 0, "NODE_GYP_FAILED:" + label)
    outputs = sorted((build / "Release").glob("*.node"))
    require(len(outputs) == 1, "REBUILD_OUTPUT_NOT_UNIQUE:" + label)
    require(machines(outputs[0], kind) == {machine}, "REBUILD_ARCHITECTURE_MISMATCH:" + label)
    for file in files:
        shutil.copyfile(outputs[0], file)
        require(machines(file, kind) == {machine}, "REPLACED_ARCHITECTURE_MISMATCH:" + str(file.relative_to(root)))
    strays = sorted(directory / name for directory in ancestors for name in set(os.listdir(directory)) - before[directory])
    require(build in strays, "BUILD_DIRECTORY_MISSING:" + label)
    for stray in strays:
        if stray.is_dir() and not stray.is_symlink():
            shutil.rmtree(stray)
            continue
        stray.unlink()
    return {
        "package": label,
        "name": metadata.get("name"),
        "version": metadata.get("version"),
        "built": outputs[0].name,
        "replaced": previous,
        "removedBuildByproducts": [str(stray.relative_to(root)) for stray in strays],
    }


if __name__ == "__main__":
    main()
