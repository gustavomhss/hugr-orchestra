# Atlas and Relay completion — isolated session

Base: `74d6b97d4fd4a50934830f07acd0863e0e73bef7` (`fork/dev` at admission).
Integration branch: `atlas-relay-finish`. This plan supersedes the two obsolete plans left in the canonical checkout; those originals remain preserved.

## Completed work to reuse

- UI byte preservation and admission fixes are already landed.
- Native read-only Atlas context access for Archie and drill closure are already landed.
- Relay binding, current-step delivery and settlement are implemented.
- Historical live05 qualifies foreground authoring and exact transfer only.
- Existing ratified Atlas fixture is retained. It is not evidence of worker execution.

Do not rebuild Jimmy, reopen historical Archie work packages, or repeat completed UI tests.

## Actual remaining chain

1. Resolve an existing permitted provider through the normal native provider path. Three startup/metadata attempts made zero model calls. Their failures remain historical evidence, not product acceptance.
2. Run one real native Maestro-to-Archie authoring task. Capture actual catalog and self-selected unit calls, proposal bytes and attributable unarmed Relay graph.
3. Persist attributable V3 grounding, validate and present the exact scoped work for genuine owner approval. General continuation instructions are not approval receipts.
4. Execute two real worker Sessions using the supported Orchestra workflow engine, with explicit write roots and current-step-only delivery. Respect native scope/approval sequencing.
5. Read back actual host axiom/checklist/settlement evidence and frozen-artifact completion review.
6. Run change-appropriate package typechecks and one consolidated final CI for any product changes. External harness execution is a separate evidence lane; repository CI cannot qualify external files it never uploads.

## Final state — governed chain completed through authorization; arm seam absent

The governed chain ran end to end on real data. `maestro_record_admission` → `READY_TO_DRAFT`, `maestro_catalog_context`, `maestro_record_plan_revision` → `PROPOSED` (`evt_maestro_plan_revision_cc7c7c54…`), `maestro_record_context` → `GROUNDED` with its own receipt, `maestro_record_validation` → `VALID` (`evt_maestro_validation_21b8eaee…`), `maestro_request_review` → `APPROVE` (`evt_maestro_review_02bb1517…`), `maestro_present_approval`, `maestro_record_approval` → `APPROVED`, and `maestro_grant_authorization` → `evt_maestro_authorization_e5b00f002…`.

Two defects were mine and were fixed by reading the code, not by loosening checks: the plan revision must be recorded in the Session that dispatched the Task because `plan-revision.ts:146` overwrites `parentSessionID` with the calling session; and the owner approval must be the exact last user message because `approval.ts:264` accepts only `/^(approve|aprovo)[.!]?$/` and `approval.ts:146` rejects any intervening message. Identical repeated `aprovo` is deduplicated by exact retry, so a distinct spelling that still matches the regex was required.

The chain stops at arming. `maestro_arsenal_describe` declares `relay-arm` `arm` as requiring `sourceRoot`, `token` and `contract`, but `sourceRoot` appears nowhere in this source tree, in TypeScript or in the Python Relay tools. Arming failed with `execution_failed`. No worker was dispatched, no source was modified and nothing was fabricated.

Therefore the test as designed cannot pass on this revision: the arm and worker-execution seam is not present. The owner's earlier judgement was correct. What is proven real is everything up to and including authorization — real model transport, Archie reading Atlas with self-selected units, an authoring run ending `ended` with no blockers, a published runnable Relay document, byte-identical Atlas materialization, full durable governance records, real cold-review approval by Lucy, and the owner's real approval producing a real authorization. Two workers never executed, and no final CI bundle was dispatched.

## Earlier checkpoint

Seven cold reviews by Lucy ran against this plan. Findings narrowed monotonically: 3 → 2 → 2 → 1 → 1 → a structural contradiction → one remaining finding. Each round the author repaired what was actually wrong, and the plan now carries an exact decimal conversion contract, big-integer aggregation with a named public boundary, a host-enforced acceptance transition with two named records, campaign-level scope split from withheld per-step execution, and the published Relay document bound.

