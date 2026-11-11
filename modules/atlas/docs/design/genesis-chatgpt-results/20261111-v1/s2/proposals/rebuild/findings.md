# PREP-S2-02 — rebuild/cache fit and concrete boundary repairs

Status: preparation only. This is technical authorship, not a judge decision, a production run, or closure of AC-04/05/06. Source is `1cde2ff7a71bcf7aecb5d030917b577165135d38`; protocol is `2689c516d63488be37de678cc853dd4556fd5c13`. S1 scope/allocation and S5 file-conflict clearance are absent at this preparation checkpoint. No shared source files were modified and no tests were run.

## Existing executable seams

`knowledge/src/ownership/update-plan.ts` (`a0aeefe85adf859ac7dbcaddbacf33b8e99878d7`) exposes `planOwnershipUpdate(store, manifest, scope, observe)`. It validates the complete baseline through the historical reader, observes each external input once, returns direct changes, a dependency-ordered potential affected set, frontier and unaffected inventory, and never writes CAS or calls a recipe. Required dependencies drive propagation; navigation does not.

`adapter-io/src/ownership-rebuild.ts` (`233c007b97aa32a7714712a6ddcf05bf9d04b029`) exposes `rebuildOwnershipUpdate(request)`. Request fields are store, baseline manifest/scope, tri-state observer, captured-byte callback, membership callback, recipe registry, contract hash and evaluator. Each recipe has key, recipeInputKey, recipeVersion, declaredInputs, optional mandatoryInputs, required predecessor keys and a synchronous run callback. The evaluator returns persisted review references or HOLD. The executor handles dynamic membership, repeated fresh observation, equal-result stopping, fresh receipt bindings, final full-inventory reads and a private candidate manifest. It does not activate the candidate.

The current executor already compares complete `OwnershipResult` hashes. The identity includes body bytes, authority scope/basis, validity, gaps and evidence (`knowledge/src/ownership/types.ts`, blob `05cb2ae05d296764ce2e786d07b28b36d7428cb7`). New timestamp/counter fields belong in execution records, not the result. An accepted result equality stops descendant interpretation when the descendant has no direct input change; the revalidated parent's receipt still receives current inputs and reviews. A no-change rebuild returns the exact original manifest and zero recipe calls only after baseline/declaration checks.

`adapter-io/src/ownership-input.ts` (`c6afd6a35071a2487a1168cea5ed1ad26379c376`) exposes real filesystem/Git observations for `file:` and `members:` keys. It distinguishes confirmed absence from unavailable evidence, refuses unsafe paths/symlinks/oversize or partial Git evidence, hashes source bytes as ownership-source v1 and membership as ownership-membership v2. The older string-or-undefined adapter deliberately loses the absence distinction and is not suitable to infer removals.

The existing source/tests demonstrate what the code is designed to do. Their presence is not a fresh production, CI or semantic judgment receipt. `genesis-global-completion-plan.md` (`804d936d4e9c5509485100625215e3f5f3e3b8bb`) explicitly keeps real cache interpretation counts and complete independently expected rebuilds open beyond prior fixtures.

## Concrete static findings and proposed patch

### S2-U01 — unrelated captured inputs are exposed to a recipe

At rebuild lines 186–192, every recipe receives copies of the entire manifest's `captured`, `bytes` and `lists` maps. Its new receipt at lines 264–269 binds only `candidateInputs`. A generic producer can consequently consume an independent artifact's source without acquiring the corresponding build dependency. The producer may later be reused when that foreign source changes. This is a concrete boundary mismatch visible in source; runtime reproduction is pending CI.

The draft scopes each invocation to that artifact's effective input keys and membership directories, while keeping required predecessor results and whole-generation coherence checks. Proposed RB-21 asserts exact keys visible to a recipe with direct inputs intent-a/recipe-a and predecessor z; it must receive no independent source or unrelated membership map. This is not a general sandbox for an arbitrary JavaScript callback. The native adapter must also withhold direct filesystem/store capabilities from semantic producers.

### S2-U02 — recipe identity may be supplied by another artifact

At lines 133–147, mandatoryInputs can omit recipeInputKey, and the identity check looks up the key in the global capture. If artifact a omits its recipe input while independent i binds that file, all global observations can exist and a's missing implementation binding can evade validation. Recipe changes can then affect i without invalidating a.

The draft requires recipeInputKey in declaredInputs and in the mandatory input set. The existing bound-key loop then proves it is in this artifact's receipt. Proposed RB-22 constructs that exact cross-artifact counterexample with otherwise structurally reviewed fixture data and expects HOLD before any execution. The fixture is explicitly synthetic and supplies no semantic acceptance.

### S2-U03 — missing captured bytes do not block dispatch

At lines 180–185, a present file with undefined readCapturedBytes is silently omitted from the bytes map. The callback contract says undefined is for non-file bindings. A native producer may otherwise receive a source identity without the actual captured bytes and still run. The draft refuses this as ownership-input-unavailable before dispatch. Proposed RB-23 checks no recipe calls on that refusal.

