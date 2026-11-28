# Independent engagement: exact model identity after upstream integration

Status: frozen by lead decision before a production correction. The public
integration regression must compile and reach its intended hosted assertion
failure before the Store behavior changes. No local test or typecheck is part
of this qualification.

This narrow contract reconciles the durable-evidence candidate with upstream
`df11bb70073db58c2eec90afea00b31a8d9390a7`, compared with
`46a7d9fe6481d897f02f0bbf65d6d41747ba7528`. It does not replace or edit the
frozen `engagement-evidence-contract.md`, widen the engagement input, change
model selection policy, or introduce audit variants.

## 1. Changed upstream meaning

Upstream now preserves an absent `Model.Ref.variant` in native Session reads.
An absent variant follows the catalog preference. The literal string
`"default"` is an explicit variant ID and must exist in the catalog to be
selected; it is no longer a synonym for absence. A different explicit variant
likewise retains its exact identity.

The inspected changes are `packages/core/src/session/info.ts:50`,
`packages/core/src/model-execution-options.ts:37`, and the exact model
comparison in `packages/core/src/tool/task.ts`. These source changes make the
candidate Store's `model.variant ?? "default"` normalization lossy.

The engagement controller already passes its actual captured `parent.model`
to native lead and child creation. It does **not** pass `admitted.model` to
child creation. This correction addresses persisted identity and admission
checks; it must not claim an observed child-runner failure that the controller
does not cause.

## 2. New state-v2 admissions use exact references

For a new evidence-enabled engagement, persist the actual admitted model
reference as follows:

| Actual parent model | Stored model and native owned Sessions |
| --- | --- |
| No model | Model field remains absent |
| `{id, providerID}` | Same fields; variant remains absent |
| `{id, providerID, variant: "default"}` | Preserve the literal variant |
| `{id, providerID, variant: "named"}` | Preserve that exact variant |

No comparison for a new state-v2 request may replace an absent variant with
`"default"`, or do the reverse. Undefined optional properties are omitted in
the canonical stored representation. Model IDs and provider IDs remain exact.

Use the same exact comparison for:

- The live parent and requested model at initial admission.
- Any preexisting deterministic lead adopted before admission.
- Every deterministic child claimed by `own`.
- The stored lead model and pinned model when decoding state-v2 metadata.

Keep existing pristine, ownership, parent/project/Location, agent, archive and
revert checks. A same-ID/provider Session with the other variant intent is not
an equivalent Session and cannot be adopted, even if it has no messages or
pending work. The mismatch is refused before prompting or provider execution.

The original admission pins model intent for that request. Changes to the
parent's selected model after completion do not reopen or invalidate exact
replay. The request ID/input hash, original budget, captured source and stored
terminal bytes retain their current meaning. Do not add the current parent
model to the public request schema or recompute the input hash on retry.

## 3. Version boundary and historical replay

`review-engagement-state-v1` is the previously delivered admission format.
Its model field was historically normalized, so a stored literal default can
represent either an explicit default or an absent variant at that time. That
information cannot be reconstructed reliably from the normalized value alone.

The compatibility rule is therefore deliberately limited to state-v1:

1. When validating a historical v1 record for replay or orphan closure, use
   its historical normalization for the stored model and the stored Session
   row. Keep all other identity, source, digest and namespace checks.
2. A completed v1 record replays the original canonical output bytes and report
   ID. Do not rewrite its metadata, model, source, citations or report bytes.
   Its existing evidence-reader legacy behavior remains unchanged.
3. A running v1 record with no live owner follows the existing immutable
   interrupted-terminal path. Compatibility validation does not authorize
   provider work, child creation, new prompts, new source capture or a
   renewed deadline.
4. Never apply this equivalence when adopting a fresh lead/child for a new
   request. Compatibility permits historical reading, not new execution.

`review-engagement-state-v2` exists only in the current unintegrated
durable-evidence slice. The lead explicitly does not require migration of
records produced by earlier, unshipped intermediate v2 candidates. New v2
records use exact identity, and v2 decode receives no legacy fallback. An
inconsistent v2 identity fails closed with the existing versioned evidence
integrity error. Do not silently infer that a mismatched v2 record is old.

The evidence manifest schema `review-engagement-evidence-v1` is a different
version domain. It remains unchanged by this contract. A state-v2 completed
record still binds that canonical evidence receipt through its existing
required-completed-v1 policy and digest. No receipt migration or extra public
reader field is introduced.

## 4. Frozen public regression requirements

Add only a new public integration test file using the existing real
engagement fixture and native Maestro registration. Do not change existing
frozen tests or replace the Store, Session, permission, registry or provider
execution boundaries to make a result pass.

### Exact positive controls

Run new requests with a parent model that omits variant and with a parent
model that explicitly selects `"default"`. Read actual native lead/child
Session rows and stored admission metadata. Require exact corresponding
presence/absence throughout. Both requests must complete their real scripted
engagement, preserving source, original budget and report/receipt identity.

The current fixture's fixed SessionRunnerModel layer may remain for these
identity assertions, but the test must not claim it proves real model
resolution. A small direct call to the real public
`ModelExecutionOptions.selectVariant` over a concrete catalog model can
establish the semantic distinction: absence selects its configured preference,
while literal default selects its actual default entry, or produces the
existing typed unavailable error if that entry does not exist.

### Non-vacuous identity refusal

Precreate the exact deterministic lead or child with native Session APIs and
all otherwise valid pristine placement/agent/model fields, changing only
variant intent between absence and literal default. Invoke the actual
registered Maestro engagement request and require the named existing
identity refusal before any prompt/provider work for that Session. The
baseline normalization must demonstrably accept the wrong identity and reach
the negative assertion; a setup, import or model prerequisite failure is not
qualifying RED.

If exercising post-completion corruption, mutate only the stored lead/model
identity being validated, with a real completed positive first. The exact
state-v2 retry must fail closed under the existing evidence-corrupt contract;
changing only the parent's current model is not a corruption test.

### Replay and legacy controls

After a completed positive, reopen the real SQLite graph and retry the same
request. Require identical report bytes/report ID and evidence receipt bytes/
digest, unchanged source/budget, and no additional child/provider/search work.
Changing the parent's current selection must not make an old result execute
again.

Construct a precise historical state-v1 fixture using otherwise valid native
stored state, including the historically normalized default field. Require
byte-identical terminal replay and the existing legacy evidence absence.
Exercise orphan closure without provider execution if the new test covers
running legacy state. Do not rewrite a legacy output to make the control pass.

## 5. Implementation and evidence gate

The intended correction is confined to the Store's model projection and the
explicit v1/v2 validation branch. Preserve controller model propagation,
native Session APIs, ownership/deadline/CAS behavior, evidence limits,
serialization and reader authorization. No broad normalizer change in Core is
needed; the upstream exact semantics are authoritative.

Freeze this document and the new compiling public regression, observe hosted
assertion RED on the exact integrated source, then implement the Store
correction. Keep a record of baseline source/test blobs, host jobs and decisive
assertion locations. The final integrated source requires hosted typecheck and
the existing engagement/persistence/lifecycle controls as well as the new
identity tests. No local execution or unchanged-test weakening substitutes
for those observations.
