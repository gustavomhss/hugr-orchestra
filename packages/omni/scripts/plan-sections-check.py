#!/usr/bin/env python3
"""PLAN-01: every WP card in PLAN.md must carry all required sections.

Fails loudly if it finds zero cards (a check that reads nothing must not pass).
"""
import re
import sys

REQUIRED = ["Completude", "Sucesso", "Invariantes", "Qualidade", "DoD"]
WHO = re.compile(r"\*\*(Agente|Quem):\*\*")

text = open(sys.argv[1] if len(sys.argv) > 1 else "PLAN.md", encoding="utf-8").read()
cards = re.split(r"^#### ", text, flags=re.M)[1:]
if not cards:
    sys.exit("plan-sections-check: found 0 WP cards — refusing to pass vacuously")

failures = []
for card in cards:
    title = card.splitlines()[0].strip()
    body = card.split("\n### ")[0]
    missing = [s for s in REQUIRED if f"**{s}" not in body]
    if not WHO.search(body):
        missing.append("Agente/Quem")
    if missing:
        failures.append(f"{title}: missing {', '.join(missing)}")

# The sandbox table rows are WPs too: each row must point to its card section.
print(f"checked {len(cards)} WP cards")
if failures:
    print("\n".join(failures))
    sys.exit(1)
print("PLAN-01 OK")
