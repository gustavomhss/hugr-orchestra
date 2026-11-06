# Final integrated gate — bounded repair contract

Status: scoped Atlas repair and technical review accepted; exact-pin core CI pending, not pilot closure.
Run: `42142588323`, snapshot `de04672226f005dc453bd796859bb20fb946f751`.
Consumer v3's five semantic PASSes remain separate from this red runtime/repository gate.

## Collected failures and scope

- Linux core and Windows core 5/8 fail the same rename guard. Historical prompt paths name retired
  external-provider slots; the next assertion also rejects real external CLI paths/provider identifiers
  in byte-preserved research records. Do not rewrite accepted bodies/receipts to satisfy branding.
  Add a **declared, narrowly bounded archive/contract exception**, not a product-copy exemption. Test
  adjacent paths and runtime copy to prove the exception cannot cover them. No blanket docs exclusion.
- Atlas's product suite reports five failures across four files: default union label, the added metrics
  line's position, settled per-claim CAS refs replacing old anchor-valued site facts, and a stale embedded
  proposal template versus the actual shipped multi-fact Markdown template. Source history records the
  earlier multi-fact/staging-identity changes; this is not a consumer-oracle failure.
- Align black-box assertions with the current explicit wire contract while preserving their original
  guarantees: exact per-arm exposure, exact metrics/why ordering, site kind/order/reachability and actual
  stored grounding. Resolve printed CAS refs to on-disk facts and verify grounding, rather than dropping
  the assertions or accepting any hash. Isolate each frontier test's fixture from prior staging writes.
- Copy the authoritative shipped template bytes into its embedded representation, as its existing
  byte-parity test requires. Regenerate affected Atlas bundles remotely. No new prompt design or model run.

## Gate and stop

One grouped scoped Atlas lane covers the failed tests, existing ownership regressions, mutation probes
and remote bundle generation. Targeted core rename tests run on Linux and Windows through `test:ci`.
The same Terra 1 reviews only the repository-gate exception/repair delta; no duplicate Terra 2 semantic
audit or consumer rerun. Full integrated CI is rearmed once after all scoped repairs close, not per fix.
Any remaining failure is named and preserved; no skip, global allowlist, weakened grounding check,
production restart, force push or merge on red is authorized. Historical exact evidence and consumer
task/rubric/protocol/body hashes remain unchanged.

## Scoped repair checkpoint

The original recursive archive exception was rejected and replaced with an enumerated path/SHA-256
inventory. Only exact historical bytes receive that exception; unknown paths and changed bytes do not.
The canonical recovery worklist is itself frozen at this checkpoint. Later status is recorded separately,
not silently written into a pinned record. This is a **declared exception**, not a stronger branding rule.

Scoped Atlas run [42146218143](https://github.com/gustavomhss/hugr-orchestra/actions/runs/42146218143)
at `7b3230ee50e04443201419298f2677e049dd078c` passed all 80 tests. Four named mutation reports reject
the missing need-root check, missing current-input check, composed fast-path bypass and compiled worker
`initAst` removal. The lead reconciled reports, source bytes and generated outputs; `mine.js` was the only
new generated delta. This run does not cover the subsequently introduced exact-pin core implementation.

The same Terra 1 approved the exact-pin boundary and corrected workflow evidence in its second review.
Its original FIX-FIRST remains unchanged: the lead had incorrectly shown an untracked workflow as deleted
using a working-tree diff. The actual commit-to-commit diff retains the lane and its named controls.
Exact decisions, reports and the corrected diff are under
[`runtime-pilot/final-validation/repair-1`](genesis-ownership-results/runtime-pilot/final-validation/repair-1/).
Linux/Windows `test:ci` for the exact-pin version must pass before the follow-up integrated dispatch.

The repository hygiene gate then rejected three duplicate raw `.log` files copied into the evidence
directory. Their external campaign originals and exact hashes are preserved; only the in-tree copies
and their three exceptions were removed. No remaining hash changed and no exception was added.
`repair-1/pin-shrink-v1.json` records this monotone shrink from 65 to 62 pins. The in-flight 65-pin
focused run is historical evidence only; the final 62-pin version needs its own focused result.

The 65-pin run `42147454288` passed Linux but rejected mismatched file bytes on Windows. Checkout text
attributes were unspecified for this evidence. `.gitattributes` now disables text conversion for the
bounded historical records/contracts, following the existing recorded-output pattern; the hashes are
not normalized or regenerated. A new assertion asks real Git for every pin's `text` attribute and requires
`unset`, in addition to actual byte checks and corrupt-byte/unknown-path controls. The final focused run
includes that assertion and the 62-pin shrink. The failed run and correction remain separately recorded.

Run `42148118002` then passed the byte checks on both platforms but failed only the new attribute
probe's cardinality assertion. With Git's `-z`, stdin also requires NUL delimiters; the probe supplied
newlines and Git interpreted one pathname. The corrected probe uses NUL on both sides and retains
the complete per-pin cardinality/attribute checks. `repair-1/attribute-probe-correction-v1.json` preserves
that failed run and diagnosis. No integrated dispatch is permitted from either partial focused result.
