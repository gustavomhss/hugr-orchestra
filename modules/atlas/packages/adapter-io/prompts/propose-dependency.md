<!--
ADR-0011 Decision 3 / ADR-0017 dependency slot — the S2 DEPENDENCY proposal prompt (#196a candidate-grounded).
This file IS the artifact: it ships as written, it is hashed into the run's provenance, and an operator
override is recorded rather than silent. It is a SIBLING of `propose.md` (the advisory prompt), selected by the
dependency mining arm (`ATLAS_MINE_SLOT=dependency`); the advisory prompt is unchanged.

Every clause is traceable. HTML comments are stripped before the text reaches the model.

  · CANDIDATE-GROUNDED SELECTION — the measured crux (#95 bench, 2026-08-14): a free-form LLM names a HUMAN
    symbol the sound oracle cannot key on (a builtin, a wrong-granularity guess), so recall was 0. The fix is
    to let the INDEX supply the RECALL and the model supply the SALIENCE: `{{CANDIDATES}}` is the unit's REAL
    cross-unit dependency names, computed mechanically (`UnitDepsApi.candidatesFor`, @atlas/index). The model
    may ONLY select from that closed list — which is what makes the pick sound (it resolves to a real symbol
    the gate re-proves). Presenting a closed vocabulary and demanding selection from it is the anchor-
    constrained extraction result (Grounded Knowledge Graph Extraction via LLMs, MDPI Computers 15(3):178).

  · SALIENCE, NOT DISCOVERY — the index already knows WHAT the unit depends on; the model's only job is WHICH
    dependency is NON-OBVIOUS and worth recording as knowledge. A dependency a reader would already expect from
    the unit's name/role is not worth a fact. This is the harness's obviousness intent (ADR-0012), applied at
    selection time.

  · SCOPE IS NOT ASKED — the dependency witness ranges over the unit's OWN directory, which Atlas derives from
    the mined path (`unitScopeOf`, llm.ts). Asking the model for a directory only added error (#95 measured).

  · ABSTENTION IS A TOKEN — [#201/#202] emit `NO-FACT` when the candidate list is empty or no dependency is
    non-obvious. `llm.ts` maps that token (case-insensitive, whole-answer) to the GEN-12 model-abstained
    outcome. Most units carry no dependency worth recording; abstaining is correct, never a failure.

  · ONE LINE, A CLOSED GRAMMAR, NO REASONING — GEN-4d/GEN-12: no self-declaration, no persisted chain-of-
    thought. The output is ONE line `DEPENDS-ON: <name>` where `<name>` is copied VERBATIM from the candidate
    list, OR the token `NO-FACT`. A `<name>` not in the list, or any other shape, is treated as unparseable and
    abstains (never a fabricated fact). COUPLED to `parseDependencyClaim` (llm.ts); pinned by test.
-->

You are shown ONE anchored unit from a real codebase, and a CLOSED LIST of the symbols it actually depends on
(resolved from the code index — every name below is a real cross-unit dependency of this unit).

<unit path="{{PATH}}" name="{{UNIT}}">
{{SOURCE}}
</unit>

DEPENDS-ON candidates (the closed list — select ONLY from these): {{CANDIDATES}}

From that list, pick the ONE dependency a competent engineer would NOT already expect from this unit's name and
role, and whose relationship to this unit is worth recording as knowledge.

- The name you output MUST be copied VERBATIM from the candidate list above. Do not name anything else.
- Restating an obvious dependency (the framework the unit is plainly built on) is not worth recording. Pick the
  non-obvious one.
- If the candidate list is empty, or none of its entries is a non-obvious dependency worth recording, output the
  single token `NO-FACT` and nothing else. That is a correct, expected abstention, never a failure.

Output EITHER exactly one line `DEPENDS-ON: <name>` (with `<name>` copied verbatim from the list), OR the single
token `NO-FACT`. No preamble, no reasoning, no confidence, no formatting.
