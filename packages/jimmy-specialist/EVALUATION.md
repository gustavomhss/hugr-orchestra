# Bounded discovery evaluation preparation

Status: preparation only, including the executable R14 interruption lane added from `3a62efbcee64072a36b837d09d0beac62bd0386d` and bounded native compaction prepared on `a28c97d515e44f136eaceea4d51c7a2549842d84`. No model/provider calls, tests, mutation probes, CI, typecheck, builds or installs were run for this work package. The source driver always records `provisional-pilot` and `qualityGrade: not-run`; neither a returned Task nor a digest-checked document is a quality pass. Governing contracts: `specs/jimmy-specialist/audition.md` §§1, 4–5 and `delivery-plan.md` WP02/WP10/WP11. No private evaluator/oracle/manifest was read during development.

## Freeze before execution

The implementation starting point for this work package is `6b5a831c0cbd915f8855f438fce39150a85fdf32`. **That is not a declared evaluation comparator.** The evaluator and lead must select and record the actual baseline behavior, source SHA, prompt, skills, native dispatch adapter, tool inventory and result interpretation. Do not substitute the backend seat, remove selected candidate tools and call that the baseline, or silently transplant a candidate harness into an older build. If capabilities differ, label a system comparison; attribution to a method/tool requires a separate measured comparison.

Freeze the final integrated candidate revision after charter review, generated-consumer and packaged-runtime checks. Freeze the comparator separately. Record:

- Full clean source SHAs; lockfile, runner, executable/build, prompt and declared skill-tree digests; OS/architecture and source/Bun/desktop Node lane. Source checkout identity does not establish compiled packaging parity.
- Public input manifest and every disclosed file digest; evaluator-owned scenario/oracle revision and question digest. No private manifest, expected answer or reference assertion enters either candidate tree, refs, tools, Atlas corpus or network.
- Actual provider/model (`openai/gpt-6.1-sol` for this pilot), account route/transport, effective model limits, variant, temperature/options/defaults and native tools. An absent setting means the runtime/provider default, not an invented deterministic value. Effective seat prompt digest is not a digest of the complete provider request.
- Identical case/source captures, starting Atlas state, setup procedure, cold/warm condition, provider/tool/byte allowance and wall-clock timeout policy for each pair. Predeclare the limit across all R14 phases and each authorized new-dispatch allowance; a resume must not hide extra budget.
- Independent mandatory assertions and critical authority/evidence failures. Three repetitions are a stability cohort, not statistical proof of superiority. Any comparative speed/cost threshold and sample design must be chosen before results; none is invented here.

## Schedule and isolation

Schedule R01–R14, repetitions 1, 2, 3, both frozen arms. Keep all scheduled slots, setup failures, interruptions, retries and repairs. No best-transcript selection. For each case, use baseline→candidate order for repetitions 1/3 and candidate→baseline for repetition 2; record this fixed order before calls. A repair creates a new attempt linked to the failed slot, never replaces it. Infrastructure failures are `inconclusive` or named failures, not omitted successes.

Each fresh slot gets its own previously nonexistent run root and native DB, config, home, cache, state and temp paths. Start cold by default; any warm condition requires the same frozen initialization on both arms. Parallelize preparation and independent grading, but do not run overlapping Atlas writers in the same root or create unsupported multi-process writer claims. Never use the live app DB or restart the owner's app/server.

The pilot exclusively creates the run root and all declared isolated directories before native runtime imports, copies only digest-matched regular disclosed files, refuses traversal/links/ambiguous selections and `.git` metadata, and uses exclusive artifact writes. The exact original bytes are also frozen write-once, mode `0400`, in host-only `state/frozen-public/<sha256(relative-path)>.bytes`, outside the child's source Location and native external-directory read scope. Retain this archive with `preparation.json`; candidate files are not a historical evidence oracle. Pilot config is injected outside the source snapshot: a supplied `orchestra.json` is preserved as evidence but is not executed. Module-level XDG/Global paths are isolated before native imports; inherited Orchestra settings, external skills/config and credential inheritance are disabled. Native macOS managed preferences cannot be redirected by this runtime, so their presence blocks this pilot.

