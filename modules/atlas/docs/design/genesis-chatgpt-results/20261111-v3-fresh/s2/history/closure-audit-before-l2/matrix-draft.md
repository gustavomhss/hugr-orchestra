# S2 closure obligations — DRAFT

Snapshot: 2026-11-11T18:29:38.092443+00:00 to 2026-11-11T18:29:38.103282+00:00. Execution `46d09d97-39a9-482a-a290-646ba1d94c99`. Baseline `1cde2ff7a71bcf7aecb5d030917b577165135d38`; protocol `ee2521a5b966bd505cc95bd1c733e09e12f33531`.

This is a bounded coordination/provenance audit, not a semantic judgment, completion claim, or instruction to stop independent work. It freezes the files/hash identities listed in `obligations.json`; concurrent later results require principal reconciliation. No producer-facing oracle content is included. Exact normative lines for all 50 IDs are retained verbatim in the companion JSON and verified against Git blob `b45a73f17c34341097a8c8725a1df6260cd273b5`. All paths below are relative to `/workspace/scratch/7b5d6430f420/genesis-s2`.

## Snapshot and actual gates

- Coverage is 4,506 paths, 156 families: 565 inspected / 3,893 family-supported / 48 metadata-only. Enumeration and byte integrity do not certify semantic sufficiency.
- Package contains three of thirteen required keys and empty roots. Desktop-web/design-tui L1 r2 have both actual PASS decisions; app-session r2 has both FIX-FIRST decisions. The r3 producer body is present (`67a2787d0813738c8930a23253c9d185933cc228e997d530056cd4fa98b0b16e`, 42,047 bytes), with no r3 judge decision in this snapshot. L2–L4 and entry remain unproduced in the manifest.
- Runtime: exact S4 candidate `e3a8ab8cf56dbff1ee91272df51ffa398d882aa1`; release commit `b42d14978c8b727310369920d4bfaf86145a2b80`, release SHA-256 `47deabb52ee93e18de06c68c1c27a0ff810a4e779a5087581080e87d6756979f`. S2 adapter typecheck passed; full13 prepare, binding, publication, readers, update and recovery remain NOT_RUN.
- Source/observer cap is 256,000 bytes. Required `schema/tui.json` is 1,131,057 bytes; `inputs/app-session-tree.json` is 369,462; `inputs/design-tui-tree.json` is 390,775. No truncation, omitted input or digest replacement may be treated as compatible full-byte observation.
- S4 CI run `43065851373`, attempt 1, candidate above: **FAILURE**, despite 216 passing tests in 22 files. Typecheck, grouped regressions, negative-guard probes and boundary generation succeeded. Guard step failed on `modules/atlas/ownership-guards.log` (`agent-scratch`; 78 rules, 717 changed paths, 1 gate, 3 warnings; exit 1). Earlier S2 local guard attempt also exited 1 before any rule because the materialization is not a Git repository. S2 final-payload gates are NOT_RUN.
- Native tokens, billing and physical provider attempts are **UNKNOWN**. Historical aggregate is **GLOBAL_UNRECONCILED**, owner ROOT. This audit makes no costs or savings estimate.

## Open execution gates

