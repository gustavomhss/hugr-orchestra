#!/usr/bin/env bash
# Generate deterministic fixtures for filePath/offset/limit read modes.
set -euo pipefail

OUT="${1:-/tmp/bench-corpus}"
mkdir -p "$OUT"
export OUT
python3 - <<'PY'
import hashlib, json, os
from pathlib import Path

out = Path(os.environ["OUT"])

def write(name, lines, newline="\n"):
    text = newline.join(lines) + newline
    path = out / name
    path.write_bytes(text.encode("utf-8"))
    return {"file": name, "lines": len(lines), "sha256": hashlib.sha256(text.encode()).hexdigest()}

fixtures = []
fixtures.append(write("lf-unicode.txt", ["alpha", "cafe: cafe", "emoji: rocket 🚀", "omega", "last"]))
fixtures.append(write("crlf.txt", ["crlf one", "crlf two", "crlf three", "crlf four"], "\r\n"))
fixtures.append(write("long-line.txt", ["short", "L" * 12000, "after long line", "end"]))
fixtures.append(write("dense-large.txt", [f"dense line {i:05d} " + "X" * 3000 for i in range(1, 3001)]))
fixtures.append(write("sparse-large.txt", ["sparse marker" if i in (1, 1500, 3000) else "" for i in range(1, 3001)]))
(out / "manifest.json").write_text(json.dumps({"fixtures": fixtures}, indent=2) + "\n")
PY
python3 -c 'import json,sys; m=json.load(open(sys.argv[1])); print("fixtures:", len(m["fixtures"])); [print("{}: {} lines {}".format(x["file"], x["lines"], x["sha256"])) for x in m["fixtures"]]' "$OUT/manifest.json"
