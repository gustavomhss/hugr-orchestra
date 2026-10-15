"""Remove locked optional native variants unsupported by packaged glibc Electron."""
import json
import os
from pathlib import Path
import shutil
import sys


def require(condition, code):
    if not condition:
        raise SystemExit("NIX_DESKTOP_NATIVE_FAILURE:" + code)


def main():
    require(len(sys.argv) == 3, "ARGUMENTS")
    root, system = Path(sys.argv[1]).resolve(), sys.argv[2]
    require(system in {"x86_64-linux", "aarch64-linux"}, "UNSUPPORTED_SYSTEM")
    arch = "x64" if system == "x86_64-linux" else "arm64"
    modules = root / "node_modules"
    require(modules.is_dir() and (modules / ".bun").is_dir(), "DEPENDENCY_SOURCE_MISSING")
    leaves = list((modules / ".bun").iterdir())

    def package(name, version):
        paths = [leaf / "node_modules" / name for leaf in leaves if (leaf / "node_modules" / name / "package.json").is_file()]
        physical = {path.resolve() for path in paths}
        require(len(physical) == 1, "PACKAGE_MISSING_OR_AMBIGUOUS:" + name)
        path = physical.pop()
        require(path.is_relative_to(modules.resolve()) and "/nix/store/" not in str(path), "PRUNE_ROOT_ESCAPE:" + name)
        metadata = json.loads((path / "package.json").read_text())
        require(metadata["name"] == name and metadata["version"] == version, "PACKAGE_IDENTITY_MISMATCH:" + name)
        return path

    watcher = package("@parcel/watcher-linux-" + arch + "-glibc", "2.5.1")
    pty = package("@lydell/node-pty-linux-" + arch, "1.2.0-beta.12")
    require((watcher / "watcher.node").is_file(), "EXPECTED_GLIBC_WATCHER_MISSING")
    require((pty / "prebuilds" / ("linux-" + arch) / "pty.node").is_file(), "EXPECTED_PTY_MISSING")
    musl = package("@parcel/watcher-linux-" + arch + "-musl", "2.5.1")
    msgpackr = package("@msgpackr-extract/msgpackr-extract-linux-" + arch, "3.0.4")
    expected = {"node.abi115.musl.node", "node.napi.musl.node"} | ({"node.abi115.glibc.node", "node.napi.glibc.node"} if arch == "x64" else set())
    require({file.name for file in msgpackr.glob("*.node")} == expected, "UNEXPECTED_MSGPACKR_VARIANT")
    removed = [musl] + ([msgpackr] if arch == "arm64" else [])
    aliases = []
    trees = [modules] + [path for path in (root / "packages").glob("*/node_modules") if path.is_dir()]
    for tree in trees:
        require(tree.resolve().is_relative_to(root), "DEPENDENCY_TREE_ESCAPE")
        for directory, dirs, files in os.walk(tree, followlinks=False):
            for name in dirs + files:
                path = Path(directory) / name
                if path.is_symlink() and any(path.resolve().is_relative_to(target) for target in removed):
                    require(path.parent.resolve().is_relative_to(root), "ALIAS_ROOT_ESCAPE")
                    aliases.append(path)
    for alias in set(aliases):
        alias.unlink()
    for path in removed:
        shutil.rmtree(path)
    if arch == "x64":
        for name in sorted(expected - {"node.napi.glibc.node"}):
            (msgpackr / name).unlink()
        require((msgpackr / "node.napi.glibc.node").is_file(), "EXPECTED_NAPI_GLIBC_MISSING")
    require((watcher / "watcher.node").is_file() and (pty / "prebuilds" / ("linux-" + arch) / "pty.node").is_file(), "RETAINED_NATIVE_PACKAGE_MISSING")
    print(json.dumps({"status": "GLIBC_DESKTOP_VARIANTS_PREPARED", "system": system, "removedOptionalPackages": [path.name for path in removed], "retained": [watcher.name, pty.name]}))


main()
