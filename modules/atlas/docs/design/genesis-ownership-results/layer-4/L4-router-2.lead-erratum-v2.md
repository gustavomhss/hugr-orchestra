# Session input maintenance — scoped change and verification
Status: CANDIDATE
Layer: L4
Source revision: c9b8e54cbf2c6c2c4bb59bbda2dc878430a54085
Baseline / accepted L3 manifest: ce5677d86347d5d268066926c78051e5be63f819011d235a84cf21a207a6598d
Inputs: E-FL @ 4afafbc2c73d680e576b1b0248c29670da8e4c78109c317f4de5629c4385ccd5; E-IM @ 9bc979b76c73019a530a398dc2cccc57aff7107b2b92cbaae94f2879de3b6ff1; E-ST @ 5a3dcf6036c4dcae29d7009e2e49f22569b63e65e4ad43224a5cd90a0eb6a8db; E-EV @ e704729cbaa07baa7a44eccb6372dfbf94b673f988353d0d6ebe9a82b0744efa

## Working purpose
Prescribe how a maintainer performs one scoped edit in the default LLM runner without re-mining the repository or treating a coupled predicate as isolated. Entry trigger: any proposed change to admission identity/provenance, `session_input` row or projection carriers, steer/queue eligibility, provider-turn allowance/transform order, or execution wake/run coordination. The work product is a bounded change decision, verification matched to the touched boundary, and a handoff receipt — not a deployed skill, live reader, or runtime guarantee. Admission normally precedes conditional advisory wake, and promotion is a later conditional outcome, not a prerequisite for wake (E-FL lines 8-9; E-ST lines 22-25). Preserve the distinction among receipt, visibility, process-local activity, and provider outcome (E-ST lines 27-27; E-EV lines 14-16).

## Working protocol
1. **Establish scope and current-knowledge compatibility.** State the exact boundary touched, the source revision and accepted L3 manifest above, and whether unchanged validated understanding remains reusable. Reuse unchanged valid knowledge; do not rebuild unrelated artifacts merely because navigation links exist (E-IM lines 8-9; E-IM lines 38-43). Navigation paths are research-export references, not build dependencies or live Atlas reader proof (E-EV lines 38-40).
2. **Classify the affected boundary, then consult deciding depth.** Pull depth only for the decision being made. Source inspection is allowed after this understanding step to perform an edit; these working instructions do not prohibit it.
3. **Identity/context/time/provenance edits (MA-2).** Assess retry `equivalent` separately from projection `matchesProjection`: retry compares delivery plus session/prompt only; projection adds context JSON and epoch-millis time, and the existing-row projection path also requires equal promoted sequence (E-FL lines 11-12; E-IM lines 12-14). Assess fresh admission, exact retry, and historical reconciliation as distinct provenances — a receipt need not entail a new `PromptAdmitted` event, and historical synthesis does not publish a new admission (E-FL lines 12-12; E-IM lines 12-12). Decision: record which predicate/carrier changed, whether the change is behavior-preserving under the stated contracts or an intentional contract change, and the coupled rows to re-assess (E-IM lines 21-25; E-IM line 30).
4. **Ordering/cutoff/queue/allowance/transform and coordination edits (MA-3).** Keep steer and queue predicates distinct: eligible steers require `admitted_seq <= cutoff` ordered by admission; queue selection chooses the earliest unpromoted queue row without that cutoff, promotes at most one, then eligible steers (E-FL lines 13-14; E-IM lines 16-16). Preserve conditional flow: queues wait during continuation and are reconsidered after steer-first idle reevaluation; after one queued promotion, continuation is reevaluated before another queue row (E-FL lines 13-14). Keep `resume:false` as suppressing only that call's wake, and keep wake active/idle branches, explicit `run` join/start, Session-ID keying, and Location placement as process-local coordination only (E-FL lines 14-14; E-IM lines 18-18). Keep intended allowance reset distinct from observed `currentStep` reset only when at least one row was promoted, and keep last-step prompt insertion before `compaction.transform` as observed ordering, not proof an input reaches a provider request (E-FL lines 13-14; E-EV line 24).
For a Session-ID keying edit, compare the old and proposed identity mapping against the same-Session `run` join and active-wake coalescing boundaries: assess whether work that should share an entry is split or unrelated Session work is grouped. This is a derived change check, not proof of an observed defect. For a Location-placement edit, assess the session-location mismatch pre-promotion boundary and whether the advisory/coordination remains process-local; do not infer that a placement/keying edit creates distributed ownership or provider completion. Record the affected join/start/coalesce or eligibility condition and required verification. If the exact key/placement mapping or placement lookup semantics cannot be decided from the accepted integration view, name that missing premise and consult the declared lower execution-contract reference before deciding; do not invent the missing routing implementation (E-IM lines 9, 18, 28; E-FL line 14; E-EV lines 32, 40).

