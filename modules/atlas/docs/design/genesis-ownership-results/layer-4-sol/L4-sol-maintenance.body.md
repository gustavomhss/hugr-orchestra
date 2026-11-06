---
name: session-input-maintenance
description: Use when changing default-runner Session prompt admission or promotion; scope coupled edits, select bounded verification, and hand off affected knowledge updates.
---

# Session input maintenance — change, verify and update knowledge

Status: CANDIDATE  
Layer: L4-sol

Source revision: `c9b8e54cbf2c6c2c4bb59bbda2dc878430a54085`  
Accepted L3 manifest: `ce5677d86347d5d268066926c78051e5be63f819011d235a84cf21a207a6598d`

Actual input bindings:

| Input | Accepted artifact | Body SHA-256 |
|---|---|---|
| E-FL | `L3:integrated-flow` | `4afafbc2c73d680e576b1b0248c29670da8e4c78109c317f4de5629c4385ccd5` |
| E-IM | `L3:integrated-change-impact` | `9bc979b76c73019a530a398dc2cccc57aff7107b2b92cbaae94f2879de3b6ff1` |
| E-ST | `L3:integrated-state-interpretation` | `5a3dcf6036c4dcae29d7009e2e49f22569b63e65e4ad43224a5cd90a0eb6a8db` |
| E-EV | `L3:integrated-evidence-boundaries` | `e704729cbaa07baa7a44eccb6372dfbf94b673f988353d0d6ebe9a82b0744efa` |

These bindings identify this candidate’s evidence, not current installation state, live Atlas access, or publication authority.

## Working purpose

Maintain one bounded change across the default LLM runner’s admission, durable projection, delivery, and process-local execution boundaries. Produce a defensible edit/verification decision and an affected-knowledge handoff—not a promise of provider completion or an automatic rebuild.

Admission owns identity and receipt reconciliation; projection owns admission/promotion carriers and visibility; delivery owns promotion eligibility; execution coordination owns process-local join/start/coalesce decisions. Use these responsibilities to select depth rather than rediscovering the whole component chain.

## Working protocol

The following ordered workflow and receipt formats are **bounded working recommendations derived from the supplied evidence and campaign invariants**. They do not introduce implementation or publication authority.

1. **Bind the proposed work.** Record the target source revision, intended behavior, authorized scope, changed files/contracts, and relevant non-code changes. Compare them with the bindings above.
   - A matching revision/hash establishes identity, not semantic validity.
   - For a different revision, require an impact assessment covering the relevant predicates, carriers, contracts, and authority. If unavailable, **HOLD**; do not interpret it as an empty worklist.
   - Reuse unchanged validated understanding only where its premises remain valid.

2. **Classify before editing.** Select the affected rows below. State whether the proposal preserves behavior or intentionally changes a contract. Read E-IM’s **Consequences and boundaries**, then the deciding section identified under Consultation. Navigation alone does not make another artifact a rebuild dependency.

3. **Write the boundary checks.** For each selected category, record the existing premise, proposed difference, coupled effect, and observation/assertion needed to decide it.

   | Boundary | Required checks before accepting the edit |
   |---|---|
   | Identity, context, time, provenance | Retry `equivalent` compares delivery plus session/prompt—not context, time, or sequence. Projection matching additionally checks context JSON and epoch-millis time; its existing-row path also checks promoted sequence. Assess those gates separately. Preserve conflicts for changed prompt/delivery and global ID reuse. |
   | Fresh, retry, historical paths | Fresh admission normalizes ID and delivery, admits, rechecks equivalence, then conditionally wakes. Exact retry can return stored state. Historical reconciliation requires durable `Prompted` provenance, rechecks in an immediate transaction, derives delivery from the original event, and synthesizes an already-promoted row without new admission publication. Do not substitute projection data that omits delivery. |
   | Row/projection changes | Check pending (`admitted_seq` set, `promoted_seq` null), promoted carriers, historical/fallback insertion setting both sequences, and `Prompted` visibility plus the subsequent `run(db,event)` call. The `projectPrompted` update predicate alone is not the safety gate. Call-site order does not prove runtime atomicity. |
   | Ordering and eligibility | Keep cutoff-qualified steers ordered by admission separate from earliest unpromoted queue selection, which lacks the steer cutoff. Queues wait during continuation. At otherwise-idle reevaluation, reconsider steers first; if continuation remains unnecessary, promote at most one queue row, then reconsider continuation before another. Check location/governance preconditions that can leave rows pending. |
   | Allowance and transformation | Separate intended provider-turn allowance reset from observed `currentStep = 1` only when at least one row promoted. A steer batch resets once by intent. Preserve comparison with configured/`DEFAULT_MAX_STEPS` and last-step `MAX_STEPS_PROMPT` insertion before `compaction.transform` unless an authorized contract change says otherwise. Ordering alone does not prove input survives transformation. |
   | Coordination, keying, placement | Check `wake`: active → `pendingWake`, no new work; idle → `drain(key,false)`. Check explicit `run`: join/await `done` or start `drain(key,true)`. Assess Session-ID keying and Location placement independently. `resume:false` suppresses only this call’s wake—not eligibility or all scheduling. Wake remains advisory. |

