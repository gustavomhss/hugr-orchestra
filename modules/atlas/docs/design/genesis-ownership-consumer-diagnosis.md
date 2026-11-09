# Reserved consumer HOLD — bounded diagnosis

Status: DIAGNOSIS COMPLETE; RP-7 remains HOLD, not remediation or acceptance. Owner authorized continuation after the
explanation that omissions may arise from material, consultation or evaluation.
Preserved predecessor: [reserved decision](genesis-ownership-results/runtime-pilot/terra-2-reserved-v1.decision.json).

## Frozen diagnostic contract

- Inputs: original H1/H2/H3 prompts, frozen envelopes, exact actual returned Atlas bodies, original
  answers, unchanged oracle/slice contracts, accepted navigation and current cited implementation.
- No consumer redispatch, substitute reserved cases, new mining, source/accepted-body edits or owner
  runtime changes. Exposed cases remain exposed. Preserve all original verdicts and bytes.
- For each finding, distinguish: evidence absent from the corpus; evidence present but not consulted;
  evidence consulted but omitted in the answer; semantic equivalent rejected by an overly literal
  evaluation. More than one cause may apply. Do not infer model intent from the trace.
- Check whether each alleged missing proposition is required by the frozen oracle, materially distinct
  from what was answered, and supported by actual code. A lead disagreement is not an independent PASS.
- If a genuine judgment ambiguity remains, submit one narrow clarification to the existing Terra 2
  only, with original wording/trace/oracle and both interpretations. No coaching, replacement judge,
  repeated appeal or entire duplicate audit. Preserve any clarification separately from original HOLD.
- Deliverable: a clause-to-evidence diagnosis and a bounded next-action decision, not revised answers.
- DoD: each original omission has trace/body/code references and a supported classification; any
  evaluation ambiguity is explicitly resolved or retained; remaining genuine blockers stay HOLD.
- Stop after diagnosis/one clarification. Any producer or harness remediation and any new independent
  evaluation require their own frozen contract; diagnosis itself grants no authority to rerun.

## Findings

The following are lead findings from direct comparison, not new independent acceptances. Original
decisions and consumer results remain in `genesis-ownership-results/runtime-pilot/`.

### H1 — consulted evidence omitted in synthesis

The actual trace returned `L4:entry`, `L3:integrated-flow` and `L2:component-projection`, all READY.
The latter two returned bodies were compared byte-for-byte with their accepted exports. In particular:

- `layer-3/L3-router-1.lead-erratum-v2.md:12` explains that historical reconciliation requires a
  durable `Prompted` event and derives delivery from original event provenance because projections omit it.
- `layer-2/L2-router-2.msg_1adab25f70018YLflNOMFNoan2.candidate.md:38` repeats the condition explicitly.
- `packages/core/src/session/input.ts:96-160` supplies the deciding implementation: durable event type,
  provenance decoding, original delivery and projection/equivalence checks. This range still equals
  the frozen baseline range at `c9b8e54cbf2c6c2c4bb59bbda2dc878430a54085`.

The answer instead says “Qualifying historical reconciliation can return an already-promoted record”
and recommends inspecting row/event/projection state. It never explains what makes that historical
reconciliation qualify. General references to provenance do not communicate the decisive origin of
delivery. The unchanged H1 oracle expressly requires durable historical-event reconciliation.

**Classification:** consulted-but-not-explained proposition; not missing corpus evidence, a blocked
Atlas read or body-budget exhaustion. The frozen allowance was six bodies; three were returned. The
trace cannot establish whether the omission was intentional compression, misunderstanding or another
internal model cause. No consumer retry is justified by this diagnosis.

### H2 — premature entry-only answer; required operational route left unread

The actual trace returned only `L4:entry`, READY, then a final answer. The entry itself directs
diagnostic work to `L3:integrated-state-interpretation` → **Consequences and boundaries**
(`layer-4-sol/L4-sol-entry.body.md:38-53,85-95`). No such body/section was returned.

The evidence exists in the accepted corpus, with a second routing limitation worth distinguishing:

- `layer-3/L3-luna-1.lead-erratum-v3.md:25,36` explains active-wake coalescing and why neither active
  nor idle wake proves promotion/provider completion. This is in the entry's named diagnostic route.
- `layer-4-sol/L4-sol-operational-remedy.body.md:63,117-127` provides advisory/coalesced wake and a
  diagnostic sequence including pre-promotion `governance.beforeTurn`/Location checks.
