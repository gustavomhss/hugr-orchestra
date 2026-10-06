#!/usr/bin/env python3
"""Teeth for scripts/file-size-guard.py: plant every defect class it claims to catch.

Run: python3 scripts/test_file_size_guard.py
"""
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

GUARD = Path(__file__).resolve().parent / "file-size-guard.py"


def repo(files: dict, omni: str = ""):
    """A git repo holding `files`, with the guard copied (untracked) to `<omni>/scripts/`, as it sits in omni."""
    root = Path(tempfile.mkdtemp(prefix="fsg-"))
    subprocess.run(["git", "init", "-q"], cwd=root, check=True)
    for name, content in files.items():
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content if isinstance(content, bytes) else content.encode())
    if files:
        subprocess.run(["git", "add", "-A"], cwd=root, check=True)
    guard = root / omni / "scripts" / GUARD.name
    guard.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy(GUARD, guard)
    return root, guard


def run(root: Path, guard: Path):
    # Run from the repo's top level: the guard must scan its own root whatever the caller's directory is.
    out = subprocess.run([sys.executable, str(guard)], cwd=root, capture_output=True, text=True)
    return out.returncode, out.stdout


def lines(n: int, end_newline: bool = True) -> str:
    body = "\n".join(f"x{i}" for i in range(n))
    return body + ("\n" if end_newline else "")


NESTED = "packages/omni"

CASES = [
    # (name, files, expected exit code, text that must appear in the output[, omni root inside the repo])
    ("650 lines passes with WARN", {"src/a.rs": lines(650)}, 0, "WARN   650  src/a.rs"),
    ("400 lines is sweet", {"src/a.rs": lines(400)}, 0, "sweet 1"),
    ("651 lines fails and names the file", {"src/big.rs": lines(651)}, 1, "FAIL   651  src/big.rs"),
    ("no trailing newline still counts the last line",
     {"src/a.py": lines(651, end_newline=False)}, 1, "FAIL   651  src/a.py"),
    ("documents are not checked",
     {"PLAN.md": lines(5000), "data.json": lines(5000), "src/a.ts": lines(10)}, 0, "fail 0"),
    ("extensionless shebang script is code",
     {"scripts/tool": "#!/bin/sh\n" + lines(700), "src/a.rs": lines(1)}, 1, "scripts/tool"),
    ("unclassified extension is broken, named", {"src/a.rs": lines(1), "x.weird": "1\n"}, 2, "x.weird"),
    ("empty repo is broken, not a pass", {}, 2, "returned no files"),
    ("only documents is broken, not a pass", {"README.md": "hi\n"}, 2, "zero code files"),
    # Inside a host repo (Orchestra's packages/omni) the guard scans its own subtree and nothing else.
    ("nested: a big file outside the omni root is not ours",
     {"src/huge.ts": lines(5000), "x.weird": "1\n", f"{NESTED}/src/a.rs": lines(10)}, 0, "1 code files checked", NESTED),
    ("nested: a big file inside the omni root fails, named from the root",
     {"src/a.ts": lines(1), f"{NESTED}/src/big.rs": lines(651)}, 1, "FAIL   651  src/big.rs", NESTED),
    ("nested: an empty omni root is broken, not a pass",
     {"src/a.ts": lines(1)}, 2, "returned no files", NESTED),
]


def main() -> int:
    failures = 0
    for name, files, want_code, want_text, *omni in CASES:
        code, out = run(*repo(files, *omni))
        ok = code == want_code and want_text in out
        failures += not ok
        print(f"{'ok  ' if ok else 'FAIL'} {name}" + ("" if ok else f"\n     exit={code} out={out!r}"))
    print(f"{len(CASES) - failures}/{len(CASES)} teeth cases passed")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