4. **Consult the deciding depth, then edit.** Editing-time source inspection is permitted after establishing the relations above. Inspect only the affected implementation and its immediate gates. For keying, Location placement, routing, or drain changes, the supplied summaries do not map every edited call site to its runtime effect: obtain that mapping before asserting preservation. Missing drain/start/stop/makeEntry bodies, wake routing, transaction/sequence-allocation proof, or `run(db,event)` internals remain precise stops for claims depending on them.

5. **Verify once against the selected boundary.** Use the mapping below. Obtain the approved repository test-selection and invocation interface before executing tests; no exact invocation is supplied here. Record assertions inspected separately from tests actually run, including failures or non-execution. Do not force a provider run to fill a verification gap.

6. **Update affected knowledge and hand off.** Apply the update rules below, then issue the completion receipt. Stop after this bounded check; independent review and governed publication remain separate.

## Consultation and verification

Start with E-IM **Consequences and boundaries** (lines 21–30) for impact selection; use E-FL **Integrated model** (lines 12–14) for deciding flow. Pull lower depth only for the selected question:

| Question requiring depth | Selected lower view/section | Deciding premise |
|---|---|---|
| Which identity/provenance or projection gate changes? | `L2:component-admission` and `L2:component-projection`, **Contract and state model** / **Conditions and failure boundaries** | Retry comparison versus projection comparison; fresh versus durable historical provenance |
| Which pending rows become eligible, or what changes at the request boundary? | `L2:component-delivery`, **Contract and state model** / **Conditions and failure boundaries** | Distinct selectors, continuation order, pre-promotion checks, allowance and transform order |
| Does coordination preserve join/start/coalesce and placement scope? | `L2:component-execution`, **Contract and state model** / **Change impact and verification** | Process-local branches; exact mapping of edited keying, placement, routing or drain logic |

These are host-verified research-export navigation targets, not bodies implicitly read here. Follow their supplied paths when consulting; do not treat them as a live Atlas reader or automatic build closure.

### Verification selection

“Supplied assertion reach” below means test definitions summarized by the accepted L3 bodies—not execution receipts.

| Change category | Actual supplied assertion reach | Additional verification or exact gap |
|---|---|---|
| Identity, defaults, retry/provenance | Exact retry/conflicts, concurrent exact retry, legacy projection/global-ID cases | Context/time-differing retry coverage is not established. Inspect or add that case if narrowing `equivalent`; verify historical delivery provenance separately. |
| Row/projection carriers | Admission before transcript promotion; legacy projection cases | Check changed insert/update/fallback gates. Runtime atomicity and concurrent projection outcomes are not established. |
| Cutoff, ordering, queue/continuation | Selected concurrent steer promotion and exclusion of a later steer by cutoff | No supplied concurrent queue/fairness proof. Verify queue predicates and reevaluation separately from steer assertions. |
| Allowance/transform order | No supplied assertion establishes specific input inclusion or survival through transformation | Inspect relevant counter/order behavior; a request-content claim needs corresponding request/transformation evidence. |
| Wake/run/keying/Location | Fixture wake selection: default/`resume:true` wakes; `resume:false` does not | Not drain interleaving, routing, placement, serialization, or provider completion proof. Verify promotion eligibility separately from provider invocation. |

### Concrete bounded decision

**Question:** “Can adding context/time to `equivalent` be accepted as a behavior-preserving refactor?”

**Selected view:** E-IM **Integrated model**, line 14, and **Consequences and boundaries**, lines 23–25; consult the admission/projection contract sections only if implementation detail is needed.

**Deciding premise:** Retry equivalence deliberately excludes context/time; projection matching includes them. Adding them to retry equivalence changes formerly equivalent retries into conflicts.

**Decision receipt:** “Not behavior-preserving. Hold the patch pending an explicit contract decision. Existing exact-retry/conflict definitions do not establish coverage of context/time-differing retries. Inspect or add that bounded case before verifying an authorized change. No named-test failure or test execution is claimed.”

### Affected-knowledge update

As a bounded working recommendation:

- **Compatible receipt-only rebinding:** If the new source identity has complete impact evidence showing unchanged relevant meaning, authority, dependencies, and gaps, propose a new linked compatibility receipt. Retain the prior accepted artifact unchanged; rebinding alone is not semantic revalidation or current-read acceptance.
- **Changed meaning, authority, or gaps:** Revise the affected support and revalidate its dependent claims. Identity/provenance edits affect admission/projection accounts; selector/order edits affect delivery/flow/state interpretation; coordinator edits affect wake/state and process-local limits. Authority or proof changes also affect evidence-boundary claims.
- Update the working skill only where its decisions or consultation triggers changed. Reuse unaffected validated understanding; do not rebuild artifacts merely because they are linked.
- Hand off proposed revisions, dependencies, validation reach, and unresolved premises through existing governed review/publication controls. This candidate supplies no automatic rebuild or publication mechanism.