The source observer and readCapturedBytes must still be backed by one host capture. The generic executor cannot validate a byte hash against arbitrary caller version strings; fixture versions currently are symbolic. The native host adapter must hash captured bytes with the actual ownership-source identity and bind them to the observation, without reopening live paths during semantic production. No CAS or trust bypass is proposed.

Patch: `ownership-rebuild-boundaries.patch`. Patch metadata: `patch-metadata.json`. The patch targets only rebuild and its existing test file. It is a proposal for S5, not applied implementation. Tests and typecheck remain NOT_RUN. Applying the draft requires S1 ownership allocation and S5 integration/conflict clearance, followed by change-scoped CI and package typecheck. No change to planner, CAS shapes, reader, authorization or historical artifact bodies is needed for these three fixes.

## Native production/update integration contract

The synchronous recipe/evaluate callbacks are not an API for this chat to call model inference from TypeScript. A minimal adapter can consume durable original ChatGPT responses and original S5 review decisions, but must verify the full request identity before returning them. A run callback replaying stored bytes is distinct from a new semantic interpretation and must have a corresponding replay/import receipt.

For each native request, bind campaign/scope/inventory, source and candidate revisions, contract, recipe implementation/configuration, effective external input versions and exact bytes, required predecessor result hashes, producer identity and logical attempt/reservation. Freeze all of that before semantic production. Produce only from this per-artifact packet. Preserve original visible response bytes; do not normalize/rewrite them into a counterfeit original. Return explicit authorityBasis, supported/blocked validity, gaps and evidence; default fixture labels must never represent native output.

The adapter's evaluator must load real judge A/B decisions bound to the same result, contract and `id({inputs, dependencies})`. No local author-generated pass and no old pilot reviewer identities can satisfy this. Missing/conflicting/stale response or review causes HOLD/pending evidence before candidate admission. A pending item cannot be converted into an accepted baseline to allow descendants. S5's complete-layer acceptance remains a separate prerequisite for production of the next layer.

No global cache is required. Use the provided complete, verified baseline for reuse. For changed recipes, the registry's executed implementation version must match the newly observed recipeInputKey; merely relabelling old code is invalid. This capability is already modeled by RB-07. Documentation comments that describe the version as the old baseline declaration should be interpreted against the executable new-version check and explicit contract/test; they are not evidence of a new implementation execution.

Native staging must reconcile durable response/review requests when a run is interrupted. Do not repeat an uncertain interpretation to obtain a callback result. The whole rebuild can be replayed only when that replay consumes exact durable work and all current input checks still pass; record replay separately from production. S3 owns the recovery proof and S5 owns candidate integration.

## Independent affected-set and refusal preparation

`oracle-proposal.json` freezes proposed generic control vectors from the independently specified graph in the G2.2 contract. It deliberately does not pretend those four fixture nodes cover Orchestra. After S1 supplies the actual finite inventory, exact real-domain expected sets and source mutations still need independent freezing before production. The actual planner output must never be copied into an expected set.

Required evidence includes the original and new manifests/results/receipts, observed recipe and evaluator calls, native logical reservations and output bindings, and real post-rebuild validation. A complete production claim additionally needs accepted semantic outputs, governed activation in an authorized isolated store and reader readback owned by the other slices. Detecting staleness, writing these vectors or producing an unactivated CAS candidate alone cannot close AC-06.

## Build/bootstrap dependency observation

The adapter-io package typecheck script is `tsc -b`, invoked through `bun typecheck` per AGENTS. Its tsconfig includes source and tests and references contracts, kernel, index, grounding, knowledge, persist, retrieval, genesis and tools; package dependencies also name memory. The root Atlas tsconfig covers fifteen workspaces. A typecheck of only the three inspected source files is not the package gate.

The bootstrap therefore needs actual Atlas package manifests, relevant project references, tsconfig.base.json, real lockfile and postinstall `scripts/fix-scip-types.mjs`. External package dependencies observed include @noble/hashes, @c4312/scip, tree-sitter-typescript and web-tree-sitter; TS/Node/Vitest types are required by package compilation. No install, typecheck or test result is claimed by this preparation agent.

## Precise remaining dependencies

S1: finite scope/needs, source authority, criteria catalog, file ownership and exclusive operational quota.

S5: shared-file application order/clearance, importer contract agreement, two persistent independent judges and each prior complete-layer acceptance.

Runtime: verified complete relevant checkout/packages and dependencies, native capture/response/evaluation bridge, actual CI route for proposed tests. S3/S4 then supply recovery, governed activation, host and readback proofs on the integrated exact candidate.

No S1/S5 dependency is filled by this draft. It is useful independent preparation, preserved so the next executor can apply a concrete bounded correction when the gates exist.
