<!--
ADR-0011 Decision 3 / #196c count slot — the S2 COUNT (cardinality) proposal prompt (candidate-grounded).
This file IS the artifact: it ships as written, it is hashed into the run's provenance, and an operator override
is recorded rather than silent. It is a SIBLING of `propose-dependency.md`, selected by the count mining arm
(`ATLAS_MINE_SLOT=count`); the advisory and dependency prompts are unchanged.

Every clause is traceable. HTML comments are stripped before the text reaches the model.

  · CANDIDATE-GROUNDED SELECTION — the fan-IN dual of the dependency arm. `{{CANDIDATES}}` is the closed list of
    THIS unit's exported symbol names that are referenced by ≥1 OTHER unit, computed mechanically
    (`UnitExportsApi.exportsWithCallersFor`, @atlas/index). The model may ONLY select from that list; the harness
    then derives the caller COUNT from the live index and the sound `verifyCount` oracle re-proves it. Presenting
    a closed vocabulary and demanding selection is the anchor-constrained extraction result (Grounded Knowledge
    Graph Extraction via LLMs, MDPI Computers 15(3):178).

  · THE MODEL NEVER EMITS THE NUMBER — this is the soundness hinge. The count is a WITNESSED lower bound the
    harness computes from the reverse-caller feed; a hallucinated number has no channel into the claim. The model
    only names WHICH export's fan-in is worth recording. A digit or `@` in the answer makes the line unparseable.

  · SALIENCE, NOT DISCOVERY — the index already knows which exports are widely referenced; the model's only job
    is WHICH one's fan-in is NON-OBVIOUS and worth recording as knowledge (a widely-depended-on symbol a reader
    would not expect to be a hub). This is the harness's obviousness intent (ADR-0012), applied at selection time.

  · SCOPE + COUNT ARE NOT ASKED — the count witness ranges over the callers' own scope, which Atlas derives from
    the live index (`resolveExportFor`, @atlas/index). Asking the model for a directory or a number only adds error.

  · ABSTENTION IS A TOKEN — [#201/#202] emit `NO-FACT` when the candidate list is empty or no export's fan-in is
    non-obvious. `llm.ts` maps that token (case-insensitive, whole-answer) to the GEN-12 model-abstained outcome.
    Most units export nothing whose fan-in is worth recording; abstaining is correct, never a failure.

  · ONE LINE, A CLOSED GRAMMAR, NO REASONING — GEN-4d/GEN-12: no self-declaration, no persisted chain-of-thought.
    The output is ONE line `COUNT: <name>` where `<name>` is copied VERBATIM from the candidate list, OR the token
    `NO-FACT`. A `<name>` not in the list, any number, or any other shape is unparseable and abstains (never a
    fabricated fact). COUPLED to `makeCountClaimParser` (llm.ts); pinned by test.
-->

You are shown ONE anchored unit from a real codebase, and a CLOSED LIST of the symbols THIS unit exports that are
referenced by OTHER units (resolved from the code index — every name below is a real, externally-called export of
this unit).

<unit path="{{PATH}}" name="{{UNIT}}">
{{SOURCE}}
</unit>

Externally-referenced exports (the closed list — select ONLY from these): {{CANDIDATES}}

From that list, pick the ONE export whose broad fan-in a competent engineer would NOT already expect from this
unit's name and role — the symbol that is quietly a hub, whose "referenced across the codebase" status is worth
recording as knowledge.

- The name you output MUST be copied VERBATIM from the candidate list above. Do not name anything else.
- Do NOT state a number. Atlas computes the caller count from the index; your job is only to pick the salient name.
- Restating an obvious hub (the export the unit plainly exists to provide) is not worth recording. Pick the
  non-obvious one.
- If the candidate list is empty, or none of its entries has a non-obvious fan-in worth recording, output the
  single token `NO-FACT` and nothing else. That is a correct, expected abstention, never a failure.

Output EITHER exactly one line `COUNT: <name>` (with `<name>` copied verbatim from the list), OR the single token
`NO-FACT`. No preamble, no reasoning, no number, no confidence, no formatting.
