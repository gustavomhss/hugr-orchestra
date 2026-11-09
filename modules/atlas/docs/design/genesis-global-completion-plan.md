# Genesis — remaining work under the retained global contract

Status: **PREPARATION IN PROGRESS; NOT A DISPATCH OR SPEND AUTHORIZATION**.
Owner selected **“Manter contrato global”**. The alternative bounded-phase closure is not approved.
Normative acceptance remains [AC-01..10, CC/SC and DoD](genesis-ownership-plan.md).
Historical obligations remain in the immutable [recovery worklist](genesis-recovery-worklist.md).
Current evidence/dispositions: [campaign reconciliation](genesis-campaign-reconciliation.md).

## Baseline and execution boundary

Validated source is `b340faa8e616bfc49502f8d4c26979e6ababb867`; report-only checkpoint is
`d46ac693e3b1a87d58b02b02949bcf5ce848885a`. Subsequent reconciliation/landing files are local
reporting work, not a new runtime candidate. Freeze an exact source tree before implementation.

Work sequentially during preparation: the update recipe, admission ledger and activation path have
unfrozen integration seams. Do not delegate their design or dispatch agents against this table.
Use only existing receipts and bounded source inspection now. Any future interpretation/evaluation
request must reuse the same persistent judges and their complementary roles within a separately
approved shared envelope. No automatic retries, extra judge sessions or paid consumer repetition.

## What inspected code proves — and does not prove

| Global row | Reusable evidence inspected | Remaining proof; not an inferred failure or PASS |
| --- | --- | --- |
| AC-01 finite coverage | Accepted layer manifests, slice inventory and v3 binding reviews | Map every global required need/critical gap to exact accepted artifacts and cases; the RP register is not a substitute for this map. |
| AC-02 ownership | Same Terra 2's v3 case decisions and actual Atlas-only read traces | Map permitted change, violation, cross-component impact, operational failure and out-of-scope abstention to the global frozen oracle. Reuse matching cases; request new evaluation only for an actual uncovered criterion. |
| AC-03 consumption | Real `ownership.index/read`, byte limits, returned sections and v3 consultation traces | Close direct-use cases for required intermediate artifacts and task-specific read/context limits, not only top-layer navigation. |
| AC-04 construction | Actual layered producer outputs, original errors/errata and exact importer | Bind stale/conflicting/missing/malicious inputs to actual construction/publication refusal cases; fixture document existence is not a producer execution. |
| AC-05 reuse | `ownership-update.test.ts`: renewed result preserves downstream identity; changed meaning/authority requires rebinding | Real recipe/cache execution with counted zero interpretation calls and durable receipts; synthetic receipt construction alone does not establish a production cache hit. |
| AC-06 incrementality | `ownership-input.test.ts` detects file, recipe and membership drift; update tests hold stale reads | Affected-set selection plus completed rebuild for edit/add/remove, intent-doc and recipe changes, against an independent expected set. A staleness detector is only the first half. |
| AC-07 recovery | Governed publication, re-opened disk store, rejected changed dependency candidate, labelled historical reads | Failure between generation/activation, interruption/resume with reusable durable work, separate concurrent readers and source-compatible rollback. Reuse existing atomic store primitives before adding mechanisms. |
| AC-08 economy | Immutable dispatch metadata, reported cumulative session usage, explicit unknown attempts; command adapter documents unenforceable `costCap` | Shared reservation/enforcement across producer/evaluator/retry, physical-attempt visibility at the actual adapter, unresolved reservations and a separately approved execution envelope. A configured decimal/call cap is not a currency guarantee. |
| AC-09 Git/CI/host | Real host input oracle and scoped validity refusals; Atlas/core guards and composed integrated coverage | Demonstrate the intended edit/add/remove/artifact/index/version failures at actual integration entry points; report branch enforcement separately. Existing CI cannot be assumed to call a new updater. |
| AC-10 migration | Exact producer-byte pins, declared derivatives, governed attachment, isolated old/new publications | Migration/rollback compatibility, accidental old-producer publication refusal and full protected-object inventory at the eventual target. Do not activate owner production state during preparation. |

