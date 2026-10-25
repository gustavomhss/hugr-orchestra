# Projects board

Orchestra's project board. Maestro alone maintains it; the human watches, answers, comments, attaches context to a card,
undoes Maestro's actions and pauses work. Every status is backed by proof (PR, CI, guardrails), and every machine change
shows its reason and can be undone.

| File | What it holds |
|---|---|
| `PLAN.md` | Gaps found before code, slices A-F, how it is built, what is out of v1, owner decisions |
| `CONTRACT.md` | Frozen data model, Maestro tools, HTTP API, GitHub Issues mirror, code layout, tests |
| `JOURNEYS.md` | Every user journey (J1-J33, X1-X6) with happy, edge and failure stories and the coverage matrix |
| `MOCKS.md` | Approved mocks and the canonical data every screen shows |
| `mocks/` | Contact sheets of the approved mocks, dark and light |

Status: mocks, journeys and plan approved by the owner on 2026-10-25. First cut is slices A, B, B2, C and D.