| Gate | State | Required closure evidence |
| --- | --- | --- |
| G-LAYERS | HOLD | Same-pair r3 reevaluation, whole-L1 acceptance, then actual L2/L3/L4 production/review and final union reconciliation; no dependent-layer bypass. |
| G-RUNTIME | HOLD | A compatible S4 revision or authorized scoped correction with exact code/release receipts; complete/stage all accepted bodies and references; fresh isolated prepare output and kernel input versions. Never truncate sources or substitute snapshot digests for byte observation. Recheck release before final blockage conclusion. |
| G-BINDING | NOT_RUN | New binding reviews and actual authorized actor/ratifier/policy, isolated store/projection/manifest receipts; semantic PASS alone cannot confer binding/publication authority. |
| G-CONSUMERS | NOT_RUN | Fresh consumer context with no source or answer-key access; real reader readiness and exact selection; independent evaluation of every case and correct abstention; routine <=2 index, <=2 read, <=16000 body bytes; deep <=6 index, <=5 read, <=64000 body bytes. |
| G-UPDATE | NOT_RUN | Independently expected affected closure; real source behavior edit and restore; identical input/recipe zero-new-proposer reuse; independent results unchanged; build versus navigation distinction; missing input/edge rejection; recipe/authority/validity/gaps propagation even with equal prose; receipt-only binding refresh and unchanged validated-result stopping. Bind source additions/removals, intent-doc changes and related common controls to an exact compatible candidate, not mere staleness detection. |
| G-RECOVERY | NOT_RUN | Failure before activation, durable resume reuse, separate/concurrent readers seeing accepted coherent manifest or HOLD, stale-current refusal after drift, compatible rollback, labelled history and independent valid-scope reads; no production activation as side effect. |
| G-CI | HOLD | Resolve/reconcile shared guard failure within authorized owner scope; execute actual S2 final-payload gates on correct candidate with authentic Git base. Report scoped results and observed branch-protection enforcement separately. ROOT owns integrated final epic, not missing S2 gates. |
| G-PROVENANCE | HOLD | Reconcile final manifest to actual accepted decisions and hashes; close all visible dispatch/correction/transport/consumer events with linked outcomes; retain limits of host serialization and unobservable provider attempts. Native tokens, billing and provider attempts UNKNOWN; historical campaign totals GLOBAL_UNRECONCILED for ROOT. No source membership/Git trust fabrication. |
| G-PUBLICATION | HOLD | Finish all independent authorized work; prepare concrete reviewable payload. Obtain explicit authorization for the actual public disclosure or establish an authorized materially safer destination; do not retry or route around rejection. Then fresh HEAD B, immutable payload P descended from B, separate H pointing to P, expected_sha=B and force:false, and readback/hashes. Owner acceptance/landing/production activation remain ROOT global obligations. |

## Fourteen frozen consumer obligations

No consumer question or reserved answer is reproduced. Each remains NOT_RUN. All require real Atlas index/read, exact versions, fresh observed context and no source/answer-key access. Routine: at most 2 index calls, 2 reads and 16,000 body bytes; deep: at most 6 index calls, 5 reads and 64,000 body bytes.

| Case | Kind / target | Depth |
| --- | --- | --- |
| S2-C1 | permitted-change | deep |
| S2-C2 | contract-violation | deep |
| S2-C3 | cross-component-impact | deep |
| S2-C4 | operational-failure | deep |
| S2-C5 | out-of-scope | routine |
| S2-I1D | direct-L1 / s2.l1.desktop-web | routine |
| S2-I1A | direct-L1 / s2.l1.app-session | routine |
| S2-I1U | direct-L1 / s2.l1.design-tui | routine |
| S2-I2D | direct-L2 / s2.l2.desktop-web | routine |
| S2-I2A | direct-L2 / s2.l2.app-session | routine |
| S2-I2U | direct-L2 / s2.l2.design-tui | routine |
| S2-I3D | direct-L3 / s2.l3.desktop-web | routine |
| S2-I3A | direct-L3 / s2.l3.app-session | deep |
| S2-I3U | direct-L3 / s2.l3.design-tui | routine |

Update obligation `S2-U1` is NOT_RUN; G-UPDATE records its required controls without exporting the reserved answer. The final graph determines the independently verified local affected closure. Compatible common S4 proofs may be reused, but absence of S2-specific readers, cases, binding or gates cannot be deferred to ROOT.

## Fifty-ID disposition matrix

Statuses below account for the complete S2 criterion at this snapshot. They do not replace named judges. FIX-FIRST preserves actual current r2 mandatory findings; other rows HOLD for missing required proof. No N/A is claimed. `L` is the exact normative source line; E references existing evidence groups below. All global complements have owner **ROOT**, status **DEFERRED_TO_INTEGRATION**; local proof remains with S2.

