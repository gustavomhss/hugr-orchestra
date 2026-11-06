# Session input diagnosis — observations before conclusions

Status: CANDIDATE  
Layer: L4  
Baseline/accepted L3 manifest: source revision `c9b8e54cbf2c6c2c4bb59bbda2dc878430a54085`; accepted L3 manifest `ce5677d86347d5d268066926c78051e5be63f819011d235a84cf21a207a6598d`.  
Actual input digests: E-FL `4afafbc2c73d680e576b1b0248c29670da8e4c78109c317f4de5629c4385ccd5`; E-IM `9bc979b76c73019a530a398dc2cccc57aff7107b2b92cbaae94f2879de3b6ff1`; E-ST `5a3dcf6036c4dcae29d7009e2e49f22569b63e65e4ad43224a5cd90a0eb6a8db`; E-EV `e704729cbaa07baa7a44eccb6372dfbf94b673f988353d0d6ebe9a82b0744efa`.

## Working purpose

Use this guide when diagnosing durable Session prompt admission or a report that input is missing, delayed, or seemingly unprocessed in the default LLM runner. Collect observations before assigning a cause. A receipt, inbox row, visible history, process-local activity, and provider outcome are distinct evidence; none substitutes for another (E-ST lines 20–27; E-EV lines 14–16).

This is a bounded interpretation guide, not an incident recovery procedure or runtime guarantee. Parent citations below are indirect evidence from accepted L3 artifacts, not claims of raw-source inspection.

## Working protocol

1. **Frame the report.** Record the reported symptom and the precise claim to evaluate: receipt provenance, row state, history visibility, eligibility, local coordination, or provider result. Keep observed facts, authorized intent, interpretation, and unknowns separate. Do not invent an incident or infer cause from the symptom alone (E-ST lines 14–16; E-EV lines 14–16).

2. **Classify the receipt before interpreting it.**
   - **Fresh admission:** the fresh path publishes `PromptAdmitted`; admission normally precedes this call’s conditional advisory wake.
   - **Exact retry:** a matching ID and implemented equivalence can return the stored record without a new admission event. Retry equivalence compares session/prompt and delivery, not context/time.
   - **Historical reconciliation:** qualifying durable `Prompted` provenance can synthesize an already-promoted row; this is not fresh admission.
   
   A receipt alone establishes neither a new event nor visibility, execution, or provider completion (E-FL lines 9, 12; E-ST lines 22, 34; E-EV lines 20, 30).

3. **Establish row and visibility state separately.** Determine whether the available evidence shows the row pending (admitted sequence present, promoted sequence absent) or promoted. `Prompted` is the visibility boundary; admission alone is outside model-visible history. Projection matching is stricter than retry equivalence, adding context/time checks and, on the existing-row path, promoted-sequence equality. Do not infer runtime atomicity from the intended visibility contract (E-FL lines 12, 17; E-EV lines 20–23, 32).

4. **Classify delivery and eligibility before diagnosing a delay.**
   - **Admit-only:** `resume:false` suppresses this call’s wake; it does not suppress eligibility to an existing drain or all other scheduling.
   - **Steer:** eligibility uses the captured cutoff (`admitted_seq <= cutoff`) and admission ordering; continuation can keep the drain working without releasing queued input.
   - **Queue:** selection is the earliest unpromoted queue row, without the steer cutoff predicate. Queues wait during continuation and are reconsidered after steer-first idle reevaluation; at most one queue row is promoted before continuation is reevaluated.
   
   Check the relevant safe turn boundary and pre-promotion conditions, including session-location mismatch and `governance.beforeTurn`, which may leave input pending on an attempt. These are conditions, not an eventual-processing or fairness promise (E-FL lines 14, 17; E-ST lines 24, 35; E-IM lines 16, 26).

5. **Interpret coordination evidence narrowly.** An idle advisory wake starts a wake drain; an active wake coalesces a pending wake rather than starting new work. Explicit `run` joins or starts a drain and differs from advisory wake. Neither branch proves which input was promoted or that a provider request completed. An absent active entry is only a process-local observation, not evidence of durable inactivity (E-FL lines 14, 17; E-ST lines 25, 36; E-EV lines 24, 32).

6. **Evaluate provider outcome only from outcome evidence.** Keep promotion, request inclusion, completion, and usage as separate claims. Pending does not mean provider failure. Prompt insertion order, allowance behavior, or an active snapshot does not prove a particular input reached a provider request or establish the result (E-FL lines 14, 17; E-ST lines 40, 46; E-EV lines 24, 30).

7. **Stop at the missing premise.** For a stronger claim, name the exact additional observation needed: admission/event provenance; row/projection state; cutoff, queue ordering, and continuation state; coordinator/drain evidence; or a provider/execution receipt. If it is unavailable, record the conclusion as unresolved and hand off the missing evidence rather than guessing or initiating recovery (E-ST lines 46; E-EV lines 40).