**These are state/config boundaries, not an OS filesystem/network sandbox.** The executing evaluator must arrange a separate OS account/container/VM or equivalent enforced capability boundary: the model's native tools must have no read route to private evaluator storage, grading processes, another arm's state, developer checkout or live owner data. The trusted runner alone reads its question through the already-existing `--manifest` interface. A same-user private path plus an instruction not to read it is insufficient. Establish the native packaged-skill read exception explicitly. Use replayable source captures; qualify any live acquisition separately with actual captured bytes and scoped endpoints.

### Read-only OAuth

The pilot takes the legacy OpenAI OAuth file path before changing its process home, reads it into memory, and supplies a read-only Auth service. It does not copy credentials into run files, environment JSON or a DB. `get/all` reject empty access and expiry within 60 seconds; `set/remove` fail. This also stops the normal Codex refresh branch before it receives expired/empty access. Refresh tokens are never deliberately used by the pilot. Expiry mid-run is a retained infrastructure failure: the owner refreshes through the owner-controlled login flow outside the trial, then the evaluator schedules a new attempt. No automatic refresh, mutation or persistence is authorized.

`research-credential-probe.ts` is unchanged. It is not a hermetic trial runner: its native service reads use default placement unless the operator isolates the environment. Do not run its `--models` provider-listing path during preparation. Credential/model availability has not been measured here.

## Operational prerequisites still open

| Prerequisite / owner | Exact missing setup and affected scope |
| --- | --- |
| Comparator / evaluator + lead | Baseline revision and native behavior have not been declared in the governing plan. Its runner, decoder, actual ceilings and telemetry must be qualified; a SHA alone cannot define comparison semantics. |
| Final identity / lead | Integrated final charter, actual loaded skill revisions, generated clients and production build identities remain to be frozen and checked. This source-only driver is not the Bun binary or desktop Node path. |
| Semantic navigation / evaluator + runtime lead | Defaults remain `lsp: false` with downloads disabled. `--setup` can declare preprovisioned, digest-checked explicit LSP executables and initialization; every unselected built-in server is disabled. Provision actual server dependencies, TypeScript/tsserver, fixture tsconfig/package/lock/generated inputs and positive known-reference controls, then qualify initialization/readiness and partial/timeout coverage. Hashing the launcher alone does not identify all its dependencies. No semantic readiness was measured; R02 and dependent R03/R04/R13 variants remain unqualified. |
| Git/build history / evaluator | The copier supplies regular snapshots, not a Git history or a deployed build. Any R05/history-dependent scenario needs a separately frozen isolated repository, allowed revisions, effective build/config and observations. Do not let native history queries walk into the author's repository or treat a lockfile as deployed execution. |
| Atlas / evaluator | `--setup` accepts scoped `maestro.atlas` config and a hashed preprovisioned gitleaks executable. It creates no Memory entries or Own artifacts. Provision actual project identity, verified Own coverage, frozen owner state and controlled outages where required. `snapshotGit` creates a new disclosed snapshot commit for native Memory's readable-HEAD requirement; it does not supply original history or qualify pre-existing Own snapshot ancestry. Actual native receipt admission remains mandatory. The no-install toolkit target selects native PATH scanner fallback, a separately labelled lane requiring real clean/secret controls. |
| R14 / evaluator + runtime lead | Native interruption/compaction/resume adapter uses the integrated pure `AtlasResume.selectedRef(history, key)` export. Qualification is UNRUN. Supply a fixture permitting the real model to reach a durable finding with contrary evidence, an actually failed approach and its own admitted task checkpoint. Task end, unavailable scanner/checkpoint and absence of an interruptible stream remain named failures; expired total/first-dispatch deadlines take precedence over `checkpoint-not-reached`. Native compaction must produce a real summary and remove substantive history from model-visible context before resume. No replacement Task is invented. Exact restoration and resumed evidence reopening are observed separately. |
| Credential/model lane / owner + evaluator | Confirm permitted model/account route, access lifetime and actual transport/settings without persisting or refreshing inherited OAuth. No availability trial was run here. |
| Deadline containment / evaluator + runtime lead | Provision an outer process deadline and owned-resource cleanup, shared by both arms. The integrated Task rejects pre-aborted dispatch, checks cancellation before starting work and handles an already-fired signal after listener registration, cancelling both prompt and owned job. New native controls are UNRUN; cooperative cancellation is not a measured hard cleanup deadline. Execute startup/hung-tool/helper controls in the final runtime lane, record timeout/cleanup separately and preserve partial state. |
| Cold oracle / independent evaluator | Private expected answers, controls and grade thresholds are evaluator-owned and were not inspected by the author. Calibrate known-good, alternate-valid, plausible-wrong and applicable infrastructure controls before attributing a failure. |
| Host/runtime bounds / qualification lead | Run N/A controls and supported macOS/Linux/Windows source/compiled/desktop lanes at final closure. Configured `Research.Limits` describes allowances; it is not proof that every attributable request/byte was bounded. |

