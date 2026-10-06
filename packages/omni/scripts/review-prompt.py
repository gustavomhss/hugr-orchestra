#!/usr/bin/env python3
"""Print the Codex review prompt for one work package (PLAN.md Appendix D).

Usage: scripts/review-prompt.py <WP> <baseline> <head> [notes-file]

The card and the global invariants are read from PLAN.md at call time, so the reviewer always judges against the
current axioms. Fails loudly if the card or the global sections are missing.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent


def section(text: str, pattern: str, what: str) -> str:
    m = re.search(pattern, text, re.S | re.M)
    if not m:
        sys.exit(f"review-prompt: {what} not found in PLAN.md")
    return m.group(0).strip()


def main() -> None:
    if len(sys.argv) not in (4, 5):
        sys.exit(__doc__)
    wp, base, head = sys.argv[1:4]
    notes = pathlib.Path(sys.argv[4]).read_text() if len(sys.argv) == 5 else ""
    plan = (ROOT / "PLAN.md").read_text()
    card = section(plan, rf"^#### {re.escape(wp)} · .*?(?=^#### |^### |\Z)", f"card {wp}")
    glob = section(plan, r"^### 4\.3 .*?(?=^### 4\.5 )", "sections 4.3-4.4")
    print(f"""ROLE: independent, adversarial reviewer for hugr-omni. You did not write this change; assume it is wrong
until the diff and its evidence prove otherwise.
SCOPE: `git diff {base}...{head}` in this worktree (work package {wp}). Read-only commands only. You may run cargo
check/clippy/test if your sandbox allows (if it cannot lock target/, say so and do not count it as a failure; the lead
reproduces gates cold). Context: AGENTS.md, docs/api-contract.md, docs/adr/0005-supervisor.md, docs/protocol.md.
THE CARD (the axioms this work is judged against, verbatim):
{card}
GLOBAL INVARIANTS / QUALITY (PLAN.md 4.3 and 4.4, verbatim):
{glob}
{notes}
FOR EACH CARD FIELD return pass|fail with concrete evidence (file:line or command output):
  completude  — every owned item is implemented and its scenario/test genuinely exercises it
  sucesso     — the user-visible outcome the card promises is actually delivered
  invariantes — every card invariant and global INV holds, including on error paths
  qualidade   — card quality bar + QS; flag over-engineering, tests without value, any code file > 600 lines
                (P2: needs a split plan; > 650 is P0) and any import that points up the module layering
  dod         — every DoD bullet of the card is satisfied or demonstrably satisfiable
Then list findings. SEVERITY: P0 wrong behavior/security/data loss/invariant broken/contract test edited;
P1 vacuous test, flaky, UX or message regression, wrong docs, contract deviation; P2 clarity/over-engineering; P3 nit.
Never invent filler: empty findings are fine.""")


if __name__ == "__main__":
    main()
