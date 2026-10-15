# The property-set template — driftless ∀-laws (S3 sibling, for FULL-assurance PBT)

> **status:** v1 · **owner:** orchestrator · **state:** S3-sibling (rendered from the frozen S2 method-tags) ·
> **consumed by:** the execution GATE's PBT leg ([`EXECUTION-PROTOCOL.md`](../EXECUTION-PROTOCOL.md#assurance-levels)).
>
> A `properties-<module>.md` renders the **already-frozen S2 method-tags** (`requirements/method-tags-<mod>.md`,
> the `up-property` law of each behavioural INV) into **runnable ∀-quantified properties** — the oracle-free
> beyond-the-witness check that raises a WP from FLOOR toward FULL assurance. It **invents no law**: every
> property is a faithful render of a frozen `up-property`, carried as a `ptr+digest` so an upstream edit
> renders the property STALE (same driftless discipline as the goldens and the WP-cards).

## Why this exists (the honest reconciliation)

The S2 method-tags' `down-model`/`anti-rot` name `packages/<pkg>/ref/*.ts` as "the reference mock,
differential-tested." The **scaffold-freeze** deliberately froze those `ref/*.ts` as **pure-type interfaces
(zero runtime)** — so there is no executable reference to differentially test against. This artifact closes
that gap the honest way: each `up-property` law is asserted **directly on the implementation** over generated
inputs (property-based testing), which is the recognized oracle-free alternative to differential testing. The
GATE's `differential` leg therefore stays **UNAVAILABLE** (no reference impl) and is **subsumed** by this PBT
leg — not faked. PBT (frozen properties) + mutation + the single witness = the beyond-FLOOR assurance.

## The property card (one per rendered law)

```
### PROP-<MODULE>-<n> — <law short-name>
inv:         INV-<MODULE>-<n>                              # the behavioural invariant this renders
source:      ../requirements/method-tags-<mod>.md#INV-<MODULE>-<n>   # ptr+digest — the frozen up-property law
law:         ∀ <vars> ∈ <domain>. <the property, in the fspec-merge runnable idiom>   # e.g. merge(x,y) ≡ merge(y,x)
arbitrary:   <the generator(s) for the ∀-quantified inputs — the fast-check/Hypothesis arbitraries to author>
covers_reqs: [ REQ-<MODULE>-… ]                            # the REQ(s) whose behaviour this law checks   # ptr+digest
witness:     [ SCN-<MODULE>-… ]                            # the frozen golden(s) that are concrete instances of this law (may be empty)
teeth:       breaks-on "<the mutant / violation this property kills that the single witness cannot>"
```

- **`source` is the one authored pointer** — the property text is a render of the frozen `up-property`, never a
  new claim. If the render needs a decision the method-tag didn't fix → **STOP** (NEEDS RECONCILIATION), never invent.
- **`law`** uses the frozen fspec idiom where one exists (`fspec-merge.md` already carries commutative /
  associative / idempotent / convergence / round-trip in runnable form); else transcribe the `up-property`
  prose into the same `∀ … . lhs ≡ rhs` / `∀ … . predicate` shape.
- **`arbitrary`** names the generator to build (the real code effort); it is a spec, not runtime, at this stage.
- **`witness`** links the ≥0 existing `gen: PBT`/property-flavored goldens that instance this law (the 126-SCN
  seed) — the property generalizes them; it must not contradict any.
- **`teeth`** states what a mutant this property kills that the lone witness golden cannot (the reason the
  property adds assurance beyond FLOOR).

## Completeness (the set-level gate)

- **Every behavioural INV renders to ≥1 PROP** — the property set is a total function over the module's
  behavioural invariants (0 uncovered, 0 invented-without-INV).
- **Every `gen: PBT` / property-flavored golden's cited law appears** as a PROP (the seed is subsumed, not lost).
- **Formal-cluster laws** (KERNEL-9/10/11 + PERSIST-11 — already in `fspec-merge.md` fast-check form) are
  transcribed verbatim from the fspec, not re-derived.

## Self-check (per file, before freeze)

- [ ] one `properties-<module>.md`, one PROP block per rendered law, every block conforming to the card above?
- [ ] every behavioural INV in the module → ≥1 PROP (mechanical count against `method-tags-<mod>.md`)?
- [ ] every PROP's `source` a `ptr+digest` to a frozen `up-property` (no invented law; no prose copy of code)?
- [ ] every `law` in the `∀ … . predicate` runnable idiom; formal-cluster laws verbatim from `fspec-merge.md`?
- [ ] every property-flavored golden's law present; no PROP contradicts its `witness`?
- [ ] `teeth` states a mutant the property kills beyond the single witness?
