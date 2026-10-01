# Grounding — why the Atlas can't rot

## The idea

A normal wiki states things and hopes they stay true. The Atlas refuses to: a fact never self-declares
true — it earns the right to be served by re-checking, at query time, against the exact code it came
from. That receipt is its **grounding**. If the cited code moved, the fact stops claiming to hold and
downgrades itself to an honest unknown. The knowledge layer is not a document you trust; it is a
document that keeps proving itself, or gets out of the way.

## Why it's this way

**Why grounding beats a wiki.** Prose about code rots the moment the code changes, and nobody notices
until it misleads someone. A wiki has no mechanical link between a sentence and the lines it describes,
so staleness is invisible until it costs you. Grounding makes that link a first-class, checkable
receipt. The failure it avoids is the confident-but-false fact: the Atlas would rather say _NA_ than
serve a lie. This is the truth-gate — see [`atlas-grounding`](../reference/atlas-grounding.md)
(GROUND-4) — and the reason a stale fact can never masquerade as fresh.

**Why structural, not line numbers.** The obvious anchor is "file X, lines 42–50." It is also the wrong
one. Add an import above the function, rename an unrelated symbol in another file — the lines shift and
the fact drifts, screaming `BROKEN` about code that never changed. That is a false alarm factory, and
false alarms train people to ignore the alarm. So the anchor is the **structural unit** — a symbol,
block, or file — identified by the hash of its subtree, with line-ranges demoted to a mere display hint
that never participates in the drift check. An edit that never touches the cited unit is invisible to it;
a real edit to the cited unit is not. The old model (`VEC(path ‖ lineRanges ‖ contentSha)` over SHA-256 at
line ranges) was exactly this line-fragile trap, and it is gone.

**What this does NOT buy you, said plainly.** Running the formatter over the cited function _does_ drift
the fact. The subtree hash is taken over the unit's raw source slice, NFC-normalized and nothing else —
there is no whitespace-erasing normalizer, and there deliberately never will be. Whitespace is _semantic_
in TS/TSX (inside string, template and regex literals, in JSX text, and under ASI), so a normalizer cheap
enough to erase formatting is also blind to a one-space change that alters what a function returns. The
trade is asymmetric: a false alarm costs one re-ground, a false negative lets the truth gate serve `HOLDS`
on a fact that is no longer true. Atlas takes the false alarm. Renaming the cited symbol drifts it too,
for a different reason — the name is part of the anchor key, so the anchor simply stops resolving and the
fact fails closed. There is no rename-tracking.

<!-- AMENDED 2026-08-02 (HONESTY-TAPROOT): this page previously said "A reformat is invisible", which was
     never true in any shipped revision. -->

**Why BLAKE3.** The hash is not just an identity trick — BLAKE3 is _internally a Merkle tree_, so the
same hashing that anchors one fact also gives, for free, a hierarchical index over the whole repo
(repo → crate → module → file → item → block). One structure does two jobs: it is the drift oracle and
the discovery index at once. A change re-hashes only the path from the edited leaf to the root; every
untouched subtree keeps its hash, so every fact anchored elsewhere stays fresh without being re-checked.
See [`atlas-index`](../reference/atlas-index.md) (INDEX-2) for the rollup, and
[`atlas-kernel`](../reference/atlas-kernel.md) (KERNEL-2) for the encoder seam that keeps the choice
swappable.

**Why no embeddings, no RAG.** The tempting move for "find relevant knowledge" is to embed everything
and do nearest-neighbor search. The Atlas forbids it. Embeddings are non-deterministic, go stale the
moment the code changes (you must re-embed), cost a model to run, and can't tell you _why_ something was
returned. For knowledge grounded in code, relevance is already structural: what scope you're in, what
your code depends on, what tag matches. So retrieval is a deterministic walk of the hashed tree — by
scope, by dependency, by trigger — and nothing else (INDEX-6, INDEX-7). The index that answers your
query is the same index that knows whether the answer is stale.

## Trade-offs

This is a real trade, stated honestly. Dropping embeddings drops fuzzy, "vaguely-related" recall:
relevance must be _expressible_ structurally, or the Atlas won't surface it. If your only link between
two facts is semantic vibes, structural retrieval won't find it. In exchange you get determinism (two
identical queries, identical results), `$0` retrieval (no embedding model), an index that is never
stale, and answers you can audit. For a knowledge layer whose whole job is to be trustworthy about code,
that is the right side of the trade.

There is also a second admission cost, and it is narrower than it used to be. Truth alone isn't enough to
enter: a fact must also not be **harmful to store** — a secret or PII, the one class where storing IS the
harm (GROUND-7). Being merely **obvious** is _not_ a reason to refuse: obviousness is computed and kept as an
auditable **score**, and the ranking decision is taken later, at retrieval
([ADR-0012](../adr/ADR-0012-obviousness-is-scored-never-gated.md)). The reason is that a rejected candidate
leaves no record — a gate destroys exactly the evidence needed to audit the gate — while a stored score can be
re-thresholded for free. A true-but-obvious fact still costs retrieval precision; it is now paid for at
ranking, where it is recoverable, rather than at admission, where a wrongly-refused fact is not.

## Where it fits

- The anchor, the truth-gate, and the admission bar: [`atlas-grounding`](../reference/atlas-grounding.md).
- The Merkle tree, path resolution, and the three retrieval modes: [`atlas-index`](../reference/atlas-index.md).
- The CAS, the BLAKE3 encoder seam, and the append-only event log everything folds from:
  [`atlas-kernel`](../reference/atlas-kernel.md).
- The normative contract these dogfood: [`spec/atlas.md`](../spec/atlas.md) §3.1, §3.5–3.6, A-1, A-14.
