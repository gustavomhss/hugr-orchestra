# Knowledge

## The idea

**Knowledge** is the shared, grounded truth about the codebase — a living graph of what is true about the
system, where every fact is pinned to `source@sha` and re-checks itself against the code. Its defining
property is that it **cannot lie**: a fact whose code moved out from under it stops being true,
automatically. It is the substrate a phase reads _instead of guessing_.

**Knowledge and Memory are two kinds of ONE Atlas — not a separate layer.** The Atlas is the umbrella
system. Inside it live two content kinds: **Knowledge** (shared, about the code) and **Memory** (per
member, about doing the work). They share one substrate — the same content-addressed hashed index, the
same grounding, the same templated write, the same portable export — and they are **distinct and never
conflated**. But the load-bearing framing is _not_ "two systems" or "a memory layer bolted on the side."
It is **one Atlas, two kinds, never mixed.** Memory is not out and it is not separate — it is the Atlas's
per-member kind, specified in its own reference ([atlas-memory.md](../reference/atlas-memory.md)). This
document is about the Knowledge kind; the separation itself is drawn in [classes](./classes.md) and
[design §2](../design/atlas.md).

## Why it's this way

**Why shared.** v1 hallucinated for one structural reason: there was no ground truth. Every phase
re-derived what the system _was_ from scratch and invented the gaps. That costs twice — in correctness
(an agent guessing the codebase produces work that looks done but doesn't integrate) and in cost
(multi-agent systems burn ~15× the tokens of a chat, and token usage alone explains most of the
performance variance, much of it agents re-deriving context). A shared substrate is read instead of
re-derived: the same move kills hallucination _and_ the token bill.

**Why grounded (and not self-declared).** Every knowledge system in history has the same failure mode: it
**rots** — the docs drift from the code, nobody trusts it, so nobody reads it, so it dies. The Atlas
defeats rot with one non-negotiable rule: **a fact never self-declares true; its only claim to truth is a
citation that still re-checks against the code.** And the citation anchors to a _structural unit_ (a
symbol/block/file, by the hash of its subtree), **never to line numbers** — because an import added above
it, or an unrelated rename elsewhere, would drift a fact whose code never changed, a false `BROKEN` that
destroys trust. (A reformat OF the cited unit _does_ drift it: the hash is over raw bytes and there is no
normalization step. See [grounding](./grounding.md) for why that trade is taken deliberately.) Three consequences fall out: forgetting is _earned_ (the code changed under the fact, not a guessed
time-constant); the gate is _fail-closed_ (no grounding ⇒ an honest `NA`, never a false "true"); and trust
is _auditable_ (the receipt travels with the fact). This is why Knowledge can be a foundation — it is the
one layer structurally incapable of confidently lying.

**Why edited, not appended (the anti-garbage law).** New information about a system is usually not a new
fact — it is a _change_ to a fact that already exists. A store that only ever appends becomes, in the
owner's words, _a mountain of inoperable garbage_: ten stale claims about the same function, no way to
know which is current. So a write is an **upsert**, never a blind insert:

- **Same fact, re-observed → idempotent.** Content-addressed identity resolves it to the same node; no
  duplicate is created.
- **Changed fact → edit or supersede, by family.** A changed **advisory** fact is edited in place — git
  preserves the prior (the repo's own history is the archive); a changed **predicate** fact supersedes (a
  new node, the old retained as addressable lineage old→new); the pack surfaces only the head.
- **A subject's claims → set-union**, not a pile of rival nodes.
- **Contradiction → the grounded one wins.** Reality contradicting a stored fact drifts it to `BROKEN`; it
  is re-authored or retired in place — the stale belief never lingers beside the true one.
- **Decay = de-activation, not deletion.** A fact nothing re-grounds ages out of the _active/injected_ set
  and is **archived** — like git, HEAD is the curated current truth and nothing is lost.

The test of the law is brutal and simple: after a year of work, is the store smaller-than-linear in edits
and still all-true? If a territory query returns one current fact per subject, the law holds; if it
returns landfill, it doesn't.

**Why it can't rot.** Grounding + edit-over-append compose: a stale fact is _detected_ (its anchor hash no
longer matches) and _replaced_ (superseded, not stacked). Rot needs staleness to accumulate silently and
duplicates to pile up — the Atlas forbids both. Drift is visible at query time (the index _is_ the drift
oracle) and blocks the merge; duplication is impossible under content-addressed upsert.

## Trade-offs

- **Relevance must be structural.** Retrieval is a deterministic hashed structural index — no embeddings,
  no RAG, ever — resolved by scope / dependency / trigger. This drops fuzzy "vaguely-related" recall. In
  exchange the Atlas is deterministic, `$0`, never index-stale, auditable, and self-checking — the right
  trade for knowledge grounded in code, where the dependency graph beats semantic similarity.
- **Both families day-one, evaluator-optional.** Both the advisory family (a grounded claim, the honest
  default) and the checkable `predicate` family ship day-one; the store still operates on advisory alone
  when no evaluator is wired, but predicate is **not** deferred. Honesty without mechanization when nothing
  consumes it, full checkability the moment something does.
- **Edit vs supersede, by family (ratified).** A changed **advisory** fact is edited in place — git
  preserves the prior, so no in-store lineage pile is needed; a changed **predicate** fact
  mints-new-and-supersedes, keeping full lineage the archive carries freely. Git is the archive for the
  advisory case; the predicate case earns its stored lineage. _(The earlier "history worth keeping vs
  landfill" calibration is now closed — [KNOW-4](../reference/atlas-knowledge.md), [design §7](../design/atlas.md).)_
- **Coverage tracks work, so cold code stays a skeleton.** Knowledge is born from work, never an upfront
  catalog — a territory nobody touched stays the honest `T2/advisory` default. Deliberate: coverage where
  the value is, no cataloging ritual.

## Where it fits

- The shapes, the `KNOW-N` invariants, and the tool surface: **[reference/atlas-knowledge.md](../reference/atlas-knowledge.md)**.
- The grounding primitive (structural anchor, BLAKE3): **[spec §3.1](../spec/atlas.md)**.
- The other kind — per-member Memory: **[reference/atlas-memory.md](../reference/atlas-memory.md)**.
- Who owns and reads Knowledge, by class: **[explanation/classes.md](./classes.md)**.
