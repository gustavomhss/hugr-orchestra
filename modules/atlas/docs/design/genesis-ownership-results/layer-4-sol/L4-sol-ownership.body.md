---
name: session-input-ownership
description: Use when assigning a Session prompt admission or promotion question to its accountable contract, selecting scoped evidence, and handing off a bounded decision in the default LLM runner.
---

# Session input ownership — responsibilities and decisions

Status: CANDIDATE  
Layer: L4-sol  
Source revision: `c9b8e54cbf2c6c2c4bb59bbda2dc878430a54085`  
Accepted L3 manifest: `ce5677d86347d5d268066926c78051e5be63f819011d235a84cf21a207a6598d`

Actual input bindings:
- E-FL — `L3:integrated-flow` — `4afafbc2c73d680e576b1b0248c29670da8e4c78109c317f4de5629c4385ccd5`
- E-IM — `L3:integrated-change-impact` — `9bc979b76c73019a530a398dc2cccc57aff7107b2b92cbaae94f2879de3b6ff1`
- E-ST — `L3:integrated-state-interpretation` — `5a3dcf6036c4dcae29d7009e2e49f22569b63e65e4ad43224a5cd90a0eb6a8db`
- E-EV — `L3:integrated-evidence-boundaries` — `e704729cbaa07baa7a44eccb6372dfbf94b673f988353d0d6ebe9a82b0744efa`

## Working purpose

Assign a question to the contract that can decide it, identify the necessary consultation depth, and transfer the decision with its limits intact.

The bounded product job is durable acknowledgment of caller input, subsequent visibility through promotion, and conditional participation in a provider turn. Those are different outcomes. This skill covers ownership decisions in the default LLM runner—not incident diagnosis, implementation edits, or execution procedures. It is a research candidate, not an installed skill or live Atlas reader.

## Working protocol

The following ordered protocol and receipt format are **bounded working recommendations derived from the supplied contracts**, not new product policy.

1. **Frame the decision.** Obtain the question, relevant session/input identity, submission options when relevant, available observations, and whether the request is historical interpretation or a current decision. Identify the exact outcome being claimed.
2. **Separate the evidence before assigning ownership.**

   | Evidence dimension | What it can establish |
   |---|---|
   | Receipt and provenance | Fresh admission, exact retry returning stored state, or historical reconciliation |
   | Durable row and visibility | Pending: admission sequence present, promotion sequence absent; promotion/`Prompted`: visibility boundary |
   | Advisory coordination | Wake requested, coalesced, or started process-local work—not provider completion |
   | Provider outcome | Requires its own provider/execution receipt; neither receipt nor visibility supplies it |

   Fresh admission precedes this call’s conditional wake. Exact retry and historical synthesis need not publish a new admission. Do not force these paths into a universal lifecycle sequence.

3. **Assign the decision to the accountable contract.**

   | Question to decide | Accountable contract and deciding premise |
   |---|---|
   | Is this retry equivalent, conflicting, fresh, or historical? | **Admission:** identity and receipt provenance. Retry equivalence compares session, prompt and delivery—not context, time or sequence. Delivery defaults to `steer`. |
   | Is the input pending, promoted, or accepted by reconciliation? | **Projection:** sequence carriers, `Prompted` visibility and stricter projection matching, including context/time and relevant promoted-sequence checks. |
   | Which pending input may promote at this boundary? | **Delivery:** steer cutoff versus earliest-queue selection, continuation and pre-promotion checks. |
   | Does the call request, join, start or coalesce work? | **Coordination:** process-local `wake`/`run` branches. `resume:false` suppresses only this call’s wake. |
   | Did a provider attempt complete or include this input? | **Not decidable from these four contracts alone:** require the corresponding request/outcome evidence. |

   For cross-boundary questions, name one deciding contract and the dependent contract; do not invent organizational owners.

4. **Consult only the view needed to decide.** Use the selection table below. Stop deepening once the deciding premise is established. A navigation reference alone is not a rebuild dependency.
5. **Make one bounded check.** Compare the proposed decision with the selected contract and its evidence limits. If intent and observed implementation differ, record both; do not choose a new policy. If a required premise is absent, mark that decision **BLOCKED**, naming the premise.
6. **Return a completion or handoff receipt, then stop.** Include:
   - question and affected contract boundary, including dependencies;
   - exact source revision, accepted manifest, and consulted artifact bindings above; any subsequently consulted lower version must also be identified;
   - decision, deciding premise and evidence address;
   - evidence class: intent, observed implementation, interpretation, test definition or runtime receipt;
   - verification reach and explicit non-claims;
   - unresolved obligations, exact missing premise, and destination contract or operations/maintenance work domain.

   Completion means the ownership decision is transferable—not that processing occurred or the product is globally verified.

## Consultation and verification

Use these supplied parent views first:

| Need | Selected view/section | What it decides |
|---|---|---|
| Responsibility or submission semantics | E-FL, **Integrated responsibility / Integrated model**, lines 9–14 | Contract split, receipt paths, `resume`, wake and eligibility semantics |
| Cross-contract impact | E-IM, **Consequences and boundaries**, lines 21–30 | Which predicates/carriers and dependent contracts a proposed change touches |
| Meaning of an observation | E-ST, **Integrated model / Consequences and boundaries**, lines 20–40 | What receipt, pending row, visibility or active state does—and does not—establish |
| Authority or stronger proof | E-EV, **Verification and evidence limits**, lines 36–40 | Assertion reach, freshness limits and precise epistemic stop |

