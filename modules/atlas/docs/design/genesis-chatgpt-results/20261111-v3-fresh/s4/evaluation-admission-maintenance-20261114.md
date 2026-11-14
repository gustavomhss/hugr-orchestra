# S4 maintenance unit — evaluation ownership admission

Status: DOCUMENTED / NOT SEMANTICALLY ACCEPTED  
Date: 2026-11-14  
Scope: Atlas evaluation-only ownership attachment and its complete-manifest admission read. This is a bounded maintenance guide, not a runtime release, campaign acceptance, or authorization to activate anything.

## Pins and provenance

- Campaign source baseline: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.
- Protocol: `ee2521a5b966bd505cc95bd1c733e09e12f33531`, `.orchestra/skills/execute-genesis/references/runtime.md` and `transport.md`.
- S4 state inspected before this unit: `genesis-fresh-s4` at `db9b4235022c4df32fe3bfd4faeea8adcd69abb7`.
- Separate support branch inspected, not modified or merged: `genesis-campaign-s4-tail-precision` at `e8828a9780ba253a27a55a433dcb22bad6286cab`, seven commits ahead of the S4 state. Relevant commits include `658edba90e2b7b32df72664f312bb9a4a9550d81` (explicit isolated evaluation admission), `10e23dd3619c6104f124764275e9d50282f7bc9a` (evaluation state isolation and CAS-sidecar identity), `7e1f7e7e81b3905ebbec4eeb3e715a9b2a27fd85` (single complete admission traversal), and `52d1e55f522174a2363bf784ebf1c432731f3c42` (public runtime entrypoint trees).
- Baseline contract references: `modules/atlas/packages/knowledge/src/ownership/read.ts` and `types.ts` at the source baseline. The baseline reader validates the selected artifact and its dependency closure; its ordinary contract does not itself establish the later evaluation-specific full-manifest traversal.

The support branch is evidence of a separate proposed/current implementation delta, not part of the S4 branch HEAD. This guide intentionally does not copy its code or claim that its changes have landed in the campaign branch.

## Behavior to preserve

1. **Evaluation is a distinct phase.** The evaluation path uses version-2 evaluation manifest/artifact/receipt/contract/review shapes bound to one evaluation context, candidate and generation. The reader rejects a mismatched context/phase rather than treating an evaluation carrier as ordinary operational ownership.
2. **Admission is complete-manifest, not selected-root-only.** The evaluation overload of `readOwnership` traverses every manifest entry, including disconnected entries, before returning the selected body. It still validates dependency references and their result identities. Ordinary non-evaluation reads retain selected-root/dependency traversal.
3. **Coverage is set equality.** `assertAdmissionCoverage` rejects empty sets, duplicates, omissions, extras and same-length substitutions; order is not material. The helper checks requested keys before reading, then checks the reader's `checked` keys after a non-HOLD result.
4. **Observations are fresh per admission call.** No cross-call cache is used. A later attachment/check/emit gate must perform its own admission read; results from an earlier check are not reusable authorization or freshness proof.
5. **The attachment gate keeps its order.** In the inspected support implementation: evaluation composition/policy assertion first; carrier shape/scope/claim/current-observer checks next; manifest integrity and candidate binding next; then the integral read. A documented coverage rejection is normalized to `evaluation-attachment-coverage`; unexpected observer/runtime errors propagate.
6. **Operational and evaluation carriers remain separated.** An evaluation-only carrier on the ordinary path is refused before CAS traversal. Ordinary operational ownership continues through its existing checks.

## Why the single traversal matters

The pre-existing baseline `readOwnership` API takes one selected key/need and walks its dependency closure. Repeating it once per manifest key can repeat input observations and may sample different filesystem moments. The support-branch evaluation overload instead initializes its traversal from all manifest entries and returns one `checked` set. The admission helper invokes that traversal once, then verifies exact coverage.

The synthetic test fixture with two entries demonstrates the intended distinction: the integral path observes two input keys once, whereas the old per-key loop observes them four times. This is an observation-count comparison, not a speed benchmark and not proof of an atomic filesystem snapshot.

## Evidence inspected on the support branch

- `modules/atlas/packages/knowledge/src/ownership/read.ts`: evaluation context checks on manifest, artifacts, receipts, contracts and reviews; all-entry traversal for evaluation context; dependency consistency; current-input checks; body integrity/UTF-8; returned `checked` keys.
- `modules/atlas/packages/adapter-io/src/evaluation-admission-read.ts`: exact coverage helper and one-call wrapper.
- `modules/atlas/packages/adapter-io/src/ownership-attachment.ts`: gate ordering, per-attachment fresh traversal, refusal mapping, and operational-path rejection.
- `modules/atlas/packages/adapter-io/test/evaluation-admission-read.test.ts`: synthetic tests for disconnected entries, observation count, corruption parity, changed/unavailable inputs, no cross-call cache, mutation during traversal, temporal non-equivalence, exact coverage, extra entries and empty input.
- `modules/atlas/packages/adapter-io/test/evaluation-attachment-batch.test.ts`: synthetic integration tests for disconnected corruption, per-attachment freshness, policy-before-binding/read ordering, binding refusal, observer exceptions, repeated shared input observations, unavailable inputs and operational carrier separation.
- `modules/atlas/docs/design/genesis-chatgpt-results/20261113-s4-tail-precision/s4-tail-precision.md`: maintenance guide describing the broader S4 maintenance procedure; this unit adds a focused evaluation-admission note rather than duplicating that guide.

All test fixtures explicitly use synthetic votes, bodies, inputs and in-memory stores. The attachment batch test mocks outer policy, binding and claim helpers; it exercises the real integral reader/coverage helper, but does not prove real policy, candidate binding, filesystem or governed check/emit integration.

## Limits and non-claims

- A fresh traversal is **not** an atomic filesystem snapshot. Inputs may change during traversal; the observer contract and later gates still matter.
- Repeating the attachment gate is intentional and can repeat reads. Do not optimize by caching a prior admission result across gates.
- A synthetic test pass is not evidence of native campaign semantic reviews, runtime binding, governed publication, real filesystem isolation, or independent Atlas consumers.
- The support branch's commits and test source were inspected; no test command or CI run was executed as part of this documentary unit.
- No claim is made that the support branch is merged, deployed, or the S4 runtime release. The existing S4 `runtime-release.json` remains r3 and retains its stated sample-only limits.
- No private state, credentials, production store or user data was accessed.

## Maintenance checklist for a future code change

- Freeze the exact evaluation candidate, manifest entry set, scope, context and generation before judging.
- Preserve semantic review bodies and separately bind the exact candidate/runtime; do not infer one from the other.
- Test disconnected entries with malformed body, invalid review, missing dependency and wrong phase/context.
- Test empty/duplicate/omitted/extra key sets and verify the observer is not called on invalid requested coverage.
- Test changed and unavailable inputs, fresh observations on a second gate, and mutation between observations.
- State explicitly whether a test establishes stable parity, observation count, or temporal behavior; none establishes atomicity by itself.
- Re-run the relevant remote gates on the exact candidate and preserve run IDs/receipts before updating a runtime release or declaring acceptance.

## Unit disposition

This documentation unit is complete as a source-grounded maintenance note. It does not close S4 L4 semantic review, the active R4 candidate, the 15-artifact native package, independent consumers, own maintenance execution, or final S4 completion. Those obligations remain with their active owner and must not be inferred complete from this note.
