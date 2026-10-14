---
name: ears
description: >
  Author an EARS requirement from a ratified design invariant. The deterministic protocol for state S1
  of the decomposition method: the generic ruleset, the six patterns + a selection decision tree, the
  brownfield INV→REQ procedure (project & quote, never paraphrase/invent), and the eight anti-pattern
  rejection gate. Invoke whenever turning an invariant into a requirement.
---

# /ears — Easy Approach to Requirements Syntax (authoring protocol)

> **Authority:** Mavin, Wilkinson, Harwood, Novak, "Easy Approach to Requirements Syntax (EARS)," IEEE RE'09
> (DOI 10.1109/RE.2009.9), and the official ruleset at alistairmavin.com/ears. Everything here is that
> method made procedural — nothing is invented. EARS is **used by** NASA, Airbus, Intel, Bosch, Rolls-Royce.

## Scope — what EARS does and does NOT do

EARS gently constrains a natural-language requirement into a fixed grammar so it is **atomic, unambiguous,
and testable**. It exists to kill the eight NL defects in §5.

It does **NOT** solve traceability or contradictory requirements — the RE'09 paper explicitly scopes those
out as "not unique to NL." Those are the **reconciler gate's** job, not the syntax. Do not expect EARS to
catch a coverage hole or a conflict; expect it to make each sentence well-formed.

## 1. The generic ruleset (the invariant of every EARS sentence)

A well-formed EARS requirement has **zero-or-many preconditions · zero-or-one trigger · one system name ·
one-or-many responses**, with clauses in this fixed temporal order:

```
[While <precondition>,] [When <trigger>,] the <system> shall <response>.
```

- Exactly **one `shall`**. Two responses joined by "and/or" that are _independent_ guarantees ⇒ **split**.
- `<system>` is a **named actor** ("the kernel", "the grounding gate") — never a bare "it"/"the system".
- Clauses never reorder: precondition before trigger before system before response.

## 2. The six patterns + selection decision tree

| #   | pattern            | template                                                   | use when                                             |
| --- | ------------------ | ---------------------------------------------------------- | ---------------------------------------------------- |
| 1   | Ubiquitous         | `The <sys> shall <resp>.`                                  | always active — no precondition, no trigger          |
| 2   | State-driven       | `While <precond>, the <sys> shall <resp>.`                 | active only during a persisting state                |
| 3   | Event-driven       | `When <trigger>, the <sys> shall <resp>.`                  | a response to a discrete event / detected input      |
| 4   | Unwanted-behaviour | `If <trigger>, then the <sys> shall <resp>.`               | a guard against an error / abuse / illegal condition |
| 5   | Optional-feature   | `Where <feature is present>, the <sys> shall <resp>.`      | only when an opt-in feature is included              |
| 6   | Complex            | `While <precond>, When <trigger>, the <sys> shall <resp>.` | a precondition **and** a trigger are both needed     |

**Selection tree (deterministic — take the first that matches):**

1. Is it a guard against something illegal/unwanted? → **Unwanted-behaviour (If-then)**.
2. Does it hold only when an optional feature is included? → **Optional (Where)**.
3. Does it need a precondition **and** a trigger together? → **Complex**.
4. Is it triggered by a discrete event? → **Event-driven (When)**.
5. Is it bound to a persisting state? → **State-driven (While)**.
6. Otherwise it is always-true → **Ubiquitous**.

## 3. INV → REQ procedure (brownfield: project & quote, never invent)

Our design already exists; a requirement **recovers** an invariant, it does not expand a prompt. So:

1. **Read** the invariant's normative clause in the frozen reference doc.
2. **Classify** its behavioural nature (property / state / event / guard) → pick the pattern via the §2 tree.
3. **Extract** precondition / trigger / response from the clause. `<system>` = the owning module's actor.
4. **Write** exactly one EARS sentence, one `shall`.
5. **Quote** the load-bearing clause verbatim in `normative-clause:` — **never paraphrase** (a paraphrase is
   "spec-echo": a second, silently-drifting copy of the fact).
6. **Silence/contradiction** in the design ⇒ emit `[NEEDS RECONCILIATION: <the gap>]` → route as a **design
   defect** to ratification. Never invent the answer; never ask the end-user (brownfield inverts greenfield's
   `[NEEDS CLARIFICATION]`).
7. **Bundled guarantees:** if the invariant asserts ≥2 independent guarantees, **split** into one REQ per
   guarantee (suffix the id: `-a`, `-b`).
8. Run the §5 anti-pattern gate, then the `atom-gate` (ISO 29148) protocol.

