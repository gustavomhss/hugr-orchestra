# Relay wiring cold-review findings — source ee502646

2026-10-09. New source reviewed statically: `992b4c58eca411a799c1676dae17d733012a1f08` and `ee502646c76b312cc462f55478104e12ed289611`. These findings do not rerun old upstream reviews and are not executed-test evidence. No tests/typechecks/mutations/CI/launcher/private-auth/model execution while source is incomplete.

Relay remains sole owner/integrator of the affected W6/Task/Session/approval/current-context files. Upstream supplies exact findings, canonical schema/verifier and prepared contract regressions. Fix these at source before the final combined batch.

## Native ports review

Reviewer `ses_ee0e4488effe3eiCLA7SMQQX8E`, FIX-FIRST:

1. P1: `arsenal-bindings.ts` acquires `EventV2Bridge.Service` but LayerNode dependencies omit `EventV2Bridge.node`. Add the actual direct dependency; transitive private deps do not export it.
2. P1: cold review compares review actor to validation actor. Native validation actor is Maestro; review actor is Lucy. Validate each actor's canonical identity and match Project/Session without requiring identical members.
3. P1: final completion requires validation-linked review at current HEAD, but review producer only accepts frozen pre-dispatch context HEAD. In-scope committed output advances HEAD and cannot receive a qualifying final review. Reconcile final native artifact review against approved workflow/final HEAD while retaining original approval/context; do not mint a replacement plan simply to fit.
4. P1: live skill revalidation hashes cached `SkillV2.list()` content. Filesystem/URL source drift can remain invisible. Reacquire selected actual source bytes before comparing materialized resolved digests; preserve immutable embedded-source handling.
5. P1: resume selects newest presentation before reservation. Bind authority to the actual retained Task call/authorization reservation and its exact presentation/decision; later presentations do not replace existing approved ownership.

## V3/hash review

Reviewer `ses_ee0e44874ffebAf5bkZB16cbkI`, FIX-FIRST:

1. P1: grounded V3 producer succeeds, but `context-record.ts` recording/currentness still requires revision v2. Accept V3 through existing grounded path only when grounding is actually present; keep ungrounded V3 refused.
2. P2: `maestro-plan.ts` lacks strictParameters and default schema decode strips forbidden nested/raw attribution and worker claims. Add existing strict allowlist at root/Field/upstream/workflow boundaries; keep parameters as allowed string map. Caller unknown authority claims must be rejected, not silently removed.
3. P2: prepared task-hash fixture uses resolved skill `{id, content, sha256}` instead of canonical `{wp, skill, mode, content, sha256}`. Decode fails before drift assertions. Use the real SkillBinding shape.

Static source positives: legacy V1/V2 unchanged, WorkflowFields embedded in checked V3, V3 inventory registered, reader explicit storage version, attribution host-observed, resulting revision ID outside its own hash, workflow definition/writePaths covered by current Task hash. These are source observations, not runtime acceptance.

## Resume/provider boundary review

Reviewer `ses_ee0e44865ffegP4Nq4IJvbNcKb`, FIX-FIRST:

1. P1: original presentation/decision lost on resumed bound Task; same as native-port finding above.
2. P1: reconstruction calls beforeDispatch and chooses newest completion arm rather than retained `bound.token`. Reconstruct from actual persisted token/native arm fact and placement; later arm B does not replace Task A's arm.
3. P1: plain resume calls WriteRoots.rebind before workflow-binding/missing-workflow guard. A rejected wider-root resume already persists a wider permission snapshot visible to active child. Check retained workflow binding before any root/reservation mutation and retain its original permissions.
4. P2: pending disposition repair returns unchanged currentStep, then caller increments it, spending provider-turn allowance without a provider request. Reconciliation leaves provider-turn count unchanged.

Static source positives: exact assistant/expected position carries settlement; one original evaluator/lock, pure view no retries/evaluation/advance, nonadvance/noncomplete stops continuation, worker done is not global completion. Background upstream remains explicit HOLD: producer still lacks authoritative exact returned assistant plus referenced durable delivery on original Task part. Workflow disposition alone does not supply those facts.

## Concrete next handoff

Publish corrected Relay source over its preserved branch, with no validation dispatch. Consume fixes once in combined candidate, then update upstream verifier only after the exact background host settlement/delivery field shape is supplied. No copied replacement authority, invented DTO/version/ID or second loop.
