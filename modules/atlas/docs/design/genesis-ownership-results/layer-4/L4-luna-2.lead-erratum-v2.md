# Session input ownership — working skill and scoped consultation
Status: CANDIDATE
Layer: L4
Baseline/source revision: `c9b8e54cbf2c6c2c4bb59bbda2dc878430a54085`
Accepted L3 manifest: `ce5677d86347d5d268066926c78051e5be63f819011d235a84cf21a207a6598d`
Actual input digests, bound to this manifest: E-FL `4afafbc2c73d680e576b1b0248c29670da8e4c78109c317f4de5629c4385ccd5`; E-IM `9bc979b76c73019a530a398dc2cccc57aff7107b2b92cbaae94f2879de3b6ff1`; E-ST `5a3dcf6036c4dcae29d7009e2e49f22569b63e65e4ad43224a5cd90a0eb6a8db`; E-EV `e704729cbaa07baa7a44eccb6372dfbf94b673f988353d0d6ebe9a82b0744efa`.

## Working purpose

This candidate prescribes bounded consultation for durable Session prompt admission and promotion in the default LLM runner. It is research ownership guidance, **not installed or registered**, not a deployed skill or live Atlas reader, and not proof of runtime behavior.

Use it when deciding how to change this flow or interpret an observation about admitted Session input. Start with the decision you need to make; consult only the view that can decide it. The component relationships and evidence limits below are supported by E-FL lines 8–17, E-IM lines 8–18, E-ST lines 14–27, and E-EV lines 14–24.

## Working protocol

1. **State the question and claim.** Is this a change-impact decision, a flow question, an interpretation of observed state, or an evidence/authority question? Name the precise behavior or observation at issue.
2. **Select one starting view** from the navigation table. Do not consult every view by default.
3. **Use the view’s deciding distinctions.** Keep admission receipt, pending/promoted visibility, eligibility, coordination, and provider outcome separate. For changes, identify which predicate, state carrier, selector, or coordination branch changes and what it couples to.
4. **Check whether that view contains the deciding premise.** If yes, stop deepening. If not, consult only the supplied accepted artifact that answers the missing premise, recursively as needed; bind the exact artifact version and section. Do not treat an unresolved reference as evidence.
5. **Apply the boundaries and produce a receipt.** Say what is established, what remains unknown, the evidence consulted, and why consultation stops. A change’s source inspection may be needed to edit it; that is distinct from rediscovering the established knowledge.

| Need | Start with exact handle and section |
|---|---|
| Understand admission-to-promotion and provider-turn flow | `L3:integrated-flow` — **Integrated responsibility** or **Integrated model** |
| Assess coupled consequences of a proposed change | `L3:integrated-change-impact` — **Integrated model** or **Consequences and boundaries** |
| Interpret a receipt, pending row, visibility, wake, or interruption observation | `L3:integrated-state-interpretation` — **Integrated model** or **Consequences and boundaries** |
| Decide what evidence or authority supports a claim | `L3:integrated-evidence-boundaries` — **Integrated model** or **Verification and evidence limits** |

The handles and section names refer to the supplied coordinator-verified navigation map and accepted L3 versions; the map points to Markdown research artifacts, not proof of an implemented Atlas retrieval/index reader.

## Consultation and verification

**Shallow routine:** for a bounded question answered by one selected view, consult its named section, compare the claim to that section’s evidence limits, then stop with a short receipt: question, handle/version and section consulted, decision, remaining uncertainty, and stop reason.

**Justified deeper path:** deepen only if the selected view lacks a premise that would decide the question—for example, a change-impact question needing the distinct steer and queue predicates, or a state diagnosis needing the evidence required to establish visibility versus provider outcome. Follow the supplied navigation map to the accepted artifact and relevant section; record its exact version. If that reference is absent, mismatched, or does not answer the premise, expose it as unresolved and stop or mark the decision blocked. Do not invent an Atlas command, query syntax, index, or authority.

**Concrete deeper path (derived working example):** Question: “If `equivalent` starts comparing context/time, must an existing supplied test fail?” Start with `L3:integrated-change-impact` → **Consequences and boundaries**, which identifies the changed retry semantics. The missing deciding premise is actual assertion coverage for context/time-only retries, not the identity predicate itself. Deepen to `L3:integrated-flow` → **Verification and evidence limits** (E-FL line 20; E-IM lines 23, 33), using the exact versions bound in this header/navigation map. That section states the supplied assertions do not establish that narrowing `equivalent` fails a named test. Receipt: `question=context/time retry edit; start=L3:integrated-change-impact#Consequences and boundaries; deeper=L3:integrated-flow#Verification and evidence limits; decision=retry semantics change is supported; stronger named-test-failure claim=BLOCKED; missing=actual context/time-only assertion and execution result; stop=do not deepen through unrelated views or invent a failing test`. Before editing/verification, consult the current approved repository test instructions and the specific needed assertion. This example completes a bounded decision while handing off the precise stronger-claim gap.

