<!--
ADR-0011 Decision 3 — the S2 proposal prompt. This file IS the artifact: it ships as written, it is hashed
into the run's provenance, and an operator override is recorded rather than silent.

Every clause below is traceable. HTML comments are stripped before the text reaches the model, so the
justification travels with the prompt without being sent to it.

  · ANCHOR AS A CLOSED VOCABULARY — the unit is named as a constraint, not offered as context. Presenting
    discovered anchors as a closed vocabulary and demanding grounding per element is the anchor-constrained
    extraction result (Grounded Knowledge Graph Extraction via LLMs, MDPI Computers 15(3):178).
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
  · CODE-DERIVABLE, NOT A COMMENT ABOUT ELSEWHERE — the #95 pilot (2026-08-19, right-way apparatus: model =
    sub-agents, no oracle) measured the residual #201 mode on the comment-heavy top-frontier: even with
    "distrust stale comments", the model surfaced ACCURATE comments' claims about OTHER files / task numbers /
    past-state / codebase-wide absences and the grounding gate admitted them as justified — because the
    comment IS in the bytes (aboutness), but such a fact does NOT re-derive at THIS unit@sha (it is anchored
    where it will silently rot). Blind adjudication: 9/15 facts were this mode (self-verifiable precision 40%).
    This clause makes the refutation explicit — the fact must be checkable by reading the CODE of this unit,
    not by trusting a comment about code not shown. Re-measured on the same 15 sites: comment-restatement
    9 → 0, self-verifiable precision 40% → 73%, with 4 honest abstentions replacing the worst offenders.
    (Known residual it opened: on barrel files the model may over-reach on an exact export COUNT — a separate
    follow-up, tracked; the qualitative claim stays correct.)
  · NO UNVERIFIED COUNT OR ENUMERATION — the #95 v2 re-run's residual: pushed to code-derived facts, the
    model kept the qualitative core right on barrel files ("only types.js is `export type *`") but appended
    a WRONG exact count ("14 re-exports" vs 22) or mislabelled a named `export {…}` as `export *` — blind
    adjudication counted 3/11 emitted as FALSE for the numeric clause alone. The clause below steers to the
    qualitative form and requires a count to be actually counted+rechecked in the bytes, closing the one
    sub-mode the code-derived clause opened without re-introducing #201.
-->

You are shown ONE anchored unit from a real codebase, and nothing else.

<unit path="{{PATH}}" name="{{UNIT}}">
{{SOURCE}}
</unit>

State ONE fact about this unit that a competent engineer would NOT already know from its name and
signature, and that would change what they do. Work in two steps.

STEP 1 — REASON FREELY (scratch, never stored). Read the bytes closely. Draft a candidate fact, then actively
try to REFUTE it against the source:

- Is it derivable from THESE bytes, or are you leaning on what you know about a library, framework or
  convention that is not visible here — or on a stale/past-tense COMMENT the current code may contradict?
- Does the fact's truth rest on a COMMENT'S CLAIM about something NOT in these bytes — another file or
  module, a task/PR/issue number (like #123), what the code "used to" do, or the absence of something
  elsewhere in the codebase? If so, discard it: even an ACCURATE comment about elsewhere is a fact about
  THAT code, not this unit, and does not re-derive at THIS unit's bytes. The surviving fact must be
  checkable by reading the CODE in this unit itself — its declarations, control flow, types, or literals —
  not by trusting what a comment asserts about code you cannot see here.
- Does the claim assert an EXACT COUNT or an EXHAUSTIVE enumeration ("N of the M items", "every X except
  Y", "all fourteen …")? A number or a complete list is admissible ONLY if you actually counted or listed
  it in the shown bytes and re-checked it item by item — a miscount or a mislabelled item makes an
  otherwise-true fact FALSE. Prefer the qualitative form ("only X uses the type-only form, unlike its
  siblings") over a numeric one ("N of the M re-exports …") unless the exact number is itself the point and
  you have verified it against the bytes.
- Is it more than a restatement of the name, the signature or the types, or a summary of what the code
  plainly does?
  Discard any candidate that does not survive. This reasoning is scratch: it is parsed away and never persisted.

STEP 2 — EMIT THE RESULT. If a fact survived, emit it as EXACTLY ONE fenced block tagged `atlas-fact`, holding
a JSON object with a single `claim` field — one sentence of plain prose, derivable from the CODE bytes above
(checkable by reading this unit itself, not from a comment's claim about code you cannot see here):

```atlas-fact
{"claim": "<the one surviving fact>"}
```

Emit exactly ONE such block, and put NO fenced block anywhere in your reasoning — only the final fact is fenced.

If no such fact survives, emit NO fact block at all (a bare `NO-FACT` on its own line is also accepted). Most
units hold none. That is a correct, expected result — recorded as a deliberate abstention, never a failure. A
fact the bytes do not contain cannot be re-derived at source@sha and MUST NOT be emitted.
