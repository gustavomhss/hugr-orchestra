# Protected genesis continuation — acceptance contract

Offline prerequisite: original-source replay 42056319550 at `aa8b55fe75` passed, with independently
reconciled 104 prompts, 103 original responses, final staging/CAS and native evidence. This document
does not itself authorize a provider call. Production waits for the continuation controls below.

## Frozen execution decisions

- Keep the original source checkout/index, initial nine-claim seed, original plan and all preserved final
  files independently. Rebuild the in-pass grounded set by delivering preserved responses through the
  compiled miner, not by seeding its final staging. Run one history instance/writer and sequential arms.
- Continue the same 200-site ceiling per arm, eight proposer workers, Grok subscription, `grok-4.7`,
  unchanged effort/one turn and 600000ms command cap. Cached deliveries still occupy their original sites;
  they do not reset the budget or become new provider calls. No policy/quality threshold changes.
- The original unresolved request stays unresolved forever in its immutable original chain. A selected
  retry is a NEW acknowledged request explicitly linked to that request and exact prompt hash/length;
  it is not a recovered original response. Require the exact unresolved UUID as an operator input.
- The checkpoint IO owner selects replay/retry/fresh before acknowledging dispatch. Replayed stdout,
  stderr and status are original bytes, and both new dispatch and completion are externally acknowledged
  before delivery. Fresh/retry execution keeps the existing protected wrapper and its acknowledgement
  withholding, privacy scan, pacing and termination. No hidden transport/model retries.
- Every continuation command records its disposition and source linkage in its durable dispatch and
  matching completion. A frozen continuation policy identifies source terminus, original populations,
  proof run/head, original model configuration, retry request and orchestrator revision before any dispatch.
- Reject unknown prompts until every source response and the selected retry have acknowledged completions.
  Reject known hashes with changed arms/lengths, duplicate requests/delivery, source mutation, wrong seed,
  wrong plan, wrong source/proof identity and changed budgets/configuration before provider execution.
- An interruption preserves all old evidence plus every newly acknowledged response, with remaining
  dispatches explicitly in flight. Recovery is explicit; there is no automatic fallback/restart.
- After mining, ordinary binding per-claim judgment, whole-place holds, governed promotion and reviewed
  Own export remain mandatory. Neither the offline proof nor a successful continuation control publishes.

## Source-routing seam (single owner, no IO/provider side effects)

`script/atlas-genesis/checkpoint-continuation.mjs` exports
`createContinuation(records, expectedSourceReceipt, retryRequest)`:

- Validate the complete original chain, independently frozen identity/terminus/populations, original
  pending request, plan and final staging/CAS hashes before returning the router.
- `take({arm,promptSha256,promptBytes})` reserves exactly one new request and returns a ticket containing
  `request`, the prompt/arm receipt, `origin.kind` (`replay`, `retry`, `fresh`) and source run/attempt/request
  linkage for replay/retry. Replay tickets additionally carry original `completion` status/stdout/stderr.
  This function never starts a process. A known source hash can never fall through to a fresh call.
  Returned tickets, origins and replay payloads are immutable; later caller mutations of receipt objects
  cannot redirect routing. Repeated source hashes are refused as ambiguous, not treated as occurrences.
- `confirm(request)` marks completion only after its external acknowledgement. Missing or repeated
  confirmation refuses. Fresh tickets require all original completions AND the selected retry confirmed;
  the pending retry may coexist with cached siblings in its original eight-worker batch.
- `summary()` separates confirmed `replayed`, `retried`, `fresh` and still `inFlight` new requests, retaining
  `originalUnresolved: 1`. Routing metadata contains hashes/identities, never prompt/response plaintext.

## Mechanical acceptance

1. Routing tests: exact original replay, explicit new retry identity, fresh-call barrier, confirmation
   accounting, repeat/unknown/arm/length refusal and frozen source/terminus/population/CAS corruption.
2. Actual protected command + checkpoint writer: fake provider invocation count distinguishes replay from
   retry/fresh; binary/status fidelity; external readback before delivery; upload failure withholds bytes;
   duplicate concurrent delivery refuses; timeout kills/reaps the child. Restore actual remote envelopes
   and verify origin linkage and old/new evidence after interruption. No subscription calls in controls.
3. Original-source compiled miner control: the original plan/prompts and all 103 exact responses are
   consumed once, retry targets the exact unresolved prompt, all original final claims/receipt bytes remain,
   the same native 200-site ceiling (not 200 new calls) bounds advisory, eight workers remain unchanged,
   and subsequent arms share the history/writer. A deliberately fake provider supplies only control replies.