5. **Edit, then verify at the touched boundary.** Apply only the decided change. Do not restart the owner's app/server, discard work, or infer retries/replay from absent activity; preserve interrupted provider cost uncertainty (E-ST lines 38-38; E-FL line 17).
6. **Stop conditions.** Stop and mark BLOCKED with the exact missing premise if a required claim needs an absent implementation body, transaction/atomicity proof, runtime/execution receipt, or test assertion — name it precisely, do not guess a command or guarantee (E-FL line 20; E-EV lines 32-40). Stop if impact for a touched category is unavailable: treat that as HOLD, not an empty successful worklist.

## Consultation and verification
Pair each change category with actual known assertion reach, not invented commands or test filenames (E-IM lines 21-28; E-IM lines 32-33). Supplied test definitions assert admission before transcript promotion, exact-retry/conflict, concurrent exact retry and steer promotion with cutoff exclusion, legacy projection/global-ID cases, and wake selection for default/`resume:true` versus `resume:false` (E-FL line 20; E-ST line 44; E-EV line 36). These are definitions, not execution receipts: no run evidence, provider-request inclusion, concurrent queue behavior, coordinator drain interleaving, crash behavior, or end-to-end completion is established (E-IM line 33; E-EV line 36).

| Change category | Supplied assertion reach to consult | Additional verification / stop |
|---|---|---|
| Identity, provenance, row/projection predicates and carriers | Admission before transcript visibility; exact retry/conflict; concurrent exact retry; legacy projection/global-ID cases (E-FL line 20; E-IM line 33) | Inspect the actual assertion for the touched fields/path. A context/time-differing retry case is an explicit additional need if narrowing `equivalent`; supplied definitions do not prove arbitrary context/time/projection edits fail a named test. |
| Steer ordering/cutoff, queue selection, allowance or transform ordering | Concurrent steer promotion and cutoff exclusion (E-FL line 20; E-IM line 33) | Those assertions do not prove queue concurrency, allowance runtime effects or input-specific request inclusion. Select additional boundary-specific evidence; block the stronger claim if unavailable. |
| Wake/run, Session keying or Location placement | Fixture-level default/`resume:true` wake versus `resume:false` no-wake selection (E-FL line 20; E-IM line 33) | This is not coordinator-interleaving, entry-key grouping or placement-route runtime proof. Verify proposed mapping/eligibility separately from provider invocation; missing implementation or runtime evidence is a named gap. |

Consult the project's current approved runner and applicable repository instructions for the actual invocation; where commands or assertion details are unavailable in this packet, require that consultation rather than fabricating syntax, settings, or authority (E-EV lines 38-40). A hypothetical behavior change is not proof a specific test fails; cite only its actual supplied assertions, and verify promotion eligibility separately from provider invocation for coordination changes (E-FL line 20; E-IM line 33). Bounded maintenance example: narrowing `equivalent` to add context/time — decide first that it changes retry semantics from equivalent to conflicting for context/time-differing retries (E-IM line 23), then inspect/add a context/time-differing retry case under the approved test instructions and re-run the relevant supplied assertions for that predicate; do not claim a named existing test fails unless its supplied assertion covers that case (E-FL line 20; E-IM line 33). Freshness, matching hashes, a successful model response, and component acceptance do not establish integrated semantic or runtime correctness (E-EV line 38).

**Knowledge update and handoff decision (derived working recommendation).** Identify which accepted understanding surfaces depend on the changed premise: flow, impact, state interpretation or evidence boundary, and the corresponding ownership instructions. Compare meaning/conditions/authority/gaps as well as provenance. A receipt-only change with unchanged validated meaning and still-compatible source/contract bindings needs refreshed provenance/version bindings and an auditable handoff, not a new claim that the behavior changed. If meaning, authority or a required premise changes, flag the affected surfaces for revision and independent revalidation, hold their dependent decisions until compatible support exists, and hand off the exact changed premise, proposed knowledge update, deciding evidence and unresolved validation. Reuse independent unchanged valid understanding; navigation alone does not require a rebuild. Record which path was chosen in the completion receipt. This prescribes contributor work; no automatic rebuild, publication or runtime reader is claimed (E-IM lines 9, 30, 38-43; E-EV lines 38-40; shared GO-I2..5).

## Boundaries and escalation
Escalate as BLOCKED, with exact missing premise, for any stronger claim requiring drain/`start`/`stop`/`makeEntry` bodies, `run(db,event)` internals, `execution.wake` routing implementation, atomicity/sequence-allocation proof, transaction/runtime receipts, or interruption/recovery evidence not supplied here (E-FL line 20; E-ST lines 38-46; E-EV lines 32-32). Do not claim provider-level exactly-once, crash-safety/cross-process serialization, post-crash recovery, hosted/distributed execution, queue fairness, provider completion/usage, or automatic crash replay (E-FL line 17; E-ST lines 38-40). Do not upgrade intended atomic visibility, intended allowance reset, or interruption contract intent (process-local cleanup/idle behavior, preserving inbox rows, clearing coalesced wake) into runtime-proven effects (E-ST lines 23-23; E-ST line 38; E-EV lines 22-24). Distinguish evidence insufficiency, source drift, and semantic conflict; old acceptance cannot make drifted knowledge current (E-EV line 38). Escalate to the owner/coordinator when the missing premise is a new governance mechanism, new policy, or expanded scope — no autonomous discovery loop follows from this boundary (E-EV line 40).