| ID (L) | Local state | Local obligation / evidence present | Remaining proof | ROOT global complement |
| --- | --- | --- | --- | --- |
| GO-A1 (52) | FIX-FIRST | Transfer useful ownership across the full S2 population. [E02, E05, E06, E07] | Resolve current app findings and establish complete L1-L4 semantic/consumer support. [G-LAYERS, G-CONSUMERS] | Judge transferable ownership across the five-domain union. |
| GO-A2 (53) | HOLD | Persist cumulative, directly useful L1-L4 intermediates. [E02, E05] | Complete ten missing artifacts and direct-use proofs. [G-LAYERS, G-CONSUMERS] | Reconcile cumulative cross-domain usefulness. |
| GO-A3 (54) | HOLD | Provide operational skill/entry and bounded real index/read navigation. [E02, E03] | Complete entry/roots and actual shallow/deep reader cases. [G-LAYERS, G-CONSUMERS] | Validate the integrated entry and union navigation. |
| GO-A4 (55) | HOLD | Bind S2 build dependencies and maintenance semantics. [E03, E08] | Execute local impact/rebuild/reuse and compatible shared controls. [G-UPDATE] | Prove propagation and reuse across domains. |
| GO-A5 (56) | HOLD | Keep source, authority, validity, Git and local gates distinct. [E08, E09, E10, E12] | Obtain compatible runtime and exact final-payload gates/transport. [G-RUNTIME, G-BINDING, G-CI, G-PUBLICATION] | Integrate source/knowledge consistency and governed landing. |
| GO-A6 (57) | HOLD | Use deterministic provenance checks, bounded native tasks and retained completions. [E04, E08, E11] | Reconcile all new tasks and unobservable usage; complete fixed work only. [G-PROVENANCE] | Reconcile aggregate/historical economics and shared limits. |
| GO-A7 (58) | HOLD | Use existing Atlas types/doors and only necessary adaptation. [E08, E14] | Demonstrate compatible full13 import/binding/read; no parallel reader substitution. [G-RUNTIME, G-BINDING, G-CONSUMERS] | Review minimal shared mechanisms and union integration. |
| GO-I1 (120) | HOLD | Preserve original responses, retries, source identities and correction lineage. [E04, E07, E08, E13] | Seal final immutable references and readback. [G-PROVENANCE, G-PUBLICATION] | Reconcile protected historical campaign objects. |
| GO-I2 (121) | HOLD | Retain labels for observation, intent, interpretation and gaps. [E05, E06] | Carry exact distinctions through final layers, reviews and consumers. [G-LAYERS, G-CONSUMERS] | Resolve cross-domain conflicts without certainty inflation. |
| GO-I3 (122) | HOLD | Bind exact current versions to a valid accepted local manifest. [E02, E08] | Prepare/bind/read current selection; prove stale/rollback refusal and history labels. [G-BINDING, G-CONSUMERS, G-RECOVERY] | Prove union manifest coherence and current-source validity. |
| GO-I4 (123) | HOLD | Reuse unchanged valid work; distinguish build and navigation edges. [E03, E08] | Execute identity/call-count reuse and stopping controls. [G-UPDATE] | Prove independent cross-domain preservation and shared cache semantics. |
| GO-I5 (124) | HOLD | Include source and relevant non-code change in S2 impact. [E03, E08] | Execute local expected closure and bind additions/removals/doc/recipe controls. [G-UPDATE] | Prove union impact closure and unavailable-impact HOLD. |
| GO-I6 (125) | HOLD | Account for every visible production/review/correction/consumer request. [E11] | Reconcile visible completions and unsettled work; unexposed usage remains UNKNOWN. [G-PROVENANCE] | Reconcile global reservations, historical limits and adapter guarantee. |
| GO-I7 (126) | HOLD | Retain governed doors, source-as-data and domain/generated boundaries. [E05, E06, E12] | Resolve exact app findings and verify isolated authorized runtime controls. [G-LAYERS, G-BINDING, G-RECOVERY] | Validate union governance, project boundaries and preservation. |
| GO-I8 (127) | HOLD | Keep mechanical coverage, semantic acceptance, runtime and completion distinct. [E02, E05, E06, E08, E09] | Record full independent decisions and executed obligations before closure. [G-LAYERS, G-CONSUMERS, G-PROVENANCE] | Independently decide union semantic and global completion states. |
| AC-01 (138) | FIX-FIRST | Account for 4506 paths/156 families and all 13 required keys. [E02, E03, E04, E05, E06] | Resolve app mandatory findings; complete/accept remaining keys and final support mapping. [G-LAYERS] | Review coverage union and cross-domain flow sufficiency. |
| AC-02 (139) | HOLD | Run five frozen ownership cases with independent Atlas-only consumers. [E03, E08] | Execute S2-C1..C5 and independently decide exact bounded results. [G-CONSUMERS] | Run ownership cases for integrated cross-domain use. |
| AC-03 (140) | HOLD | Run nine direct-use cases plus bounded ownership navigation. [E03, E08] | Execute all 14 cases through real index/read with recorded bounds and versions. [G-CONSUMERS] | Validate integrated progressive use and union navigation. |
| AC-04 (141) | HOLD | Preserve real native construction and prove exact import/source authority handling. [E04, E05, E06, E07, E08] | Finish actual layers; execute import and local source-conflict cases; bind compatible S4 stale/missing/malicious/refusal controls. [G-LAYERS, G-RUNTIME, G-BINDING] | Check five-package compatibility and union authority controls. |
| AC-05 (142) | HOLD | Prove reuse, independent identity preservation and result/receipt semantics. [E03, E08] | Execute local reuse controls and consume compatible exact shared receipts. [G-UPDATE] | Prove cross-domain independence and propagation stopping. |
| AC-06 (143) | HOLD | Prove expected affected set and actual knowledge restoration. [E03, E08] | Execute S2-U1 with omission controls and bind all required mutation classes. [G-UPDATE] | Prove cross-domain impacted closure and rebuilt union. |
| AC-07 (144) | HOLD | Prove coherent local accepted reads or HOLD during recovery. [E08] | Execute local binding/use and validly reuse exact shared recovery/rollback controls. [G-BINDING, G-RECOVERY] | Prove union concurrency, failure recovery and independent scopes. |
| AC-08 (145) | HOLD | Report all new observable usage and true native-route limits. [E11] | Reconcile tasks/outcomes/unsettled requests; do not invent native token/currency guarantees. [G-PROVENANCE] | Reconcile common adapter guarantee, aggregate envelope and history. |
| AC-09 (146) | HOLD | Verify S2 component gates and actual invalid-state reader controls. [E08, E09, E10] | Run exact final-payload gates and bind compatible negative controls; repair/reconcile shared guard failure. [G-CI, G-BINDING, G-RECOVERY] | Run integrated gates; report actual branch protection and scope isolation. |
| AC-10 (147) | HOLD | Preserve S2 protected objects and generated boundaries; stage without authority. [E04, E07, E08, E12, E13] | Seal preservation inventory and compatible migration/publication controls with authorized transport. [G-PROVENANCE, G-RECOVERY, G-PUBLICATION] | Reconcile full historical preservation, migration and activation. |
| CC-1 (159) | HOLD | Maintain frozen scope, source, gaps and finite 13-key inventory. [E02, E03, E05, E06] | Reconcile complete package and final scope dispositions to actual reviews. [G-LAYERS, G-PROVENANCE] | Freeze/reconcile union inventory and missing knowledge. |
| CC-2 (160) | HOLD | Make every required local level persistent and directly reachable. [E02, E03] | Produce remaining ten keys; demonstrate real direct-use navigation. [G-LAYERS, G-CONSUMERS] | Confirm cumulative union reachability. |
| CC-3 (161) | HOLD | Support purpose, contracts, behavior, decisions, impact and maintenance. [E05, E06] | Resolve findings and obtain complete layer/ownership-case acceptance. [G-LAYERS, G-CONSUMERS] | Judge cross-domain ownership sufficiency. |
| CC-4 (162) | HOLD | Demonstrate local initial build through incremental maintenance. [E03, E08] | Execute prepare, update/rebuild/reuse and relevant common mutation controls. [G-RUNTIME, G-UPDATE] | Prove end-to-end union maintenance. |
| CC-5 (163) | HOLD | Use coherent publication, reader verification and compatible recovery. [E08, E12] | Execute isolated local path and validly bind common controls. [G-BINDING, G-RECOVERY] | Prove union recovery, concurrent readers and independent scopes. |
| CC-6 (164) | HOLD | Reconcile observed local economics to the actual route guarantee. [E11] | Close new-work accounting while preserving UNKNOWN metering and limits. [G-PROVENANCE] | Reconcile adapter guarantees and aggregated/historical obligations. |
| CC-7 (165) | FIX-FIRST | Dispose of local compatibility, generated surfaces and maintenance guidance. [E05, E06, E07, E08] | Same-pair app correction acceptance; final guides; compatible runtime and preservation dispositions. [G-LAYERS, G-RUNTIME, G-PROVENANCE] | Resolve union compatibility, old-campaign obligations and expansion limits. |
| SC-1 (169) | HOLD | Pass all frozen local ownership cases without source discovery. [E03, E08] | Actual independent S2-C1..C5 results and decisions. [G-CONSUMERS] | Pass integrated ownership cases. |
| SC-2 (170) | HOLD | Meet frozen routine/deep read limits with real readers. [E03, E08] | Record all 14 cases, request counts and body bytes; no source access. [G-CONSUMERS] | Meet union progressive-use limits. |
| SC-3 (171) | HOLD | Preserve independent work and expected update closure. [E03, E08] | Execute local impact/reuse and compatible common controls. [G-UPDATE] | Verify cross-domain incrementality and no unnecessary interpretation. |
| SC-4 (172) | HOLD | Report construction, review, update and read usage separately. [E11] | Reconcile stage categories and unknown native usage; no fabricated savings. [G-PROVENANCE] | Reconcile total envelope and historical/comparable measurements. |
| SC-5 (173) | HOLD | Demonstrate coherent local reads and refusal of invalid states. [E08, E09, E10] | Actual reader/recovery/control receipts and correct scoped CI result. [G-BINDING, G-RECOVERY, G-CI] | Prove integrated consistency and invalid-state refusal. |
| QS-1 (180) | FIX-FIRST | Preserve fidelity, disagreement and exact epistemic labels. [E05, E06, E07] | Same-pair app r3 reevaluation and final layer review; no helper judgment. [G-LAYERS] | Review union fidelity and unresolved conflicts. |
| QS-2 (181) | FIX-FIRST | Provide concise actionable guides and useful bounded index entries. [E05, E06, E07] | Resolve app maintenance omissions; produce accepted L4/entry and real consumer proofs. [G-LAYERS, G-CONSUMERS] | Review integrated operating guidance and navigation utility. |
| QS-3 (182) | HOLD | Use only justified existing-Atlas mechanisms. [E05, E06, E08, E14] | Final package/runtime review with minimal compatible adaptation. [G-LAYERS, G-RUNTIME] | Review shared mechanism necessity and avoid redundant infrastructure. |
| QS-4 (183) | HOLD | Retain repository boundaries, generated discipline and safe persistence. [E05, E06, E08, E09] | Close mandatory boundary evidence and verify exact runtime/gates. [G-LAYERS, G-BINDING, G-CI] | Review integrated engineering/governance controls. |
| QS-5 (184) | HOLD | Use fixed independent semantic bar and actual controls with bounded proof. [E05, E06, E08, E09] | Complete independent judgments and real readers/negative controls; no optional review campaign. [G-LAYERS, G-CONSUMERS, G-UPDATE, G-CI] | Review union evidence and anti-vacuity coverage. |
| QS-6 (185) | HOLD | Reuse preserved context/completions and record bounded work honestly. [E04, E08, E11, E13] | Reconcile final local ledger and stop refinement only after fixed obligations close. [G-PROVENANCE] | Reconcile campaign economics and reusable completions. |
| DOD-1 (223) | HOLD | Link every local CC/SC disposition to actual evidence and decisions. [E01, E02, E05, E06] | Replace draft accounting with final actual reviewed outcomes for all 50 IDs. [G-LAYERS, G-CONSUMERS, G-UPDATE, G-RECOVERY, G-PROVENANCE] | Resolve union CC/SC and named global acceptance. |
| DOD-2 (224) | HOLD | Review applicable invariants/QS and demonstrate rejecting controls. [E05, E06, E08, E09] | Final exact-package reviews plus required local/compatible shared negative controls. [G-LAYERS, G-UPDATE, G-CI] | Review global invariants/QS and integrated rejecting controls. |
| DOD-3 (225) | HOLD | Verify accepted local consumption and end-to-end maintenance/publication use. [E03, E08] | Execute reader cases and local update/recovery bindings. [G-CONSUMERS, G-UPDATE, G-RECOVERY] | Verify integrated end-to-end union path. |
| DOD-4 (226) | HOLD | Reconcile actual local scoped gates without promoting unrun gates. [E08, E09, E10] | Execute correct S2 final-payload gates; reconcile common failure. [G-CI] | Run final integrated epic and report enforcement separately. |
| DOD-5 (227) | HOLD | Reconcile all authorized new visible usage and unresolved requests. [E11] | Close final ledger, retaining UNKNOWN native metering and no assumed fallback/zero cost. [G-PROVENANCE] | Reconcile historical aggregate/envelope with no resets. |
| DOD-6 (228) | HOLD | Deliver accurate guides, local compatibility/preservation and complete independent review. [E05, E06, E07, E08, E13] | Accept complete final guides/package; seal exact preservation and handoff. [G-LAYERS, G-PROVENANCE, G-PUBLICATION] | Resolve historical migration/rollback and governed landing review. |
| DOD-7 (229) | HOLD | Report honest local completion and governed sealed transport. [E01, E02, E12, E13] | Close own obligations and authorized Git readback; do not self-assign owner acceptance. [G-PROVENANCE, G-PUBLICATION] | Record owner acceptance, governed integration, landing and production activation as distinct states. |

