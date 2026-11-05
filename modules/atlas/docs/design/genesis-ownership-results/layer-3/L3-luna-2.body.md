# Session input integration — authority and verification boundaries
Status: CANDIDATE
Layer: L3
Source revision: c9b8e54cbf2c6c2c4bb59bbda2dc878430a54085
Accepted L2 manifest ID: d6ab29da4eccd7283a4d4a40ece0a719b7f932bc64098d4a065e19b5914a4cce
Actual input handles/digests:
- E-AD: L2:component-admission @ 507e1ad22fe006092e61760e024dc0328d979ae243c1ab711cb114802523de05
- E-PJ: L2:component-projection @ 83a90d3d9ddaa5f7fb3ab7efe22cd459d40cda86bd3daf2c51411390375c4b53
- E-DL: L2:component-delivery @ 97490e1dedd698a7578fcaa08328f84a1b2786ac58e86c92fb8796d5530e7db5
- E-EC: L2:component-execution @ c1b5e2933ddbe4e55945df84c81cc506c7b1ba7f9f2f27eac872d318f427cbe0

## Integrated responsibility

The integrated boundary connects durable input identity and admission to row projection, eligibility for delivery, and process-local execution coordination. These stages are related but not interchangeable: an admission receipt identifies stored or reconciled input; projection carries admitted and promoted state; delivery rules decide when pending input may be promoted; coordination requests or joins work. None alone proves provider completion or universal visibility.

The supported claim is bounded to the default LLM runner and supplied owner constraints. Intent, observed implementation, and interpretation remain distinct. In particular, intended atomic visibility is not upgraded into runtime proof, and process-local wake behavior is not a distributed or crash-recovery guarantee. E-AD lines 12–17, 32–36; E-PJ lines 9–10, 18–29; E-DL lines 12–22; E-EC lines 10–20. The corresponding lower evidence is L2:component-admission#Purpose and responsibility @ 507e1ad22fe006092e61760e024dc0328d979ae243c1ab711cb114802523de05; L2:component-projection#Purpose and responsibility @ 83a90d3d9ddaa5f7fb3ab7efe22cd459d40cda86bd3daf2c51411390375c4b53; L2:component-delivery#Purpose and responsibility @ 97490e1dedd698a7578fcaa08328f84a1b2786ac58e86c92fb8796d5530e7db5; L2:component-execution#Purpose and responsibility @ c1b5e2933ddbe4e55945df84c81cc506c7b1ba7f9f2f27eac872d318f427cbe0.

## Integrated model

**Observed admission and identity.** The facade normalizes identity and delivery (default `steer`), admits or reconciles the record, and requests a wake unless `resume: false`. Exact retry returns the original record when the implemented identity predicate matches session, prompt, and delivery; conflicting reuse fails. Historical reconciliation is a distinct path: it can recover an already-promoted row from durable `Prompted` provenance. Thus a receipt need not mean a new `PromptAdmitted` event. Retry equivalence is narrower than projection matching: projection additionally checks context and time, and its existing-row fallback checks promoted sequence. E-AD lines 20–30, 36–43; E-PJ lines 31–40.

**Projection and delivery.** `PromptAdmitted` supplies the admitted sequence carrier; `Prompted` supplies the promoted sequence carrier and is the visibility boundary. The specification’s same-transaction visibility rule is intended behavior; the supplied projector call sites do not establish transaction timing or atomicity at runtime. If an admitted row remains pending, it is not thereby visible history. For delivery, observed steer selection is cutoff-qualified (`admitted_seq <= cutoff`) and ordered by admission sequence; queue selection chooses the earliest unpromoted queue row without the supplied steer-cutoff predicate. The runner’s conditional flow handles continuation and idle queue selection, but does not establish queue fairness or unexecuted interleavings. E-PJ lines 18–29, 40–42; E-DL lines 18–22, 30.

**Coordination and provider-turn consequences.** A wake coalesces when an entry is active or starts a wake drain when idle; neither branch is a provider-completion receipt. `resume: false` suppresses this call’s wake, not all scheduling or eligibility. Explicit `run` and advisory `wake` are distinct, and supplied coordinator branches do not establish drain eligibility or pending-wake consumption. If input is promoted, the owner intent says the selected provider-turn allowance resets; observed code resets `currentStep` to 1 only when at least one row was promoted. These are respectively intended policy and observed counter behavior, not interchangeable proof. On the default provider-model path, last-step prompt insertion precedes transformation; that ordering does not prove a particular input survives transformation or reaches a request. E-AD lines 34, 43; E-EC lines 14–20, 24–28; E-DL lines 26–30.

These distinctions matter for maintenance: changing identity or projection predicates can alter retry/conflict and reconciliation outcomes; changing selectors or cutoff capture can alter which inputs are eligible; changing wake/drain behavior can alter when work is requested; changing allowance or prompt transformation order can alter the provider-turn path. A possible consequence is not, by itself, a demonstrated defect. E-AD lines 36–52; E-PJ lines 44–49; E-DL lines 32–38; E-EC lines 30–36.

## Consequences and boundaries

The intended sequence is admission → eligibility → promotion → visible history → provider-turn processing. It is a conditional model, not a guarantee that each transition completes. A receipt may represent fresh admission, exact retry, or historical synthesis; only the fresh path necessarily publishes a new admission event. Promotion is distinct from admission, and visibility is distinct from provider success. E-AD lines 24–30, 38–43; E-PJ lines 19–27; E-DL lines 18–30.

