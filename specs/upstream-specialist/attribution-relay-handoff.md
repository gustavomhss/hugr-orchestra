# Attribution source handoff to Relay

2026-10-09. Owner requested implementation-first parallel execution and validation only after combined code is ready. This is a source handshake, not test/CI approval or full W6 closure.

**Latest complete source handoff:** `01a48f6a22158437ce544d8cdcef08a29ddcd7fb`, parent runtime `b1cad41dc515eec9dcf474c413da853061894ac1`, branch `fork/upstream-combined`. It includes the full native registration/skills/Arsenal/bootstrap/Maestro transfer in addition to the component commits below. The clean inspected b1 roster lacks walt, so the two attribution components alone are insufficient. Consume the complete b1-based handoff instead of reapplying component patches independently. Static source identity/composition reviews only; final combined checks remain UNRUN. Details: `combined-source-handoff.md`.

## Exact reviewed schema commit

`8f73c045307f06da311ee6f8b1bb6ba378bf265c` — `feat(schema): define upstream attribution and plan revision v3`.

Parent baseline: `05a431167bead651abcc3e748f1516cf4a3035f4`. Both source commits are published for resumability on `fork/upstream-attribution` (GitHub `gustavomhss/hugr-orchestra`), head `cc6f5a8f755bb7d765c5d918ecd23180244be006`. No PR opened. Consume exact commits/patches over Relay's current runtime baseline; this branch is not a wholesale replacement for that baseline. Files:

- New `packages/schema/src/upstream-attribution.ts`.
- Imports + PlanRevision V3 source region only in `packages/schema/src/maestro-event.ts`.
- New focused `packages/schema/test/upstream-attribution.test.ts`.

Cold schema/source-region review: `ses_ee153afefffepn37mfTkA8sk8W`, APPROVE restricted scope. No tests, typecheck, mutation or CI run for this commit yet. It can be consumed as an exact source patch (`git show --format= <sha>`); do not bring the older runtime baseline across by merging the whole branch. Relay is the final integrator of shared `maestro-event.ts`, consuming this source patch without redeclaring DTO/brands/version semantics. Runtime integration baseline acknowledged by Relay: `b1cad41dc515`.

Relay's remaining source integration: register `PlanRevision.RecordedV3` in existing `MaestroEvent.Definitions`; reconcile remaining publication/Task binding, V3 reader/producer/hash, actual Event.ID reference and manifests/generation. V1/V2 historical shape/source stays unchanged; no synthesized attribution. Preserve upstream's two-site `nativeUpstream` flag in `arsenal-bindings.ts`.

## Host verifier API

```ts
UpstreamProvenance.observe(input: Pick<
  UpstreamAttribution.V1,
  | "projectID"
  | "parentSessionID"
  | "parentMessageID"
  | "parentCallID"
  | "authorSessionID"
  | "authorMessageID"
  | "logicalTaskID"
>)
```

Returns canonical host-observed `UpstreamAttribution.V1`; named `UpstreamProvenance.Denied` codes follow `plan-source-contract.md`. Dependencies: actual native Agent, Session, Database and existing LogicalTask reads. Reads retained V1 and current V2 projected facts, reconciles same-ID conflicting views, actual Project/parent Task/child/author and successful terminal proposal. No artifact acquisition, PlanRevision publishing or approval claim in this method.

Exact host commit: `cc6f5a8f755bb7d765c5d918ecd23180244be006`, parent `8f73c045307f06da311ee6f8b1bb6ba378bf265c`, message `feat(orchestra): verify stored upstream proposal attribution`. It adds only `packages/orchestra/src/maestro/upstream-provenance.ts` and `packages/orchestra/test/maestro/upstream-provenance.test.ts`. Both source commits are applied to the lead candidate index; unrelated dirty work is preserved.

Independent host review `ses_ee153b016ffeKTQcv7iWJgICoV` APPROVE covers synchronous V1/current V2 and explicit background HOLD only. Reviewed SHA-256 bytes: implementation `07eda178373607e13d3fddbbe480305e8194bef1e9ffe6488efe01736ae0361a`; test `e6363e52f3c91cc069055c1aa03203119e394d840c4ff3cc4f24a498ca5787ac`. Prior permissive notice/job/timestamp inference was removed after two FIX-FIRST reviews. Compile checks, tests, mutation, CI and model pilot are UNRUN for this wave; validation waits for combined Relay/runtime implementation readiness.

## Required background settlement facts — Relay-owned existing boundary

Independent host review found that public prompt inputs can carry synthetic/source/workResult metadata. A process-local completed BackgroundJob plus matching notice or output bytes does not prove actual host delivery or returned assistant ownership. Job completion happens before asynchronously forked delivery, and delivery may fail. Clock windows cannot establish dispatch generation.

Before background attribution can succeed, Relay's minimal existing Task/Session settlement must:

1. Persist final host outcome and `workResult` bound to the **actual returned** assistant into the exact existing parent Task part/tool, retaining actual parent Session/message/call, child Session and logical Task.
2. After delivery is durable, persist its actual message reference into that same Task evidence; retain a part reference where V1 multipart identification requires it. Caller-supplied synthetic metadata must never substitute for this host-written reference.
3. Capture original dispatch/result identities before async delivery/resume; do not call `lastAssistant()` later and attach another run's message to the original call.
4. Support narrow host settlement updates after the initial Task part is completed, including settle-before-initial-completion races. Existing generic metadata callbacks currently ignore completed parts; current V2 synthetic projection drops arbitrary input metadata.

These are observed facts on existing records, not a new provenance identity/store/loop/approval flow. Upstream owns verifier reconciliation; Relay owns shared settlement implementation. Until this handoff is implemented and its exact field shape acknowledged, background adoption returns `UPSTREAM_ATTRIBUTION_PROPOSAL_UNAVAILABLE` HOLD rather than accepting timing/notice inference. Synchronous V1/V2 adoption remains the bounded verifier implementation target.

Required prepared cases: completed-but-undelivered job with forged notice; actual returned assistant versus later identical bytes; same-child resumed dispatch; same-tick settlement; delivery failure/interruption; V2 durable delivery reference; exact retry without duplicate provider work. Validation is batched after combined source is ready.

Runtime pilot command and credential-store placement are in `pilot-runtime-handoff.md`. Runtime owns read-only Credential inheritance; no model pilot runs during incomplete implementation.
