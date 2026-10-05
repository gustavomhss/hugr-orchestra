# FSPEC-merge — the CRDT OR-Set merge + supersedes core (the one formal model)

> **cluster:** KERNEL-9 / KERNEL-10 / KERNEL-11 (+ **PERSIST-11** consumer; **KERNEL-12** reuses the reducer as
> its safe-degrade floor) · **method-tag:** `formal` · **state:** S2 (`formal-decision`) ·
> **owner:** charlie (FORGE); architecture-reviewed by bobby.
>
> **Authority (nothing invented):** Shapiro et al. 2011 (INRIA RR-7506) — the state-based CRDT
> **join-semilattice** reduction: `merge` = least-upper-bound (LUB), **commutative / associative / idempotent**;
> Gomes, Kleppmann et al., OOPSLA'17 — the Isabelle-mechanized theorem: concurrent operations **commute ⇒
> strong eventual consistency (SEC)** under causal / apply-once delivery. We _lean on_ Gomes'17 rather than
> re-proving SEC — our obligation is to show our merge is a semilattice join and our delivery is apply-once.
>
> This is the **only** cluster in the Atlas with a standing FSPEC. That is the ratified baseline, not a
> compromise: every other invariant fails conjunct #2 (below) and is cheaper as an executable reference model.

---

## Why `formal` here — the 3-conjunct rule, all three written (not asserted)

A cluster earns a machine-checked model only if **all three** hold (AWS/CACM'15 + ShardStore/SOSP'21):

1. **High-consequence & hard to recover.** A merge that drops or resurrects a claim corrupts the _shared_
   Atlas fold silently, and that corruption travels through git history into every clone — the U2
   resurrection bug (seq-LWW picking a stale "last writer"). There is no cheap undo: the bad state is
   content-addressed and already folded everywhere.
2. **Combinatorial state that human review + example tests cannot cover.** Convergence must hold under
   _arbitrary_ concurrent writers × branch / merge / rebase interleavings × supersede / decay orderings. The
   decisive bugs (LWW resurrection, order-dependent heads) live in multi-step interleavings that a competent
   engineer + example tests plausibly miss — the discriminator for `formal` (AWS's decisive bug needed a
   35-step trace).
3. **Cheap to keep alive.** The property reduces to the join-semilattice laws, checkable by **PBT** in the
   build language; the reference OR-Set (a set + a version map) **is** the unit-test mock, so the build breaks
   the moment the code drifts from the spec (anti-rot, §Conformance). A non-expert can own it.

All three hold **only** for this cluster. KERNEL-1..8/12 fail #2 (a good test corpus / reference model catches
their bugs) → `reference-model`.

---

## The reduction — OR-Set-of-ClaimEntry as a join-semilattice

The log is a content-keyed **set** of events; the folded state per `nodeKey` is an **OR-Set** (observed-remove
set) of `ClaimEntry`/lineage, **grow-only** (KNOW-4 upsert / KNOW-12 nothing-dies: supersede archives, never
deletes). Reduce to Shapiro'11:

- **State** `S` = the set of event ids (⊆ Hash) + a version map `Map<Hash, Event>` (the "an OR-Set = a set +
  version map" simplest impl). Per `nodeKey`, the node = the OR-Set of its `ClaimEntry` keyed by `contentHash`.
- **Partial order** `⊑` = **set inclusion** on event ids (and, per node, inclusion on the ClaimEntry set +
  supersedes-DAG reachability). `(S, ⊑)` is a join-semilattice.
- **Join** `⊔` = **`merge` = set-union** on the event id (per node: union of ClaimEntry sets; head = the tip of
  the supersedes partial-order, tie-broken by `contentHash` **alone**). Set-union is, by construction:
  - **commutative**: `a ∪ b = b ∪ a`
  - **associative**: `(a ∪ b) ∪ c = a ∪ (b ∪ c)`
  - **idempotent**: `a ∪ a = a`
    → it is the **LUB**. By Shapiro'11 this is a valid state-based CRDT; by Gomes'17 (union commutes, delivery is
    apply-once because ids are content-hashes) it converges to **SEC**.
- **Apply-once delivery** is free: an event's id **is** its content-hash (KERNEL-9), so re-delivery of a
  byte-identical event is a set-insert of an id already present = a no-op. No causal-order barrier is needed —
  union is unordered.

`seq` is **outside** the algebra entirely: a local ordering hint, never in identity, `⊑`, or `⊔` (KERNEL-9).
Concretely, **`canonicalForm(event)` omits `seq`** — exactly as KERNEL-8's canonical preimage omits the mutable
side-indexes (grounding/status/freshness) — so `id(e)=hash(canonical(e))` is invariant under any reseq, and the
seq-invariance law below has a real oracle in the reference model (`RefLog.id` / `RefLog.reseq`).
This is what removes the U2 seq-LWW branch — there is **no "last writer"** to pick because the two colliding
events assert the _same_ claim / re-run the _same_ `check`, so freshness is identical and the fold **unions**.

---

## UP — the named safety/liveness property per INV

- **KERNEL-9 — idempotent content-keyed set-union (safety).** `append` is a set-insert keyed by the event id
  (re-append of a byte-identical event ⇒ no-op); `merge` = set-union on the id; `seq` is never an identity or
  merge key — colliding `seq` across writers/branches never collides identity.
  Formally: `append(append(L,e),e) = append(L,e)` (idempotence); `id(e)=hash(canonical(e))`; `∀ seq', keyset(reseq(L,seq'))=keyset(L) ∧ fold(reseq(L,seq'))=fold(L)`.
- **KERNEL-10 — deterministic, order-independent union + `contentHash`-alone tie-break (safety).** ≥2 events on
  one `nodeKey` union into **one** OR-Set node keyed by `contentHash`, **0 dropped**, identical under either
  order; a forced single head = `max-by-contentHash` among the FRESH entries — never `seq`, a clock, or an LLM.
  Formally: `mergeNode(x,y)=mergeNode(y,x)` and `mergeNode` is grow-only (`x ⊑ mergeNode(x,y)`); `head(node)` =
  `max-by-contentHash` among the FRESH, non-superseded entries — `contentHash` is the **sole tie-break** (never
  `seq`/clock/LLM), so `head` is invariant under reseq/reclock.
  **Direction is pinned-canonical (`max`).** The frozen KERNEL-10 clause fixes the tie-break to `contentHash`
  _alone_ but is silent on **min vs max**; the direction is immaterial to correctness (any fixed total order on
  `contentHash` is a pure content function) — **but it MUST be pinned**, because KERNEL-11 requires a
  byte-identical `AtlasState` across independent implementations, and a min-head impl would diverge from a
  max-head impl on the surfaced head. This spec pins **`max`** as the canonical direction; every golden and
  implementation follows it. _(Open reconciliation: the KERNEL-10 reference clause should absorb this
  `max` direction so the choice is grounded upstream, not only in the FSPEC — routed to DEFINE.)_
- **KERNEL-11 — convergent fold / strong eventual consistency (liveness→safety).** Two replicas whose
  delivered event-sets are equal have byte-identical `AtlasState`: any permutation, re-batching, or
  branch-union of the **same set** folds to a byte-identical `AtlasState` (0 order-dependence).
  Formally: `fold(π(S)) = fold(S)` for any permutation/re-batch/union `π` preserving the set; equivalently
  `fold` is a homomorphism from `(2^Event, ∪)` to `(AtlasState, mergeState)`.

---

## DOWN — the executable reference model (build language: TypeScript)

The simplest interface-compatible impl (ShardStore: "an LSM-tree's model _is_ a hash map"). This module is the
**oracle** for conformance and is **reused verbatim as the unit-test mock** (§Conformance) — no second copy.

```ts
// spec/fspec-merge — reference model. Build language = the mock. Do not fork.
type Hash = string // blake3hex(canonicalForm(x))
type NodeKey = string // normalize(claimNorm) | normalize(check)
interface Event {
  id: Hash
  seq: number
  nodeKey?: NodeKey
  contentHash: Hash
  fresh: boolean
  supersedes: Hash[]
  payload: unknown
}

// ---- an OR-Set log = a set of ids + a version map. (KERNEL-9) ----
class RefLog {
  private ids = new Set<Hash>() // the OR-Set (grow-only)
  private ver = new Map<Hash, Event>() // id -> event  (version map)
  append(e: Event): RefLog {
    // set-insert; idempotent on equal id
    if (!this.ids.has(e.id)) {
      this.ids.add(e.id)
      this.ver.set(e.id, e)
    }
    return this // re-append of equal bytes = no-op
  }
  static id(e: Omit<Event, "id">): Hash {
    // identity = content, seq EXCLUDED (KERNEL-9, cf KERNEL-8)
    return blake3hex(canonical({ ...e, seq: 0 })) // seq pinned out of the preimage
  }
  reseq(relabel: (e: Event) => number): RefLog {
    // relabel seq only — the KERNEL-9 seq-invariant oracle
    const out = new RefLog()
    for (const e of this.ver.values()) {
      const e2 = { ...e, seq: relabel(e) }
      out.append({ ...e2, id: RefLog.id(e2) }) // id drops seq ⇒ identical id ⇒ keyset + fold unchanged
    }
    return out
  }
  static merge(a: RefLog, b: RefLog): RefLog {
    // plain set-union; commut/assoc/idemp (KERNEL-9/11)
    const out = new RefLog()
    for (const e of a.ver.values()) out.append(e)
    for (const e of b.ver.values()) out.append(e)
    return out
  }
  events(): Event[] {
    return [...this.ver.values()]
  }
}

// ---- per-nodeKey OR-Set node; grow-only union + contentHash-alone head. (KERNEL-10) ----
interface Node {
  nodeKey: NodeKey
  entries: Map<Hash, Event>
} // keyed by contentHash, grow-only
function mergeNode(x: Node, y: Node): Node {
  // commutative, grow-only union — 0 dropped
  const entries = new Map(x.entries)
  for (const [h, e] of y.entries) if (!entries.has(h)) entries.set(h, e)
  return { nodeKey: x.nodeKey, entries }
}
function head(n: Node): Event {
  // forced single head = contentHash ALONE
  const fresh = [...n.entries.values()].filter((e) => e.fresh && !supersededBy(e, n))
  return fresh.sort((a, b) => (a.contentHash < b.contentHash ? 1 : -1))[0] // never seq/clock/LLM
}
const supersededBy = (e: Event, n: Node) => [...n.entries.values()].some((o) => o.supersedes.includes(e.contentHash))

// ---- the convergent fold: reduce the set via per-nodeKey LUB. (KERNEL-11) ----
function fold(log: RefLog): Map<NodeKey, Node> {
  // order-independent by construction
  const state = new Map<NodeKey, Node>()
  for (const e of log.events()) {
    // iteration order irrelevant: union commutes
    if (e.nodeKey === undefined) continue
    const cur = state.get(e.nodeKey) ?? { nodeKey: e.nodeKey, entries: new Map() }
    state.set(e.nodeKey, mergeNode(cur, { nodeKey: e.nodeKey, entries: new Map([[e.contentHash, e]]) }))
  }
  return state // AtlasState projection = canonical serialize(state)
}
```

`AtlasState` byte-identity (KERNEL-11) = canonically serializing `fold(log)` with the KERNEL-1 canonicalizer
(sorted keys), so two equal sets serialize to equal bytes regardless of arrival order.

---

## The escalation ladder — PBT-first, TLA+ only if subtle (honest)

```
1. PBT the semilattice laws IN THE BUILD LANGUAGE (fast-check / equivalent) — the default, does the work:
     commutative  : mergeNode(x,y)               ≡ mergeNode(y,x)
     associative  : merge(merge(a,b),c)          ≡ merge(a,merge(b,c))
     idempotent   : append(append(L,e),e)        ≡ append(L,e)   ;  merge(a,a) ≡ a
     convergence  : fold(shuffle(S))             ≡ fold(S)        (KERNEL-11)
     no-drop      : |entries(mergeNode(x,y))|    ≥ max(|x|,|y|)   (grow-only, KERNEL-10)
     head-tiebreak: head(n) = max-by-contentHash among FRESH ∧ ¬superseded; reseq/reclock leaves head unchanged
     seq-invariant: keyset(reseq(L,s')) ≡ keyset(L) ∧ fold ≡ fold (KERNEL-9)
2. Lean on Gomes'17: union commutes ∧ ids are content-hashes (apply-once) ⇒ SEC — cited, not re-proved.
3. TLA+/TLC ONLY IF supersede+remove proves subtle — i.e. if the supersedes-DAG + FRESH/decay interaction
   (the observed-remove arm) turns out to admit an order-dependent head PBT can't refute. Model the
   interleaving of {append, supersede, decay, branch-merge}; check the inductive invariant "delivered-set
   equal ⇒ state equal".
4. Apalache ONLY IF that invariant must be unbounded-inductive (not bounded-depth checkable by TLC).
5. Isabelle ONLY IF audited — Gomes'17 already gives the mechanized SEC theorem; do not re-mechanize
   unspent.
```

The honest default is stop at step 1–2. Steps 3–5 are **contingencies gated on discovered subtlety**, not a
baseline deliverable — over-formalizing here would burn the budget the rule exists to protect.

**Honest limit:** conformance testing (below) is **sampled, not proven** — "success = we could not find a bug".
Buy confidence with scale + coverage metrics, never with a claim of proof.

---

## Conformance harness + anti-rot mock (unconditional — the one real drift fence)

- **The reference model above is written in the build language and reused verbatim as the mock** in the
  kernel unit tests (`append` / `merge` / `fold` / `mergeNode` / `head`). The production kernel is
  **differentially tested** against it: for random event sets + branch/merge/rebase interleavings, assert
  `serialize(prodFold(S)) == serialize(refFold(S))`. The build breaks the instant the code drifts from the
  spec — a non-expert owns the spec by owning the mock.
- **Coverage instrumentation** on the reference model detects code paths the model no longer reaches (rot
  detector): an uncovered branch means the model has fallen behind the code.
- The `formal` and `reference-model` tags in `method-tags-krn.md` each name their mock; this artifact is the
  shared one for KERNEL-9/10/11, **and** KERNEL-12's safe-degrade line-merge reuses `RefLog.merge` as its
  reducer (so the JSONL union floor is pinned to the same core).

---

## PERSIST-11 — the persistence-side consumer of this same core

PERSIST-11 ("branch-merge = event-set union + re-fold") is **not a second model** — it is the git-integration
consumer of `FSPEC-merge`:

- The registered git **merge driver** (`.gitattributes: <atlas-log> merge=orchestra-atlas`) computes
  `RefLog.merge(ours, theirs)` then re-folds (`fold`) — exactly the semilattice join above. Colliding `seq`
  never surfaces as a conflict (it is outside the algebra); a `nodeKey` on both branches resolves by
  `mergeNode` (KERNEL-10), never by hand.
- **Merge-direction independence** (`mergeAtlas(ours,theirs) ≡ mergeAtlas(theirs,ours)`, byte-identical) is
  precisely the **commutativity** law already PBT'd for KERNEL-11 — the same property, applied at the git
  seam. No new proof obligation.
- **Self-installing + safe-degrade:** the driver lives in `.git/config` (does not clone), so a setup hook
  re-registers it; if it is bypassed on an un-configured clone, KERNEL-12's JSONL line-form degrades to a
  harmless line-union that the next `fold` dedups by id. The **worst case is a duplicate line**, never a lost
  or spliced event — because idempotent set-union (KERNEL-9) makes re-delivery a no-op.

So the seam-freeze (S4) is: the module owning `FSPEC-merge` (KERNEL) freezes the `merge`/`fold` contract;
PERSIST-11 and KERNEL-12 **consume** it. One model, three consumers.

---

## Refuse-to-model (this cluster's deliberate non-goals)

- performance / OR-Set growth + compaction — bounded by decay (DP-9); load-tested, no correctness oracle.
- the code itself — conformance-tested (sampled), not verified; design-verified ≠ code-verified.
- concurrent **and** crashing simultaneously — git-merge concurrency vs process-crash/durability checked
  separately, never in one model (ShardStore rule).
- BLAKE3 collision-resistance — trusted primitive, assumed.
- git's 3-way text-merge internals — black-box adversary; we model only that the JSONL union degrades safely.
- real-time / wall-clock — no clock enters the fold by construction (KERNEL-10).
