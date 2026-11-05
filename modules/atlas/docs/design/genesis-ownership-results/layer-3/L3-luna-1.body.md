# Session input integration — interpreting observable states
Status: CANDIDATE
Layer: L3
Source revision: c9b8e54cbf2c6c2c4bb59bbda2dc878430a54085
Accepted L2 manifest ID: d6ab29da4eccd7283a4d4a40ece0a719b7f932bc64098d4a065e19b5914a4cce
Actual input handles/digests:
- E-AD — L2:component-admission @ 507e1ad22fe006092e61760e024dc0328d979ae243c1ab711cb114802523de05
- E-PJ — L2:component-projection @ 83a90d3d9ddaa5f7fb3ab7efe22cd459d40cda86bd3daf2c51411390375c4b53
- E-DL — L2:component-delivery @ 97490e1dedd698a7578fcaa08328f84a1b2786ac58e86c92fb8796d5530e7db5
- E-EC — L2:component-execution @ c1b5e2933ddbe4e55945df84c81cc506c7b1ba7f9f2f27eac872d318f427cbe0

## Integrated responsibility

Interpret observable Session-input states without treating a receipt, row, visible history, active-process snapshot, or provider outcome as interchangeable evidence. The integrated question is what each observation establishes—and what additional observation is missing before diagnosing why input is or is not visible or processed.

