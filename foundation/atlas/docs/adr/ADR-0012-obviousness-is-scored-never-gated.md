# ADR-0012 — obviousness is scored, never gated

- **Status:** Proposed (2026-08-03). The _principle_ was ratified by the owner on 2026-08-02. The **blast
  radius was not** — see §"What the owner still has to ratify". This ADR is written so the owner ratifies a
  measured scope rather than a summary.
- **Spec author:** lead, grounded against master `67ccc31`.
- **Resolves:** the standing contradiction between `INV-GEN-4` and `INV-GEN-16`. This is an **amendment**,
  not a selection between two existing texts: the contradiction was a decision that had never been made, so
  neither text can "win" without inventing the missing half.
- **Amends (ratified surfaces):** `INV-GEN-4`, `INV-GROUND-7`, `PROP-GEN-4` (`law`, `teeth`, `arbitrary`).
- **Corrects (not an amendment — a misattribution):** `packages/knowledge/src/write/router.ts:47`.
- **Does NOT amend:** `INV-KNOW-2`, `INV-GEN-16`, `KNOW-17`. Why each is untouched is stated below, because
  "it survives" is a claim that has to be defended, not assumed.

## Context — the contradiction, quoted rather than paraphrased

Two ratified invariants give opposite answers to the same question, and **both are implemented**.

**`INV-GEN-4`** (`method-tags-gen.md:37`) puts the door at admission:

