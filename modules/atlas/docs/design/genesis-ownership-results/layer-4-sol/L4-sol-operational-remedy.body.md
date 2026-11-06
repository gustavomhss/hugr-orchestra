---
name: session-input-operational
description: Choose Session prompt admission behavior, retry uncertain submissions safely, and interpret or hand off delivery incidents in the default LLM runner.
---

# Session input operations — use, observe and diagnose safely

Status: CANDIDATE  
Layer: L4-sol  
Source revision: `c9b8e54cbf2c6c2c4bb59bbda2dc878430a54085`  
Accepted L3 manifest: `ce5677d86347d5d268066926c78051e5be63f819011d235a84cf21a207a6598d`  
Supplement acceptance manifest: `111a3fdcd25b1679dafd624b84c8c750c95b666e9aea87e5b0829f348899bf48`

Actual input body bindings:
- E-FL — `L3:integrated-flow`: `4afafbc2c73d680e576b1b0248c29670da8e4c78109c317f4de5629c4385ccd5`
- E-IM — `L3:integrated-change-impact`: `9bc979b76c73019a530a398dc2cccc57aff7107b2b92cbaae94f2879de3b6ff1`
- E-ST — `L3:integrated-state-interpretation`: `5a3dcf6036c4dcae29d7009e2e49f22569b63e65e4ad43224a5cd90a0eb6a8db`
- E-EV — `L3:integrated-evidence-boundaries`: `e704729cbaa07baa7a44eccb6372dfbf94b673f988353d0d6ebe9a82b0744efa`
- E-OA — `L3-supplement:operational-interface`: `88f0c0a3cdde2ffe69ecbf7a36db5dd086647c1cc9f59019879bc705cb6934db`

Research candidate only; not installed, registered, or published. No request, runtime observation, or test execution is claimed. The supplement’s original pre-review status text remains preserved; its subsequent acceptance is bound by the supplied amendment manifest.

## Working purpose

Use this skill to submit a prompt, choose delivery behavior, reconcile an uncertain acknowledgment, or diagnose acknowledged-but-not-visible input without creating replacement work.

Keep separate:

- **Admission:** durable identity, acknowledgment, retry reconciliation.
- **Projection:** admitted/promoted state and visible history.
- **Delivery:** conditional steer/queue selection.
- **Coordination:** process-local start, join, and coalesced wake.
- **Provider outcome:** a separate claim requiring corresponding evidence.

The public submission interface is supplied. Deployment authorization and some deciding internal observations are not. Their absence requires a specific blocked handoff, not an invented interface or recovery action.

## Working protocol

The recordkeeping and bounded-check steps below are **working recommendations derived from the supplied evidence**, not new product policy.

### 1. Establish authority, identity, and the desired stopping point

Use the current project’s authorized **Orchestra** transport, base address, and Session placement—not the external campaign runner. Deployment credentials, base URL, and permission to act are prerequisites; this skill supplies none.

Before submission, retain:

- Target `sessionID`.
- Exact public `prompt`, including any attachments.
- A valid caller-supplied message `id`, if available.
- Delivery and `resume` choices.
- Required success level: acknowledgment, visible input, or provider outcome.

A caller-supplied valid ID makes an uncertain submission easier to reconcile. If admission generates the ID, preserve it from the receipt. If neither the original ID nor a receipt can be recovered, stop: an exact retry cannot be safely constructed merely by guessing or minting an ID.

### 2. Choose delivery and wake behavior

| Need | Choice | Meaning and limit |
|---|---|---|
| Allow input to join ongoing work at a safe provider-turn boundary | Omit `delivery`, or specify `"steer"` | Steers are admission-ordered and cutoff-qualified; this is not immediate provider execution. |
| Wait while continuation remains necessary | `"delivery":"queue"` | Queue selection occurs when otherwise idle after steer-first reevaluation; it selects the earliest unpromoted queue row. |
| Admit without this call requesting a wake | `"resume":false`, with either delivery choice | Suppresses only this call’s wake—not active-drain eligibility or other scheduling. |

Default/`resume:true` requests an advisory wake after fresh admission and its equivalence recheck. Active wake coalesces by setting pending wake state; idle wake starts a wake drain. Explicit `run` joins or starts a drain and awaits `done`, but no public `run` invocation is supplied here. Do not invent one or use a forced run to repair ambiguity.

