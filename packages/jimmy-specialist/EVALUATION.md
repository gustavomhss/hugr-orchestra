# Bounded discovery evaluation preparation

Status: preparation only. No model/provider calls, tests, CI or typecheck were run for this work package. The source driver always records `provisional-pilot` and `qualityGrade: not-run`; neither a returned Task nor a digest-checked document is a quality pass. Governing contracts: `specs/jimmy-specialist/audition.md` §§1, 4–5 and `delivery-plan.md` WP02/WP10/WP11.

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

The pilot exclusively creates the run root, copies only digest-matched regular disclosed files, refuses traversal/links/ambiguous selections and `.git` metadata, and uses exclusive artifact writes. Pilot config is injected outside the source snapshot: a supplied `orchestra.json` is preserved as evidence but is not executed. Module-level XDG/Global paths are isolated before native imports; inherited Orchestra settings, external skills/config and credential inheritance are disabled. Native macOS managed preferences cannot be redirected by this runtime, so their presence blocks this pilot.

**These are state/config boundaries, not an OS filesystem/network sandbox.** The executing evaluator must arrange a separate OS account/container/VM or equivalent enforced capability boundary: the model's native tools must have no read route to private evaluator storage, grading processes, another arm's state, developer checkout or live owner data. The trusted runner alone reads its question through the already-existing `--manifest` interface. A same-user private path plus an instruction not to read it is insufficient. Establish the native packaged-skill read exception explicitly. Use replayable source captures; qualify any live acquisition separately with actual captured bytes and scoped endpoints.

### Read-only OAuth

The pilot takes the legacy OpenAI OAuth file path before changing its process home, reads it into memory, and supplies a read-only Auth service. It does not copy credentials into run files, environment JSON or a DB. `get/all` reject empty access and expiry within 60 seconds; `set/remove` fail. This also stops the normal Codex refresh branch before it receives expired/empty access. Refresh tokens are never deliberately used by the pilot. Expiry mid-run is a retained infrastructure failure: the owner refreshes through the owner-controlled login flow outside the trial, then the evaluator schedules a new attempt. No automatic refresh, mutation or persistence is authorized.

`research-credential-probe.ts` is unchanged. It is not a hermetic trial runner: its native service reads use default placement unless the operator isolates the environment. Do not run its `--models` provider-listing path during preparation. Credential/model availability has not been measured here.

## Operational prerequisites still open

| Prerequisite / owner | Exact missing setup and affected scope |
| --- | --- |
| Comparator / evaluator + lead | Baseline revision and native behavior have not been declared in the governing plan. Its runner, decoder, actual ceilings and telemetry must be qualified; a SHA alone cannot define comparison semantics. |
| Final identity / lead | Integrated final charter, actual loaded skill revisions, generated clients and production build identities remain to be frozen and checked. This source-only driver is not the Bun binary or desktop Node path. |
| Semantic navigation / evaluator + runtime lead | Pilot injects `lsp: false`, and disables downloads. It cannot satisfy mandatory TS/JS alias/provider-selection or native semantic-readiness coverage. Identify the selected implementation and positive known-reference control in the disclosed fixture, copy its tsconfig/package/lock/generated inputs, provision pinned TypeScript/tsserver and a language-server binary inside the isolated lane, and qualify initialization/readiness and partial/timeout coverage. Native TypeScript startup resolves `typescript/lib/tsserver.js` from the fixture directory and calls `Npm.which("typescript-language-server")`; a host install or flipping a flag alone is not evidence. A reviewed evaluator adapter/config path is required before final semantic cases; the current CLI has no LSP override. R02 and any R03/R04/R13 fixture depending on semantic coverage stay blocked under this pilot setup. Lexical-only cases must be explicitly scoped. |
| Git/build history / evaluator | The copier supplies regular snapshots, not a Git history or a deployed build. Any R05/history-dependent scenario needs a separately frozen isolated repository, allowed revisions, effective build/config and observations. Do not let native history queries walk into the author's repository or treat a lockfile as deployed execution. |
| Atlas / evaluator | Pilot has no `maestro.atlas` configuration, scanner setup or initial Memory/Own corpus. Provision actual native provider/binding/project identity and scanner, frozen owner state, valid template receipts, required verified Own coverage and controlled outage variants where the scenario needs them. An unconfigured header is not certified Atlas parity. |
| R14 / evaluator + runtime lead | The pilot rejects R14: it creates one parent and one fresh Task and disables automatic compaction. Supply a real continuation adapter with retained authority Session, exact returned logical `task_id`, same child/project/owner, real cancellation/interruption or compaction, and a second native Maestro Task call using that id. Retain failed approach, contrary finding, exact source/document revisions and admitted Atlas checkpoint; prove restoration after the actual event, not a pasted summary. The adapter must preserve phase traces/host terminals and declare total effort limits. No executable R14 command exists in this pilot. |
| Credential/model lane / owner + evaluator | Confirm permitted model/account route, access lifetime and actual transport/settings without persisting or refreshing inherited OAuth. No availability trial was run here. |
| Deadline containment / evaluator + runtime lead | Provision an outer process deadline and owned-resource cleanup, shared by both arms. The native Task registers its abort listener after dispatch startup and does not check an already-aborted signal there; the pilot's cooperative deadline alone cannot certify termination during startup. Detect this race and hung tools/helpers in the final runtime lane; record timeout/cleanup separately, preserving partial state. |
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