Deciding source locations inspected for this map:
`modules/atlas/scripts/ownership-pilot.ts`,
`modules/atlas/packages/adapter-io/src/ownership-input.ts`,
`modules/atlas/packages/adapter-io/src/store.ts`,
`modules/atlas/packages/adapter-io/src/llm.ts`,
`modules/atlas/packages/adapter-io/test/ownership-{input,publication,update}.test.ts`, and
`modules/atlas/packages/knowledge/test/ownership-read.test.ts`.
These are source/evidence inspections, not new test executions. The bounded importer has explicit
`prepare`, `publish`, `read`, `index` modes; do not describe those as an executed incremental rebuild loop.

### Existing semantic cases: reuse without rewriting verdicts

- E1/E2 calibration in `runtime-pilot/terra-2-closure-v4.decision.json` supplies accepted permitted-change
  and contract/impact reasoning for its exact earlier candidate. Preserve that binding; compare the
  actual consulted artifact identities before proposing reuse for a later generation.
- V2 R1/R3 and N1/N3 individually passed, although the v2 batch remains HOLD. R3 supplies the explicit
  out-of-scope contract handoff; N1 supplies a focused maintenance/impact question. The original v1
  H1/H2/H3 judgments remain HOLD. No individual PASS upgrades either complete older batch.
- V3 T1/T2 and U1/U2 cover operational diagnosis, evidence/cursor boundaries and provider uncertainty;
  U3 covers a queue-selector contract change. Their exact-candidate Terra 2 decision is PASS.
- E1/E2 and passing v2 cases are reuse candidates only after checking the required unchanged inputs,
  bodies, consultation route and rubric. V3 acceptance does not retrospectively rebind them. All exposed
  cases remain exposed; new independent cases cannot be manufactured by renaming old ones.
- The no-model comparison `genesis-campaign-results/consumer-reuse-comparison-v1.json` now records
  that all actual consulted result identities in E1/E2/R1/R3/N1/N3 match the accepted v3 candidate.
  Original manifest identities and trace digests remain in the comparison. This closes the result-identity
  comparison only, not protocol/input compatibility or a new global semantic judgment.
- AC-03 still requires direct usefulness of each required intermediate artifact, not just the L2/L3
  bodies incidentally consulted in these tasks. Prepare that finite coverage matrix before deciding
  whether any additional semantic evaluation is actually needed.

### Completeness, success and DoD coverage — no implicit global PASS

| Row | Reusable support / remaining obligation | Current disposition |
| --- | --- | --- |
| CC-1 | Frozen slice inputs/manifests; complete AC-01/04 need/gap map at G0 | Bounded support; global mapping open |
| CC-2 | Persisted L1–L4 and actual readers; direct intermediate-use coverage at G0/G5 | Partial |
| CC-3 | Existing accepted semantic cases, with exact-version reuse checks above | Partial; no new semantic verdict |
| CC-4 | Staleness/receipt-renewal controls; affected-set and completed rebuild at G2 | Open beyond pilot |
| CC-5 | Existing governed door/disk reader; interruption, concurrent observation and rollback at G3/G4 | Partial |
| CC-6 | Classified historical metadata; shared economic execution contract and actual reconciliation at G1/G5 | Open |
| CC-7 | Preserved generated surfaces/receipts; migration, historical obligations and delivery/resource dispositions at G4/G6 | Open |
| SC-1 | Reuse matching accepted AC-02 cases; do not infer complete global ownership from RP-7 | Partial |
| SC-2 | Existing bounded read traces; complete all required intermediate and shallow/deep direct-use cases | Partial |
| SC-3 | Existing result identity controls; run actual recipe affected-set/rebuild/cache proof at G2 | Open beyond pilot |
| SC-4 | Report construction/evaluation/update/read economics separately, unknowns included; no fictitious savings baseline | Open |
| SC-5 | Existing closure validation plus remaining generation/recovery/host controls at G3/G4 | Partial |
| DOD-1 | This explicit map keeps missing evidence named; underlying CC/SC rows must actually close | Open |
| DOD-2 | Existing bounded reviews/mutants; review only new global deltas/invariants and corresponding rejecting controls | Partial |
| DOD-3 | Actual isolated consumers exist; end-to-end global update/publication/recovery remains G2/G3/G5 | Open |
| DOD-4 | Reconciled composed CI for the old validated candidate; future runtime changes need their own scoped verification and final coverage decision | Prior evidence only |
| DOD-5 | Classify old requests honestly; enforce and reconcile the approved future envelope, including unresolved reservations | Open |
| DOD-6 | Preserve guides/reviews/evidence; complete migration, rollback, historical dispositions and owned-resource cleanup at G4/G6 | Open |
| DOD-7 | Pilot acceptance is not owner global acceptance or governed delivery | Open |

