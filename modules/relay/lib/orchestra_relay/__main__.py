"""`relay verify [run_dir]` and `relay demo tamper [run_dir]`."""
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from orchestra_relay import VERIFY, project_root


def main(argv=None):
    args = sys.argv[1:] if argv is None else argv
    if args[:1] == ["verify"] and len(args) <= 2:
        return verify(run_dir(args[1:]))
    if args[:2] == ["demo", "tamper"] and len(args) <= 3:
        return tamper(run_dir(args[2:]))
    print("usage: relay verify [run_dir]\n       relay demo tamper [run_dir]", file=sys.stderr)
    return 2


def verify(run):
    ledger = run / "ledger.jsonl"
    done = subprocess.run([sys.executable, str(VERIFY), str(ledger)], capture_output=True, text=True)
    print(done.stdout, end="")
    print(done.stderr, end="", file=sys.stderr)
    broken = re.search(r"line (\d+)", done.stdout) if done.returncode == 1 else None
    if broken:
        n = int(broken.group(1))
        entry = json.loads(ledger.read_text(encoding="utf-8").splitlines()[n - 1])
        print(f'relay verify: ledger broken at entry {n} (node "{entry.get("node", "-")}", attempt {entry.get("attempt", "-")})')
        print(f"       Entries {n} and later can no longer be trusted. Entries before {n} are intact.")
    return done.returncode


def tamper(run):
    copy = Path(tempfile.mkdtemp(prefix="relay-tamper-")) / run.name
    shutil.copytree(run, copy)
    ledger = copy / "ledger.jsonl"
    lines = ledger.read_text(encoding="utf-8").splitlines()
    n = len(lines) // 2
    at = lines[n].index('"event":"') + len('"event":"')
    lines[n] = lines[n][:at] + lines[n][at].swapcase() + lines[n][at + 1:]
    ledger.write_text("".join(f"{line}\n" for line in lines), encoding="utf-8")
    body = lines[n][: lines[n].rindex(',"h":')] + "}"
    print(f"relay demo tamper: flipped one byte in entry {n + 1} of a copy at {copy}")
    print(f"       expected {json.loads(lines[n])['h'][:12]}…")
    print(f"       found    {hashlib.sha256(body.encode()).hexdigest()[:12]}…")
    return 0 if verify(copy) == 1 else 1


def run_dir(args):
    if args:
        return Path(args[0])
    runs = sorted((project_root() / ".relay" / "runs").glob("*/ledger.jsonl"), key=lambda p: p.stat().st_mtime)
    if not runs:
        sys.exit("relay: no runs under .relay/runs. Run a gated graph first, or pass a run folder.")
    return runs[-1].parent


if __name__ == "__main__":
    sys.exit(main())
