# Session input ownership — responsibilities and decisions
Status: CANDIDATE
Layer: L4
Accepted L3 manifest: ce5677d86347d5d268066926c78051e5be63f819011d235a84cf21a207a6598d
Source revision: c9b8e54cbf2c6c2c4bb59bbda2dc878430a54085
Inputs: E-FL L3:integrated-flow @ 4afafbc2c73d680e576b1b0248c29670da8e4c78109c317f4de5629c4385ccd5 (43 lines); E-IM L3:integrated-change-impact @ 9bc979b76c73019a530a398dc2cccc57aff7107b2b92cbaae94f2879de3b6ff1 (56 lines); E-ST L3:integrated-state-interpretation @ 5a3dcf6036c4dcae29d7009e2e49f22569b63e65e4ad43224a5cd90a0eb6a8db (70 lines); E-EV L3:integrated-evidence-boundaries @ e704729cbaa07baa7a44eccb6372dfbf94b673f988353d0d6ebe9a82b0744efa (64 lines)

## Working purpose
Entry trigger: a maintainer faces a Session-input behavior, change, diagnosis, or evidence question in the default LLM runner only. Supported responsibility: make a caller-supplied prompt durably acknowledged, later visible, and only then potentially part of a provider request, without conflating receipt, visibility, execution advisory, and provider outcome (E-FL lines 8-9; E-EV lines 12-16). Route, do not repeat: behavior/lifecycle questions to the flow view (E-FL lines 8-14), coupled-change impact to the change-impact view (E-IM lines 8-18), observable-state interpretation to the state view (E-ST lines 12-27), and authority/verification limits to the evidence view (E-EV lines 28-40). Stop if the question requires hosted/distributed execution, crash recovery, ration rationale, or limit values — those premises are not supplied (E-FL lines 16-17; E-EV lines 30-32).

## Working protocol
Ordered decisions/actions — bounded working recommendation derived from the accepted views above, not new product policy:
1. Classify the question (behavior / change / diagnosis / evidence) and route to the single view named in Working purpose; pull deeper only for the decision at hand.
2. Separate the four claims before deciding: caller receipt/provenance, row/visibility, execution advisory, provider outcome. Fresh admission precedes conditional advisory wake; promotion is a later conditional outcome, not a prerequisite for wake (E-FL lines 8-9; E-ST lines 20-27). A receipt need not entail a new `PromptAdmitted` event — exact retry reuses stored state and historical reconciliation can synthesize an already-promoted row without publishing a new admission (E-FL lines 11-12; E-IM lines 11-14).
3. Identify the accountable boundary owner/contract for the decision: admission for identity/receipt/retry reconciliation, persistence/projection for `session_input` row, `admittedSeq`/`promotedSeq` carriers and `PromptAdmitted`/`Prompted` writes, delivery for steer/queue eligibility at a provider-turn boundary, execution coordination for process-local start/join/coalesce only (E-FL lines 8-9; E-IM lines 8-9). Do not invent people, seat names, or new policy; name the boundary contract.
4. Apply the distinguishing predicates: retry `equivalent` = delivery plus session/prompt only, whereas projection `matchesProjection` adds context, epoch-millis time, and promoted-sequence equality on the existing-row path (E-IM lines 13-14; E-FL lines 11-12). Steers require `admitted_seq <= cutoff` ordered by admission; queues take the earliest unpromoted queue row without that cutoff, promote at most one, then eligible steers, and wait during continuation until steer-first idle reevaluation (E-FL lines 13-14; E-ST lines 23-24). `resume:false` suppresses only that call's wake, not eligibility to an already-active drain or other scheduling (E-FL line 14; E-ST line 25).
5. Decide and record the completion receipt (see Consultation and verification). Stop conditions: pending row, absent `active()` entry after restart, or coalesced wake is not evidence of provider failure or completion; `active()` is a process-local snapshot empty after restart and does not resolve whether an interrupted provider attempt completed or what usage it incurred (E-FL line 17; E-ST lines 36-38).