## Work packages and acceptance boundaries

These are **planning packages**, not frozen implementation contracts. Each implementation package
must first get exact interfaces/owned files, a failing acceptance suite and a change-scoped CI plan.
No guessed line budget or passing baseline is asserted here.

| WP | Concrete deliverables / stop condition | Dependencies |
| --- | --- | --- |
| G0 — acceptance/evidence map | Every AC/CC/SC/DoD row points to an exact reusable receipt, a specific missing test or a named authorization blocker. Evaluate v3 case coverage without dispatching consumers. Stop when no global row is silently replaced by RP-1..8. | Existing corpus/receipts |
| G1 — accounting reconciliation and execution contract | Deduplicated logical-request inventory, original-chain accounting, classified missing results, physical-attempt/usage qualifications and a frozen reservation/settlement/refusal contract at the existing execution seam. Unknown prior use is not zero or retroactively bounded. Stop before real conformance/spend. | G0 |
| G2 — affected-set and reusable rebuild | Independently expected affected sets for edit/add/remove, intent-doc and recipe changes; deterministic cache/revalidation and dependency-result propagation; zero-call reuse and unrelated-scope preservation observed at the actual recipe. Unknown input/impact holds. Omitted input/edge mutants must fail. | G0; G1 before any real model work |
| G3 — durable activation/recovery | Use existing CAS and `commitProjection`; completed candidate selection, before/after interruption controls, separate concurrent reader, resume without repeated completed work, incompatible rollback refusal and explicit historical reads. No direct projection publication or second trust/store system. | G2; accepted governance shapes |
| G4 — host/CI/migration fit | Exact current input additions/removals and dependency/artifact/index failures tested through intended caller/gates; explicit old-producer migration refusal; documentation and rollback/activation recipe. Any new guard needs its own rejecting controls. No live install. | G2+G3 |
| G5 — integrated semantic/economic closure | Reuse accepted v3 outputs/cases wherever their criteria match G0. Only uncovered judged criteria receive a separately authorized bounded evaluation. Reconcile actual shared envelope and unresolved reservations, exact source, change-scoped gates and remaining integrated coverage. No automatic second full epic merely for reports. | G0..G4; actual authorization for real calls |
| G6 — global closure and delivery | Explicit AC/CC/SC/DoD decisions plus historical publication/Own-patch/PR/resource dispositions. Distinguish campaign closure from later landing; only then freeze packet/base/pin-corpus delivery order and open/update PRs. Production activation needs its own named target/policy authority. | G5; owner acceptance |

## First executable controls to freeze, before implementation

1. Preserve a complete valid fixture and an independent scope. The same input/recipe must cause no
   interpretation dispatch; malformed/missing inputs must not become a successful empty worklist.
2. For each of behavior edit, source addition/removal, intent-doc and recipe change, freeze a concrete
   expected affected set. Run the real recipe, not duplicate graph logic in the assertion.
3. Equal body with changed authority/validity/gaps propagates. Same validated result with renewed receipt
   stops downstream interpretation but refreshes bindings. Navigation-only edits never create build edges.
4. Fail before activation, after durable completion and at publication boundary. A separate reader sees
   a coherent valid old/new manifest or HOLD; after source drift it must not see stale old knowledge as current.
5. Retry/resume reuses durable completed work and preserves unresolved reservations. Concurrent admission
   cannot overspend the shared envelope. A hidden physical retry or incapable adapter refuses the route.