For a code edit, inspect current source and applicable repository instructions as needed to make the edit. Do not mistake source inspection for evidence that the research artifact is current, or the research artifact for a substitute for editing-time inspection. Supplied test descriptions are not execution receipts; consult the project’s current approved runner and repository instructions for actual verification rather than fabricating a command. E-IM lines 30–33 and E-EV lines 36–40 bound these distinctions.

## Boundaries and escalation

Keep authorized intent, observed implementation, interpretation, and runtime proof distinct. Admission normally precedes this call’s conditional advisory wake; promotion is a later conditional outcome, not a prerequisite for wake. Exact retry and historical synthesis need not publish a new admission; `resume:false` suppresses only that call’s wake. Steers use a cutoff predicate; queues wait during continuation and are reconsidered after steer-first idle reevaluation. A receipt or pending row does not prove provider failure, visibility, or completion. E-FL lines 12–17 and E-ST lines 22–27, 33–40 support these boundaries.

Do not infer automatic crash replay, provider completion or usage, provider-level exactly-once behavior, or cross-process ownership. Preserve uncertainty about interrupted provider cost and outcome; never restart the owner’s app/server, discard work, or infer retries from absent activity. Intended interruption cleanup/idle behavior and inbox/coalesced-wake handling are not runtime-proven effects. E-ST lines 36–40 and E-EV lines 30–40 describe the relevant limits.

Freshness, semantic validity, and authority are different. An old acceptance or matching hash cannot make drifted knowledge current or establish semantic/runtime correctness. If currentness, a deciding implementation premise, or required evidence is missing, state exactly what is missing and stop; do not use a stale artifact as silent fallback. Evidence insufficiency is not itself source drift, and a contradiction between supplied claims is a semantic conflict to expose, not reconcile by assumption. E-EV lines 32–40.

## Coverage and gaps

| Criterion | State | Section | Precise missing premise |
|---|---|---|---|
| SK-1 | Supported | Working purpose; Working protocol | None for this bounded candidate scope. |
| SK-2 | Supported | Working protocol | None; the table selects a starting view for each stated need. |
| SK-3 | Supported | Working protocol | None; live Atlas retrieval syntax or implementation is explicitly not claimed or required. |
| SK-4 | Supported | Boundaries and escalation | None; current-source inspection remains permitted for edits. |
| SK-5 | Supported | Consultation and verification | None; shallow and conditional deeper paths both define a stop receipt. |
| SK-6 | Supported | Working purpose; Boundaries and escalation | Before publication as an operational skill, real implementation of the reader/retrieval and skill integration, plus held-out evaluation of selection, version binding, unresolved references, and safe stopping, are needed. This candidate does not self-certify AC-03 or production behavior. |

<!-- REVIEW_INDEX_BEGIN -->
```json
[
  {
    "criterion": "SK-1",
    "sections": [
      "## Working purpose",
      "## Working protocol"
    ],
    "evidence": [
      {
        "input": "E-FL",
        "from": 8,
        "to": 17
      },
      {
        "input": "E-EV",
        "from": 14,
        "to": 16
      }
    ],
    "gaps": []
  },
  {
    "criterion": "SK-2",
    "sections": [
      "## Working protocol"
    ],
    "evidence": [
      {
        "input": "E-FL",
        "from": 8,
        "to": 17
      },
      {
        "input": "E-IM",
        "from": 8,
        "to": 18
      },
      {
        "input": "E-ST",
        "from": 14,
        "to": 27
      },
      {
        "input": "E-EV",
        "from": 14,
        "to": 24
      }
    ],
    "gaps": []
  },
  {
    "criterion": "SK-3",
    "sections": [
      "## Working protocol"
    ],
    "evidence": [
      {
        "input": "E-EV",
        "from": 38,
        "to": 40
      },
      {
        "input": "E-IM",
        "from": 38,
        "to": 43
      }
    ],
    "gaps": []
  },
  {
    "criterion": "SK-4",
    "sections": [
      "## Boundaries and escalation"
    ],
    "evidence": [
      {
        "input": "E-EV",
        "from": 32,
        "to": 40
      },
      {
        "input": "E-IM",
        "from": 30,
        "to": 33
      }
    ],
    "gaps": []
  },
  {
    "criterion": "SK-5",
    "sections": [
      "## Consultation and verification"
    ],
    "evidence": [
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
    "criterion": "SK-6",
    "sections": [
      "## Working purpose",
      "## Boundaries and escalation",
      "## Coverage and gaps"
    ],
    "evidence": [
      {
        "input": "E-EV",
        "from": 36,
        "to": 40
      },
      {
        "input": "E-EV",
        "from": 44,
        "to": 51
      }
    ],
    "gaps": []
  }
]
```
<!-- REVIEW_INDEX_END -->