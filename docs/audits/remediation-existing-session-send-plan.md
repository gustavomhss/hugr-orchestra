# Existing Session first-Send ownership repair

Baseline: `1f12b769ab`, with production unchanged from the second cold run.
This closes an integration failure in the original campaign; it opens no new audit front.

## Observed failure and acceptance

Focused run 43467066174 failed all 14 `prompt-input-bytes.spec.ts` cases.
The fill case used one continuously open event stream and received canonical ready eligibility,
yet emitted no agent, model, or prompt POST. Its optimistic user row triggered
`followSessionModel`, whose `local.session.restore` changed an absent local choice into an
explicit model/default variant. The unchanged raw-intent ownership guard correctly rejected that
change, but it was caused by the operation itself. This is a production failure, not a fixture response gap.

Acceptance spine:

1. The existing V2 fill case reaches the actual prompt HTTP boundary with exact bytes and model selection.
   Preserve its recorded red result and every other byte/editing oracle; qualify all 14 cases after repair.
2. A retained first Send whose prompt acknowledgement is lost retries the same message ID and payload.
   Include canonical first-user projection before releasing the failed acknowledgement, using the production
   route, Local state, Session model follower, composer, and SDK. HTTP fixtures prove UI behavior only.
3. Existing consumer and retry controls continue rejecting genuine raw-model/variant, A-to-B-to-A,
   Session, credentials, transport and policy changes; existing durable SQL lost-ACK controls remain green.
4. Loaded-history restoration and remote Session model following remain in place. No optimistic guard,
   raw-intent equality check, policy fence, or retry identity check may be removed or weakened.

## Frozen implementation decision

At deliberate normal Send for an existing Session, materialize its resolved local selection **before**
capturing ownership or constructing the first action fingerprint. Reuse `local.session.restore` and its
existing matching-Session, saved-state and handoff guards. Supply the resolved execution input model,
including its resolved variant, and the selected stable agent ID. Later own history echo is then a no-op.

Apply only when the composer uses that same `local.model`, storage/catalog are ready, content exists,
and the operation is neither shell, local queue, nor a recognized slash command. An unknown slash
prompt still follows ordinary prompt admission. Do not materialize on an empty Stop action.
Capture again only after the synchronous write; fresh canonical eligibility assessment remains mandatory.
Keep Draft admission and custom model-selection objects unchanged.

The deliberate Send is authoritative over history arriving later: it pins the selection visible at that
action, even if admission subsequently fails. This matches retaining a request for an exact retry.
An undefined resolved variant becomes explicit model default through the existing restore semantics;
an inherited resolved string stays that string. Do not normalize unrelated raw intents or alter query keys.

## Execution and gates

Root owns this decision, integration, documentation and final verdict. Four existing Sol agents own
disjoint work: test-only Draft transport repair (UI); first-Send HTTP regression (IO); independent
acceptance/design critique (Memory); benchmark evidence (Desktop). Production repair is sequential,
after the acceptance packet is reviewed. No agent may expand scope or dispatch tests independently.

Production benchmark BEFORE is hosted run 43474990691, snapshot
`67f0febd4dc8744f20e22d8ecb33177543b41703`, current renderer, production performance config,
`session-tab-switch-benchmark.spec.ts`, Linux, one worker, zero retries, three repetitions.
Record completion and raw metrics before production edits. Repeat the identical benchmark AFTER.
Benchmark completion is asserted; machine-dependent metrics have no fabricated pass threshold.

After focused browser and retry controls, serialize the app package typecheck and run repository guards,
boundaries, spawn checks and source-size gate. Then run the full cold aggregate with the repaired CI
matrix. E10/M13 remain unclosed until aggregate qualification; keep one draft PR, #1463.