This account combines admission identity and provenance (E-AD), durable row and projection state (E-PJ), eligibility and provider-turn boundaries (E-DL), and process-local coordination (E-EC). The distinction matters because an acknowledged input may still be pending, while a receipt may also refer to a retry or historical reconciliation rather than a newly published admission. None alone proves provider success or failure. Product rationale and guarantees beyond the supplied default-runner scope are not inferred. [L2:component-admission#Contract and state model @ 507e1ad22fe006092e61760e024dc0328d979ae243c1ab711cb114802523de05 lines 22–36, 38–44; L2:component-projection#Contract and state model @ 83a90d3d9ddaa5f7fb3ab7efe22cd459d40cda86bd3daf2c51411390375c4b53 lines 18–29, 31–42; L2:component-delivery#Contract and state model @ 97490e1dedd698a7578fcaa08328f84a1b2786ac58e86c92fb8796d5530e7db5 lines 16–22; L2:component-execution#Contract and state model @ c1b5e2933ddbe4e55945df84c81cc506c7b1ba7f9f2f27eac872d318f427cbe0 lines 12–20]

## Integrated model

Interpret the evidence as related but distinct state dimensions:

- **Admission receipt:** identifies a stored or reconciled input. Fresh admission publishes `PromptAdmitted`; an exact retry can return the existing record; historical reconciliation can synthesize an already-promoted row from durable `Prompted` provenance. Thus a receipt does not entail a new admission event. [L2:component-admission#Conditions and failure boundaries @ 507e1ad22fe006092e61760e024dc0328d979ae243c1ab711cb114802523de05 lines 38–42; L2:component-projection#Conditions and failure boundaries @ 83a90d3d9ddaa5f7fb3ab7efe22cd459d40cda86bd3daf2c51411390375c4b53 lines 35–40]
- **Inbox and visibility:** an admitted row carries admission state; promotion adds the promoted sequence. `Prompted` is the visibility boundary, whereas admission alone is not model-visible history. The intended atomic visibility contract is not, by itself, runtime proof. [L2:component-projection#Contract and state model @ 83a90d3d9ddaa5f7fb3ab7efe22cd459d40cda86bd3daf2c51411390375c4b53 lines 21–29]
- **Eligibility and turn:** pending steers are selected using the captured cutoff (`admitted_seq <= cutoff`); queue selection takes the earliest unpromoted queue row and does not use that steer cutoff predicate. Promotion depends on drain conditions: steers can join at a safe provider-turn boundary, while queue input waits during continuation and is checked when otherwise idle. This describes selection and conditions, not inevitable processing or fairness. [L2:component-delivery#Contract and state model @ 97490e1dedd698a7578fcaa08328f84a1b2786ac58e86c92fb8796d5530e7db5 lines 18–22]
- **Coordination and provider outcome:** `resume: false` means this call issues no wake; it does not establish global ineligibility or absence of other scheduling. An active wake coalesces as a pending wake; an idle wake starts a wake drain. Explicit `run` joins or starts a drain, unlike advisory wake. Neither branch proves provider completion. [L2:component-admission#Conditions and failure boundaries @ 507e1ad22fe006092e61760e024dc0328d979ae243c1ab711cb114802523de05 lines 34, 42–44; L2:component-execution#Contract and state model @ c1b5e2933ddbe4e55945df84c81cc506c7b1ba7f9f2f27eac872d318f427cbe0 lines 14–20]

Consequently, “receipt observed,” “row pending,” “input visible,” “process active,” and “provider completed” are separate claims. Evidence for one does not establish the others. [L2:component-admission#Conditions and failure boundaries @ 507e1ad22fe006092e61760e024dc0328d979ae243c1ab711cb114802523de05 lines 42–44; L2:component-projection#Contract and state model @ 83a90d3d9ddaa5f7fb3ab7efe22cd459d40cda86bd3daf2c51411390375c4b53 lines 23–29, 42; L2:component-execution#Conditions and failure boundaries @ c1b5e2933ddbe4e55945df84c81cc506c7b1ba7f9f2f27eac872d318f427cbe0 lines 24–28]

## Consequences and boundaries

Interpret common observations conditionally:

- **Admit-only receipt:** if `resume: false`, this call did not issue a wake. That does not show the row is ineligible to an active drain or that no other scheduling can occur. To diagnose scheduling, the missing premise is drain/eligibility state, not an assumption that a new wake is required. [L2:component-admission#Conditions and failure boundaries @ 507e1ad22fe006092e61760e024dc0328d979ae243c1ab711cb114802523de05 lines 42–44; L2:component-execution#Contract and state model @ c1b5e2933ddbe4e55945df84c81cc506c7b1ba7f9f2f27eac872d318f427cbe0 lines 14–20]
- **Exact retry or historical receipt:** if the ID and implemented equivalence predicate match, the existing record can be returned; if no row exists, qualifying durable `Prompted` provenance can support historical reconciliation. These paths do not imply a fresh `PromptAdmitted` event. Retry equivalence and projection matching differ: projection reconciliation also checks context and time, and its existing-row path checks promoted sequence. [L2:component-admission#Contract and state model @ 507e1ad22fe006092e61760e024dc0328d979ae243c1ab711cb114802523de05 lines 24–30, 36; L2:component-projection#Conditions and failure boundaries @ 83a90d3d9ddaa5f7fb3ab7efe22cd459d40cda86bd3daf2c51411390375c4b53 lines 32–40]
- **Acknowledged but not visible:** if the row remains pending, promotion may not yet have occurred. A steer may await a safe boundary and is cutoff-qualified; a queue row may await continuation to end and selection as the earliest queued item. A receipt or pending row does not establish provider failure; diagnosing the cause requires the relevant promotion eligibility, drain, and projection observations. Queue selection must not be diagnosed using the steer cutoff predicate. [L2:component-projection#Contract and state model @ 83a90d3d9ddaa5f7fb3ab7efe22cd459d40cda86bd3daf2c51411390375c4b53 lines 23–29; L2:component-delivery#Contract and state model @ 97490e1dedd698a7578fcaa08328f84a1b2786ac58e86c92fb8796d5530e7db5 lines 18–22]
- **Active or idle wake:** an active wake can coalesce; an idle wake starts a wake drain. Neither establishes which input was promoted or whether a provider request completed. An active snapshot describes process-local registered work, not durable ownership or activity elsewhere. [L2:component-admission#Contract and state model @ 507e1ad22fe006092e61760e024dc0328d979ae243c1ab711cb114802523de05 lines 34, 42; L2:component-execution#Conditions and failure boundaries @ c1b5e2933ddbe4e55945df84c81cc506c7b1ba7f9f2f27eac872d318f427cbe0 lines 24–26]

The supplied delivery account also distinguishes intended allowance reset from observed counter behavior, and records that last-step prompt insertion precedes transformation. Those details do not establish that a particular input survived transformation or appeared in a provider request. [L2:component-delivery#Conditions and failure boundaries @ 97490e1dedd698a7578fcaa08328f84a1b2786ac58e86c92fb8796d5530e7db5 lines 26–30]

## Verification and evidence limits

The supplied test definitions describe bounded assertions for admission visibility, retry/conflict behavior, selected concurrent steer promotion and cutoff exclusion, legacy retries, and fixture-level wake selection. They are definitions, not observations that a specific incident occurred or evidence that tests ran. They do not establish provider-request inclusion, coordinator interleavings, queue fairness, or end-to-end completion. [L2:component-admission#Change impact and verification @ 507e1ad22fe006092e61760e024dc0328d979ae243c1ab711cb114802523de05 lines 47–52; L2:component-delivery#Change impact and verification @ 97490e1dedd698a7578fcaa08328f84a1b2786ac58e86c92fb8796d5530e7db5 lines 34–38; L2:component-execution#Change impact and verification @ c1b5e2933ddbe4e55945df84c81cc506c7b1ba7f9f2f27eac872d318f427cbe0 lines 32–36]

For a stronger diagnosis, the missing observation depends on the claim: admission/event provenance for whether admission was fresh or reconciled; row and projection state for visibility; cutoff, queue ordering, and continuation state for eligibility; coordinator/drain evidence for execution request; and a provider/execution receipt for outcome. The supplied closure explicitly lacks several implementation bodies, transaction/runtime evidence, and execution receipts. That limitation is local to this evidence packet, not a claim that evidence is globally absent. [L2:component-admission#Coverage and gaps @ 507e1ad22fe006092e61760e024dc0328d979ae243c1ab711cb114802523de05 lines 54–55; L2:component-projection#Change impact and verification @ 83a90d3d9ddaa5f7fb3ab7efe22cd459d40cda86bd3daf2c51411390375c4b53 lines 49–51; L2:component-delivery#Conditions and failure boundaries @ 97490e1dedd698a7578fcaa08328f84a1b2786ac58e86c92fb8796d5530e7db5 lines 28–30; L2:component-execution#Conditions and failure boundaries @ c1b5e2933ddbe4e55945df84c81cc506c7b1ba7f9f2f27eac872d318f427cbe0 lines 24–28]

## Coverage and gaps

| Criterion | Supported / blocked | Section and precise missing premise |
|---|---|---|
| SI-1 | Supported | Integrated model — connects receipt, row/promotion, visibility, process-local active state, and provider outcome without treating them as equivalent. No missing premise for this bounded interpretation; runtime outcome requires a provider/execution receipt. |
| SI-2 | Supported | Integrated model; Consequences and boundaries — distinguishes admit-only, exact retry, historical reconciliation, pending steer and queue; no universal new-event, global no-scheduling, or queue-cutoff inference. Specific incident classification would require its admission and eligibility observations. |
| SI-3 | Supported | Integrated model; Consequences and boundaries — distinguishes active/idle wake and run, safe-boundary and continuation conditions; does not infer inevitable processing, fairness, or provider failure. Drain/interleaving evidence is absent for a stronger runtime claim. |
| SI-4 | Supported | Consequences and boundaries; Verification and evidence limits — active state is process-local; restart/interruption does not establish provider completion or automatic replay. A stronger recovery claim requires supplied recovery/runtime evidence, which is absent here. |
| SI-5 | Supported | Verification and evidence limits — maps interpretations to missing admission, row/projection, eligibility, coordinator, and provider observations; test definitions are not incident observations or run receipts. |
| SI-6 | Supported | Integrated responsibility; Integrated model; Verification and evidence limits — traces the state categories and preserves default-runner and evidence boundaries; no incident procedure or unsupported runtime guarantee is supplied. |

<!-- REVIEW_INDEX_BEGIN -->
```json
[
  {"criterion":"SI-1","sections":["## Integrated model"],"evidence":[{"input":"E-AD","from":42,"to":44},{"input":"E-PJ","from":23,"to":29},{"input":"E-EC","from":24,"to":26}],"gaps":[]},
  {"criterion":"SI-2","sections":["## Integrated model","## Consequences and boundaries"],"evidence":[{"input":"E-AD","from":38,"to":42},{"input":"E-PJ","from":35,"to":40},{"input":"E-DL","from":18,"to":22}],"gaps":[]},
  {"criterion":"SI-3","sections":["## Integrated model","## Consequences and boundaries"],"evidence":[{"input":"E-AD","from":34,"to":34},{"input":"E-EC","from":14,"to":20},{"input":"E-DL","from":18,"to":22}],"gaps":[]},
  {"criterion":"SI-4","sections":["## Consequences and boundaries","## Verification and evidence limits"],"evidence":[{"input":"E-EC","from":24,"to":28},{"input":"E-AD","from":42,"to":44}],"gaps":[]},
  {"criterion":"SI-5","sections":["## Verification and evidence limits"],"evidence":[{"input":"E-AD","from":47,"to":52},{"input":"E-DL","from":34,"to":38},{"input":"E-EC","from":32,"to":36},{"input":"E-PJ","from":49,"to":51}],"gaps":[]},
  {"criterion":"SI-6","sections":["## Integrated responsibility","## Integrated model","## Verification and evidence limits"],"evidence":[{"input":"E-AD","from":54,"to":55},{"input":"E-PJ","from":42,"to":42},{"input":"E-DL","from":40,"to":48},{"input":"E-EC","from":38,"to":47}],"gaps":[]}
]
```
<!-- REVIEW_INDEX_END -->