> "grounded from birth: every seeded fact is grounded by `subtreeHash` and clears the 2-door bar at
> `atlas-emit`; an ungrounded/**obvious** seed is **rejected** (`emitted:false`)"

**`INV-GEN-16`** (`method-tags-gen.md:121`) says the judgment cannot be made at that moment:

> "usefulness graded a-posteriori … genesis seeds **loose-but-thin**"

and its own Refuse-to-model section (`method-tags-gen.md:150`) states the reason as a flat impossibility:

> "**usefulness a-priori**: no mechanism can prove a seed useful at write-time (GEN-16)"

The same split is live in the source. `packages/genesis/src/admit-harness.ts:164` **rejects**:

```ts
if (!deps.doors.nonObvious(p.claimNorm)) return { outcome: "dropped", reason: DROP_OBVIOUS }
```

while `packages/genesis/src/usefulness.ts:52` **admits** — `seedGate`'s only mechanical input is `grounded`,
and `self_score`/`importance` are present on the candidate _specifically so the gate can be witnessed
ignoring them_.

**Neither is wired to the shipped `mine` path.** `packages/cli/src/mine.ts:206` falls back to `defaultGate()`,
which abstains at every site. So the contradiction has never had to resolve itself at runtime — which is
exactly why it survived to be found now, and why closing it is a precondition for the first real run rather
than a tidy-up after one.

### It is not a GEN-local contradiction

The obviousness-as-gate claim also carries a **second ratified invariant in a different layer**.
`INV-GROUND-7` (`method-tags-grd.md:88`):

> "two-door admission … the usefulness door (actionable ∧ non-obvious); **a true-but-obvious fact is
> rejected**"

restated in code at `packages/grounding/src/emit-guard.ts:29`: _"A true-but-obvious fact is noise and MUST be
rejected."_

A third site _appears_ to be a third invariant and is not. `packages/knowledge/src/write/router.ts:47` reads:

> `REJECT` — fails the 2-door bar (ungrounded, **or obvious/useless**) — KNOW-2.

`INV-KNOW-2` says no such thing. Its up-property is _"a fact with no resolvable grounding (0 entries, or any
empty `subtreeHash`) is rejected"_ — grounding only, no usefulness clause anywhere in it. The comment
attributes to KNOW-2 an authority KNOW-2 does not carry. That is a **misattribution to correct**, not an
invariant to amend, and separating the two is the difference between amending two ratified surfaces and
three.

Measured spread: **35 doc files** and **~14 source modules** mention the two-door bar or non-obviousness.
Most are downstream restatements; the normative statements are the ones named above.

## Decision

**Nothing is ever rejected for being obvious. Obviousness becomes a stored, auditable dimension of rank.**

1. **The score is a-priori.** It is computed at **mine time**, over the source bytes, by the harness's own
   predicate.
2. **The decision is a-posteriori.** It is made at **retrieval**, where it is re-tunable for free and where
   it is _relational_ — obviousness is relative to what the reader already knows, which is not knowable until
   the graph is assembled.
3. **The rejection line moves to harm.** A write is refused only when **storing is itself the harm** —
   secrets, PII. That door stays hard and fail-closed. Everything merely low-value is stored with a score.

### Why — a gate destroys the evidence needed to audit the gate

A rejected candidate leaves no record. There is no counterfactual, so the filter's own accuracy can never be
measured: you cannot count the good facts it discarded, because discarding them is what it did. A stored
score is auditable after the fact and re-thresholdable at zero cost.

Atlas's stated goal is an **honest benchmark**. An unauditable admission filter sitting upstream of the
thing being measured is a hole in the instrument, not a feature of it.

The supporting asymmetry is one-directional and decides the close cases: a bad fact **admitted** costs
retrieval precision and is **recoverable at ranking**; a good fact **rejected** costs the entire model call
that produced it and is **irrecoverable without re-mining**.

### Why the obvious answer was wrong — recorded because it was the lead's own

The tempting resolution was _"admit everything; the obvious decays because nobody uses it."_ That is
**decay by usage**, and it does not work here.

Genesis builds the **entire graph before any usage exists**. On a cold graph every fact has zero hits, so
hits-decay is a no-op and a trivial fact ranks **identically** to a brilliant one — at precisely the moment
the system is being built for. The scoring leg therefore **cannot** be usage-derived. It has to be produced
at mine time, which is the one moment the source bytes and the model are both in hand.

## What survives, and why each claim is defensible

**Both implementations survive.** `TwoDoorBar.nonObvious` keeps its **predicate** — it is the part that knows
how to judge obviousness — and loses only its **authority to reject**. `seedGate` becomes the **consumer** of
the score. An earlier lead note said `nonObvious` dies; that was wrong and is corrected here.

**`INV-GEN-16`'s no-self-assessment clause survives intact, and this is the clause most at risk of being
read away.** "Scored at mine time, when the model is in hand" must **not** be read as "ask the model how
non-obvious its own claim is." The score is computed by the **harness's predicate over the source bytes**,
never read off a field the proposer wrote. ADR-0011 already makes this structural rather than instructed:
`Candidate.signals` is deliberately not passed into the prompt, so the model cannot self-score even if asked
to. `seedGate`'s existing witness — `self_score`/`importance` present and provably unread — stays valid and
stays required.

**`KNOW-17` hits-decay survives, and is not replaced.** The two compose along the graph's lifetime:

- the a-priori score is the **cold-start prior** — the only ranking signal that exists at genesis;
- hits-decay is the **warm update** — the only signal that reflects what readers actually consulted.

Neither subsumes the other, and the failure mode of each is exactly the other's strength.

**`INV-KNOW-2` is untouched** — it is a grounding invariant and always was. Only the comment that
over-attributed to it changes.

## The amended normative clauses

### `INV-GEN-4` — grounded from birth

> "grounded from birth: every seeded fact is grounded by `subtreeHash` and clears the **truth door** at
> `atlas-emit`; an **ungrounded** seed is rejected (`emitted:false`); no seed self-declares true. Obviousness
> **never** rejects — every emitted seed carries a mechanically-computed **obviousness score**, and the score
> is **total**: an emitted fact without one is a defect, not a default."

### `INV-GROUND-7` — admission, and the score

> "admission: `admit(fact)` is true iff it passes the truth door (grounding re-checks FRESH, GROUND-4) **and**
> is not **harmful to store** (a secret / PII — the one class where storing IS the harm). The usefulness
> judgment `actionable ∧ non-obvious` is **computed and stored as a score**, never a veto; a true-but-obvious
> fact is **admitted with a low score**, and the ranking decision is taken a-posteriori at retrieval."

### `PROP-GEN-4` — the law, and the teeth that must change with it

The law was:

```
∀ seed s. emitted(s) ⟺ ( rederives(s.citation, source@sha) ∧ nonObvious(s) ) ∧ emitted(s) ⊥ s.self_asserted
```

and becomes two laws, because the amendment splits one decision into an admission and a measurement:

```
∀ seed s. emitted(s) ⟺ ( rederives(s.citation, source@sha) ∧ ¬harmfulToStore(s) ) ∧ emitted(s) ⊥ s.self_asserted
∀ seed s. emitted(s) ⟹ hasScore(s.obviousness)                    [TOTALITY — no emitted fact lacks a score]
```

**`teeth` must be rewritten, and this is not cosmetic.** It currently names _"an inverted non-obviousness
door"_ as a mutant that must break the build. Under this amendment **there is no door**, so that clause would
point at code that no longer exists — creating precisely the defect already tracked as task #151 (_"TEETH
comments name mutations that no longer exist in the code they point at"_). Adding a third instance while
amending the constitution would be indefensible. The new teeth:

> breaks-on "a **resurrected obviousness gate** (any path where an obvious seed yields `emitted:false`), a
> **scoreless emitted fact** (totality violated), a downgraded truth door (an ungrounded seed emits), or a
> `self_asserted`-sufficient gate."

**`arbitrary` keeps its 2×2×2 grid** — grounded/ungrounded × obvious/non-obvious × `self_asserted` — but the
obvious/non-obvious axis **stops discriminating `emitted` and starts discriminating the score**. Stating this
is load-bearing: a generator whose axis no longer discriminates anything is the vacuous-test class this repo
has already found five times (task #114). The axis must be re-pointed, not retired.

## What this ADR does NOT close

- **The predicate itself.** `nonObvious` has no finite mechanical oracle — `method-tags-grd.md:142` refuses to
  model it and that refusal stands. This ADR decides what the verdict _is for_ (a score, not a veto); it does
  not claim to have made the verdict mechanical. The score's calibration is measurable only once facts exist
  with scores attached — which is the point of storing them.
- **The threshold at retrieval.** Where the score enters ranking, and with what weight, is a retrieval
  decision on real data. Pinning a constant here would be inventing a number, which ADR-0011's Decision-4
  discipline forbids.
- **`harmfulToStore`.** Named as the surviving hard door; its predicate is the credential-scrub family
  already shipped. Whether that is the _complete_ definition of harm is not settled here.
- **The wiring.** ~~`makeAdmitGate` has zero production callers and `mine` falls back to a gate that abstains
  at every site, so no admission path — old or new — currently runs in the shipped binary. That is tracked
  separately and is a precondition for the first genesis run.~~
  **CLOSED 2026-08-03** by `REQ-CLI-4d` / `WP-SEEDGATE.COMPOSE`: the composition root now supplies the gate
  (`compose-mine-admission.ts` → `mine-gate.ts`), `makeAdmitGate` has its first production caller, and the
  precondition named here is met. Struck rather than deleted — the record of what was open when this ADR was
  ratified is part of what the ADR is for. What did NOT change: the score is still never a veto, and
  `nonObvious` still has no mechanical oracle, so the supply pins it and the stored rank carries no
  information yet. That remainder is below, not here.

## What the owner still has to ratify

The ratification on 2026-08-02 named `GEN-4` and `GEN-16`. The measurement above found the same claim in
**`INV-GROUND-7`**, a separately ratified invariant in a different layer.

**Lead recommendation: amend both.** A principle ratified in one layer and left contradicted in another is
not ratified — it has been relocated, and the next reader inherits the same contradiction one layer down.
The precedent for surfacing this rather than widening quietly is task #128, where three ratified invariants
were amended and the escalation was owed.

The narrowing is worth stating too, since it cuts the other way: the initial reading counted **three**
ratified invariants. Measurement showed the third was a code comment misattributing to `INV-KNOW-2`. Two
surfaces need the owner; the third needs a correction.