- `layer-3/L3-router-1.lead-erratum-v2.md:14` and
  `layer-2/L2-luna-1-remedy.msg_1adb05c2d001JMRo63ZO96jbfm.candidate.md` → **Conditions and failure
  boundaries** supply pre-promotion constraints. `packages/core/src/session/runner/llm.ts:191-212` still matches the frozen
  baseline: Location fence, governance and context initialization precede promotion.
- `packages/core/src/session/run-coordinator.ts:99-110` still matches the frozen baseline: an active wake sets `pendingWake`
  and returns, rather than starting another drain.

The answer's request for eligibility/drain evidence is safe but does not enumerate these independent
pre-promotion explanations. The original H2 oracle requires them; these are not newly imposed criteria.
The entry's shallow operational example supports refusing a forced run, but that narrow refusal does
not by itself complete the broader requested diagnostic sequence.

**Classification:** available-but-unconsulted evidence plus an entry/consultation sufficiency mismatch.
The entry routes directly to L3, and its diagnostic section there does not itself enumerate governance;
the accepted L4 operational body has the fuller sequence but the entry's table does not name that
sibling. The importer exposes an `operational` need root, but its navigation list is the supplied
L3/L2/supplement list (`scripts/ownership-pilot.ts:110-114`). This is not proof the root is inaccessible:
the frozen harness explicitly permits need selection. It is an insufficiently explicit route for the
decision, not a demonstrated reader failure.

The host protocol also says extra reads are needed “only when needed” and to answer once deciding
evidence suffices. Combined with the entry's one-check stop and shallow example, the observed behavior
is consistent with premature sufficiency judgment. This is a design risk, not a measured causal claim.
No call was denied and the six-body allowance was not exhausted. Making the budget larger or replaying
the complete corpus is not supported as the remedy.

### H3 — contract/design handoff remains incomplete after one clarification

The entry alone supports the answer's negative guarantee and exclusions. The exact answer rejects
post-crash exactly-once and hosted live-steering promises, and says stronger guarantees require
“separately established recovery, provider-outcome, and execution-host evidence and approval.”
The original judge accepted these distinctions but required the explicit contract/design handoff.

The unchanged oracle and slice contract accept equivalent correct reasoning, not identical prose.
There are two legitimate readings: (a) evidence/approval does not supply a new product contract, so a
distinct obligation is missing; (b) the complete refusal and separate-evidence/approval handoff is
equivalent for this boundary-only task. A single H3-only clarification was dispatched to the existing
Terra 2 with both interpretations and the original answer/task/entry/oracle.

The same judge sustained HOLD in
[`consumer-diagnosis/terra-2-h3-clarification-v1.decision.json`](genesis-ownership-results/runtime-pilot/consumer-diagnosis/terra-2-h3-clarification-v1.decision.json):
observations may establish behavior and approval may authorize a claim, without identifying the owner
contract/design that must define the stronger guarantee and recovery/distributed responsibilities.
It explicitly disclaims demanding the literal nouns “contract” or “design,” and sustains HOLD because
the original answer does not communicate that distinct handoff unambiguously. The lead records this
bounded interpretation without upgrading H3 or appealing again. H1/H2 and overall RP-7 remain HOLD.

## Bounded next-action decision

1. Do not re-mine or rewrite the accepted knowledge chain: the deciding H1/H2 evidence is already present.
2. First candidate remedy is the **consultation/completeness protocol**, not more body budget. It should
   require the selected domain route and an explicit sufficiency check against the user's actual
   question before finalizing, while preserving safe refusal and legitimate entry-only boundary answers.
   Reading every linked body or forbidding all shallow answers would defeat need-driven consultation.
3. Keep safety and completeness separate. A safe BLOCKED handoff can satisfy a narrow “may I force it?”
   question without establishing a complete diagnosis. Verification of every claimed mechanism remains
   evidence-bound; no unsupported causal certainty is added.
4. Any revised harness/prompt is a new, explicitly versioned experiment. H1/H2/H3 become exposed
   regression evidence only; do not label a post-remedy rerun as held-out success. Before another
   consumer campaign, freeze generic consultation obligations and independent unseen evaluation,
   with a closed call envelope and unchanged accepted bytes. No new consumer campaign is dispatched
   by this diagnosis.

### Acceptance and stopping record

The diagnostic deliverable is complete: each original omission has an evidence route and distinct
classification; the one semantic ambiguity was independently clarified without changing the criterion.
The exact clarification request/decision and provenance are preserved separately from the original
evaluation. No accepted research body, frozen consumer answer, original decision or v1 evidence manifest
was changed. No extra consumer inference was dispatched and no new judge was created.

RP-7 and RP-8 remain open. This diagnosis recommends a new consultation/completeness contract before
another experiment; it does not silently start one, expand the corpus or authorize final epic/landing.