## Coverage and gaps
| ID | Supported / Blocked | Section and precise missing premise |
|---|---|---|
| MA-1 | Supported | Working purpose; Working protocol steps 1-2, 5-6 — entry trigger, ordered workflow, source inspection allowed; no missing premise within default-runner scope |
| MA-2 | Supported | Working protocol step 3 — `equivalent` vs `matchesProjection`, fresh/exact-retry/historical provenances; no missing premise |
| MA-3 | Supported | Working protocol step 4 — cutoff/queue/allowance/transform and wake/run/keying/placement checks, conditional flow preserved; no missing premise |
| MA-4 | Supported | Consultation and verification — categories paired with supplied assertion reach; actual command/test invocation must be consulted from approved instructions, precise boundary stated not invented |
| MA-5 | Supported | Working protocol steps 1, 6; Consultation and verification — reuse unchanged valid understanding, navigation vs build inputs, receipt vs meaning; no automatic rebuild/publication engine claimed |
| MA-6 | Supported | Working protocol; Consultation and verification; Coverage and gaps — stop conditions, bounded example, completion receipt below; stronger runtime claims require the precise missing premises listed in Boundaries and escalation |

**Completion receipt (required to close work):** `MA-Receipt: boundary=<touched boundary>; classification=<behavior-preserving | intentional contract change>; decided predicate/carrier=<exact change>; verification=<supplied assertions re-run under approved instructions, or BLOCKED: <exact missing premise>>; reused understanding=<unchanged validated items>; handoff=<owner/coordinator, updated knowledge surface or none needed>`. Work is complete only when this receipt is issued with all six criteria supported, or with a precise BLOCKED gap per unsupported criterion. This artifact is a candidate synthesis; it does not self-publish, self-certify runtime behavior, or claim global acceptance criteria.

<!-- REVIEW_INDEX_BEGIN -->
```json
[
  {
    "criterion": "MA-1",
    "sections": [
      "## Working purpose",
      "## Working protocol"
    ],
    "evidence": [
      {
        "input": "E-FL",
        "from": 8,
        "to": 14
      },
      {
        "input": "E-IM",
        "from": 8,
        "to": 18
      }
    ],
    "gaps": []
  },
  {
    "criterion": "MA-2",
    "sections": [
      "## Working protocol"
    ],
    "evidence": [
      {
        "input": "E-FL",
        "from": 11,
        "to": 12
      },
      {
        "input": "E-IM",
        "from": 12,
        "to": 14
      },
      {
        "input": "E-IM",
        "from": 21,
        "to": 25
      }
    ],
    "gaps": []
  },
  {
    "criterion": "MA-3",
    "sections": [
      "## Working protocol"
    ],
    "evidence": [
      {
        "input": "E-FL",
        "from": 13,
        "to": 14
      },
      {
        "input": "E-IM",
        "from": 16,
        "to": 18
      },
      {
        "input": "E-EV",
        "from": 24,
        "to": 24
      },
      {
        "input": "E-IM",
        "from": 27,
        "to": 29
      }
    ],
    "gaps": []
  },
  {
    "criterion": "MA-4",
    "sections": [
      "## Consultation and verification"
    ],
    "evidence": [
      {
        "input": "E-FL",
        "from": 20,
        "to": 20
      },
      {
        "input": "E-IM",
        "from": 32,
        "to": 33
      },
      {
        "input": "E-EV",
        "from": 36,
        "to": 38
      }
    ],
    "gaps": []
  },
  {
    "criterion": "MA-5",
    "sections": [
      "## Working protocol",
      "## Consultation and verification"
    ],
    "evidence": [
      {
        "input": "E-IM",
        "from": 30,
        "to": 33
      },
      {
        "input": "E-EV",
        "from": 38,
        "to": 40
      },
      {
        "input": "E-ST",
        "from": 44,
        "to": 46
      }
    ],
    "gaps": []
  },
  {
    "criterion": "MA-6",
    "sections": [
      "## Working protocol",
      "## Consultation and verification",
      "## Boundaries and escalation",
      "## Coverage and gaps"
    ],
    "evidence": [
      {
        "input": "E-ST",
        "from": 38,
        "to": 46
      },
      {
        "input": "E-EV",
        "from": 32,
        "to": 40
      },
      {
        "input": "E-FL",
        "from": 17,
        "to": 20
      }
    ],
    "gaps": []
  }
]
```
<!-- REVIEW_INDEX_END -->