The integrated boundary does not establish atomic visibility at runtime, sequence-allocation or transaction guarantees, concurrent projection outcomes, coordinator serialization beyond process-local observations, provider success, crash recovery, distributed ownership, or provider-level exactly-once behavior. Product rationale and concrete backlog/limit values are also not supplied. These are unknown or excluded, not inferred from schema, interface comments, method names, or adjacent calls. E-PJ lines 12–14, 21, 40–42, 45, 51; E-EC lines 20, 24–28, 38–45; E-AD lines 44, 52, 55.

## Verification and evidence limits

Supplied tests are definitions, not execution receipts. Their bounded assertions cover admission before transcript visibility; exact retry and specified conflicts; selected concurrent exact-retry and steer-promotion/cutoff cases; legacy projection and global-ID cases; and fixture-level wake selection for default/`resume: true` versus `resume: false`. They do not prove tests ran, coordinator interleavings, queue concurrency, atomicity, provider-request inclusion, or end-to-end completion. A hypothetical predicate change is not evidence that a named test fails unless that test’s supplied assertion actually covers the changed case. E-AD lines 47–52; E-PJ lines 47–51; E-DL lines 34–38; E-EC lines 34–36.

Source freshness, matching hashes, a successful model response, and component acceptance establish neither semantic correctness of the integrated behavior nor runtime conformance. Artifact linkage and preservation of prior receipts support provenance, not semantic acceptance; non-execution is not a failed test. Future verification should be selected for the changed boundary and the assertion it can decide, without treating unrelated passing evidence as proof. E-DL lines 36–38; E-EC lines 34–36; E-PJ lines 47–51.

The epistemic stop is the exact missing premise: when a required claim depends on an absent implementation body, transaction/runtime receipt, or test assertion, retain it as unknown and do not strengthen the claim. Existing lower references and their stated scope remain usable; absence in one component’s evidence is not global absence when another accepted component supplies it. No source hunt, new policy, or autonomous discovery loop follows from this boundary. E-AD lines 55–56; E-PJ lines 49–51; E-EC lines 35–36.

## Coverage and gaps

| Criterion | State | Section and precise missing premise |
|---|---|---|
| EB-1 | Supported | Integrated responsibility; Integrated model. Intent, observation, and derived boundary are composed across admission, projection, delivery, and coordination. Product rationale remains unsupplied and is not needed for this bounded claim. |
| EB-2 | Supported | Integrated model; Consequences and boundaries. Intended atomic visibility is distinguished from observed call sites; allowance intent from counter observation; process-local coordination from distributed semantics. Runtime atomicity, distributed ownership, and crash recovery remain unproven. |
| EB-3 | Supported | Verification and evidence limits. Actual supplied assertions and their reach are stated; test execution receipts and unasserted queue/provider/coordinator outcomes are absent. |
| EB-4 | Supported | Verification and evidence limits. Freshness, successful response, hashes, and component acceptance are not treated as integrated semantic or runtime proof. No stronger premise is supplied or claimed. |
| EB-5 | Supported | Verification and evidence limits. Missing implementation, transaction/runtime, or assertion evidence is the precise stop; no discovery loop or new governance mechanism is introduced. |
| EB-6 | Supported | Integrated responsibility; Integrated model; Consequences and boundaries. All four component boundaries and inherited unknowns are connected. Stronger claims require the specific missing implementation bodies or runtime receipts named above. |

<!-- REVIEW_INDEX_BEGIN -->
```json
[
  {"criterion":"EB-1","sections":["Integrated responsibility","Integrated model"],"evidence":[{"input":"E-AD","from":12,"to":17},{"input":"E-PJ","from":9,"to":10},{"input":"E-DL","from":12,"to":22},{"input":"E-EC","from":10,"to":20}],"gaps":[]},
  {"criterion":"EB-2","sections":["Integrated model","Consequences and boundaries"],"evidence":[{"input":"E-PJ","from":18,"to":29},{"input":"E-DL","from":18,"to":30},{"input":"E-EC","from":14,"to":28},{"input":"E-AD","from":34,"to":43}],"gaps":[]},
  {"criterion":"EB-3","sections":["Verification and evidence limits"],"evidence":[{"input":"E-AD","from":47,"to":52},{"input":"E-PJ","from":47,"to":51},{"input":"E-DL","from":34,"to":38},{"input":"E-EC","from":34,"to":36}],"gaps":[]},
  {"criterion":"EB-4","sections":["Verification and evidence limits"],"evidence":[{"input":"E-DL","from":36,"to":38},{"input":"E-EC","from":34,"to":36},{"input":"E-PJ","from":47,"to":51}],"gaps":[]},
  {"criterion":"EB-5","sections":["Verification and evidence limits"],"evidence":[{"input":"E-AD","from":55,"to":56},{"input":"E-PJ","from":49,"to":51},{"input":"E-EC","from":35,"to":36}],"gaps":[]},
  {"criterion":"EB-6","sections":["Integrated responsibility","Integrated model","Consequences and boundaries"],"evidence":[{"input":"E-AD","from":32,"to":43},{"input":"E-PJ","from":21,"to":42},{"input":"E-DL","from":18,"to":30},{"input":"E-EC","from":20,"to":28}],"gaps":[]}
]
```
<!-- REVIEW_INDEX_END -->