#!/usr/bin/env python3
"""
gen-doc-index.py — regenerate docs/INDEX.md, the hashed integrity manifest of the doc set.

Hash authored Markdown at the repository root and recursively under docs/, benchmark/, examples/
and .opencode/skills/. Runtime/generated directories and the index itself are excluded. This detects
byte drift, not semantic freshness. --check preserves the existing file and ignores only its stamp.

Usage:  bin/gen-doc-index.py [--check]      # --check: exit 1 if the index is stale, write nothing
The --check mode is CI-friendly: it fails the build if someone edited docs without regenerating.
"""
import argparse, hashlib, os, sys
from pathlib import Path
import stat

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX = os.path.join("docs", "INDEX.md")
DOC_ROOTS = ("docs", "benchmark", "examples", ".opencode/skills")
EXCLUDED = {".git", "__pycache__", ".pytest_cache", ".relay-state", ".relay-ledger",
            "_runs", "runs", ".live-runs", "node_modules", ".venv", "venv"}


def authored(path):
    return not any(p in EXCLUDED or p.startswith("_gen") for p in path.parts)


def walk_files(folder, missing_ok=False):
    """Enumerate explicitly; scandir errors must never become an empty inventory."""
    try:
        entries = os.scandir(folder)
    except FileNotFoundError:
        if missing_ok:
            return
        raise
    with entries:
        rows = sorted(entries, key=lambda e: e.name)
    for entry in rows:
        if not authored(Path(entry.name)):
            continue
        path = Path(entry.path)
        if entry.is_symlink():
            if stat.S_ISDIR(entry.stat().st_mode):
                raise OSError(f"directory symlink is not an inventory root: {path}")
            yield path
        elif entry.is_dir(follow_symlinks=False):
            yield from walk_files(path)
        elif entry.is_file(follow_symlinks=False):
            yield path


def doc_files(root=None):
    root = Path(root or ROOT).resolve()
    with os.scandir(root) as entries:
        paths = [Path(e.path) for e in entries if e.name.endswith(".md") and e.is_file()]
    for folder in DOC_ROOTS:
        paths.extend(p for p in walk_files(root / folder, missing_ok=True) if p.suffix == ".md")
    for path in paths:
        if not path.resolve().is_relative_to(root):
            raise OSError(f"documentation target outside repository: {path}")
    return sorted({p.relative_to(root).as_posix() for p in paths
                   if authored(p.relative_to(root)) and p.relative_to(root).as_posix() != "docs/INDEX.md"})


def sha(path):
    return hashlib.sha256(open(os.path.join(ROOT, path), "rb").read()).hexdigest()


def stats(path):
    b = open(os.path.join(ROOT, path), "rb").read()
    return len(b.decode("utf-8", "replace").splitlines()), len(b)


def build(generated_stamp):
    files = doc_files()
    rows = []
    manifest_lines = []
    for f in files:
        h = sha(f)
        lines, nbytes = stats(f)
        rows.append(f"| `{f}` | {lines} | {nbytes} | `{h}` |")
        manifest_lines.append(f"{h}  {f}")
    root = hashlib.sha256(("\n".join(sorted(manifest_lines)) + "\n").encode()).hexdigest()

    out = []
    out.append("# HuGR Relay — Documentation Index (hashed)\n")
    out.append("Audience: agents. Status: current.\n")
    out.append("Integrity manifest for the Relay documentation set. Each hash is SHA-256 of the file's bytes.")
    out.append("Regenerate after any documentation change (`bin/gen-doc-index.py`).\n")
    out.append(f"- **Generated:** {generated_stamp}")
    out.append(f"- **Files:** {len(files)}")
    out.append(f"- **Root hash** (SHA-256 of the sorted `<sha256>  <path>` manifest): `{root}`\n")
    out.append("| File | Lines | Bytes | SHA-256 |")
    out.append("|---|---|---|---|")
    out.extend(rows)
    out.append("\n## Verify\n")
    out.append("```bash")
    out.append("python3 bin/gen-doc-index.py --check")
    out.append("```")
    return "\n".join(out) + "\n", root


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="fail if the index is stale; write nothing")
    a = ap.parse_args()
    index_path = os.path.join(ROOT, INDEX)

    if a.check:
        # Recompute the table/root and compare to what's on disk, ignoring the volatile Generated stamp.
        current = open(index_path).read() if os.path.exists(index_path) else ""
        new, root = build("<stamp>")
        def strip_stamp(s):
            return "\n".join(l for l in s.splitlines() if not l.startswith("- **Generated:**"))
        if strip_stamp(current) != strip_stamp(new):
            print("docs/INDEX.md is STALE — run bin/gen-doc-index.py", file=sys.stderr)
            return 1
        print("docs/INDEX.md is up to date.")
        return 0

    # Date.now is unavailable in some harnesses; use SOURCE_DATE_EPOCH if set, else a fixed note.
    stamp = os.environ.get("DOC_INDEX_STAMP", "")
    if not stamp:
        try:
            import datetime
            stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        except Exception:
            stamp = "(regenerate to stamp)"
    text, root = build(stamp)
    open(index_path, "w").write(text)
    print(f"wrote {INDEX}: {len(doc_files())} files, root {root[:12]}…")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except OSError as exc:
        print(f"documentation-inventory: {exc}", file=sys.stderr)
        sys.exit(1)
