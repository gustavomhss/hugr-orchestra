# Orchestra Docs — Architecture (how we document)

> **Status:** frozen contract v1. Every doc in this repo follows it. This is the SOTA doc architecture:
> **Diátaxis × docs-as-code (co-located) × grounded (docs dogfood the Atlas).**

The lazy way is to split one big spec into topic files. That is a table of contents, not an architecture.
Orchestra documents itself the way the Atlas stores knowledge: by _reader need_, _co-located with the
code_, and _grounded so it can't drift_.

## The three axes

**1. Diátaxis — organize by reader NEED, never mix modes in one file** ([diataxis.fr](https://diataxis.fr/)):
| Mode | Answers | Voice | Lives in |
|---|---|---|---|
| **explanation/** | _why?_ — concepts, rationale, trade-offs | narrative | `docs/explanation/` |
| **reference/** | _what exactly?_ — types, invariants, caps, API | dry, complete, no story | co-located per crate |
| **how-to/** | _how do I X?_ — numbered steps for one task | imperative | `docs/how-to/` |
| **tutorial/** | _teach me_ — one guided end-to-end run | second person | `docs/tutorial/` |

A file is exactly **one** mode. Reference never explains; explanation never lists API. Mixing modes is the
#1 anti-pattern Diátaxis exists to kill.

**2. Docs-as-code — reference is CO-LOCATED and PR'd with the code** ([docs-as-code](https://deepdocs.dev/docs-as-code/)):
Reference for a crate lives **inside that crate** (`packages/<crate>/REFERENCE.md`), reviewed in the _same
PR_ as the code, so it evolves with it and can't drift. **Until a crate exists**, its reference stages at
`docs/reference/<crate>.md`, named 1:1 to the future crate, and migrates in when the crate lands.

**3. Grounded — the docs dogfood the Atlas.** Every reference claim about code carries a grounding ref
(`path@subtreeHash`) and is **drift-checked in CI** (rosie's job, applied to our own docs). The reference
layer is an _Atlas of the docs_: a claim whose code moved out from under it is flagged, exactly like a
knowledge fact. **Docs can't lie either.**

## Ownership — CODEOWNERS, by class

Each crate's docs are **owned** by that crate's class member (write = owner, read = universal) — mirroring
the Atlas's own owner+scope model. A `CODEOWNERS` file binds each `packages/atlas-*/` to its owner.

## No god-docs

Each file is **≤ ~250 lines** (tighter than the ≤400-LOC code bar, because prose bloats). Split by crate,
never by dumping. If a reference file exceeds this, the crate is too big.

## Invariants: one law, stated once

A cross-cutting guarantee is stated **exactly once** — in the spec `A-*` list (`spec/atlas.md` §4; Memory's
`M-*` in `spec/memory.md`). A `reference/atlas-*.md` invariant MUST NOT re-state that law. It either:

- **adds crate-specific mechanism** — the _how_: a threshold, an algorithm, a data structure, an enforcement
  point — **and cites its `A-n` axiom** (a `Spec` column entry, or an inline `(A-n)`); or
- is a **pure restatement**, which is **not allowed** — collapse it to a one-line citation
  `→ see spec A-n; enforced in <crate>`, keeping its ID + one-line title (never renumber).

Rule of thumb: if you can delete a reference invariant's body and lose no _mechanism_, it was a duplicate —
cite instead. This keeps each law syncable in one place; the `M-*`→`MEM-*` renumber rot is the exact failure
it prevents.

## The templates (fixed skeletons — fill, don't free-form)

**`reference/<crate>.md`**

```
# <crate> — Reference
> owner: <member> · grounding: <how these claims are checked> · status: draft
## Purpose            (1–2 lines: what this crate is)
## Data model         (the shapes/types, dry)
## Invariants         (MUST / MUST NOT, each id'd: <CRATE>-N)
## Surface / API      (functions/tools, signatures)
## Acceptance         (falsifiable checks, one per invariant)
```

**`explanation/<topic>.md`**

```
# <topic>
## The idea           (one paragraph)
## Why it's this way  (rationale + the failure it avoids)
## Trade-offs         (honest)
## Where it fits      (links INTO the reference — never restates it)
```

**`how-to/<task>.md`** — prereqs · numbered steps · how to verify. One task only.

**`tutorial/<name>.md`** — one guided run, start to finish, learner does it.

## The map

`docs/README.md` is the thin, navigable spine — links every mode + every crate reference. Generated/curated
by the lead; agents don't touch it.

## Layout

```
docs/
  README.md            ← the map (lead owns)
  CONVENTIONS.md       ← this contract
  explanation/         ← WHY, cross-cutting
  how-to/              ← TASK guides
  tutorial/            ← guided runs
  reference/           ← staged per-crate reference (migrates into packages/<crate>/ when it lands)
packages/atlas-*/REFERENCE.md   ← the eventual co-located home + CODEOWNERS
```
