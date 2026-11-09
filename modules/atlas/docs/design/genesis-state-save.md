# State save — 2026-11-09 (F1 FIX-FIRST corrigido, re-disposição pendente)

## Status
- **F0 CLOSED**: G2.1 order-fix disposition = **PASS** on `2b3657c6` by GPT-6 Astra via browser (owner-ordered judge route). Original FIX-FIRST on `613afdcd` preserved unchanged. CE1/CE2/CE5 recorded as non-blocking follow-ups.
- **F1 DESIGN DECIDED** by Astra: `genesis-g2.2-contract.md` (tri-state observer, members:v2, incremental executor, 12 HO + 20 RB + 5 TC, 13 mutations, TOCTOU).
- **F1 IMPLEMENTATION FIX-FIRST** by Astra on `79621880`/`c334174bfb`: 14 blocking counterexamples (CE-1..CE-14) — corroborated absent, limited reads, post-read recheck, fatal UTF-8, per-candidate policy, legacy delegation, deep capture copies, exact required edges, mandatory vs dynamic, captured membership, per-recipe preflight, new-chain validation, evaluation seam, fixture dep filtering. Original verdict preserved in `astra-f1-implementation.decision.json`.
- **F1 SECOND FIX-FIRST** by Astra on `bb1cfcb8`/`3d4966bb82`: 11/14 CE closed (CE-2/4/5/6/7/9/10/11/12/13/14 CONFERE), residues **R-1** (absent corroboration ignores listing → fix: listing membership check), **R-2/R-3** (uncaught `before` lstat; size drift ignored), **R-4** (duplicate `required` masks omission), **R-5** (bytes not transported), **R-6** (review validation after propagation). All cold-checked; verdict excerpt + table in browser record.
- **F1 SECOND CORRECTION GREEN**: R-1..R-6 implemented (listing corroboration, total lstat, size check, set equality, `bytes`/`lists` transport (+ read-live-bytes probe), per-node validation); suite 141/141; probes 22/22 incl. 13 G2.2; guards 0; CI `42678761964` @ `cbd4fdb`. **Astra re-disposition PENDING.**
- Genesis pre-campaign NOT closed (F2 → F5 remain). No PRs until closure.

## Remote (Astra reads only this)
- `snapshot-genesis-20261109` — current full state incl. F1 FIX-FIRST decision + correction evidence.
- `pilot-check-1794249355` @ `3d4966bb82` (corrected green head).
- `pilot-check-1794248907` @ `196485205b` (correction, guards 2-warn era), `pilot-check-1794246639` @ `c334174bfb` (pre-FIX-FIRST green), `pilot-check-1794245394` @ `97e2948c` (red 42665206017).
- Pre-rebase backup `genesis-run-fix-pre-rebase-20261109-141714` @ `d58cb720fa` (byte-identical tree `af5dd2ec`).

## Roles (owner-settled)
- Astra (browser) decides/reasons/judges. Lead = Astra's arms (implement, verify, register, publish snapshots for Astra to read). Astra cannot touch the machine; I cannot (per protocol) adopt un-cold-checked claims.

## Next (loop F1 → F5, no PRs until closure)
1. Astra re-disposition on corrected F1 (@ `3d4966bb82`, green 42675429793); then close F1.
2. F2 G1: reservation/settlement/concurrency + synthetic-provider suite at executor seam.
3. F3 G3/G4: activation/recovery/migration (CAS + commitProjection; rollback refusal; old-producer refusal).
4. F4: AC-03 matrix (G0) + G5 semantic/economic closure.
5. F5: G6 verdict map + delivery freeze. No PRs until then.

## Blocked previously, now resolved
- Judge checkpoint deleted from /tmp → rebuilt in-repo. Terra-1 session not resumable + subscription usage limit → owner redirected judging to Astra via browser.
- Browser logged in (ChatGPT, 6 Pro) — verified active, composer functional.

## Load next
Files: genesis-g2.2-contract.md, genesis-closeout-plan.md, genesis-update-plan-contract.md, genesis-global-completion-plan.md, genesis-campaign-results/update-plan-implementation-v1/g2.2-green-v1.json + astra-f1-implementation.decision.json + astra-g2.2.decision.json + fix-delta-disposition-provenance.json (modules/atlas/docs/design/).
