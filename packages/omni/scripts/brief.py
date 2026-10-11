#!/usr/bin/env python3
"""Print the dispatch brief for one work package (PLAN.md Appendix C).

Usage: scripts/brief.py <WP> <baseline> [notes-file]

The card and the owned acceptance rows are read from PLAN.md and docs/acceptance.md at call time, so the agent always
gets the current axioms. Fails loudly if the card is missing.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent


def main() -> None:
    if len(sys.argv) not in (3, 4):
        sys.exit(__doc__)
    wp, base = sys.argv[1], sys.argv[2]
    notes = pathlib.Path(sys.argv[3]).read_text() if len(sys.argv) == 4 else ""
    plan = (ROOT / "PLAN.md").read_text()
    m = re.search(rf"^#### {re.escape(wp)} · .*?(?=^#### |^### |\Z)", plan, re.S | re.M)
    if not m:
        sys.exit(f"brief: card {wp} not found in PLAN.md")
    card = m.group(0).strip()
    acc = (ROOT / "docs/acceptance.md").read_text()
    items = [l for l in acc.splitlines() if l.startswith("| ") and re.search(rf"\| {re.escape(wp)}( |/|$)", l + " ")]
    title = card.splitlines()[0].split(" · ", 1)[1]
    print(f"""WP {wp} — {title}
STEP 0  In your worktree run `git fetch -q origin && git switch -c wp/{wp} {base}` FIRST (worktrees may start elsewhere),
        then `git merge-base --is-ancestor {base} HEAD` (abort if it fails). Echo BASELINE_VERIFIED {base}.
COMMIT  locally on wp/{wp}, early and often. Do not push and do not run Docker: the lead pushes, runs the Linux
        cold gate and starts the Windows CI. Never switch the active gh account or change any global git/gh config.
READ    AGENTS.md (binding) · your card below · docs/api-contract.md · docs/adr/0005-supervisor.md · docs/protocol.md ·
        conformance/SPEC.md · conformance/FIXTURE.md · GUARANTEES.md · the seam files you call or implement.
CARD    (the axioms an independent Codex review judges you against, field by field):
{card}

ITEMS   (docs/acceptance.md rows you own):
""" + ("\n".join(items) if items else "(none beyond the card's Completude)") + f"""

{notes}
RULES   AGENTS.md is binding. SEAM items keep their names, signatures and docs; bodies and private items are yours.
        Over-engineering is a defect: no abstraction without a second real use, no option outside the contract,
        no test without value. Every test asserts; a timeout or an incomplete observation is a failure.
TRAPS   never `git add -A`; stage by name; `git diff --name-only {base}...HEAD` before each push shows only your write-set;
        a needed dependency, windows-sys feature or seam change = stop and report it in ERREI NO BRIEF?;
        never open a PR or merge. Disk is limited: delete your worktree's target/ and Docker volumes when you stop.
GATES   python3 scripts/file-size-guard.py · cargo fmt --all -- --check · cargo clippy --workspace --all-targets -- -D warnings ·
        cargo clippy --workspace --all-targets --target x86_64-pc-windows-msvc -- -D warnings ·
        cargo build --workspace --bins && cargo test --workspace --no-fail-fast (macOS)
STOP    at "branch wp/{wp} committed locally, green on macOS, waiting for the lead".
RETURN  (exactly this):
  WP {wp} · branch wp/{wp} · head <sha> · worktree <path> · BASELINE_VERIFIED <sha>
  ITEMS    <id> green [macos|linux|win-compile|win-runtime] ... (or what is red and why)
  GATES    <cmd> → <last line>
  PROBES   <the mutations you ran and which test went red>
  ARQUIVOS <list>
  ERREI NO BRIEF? <1–3 lines: anything in the brief, card or seams that was wrong or missing>""")


if __name__ == "__main__":
    main()