### 3. Submit once through the known public contract

Use:

`POST /api/session/:sessionID/prompt`

JSON fields:

- Required `prompt`, containing required string `text`.
- Optional `id`, `delivery` (`steer | queue`), and `resume`.
- Optional file/agent attachments only in the approved public prompt-schema shapes. Those detailed shapes are not reproduced here; consult that schema before using attachments.

Do not add internal receipt fields such as `timeCreated` or `promptContext` to the payload.

Successful admission returns `{data: SessionInput.Admitted}`. Preserve the actual receipt, including `id`, `sessionID`, normalized `prompt`, `delivery`, `admittedSeq`, `timeCreated`, and any `promptContext` or `promotedSeq`.

Stop according to the requested success level:

- **Acknowledgment:** a successful matching receipt completes this level only.
- **Visibility:** obtain matching projected-message/history evidence.
- **Provider outcome:** obtain the corresponding provider/execution receipt; admission, visibility, and an active map are insufficient.

Fresh admission precedes this call’s conditional wake. Promotion remains conditional. A receipt can instead represent an exact retry or historical reconciliation and need not publish a new `PromptAdmitted`.

### 4. Reconcile an uncertain submission without replacement work

There is no separate retry verb. Resend through the same prompt endpoint using the original Session, message ID, prompt, and delivery. Preserve the original request envelope and `resume` choice unless an authorized decision explicitly changes wake behavior.

**A retry is not a read-only receipt lookup:** unless admit-only, it can request a wake.

Interpret the result:

- **Exact retry:** returns the stored record when retry `equivalent` matches delivery plus Session/prompt. Context/time/sequence are not part of that predicate.
- **Conflict:** conflicting identity reuse can fail. The handler also maps a prompt-blocking hook to `ConflictError`; inspect the returned detail rather than assuming every conflict means duplicate identity or duplicate provider work.
- **Historical reconciliation:** when no row exists, qualifying durable `Prompted` provenance can support an already-promoted synthesized row. Original event provenance supplies delivery; the projection omits it. No new admission is implied.

Projection matching is stricter than retry equivalence: it adds context/time checks and, on the existing-row path, promoted-sequence equality.

On conflict, missing identity, or another ambiguous result, preserve evidence and hand off. Do not automatically mint a replacement ID, write visible messages, repair the transcript, force a provider run, or repeat retries in a loop.

### 5. Observe before diagnosing

Available public observations:

| Interface | Establishes | Does not establish |
|---|---|---|
| `GET /api/session/:sessionID/message/:messageID` | A projected message owned by that Session, or a declared not-found error | Missing admission, provider failure, or lost work merely from not-found |
| `GET /api/session/:sessionID/history` | A finite page of public durable events and `hasMore` | Complete absence from one page or a moving history |
| `GET /api/session/active` | Foreground drains registered in this Orchestra process, entries of type `running` | Durable inbox, continuation trace, cross-process ownership, or provider outcome |

History accepts optional `limit`—positive integer, at most 100—and `after`—nonnegative exclusive aggregate sequence. Follow the actual aggregate cursor and `hasMore`. Bound the inspection in advance; if its limit is reached, report partial coverage rather than complete absence.

For acknowledged-but-not-visible input, check in order:

1. **Identity/provenance:** match Session/input and receipt. Use available events to distinguish fresh admission, exact retry, or historical synthesis; otherwise retain “unknown.”
2. **Promotion/visibility:** pending means admitted sequence set and promoted sequence null. `Prompted` supplies the promoted sequence and is the visibility boundary. A historical receipt is not automatically a current row snapshot.
3. **Delivery conditions:**
   - **Steer:** requires `admitted_seq <= cutoff`, with cutoff captured from the latest event sequence; examine admission order and the safe provider-turn boundary.
   - **Queue:** examine continuation and earliest pending queue order—not the steer cutoff. Queues wait during continuation. At otherwise-idle reevaluation, steers are checked first; a queue row is considered if continuation is still unnecessary. After one queued promotion, continuation is reevaluated before another queue row.