## Commands: existing fresh-dispatch source lane

These are future evaluator commands, not author execution results. Paths/SHAs below are operator-supplied frozen values, never private fixtures stored in this repository. Parent `RUNS` must already exist outside all Git repositories and public inputs, so native source discovery cannot walk into an unrelated ancestor repository. The pilot creates the leaf; do not `mkdir` the leaf first. Dependency installation, if needed, is from the selected worktree root with `bun install --frozen-lockfile --ignore-scripts`.

Run from the frozen candidate's `packages/orchestra` directory:

```sh
export CANDIDATE_SHA='<full final integrated source SHA>'
export PUBLIC_INPUTS='<absolute disclosed fixture root>'
export QUESTION_MANIFEST='<absolute evaluator-owned question manifest>'
export RUNS='<absolute existing isolated run parent>'
export CASE='R01'
export REP='1'
export TIMEOUT_MS='<predeclared positive integer dispatch milliseconds; at most 2147483647>'

git rev-parse HEAD
git status --short
bun run script/research-pilot.ts \
  --case "$CASE" --inputs "$PUBLIC_INPUTS" --manifest "$QUESTION_MANIFEST" \
  --run-root "$RUNS/$CASE-rep$REP-candidate-attempt1" \
  --source-revision "$CANDIDATE_SHA" --timeout-ms "$TIMEOUT_MS"
bun run script/research-documents.ts "$RUNS/$CASE-rep$REP-candidate-attempt1/state"
```

For a comparator with this **independently reviewed source-driver interface and equivalent native dispatch**, run from its own frozen `packages/orchestra`, in the scheduled order:

```sh
export BASELINE_SHA='<evaluator-declared comparator SHA>'
bun run script/research-pilot.ts \
  --case "$CASE" --inputs "$PUBLIC_INPUTS" --manifest "$QUESTION_MANIFEST" \
  --run-root "$RUNS/$CASE-rep$REP-baseline-attempt1" \
  --source-revision "$BASELINE_SHA" --timeout-ms "$TIMEOUT_MS"
bun run script/research-documents.ts "$RUNS/$CASE-rep$REP-baseline-attempt1/state"
```

**The comparator interface is a prerequisite, not an assertion that a historical revision supports these commands.** If it differs, the evaluator must supply and freeze its actual executable command/adapter before scheduling pairs. Do not replay this script against candidate code and label the output baseline. The starting implementation's old pilot ignores unknown CLI options and lacks v2 export provenance; it cannot establish this interface merely by exiting successfully.

Repeat each ready, supported CASE with REP 1/2/3 under the declared order. Do not batch R01–R14 through this CLI and hide blocked cases. Semantic/Atlas/history variants still require qualification above; R14 uses the explicit command below. No placeholder is an executable proof. Independent evaluator qualification is recorded outside candidate access; the source artifacts keep their provisional label even when used as inputs to that review.

### R14: native interruption, bounded compaction and exact continuation

Future execution only. From the same frozen `packages/orchestra`, reuse the identity/input/run-parent variables above and predeclare:

```sh
export TRUSTED_SETUP='<absolute evaluator-owned operational setup JSON>'
export FIRST_TIMEOUT_MS='<positive first-dispatch deadline, at most 2147483647>'
export RESUME_TIMEOUT_MS='<positive second-dispatch deadline, at most 2147483647>'
export TOTAL_TIMEOUT_MS='<positive whole-attempt deadline, at most 2147483647>'
export OUTER_SECONDS='<qualified process deadline covering setup, cancellation and evidence collection>'
# On macOS, provision GNU timeout separately and use its actual executable path.
timeout --signal=TERM --kill-after=10s "$OUTER_SECONDS" \
  bun run script/research-pilot.ts \
  --case R14 --inputs "$PUBLIC_INPUTS" --manifest "$QUESTION_MANIFEST" \
  --run-root "$RUNS/R14-rep$REP-candidate-attempt1" \
  --source-revision "$CANDIDATE_SHA" --setup "$TRUSTED_SETUP" \
  --timeout-ms "$FIRST_TIMEOUT_MS" --resume-timeout-ms "$RESUME_TIMEOUT_MS" \
  --total-timeout-ms "$TOTAL_TIMEOUT_MS"
# Export only after evaluation.json reports task-returned; retain failed attempts unchanged.
bun run script/research-documents.ts "$RUNS/R14-rep$REP-candidate-attempt1/state"
```

The comparator uses its own frozen, qualified command and setup, `BASELINE_SHA` and baseline leaf in the predeclared order. `timeout` is an outer containment prerequisite, not proof that descendants/resources are cleaned up; the evaluator must qualify process-group/container cleanup and preserve partial state after external termination. Never install prerequisites implicitly inside a trial.

`--setup` is a closed JSON object, read by the trusted runner only, outside public inputs/checkout/run root. Example shape (operator supplies real paths/digests):

```json
{
  "snapshotGit": true,
  "scanner": { "command": "/isolated/runtime/bin/gitleaks", "sha256": "<64 hex SHA-256>" },
  "lsp": {
    "evaluation-typescript": {
      "command": ["/isolated/runtime/bin/typescript-language-server", "--stdio"],
      "sha256": "<64 hex SHA-256>",
      "extensions": [".ts", ".tsx", ".js", ".jsx"],
      "initialization": { "tsserver": { "path": "/isolated/runtime/typescript/lib/tsserver.js" } }
    }
  },
  "atlas": { "projectID": "<actual native project ID>", "directory": ".atlas", "sourceDirectory": "." }
}
```

Only `snapshotGit` is required by the setup schema. R14 eligibility requires a declared hashed scanner; omit optional `lsp`/`atlas` when their scenarios do not need them. Atlas directories are relative inside the copied disclosed source. No plugins, arbitrary runtime config, credential overrides, installers or live source config are accepted. Initialization is trusted operational data; freeze/hash all transitive runtime inputs separately. Put the declared scanner directory on PATH at process launch in lanes where Bun's startup command resolution requires it. Setup bytes, effective config, executables, snapshot commit and runner/helper digests are retained. The snapshot Git subprocess ignores system/global Git config and disables hooks; `git add -f --` names only validated `fixture.inputFiles`, including ignored generated inputs.

The first call is a native Maestro Task, with model-authored research and a disclosed checkpoint-before-continuing protocol. `AtlasResume.selectedRef` is the sole latest/reconciled selection policy; an eligible older receipt cannot replace an ineligible native-selected latest receipt. The runner requires actual durable finding/source events, checked evidence/contrary locators and a completed own Atlas emit receipt with matching task/project/owner/child/call, complete own recall and its real record ref. Checkpoint `ref` carries JSON `{finding, sources}` of actual retained handles. Nonempty failed approaches are worker claims requiring independent trace/content review, not proof of correctness.

A listener installed before the first Task records each actual completed emit boundary in the same monotonic sequence as provider-stream openings/events. After checkpoint verification, the observer arms against that completed-emit boundary and immediately checks already-live qualifying task streams opened after it; it does not use the later async verification/export timestamp as its cutoff. Otherwise it waits for a later real reasoning/text delta. It changes no prompt, provider response, tool choice or model conclusion. `Fiber.interrupt` then uses existing Task cancellation; native provider-stream interruption plus host `workResult.terminal.reason: interrupted` must both be witnessed. An ended stream/Task never becomes an interruption success. First host metadata, result/exit and cumulative child history are retained in `phase-1.json`; initial actual checkpoint and authenticated evidence in `checkpoint-observed.json`.

