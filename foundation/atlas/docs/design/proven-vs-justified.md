# `proven` vs `justified` — how admit decides, from the evidence the model carries

Spike output (for ratification). Resolves F1 of `genesis-sound-arm-removal.md`: with `proven`
redefined as **model-suppliable** (the model can prove with a code excerpt / log, not only an oracle),
how does admit decide `proven` vs `justified` **mechanically, without re-deriving the semantic claim**?

## The problem it must not fall into

- It must NOT re-derive the claim (the contract's whole point: a model-needed fact is not
  machine-derivable).
- It must NOT read the model's self-assessment ("I proved this", a confidence field) — GEN-16.
- Yet it must let the model reach `proven` when it genuinely can (logs, code excerpts), not collapse
  `proven` back to the trivial oracle-only band.

## The rule — proof = a typed witness in a form the harness can check

A proof is **hard to find, easy to check**. Split the labour on that seam:

- **The model does the hard part**: find the evidence AND cast the claim into a _typed witness form_ —
  a shape whose truth is decidable over the cited bytes.
- **The harness does the easy part**: run that form's small, deterministic **checker** over the
  carried witness + the source bytes. It validates _the supplied witness_, it does not re-derive the
  fact.

Concretely, a fact may carry an optional **typed witness** drawn from a small **registry of decidable
witness forms**. Each form is a tiny mechanical checker binding a claim-shape to a check:

| witness form    | claim shape                               | the checker (deterministic, over cited bytes)                                                               |
| --------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `dependency`    | "code under S references global symbol T" | symbol index resolves T and a caller of T lies under S (the existing `verifyDependency`, now just one form) |
| `type`          | "X has type / never returns null / …"     | `tsc` confirms over the cited unit                                                                          |
| `throws-on`     | "F throws when C"                         | AST: the cited span is a `throw` reachable under guard C                                                    |
| `returns-const` | "F returns literal K"                     | AST: the cited return is literal K                                                                          |
| `log-emits`     | "path P logs L"                           | the cited span is a log call whose argument matches L                                                       |

On admit, per fact:

```
if fact carries a witness whose form is in the registry AND that form's checker PASSES over the bytes:
    seal = proven            # the witness entails the claim by a decidable checker the model supplied
elif fact is grounded (its cited span re-derives at source@sha):
    seal = justified         # grounded, self-refuted, contestable — but no decidable witness entails it
else:
    drop                     # no grounds at all
```

The oracle abstaining **never drops the fact** — it only means "no `proven` witness for this one", and
the fact still lands as `justified` if grounded. That is the exact inversion of the old sound gate.

## Why this is not the old sound gate (and not re-derivation)

- **Old**: the oracle re-derives the fact; abstain ⇒ **DROP**. Truth is gated on a machine agreeing.
- **New**: the model supplies a witness in a checkable form; the checker validates _that witness_;
  no witness ⇒ still admitted as `justified`. Admission is gated on **grounding**, and the **seal
  reflects proof-strength**, not admission.

The checker never judges free prose and never re-derives a semantic claim. `proven` is reachable
**only** when the claim is expressible in a typed witness form — which is the model's _choice and
work_, not a mandatory tollgate. Free-prose claims are first-class and simply land `justified`.

## What each seal honestly means to a reader

- **`proven`** — carries a typed witness a decidable checker confirmed; re-runnable; the strongest
  grounds. Narrow by nature (the registry is small), and often also machine-derivable — that is fine:
  `proven` is the honest floor, never the product's value claim.
- **`justified`** — grounded (span re-derives at source@sha), the model self-refuted it against the
  bytes, and it is stated as a contestable reading. This is where the _valuable_ semantic facts live.
  Confidence is raised — never converted to `proven` — by model-independent means (independent-model
  ensemble agreement, human ratification, survival on re-read); those are the `validated` lever, kept
  distinct from `proven`.

## What this reuses vs discards from the shipped code

- **Reuses (as form-checkers, not gates)**: `verifyDependency` / `verifyCount` / `type` oracle become
  entries in the witness-form registry — run to _award_ `proven`, never to _drop_. The witness /
  grounding carrier (`admit-harness.ts` witness legs, `reverify-store`) stays as the proof carrier.
- **Discards**: the mandatory `oracle !== 'proven' ⇒ drop` lines (`admit-harness.ts:256,271`), the
  closed-world negation door (F2), and `seal:'proven'`-means-"oracle-agreed" semantics.

## The one honest limit to state

The registry of witness forms is **small and grows one checker at a time**. Most valuable facts will
be `justified`, not `proven`, and that is correct — not a gap to paper over. Adding a witness form is
adding a real mechanical checker; it is never "let the model self-declare proof". The moment a
`proven` seal rests on anything the harness did not mechanically check, it is a lie and the seal is
wrong.