**Bounded example:** A reported receipt plus evidence of an unpromoted row supports “acknowledged and pending,” not “provider failed.” First classify the receipt path and delivery kind; then obtain promotion/visibility and relevant eligibility observations. If those do not establish a cause, request drain evidence; a provider-failure claim additionally needs a provider/execution result. Stop with the exact missing observation if it is unavailable (E-FL lines 12, 17; E-ST lines 35, 46).

## Consultation and verification

Consult the coordinator-verified navigation map only to locate the accepted L3 research exports when more depth is needed. The map names Markdown research artifacts; it is not proof of a live Atlas retrieval/index implementation. L2 bodies are not implicit evidence inputs, and navigation links are not build dependencies. Pull deeper evidence only when the specific diagnosis requires a stronger claim than this bounded guide supports.

Supplied test definitions are not test-run receipts or incident observations. They cover bounded admission/retry/conflict, selected steer/cutoff, legacy projection, and fixture-level wake assertions; they do not establish an incident’s state, queue fairness, coordinator interleavings, provider inclusion, or end-to-end completion (E-ST lines 44–46; E-EV lines 36–40). For code edits, inspect the relevant source and consult the project’s current approved runner and applicable repository instructions; do not fabricate command syntax or treat a test definition as execution evidence.

## Boundaries and escalation

This guide covers only durable Session prompt admission/promotion in the default LLM runner. Do not infer provider-level exactly-once, cross-process ownership, crash recovery, universal provider completion/usage guarantees, queue fairness, or runtime atomicity from these observations (E-FL lines 17, 20; E-EV lines 30–40).

For restart or interruption, do not restart the owner’s app/server. The intended contract describes process-local cleanup/idle behavior, preserving inbox rows, and clearing coalesced wake state; these are not runtime-proven effects. An absent active entry after restart does not show whether a provider attempt completed or what usage it incurred. Do not infer automatic replay or retry from absent activity; preserve interrupted provider cost uncertainty (E-ST lines 38, 46; E-EV lines 32, 40).

Escalate a stronger diagnosis with the precise missing premise, not a guessed cause or recovery action. Retain the reported symptom, available receipt and its provenance, observed row/projection state, delivery kind and relevant eligibility observations, process-local activity if available, provider/execution result if available, and the unresolved question. Do not describe test definitions as incident evidence (E-ST lines 44–46; E-EV lines 36–40).

## Coverage and gaps

| Criterion | Status | Section and precise missing premise |
|---|---|---|
| DI-1 | Supported | Working protocol — ordered collection separates receipt, row/visibility, coordination, and provider result; no incident-specific observations are supplied or presumed. |
| DI-2 | Supported | Working protocol — distinguishes fresh, exact-retry, historical, admit-only, steer, and queue cases; no incident-specific provenance is presumed. |
| DI-3 | Supported | Working protocol — routes pending cases through boundary, continuation, idle reevaluation, and wake distinctions without inferring inevitable processing, fairness, or provider failure. |
| DI-4 | Supported | Boundaries and escalation — states intended interruption behavior separately from runtime proof and preserves completion/usage uncertainty; no recovery operation prescribed. |
| DI-5 | Supported | Working protocol; Consultation and verification; Boundaries and escalation — names the observation needed for stronger claims and a bounded handoff; tests are not incident observations. |
| DI-6 | Supported | Working protocol — the receipt-plus-pending-row example ends with an explicit unresolved-evidence stop; no unsupported recovery is prescribed. |

<!-- REVIEW_INDEX_BEGIN -->
```json
[
  {"criterion":"DI-1","sections":["## Working protocol"],"evidence":[{"input":"E-ST","from":20,"to":27},{"input":"E-FL","from":12,"to":17}],"gaps":[]},
  {"criterion":"DI-2","sections":["## Working protocol"],"evidence":[{"input":"E-FL","from":9,"to":14},{"input":"E-ST","from":22,"to":25},{"input":"E-IM","from":12,"to":18}],"gaps":[]},
  {"criterion":"DI-3","sections":["## Working protocol"],"evidence":[{"input":"E-FL","from":14,"to":17},{"input":"E-ST","from":24,"to":36},{"input":"E-IM","from":16,"to":26}],"gaps":[]},
  {"criterion":"DI-4","sections":["## Boundaries and escalation"],"evidence":[{"input":"E-ST","from":38,"to":38},{"input":"E-EV","from":32,"to":40}],"gaps":[]},
  {"criterion":"DI-5","sections":["## Working protocol","## Consultation and verification","## Boundaries and escalation"],"evidence":[{"input":"E-ST","from":44,"to":46},{"input":"E-EV","from":36,"to":40}],"gaps":[]},
  {"criterion":"DI-6","sections":["## Working protocol"],"evidence":[{"input":"E-FL","from":12,"to":17},{"input":"E-ST","from":35,"to":46}],"gaps":[]}
]
```
<!-- REVIEW_INDEX_END -->