**ID scheme (consistent — the derived view carries the invariant's id):** an invariant `INV-<MODULE>-<n>`
(full module token: KERNEL, GROUND, INDEX, KNOW, MEM, RETR, PERSIST, TOOLS, GEN) projects to `REQ-<MODULE>-<n>`
(same module + number; add `-a/-b` when one INV splits). Goldens key off the REQ: `SCN-<MODULE>-<n>[c]-<k>`.

**Split-suffix separator — mandatory hyphen when the INV number is letter-suffixed.** The split suffix is
`-a/-b` with a **hyphen** (`REQ-KERNEL-10-a`). A glued suffix (`REQ-KERNEL-10a`) is tolerated **only** in a
module with no letter-suffixed invariant. When the block contains sibling invariants whose numbers already end
in a letter — e.g. `INV-PERSIST-10`, `-10a`, `-10b`, or `INV-TOOLS-11`, `-11a` — the glued form **collides**:
`REQ-TOOLS-11a` (the split of INV-11) is a byte-prefix of the `REQ-TOOLS-11a-a` family (the splits of INV-11a),
which the golden key `SCN-<MODULE>-<n>[c]-<k>` (one `[c]` letter only) cannot encode unambiguously. Rule: **in
any block with a letter-suffixed invariant, every split — including the base-number INV's — uses the hyphen**,
so `REQ-TOOLS-11-a` (INV-11) stays distinct from `REQ-TOOLS-11a-a` (INV-11a). Prefer the hyphen everywhere for
uniformity.

## 4. Output shape

```
### REQ-KERNEL-10a — collision resolves by set-union
source: INV-KERNEL-10 @ reference/atlas-kernel.md#kernel-10
When two or more events fold onto the same nodeKey,
  the kernel shall resolve them order-independently by set-union into one node.
normative-clause: "When ≥2 events fold onto the same `nodeKey`, the fold MUST resolve them **order-independently by set-union**"
```

## 5. The eight anti-pattern rejection gate (reject-and-fix; RE'09 §III)

Reject the REQ if it shows any of these; fix before it leaves S1:

1. **Ambiguity** — lexical / referential / syntactic (which "it"? which "record"?).
2. **Vagueness** — "fast", "robust", "appropriate", "~N" — no measurable criterion.
3. **Complexity** — compound / interrelated sub-clauses → split (this is the source of most `shall`-count violations).
4. **Omission** — a missing requirement, **especially an unhandled unwanted-behaviour path**. For each invariant
   ask: _what event would violate it?_ That guard is a required `If-then` REQ. (This is the pattern the RE'09
   paper most warns you to enumerate.)
5. **Duplication** — the same need restated elsewhere.
6. **Wordiness** — words that carry no constraint.
7. **Inappropriate implementation** — states HOW, not WHAT. **Brownfield exception:** a mechanism that the
   invariant already made normative is a _ratified decision_, not an implementation leak — it stays.
8. **Untestability** — cannot be proven true/false once built ⇒ you cannot write its golden ⇒ reject.

## 6. Worked examples (real Atlas invariants)

**Ubiquitous** — INV-KERNEL-1 (content-addressed identity):

```
### REQ-KERNEL-1a — content-addressed object identity
source: INV-KERNEL-1 @ reference/atlas-kernel.md#kernel-1
The kernel shall compute every object's id as Encoder.hash(canonicalForm(object)).
normative-clause: "An object's id MUST be `Encoder.hash(canonicalForm(object))`"
```

**Event-driven + its Unwanted-behaviour guard (one INV → two REQs, the split + omission-catch)** —
INV-KERNEL-10 (set-union collision; contentHash tie-break):

```
### REQ-KERNEL-10a — collision resolves by set-union
source: INV-KERNEL-10 @ reference/atlas-kernel.md#kernel-10
When two or more events fold onto the same nodeKey,
  the kernel shall resolve them order-independently by set-union into one node.
normative-clause: "the fold MUST resolve them **order-independently by set-union**"

### REQ-KERNEL-10b — forced head tie-break by contentHash (the guard)
If a single current head is required,
  then the kernel shall break the tie by contentHash alone.
normative-clause: "the tie-break MUST be **`contentHash` alone**"
```

**State-driven** — INV-GROUND (FRESH while anchored):

```
### REQ-GROUND-4 — serve FRESH while the anchor holds
While a fact's subtreeHash equals its anchored subtreeHash,
  the grounding gate shall serve the fact as FRESH.
```

## 7. Self-check before emitting (all must pass)

- [ ] exactly one `shall`?
- [ ] pattern matches the §2 tree?
- [ ] load-bearing clause **quoted**, not paraphrased?
- [ ] `source: INV-<MODULE>-<n>` cited, id-scheme consistent?
- [ ] a golden is writable for it (testable)?
- [ ] §5 anti-pattern gate clean?
- [ ] every unwanted-behaviour path of the source invariant has its own `If-then` REQ?

Passing S1's per-REQ bar here does **not** discharge set-level coverage — that is the reconciler gate.