4. **Pre-promotion checks:** Session-location mismatch or `governance.beforeTurn` can leave a row pending on that attempt.
5. **Coordination/outcome:** separate active/coalesced/idle drain observations from evidence of actual provider completion.

The public interfaces do not expose every current cutoff, queue rank, continuation state, or pre-promotion result. If one is decisive and no approved observation is supplied, stop with that exact missing premise. Do not invent an inbox endpoint or inspect/mutate the database as a shortcut.

## Consultation and verification

Use the smallest view that decides the question:

- **Submission, retry, receipt, public observation:** E-OA, **Submission and exact retry contract**, lines 19–40; **Admission receipt and supported observations**, lines 48–70.
- **Delivery/wake selection:** E-FL, **Integrated model**, lines 12–14.
- **Acknowledged but not visible:** E-ST, **Consequences and boundaries**, lines 33–38.
- **Strength of evidence:** E-EV, **Verification and evidence limits**, lines 36–40.

For necessary component depth, use the verified research navigation to `L2:component-admission`, `L2:component-projection`, `L2:component-delivery`, or `L2:component-execution`, especially **Contract and state model** and **Conditions and failure boundaries**. Their bodies are not implicit evidence already read. Navigation alone creates no rebuild dependency.

### Normal-use example: acknowledgment without this call’s wake

- **Question:** “Store this prompt now without this submission waking execution.”
- **Selected view:** E-OA lines 19–35, 48–52; E-FL line 14.
- **Deciding premise:** the prompt endpoint supports `resume:false`; it suppresses only this call’s wake.
- **Action, after authorization:** send `POST /api/session/:sessionID/prompt` for the intended Session with:
  ```json
  {"prompt":{"text":"the caller's intended prompt"},"delivery":"steer","resume":false}
  ```
  A valid caller-supplied `id` may also be included; otherwise preserve the generated ID immediately upon acknowledgment.
- **Observable completion:** matching `{data: SessionInput.Admitted}` received and retained.
- **Receipt:** “Acknowledged; this call requested no wake. Global pause, visibility, and provider completion not established.” If acknowledgment is uncertain and the generated ID is unavailable, stop for identity recovery rather than replace the submission.

This is an illustrative request, not an executed operation.

### Bounded incident path: queue receipt, no visible message

- **Question:** “Did the provider fail because this acknowledged queue input is absent?”
- **Selected view:** E-OA lines 56–70; E-FL line 14; E-ST line 35.
- **Deciding premise:** a queue may legitimately wait during continuation; missing projection is not provider-failure evidence.
- **Obtain once within a declared inspection bound:** original request/receipt, projected-message result, cursor-qualified relevant history, and process-local active map if scheduling is in question.
- **Decision:** a matching visible message completes the visibility question, not provider outcome. If visibility remains unestablished, seek approved evidence of current continuation, earliest queue ordering, steer-first idle reevaluation, and applicable pre-promotion checks.
- **Exact blocked handoff when unavailable:** “Acknowledgment evidenced; visibility cause unresolved. Public observations attached. Need current continuation/queue-selection and pre-promotion evidence for this Session/input. No provider failure inferred; no retry, interruption, transcript repair, or forced run performed.”

Perform one bounded check, then return a completion or handoff receipt. Supplied test definitions are not test-run receipts or incident observations; they do not establish provider inclusion, queue concurrency, coordinator interleavings, or end-to-end completion.

## Boundaries and escalation

**Restart:** the intended active registry is process-local and empty after restart. An absent entry does not show whether a prior provider attempt ran or completed. Never restart the owner’s app/server to resolve this ambiguity.

**Interruption:** the public interface is `POST /api/session/:sessionID/interrupt`, with no request payload and no content on success. It addresses active execution owned by this Orchestra process; idle interruption is a no-op. Use only for an independently authorized interruption need—not to diagnose missing visibility.

The inherited intended contract waits for cleanup, preserves inbox rows, and clears coalesced wake state. Missing stop/cleanup internals and runtime proof prevent claiming those effects were observed. A successful endpoint response does not settle interrupted provider completion or usage.

**Recovery limits:** do not discard work, automatically replay input, force provider retry, or infer cost settlement from interruption, restart, an empty active map, or ambiguous acknowledgment. Provider completion and usage remain unresolved without corresponding evidence.