After cancellation settles, the runner re-reads native latest selection and revalidates its actual finding, evidence provenance, own receipt and fold. A changed eligible checkpoint becomes the resume target. An invalid changed checkpoint yields `checkpoint-changed-not-eligible`; missing selected reference yields `checkpoint-reference-unavailable`; failed validation of an unchanged reference yields `checkpoint-revalidation-failed`. Available native reference and raw failure cause are retained; no older checkpoint is substituted. Pre-compaction eligibility is frozen once in `checkpoint-before-compaction.json`. Selection and full authentication run again **after compaction**; failure yields `post-compaction-checkpoint-unavailable` or the exhausted whole-attempt deadline, without resume. Final eligible checkpoint bytes/ref are written once to `checkpoint.json`; each snapshot has its own exclusive path.

Compaction is a maintenance phase, not a third Task dispatch. The collector exposes `SessionCompaction.node` and calls actual native `create`/`process` with `auto: false`, deriving child agent/model from its retained non-compaction user history. The existing LLM observer delegates each invocation to the original implementation once; it supplies no summary, scripted response or replacement loop. `ResearchExecution.enter` reuses **`input.first.part.callID`**, after witnessing its existing allowance binding. This frozen pilot spells that identity `pilot-R14-first`, not `pilot-R14`; hardcoding the latter would allocate extra budget. Native `process` uses `withAttribution`, charging actual `provider:maintenance:*` attempts to the first dispatch's remaining allowance. No reset or third allowance is authorized; any new bound event blocks resume.

Compaction and both checkpoint revalidations consume remaining `--total-timeout-ms`; the compaction fiber is interrupted at that cooperative deadline. `phase-compaction-before.json` preserves original history and selected checkpoint before native mutation. `phase-compaction-exit.json` freezes native exit and available histories/witnesses/charges before final history collection. `phase-compaction.json` retains actual exit, available cumulative histories/collection failure, native compaction boundary, summary text, provider-scope witnesses, admitted allowance charges, model-visible before/after IDs and removed substantive message IDs, plus real checkpoint/finding/source identities. Interrupted/failed/empty summaries, missing provider or maintenance witnesses, stopped processing and no meaningful history transition are named `compaction-*` blockers, never permission to resume. Available raw phase evidence is written even after cooperative timeout; external process termination still requires the qualified partial-state/cleanup lane. A boundary or nonempty text alone is insufficient. Default automatic compaction stays disabled; this phase is explicit native compaction. Qualification remains **UNRUN**.

Checkpoint admission and disclosed-evidence export both use the shared frozen-source authenticator. It checks archived original byte length and `identity.sources.sha256`, received-parent identity/digest and byte extent (including partial prefixes), then the exact `read-line-projection-v1` line range, CR trimming, 2000-code-point truncation and expected completeness. Export identity must also match retained preparation. It never refetches a current candidate file to prove an old capture. Partial sources may have no paging cursor while remaining incomplete; document completion remains true only on the final page. If a received prefix ends inside a UTF-8 scalar, the public text artifact API returns `unsupported`; the runner preserves that failure instead of replacement-decoding bytes or claiming verification from archive text alone. Other source transformations remain explicitly unsupported by this frozen-file proof lane.

Resume passes the actual durable logical `task_id` and `memoryUnit: {kind: "task", id: task_id}` to a second native Maestro Task under the same parent. Binding/child count, exact Atlas resume admission ref, completed own recall, exact finding reopening and source-page receipts are checked from actual retained history, excluding pre-resume compaction history from reopened-tool observations. Missing restoration/reopening is named `resume-checkpoint-not-restored`/`resume-evidence-not-reopened`; no evaluator-authored summary is injected or replacement allocated. Seeing a source page is not proof that the model read every cited page or retained every qualifier: grading inspects locators, trace and result. `phase-2.json` retains actual resume result/history even on failure. The final projection excludes raw Task briefs, synthetic fold text, provider requests and skill tool bodies. Artifact export admits source bodies only from the exact disclosed file scope, plus admitted documents; worker-authored text still requires packet screening.

