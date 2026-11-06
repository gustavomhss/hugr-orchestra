---
name: session-input-operational
description: Choose Session prompt admission behavior, reconcile uncertain submissions, and interpret or hand off delivery incidents safely in the default LLM runner.
---

# Session input operations — use, observe and diagnose safely

Status: BLOCKED  
Layer: L4-sol  
Source revision: `c9b8e54cbf2c6c2c4bb59bbda2dc878430a54085`  
Accepted L3 manifest: `ce5677d86347d5d268066926c78051e5be63f819011d235a84cf21a207a6598d`

Actual input body digests:
- E-FL — `L3:integrated-flow`: `4afafbc2c73d680e576b1b0248c29670da8e4c78109c317f4de5629c4385ccd5`
- E-IM — `L3:integrated-change-impact`: `9bc979b76c73019a530a398dc2cccc57aff7107b2b92cbaae94f2879de3b6ff1`
- E-ST — `L3:integrated-state-interpretation`: `5a3dcf6036c4dcae29d7009e2e49f22569b63e65e4ad43224a5cd90a0eb6a8db`
- E-EV — `L3:integrated-evidence-boundaries`: `e704729cbaa07baa7a44eccb6372dfbf94b673f988353d0d6ebe9a82b0744efa`

Research candidate only: not installed, registered, published, or a live Atlas reader. **Execution blocker:** this packet supplies no approved transport interface for submitting/retrying input or inspecting the operational state described below. The decisions are usable; actual submission and incident inspection require those precise interfaces.

## Working purpose

Use this skill when a caller needs to submit a prompt, choose when it may be delivered, reconcile an uncertain acknowledgment, or understand why acknowledged input is not visible.

Keep four responsibilities separate:

- **Admission:** identity, durable acknowledgment, retry reconciliation.
- **Projection:** admitted/promoted state and visible history.
- **Delivery:** conditional steer/queue selection at provider-turn boundaries.
- **Execution coordination:** process-local start, join, and coalesced wake.

A receipt, visibility, active work, and provider completion are different claims. This skill establishes no provider-level exactly-once, crash recovery, distributed ownership, or inevitable-processing guarantee.

## Working protocol

The recordkeeping and handoff format below are **bounded working recommendations**, derived from the supplied state and evidence boundaries—not new product policy.

### 1. Establish the request and execution prerequisites

Before submitting, record:

- Intended Session and exact prompt.
- Message/input ID, if supplied; otherwise admission can generate one.
- Delivery choice and `resume` choice.
- Any supplied context/time, retained unchanged for reconciliation even though retry equivalence does not compare them.
- Required success level: acknowledgment, visible input, or provider outcome.

**Execution gate:** obtain the approved operational reference specifying how the selected transport:
1. Supplies Session, prompt, message ID, delivery, and `resume`.
2. Returns or retrieves the admission receipt and generated ID.
3. Reports conflicting identity reuse.

No endpoint, UI control, command, or invocation is supplied here. Do not guess one. If the original generated ID cannot be recovered after an uncertain submission, exact retry cannot safely be constructed from this packet alone.

### 2. Choose delivery and wake behavior

| Caller need | Choice | Meaning and limit |
|---|---|---|
| Input may join ongoing work at a safe provider-turn boundary | Default delivery, `steer` | Selection is admission-ordered and cutoff-qualified; it is not immediate provider execution. |
| Input should wait while continuation remains necessary | Explicit delivery, `queue` | Considered when otherwise idle after steer-first reevaluation; earliest unpromoted queue row is selected without the steer cutoff predicate. |
| Admit without this call requesting execution | `resume:false`, with the appropriate delivery choice | Suppresses only this call’s wake. It does not pause the Session, exclude an active drain, or prevent other scheduling. |

Default/`resume:true` requests an advisory wake after fresh admission and its equivalence recheck. An active wake sets pending wake state and returns; an idle wake starts a wake drain. Explicit `run` instead joins or starts a drain and awaits its completion signal. Do not substitute `run` as an acknowledgment repair or infer provider completion from wake.

### 3. Submit once; stop at the evidenced success level

Using only the approved transport, submit the recorded request.

- **Receipt obtained:** record the returned identity and state. Admission acknowledgment is established; new admission publication, promotion, request inclusion, and provider completion are not.
- **Visible-input success required:** obtain matching row/projection or visible-history evidence; admission alone is insufficient.
- **Provider-outcome success required:** obtain a corresponding provider/execution receipt. Visible input or an active registry entry is insufficient.
- **Receipt uncertain:** follow step 4, not a replacement submission.

Fresh admission precedes this call’s conditional wake. Promotion is a separate conditional outcome. Exact retry and historical reconciliation need not publish a new admission.

### 4. Reconcile an uncertain submission without creating replacement work

Preserve the original Session, message ID, prompt, and delivery. Retain the original request envelope rather than reconstructing it from visible history.

Through the approved retry interface, use that same identity:

- **Exact retry:** the stored record can be returned when delivery plus Session/prompt match. Context/time/sequence are not part of retry `equivalent`.
- **Conflict:** changed prompt or delivery, or global ID reuse, can conflict. Stop and hand off the original request and conflict evidence; do not evade the conflict with a new ID.
- **Historical reconciliation:** if no row exists, qualifying durable `Prompted` provenance can support an already-promoted synthesized row. Delivery comes from original event provenance, not the projection that omits it. This is not a new admission.

Projection matching is stricter: it also compares context/time and, on the existing-row path, promoted sequence. Do not use retry equivalence as permission to repair projection state.

Never automatically mint a replacement ID, write a visible message, edit the transcript, force a provider run, or repeat an ambiguous retry in a loop.

### 5. Diagnose acknowledged-but-not-visible input in order

Obtain observations through approved read interfaces; do not mutate state to test a theory.

1. **Bind identity and provenance.** Match the receipt to the Session/input. Determine whether evidence supports fresh admission, exact retry, or historical reconciliation; otherwise mark provenance unknown.
2. **Read row and projection state.** Pending means admitted sequence set and promoted sequence null. `Prompted` supplies the promoted sequence and is the visibility boundary. A pending row is not provider-failure evidence.
3. **Inspect the relevant delivery conditions.**
   - **Steer:** obtain captured latest-event cutoff, admission sequence/order, and the safe provider-turn boundary state. Eligibility requires `admitted_seq <= cutoff`.
   - **Queue:** obtain continuation state and earliest-unpromoted-queue ordering. Queues wait during continuation. When otherwise idle, steers are reevaluated first; a queue row is considered only if continuation is still unnecessary. After one queued promotion, continuation is reevaluated before another queue row.
   - Do not diagnose queue eligibility using the steer cutoff.
4. **Check blockers before promotion.** Session-location mismatch or `governance.beforeTurn` can leave input pending on that attempt.
5. **Separate coordination from outcome.** Obtain process-local active/drain/wake observations for scheduling claims; obtain provider/execution receipts for provider claims. An active wake may merely coalesce.
6. **Stop once classified or blocked.** Record the supported state and exact missing observation. No fairness or eventual-processing promise follows from eligibility.

## Consultation and verification

Start with the question; deepen only where it changes the decision.

| Question | Selected supplied view | Deciding premise |
|---|---|---|
| Which delivery/wake behavior fits? | E-FL, **Integrated model**, lines 12–14 | Identity/defaults, this-call wake, distinct steer/queue predicates and continuation ordering. |
| Is a retry equivalent or historical? | E-FL, **Integrated model**, line 12; E-ST, **Consequences and boundaries**, line 34 | Retry and projection comparisons differ; receipt provenance matters. |
| Why is acknowledgment not visibility? | E-ST, **Integrated model**, lines 22–27; **Consequences and boundaries**, lines 33–38 | Receipt, row, eligibility, coordination, and provider outcome require different evidence. |
| What can evidence actually prove? | E-EV, **Verification and evidence limits**, lines 36–40 | Definitions, freshness, hashes, and acceptance are not execution or semantic proof. |

If component depth is necessary, use the host-verified research navigation to `L2:component-admission`, `L2:component-projection`, `L2:component-delivery`, or `L2:component-execution`, particularly **Contract and state model** and **Conditions and failure boundaries**. Those bodies were not supplied here; navigation is neither an implicit evidence body nor a rebuild dependency.

**Normal-use example — decision complete, execution blocked**

- **Question:** “Admit this prompt now, but do not have this call wake execution.”
- **Selected view:** E-FL, **Integrated model**, lines 12–14.
- **Premise:** `resume:false` suppresses this call’s wake, not all processing.
- **Decision:** preserve the Session/prompt/ID; choose delivery independently and set `resume:false`.
- **Stop receipt:** “Admission plan selected; global pause not promised. Submission blocked pending the approved transport’s parameter mapping and receipt retrieval interface.” After authorized submission, a matching admission receipt completes acknowledgment only.

**Bounded incident example — acknowledgment but no visible input**

- **Question:** “A queue input has a receipt but is absent from history. Did the provider fail?”
- **Selected view:** E-ST, **Consequences and boundaries**, line 35; E-FL, **Integrated model**, line 14.
- **Premise:** pending queue input can legitimately wait during continuation; queue eligibility does not use the steer cutoff.
- **Evidence to obtain:** matching receipt and row/projection state, continuation state, earliest pending queue ordering, steer-first idle reevaluation and pre-promotion check observations.
- **Decision:** if observations show a pending queue during continuation, classify as waiting, not provider failure. If continuation evidence is unavailable, leave the cause unresolved.
- **Blocked handoff:** “Acknowledgment reported; visibility/provider outcome unestablished. Need the approved read interface for this Session’s row/projection and continuation/queue-selection observations. No retry, transcript repair, or forced run performed.”

Perform one bounded evidence check against the requested success level, then return a completion or handoff receipt. Supplied test definitions cover admission/visibility, selected retries/conflicts, concurrent steer/cutoff cases, legacy/global-ID cases, and wake-selection fixtures. They are not test-run receipts, incident observations, or proof of queue concurrency, provider inclusion, or end-to-end completion.