## Material reconciliation before final closure

- **Intentional complete-layer acceptance gate:** The manifest keeps blocked validity and no semantic review references until the whole L1 layer is accepted. Desktop/design r2 already have actual two-judge PASS decisions; app-session r3 is only a producer correction at this snapshot. The principal confirmed that final layer acceptance will bind actual response references and clear pending wording together. This is intentional workflow state, not a semantic contradiction. Before closure, reconcile the manifest to the exact completed layer decisions, accepted versions and hashes while retaining prior bytes. Do not infer that the pending app reevaluation or whole-layer acceptance has happened. [E02, E05, E06, E07]
- **Stale runtime/CI status text:** native-package known_limits still says runtime release pending. S4 r1 is pinned; its release describes CI as in progress, while later exact run readback is completed failure. Preserve original release unchanged; final summary must cite later readbacks and scoped capability states. [E02, E08, E09]
- **Build versus acceptance:** Adapter typecheck passed and 216 S4 regression tests passed, but S2 full13 prepare/binding/consumer/update gates are NOT_RUN and S4 overall CI failed. Never roll these into a general runtime/CI/semantic PASS. [E08, E09]
- **Frozen snapshot versus live Git membership:** 4506 paths are tied to exact captured tree snapshots. The source root is not a Git checkout, observed_head is null, and membership observation is not ready. Use exact snapshot/source bindings honestly; obtain an authentic compatible live-membership route if required by the targeted gate. [E02, E08]
- **Runtime reference and input-size incompleteness:** Prepare plan is not executed; it has ten unassigned future body/recipe/review paths and three required oversized observed inputs. Derive concrete paths from the final manifest and obtain compatible full-byte runtime support. Missing paths are planned, never present. [E08]
- **Local delivery cannot be sealed yet:** No deliverable/handoff.json at snapshot; two real publication rejections prohibit inferring a payload/artifact_revision or Git readback. Finish independent work, resolve actual publication authorization, then create payload/seal/lease/readback receipts. [E12, E13]