There are at most two dispatches, each with native `Research.Limits`: 24 provider calls, 64 tool calls and 64 MiB captured bytes. Total declared allowance is 48 calls, 128 tool calls and 128 MiB, **including compaction within the first allowance**, not a usage measurement. First/resume deadlines are separately declared and clipped to remaining whole-attempt time, starting at preparation. A second dispatch is withheld if checkpoint/interruption, native compaction or post-compaction authentication fails. Total-wall-clock and first-dispatch deadline failures take precedence over checkpoint failure; compaction expiry is `compaction-deadline-exhausted`. Collection/finalizers may exceed cooperative deadlines; the integrated native startup fix remains unexecuted and is retained as `startupAbort: native-startup-cancellation-controls-unrun`. `native-deadline-cancellation-unqualified` records overdue resume cancellation; `resume-dispatch-deadline-exhausted` preserves a signaled deadline even after a late native return. External timeout/cleanup remains mandatory. Stream-scope observations do not establish provider acceptance or billing; all usage aggregates remain unknown.

If the Task fails, preserve `trial.json`/`evaluation.json` and do not force document export by changing `terminal`. Failure before evaluation output leaves a retained attempt/root and possibly `preparation.json`; the external ledger records the actual setup/runtime error and `inconclusive`, not `pass`. The export requires retained pilot files, v2 returned-Task provenance and own authority/source placement. Empty declared documents are reported as `no-declared-documents`, never useful-delivery success. If a scenario requires a document, its independent assertion fails.

## Telemetry and cold grader packets

Pilot v2 retains clean source/runtime/lock/prompt/skill/public-input identity, observed native tool inventory and per-assistant `step-finish` records. Native `Session.getUsage` fills missing provider fields with zeros and computes rates-based cost estimates; those numbers are **normalized observations**, not verified provider billing or complete dispatch usage. Do not sum assistant-message totals and step records together. Empty trace, missing steps and zero counters do not prove no calls.

`providerAggregate`, total tokens/cost, maintenance usage, repair usage and human rescue remain `null` (unknown). No total includes guessed helper costs. Preparation and dispatch durations cover only their recorded driver intervals, not full install/indexing/grading/rescue effort. The evaluator separately records setup/indexing, all provider/helper/maintenance requests, retries, verification/writing and human repair with attribution and availability. Native allowance event charges can witness admitted attempts but do not themselves provide provider token usage or billing. Missing coverage must remain unknown in the final comparison.

`--timeout-ms` is required and shared by each pair. It signals the native Task abort from the start of `task.execute`; `deadlineSignaled` records whether the deadline was observed at each phase's completion, not whether an old first-phase timer expired during the resumed phase. Fresh-dispatch mode does not cover setup; R14 adds the separate whole-attempt cooperative deadline above. Neither mode kills the process or proves cancellation of every helper/tool. The evaluator must provision and qualify an outer process deadline/cleanup lane, classify every signaled deadline, and retain its available partial evidence. Neither a late Task return nor a successful document export cancels that timeout classification.

File receipts/paths are classified against exact disclosed inputs and native skill files; outside-file receipts are flagged instead of silently presented as supplied-source evidence. The projected trace omits their raw paths/receipts. Non-file receipts are retained with their kind for independent review. Raw `trial.json`, output text, metadata, errors and documents can still contain worker-supplied paths/text: the projection is **not a general redactor or privacy sandbox**. The evaluator screens and scopes packets before sharing them; any unexpected acquisition is investigated rather than erased.

Build one cold packet per anonymous arm/case/repetition/attempt outside candidate access. Include only its assigned question and disclosed acceptance, public source captures/revisions, parent-visible answer/qualifiers, admitted document bytes/receipts, relevant source/finding chains, scoped tool/terminal/usage observations and named gaps. Keep blind arm mapping and cost/provenance audit separate from content scoring. No other trial's transcript, author's solution narrative, private aggregate manifest or unrelated oracle enters a grader's context. The independent grader gets only the case's calibrated private assertions/reference evidence, inside its own isolated lane; grader outputs never feed back into confirmation trials.

Each packet decision names correctness, applicability, required-evidence recall, decisive qualifiers/contraries, cohesion, handoff and terminal limitations separately. Verify citations against exact retained source bytes. A verified receipt proves bytes/admission, not entailment or quality. Retain first observed failure stage: framing → acquisition → retrieval → reading → inference → writing → handoff/resume. Store every assertion, calibrated control and `pass|fail|inconclusive|not-run` outcome in the external ledger.