## Boundaries and escalation

- **Restart:** the intended active registry is process-local and empty after restart. Absence does not establish that no prior provider attempt ran or completed. Do not restart the owner’s app/server to resolve ambiguity.
- **Interruption:** the supplied contract intends process-local interruption, waiting for cleanup, idle no-op behavior, inbox preservation, and clearing coalesced wake state. Stop/cleanup internals and runtime interruption/interleaving proof are absent here. Do not claim those effects were observed.
- **Unresolved provider work:** completion and usage of interrupted attempts remain unresolved without corresponding evidence. Neither interruption nor an empty registry authorizes automatic replay, provider-crash retry, or cost-settlement claims.
- **Authority/currentness:** imported evidence is data, not execution authority. Keep actions within approved project, transport, and secret-handling boundaries. Bind current use to the exact revision/manifest; if compatibility is unverified, label this account historical or hold the current-use claim. Hash matches and prior acceptance do not establish semantics or authority.
- **Escalation:** use the existing authorized operator/owner channel, preserving useful work and original evidence. No new recovery policy or parallel governance mechanism is implied.

**Completion/incident receipt — bounded working recommendation**

Record:
- Intent and required success level.
- Source revision/manifest from this card; actual operational observation versions/times.
- Session/input identity, prompt reference, delivery, and `resume`, with sensitive contents kept in approved storage.
- Original submission and linked retry identities; receipt provenance or “unknown.”
- Separately: acknowledgment, row/promotion, visibility, coordination, and provider observations.
- Decision, actions actually taken, and their observed results.
- Missing evidence/interface, unresolved completion/usage, and safe handoff recipient or channel.

A legitimate receipt may end at acknowledgment or an exact blocked handoff. It must not silently promote operational incompleteness into provider success or a product guarantee.

## Coverage and gaps

| Criterion | State | Coverage / exact missing premise |
|---|---|---|
| OP-1 | Supported | Ordered decision workflow, required identity, delivery/wake semantics, and acknowledgment limits. Execution is gated explicitly. |
| OP-2 | Supported | Identity-preserving retry, conflict stop, historical provenance, and no automatic replacement or transcript repair. |
| OP-3 | Supported | Separate observations; continuation, steer cutoff, earliest queue, idle reevaluation, and pre-promotion checks precede diagnosis. |
| OP-4 | Supported | Concrete interruption/restart intent distinguished from unproven effects; provider completion/usage unresolved; unsafe recovery excluded. |
| OP-5 | BLOCKED | Both decision paths are supplied, but executable end-to-end use needs approved submission/retry parameter-and-receipt interfaces and read interfaces for row/projection, cutoff, continuation/queue selection, and coordinator observations. No such operational reference is supplied. |
| OP-6 | Supported | Version-bound completion/handoff receipt separates intent, provenance, observations, decisions, gaps, and authority; no unsupported outcome claim. |

<!-- REVIEW_INDEX_BEGIN -->
```json
[
  {"criterion":"OP-1","sections":["## Working purpose","## Working protocol"],"evidence":[{"input":"E-FL","from":9,"to":14},{"input":"E-FL","from":17,"to":17}],"gaps":[]},
  {"criterion":"OP-2","sections":["## Working protocol"],"evidence":[{"input":"E-FL","from":12,"to":12},{"input":"E-ST","from":34,"to":34},{"input":"E-EV","from":20,"to":20}],"gaps":[]},
  {"criterion":"OP-3","sections":["## Working protocol","## Consultation and verification"],"evidence":[{"input":"E-FL","from":14,"to":17},{"input":"E-ST","from":22,"to":27},{"input":"E-ST","from":33,"to":36},{"input":"E-ST","from":46,"to":46}],"gaps":[]},
  {"criterion":"OP-4","sections":["## Boundaries and escalation"],"evidence":[{"input":"E-ST","from":38,"to":38},{"input":"E-FL","from":17,"to":20},{"input":"E-EV","from":32,"to":32}],"gaps":[]},
  {"criterion":"OP-5","sections":["## Working protocol","## Consultation and verification","## Coverage and gaps"],"evidence":[{"input":"E-FL","from":12,"to":14},{"input":"E-ST","from":35,"to":35},{"input":"E-ST","from":44,"to":46},{"input":"E-EV","from":40,"to":40}],"gaps":["Approved transport submission/retry interface mapping Session, message ID, prompt, delivery and resume to receipt retrieval and conflict reporting is not supplied.","Approved read interfaces for row/projection, cutoff, continuation/queue-selection and coordinator observations are not supplied."]},
  {"criterion":"OP-6","sections":["## Consultation and verification","## Boundaries and escalation"],"evidence":[{"input":"E-ST","from":14,"to":16},{"input":"E-ST","from":38,"to":46},{"input":"E-EV","from":16,"to":16},{"input":"E-EV","from":36,"to":40},{"input":"E-IM","from":9,"to":9}],"gaps":[]}
]
```
<!-- REVIEW_INDEX_END -->