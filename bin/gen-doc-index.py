#!/usr/bin/env python3
"""
gen-doc-index.py — regenerate docs/INDEX.md, the hashed integrity manifest of the doc set.

CONTRIBUTING.md requires regenerating the index after substantive doc changes, but no generator
existed — so the index silently drifted (missing files, stale hashes). This is that generator: it
hashes every documentation file (top-level *.md + docs/*.md, excluding the index itself), writes the
table + the root hash, and is idempotent.

Usage:  bin/gen-doc-index.py [--check]      # --check: exit 1 if the index is stale, write nothing
The --check mode is CI-friendly: it fails the build if someone edited docs without regenerating.
"""
import argparse, hashlib, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX = os.path.join("docs", "INDEX.md")
# Deterministic order: the top-level set first (in this canonical order), then docs/*.md sorted.
TOP = ["README.md", "WHITEPAPER.md", "PRODUCT.md", "SPEC.md", "CONTRIBUTING.md", "CHANGELOG.md"]


def doc_files():
    files = [f for f in TOP if os.path.exists(os.path.join(ROOT, f))]
    docs_dir = os.path.join(ROOT, "docs")
    for name in sorted(os.listdir(docs_dir)):
        if name.endswith(".md") and name != "INDEX.md":
            files.append(os.path.join("docs", name))
    return files


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
    out.append("# from the relay/ root — recompute and compare to the table above")
    out.append("for f in " + " ".join(TOP) + " docs/*.md; do")
    out.append('  [ "$f" = docs/INDEX.md ] && continue')
    out.append('  shasum -a 256 "$f"')
    out.append("done")
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
    sys.exit(main())