4. Negative controls mutate source bytes, routing disposition, source linkage, budget/plan/seed and external
   acknowledgements. Each named oracle must reject the corresponding actual implementation mutation.
5. Reconcile the exact-head remote artifacts independently before any real continuation dispatch. Production
   must then reconcile cached versus new calls, individual claims, remaining budgets and source-linked retry.

Suite-critic additions: source-unit tests separately bind every original identity field, valid re-chained
plan/staging/CAS mutations, zero/two pending requests, ambiguous hashes, immutable tickets/source input,
single-owner concurrent reservations and metadata privacy. Runtime proof run/head, model/subscription/
effort/turn/timeout/seed/plan binding, crash-at-each-ack-boundary recovery, actual native budget/call ledger
and negative ordinary-governance controls belong to acceptance layers 2–5. Those integration obligations
   are NOT discharged by the source-unit suite and must be executable before a real continuation dispatch.

## C3 transport integration seam (lead-owned)

`startCheckpointWriter(identity,directory,snapshot,continuation?)` takes an optional fourth argument
`{recordsDirectory,expectedSourceReceipt,retryRequest}`. The worker loads original numbered envelopes and
creates the C1 router before remote initialization; this argument and `identity.continuation` must either
both exist or both be absent. Source binding must match the C2 identity's frozen run/attempt/revision,
terminus/populations and pending request/hash. Existing non-continuation behavior stays unchanged.

At `/dispatch`, persist the current plan first, verify the original advisory plan hash, then call
`take({arm:activeArm,promptSha256,promptBytes})`. Publish the new ticket's dispatch with its immutable
origin. For replay, publish the original completion bytes/status with that same origin, then `confirm`
and return `{request,completion}`. For retry/fresh, remember the ticket and return `{request}`; only an
acknowledged `/completion` with the server-owned matching origin may confirm it. Clients never choose
their own origin. Failure at any external acknowledgement stops the writer and withholds command bytes.

`grok-checkpoint.sh` recognizes only a validated `completion` in the dispatch acknowledgement as a cached
delivery: decode/cat its exact binary stdout/stderr and exit status without starting `grok-text.sh`.
Absent that field, its existing direct child supervision and external completion acknowledgement remain.
An advisory arm-end/final snapshot requires every original completion plus the selected retry confirmed
and no new in-flight requests. C3's setup/policy checks separately bind initial seed, proof run/head,
compiled source/configuration, total budget and operator retry input before any real provider command.

### C3-P policy validator (independent pure subtask)

`checkpoint-continuation-policy.mjs` exports
`requireContinuationPolicy(observed,expectedSourceReceipt,expectedProofReceipt)`, without IO/process calls.
Its independent writer owns only that module and its new `checkpoint-continuation-policy.test.mjs`.
The lead's setup derives `observed` from actual files, indexes, run/artifact metadata and compiled command
configuration; operator strings alone are not evidence. The validator must refuse mismatches before
provider execution. It returns a defensive, recursively frozen copy of the verified observations plus
`version:1`, `source` and `proofReceipt` copies of the two independently frozen receipts.

Observed fields and correspondence are fixed:
- `sourceRun`, `sourceRevision`, `retryRequest`, `budget`, `arms`, `indexRun`, `retainedRuns`,
  `wrapperSha256`, `profileSha256` equal the corresponding original source identity/request fields.
  Array order is preserved (sequential arms, original retained-run order).
- `grokVersion`, `model`, `maxTurns`, `commandTimeoutMs` equal the original source receipt, `poolWidth`
  is exactly 8 and `authMode` is exactly `subscription`. Original effort is bound by the unchanged wrapper,
  profile, CLI version and one-turn settings; do not invent a new effort selector.
- `initialEnvelopeSha256`, `initialStagingSha256`, `originalPlanSha256` equal the independently frozen
  source seed/envelope/plan hashes. `orchestratorRevision` is a full 40-hex revision.
- `proof` has `repository`, `workflow`, `event`, `branch`, `run`, `attempt`, `head` equal to the frozen proof
  receipt, `status:"completed"`, `conclusion:"success"`, and an artifact with exact `id`, `name`, `digest`
  plus `expired:false`. Missing observations refuse. No credential bytes enter policy metadata.
  Unknown keys in observations, proof observations or artifact observations also refuse; only this
  declared metadata shape is copied into the policy, never a raw environment or API response.

Acceptance: positive genuine-shaped fixture; per-field/array/status/artifact/seed/configuration refusals,
defensive immutability, metadata privacy and real implementation mutations of configuration/proof checks.
Only surgical, dependency-free local tests are in this subtask; no CI/epic/provider execution. Stop at a
pushed bounded diff and exact evidence; the lead reviews, integrates and checks actual observation wiring.
