# Lucy resumption checkpoint — 2026-11-28

**The final Lucy campaign remains open.** R8 and Kubeconform P1 preparation are integrated, and the recovered full ToDo/mechanism reconciliation is merged. Draft #1684 source 0076ad37 integrates dev 8cf8407f. Focused Core GREEN3 passed 65 Linux / 63 Windows / 62 macOS cases; Main GREEN3 passed all 59 cases on every host, including the corrected native-error observation, full-call deadline, later ACK and inherited Session placement. All selected types passed with zero skips/delegated. Preservation passed 122 cases on Linux/macOS; Windows had 121 PASS and one existing governed-round 5-second timeout. Landing remains blocked by source-directory authority across concurrent parent replacement and eager host enumeration before entry admission. A05 and final GO remain open. Compliance, Kubernetes analysis, per-tool runtime closure and final integrated acceptance remain open.

This checkpoint supplements the approved [go-live plan](go-live-plan.md), [29-row coverage matrix](go-live-coverage.md) and [original Q1 tool ledger](q1-qualification-ledger.md). The complete recoverable ToDo is in [resumption-todo.json](resumption-todo.json): **5 foundation tasks, 15 acceptance-spine rows, 29 capability/extension rows, all 83 original tools and four additional C03 tools**. The [mechanism map](tool-mechanism-reconciliation.md) records exact source paths/blobs, test/route evidence and per-name limits.

## Source and state boundaries