## Final checks and detecting probes (pending)

At the consolidated final gate: one affected-package `bun typecheck`; change-scoped prescribed GitHub Actions suites; reviewed provenance/isolation checks; N/A target-runtime ledger; then authorized paired final-prompt model execution and cold grading. Tests and typecheck were explicitly withheld during preparation. No new CI gate or test was added here.

Proposed mutation probes, **not run**:

1. Reuse a run root or point a disclosed file/manifest through a symlink; freeze a changed file under its old digest. The driver must refuse before model execution and retain the earlier attempt intact. Include a valid regular-file/hash control to distinguish universal refusal.
2. Remove a decisive qualifier or contrary source from an otherwise valid cited answer/document. R12's private calibrated oracle must reject it while accepting a valid alternative structure and precise insufficient-evidence abstention.
3. Alter a document binding/digest or substitute/repeat a paging cursor. Export must reject; genuine admitted multi-page UTF-8 content must round-trip exactly. Removing all declared documents cannot satisfy a document-required assertion.
4. Omit a provider usage field or attributable maintenance record. Audit must report unknown rather than zero/complete totals. A successful Task with missing qualified artifacts must not become a quality pass.
5. For R14, change only `task_id`, parent, child, project, owner or `memoryUnit`, or remove retained contrary-source bytes after actual interruption. Strict native resume/restoration must refuse foreign identity; missing bytes remain unavailable, not recovered by summary/refetch. Positive control: same actual task/receipt/source bytes resume and reopen successfully.
6. End the first Task before any checkpoint, withhold the real scanner, remove the checkpoint ref or supply only refused/uncertain Atlas receipts. Retain `checkpoint-not-reached` and one dispatch; never mint a second child. Positive control: real own admitted checkpoint plus later active stream reaches native interruption.
7. Delay native dispatch startup past abort, let the provider finish between witness and cancellation, or exhaust the total deadline between phases. Retain named infrastructure failure and actual partial phase histories. Execute the integrated startup-cancellation controls and qualify external timeout/resource cleanup separately.
8. Cite a native skill/prompt/outside-file receipt as source evidence or alter source/document digest/page cursor. Grader body export must refuse while genuine admitted disclosed multi-page UTF-8 evidence still round-trips.
9. Enable explicit LSP setup and include ignored generated fixture files: isolated runtime initialization must not fail with `EEXIST`, and the snapshot tree must retain every declared file. Positive controls include default-disabled LSP and ordinary tracked inputs.
10. Change the candidate source after capture, corrupt/miss the host-only original archive, alter the frozen SHA, received-parent extent or projected line bytes. Old evidence must authenticate only against the original archive, never a reread of changed candidate bytes. Valid partial-prefix/line-range controls must succeed; received UTF-8 prefixes ending inside a scalar must remain `unsupported`.
11. Delay checkpoint verification while the next real task stream is already live, reconcile an older record after a newer one, or complete a changed emit during cancellation. Witness sequence must retain the actual emit boundary, native latest policy must win, changed eligible checkpoints must be revalidated, and invalid newer checkpoints must block. No snapshot file may be written twice.
12. For R14, return an empty/error summary, retain all original substantive context, exhaust the first allowance or whole-attempt time during compaction, change the selected checkpoint/source bytes after compaction, or substitute a new helper call ID. Resume must be withheld with named blocker and available raw evidence retained. Positive control: real native summary and history transition, maintenance charge under the exact first call ID, then authenticated same-child continuation and exact evidence reopening. Final qualification must check observed allowance bindings remain at most the first/resume pair; usage/billing stays unknown.

## Framing corrections

- A pilot is a feasibility/collection path, not final qualified paired evidence.
- An implementation baseline SHA is not a comparator definition; three repetitions do not demonstrate universal superiority.
- Default-disabled LSP/compaction and unconfigured Atlas do not provide required operational reach. Hashed setup and executable continuation establish interfaces, not runtime qualification or quality evidence.
- Parent Task return, valid result card, admitted document digest and readable export are distinct from correct useful research.
- Native zero-normalized token/cost fields cannot justify complete provider, maintenance or repair aggregates.
- Separate state roots and projected path filtering do not keep private evaluator data inaccessible without an enforced runtime boundary.
