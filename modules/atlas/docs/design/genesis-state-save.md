# State save — 2026-11-09 (F1 decided, red baseline next)

## Status
- **F0 CLOSED**: G2.1 order-fix disposition = **PASS** on `2b3657c6` by GPT-6 Astra via browser (owner-ordered judge route). Original FIX-FIRST on `613afdcd` preserved unchanged. CE1/CE2/CE5 recorded as non-blocking follow-ups.
- **F1 DESIGN DECIDED** by Astra: `genesis-g2.2-contract.md` — tri-state host observer (present/absent/unavailable; members:v2 effective-presence versioning), incremental rebuild executor (private candidate; sequential plan.affected order; zero-call reuse; receipt renewal; result-identity stop on full result), red baseline FIRST (12 HO + 20 RB + 5 TC named tests + 13 mutation controls), TOCTOU boundaries. Implementation NOT started.
- Genesis pre-campaign NOT closed (F1 implementation → F5 remain).

## Remote (Astra reads only this)
- `snapshot-genesis-20261109` — current full state incl. astra fix-delta PASS + provenance, copilot second-read, Astra G2.2 decision + frozen contract.
- `pilot-check-1793959002` @ `2b3657c6be5f082f1b68da4b668ea594ba70edfa` (G2.1 corrected head, green 42203545291, 104 assertions, 9 mutations).
- `pilot-close-1793933412` @ `d46ac693e3b1a87d58b02b02949bcf5ce848885a` (pilot RP-1..8).

## Roles (owner-settled)
- Astra (browser) decides/reasons/judges. Lead = Astra's arms (implement, verify, register, publish snapshots for Astra to read). Astra cannot touch the machine; I cannot (per protocol) adopt un-cold-checked claims.

## Next (loop F1 → F5, no PRs until closure)
1. F1 red baseline: typed seam stubs (ownership-observe + ownership-rebuild) + HO/RB/TC named failing tests + fixture; CI red run; then observer + executor; CI green + 13 mutations; Astra disposition.
2. F2 G1: reservation/settlement/concurrency + synthetic-provider suite at executor seam.
3. F3 G3/G4: activation/recovery/migration (CAS + commitProjection; rollback refusal; old-producer refusal).
4. F4: AC-03 matrix (G0) + G5 semantic/economic closure.
5. F5: G6 verdict map + delivery freeze. No PRs until then.

## Blocked previously, now resolved
- Judge checkpoint deleted from /tmp → rebuilt in-repo. Terra-1 session not resumable + subscription usage limit → owner redirected judging to Astra via browser.
- Browser logged in (ChatGPT, 6 Pro) — verified active, composer functional.

## Load next
Files: genesis-g2.2-contract.md, genesis-closeout-plan.md, genesis-update-plan-contract.md, genesis-global-completion-plan.md, genesis-campaign-results/update-plan-implementation-v1/astra-g2.2.decision.json + astra-fix-delta.decision.json + fix-delta-disposition-provenance.json (modules/atlas/docs/design/).
