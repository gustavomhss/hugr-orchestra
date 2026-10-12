"""Remove node-gyp-build prebuilds for other platforms before packaging the desktop app.

node-gyp-build only loads prebuilds/<platform>-<arch>/ for the running host, so the
others are dead bytes that the packaged-addon oracle would rightly refuse to load.
"""
import json
import os
from pathlib import Path
import shutil
import sys

PLATFORMS = {"android", "darwin", "freebsd", "linux", "openbsd", "sunos", "win32"}
HOSTS = {
    "x86_64-linux": "linux-x64",
    "aarch64-linux": "linux-arm64",
    "x86_64-darwin": "darwin-x64",
    "aarch64-darwin": "darwin-arm64",
}


def require(condition, code):
    if not condition:
        raise SystemExit("NIX_DESKTOP_NATIVE_FAILURE:" + code)


def main():
    require(len(sys.argv) == 3, "ARGUMENTS")
    root, system = Path(sys.argv[1]).resolve(), sys.argv[2]
    require(system in HOSTS, "UNSUPPORTED_SYSTEM")
    host = HOSTS[system]
    trees = [root / "node_modules"] + [path for path in (root / "packages").glob("*/node_modules") if path.is_dir()]
    require(trees[0].is_dir(), "DEPENDENCY_SOURCE_MISSING")
    removed, retained = [], []
    for tree in trees:
        for directory, dirs, _ in os.walk(tree, followlinks=False):
            if Path(directory).name != "prebuilds":
                continue
            for name in list(dirs):
                platform = name.split("-", 1)[0]
                if platform not in PLATFORMS:
                    continue
                path = Path(directory) / name
                require(path.resolve().is_relative_to(root) and not path.is_symlink(), "PRUNE_ROOT_ESCAPE:" + str(path))
                if name == host or name.startswith(host + "+") or name.startswith(host + "."):
                    retained.append(str(path.relative_to(root)))
                    continue
                shutil.rmtree(path)
                removed.append(str(path.relative_to(root)))
            dirs.clear()
    print(json.dumps({"status": "FOREIGN_PREBUILDS_PRUNED", "system": system, "removed": len(removed), "retained": sorted(retained)}))


main()
