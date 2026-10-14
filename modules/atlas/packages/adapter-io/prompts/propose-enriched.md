<!--
ADR-0011 Decision 3 — the S2 proposal prompt, ENRICHED variant. This file IS the artifact: it ships as
written, it is hashed into the run's provenance, and an operator override is recorded rather than silent.
It is a SIBLING of propose.md and shares its clauses verbatim; the ONE addition is the RELATED-context
section, used only on the opt-in ENRICH arm (a `SiblingReader` injected into `createPromptFactory`).

Every clause below is traceable. HTML comments are stripped before the text reaches the model, so the
justification travels with the prompt without being sent to it.

  · ANCHOR AS A CLOSED VOCABULARY — the unit is named as a constraint, not offered as context. Presenting
    discovered anchors as a closed vocabulary and demanding grounding per element is the anchor-constrained
    extraction result (Grounded Knowledge Graph Extraction via LLMs, MDPI Computers 15(3):178).
  · RELATED UNITS ARE CONTEXT, NOT TARGETS — the ENRICH addition. A symbol-anchored view hides the sibling
    units the target references, so a fact whose truth depends on a sibling's bytes/type is manufactured
    plausible-but-false (#201, measured in A4-LEVER.md: every false fact on the symbol arm was this
    cross-unit trap). The related units are shown so the fact is DERIVABLE, and framed as context-only so the
    model states its fact about the TARGET — never about a related unit. This does NOT widen grounding: the
    fact is anchored to, and its evidence span minted from, the TARGET unit alone (KNOW-15g — secondary
    context feeds the proposer, never identity).
  · DERIVABLE FROM THE SHOWN BYTES — the named failure here is a model asserting what it knows about a
    popular library instead of what this code says (Context-faithful Prompting, arXiv 2303.11315). Atlas's
    whole claim is that a fact re-derives at source@sha; a fact the source does not contain cannot.
  · ABSTENTION IS VALUED, NOT MERELY PERMITTED — GEN-12 makes abstention a valid, unpressured outcome, and
    explicitly rewarding "no answer" measurably improves selective behaviour (I-CALM, arXiv 2604.03904).
    Note the standing caveat: an abstention signal is partly an artifact of phrasing (arXiv 2507.16199), so
    the refusal RATE is only readable as a quality signal with this prompt held fixed — which the provenance
    hash is what makes possible.
  · ABSTENTION IS A TOKEN, NOT SILENCE — [#201/#202] measured: "output NOTHING to abstain" NEVER fired (0 in
    300 calls). A responsive model will not emit empty output; it emits a one-line PROSE refusal instead,
    which the sanity gate then admits as a fabricated fact (#201). So abstention is given a POSITIVE ACTION —
    emit the token `NO-FACT` — which is the I-CALM reward made concrete. `llm.ts` maps that exact token
    (case-insensitive, whole-answer) back to the identical GEN-12 abstention as empty stdout. The token
    string is COUPLED to `ABSTAIN_SENTINEL` in llm.ts and pinned by test — the prompt says the word the gate
    reads.
  · NOT A RESTATED SIGNATURE — "non-obvious AND actionable, not a restated signature" is the harness's
    obviousness predicate (`TwoDoorBar.nonObvious`, admit-harness.ts). Since ADR-0012 it SCORES rather than
    rejects: a restated signature is stored with `obviousness.rank === 'obvious'` and loses at ranking. The
    prompt states what the harness measures, so a refusal is informative rather than arbitrary. Note the
    asymmetry this clause must NOT cross: the model is steered toward non-obvious facts, and is never asked
    how non-obvious its own claim is — GEN-16 forbids resting the judgment on the proposer's self-assessment,
    and the score is computed by the harness over the source bytes.
  · REASON FREELY, THEN EMIT ONE PARSEABLE BLOCK (ADR-0020) — the earlier "no reasoning, one line" contract
    measured 77.5% precision: forbidden from reasoning, the model read a stale/past-tense COMMENT as current
    code and stated it as a fact (#201). ADR-0020 (measured 100%, 0 hallucination) INVERTS it: the model
    reasons freely in a discarded scratch region, actively refutes its candidate against the bytes, THEN emits
    exactly one fenced `atlas-fact` block carrying `claim`. GEN-4d still holds — no self-declaration is asked
    for or read (no confidence/obviousness field). GEN-12 still holds — the reasoning is SCRATCH: the harness
    parses only the block's `claim` and NEVER persists the free reasoning as a fact (`llm.ts admitModelAnswer`).
    Admission is BLOCK-COUNT (llm.ts): exactly one block ⇒ its `claim`; zero blocks ⇒ abstention; ≥2 ⇒ rejected.
  · MINED SIGNALS ARE ABSENT ON PURPOSE — `Candidate.signals` (churn, SZZ, owners, commit messages) is NOT
    passed. GEN-6 forbids a signal from minting a fact; withholding the signals makes that violation
    structurally impossible instead of merely instructed against. They already did their work in ranking.
-->

You are shown ONE anchored TARGET unit from a real codebase, and the RELATED units it references as CONTEXT.

{{RELATED}}

<unit path="{{PATH}}" name="{{UNIT}}">
{{SOURCE}}
</unit>

State ONE fact about the TARGET unit — the `<unit>` above, NOT the related context — that a competent
engineer would NOT already know from its name and signature, and that would change what they do. Work in two
steps.

STEP 1 — REASON FREELY (scratch, never stored). Read the bytes closely. Draft a candidate fact about the
TARGET, then actively try to REFUTE it against the source:

- Is it about the TARGET (not a related unit), and derivable from the bytes shown (the target plus the related
  context) — or are you leaning on what you know about a library, framework or convention not visible here, or
  on a stale/past-tense COMMENT the current code may contradict? The related units are there so a fact that
  DEPENDS on them is derivable — not so you can state a fact about them.
- Is it more than a restatement of the name, the signature or the types, or a summary of what the code
  plainly does?
  Discard any candidate that does not survive. This reasoning is scratch: it is parsed away and never persisted.

STEP 2 — EMIT THE RESULT. If a fact about the TARGET survived, emit it as EXACTLY ONE fenced block tagged
`atlas-fact`, holding a JSON object with a single `claim` field — one sentence of plain prose:

```atlas-fact
{"claim": "<the one surviving fact about the target>"}
```

Emit exactly ONE such block, and put NO fenced block anywhere in your reasoning — only the final fact is fenced.

If the TARGET holds no such fact, emit NO fact block at all (a bare `NO-FACT` on its own line is also
accepted). Most units hold none. That is a correct, expected result — recorded as a deliberate abstention,
never a failure. A fact the bytes do not contain cannot be re-derived at source@sha and MUST NOT be emitted.