Repeat each ready, supported CASE with REP 1/2/3 under the declared order. Do not batch R01–R14 through this CLI and hide blocked cases. Semantic/Atlas/history variants and R14 require the adapters/setup above; their exact final commands are intentionally unresolved until their real interfaces are provided. No placeholder is an executable proof. Independent evaluator qualification is recorded outside candidate access; the source artifacts keep their provisional label even when used as inputs to that review.

If the Task fails, preserve `trial.json`/`evaluation.json` and do not force document export by changing `terminal`. Failure before evaluation output leaves a retained attempt/root and possibly `preparation.json`; the external ledger records the actual setup/runtime error and `inconclusive`, not `pass`. The export requires retained pilot files, v2 returned-Task provenance and own authority/source placement. Empty declared documents are reported as `no-declared-documents`, never useful-delivery success. If a scenario requires a document, its independent assertion fails.

## Telemetry and cold grader packets

Pilot v2 retains clean source/runtime/lock/prompt/skill/public-input identity, observed native tool inventory and per-assistant `step-finish` records. Native `Session.getUsage` fills missing provider fields with zeros and computes rates-based cost estimates; those numbers are **normalized observations**, not verified provider billing or complete dispatch usage. Do not sum assistant-message totals and step records together. Empty trace, missing steps and zero counters do not prove no calls.

`providerAggregate`, total tokens/cost, maintenance usage, repair usage and human rescue remain `null` (unknown). No total includes guessed helper costs. Preparation and dispatch durations cover only their recorded driver intervals, not full install/indexing/grading/rescue effort. The evaluator separately records setup/indexing, all provider/helper/maintenance requests, retries, verification/writing and human repair with attribution and availability. Native allowance event charges can witness admitted attempts but do not themselves provide provider token usage or billing. Missing coverage must remain unknown in the final comparison.

`--timeout-ms` is required and shared by each pair. It signals the native Task abort from the start of `task.execute`; `deadlineSignaled` records whether the deadline was observed before collection. It does not kill the process, cover setup, or prove cancellation of every helper/tool. The evaluator must provision and qualify an outer process deadline/cleanup lane, classify every signaled deadline, and retain its available partial evidence. Neither a late Task return nor a successful document export cancels that timeout classification.

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
5. For the evaluator's R14 adapter, change only `task_id` or remove retained contrary-source bytes after actual interruption. Strict resume must refuse the foreign id; missing evidence must remain unavailable, not recovered by summary/refetch.

## Framing corrections

- A pilot is a feasibility/collection path, not final qualified paired evidence.
- An implementation baseline SHA is not a comparator definition; three repetitions do not demonstrate universal superiority.
- Disabling LSP/compaction and leaving Atlas unconfigured removes required operational reach; prose or a fresh call cannot close those cases.
- Parent Task return, valid result card, admitted document digest and readable export are distinct from correct useful research.
- Native zero-normalized token/cost fields cannot justify complete provider, maintenance or repair aggregates.
- Separate state roots and projected path filtering do not keep private evaluator data inaccessible without an enforced runtime boundary.