## Consultation and verification
Consult only the needed depth: flow for lifecycle order, change-impact for coupled obligations (E-IM lines 20-30), state for interpreting observations (E-ST lines 31-40), evidence for what supplied test definitions can and cannot prove (E-EV lines 34-40; E-FL lines 19-20). Where commands/actual assertion details are unavailable, require consultation of the project's current approved runner and applicable repository instructions; do not fabricate CLI/MCP syntax, tests, or config. Never restart the owner's app/server, discard work, or infer retries/replay from absent activity; preserve interrupted provider cost uncertainty (E-ST lines 37-38).
Completion/handoff receipt — state: affected boundary (admission / projection / delivery / coordination), knowledge versions (accepted L3 manifest and source revision above), deciding evidence (labels plus parent line ranges), verification reach (which supplied assertions were matched, explicitly noting test definitions are not execution receipts, E-FL lines 19-20), and unresolved obligations (exact missing premise, e.g. drain/`run(db,event)` internals, `execution.wake` routing, atomicity/sequence-allocation proof, or runtime receipts, E-FL lines 19-20). A receipt is not a success claim from hashes, freshness, or a successful model response alone (E-EV lines 36-38).
Concrete supported decision path: maintainer observes an acknowledged-but-not-visible input. Separate receipt from visibility (E-ST lines 34-35), check whether the row is pending vs promoted (E-FL lines 11-12), apply the correct steer-cutoff vs queue-earliest predicate rather than unifying them (E-FL lines 13-14), note `resume:false` only removes this call's wake (E-ST line 33), and issue the receipt above naming drain/eligibility evidence as the missing premise if the cause remains undetermined — do not infer provider failure (E-FL line 17).

## Boundaries and escalation
Handle intent/implementation disagreement without silently choosing a side: label intended policy vs observed behavior separately — e.g. intended provider-turn allowance reset on promotion vs observed `currentStep` reset to 1 only when at least one row was promoted, and last-step `MAX_STEPS_PROMPT` insertion preceding `compaction.transform` as observed ordering (E-FL lines 13-14; E-EV lines 24-26; E-ST line 40). Intended atomic visibility is not runtime proof (E-EV lines 22-24; E-ST line 23). Escalate as BLOCKED with the exact missing premise when a stronger claim needs an absent implementation body, transaction/runtime receipt, or test assertion (E-EV lines 38-40); do not strengthen the claim, invent exactly-once, crash-safety, cross-process, or universal provider completion/usage guarantees (E-FL line 17; E-IM line 30). Distinguish evidence insufficiency, source drift, and semantic conflict; old acceptance cannot make drifted knowledge current (E-EV lines 30-32, 36-38).

## Coverage and gaps
| Criterion | Supported / Blocked | Section | Precise missing premise |
|---|---|---|---|
| OW-1 | Supported | Working purpose | None within default-runner scope; route targets named above |
| OW-2 | Supported | Working protocol | None; four-claim separation prescribed in step 2 |
| OW-3 | Supported | Working protocol | None; boundary owners named in step 3, no invented people/policy |
| OW-4 | Supported | Boundaries and escalation | Stronger guarantees remain BLOCKED on drain/routing/atomicity bodies and runtime receipts, named not inferred |
| OW-5 | Supported | Consultation and verification | None; receipt fields prescribed, hashes alone explicitly insufficient |
| OW-6 | Supported | Coverage and gaps; Consultation and verification | None for bounded guide; no source-discovery procedure or incident runbook supplied, by scope |

<!-- REVIEW_INDEX_BEGIN -->
```json
[
  {"criterion":"OW-1","sections":["## Working purpose"],"evidence":[{"input":"E-FL","from":8,"to":9},{"input":"E-EV","from":12,"to":16},{"input":"E-FL","from":16,"to":17}],"gaps":[]},
  {"criterion":"OW-2","sections":["## Working protocol"],"evidence":[{"input":"E-ST","from":20,"to":27},{"input":"E-FL","from":11,"to":12},{"input":"E-IM","from":11,"to":14}],"gaps":[]},
  {"criterion":"OW-3","sections":["## Working protocol"],"evidence":[{"input":"E-FL","from":8,"to":9},{"input":"E-IM","from":8,"to":9},{"input":"E-IM","from":13,"to":18}],"gaps":[]},
  {"criterion":"OW-4","sections":["## Boundaries and escalation"],"evidence":[{"input":"E-FL","from":13,"to":14},{"input":"E-EV","from":22,"to":26},{"input":"E-EV","from":38,"to":40},{"input":"E-FL","from":16,"to":17}],"gaps":[]},
  {"criterion":"OW-5","sections":["## Consultation and verification"],"evidence":[{"input":"E-FL","from":19,"to":20},{"input":"E-EV","from":34,"to":38},{"input":"E-ST","from":42,"to":46}],"gaps":[]},
  {"criterion":"OW-6","sections":["## Coverage and gaps","## Consultation and verification"],"evidence":[{"input":"E-ST","from":31,"to":40},{"input":"E-FL","from":22,"to":30},{"input":"E-EV","from":42,"to":51}],"gaps":[]}
]
```
<!-- REVIEW_INDEX_END -->