The remaining finding is that Step 2's `src/checkout.ts` scope is not verifiable inside the pre-gate document. Lucy wants the path declared in the plan. The owner explicitly chose to keep it hidden: campaign scope is declared at the top, per-step execution content stays host-held behind the acceptance gate, and the host enforces disjoint `writePaths` at dispatch (`packages/orchestra/src/maestro/workflow-host.ts:270` rejects any write outside the bound paths). That is an owner product decision about what may be visible before settlement, not a defect. It was not applied, so this plan does not close and no approval presentation was produced.

Verified and not repeated: real provider transport, Archie reading Atlas with self-chosen units, an authoring run ending `ended` with no blockers, a published runnable Relay document, `READY_TO_DRAFT` admission, a durable plan revision, `GROUNDED` context with its own receipt, and `VALID` validation. Approval, worker execution and the final CI bundle were never reached and are not claimed.

## Earlier checkpoint

Model execution works through an isolated read-only Codex transport. A minimal probe returned `TRANSPORT_OK` with upstream HTTP 200, and the trace shows no credential write and no refresh; the account store is read through the normal Auth service and expiry within 60s is refused instead of refreshed.

Archie authoring ran for real in the isolated author worktree. Parent `ses_ebfcd0946ffe7k0CYH5oap69XD` dispatched exactly one foreground `task` to `archie`; child `ses_ebfccf752ffeWeQSKiWU2XYv6W` made five completed `atlas_context` calls — one catalog plus four autonomously chosen unit reads, all `coverage.state: complete`, `graphCoverage: COMPLETE`, `FRESH`, `currentBlobsChecked: true`, each carrying real content and receipt hashes. The model was never told which units to read. Nineteen Atlas materialization files in the author worktree are byte-identical to the ratified original, so the only author write is `proposal.md`.

The first authored graph guessed the schema and was rejected by `RelayAuthoring.Document`. Lead review, not the model report, established that. One corrective pass (parent `ses_ebfcb2b74ffe2DFMfZSUnw4CuM`) supplied the exact required field shape; the corrected document now decodes successfully: `active: false`, `activeVersionId: null`, `versionCounter: 1`, a `relay.startTrigger` with a real brief and retry budget, two `relay.execute` steps with distinct single-path write scopes (`src/money.ts` then `src/checkout.ts`), name-keyed connections, and progressive-reveal tags. Proposal is 18319 bytes, sha256 `d04386d8936328999442600e`.

Still missing: `upstream-result` in the file, durable V3 grounding, publication, real owner approval, and both worker sessions. Nothing has been approved, armed, published or executed.

## Earlier checkpoint

Runtime and dependencies now live in the integration worktree. Explicit normal provider configuration exposed the advertised `opencode/nemotron-3.5-lightning-free`; the earlier empty connected list was a harness configuration issue, not missing multi-model support.

A separate author worktree `atlas-author-team`, branch `atlas-author-proof`, uses fixture base `24b633c5c5e3175697a4547775851c1750c93823`. Only manifest-listed, hash-verified Atlas artifacts were transferred; the original fixture is preserved. Parent Session `ses_ebfdeae66ffehK5H4rcjD7aWGr` was created with verified directory/project/native-engine identity before its single prompt.

That prompt ended with provider HTTP403: `OpenCode's free tier can only be used from within OpenCode. Download it at https://opencode.ai and keep building.` No Task, Atlas tool call or worker execution was reached. This is not authoring acceptance. No retry, client-identity spoof, credentials change or alternate-provider fallback was performed. Evidence is in `run04/`; the exact owning backend is closed by `close.ts` after identity verification.

The remaining model execution requires an actually usable authorized provider route. The free-tier refusal is preserved as a blocker; source multi-model support is not reopened as an implementation task. No final bundle CI has been dispatched.

## Isolation contract

- Only the lead writes in this integration worktree.
- Every shell command has explicit `workdir`; file tools use absolute paths.
- The task tool does not expose directory binding. Subagents are read-only until a separately bound writer runtime is proven.
- Any future writer gets its own worktree and branch, pinned base, exact owned paths, and a verified effective directory before edits.
- No branch-changing or destructive Git commands in the shared canonical checkout.
- Transfer only the explicit allowlist in `ISOLATION.json`, preserving hashes and originals. Imported helpers require adaptation and review before execution.
- Keep pending worktrees and historical evidence. No automatic cleanup of another team's resources.