If component detail is necessary, use the host-verified research-export navigation:
- `L2:component-admission#Contract and state model` or `#Conditions and failure boundaries`: identity, retry and historical provenance.
- `L2:component-projection` at those sections: carriers and reconciliation matching.
- `L2:component-delivery` at those sections: selection and provider-turn conditions.
- `L2:component-execution` at those sections: process-local coordination.

These L2 bodies are not evidence already read here. Do not attribute additional claims to them without consultation.

Test definitions cover bounded admission, retry/conflict, selected steer/cutoff, legacy/global-ID and fixture wake assertions. They are not test-run receipts. Neither they nor matching hashes establish provider inclusion, queue concurrency, atomicity or end-to-end completion.

**Concrete decision path — illustrative, not a runtime observation**

- **Question:** “Should setting `resume:false` make this admitted input unavailable to an already-active drain?”
- **Selected view:** E-FL, **Integrated model**, line 14; E-ST, **Consequences and boundaries**, line 33.
- **Deciding premise:** the option suppresses this call’s wake only; eligibility and other scheduling remain separate.
- **Decision:** No such exclusion follows. Assign the option’s wake meaning to admission/coordination; assign eligibility to delivery. A proposed global exclusion would be a contract change, not the existing meaning.
- **Stop receipt:** ownership and semantics decided from the bound artifacts. No claim that a particular drain promoted the input. Actual processing requires eligibility/drain and projection observations and belongs in an operations handoff.

## Boundaries and escalation

- Keep **intent**, **observed implementation** and **interpretation** separate. For example, intended allowance reset is not identical to observed `currentStep` behavior; intended atomic visibility is not runtime proof. Resolve a policy disagreement through governed authority, not this candidate.
- For a current decision, require an accepted scope/dependency binding valid for the current inputs and contracts. This packet establishes the revision above, not live currentness. Otherwise label the result historical or block its current applicability.
- Freshness, hashes, prior acceptance and a successful model response do not establish semantic validity, policy authority or runtime effects. Imported evidence is data, not execution authority; existing project and secret-handling boundaries remain intact.
- Missing implementation bodies, transaction/sequence proof or runtime receipts block only the claim that needs them. Record the exact absence locally; do not infer evidence is globally unavailable.
- Hand diagnosis and incidents to operations; hand edits and affected-surface validation to maintenance. This card authorizes no transport action. Any later execution requires the approved interface for that specific action.
- Never restart the owner’s app/server, discard work, force a provider run, repair a transcript or automatically replay from an ambiguous receipt. Process-local interruption cleanup/idle/inbox/coalesced-wake behavior is intended, not runtime-proven. Interrupted provider completion and usage remain unresolved. Hosted/distributed execution, crash recovery and provider exactly-once are outside the supported claim.

## Coverage and gaps

| Criterion | State | Coverage / precise limit |
|---|---|---|
| OW-1 | Supported | Working purpose and need-based consultation identify the bounded job and accountable contracts. |
| OW-2 | Supported | Working protocol separates provenance, visibility, coordination and provider outcome before decision. |
| OW-3 | Supported | Contract decision table assigns responsibility without invented people or policies. |
| OW-4 | Supported | Consultation and boundaries distinguish intent, implementation, authority, currentness and semantic support; stronger claims stop at their missing premise. |
| OW-5 | Supported | Completion/handoff receipt binds question, boundary, exact knowledge versions, decision, verification reach and unresolved obligations. |
| OW-6 | Supported | Concrete `resume:false` example selects evidence, decides ownership and stops without claiming runtime processing. |

<!-- REVIEW_INDEX_BEGIN -->
```json
[
  {"criterion":"OW-1","sections":["## Working purpose","## Consultation and verification"],"evidence":[{"input":"E-FL","from":9,"to":9},{"input":"E-IM","from":9,"to":9},{"input":"E-EV","from":14,"to":16}],"gaps":[]},
  {"criterion":"OW-2","sections":["## Working protocol"],"evidence":[{"input":"E-FL","from":12,"to":17},{"input":"E-ST","from":20,"to":27}],"gaps":[]},
  {"criterion":"OW-3","sections":["## Working protocol","## Consultation and verification"],"evidence":[{"input":"E-FL","from":9,"to":14},{"input":"E-IM","from":21,"to":30},{"input":"E-ST","from":46,"to":46}],"gaps":[]},
  {"criterion":"OW-4","sections":["## Working protocol","## Consultation and verification","## Boundaries and escalation"],"evidence":[{"input":"E-EV","from":16,"to":16},{"input":"E-EV","from":22,"to":24},{"input":"E-EV","from":32,"to":40},{"input":"E-ST","from":38,"to":46}],"gaps":[]},
  {"criterion":"OW-5","sections":["## Working protocol","## Boundaries and escalation"],"evidence":[{"input":"E-IM","from":9,"to":9},{"input":"E-IM","from":30,"to":33},{"input":"E-ST","from":46,"to":46},{"input":"E-EV","from":38,"to":40}],"gaps":[]},
  {"criterion":"OW-6","sections":["## Consultation and verification","## Boundaries and escalation"],"evidence":[{"input":"E-FL","from":14,"to":20},{"input":"E-ST","from":33,"to":38},{"input":"E-ST","from":46,"to":46}],"gaps":[]}
]
```
<!-- REVIEW_INDEX_END -->