## Publication unblock conditions

Automatic approval review rejected two actual `create_tree` attempts. The first rejection concerned ZIP archives containing internal evidence/source captures at an external/unverified destination. The second explicitly concerned internal execution records—workspace paths, execution identifiers, judge/agent details, branch state and operational history—proposed for a **public GitHub repository**, without specific disclosure authorization. Both exact rejection files are E12. No further remote write was attempted by this audit.

Complete all independent authorized production, reviews and local evidence first, then present the concrete payload for explicit public-disclosure authorization or establish an authorized materially safer destination. Do not retry through another tool or omit the rejection from the final explanation. Once resolved, read the fresh branch HEAD, create payload P, create separate handoff seal H referring to existing P, update with the exact lease and `force:false`, then reread H and the referred P bytes. A mere Git object creation is not accessible delivery.

`deliverable/handoff.json` is **planned and absent**. Ten later-artifact paths are **planned but unassigned** in the snapshot manifest. The proposed `runtime-work/outputs/s2-full13-prepared-v1.json` is **planned, not executed**. Do not invent artifact/hand-off commits. The last recorded remote claim head is `ac972ff8dc1126b02f8a16f3942a142e417039ed`; this audit made no fresh remote read. Owner acceptance, landing, production activation and union gates stay global; these do not excuse missing local delivery evidence.

