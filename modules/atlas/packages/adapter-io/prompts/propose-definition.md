<!--
ADR-0011 Decision 3 / #196d definition slot — the S2 DEFINITION proposal prompt (candidate-grounded).
This file IS the artifact: it ships as written, it is hashed into the run's provenance, and an operator override
is recorded rather than silent. It is a SIBLING of `propose-dependency.md` / `propose-count.md`, selected by the
definition mining arm (`ATLAS_MINE_SLOT=definition`); the advisory, dependency and count prompts are unchanged.

Every clause is traceable. HTML comments are stripped before the text reaches the model.

  · CANDIDATE-GROUNDED SELECTION — `{{CANDIDATES}}` is the closed list of the GLOBAL symbols THIS unit DEFINES,
    computed mechanically (`UnitDefsApi.definitionsFor`, @atlas/index). The model may ONLY select from that list;
    the sound `verifyDefinition` oracle then re-proves the pick's definition-occurrence lies under the unit's
    scope. Presenting a closed vocabulary and demanding selection is the anchor-constrained extraction result
    (Grounded Knowledge Graph Extraction via LLMs, MDPI Computers 15(3):178).

  · SALIENCE, NOT DISCOVERY — the index already knows every symbol the unit defines; the model's only job is
    WHICH definition is NON-OBVIOUS and worth recording as knowledge (the symbol a reader would not already
    expect to live here). This is the harness's obviousness intent (ADR-0012), applied at selection time.

  · SCOPE IS NOT ASKED — the definition witness ranges over the unit's own directory, which Atlas derives from
    the mined unit's path. Asking the model for a directory only adds error (a guessed scope was pure error).

  · ABSTENTION IS A TOKEN — [#201/#202] emit `NO-FACT` when the candidate list is empty or no definition is
    non-obvious. `llm.ts` maps that token (case-insensitive, whole-answer) to the GEN-12 model-abstained outcome.
    Abstaining is correct, never a failure.

  · ONE LINE, A CLOSED GRAMMAR, NO REASONING — GEN-4d/GEN-12: no self-declaration, no persisted chain-of-thought.
    The output is ONE line `DEFINES: <name>` where `<name>` is copied VERBATIM from the candidate list, OR the
    token `NO-FACT`. A `<name>` not in the list, or any other shape, is unparseable and abstains (never a
    fabricated fact). COUPLED to `makeDefinitionClaimParser` (llm.ts); pinned by test.
-->

You are shown ONE anchored unit from a real codebase, and a CLOSED LIST of the global symbols THIS unit DEFINES
(resolved from the code index — every name below is a real definition in this unit).

<unit path="{{PATH}}" name="{{UNIT}}">
{{SOURCE}}
</unit>

Defined symbols (the closed list — select ONLY from these): {{CANDIDATES}}

From that list, pick the ONE definition whose presence in this unit a competent engineer would NOT already expect
from the unit's name and role — the symbol whose "defined here" status is worth recording as knowledge.

- The name you output MUST be copied VERBATIM from the candidate list above. Do not name anything else.
- Restating the obvious definition (the symbol the unit plainly exists to provide) is not worth recording. Pick
  the non-obvious one.
- If the candidate list is empty, or none of its entries is a non-obvious definition worth recording, output the
  single token `NO-FACT` and nothing else. That is a correct, expected abstention, never a failure.

Output EITHER exactly one line `DEFINES: <name>` (with `<name>` copied verbatim from the list), OR the single
token `NO-FACT`. No preamble, no reasoning, no confidence, no formatting.
