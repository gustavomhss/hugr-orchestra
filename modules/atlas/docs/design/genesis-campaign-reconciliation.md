# Genesis campaign — reconciliation, not closure

Status: **OPEN**. The bounded pilot is accepted; the wider campaign is not declared complete.
Owner decision after this reconciliation: **“Manter contrato global”**. No limited-phase closure or
transfer of remaining obligations was approved. The [remaining-work plan](genesis-global-completion-plan.md)
keeps the global acceptance register intact and separates preparation from execution authorization.
This is a current disposition map, not a replacement for the hash-pinned historical worklist.
No PR creation/update, merge, production activation, new mining, model request or CI dispatch follows
from this report.

## Scope and stopping rule

Reconcile existing evidence against the frozen contracts before requesting more execution. Preserve
original requests, responses, judgments and failures. Separate verified controls, research acceptance,
isolated publication, consumer acceptance, production delivery and inherited obligations.

The [landing gate](genesis-landing-plan.md) remains closed. A missing historical observation stays
unknown; an unexecuted obligation stays open unless the owner explicitly changes its scope. Do not
restart the retired per-file mining queue to make its old checklist green.

## Historical continuation: concrete evidence now reconciled

Run [42087075694](https://github.com/gustavomhss/hugr-orchestra/actions/runs/42087075694), head
`c9b8e54cbf2c6c2c4bb59bbda2dc878430a54085`, is a successful **offline control**, not a completed
production continuation. Its artifact `13444687733`, `atlas-genesis-continuation-control`, was
downloaded and its ZIP digest independently verified:
`sha256:9df9f969d7f798e3fd9a4665d062da5293ac2aa77bbc1249bffdca41734860da`.

The lead checked actual archive records rather than relying on `verified.json` alone:

- Each of 200 control dispatches has one matching completion, with identical request, prompt identity,
  arm and origin. The population is 103 replay, one synthetic retry and 96 synthetic fresh deliveries.
- Each replay matches the original response object's SHA-256, decoded stdout/stderr hashes and exit
  status. The replay index contains 104 original requests: 103 with responses and one unresolved.
- The retry is a **new request** linked to original unresolved request
  `be07949d-5cdc-48f1-9309-bddd4b32cd2b` and its exact prompt hash. It does not settle that original.
- The 97 fake-provider calls match only retry/fresh dispatches. They are not real subscription calls.
- Original staging, both original-plan archive copies and the complete 365-file original CAS inventory
  match the frozen source receipt; reconstructed claims retain their original evidence and CAS bytes.
- The compiled report records 200 visited sites and the same 200-site allowance, not 200 additional
  provider requests after replay. Actual positive-route and isolated-route observations are retained.
- Exact job/step records and the original job log confirm the transport control, compiled control and
  runner audit executed. The log contains the configuration, proof-head and cached-command mutation
  rejection results; this reconciliation did not rerun them.

Repository receipts under `genesis-campaign-results/continuation-42087075694/`:
`independent-artifact-reconciliation-v1.json`, `source-and-execution-map-v1.json`, `run-metadata.json`
and `archive-manifest-v1.json`. Raw ZIP/log evidence remains outside Git; the manifest binds its digests.

**Limits:** this archive does not contain the complete original envelope chain; its source receipt remains
the prior chain trust anchor. A single advisory-arm control does not execute the subsequent production
arms. Selected verified assertions do not close every acceptance layer in the
[continuation contract](genesis-continuation-contract.md). The artifact explicitly says
`productionContinuationVerified: false`. Actual continuation, semantic judgment, publication, billing
settlement and the final historical Own patch are not established by this run.

## Campaign disposition register

| Obligation | Current deciding evidence | Disposition / next action |
| --- | --- | --- |
| Original recovery and source preservation | Frozen source receipt at the exact historical head; artifact comparisons above | Preserved for the checked original staging/CAS/response surfaces. Do not generalize to an uninspected complete chain. |
| Offline continuation mechanics | Exact artifact, source comparisons, successful steps and named rejecting controls | Checked assertions reconciled. Not production continuation; do not automatically mark historical C3 fully CLOSED. |
| Original remaining arm budgets (historical M1) | Owner's layered-product correction and explicit ban on automatically resuming old mining | Retired execution route, not completed mining. An explicit disposition of the old completion obligation is still required; no restart. |
| Original binding judgment/publication/Own patch (historical J1/R3) | Historical contract requires these after mining; isolated v3 publication has a different scope | OPEN. Do not silently substitute the pilot manifest for the original campaign result. Need an explicit supersession/retention decision before planning further work. |
| Layered L1–L4 and preferred operational L4 | Preserved accepted manifests and complementary judge decisions | Accepted research for the finite Session-input slice, not repository-wide understanding. Reuse without new mining. |
| Bounded runtime and consumer pilot RP-1..8 | [Validation closeout](genesis-ownership-closeout.md), actual isolated manifest, real reader traces and composed CI | Accepted within that contract. Original consumer HOLDs remain unchanged. Not production installation or global-plan acceptance. |
| Global ownership AC-01..10, CC/SC/DoD | [Global transition plan](genesis-ownership-plan.md) defines a wider bar than RP-1..8 | OPEN as a whole. Do not translate the pilot's PASS into global PASS. Any unfulfilled production/economy/update/recovery obligations need evidence or an explicit contract amendment. |
| Original physical provider attempts and billing | Original request/response receipts; reported session usage with explicit settlement warnings | UNKNOWN, not zero. Local session fields and prompt bytes cannot reconstruct provider-side physical attempts or settled charges. No new calls to repair historical observability. |
| Original unresolved request | Exact original request remains in the source receipt and recovery index without completion | Remains unresolved in the immutable original chain. A synthetic control retry does not resolve it. |
| Hotspot correction and owner-author suggestions | Historical real-git/mutation receipts; read-only current PR records | #1300 and #1302 remain OPEN. Preserve their corrected integration candidates; their historical disposition is after landing, not permission to edit either PR now. |
| Existing recovery PR | #1291 remains the older delivery vehicle, distinct from snapshot/report branches | No update until campaign closure. Final packet/base strategy remains unfrozen. |
| Resources and cleanup | Temporary campaign evidence is still needed for reconciliation and resumability | Preserve it. Do not infer ownership of unrelated worktrees, processes or branches; final scoped cleanup is a delivery obligation, not completed here. |

## Accounting boundary

Original source accounting is 295 envelopes, 104 requests, 103 responses and one unresolved request.
Historical 272-claim/91-place totals remain historical staging totals, not judged or published ownership.
The control's 200 deliveries include replay and synthetic replies; they must not be added to real model
usage as 200 new paid requests.

Later producer usage reports explicitly qualify reported tokens/cost as unverified session fields.
For example, `layer-4-sol/L4-sol-reported-usage.json` already deduplicates cumulative producer sessions
and warns that the operational session includes initial/remedy turns. Persistent judges are cumulative
across rounds. Summing every archived cumulative receipt would double-count; a reported cost of zero
does not prove free inference or settled billing. Those warnings remain unchanged.

The bounded local logical-dispatch scan is now recorded in
`genesis-campaign-results/accounting-inventory-summary-v1.json`: 120 metadata records, 114 paired
result files, and six original records classified against retained recovery snapshots (four incomplete
assistants and two explicit HTTP 429 refusals). This is not the whole campaign or physical-attempt count.
Do not erase interrupted originals because replacement jobs later succeeded. AC-08 permits explicit
unsettled reporting; it does not permit a retrospective budget guarantee or zero-cost fiction.

## Scope decision — global contract retained

Two materially different scopes were presented for the owner's decision:

1. Continue toward the wider global production contract. First freeze the remaining concrete work and
   the missing economic/production evidence; do not revive old mining or spend without authorization.
2. Close this bounded research/runtime-pilot campaign with an explicit amendment: preserve the original
   unresolved request and unknown physical usage as limitations, retire the old mining/publication/Own
   obligations by name, and move wider production/global obligations to a separately authorized phase.

The owner selected option 1: **“Manter contrato global”**. Option 2 remains an unapproved alternative,
not a fallback or a later automatic closure. No criterion is waived, no old mining is restarted and
no new spend is authorized. Preparation continues against the full contract; PRs remain blocked.