## Evidence map and refresh rule

- **E01 — Normative identity and completion allocation:** `protocol/references/criteria.json`, `corpus/modules/atlas/docs/design/genesis-ownership-plan.md`, `protocol/references/completion.md`, `protocol/references/runtime.md`, `protocol/references/campaign.md`, `protocol/references/handoffs.md`.
- **E02 — Current scope, package and coverage:** `deliverable/work.md`, `deliverable/native-package.json`, `deliverable/coverage.tsv`, `deliverable/evidence/l1-principal-verification.json`.
- **E03 — Frozen case metadata and required layer inventory; reserved answers omitted:** `deliverable/oracles/ownership-v1.json`, `deliverable/oracles/layers-addendum.json`.
- **E04 — L1 r2 reconciliation and preserved corrections:** `deliverable/corrections/l1-r2/verification.json`, `deliverable/evidence/l1-principal-verification.json`.
- **E05 — Actual independent desktop/design r2 PASS decisions:** `deliverable/judgments/resume-l1/desktop-design-r2-j1.json`, `deliverable/judgments/resume-l1/desktop-design-r2-j2.md`.
- **E06 — Actual independent app-session r2 FIX-FIRST decisions:** `deliverable/judgments/resume-l1/app-session-r2-j1.json`, `deliverable/judgments/resume-l1/app-session-r2-j2.json`.
- **E07 — App-session r3 producer correction, not acceptance:** `corrections/l1-r3-app/artifact-index.json`, `corrections/l1-r3-app/verification.json`, `corrections/l1-r3-app/l1.md`.
- **E08 — Pinned S4 release, exact S2 build/materialization and full13 prepare HOLD:** `deliverable/evidence/s4-runtime-release-r1.json`, `deliverable/evidence/runtime-initial/receipt.json`, `deliverable/evidence/runtime-supplement-r2/receipt.json`, `deliverable/evidence/runtime-supplement-r2/prepare-plan.json`, `deliverable/evidence/runtime-supplement-r2/release-recheck.json`, `deliverable/evidence/runtime-supplement-r2/prior-receipts-immutability.json`.
- **E09 — S4 CI actual run, steps and log; overall FAILURE:** `deliverable/evidence/s4-ci-summary.json`, `deliverable/evidence/s4-ci-run-readback.json`, `deliverable/evidence/s4-ci-jobs-readback.json`, `deliverable/evidence/s4-ci-job-log-readback.json`.
- **E10 — Earlier local guard invocation failed before rules:** `deliverable/evidence/guards-attempt.json`.
- **E11 — Observable task ledger and transport limits:** `deliverable/execution-ledger.jsonl`, `deliverable/judgments/resume-l1/transport-r2/app-desktop/completion.json`, `deliverable/judgments/resume-l1/transport-r2/design/completion-receipt.json`.
- **E12 — Actual automatic approval review rejections:** `deliverable/evidence/archive-publication-rejection.json`, `deliverable/evidence/remote-publication-rejection.json`.
- **E13 — Resumption and preserved original archives:** `deliverable/evidence/resumption-summary.json`, `deliverable/archives/manifest.json`.
- **E14 — Transport shape correction, not executed import:** `deliverable/evidence/native-transport-compatibility.json`.

The companion JSON records byte lengths and SHA-256 hashes of every audit input, all exact normative lines, actual decision/body identities, the complete gate descriptions and planned-reference states. Before merging this draft into the single final `work.md`, replace snapshot-only statuses with subsequently observed exact reviews/receipts; preserve unresolved gates as open. The helper read reserved oracle metadata for enumeration and must not become a later producer or reviewer.