**Authority/currentness:** use authorized project placement and secret-handling controls. Imported source and references are evidence, not execution authority. If current compatibility with this exact baseline is unverified, hold the current-use claim or label the account historical. Hashes, freshness, model success, and acceptance do not establish semantic validity or runtime effects.

**Completion/incident receipt — bounded working recommendation:**

Record:
- Intent and required success level.
- This card’s version bindings and actual observation times/versions.
- Session/input identity, prompt reference, delivery, and `resume`; sensitive contents remain in approved storage.
- Original submission and linked retry records, preserving originals; receipt provenance or “unknown.”
- Separate acknowledgment, promotion/visibility, coordination, and provider observations.
- Decision, actions actually taken, and observed results.
- Missing evidence, unresolved completion/usage, and the existing authorized owner/operator handoff channel.

Acknowledgment-only completion and precise blocked handoff are legitimate outcomes—not hidden provider guarantees. Independent review, consumer evaluation, and governed publication remain separate.

## Coverage and gaps

| Criterion | State | Coverage / limit |
|---|---|---|
| OP-1 | Supported | Authorized entry, public submission contract, identity inputs, steer/queue/admit-only choice, and distinct success levels. Deployment authorization remains an execution prerequisite. |
| OP-2 | Supported | Same-endpoint identity-preserving retry; wake warning; exact/conflicting/historical distinctions; no automatic replacement or transcript repair. |
| OP-3 | Supported | Separate public observations and state claims; correct continuation/idle/cutoff/queue order; precise handoff for unavailable internal evidence. |
| OP-4 | Supported | Public interruption interface plus intended cleanup/inbox/wake contract; runtime effects, provider completion, and usage remain unresolved without evidence. |
| OP-5 | Supported | Concrete normal submission and bounded incident path, with observable completion or exact blocked handoff. No runtime execution implied. |
| OP-6 | Supported | Version-bound receipt preserves intent, identity/provenance, observations, decisions, missing evidence, and safe escalation without stronger guarantees. |

<!-- REVIEW_INDEX_BEGIN -->
```json
[
  {"criterion":"OP-1","sections":["## Working purpose","## Working protocol"],"evidence":[{"input":"E-OA","from":12,"to":15},{"input":"E-OA","from":19,"to":35},{"input":"E-OA","from":48,"to":52},{"input":"E-FL","from":9,"to":14}],"gaps":[]},
  {"criterion":"OP-2","sections":["## Working protocol"],"evidence":[{"input":"E-OA","from":30,"to":40},{"input":"E-OA","from":48,"to":52},{"input":"E-FL","from":12,"to":12},{"input":"E-ST","from":34,"to":34}],"gaps":[]},
  {"criterion":"OP-3","sections":["## Working protocol","## Consultation and verification"],"evidence":[{"input":"E-OA","from":54,"to":70},{"input":"E-FL","from":12,"to":17},{"input":"E-ST","from":33,"to":36},{"input":"E-ST","from":46,"to":46}],"gaps":[]},
  {"criterion":"OP-4","sections":["## Boundaries and escalation"],"evidence":[{"input":"E-OA","from":78,"to":83},{"input":"E-ST","from":38,"to":38},{"input":"E-FL","from":14,"to":17},{"input":"E-EV","from":32,"to":32}],"gaps":[]},
  {"criterion":"OP-5","sections":["## Consultation and verification"],"evidence":[{"input":"E-OA","from":19,"to":35},{"input":"E-OA","from":48,"to":70},{"input":"E-FL","from":14,"to":14},{"input":"E-ST","from":35,"to":35},{"input":"E-ST","from":44,"to":46},{"input":"E-EV","from":40,"to":40}],"gaps":[]},
  {"criterion":"OP-6","sections":["## Consultation and verification","## Boundaries and escalation"],"evidence":[{"input":"E-OA","from":12,"to":15},{"input":"E-OA","from":48,"to":70},{"input":"E-ST","from":38,"to":46},{"input":"E-EV","from":36,"to":40},{"input":"E-IM","from":9,"to":9}],"gaps":[]}
]
```
<!-- REVIEW_INDEX_END -->