- Integration baseline: [a959b3fffcbb9d1d2a36c0557f1de1b94c8a91a4](https://github.com/gustavomhss/hugr-orchestra/commit/a959b3fffcbb9d1d2a36c0557f1de1b94c8a91a4).
- Earlier observed dev: [f469755b33bb478693d2d1dae022c010c2e47ebc](https://github.com/gustavomhss/hugr-orchestra/commit/f469755b33bb478693d2d1dae022c010c2e47ebc), tree 35b06ee13392dbb6e547b88a050dfa1681b99d0e. Its two-file delta changes packages/script/test/test-plan.test.ts and modules/capability-assets/requirements-dev.txt, with no Lucy path overlap. The script test correction exists; an older script error is not asserted to remain unresolved.
- Mechanism audit: 156386010fe22cd7b61cd3b75fcbe62db657305b, with Kube P1 source c6a16ad8165d1152a2815e2f3a6582243ca0aa6c recorded as a separate delta. A later merge does not retroactively qualify an older test snapshot.
- A05 current production source is `0076ad37e7adb98746f63b0f95a8431a7a552b29`, integrated on dev `8cf8407fbd4508a59ea8465d947d5b06e5c49296`. Its exact GREEN3 snapshots, failed Windows preservation and post-GREEN source findings are recorded below. Older integration/mechanism observations remain historical; this update does not requalify unrelated ledger rows.
- Later dev observed during documentation: `9ae228e403290533e184c2493f4dad32daf51b3e`, a one-file app-shell e2e test change from parent `8cf8407f`. It is not included in the A05 runtime source or qualified by its runs. This checkpoint does not rebase or merge production.
- Required rows remain open until exact integrated evidence is attached. An integrated focal delivery is not campaign closure. A test filename or generic mechanism is not proof of the named capability; unavailable prerequisites are not positive acceptance.

## Preserved deliveries

| PR | Delivery to preserve | Merge |
| --- | --- | --- |
| [#1599](https://github.com/gustavomhss/hugr-orchestra/pull/1599) | PR source and Git index lifetimes | 0be747d7284a536851e52e25e73c618557f99f19 |
| [#1600](https://github.com/gustavomhss/hugr-orchestra/pull/1600) | Public CODE tools bound to captured source | b1877953cd4a3915c1bab27e93607dff329c7477 |
| [#1605](https://github.com/gustavomhss/hugr-orchestra/pull/1605) | Independent audit, diligence and artifact engagements | 5b2c840975e40d23467c47aa3a79ae5028cbd79d |
| [#1618](https://github.com/gustavomhss/hugr-orchestra/pull/1618) | Durable engagement evidence and replay | 66371f666132cfa78006b50fc98cdc7800c2e044 |
| [#1643](https://github.com/gustavomhss/hugr-orchestra/pull/1643) | Honest binary-search coverage | 66cfef285979adee36168e62010e8788f510db3d |
| [#1652](https://github.com/gustavomhss/hugr-orchestra/pull/1652) | Native audit variant generations | 2a9a60c0695e6bae5aaccf02000179307632faec |
| [#1670](https://github.com/gustavomhss/hugr-orchestra/pull/1670) | Durable fix review and retained predecessor evidence | 4e43316f403b49557b5986236cc9e16ca2011fc6 |
| [#1676](https://github.com/gustavomhss/hugr-orchestra/pull/1676) | Scoped TypeScript probe/retest on Linux x64 | c585d7ae79e676f2aca89bf86aa8770cf03a1468 |
| [#1679](https://github.com/gustavomhss/hugr-orchestra/pull/1679) | Guide corrections and first durable checkpoint | 47f38c69e612c8c1e4a56b1f5262aa9efc439ab9 |
| [#1680](https://github.com/gustavomhss/hugr-orchestra/pull/1680) | Shared R8 permit, cancellation and cleanup correction | 156386010fe22cd7b61cd3b75fcbe62db657305b |
| [#1666](https://github.com/gustavomhss/hugr-orchestra/pull/1666) | Kubeconform P1 explicit preparation and no-acquire reads | a959b3fffcbb9d1d2a36c0557f1de1b94c8a91a4 |
| [#1688](https://github.com/gustavomhss/hugr-orchestra/pull/1688) | Recovered complete ToDo and source-linked mechanism reconciliation | 6aebf3a4ae40bf6c047463a46f56e459c14786de |

Also preserve [#1463](https://github.com/gustavomhss/hugr-orchestra/pull/1463), [#1634](https://github.com/gustavomhss/hugr-orchestra/pull/1634) and the [#1585 shfmt/cargo-machete wave](https://github.com/gustavomhss/hugr-orchestra/pull/1585). Their exact merges and prior proof links are retained in the JSON. **#1667 is historical fix-review acceptance consumed by #1670; do not restart that implementation.** #1646 is retained Kube measurement. #1666 is now merged production preparation, not a tests-only draft.

## Remaining acceptance spine

The required terminal observations remain unchanged in the JSON and campaign plan. The following table records current implementation/evidence state and the next closing condition; it grants no final row closure.

| ID | Current state and evidence | Next terminal work |
| --- | --- | --- |
| **A01** | Independent audit/diligence/artifact Maestro requests and seat authorization are integrated in #1605. | Preserve a request without validationID, Maestro-only authorization, retries and distinct governed/PR contracts on the final source. |
| **A02** | Strict captured-source reports and durable evidence/replay are integrated in #1605/#1618; fix review adds retained predecessor evidence. | Preserve verdict-field refusal, source/scope/evidence binding, canonical replay, corruption refusal and old report/receipt bytes. |
| **A03** | Host timebox/cancellation and native audit variants are integrated; no non-audit variants are admitted. | Preserve the original cumulative deadline, owner/waiter cancellation, at most three audit generations, half-noise stop, and zero diligence/artifact variants. |
| **A04** | Durable fix review #1670 and scoped TypeScript retest #1676 are integrated. #1680 corrected the shared R8 permit and qualified its Linux x64 concurrency scope. | Reconcile the remaining required analyzer/probe coverage without generalizing to arbitrary runners or hosts. Preserve stored report/finding/evidence identity, dispositions, original deadline, no acquisition, bounded output and exact replay. Attach final integrated public-path evidence; #1667 is historical acceptance consumed by #1670, not a new implementation task. |
| **A05** | Draft #1684 has Core/Main GREEN3 on integrated source 0076ad37: Core 65/63/62 by host, Main 59 each. Preservation Linux/macOS 122 PASS; Windows 121 PASS + one 5-second timeout. Two source findings block landing. | Resolve directory authority and eager host allocation; retain the timeout diagnosis and exact evidence. Use the profile crosswalk to close remaining own-leaf/negative/load/transcript evidence and forensic report semantics, then actual CLI/Desktop knowledge. Accepted exclusions, R20, inferred labels and global hash inputs remain unchanged. |
| **C01** | The integrated source explicitly rejects compliance with engagement-profile-unavailable before source capture and Session work. | Freeze a cohesive compliance request/route/report/replay/fix contract after accepted A05 scope changes. Retain evidence, findings, confidence and bounded unresolved human decisions using existing finding and engagement structures. Reject certification, developer scores and governed verdicts; preserve zero variants and host deadline/cancellation. Obtain compilable causal RED, real public GREEN and preservation before closure. |
| **C02** | Existing compliance leaves and skill embedding foundations are present; five reviewed leaves are stubs and final production-artifact proof is not attached. | Complete the existing cyber/ai-act/accessibility-law/licensing/evidence leaves narrowly with the uncaptured G10 question inventory; reuse substantive privacy/controls guidance. Prove the correct profile/role scopes, explicit inferred controls and off-route refusal. Inspect Lucy leaf bytes in the actual compiled CLI and the CLI payload packaged by Desktop, with source/artifact hashes; a synthetic loader/source-tree check is not the shipping gate. |
| **C03** | OPA, Kyverno, ORT and axe-core remain four additional required capabilities. The independent native producer contract currently qualifies only oxlint. | Freeze actual backend/capability/input/platform before implementing each tool, especially ORT stages and axe-core browser/DOM behavior. Qualify pinned preparation outside review, real bounded invocation, positive and seeded-negative fixtures, missing/unsafe prerequisite outcomes and output normalization. Extend exact typed native producer/recipe/retained evidence and public report/fix binding without relaxing legacy receipt validation. Keep all four additional to the original 83; no unavailable outcome or source constraint silently removes a required row. |
| **T01** | All 83 names have a source-based actual form and mechanism map. Ten have a named mechanism/component observed; 73 have specific evidence not linked in the inspected set. Neither count is a completion/absence count. | Finish per-name capability, invocation, platform and exact public proof, or attach an explicit existing owner scope disposition. Preserve libraries/components/plugins/converters/subcommands/metapackages as their actual forms. Keep Conftest, ScanCode and REUSE constraints visible; do not replace or remove names. |
| **T02** | Analyzer/repo/build/probe/index/LSP foundations and outside-Lucy integrations are mapped with exact paths/blobs and proof limits. | Reuse the mechanism that actually provides the named capability; do not add redundant adapters by name alone. Distinguish SCIP codec/indexers/CLI, Pyright LSP/fork/CLI, clangd checks/standalone clang-tidy, tsgo/tsc/tsgolint, and PMD CPD/jscpd. Qualify independent evidence producers explicitly: current input.evidence admission checks run before local/repo/build dispatch. |
| **T03** | The local-check wave is preserved. Kubeconform P1 preparation #1666 is integrated and qualified within its declared scope; Kubernetes analysis remains open. | Preserve all pinned executable identities and notice origins, explicit preparation and no-acquire local reads. Complete Kubeconform analyzer/catalog dispatch, local schema policy, normalization and real positive/seeded-negative retained proof. Reconcile version/configuration/distribution/platform and bounded output for every required tool row; no installation or network during review. Do not equate five artifact targets or three-host refusal tests with five-platform analyzer success. |
| **O01** | Historical/focal preservation gates exist; no final integrated preservation receipt is attached. | Run named preservation for governed plan/code/re-review, PR, release, tiers, precision and legacy replay on the final candidate. Map each result to its specific G-C/G-E observation and host; no generic end-to-end pass closes the entire matrix. |
| **O02** | Public engagement/CODE/evidence/fix/probe proof exists in bounded deliveries; required final flow coverage remains to be reconciled. | Attach exact test names, result, source and platform for setup/request/report/fix/denial/interruption/retry. Include source/cache mutation, honesty of coverage, limits and unsupported prerequisites. Keep failed preparation/broad workflows recorded as failures even when corrected focused runs later pass. |
| **O03** | Documentation corrections and source embedding foundations exist; no final compiled CLI/Desktop inspection receipt is attached. | Build the actual production CLI and Desktop CLI payload from the final source, inspect prompts/skills/resources and record artifact digests/platforms. Align setup, diagnostics, user guide and rollback with the declared capability/platform matrix. Keep publication, promotion and owner app/server restart outside this readiness receipt. |
| **O04** | Focal independent reviews and hosted gates do not constitute final authenticated Grok acceptance or the campaign epic. | Obtain independent authenticated Grok adversarial review on the exact candidate and account for any access limitation. Pass package types, guards, boundaries and spawn checks, then the final full hosted epic. Retain one receipt binding SHA/tree, all 15 spine observations, all 29 G rows, all 83 tool rows, extra C03 tools, hosts, artifact hashes, documentation and rollback; no required pending row. |

## A05 — focused GREEN, landing blocked

[Draft #1684](https://github.com/gustavomhss/hugr-orchestra/pull/1684) main acceptance was refrozen at 235bee45d27f4215a5ffc681d7259788547cf5ff on source f469755b33bb478693d2d1dae022c010c2e47ebc. Its [history contract](https://github.com/gustavomhss/hugr-orchestra/blob/235bee45d27f4215a5ffc681d7259788547cf5ff/docs/specs/lucy/engagement-history-contract.md) and tests address captured-source Git history, exact Session scope, safe output, durable native binding and replay. **At that initial checkpoint, main-packet causal RED was qualified on three hosts and evidence/scope implementation started at 14:23 America/Sao_Paulo on 2026-11-28. The historical RED observations below are preserved; the later runtime and supplemental observations follow them.**

[Run 46168033618](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46168033618) used snapshot 8773659849344ef8c8a067586ef244082d8f276d:

| Host | Package typecheck | Behavioral tests | Job |
| --- | --- | --- | --- |
| Windows x64 | Failed | Skipped, not executed | [141049881674](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46168033618/job/141049881674) |
| Linux x64 | Failed | Skipped, not executed | [141049881850](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46168033618/job/141049881850) |
| macOS ARM64 | Failed | Skipped, not executed | [141049881853](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46168033618/job/141049881853) |

Cleanup succeeded. Linux logs identify optional-value/schema narrowing errors in the history fixture/bounds test, unresolved research-toolkit/process imports in boundaries/evidence, and associated Effect environment errors. This attempt remains failed preparation; it is not relabelled as causal RED.

The corrected [RED2 run 46169235061](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46169235061) uses snapshot fa569c9af8d4bd013a5b1b2e0f0d8881efc76501, with the refrozen contract and nine TypeScript files (50 cases across eight executed test files). All three hosts passed package types and reached 11 PASS, 39 causal assertion failures, zero skips and 609 assertions each. All test error lines are expect assertions; no type/import/setup/timeout failure caused those test failures.

| Host | Job | Omni spawns | Delegated | Duration |
| --- | --- | ---: | ---: | ---: |
| Linux x64 | [141053615117](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46169235061/job/141053615117) | 9,075 | 0 | 95.14 s |
| Windows x64 | [141053615126](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46169235061/job/141053615126) | 8,661 | 0 | 289.28 s |
| macOS ARM64 | [141053614826](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46169235061/job/141053614826) | 9,080 | 0 | 232.77 s |

[Cleanup 141055954610](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46169235061/job/141055954610) passed. The macOS setup log contains an earlier nonfatal setuptools installation diagnostic; it did not prevent successful types or execution of the 50 tests and is not counted as a test failure. RED establishes the missing behavior; it is not A05 GREEN.

The separate Core capture packet [46169869338](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46169869338) is tests-only source 9c94adc2cae53a7b806552f213ce468d582bf142, snapshot 39a99997e328ab9f3afb0a282bed38871170094f. It adds six contract lines and two native tests in research-process-capture.test.ts to preserve default/explicit tail capture and prove opt-in head capture under overflow. All three hosts passed types and reached one passing control and one causal assertion failure, with zero skips, 38 assertions, four Omni spawns and zero delegated spawns per host. The failure is Expected HEAD-CONTROL / Received TAIL-CONTROL; Effect and Bun log the same assertion twice, not two failing cases. [Cleanup 141057266925](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46169869338/job/141057266925) passed. Core production work was authorized at 14:27 America/Sao_Paulo. The JSON retains each host job ID and the frozen test hash. This is the historical authorization gate; it does not qualify the later implementation.

The intended contract keeps show/log/pickaxe/blame within captured ancestry and admitted file authority; discloses rename/copy/graph limits; prevents unsafe Git helpers/network/object databases; retains at most 4 MiB of normalized safe result with a valid model envelope at most 32 KiB; bounds traversal to 200 commits; and shares the existing 128 CODE/history admission budget. The full safe result, including a tail beyond the visible prefix, must remain bound to the original native settlement. All work shares the original engagement deadline.

Profile/role reachability must use the existing leaves and preserve off-route refusal, inferred ISO/SOC 2 and R20 owner permission. Binding.history and report-only scope policy are outside the existing governed hash projections; keep roster, seat/prompt metadata, historical review profile alias/base, global grants, versions and canonicalization unchanged. The staged lifetime acceptance does not by itself prove cancellation of real Git already in flight; retain that limit until separately demonstrated.

### Later candidate and supplemental gates

The [confined-history qualification record](engagement-history-qualification.md) retains every source/snapshot pair, preparation failure, test hash, native control and limit. Counts below are per host; they must not be combined into a synthetic GREEN across different sources.

| Observation | Exact source / snapshot | Hosted result |
| --- | --- | --- |
| Corrective Core selection | `c61824e868dc05464f3bad264f79d47df77d9606` / `ac4682fc770c24876b91a3d59d0c2349278c748b` | [46175626742](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46175626742): types PASS; Linux 10/10, Windows 8/8, macOS 7/7 selected cases. No complete Core/H10/A05 claim. |
| Corrective Maestro main selection | `c61824e868dc05464f3bad264f79d47df77d9606` / `87227ef058a5888ef58fa44837eb77639b9f333a` | [46175630629](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46175630629): types PASS; 37 PASS/20 FAIL each. Seventeen native-error observation failures; three child-placement failures under replace/graft/shallow overlays. |
| Adapter rebaseline | `832b138dddbc3749f82c8d124d940e97a3603be3` / `b2040b0a420c5084da3f71190512f089f90bf11a` | [46176934443](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46176934443): types PASS; 14 PASS/43 causal FAIL, 766 assertions each. Native `state.error.message` is now observed without changing production error output. |
| Full-call admission deadline | `85df1f71dc5ca54743602f78b2dc3fe9212f2eda` / `00b61283b845a31fcacfbdaf8487667a2bc8d293` | [46177720324](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46177720324): types PASS; 1 PASS/1 causal FAIL, 168 assertions each. Real retention returns `completed` after 31 seconds; a completed-call ACK after 31 seconds passes under the original 300-second lifetime. |
| Parent-placement preparation | `27075b4189c0f32c6bdf18dec84c8d9b44f934ac` / `d3e668c9976e1b856c2e26bf38f72d3c14ac3a1e` | [46178075785](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46178075785): all types FAIL, zero behavioral tests. Seven TS2339 reads used nonexistent `Info.subdirectory`. Invalid preparation, not causal RED. |
| Repaired parent placement | `afc80c2427d8a83045714c093652f034b42547ab` / `8d2b4adb1008079501bb1ce81a3a5e53b34915c7` | [46178957084](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46178957084): types PASS; 2 PASS/5 causal FAIL, 129 assertions and 186 Omni spawns each. Zero skips/timeouts/delegated; Session runtime GREEN was pending here and is separately recorded in GREEN3 below. |

Cleanup passed for these six runs. All executed selections reported zero delegated spawns. The adapter packet was authored after Main2 exposed its observation defect and baselined against pre-runtime parent `04deb51aae9f417509b88315863854ee4b4ad004`; it is not the Main2 runtime source. The deadline supplement was authored after a local deadline repair proposal and baselined before those three runtime deltas were published. Its negative stops at the native status assertion, so later error-reason and receipt-refusal assertions were unobserved at RED and are separately observed in GREEN3. The CAS observer delays return after the real link; a physical orphan is allowed. Waiting by the second operation is inferred from real completed readers and the held collector permit, not a private-queue assertion.

The narrow placement preparation repair uses existing `Info.subpath`, preserving all seven cases/values and the different `Created.data.subdirectory` Event field. Repaired RED2 then passed types and observed two shallow/graft placement failures, one invalid root success and two invalid directory/workspace successes. Missing-parent refusal and existing-ID retry passed. Session production work was authorized after that causal gate; its later seven-case GREEN is recorded below. The earlier invalid placement/imported-fix preparations and first production typing/runtime failures remain recorded. Subsequent source `0076ad37` integrates dev `8cf8407f`; its own GREEN3 observations follow. No merge of #1684 is claimed.

### Exact integrated candidate and GREEN3 observations

Production source **`0076ad37e7adb98746f63b0f95a8431a7a552b29`**, tree `ac7311841a3b15f950e2bca30e942ee057de2630`, integrates dev **`8cf8407fbd4508a59ea8465d947d5b06e5c49296`**. Its 17 production files and 15 frozen TypeScript acceptance/fixture files were checked against the published blobs. The shared FS/Omni dependency delta was reviewed separately. Global roster behavior, native profiles, prompts and grant/review-policy/roster hash inputs are unchanged. The host-only Session option changes only ordinary independent engagement callers; it is not a Protocol/HttpApi or generated-client change.

Each snapshot below differs from that source only by its CI request and the package-typecheck workflow step. The results qualify the named selection at these bytes, not arbitrary later dev or the whole campaign.

| Selection | Snapshot / run | Linux x64 | Windows x64 | macOS ARM64 |
| --- | --- | --- | --- | --- |
| Core: 9 files | `a1d6cc5ba999fb971caf7f1cce3e7893749c992c`; [46179990737](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46179990737) | 65 PASS, 0 FAIL; 529 assertions | 63 PASS, 0 FAIL; 444 assertions | 62 PASS, 0 FAIL; 443 assertions |
| Main: 11 files | `5a1dfc8627f5abebfc6229e4332e0550649196b6`; [46179992003](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46179992003) | 59 PASS, 0 FAIL; 15,366 assertions | 59 PASS, 0 FAIL; 15,380 assertions | 59 PASS, 0 FAIL; 15,373 assertions |
| Preservation: 23 files | `e9ba40cedf386f4a0596a191cbebcbbc519d0cde`; [46180600651](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46180600651) | 122 PASS, 0 FAIL; 23,973 assertions | 121 PASS, 1 timeout; 21,758 assertions | 122 PASS, 0 FAIL; 21,785 assertions |

All nine jobs passed package typing; there were zero Bun skips and zero delegated spawns. Core/Main/preservation cleanup jobs `141088575354`, `141089932641` and `141091855509` passed. Guards [46179962338](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46179962338) and Atlas guard [46179962334](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46179962334) passed at the same production source. Counts are executions, not a count of unique requirements. R8/native read jail and scoped-TypeScript positive qualification are platform-specific; portable refusal controls do not establish equivalent native capability.

The seven inherited-parent-placement cases now pass on all hosts, alongside native create/removal/lifecycle/move preservation. Both deadline cases pass: the full callback includes Core, collector admission/CAS and final output; a legitimate later ACK still uses the original engagement lifetime. The negative error-reason/receipt assertions and successful child row/event assertions that were unreachable at RED are now observed. No frozen assertion or timeout was weakened to obtain these results. The pre-transaction parent-move race remains source-reviewed, not directly injected by the new supplement.

**This is focused GREEN with landing blocked.** The post-GREEN source review identified a parent-directory substitution/restoration window and confirmed the unbounded-before-admission Bun enumeration allocation. See [open findings](engagement-history-open-findings.md). No exploit, output leak or host OOM was observed; the missing authority/resource guarantees still prevent recommending merge of the enabled route. Earlier source-PASS is narrowed by this finding, not an unconditional current landing approval.

Windows preservation failed only in the existing `lucy-governed-round.test.ts` case at 5000.88 ms against its unchanged 5000 ms limit. No assertion mismatch or blocked await was reported. The [unchanged-file diagnosis](engagement-history-open-findings.md#windows-preservation-timeout) keeps this original failure and compares the exact same test blob on the base and candidate. No complete H10 GREEN is claimed.

The [profile/role crosswalk](engagement-profile-qualification.md) credits 14 native H08 cases (12 with an own-leaf positive, two child CODE positives with history/forensics refusal) and 13 native variant preservation cases. It distinguishes dynamic skill execution from a delivered brief, stored scope, direct registry calls and scripted Session ports. Remaining own-leaf, sibling-negative, skill-load-budget, transcript and report-semantic evidence is named there; a passing file name is not substituted for it.

### A05 closure still requires integrated evidence

The observed passing history selection proves its named operators/access/native integrity; it does not prove every forensics report or every existing skill role. Link existing native variants and actually routed security/agents positives/negatives to the full profile/role matrix, retaining original grants/load/tool budgets, no author transcript, max-three/half-noise and zero diligence/artifact variants. Audit/diligence forensic observations still need explicit paths, time window, sources and limits for hotspots/reverts/concentration. Do not invent a rating system, new forensic agent or new delivery-ingestion mechanism.

Artifact history/forensics N/A, no history inheritance to lenses/verifiers/variants, Atlas refusal in new independent engagements, inferred ISO/SOC 2 and owner-permission R20 are accepted boundaries. They are not missing implementations. Preserve complete per-profile report behavior, H10 (legacy/global/PR/governed/CODE/probe/fix/variant/source/scratch/earlier Atlas), the relevant G-C12/G-C13/G-C14 and G-E1/G-E10/G-E11/G-E12 observations, then actual CLI/Desktop skill artifacts and final Grok/epic evidence at the integrated head. Unlinked evidence is not proof of absent code.

The open parent-directory authority finding prevents recommending landing. Separately, the current 256 MiB object-store copy and 16,384 accepted-entry limits do not cap Bun 1.3.14's earlier eager `Dir.read` enumeration allocation. Git child RSS does not cap host memory. A proposed `git ls-files` replacement was rejected for nested-repository discovery before validation; no alternative enumerator is qualified. H07 also retains its explicit absence of a separately suspended real Git interruption proof. No focused GREEN silently closes either limit.

## Compliance — C01/C02/C03 remain open

The [integrated execution source](https://github.com/gustavomhss/hugr-orchestra/blob/a959b3fffcbb9d1d2a36c0557f1de1b94c8a91a4/modules/maestro/coordination/src/v2/tools/review-engagement.ts) (blob d2a5a3f79b0b6a83d97e1e6084c8b96d052a3f21) still returns engagement-profile-unavailable for compliance before source capture or Session work.

After A05 is accepted, freeze one cohesive operational contract covering report, unresolved human decisions, replay/lifetime, fix review and profile/role skills. Reuse the strict existing finding/report machinery; do not introduce certification, developer scores or a governed verdict. Zero variants and legacy durable byte semantics remain.

C02 must complete the existing cyber, ai-act, accessibility-law, licensing and evidence stubs narrowly and preserve substantive privacy/controls guidance. The accepted G10 inventory includes CRA SBOM/reporting/contact questions; AI Act amendment, Article 50 dates and Article 19 retention; NIS2 clock; DORA; EN 301 549; Data Act; DSA; SSDF practice tables; and Scorecard. These are questions about uncaptured primary authority, not assertions of current legal duties or dates. ISO/SOC 2 stays inferred.

C03 retains **OPA, Kyverno, ORT and axe-core in addition to the original 83**. Each needs its own actual backend/capability, pinned preparation, real positive and seeded-negative proof, missing/unsafe outcomes, output normalization and typed native evidence producer. ORT's stages and axe-core's DOM/browser backend require an explicit contract before invocation design. An unavailable intermediate tool outcome does not close C03.

Production knowledge proof must inspect the actual compiled CLI and the CLI payload staged by Desktop in resources/cli, with artifact hashes. The old Node-sidecar wording is not a substitute for inspecting the current packaging architecture. Source-tree or synthetic-loader tests alone do not close C02/O03.

## Kubeconform P1 — integrated preparation, analysis still open

[#1666](https://github.com/gustavomhss/hugr-orchestra/pull/1666) merged at a959b3fffcbb9d1d2a36c0557f1de1b94c8a91a4. The [qualification receipt](kubeconform-preparation-qualification.md) binds source c6a16ad8165d1152a2815e2f3a6582243ca0aa6c, frozen RED2, hosted snapshots and explicit limits.

| Scope | Established focal result |
| --- | --- |
| Linux x64 public preparation | Explicit-once permission, Maestro/input gates, private identity, bounded native version probe, mixed shfmt/Kube ordering and mutation/missing-dependency refusal. |
| Identity and notices | Five measured artifact identities and all 19 notice origins retained; old completed global installs remain unchanged and invalid notices fail closed. |
| Local reads | No acquisition through ordinary/endpoint sandbox selection; default preparation behavior preserved. |
| macOS/Windows | Active public preparation/read refusal and integrity checks; no claim of successful public Kube preparation or Kubernetes analysis. |
| Preservation | Existing Linux shfmt/cargo-machete conformance and read confinement; Windows preparation/AppContainer controls. |

Hosted acceptance: [Core 46164949485](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46164949485), [Maestro 46165129953](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46165129953), [Linux preservation 46165199326](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46165199326), [Windows preservation 46165202534](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46165202534). The receipt records 78 executions across hosts, 1,994 assertions and 873 Omni spawns, with no test skips/delegated spawns; these are focal execution totals, not distinct campaign requirements. The new acquire:false AppContainer policy-failure fallback was source-reviewed but lacks a direct frozen test for that exact branch.

Still required: analyzer/catalog dispatch, local schema policy, normalization, typed retained output, real positive and seeded-negative manifest validation, compliance integration and final artifact/platform acceptance. P1 does not close licensing/distribution decisions or the original Kubeconform analysis row.

## R8 — integrated concurrency correction

[#1680](https://github.com/gustavomhss/hugr-orchestra/pull/1680) merged at 156386010fe22cd7b61cd3b75fcbe62db657305b. The [public contract and qualification](probe-concurrency-contract.md) records the unchanged frozen test SHA c4d748585c15962ccf8017d4885f297d9bfe7d4dfb4e86120fe17e4b5063f609.

[RED 46164127662](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46164127662) passed types and reached two Expected waiting / Received spawned assertions after real controls. [GREEN 46164792753](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46164792753) passed types and 15 tests, with 195 assertions, 193 Omni spawns, zero delegated spawns/skips and successful cleanup. It includes the two frozen cases and existing scoped-typecheck, probe-cancellation and probe-dispatch preservation.

The correction makes scoped TypeScript probes share the existing process-global permit, bounds and interrupts acquisition, preserves waiter/owner separation and retains ownership through cleanup. It qualifies Linux x64 concurrency, adds no runner/platform and does not close final Lucy acceptance or the separate artifact-cache pin revalidation question.

## Original 83 tools — mechanisms preserved, closure still explicit

The [complete map](tool-mechanism-reconciliation.md) and JSON retain every original name, recorded Q1 identity, card/blob, actual form, existing mechanisms/routes, source tests, public evidence and next criterion. **Ten names have a named mechanism/component observed; 73 have specific evidence not linked in the inspected set. These are neither delivered/absent counts nor a scope cut.**

| Observed mechanism | Names / distinction |
| --- | --- |
| Local checks | cargo-machete and shfmt: specific preparation/raw checks and focal native/public evidence. |
| Repo/CI | Clippy and Mypy gates; tsgo in the product's own typecheck. These do not automatically become independent Lucy producers. |
| Index and query | SCIP codec/indexers/cache/queries and Atlas adapter exist; CLI/codec/indexer identities and prepared-query vs producer proof remain distinct. |
| General LSP | Pyright, RuboCop and clangd with clang-tidy exist. Lucy's reviewed LSP collector is TypeScript-only; ESLint host presence does not select typescript-eslint. |
| Backend/preparation | Kubeconform backend provisioning existed and P1 adds explicit Lucy preparation; analyzer qualification remains open. |

The 83 forms comprise 24 native executables, 33 runtime/VM CLIs, six toolchain components, nine libraries/plugins, six subcommands, four protocol/component suites and one declarative metapackage. Preserve loom/shuttle harnesses, compiler plugins, sanitizer runtimes, PMD/CPD sharing and Roave's solver behavior as their actual forms. Do not conflate tsgo with tsgolint, PMD CPD with jscpd, an OpenGrep fixture label with execution, pytest conftest.py with Conftest, or the word reuse with REUSE.

Independent input.evidence admission is checked before local/repo/build dispatch and currently qualifies only the exact oxlint producer. New capabilities require exact typed native producer/recipe/binding proof; generic installer/SARIF/probe availability is not enough. Reconcile identity differences in Clippy/tsgo/Pyright/clang-tidy/RuboCop rather than silently adopting the historical Q1 version.

## All 29 coverage rows remain tracked

The full exact observations, existing proof targets and spine links are in the JSON. Targets are not PASS claims; no row has a final exact-source receipt yet.

| ID | Required observation | Spine links |
| --- | --- | --- |
| G-C1 | Governed/PR diff review returns a result/receipt bound to the exact source and refuses stale or wrong scope. | A01, A02, O01 |
| G-C2 | Plan intent, acceptance, invariants and assumptions cite source or report nothing found; unsupported plan claims are not confirmed. | O01, O02 |
| G-C3 | Re-review carries the exact prior finding and retains or updates its disposition without duplicate execution. | A04, O01 |
| G-C4 | The independent verifier receives finding and code only; unproved candidates stay questions and cannot self-confirm. | O02 |
| G-C5 | A real installed mutant and fail-before/pass-after adequacy evidence pass through public dispatch; fake or pass-only proof is rejected. | A04, O02 |
| G-C6 | Deterministic interleave and property shrinking pass through public dispatch; stress is not promoted to deterministic proof. | A04, O02 |
| G-C7 | API/wire/data overlays select the compatibility lens with bound quotations/probes/evidence; old receipt/schema replay remains unchanged. | A04, O01 |
| G-C8 | Security/supply-chain review selects correct packs/handoffs and retains real offline advisory and missing-database outcomes. | T02, T03, O01 |
| G-C9 | Change/provenance overlays check exact release bytes/source SHA and report absent proof as not run. | O01 |
| G-C10 | Maintainability findings require measurable direction and evidence; pre-existing debt or taste cannot become confirmed blocking findings. | O01 |
| G-C11 | UI overlays require experience/accessibility/state evidence from a reproducible measured fixture or explicit not examined; no inferred UX pass. | C03, O02 |
| G-C12 | Artifact requests use artifact and security/agents leaves, zero variants and no verdict/governed receipt; R20 remains not examined without owner permission. | A01, A02, A03, A05 |
| G-C13 | Repository audit returns a captured-source report with timebox, at most three generations/half-noise stop, fix review and exact coverage. | A01, A02, A03, A04, A05 |
| G-C14 | Diligence maps P0–P3 to deal breaker/price/condition/observation, has zero variants and retains human questions. | A01, A02, A03, A05 |
| G-C15 | Compliance returns evidence/confidence/human decisions and every required G10 open question; four additional tools plus Conftest/ScanCode/REUSE are accounted for. | C01, C02, C03, T01 |
| G-C16 | Every original Q1 tool retains actual capability/backend/invocation/platform and positive/refusal/public proof; no substring aliases or dropped requirements. | T01, T02, T03 |
| G-E1 | Only actual review tool grants and read-only code/context are available; analyzers/probes are allowlisted and confined. | A04, A05, T03, O02 |
| G-E2 | atlas_context is read-only and Session-root-bound with Lucy Atlas Memory disabled. This preserves earlier admitting routes; independent engagement H08 Atlas refusal remains unchanged. | A05, O01 |
| G-E3 | Strict review-result/work-result assembly works on plain Task; malformed cards remain unparsed. | A02, C01, O01 |
| G-E4 | Public requests cover every in-scope profile/tier with host-selected base rules; engagement/compliance reports remain distinct from governed receipts. | A01, A02, C01, O02 |
| G-E5 | Full finding/routing/catalog/item/outcome identity and legacy receipt replay are preserved. | A02, A04, O01 |
| G-E6 | Queue admission includes bound reviews and refuses open FIX_FIRST/REJECT outcomes. | O01 |
| G-E7 | Real SARIF normalization and read-only LSP cover positive, unsafe and failure fixtures. | T02, T03, O02 |
| G-E8 | Validation rejects the reviewer as routed worker before Session work. | A01, O01 |
| G-E9 | Ability lists expose the actual Lucy tools with no empty/dead ability. | A05, O01 |
| G-E10 | Actual scratch capture is faithful, read-bound and preserves dependency shadow/write policies. | A02, A05, T02, O02 |
| G-E11 | Per-Session grant intersection, entry/load/tool budgets and all engine hosts preserve off-route skill refusal and prevent author-transcript leakage. | A03, A05, C02, O02 |
| G-E12 | Pure deterministic catalog digest/routing and node reachability are verified in production CLI/Desktop packaging. | A05, C02, O03 |
| G-E13 | Receipt-bound precision/outcomes run exactly once, derive rule state and retain fallback behavior. | O01 |

G-E2 preserves read-only Atlas Context only on the earlier routes that admit it. New independent engagement scopes deliberately refuse Atlas under H08; this checkpoint does not require widening audit/diligence/artifact authority. G-E10 retains the original route.test.ts target as inherited planning history and adds the current scratch-copy.test.ts, review-code-source.test.ts and review-code-source-scope.test.ts source-verified targets in the JSON. These targets are not PASS claims, and routing tests alone do not prove scratch capture.

## Evidence corrections retained

- #1670's [broad matrix](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46156144311) failed on fixture timeouts. The [corrective focused matrix](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46157003721) passed all ten focused cases on three hosts. Exact-name reconciliation records 53 passing cases on Linux and 52 plus one native-only skip on macOS/Windows; it is not a single all-green broad workflow.
- The [historical fix-review baseline](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46116584161) includes a Windows F6 timeout. All 27 Windows failures must not be called demonstrated assertion-level RED.
- The Q1 zero-runtime sentence refers to its research batch. It neither erases later shfmt/cargo-machete delivery nor qualifies every researched tool.
- Old completion-plan prose and [#1558](https://github.com/gustavomhss/hugr-orchestra/issues/1558) remain historical inputs, reconciled against later merges.
- A05's first attempt failed preparation on every host. Corrected future snapshots must receive their own types/causal-RED assessment.

## Next execution order and final receipt

1. Preserve Core/Main GREEN3 and correct the two A05 acquisition blockers with frozen hosted regressions. Keep the Windows failed preservation and paired diagnosis visible; reconcile the remaining profile/role, transcript and report evidence using the crosswalk before adding tests. Require exact integrated qualification for the corrected candidate; focused GREEN does not close A05.
2. Freeze and qualify C01/C02 on the accepted scope policy; add each C03 producer as a complete bounded vertical with public proof.
3. Complete Kubernetes analysis after P1, and continue the 83 rows by actual mechanism/dependency. First link existing evidence where available; do not infer missing implementation from an unreconciled status.
4. Attach final named evidence to all 15 spine and 29 coverage observations. Build/inspect the actual CLI/Desktop artifacts, finish guide/setup/diagnostics/rollback, obtain authenticated Grok review, run final exact-source gates and the full hosted epic.

The final receipt binds source SHA/tree, all required observations, the 83-tool and extra C03 matrices, platform outcomes, production artifact identities, adversarial review and operations guidance. No wave count, research completion, unavailable result or partial source review substitutes for it.

## Operating boundaries

- Preserve approved deferrals: GitHub/GitLab output, MCP pack bridges, Lucy Atlas Memory, scored evaluations/ablations, project budget overrides and Interface-owned card rendering.
- Hosted runtime tests only; compilable frozen acceptance and causal assertion RED precede new behavior.
- Do not manufacture RED for already delivered behavior; use preservation gates.
- Installation/preparation is explicit and separate; no acquisition or network during review.
- Use isolated write sets and serial integration, preserving unrelated dev changes.
- Native execution and evidence remain bounded by original source/scope/deadline/budget and existing Omni/process boundaries.
- Keep certification, developer scoring, inferred ISO/SOC 2 and R20 owner-permission semantics explicit.
- Final readiness does not authorize release publication, promotion or owner app/server restart.