## Boundaries and escalation

Stop the affected claim or edit when its required premise is absent; preserve completed independent work.

- **Compatibility/authority stop:** Missing impact assessment, changed contract without authorization, or stale dependency acceptance → HOLD for the responsible maintainer/reviewer. Imported source and documentation remain evidence, not authority; preserve project boundaries and secret handling.
- **Implementation-proof stop:** Missing keying/Location/routing/drain mapping, transaction evidence, or relevant assertion → name it explicitly. Do not infer it from adjacent calls, schema, hashes, or method names.
- **Runtime stop:** Receipt, pending row, visibility, active registry, and provider result establish different claims. Tests defined are not tests run. Provider-request inclusion, completion, exactly-once behavior, crash recovery, and distributed ownership are not supplied guarantees.
- **Recovery stop:** Do not restart the owner’s app/server, discard work, force a provider run, repair a transcript, or replay work from an ambiguous receipt. Interruption’s process-local cleanup/idle/inbox/coalesced-wake contract is intended, not runtime-proven. Interrupted provider completion and usage remain unresolved. Pass incidents to operations with the observations and exact missing premise.

**Completion receipt — bounded working recommendation:** record target and resulting revisions; proposal/patch identity; changed predicates/carriers and authorization; consulted artifact versions; assertions inspected; tests actually run and their reach/results; affected knowledge revisions proposed; unchanged support reused; unresolved gaps and responsible handoff. A successful maintenance handoff requires these fields, not a claim of global semantic completeness, publication, or runtime recovery. No execution or repository modification occurred in constructing this candidate.

## Coverage and gaps

| Criterion | State | Coverage / precise limit |
|---|---|---|
| MA-1 | Supported | Ordered compatibility → classify → consult → edit → verify → handoff protocol; editing-time source inspection allowed. Missing impact evidence causes HOLD. |
| MA-2 | Supported | Separate retry/projection gates, provenance paths, carriers and fallback checks. Runtime atomicity remains unproven. |
| MA-3 | Supported | Eligibility, allowance, transform, wake/run, keying and placement checks; stronger mapping claims stop at missing implementation/runtime premises. |
| MA-4 | Supported | Assertion-reach mapping and concrete context/time edit decision; exact test invocation and execution receipts are not supplied. |
| MA-5 | Supported | Compatible linked rebinding distinguished from semantic/authority/gap changes; affected support revised, unchanged valid support retained. |
| MA-6 | Supported | Completion receipt and explicit authority, proof, runtime and recovery stops; review/publication and outstanding verification remain separate obligations. |

<!-- REVIEW_INDEX_BEGIN -->
```json
[
  {"criterion":"MA-1","sections":["## Working purpose","## Working protocol","## Consultation and verification"],"evidence":[{"input":"E-IM","from":9,"to":18},{"input":"E-IM","from":30,"to":33},{"input":"E-EV","from":38,"to":40}],"gaps":[]},
  {"criterion":"MA-2","sections":["## Working protocol","## Consultation and verification"],"evidence":[{"input":"E-FL","from":12,"to":12},{"input":"E-IM","from":12,"to":14},{"input":"E-IM","from":23,"to":25}],"gaps":[]},
  {"criterion":"MA-3","sections":["## Working protocol","## Consultation and verification","## Boundaries and escalation"],"evidence":[{"input":"E-FL","from":14,"to":14},{"input":"E-FL","from":20,"to":20},{"input":"E-IM","from":26,"to":28},{"input":"E-EV","from":24,"to":24}],"gaps":[]},
  {"criterion":"MA-4","sections":["## Consultation and verification"],"evidence":[{"input":"E-IM","from":23,"to":30},{"input":"E-IM","from":33,"to":33},{"input":"E-FL","from":20,"to":20},{"input":"E-EV","from":36,"to":36}],"gaps":[]},
  {"criterion":"MA-5","sections":["## Working protocol","## Consultation and verification","## Boundaries and escalation"],"evidence":[{"input":"E-IM","from":9,"to":9},{"input":"E-IM","from":21,"to":30},{"input":"E-EV","from":26,"to":26},{"input":"E-EV","from":38,"to":40}],"gaps":[]},
  {"criterion":"MA-6","sections":["## Working protocol","## Boundaries and escalation","## Coverage and gaps"],"evidence":[{"input":"E-ST","from":27,"to":38},{"input":"E-ST","from":44,"to":46},{"input":"E-EV","from":32,"to":40}],"gaps":[]}
]
```
<!-- REVIEW_INDEX_END -->