6. Actual producer/update/reader/migration entry points reject missing artifacts, broken selection,
   incompatible required result and stale rollback. Named removed-edge/removed-input/removed-budget
   controls must invalidate the exact acceptance oracle they protect.

These are required oracle scenarios, **not a claim that a failing suite has already been authored or run**.
No runtime implementation starts until its actual contract and red baseline are frozen.

## Authorization and closure constraints

- Maintaining the contract does not grant new model spend, production authority, runtime restart or PR work.
- AC-08 explicitly allows reporting unsettled calls; it does not allow calling them free or manufacturing
  provider observations. Separate historical reporting limitations from enforceable future reservations.
- Old M1/J1 completion obligations remain named. The layered goal replaces the old execution framing,
  but does not silently mark old publication/Own results delivered. Resolve their exact migration or
  disposition at G6 rather than blindly resuming old per-file extraction.
- #1300/#1302 remain open and unchanged; corrected candidate behavior must be preserved through delivery.
- No production installation or cleanup of still-needed evidence happens as a side effect of this plan.
- Research acceptance, pilot validation, global acceptance, campaign closure, PR creation, merge and
  production activation keep separate receipts. No partial green authorizes the next trust boundary.

## Preparation receipts and immediate next work

The read-only inventory `genesis-campaign-results/accounting-inventory-summary-v1.json` binds a scan
of 120 local logical-dispatch metadata records, with 114 paired result files. The six other records map
to retained recovery snapshots: four incomplete original assistants and two explicit free-limit refusals.
All inspected dispatch records still report physical attempts unreconciled. This is a bounded directory
inventory, not total campaign requests, settled provider usage, successful outputs or a spending ledger.

Next: finish G0's exact need/artifact/case identity comparison, then freeze G1/G2's executable interfaces
and acceptance suite against the existing command/store/input seams. Preparing these contracts is not
permission to claim a red baseline, invoke real models, install production policy or open PRs.

G2.1 has now advanced to a concrete [update-plan seam and acceptance suite](genesis-update-plan-contract.md).
Its remote baseline `42198843159` records 20 named stub failures, 80 passing existing regression assertions
and a successful Atlas typecheck at `17caf7d966960a644d754d9cb0cfda01c64b2436`. Later mutation/generation
steps were skipped. At that baseline the module was an unexported throwing stub; independent suite
review precedes implementation. This does not close G2's host observations, reconstruction or result-renewal obligations.

One owner-authorized same-Terra-2 suite critique returned FIX-FIRST with five concrete missing oracles.
The tests now contain the mapped repairs; no independent PASS is inferred and no additional judge
request is automatically permitted. G1's [economic-control contract](genesis-economy-control-contract.md)
also records the actual command timeout/cost limitation and existing executor retry/injection boundary.

After seeing the concrete FIX-FIRST and repaired red baseline, the owner delegated the review decision.
The lead bounded the follow-up to one same-Terra-2 suite delta check and one same-Terra-1 implementation
review, sequentially, without coordinator redispatch. This does not authorize other campaign calls or
alter the disclosed physical-attempt/accounting limits.

The same Terra 2 accepted all five suite corrections in its exact delta decision. The lead implemented
the private G2.1 planner against that seam and added four implementation-removal controls to the existing
scoped lane. Scoped green/mutation evidence and the already bounded technical review remain pending;
this is not a completed rebuild path or global acceptance.

The first implementation passed 103 assertions and eight mutations, but the technical reviewer found
the affected-only ordering counterexample. UP-24 then failed against that exact real implementation;
the other 103 assertions and typecheck remained green. The root correction and ninth rejecting control
are now candidates, not an accepted technical closeout.

G0's `genesis-campaign-results/need-artifact-case-inventory-v1.json` maps the six frozen N1..N6 needs
to the 17 exact candidate artifact results and 11 enumerated existing accepted cases. Actual returned
bodies/sections, not navigation or checked-closure metadata, determine consultation coverage. Six
intermediate artifacts have no direct body/section consultation in that explicit case set; their direct-use
proof remains an AC-03 work item. This is not a claim about every historical consumer or a reason to remine.
