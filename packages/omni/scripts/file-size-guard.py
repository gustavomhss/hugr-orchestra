#!/usr/bin/env python3
"""God-file guard: no tracked code file may exceed 650 lines.

Bands (physical lines, counted on the raw bytes, nothing stripped):
  <= 400  sweet spot
  <= 600  ok
  <= 650  tolerated; printed as WARN so review asks for a split plan
  >  650  FAIL

Scope: every file tracked by git (`git ls-files`). Each file is classified as
CODE (checked) or NOT-CODE (documents, data, config, assets; skipped) by the
closed sets below. A file that fits neither set is a hard failure, so a new
kind of source file can never slip past unchecked.

There is no exception list. A file over 650 lines is split. Allowing one would
weaken this gate and needs a written Owner waiver plus an amendment here.

Exit codes: 0 pass (WARN allowed), 1 a file is over the limit, 2 the guard
could not build its file list (treated as a failure, never as a pass).
"""
import subprocess
import sys
from pathlib import Path

SWEET, OK, MAX = 400, 600, 650

CODE_EXT = {
    ".rs", ".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs",
    ".py", ".pyi", ".sh", ".bash", ".ps1",
}
NOT_CODE_EXT = {
    ".md", ".txt", ".json", ".jsonc", ".yaml", ".yml", ".toml", ".lock",
    ".cfg", ".ini", ".dockerfile", ".svg", ".png", ".jpg", ".jpeg", ".gif", ".ico",
}
NOT_CODE_NAMES = {".gitignore", ".gitattributes", ".editorconfig", ".npmignore", "LICENSE"}


def classify(path: Path, root: Path) -> str:
    """Return 'code', 'skip' or 'unknown' for one tracked path."""
    suffix = path.suffix.lower()
    if suffix in CODE_EXT:
        return "code"
    if suffix in NOT_CODE_EXT:
        return "skip"
    name = path.name
    if name in NOT_CODE_NAMES or name.startswith("LICENSE"):
        return "skip"
    if suffix == "":
        # Extensionless executables are code when they start with a shebang.
        with open(root / path, "rb") as fh:
            if fh.read(2) == b"#!":
                return "code"
    return "unknown"


def count_lines(data: bytes) -> int:
    if not data:
        return 0
    return data.count(b"\n") + (0 if data.endswith(b"\n") else 1)


def main() -> int:
    try:
        root = Path(subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            check=True, capture_output=True, text=True).stdout.strip())
        listing = subprocess.run(
            ["git", "ls-files", "-z"], cwd=root, check=True, capture_output=True).stdout
    except (OSError, subprocess.CalledProcessError) as err:
        print(f"file-size-guard: BROKEN — could not list tracked files via git ({err}).")
        return 2

    paths = [Path(p) for p in listing.decode("utf-8").split("\0") if p]
    if not paths:
        print("file-size-guard: BROKEN — `git ls-files` returned no files. Either nothing is "
              "tracked or the listing broke; a guard that checks zero files must not pass.")
        return 2

    unknown, sizes, skipped = [], [], 0
    for path in paths:
        if not (root / path).is_file():
            continue  # deleted in the working tree but still in the index
        kind = classify(path, root)
        if kind == "unknown":
            unknown.append(str(path))
        elif kind == "skip":
            skipped += 1
        else:
            sizes.append((count_lines((root / path).read_bytes()), str(path)))

    if unknown:
        print("file-size-guard: BROKEN — unclassified files (add the extension to CODE_EXT or "
              "NOT_CODE_EXT in scripts/file-size-guard.py):")
        for p in unknown:
            print(f"  {p}")
        return 2
    if not sizes:
        print("file-size-guard: BROKEN — zero code files found. Either the repo has no code or "
              "the classification broke; refusing to pass vacuously.")
        return 2

    sizes.sort(reverse=True)
    fail = [s for s in sizes if s[0] > MAX]
    warn = [s for s in sizes if OK < s[0] <= MAX]
    ok = [s for s in sizes if SWEET < s[0] <= OK]
    sweet = [s for s in sizes if s[0] <= SWEET]

    for n, p in fail:
        print(f"FAIL {n:>5}  {p}  (limit {MAX}: split it into modules)")
    for n, p in warn:
        print(f"WARN {n:>5}  {p}  (tolerated up to {MAX}; plan the split)")
    largest_n, largest_p = sizes[0]
    print(f"file-size-guard: {len(sizes)} code files checked, {skipped} non-code skipped · "
          f"sweet {len(sweet)} · ok {len(ok)} · warn {len(warn)} · fail {len(fail)} · "
          f"largest {largest_p} ({largest_n})")
    return 1 if fail else 0


if __name__ == "__main__":
    sys.exit(main())
