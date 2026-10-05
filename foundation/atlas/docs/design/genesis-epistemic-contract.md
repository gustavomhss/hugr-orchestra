# Genesis epistemic contract — what the model may treat as true

> **The one law.** In genesis, a model may treat as true **only what it can justify and/or prove
> from the bytes in front of it.** Everything else it must **abstain** on (`NO-FACT`). Truth here is
> never "the model is confident", never "the model recalls this about the library", never "a signal
> suggests it". A fact with no grounds it carries is not a weak fact — it is **not a fact** and must
> not be emitted.

This document is the governing principle the whole genesis pipeline serves. `propose.md` (ADR-0020),
the grounding span (ADR-0011 Decision 3 / KNOW-15), and the state machine phases are all _mechanisms_
that enforce this one law. If any mechanism contradicts it, the mechanism is wrong.

## Two admissible grounds — and nothing else

A proposed fact is admissible on exactly one of two grounds. Both are things the fact **carries with
it**, so a reader (or a machine) can re-check without trusting the model.

1. **PROVEN** — a mechanically re-checkable witness exists, and the fact carries it. This is the
   narrow band where a deterministic procedure decides the claim: a type the type-checker confirms, a
   call that a symbol index shows is present. The witness is re-runnable; anyone gets the same answer.
   _This band is small, and — crucially — it is also the band the harness could have derived on its
   own._ A proven fact is honest but rarely the interesting one.

2. **JUSTIFIED** — no deterministic procedure decides the claim (it is semantic / about intent /
   about an assumption), but the model can **point to the exact bytes** that make it true and give a
   derivation a competent reader can follow to the same conclusion **and contest**. The justification
   (the grounding span into content-addressed bytes + the derivation from _these_ bytes) travels with
   the fact. Trust does not come from the model's authority — it comes from the fact being
   **traceable, re-readable, and refutable** against the source it names.

Anything that is neither provable nor justifiable from the shown bytes → **abstain**. This is the
common, expected, correct outcome for most units.

## Why there is no third option (the complementarity)

- If a fact is **deterministically verifiable**, it is deterministically **derivable** → the model
  is not needed to find it; enumerate it.
- If a fact **needs the model** to be found (it is not mechanically derivable), then **no
  deterministic checker is sound for it** — any mechanical check is a _structural proxy_ for a
  semantic claim, and "passes the proxy" never entails "the claim is true".

So the two sets — _needs-a-model_ and _mechanically-provable_ — are complementary. There is no
quadrant "needs a model AND a machine can prove it". Chasing a deterministic oracle to bless
model-proposed semantic facts is a category error: it can only ever re-derive the trivial band and
**reject the semantic facts that are the entire point.** A sound oracle used as the truth gate for
model facts is worthless and actively harmful — it filters _for_ uselessness.

The resolution is not a stronger oracle. It is shifting the **burden of proof onto the proposer**:
the model does the hard work (find the grounds), and admission checks that the grounds are _present
and honest_, never that a machine re-derived the claim.

## What "justify" is made of (so it is not "trust me")

The proposer protocol (`propose.md`, measured 100% precision / 0 hallucination vs the old 77.5%)
already encodes the justification discipline. Named explicitly, a justified fact requires all of:

- **Derivable from the shown bytes** — not from library knowledge, not from a stale/past-tense
  comment the current code may contradict. Atlas's whole claim is that a fact **re-derives at
  source@sha**; a fact the bytes do not contain cannot.
- **Self-refutation before emission** — the model reasons freely in a _scratch_ region (never
  persisted) and actively tries to **refute** its own candidate against the source; only a survivor
  is emitted. The model carries the burden of attacking its own claim first.
- **Grounded** — the emitted claim is anchored to a span in the content-addressed target bytes
  (KNOW-15), so the justification is a coordinate a reader can open, not a paraphrase.
- **Not a restated signature** — more than the name/type/what-the-code-plainly-does; scored by the
  harness over the bytes, **never** by the model's self-assessment (GEN-16 — no confidence field is
  asked for or read).
- **Abstention is a positive action** — emit `NO-FACT`, not silence, not prose. (Measured: "output
  nothing" never fired; a responsive model emits a prose refusal that a naive gate then admits as a
  fabricated fact. The token is the fix.)

## What the state machine does — and does not

The state machine is there to **enforce this protocol and seal the provenance**, not to run a truth
oracle. Its job:

- **Force the phases in order** — ANCHOR (name the unit as a closed vocabulary) → PROPOSE
  (reason-freely-and-refute → emit-one-block or `NO-FACT`) → ADMIT (record).
- **Freeze the prompt** — `propose.md` is hashed into the run's provenance; an operator override is
  recorded, never silent. The prompt is a committed artifact so the refusal _rate_ is a readable
  signal.
- **Keep reasoning scratch** — only the block's `claim` + its grounding is persisted; the free
  reasoning is parsed away and never stored as a fact.
- **Record who answered and over which bytes** — the fact is reproducible with respect to the model
  and the source@sha that produced it (#195/#210).

The state machine is a **passive** enforcer of _process_, not a judge of _truth_. That passivity is
correct here: for a model-proposed fact the teeth are the **protocol** (derive-or-abstain,
self-refute, ground) + provenance, not a deterministic hook. A verify hook that re-derives the claim
is the wrong mechanism and is removed from this path.

## The seal names its grounds — honestly

A stored fact carries **which ground admitted it**, and the two never blur:

- `proven` — reserved for the narrow mechanically-re-checkable band, carrying its re-runnable witness.
- `justified` (advisory / grounded) — the model's grounded, self-refuted, contestable assertion. It
  is **not** labeled "proven". Honesty is the label plus the grounding, not a false claim of proof.

Confidence in a `justified` fact is raised — never converted to "proof" — by _model-independent_
means: an independent-model ensemble agreeing, human ratification, and the fact surviving re-read at a
later sha. These lower the lie rate; they do not manufacture soundness, and they are never described
as if they did.

## Consequence (the cut this implies)

The deterministic **sound gate / symbol-reverse oracle as the truth gate for model-proposed facts**
is cut from the genesis flow: it can only bless the trivial band and reject the valuable one. What
survives is `PROPOSE` (the model proves its own claim by grounded self-refutation) + grounding +
provenance + a state machine that enforces the phases and seals — a smaller, more honest machine than
the one that carried the oracle.
