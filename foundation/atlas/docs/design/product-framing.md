# The Atlas — product framing (D1: the bet, the four risks, the feasibility spike)

> The **Frame** phase of the [product-design rubric](../method/product-design.md), applied to the Atlas.
> Consumes [D0 product-definition](product-definition.md) (the 10 FRs). Output: the PR/FAQ, the four risks,
> and — first, because it is the riskiest — the **feasibility spike** on the no-embeddings retrieval bet.
> Anti-arbitrariness rule (rubric): every claim below cites an **FR**, a **job-map step**, or a **risk it
> retires**. No citation → out.

## The bet (one sentence)

> An AI coding agent performs better when its knowledge substrate serves the **currently-true, task-relevant,
> minimal** slice of what the codebase knows — retrieved **deterministically by structure, not similarity** —
> than when it stuffs raw files or queries an embedding index. The wager is that **structural proximity is a
> stronger relevance signal for a code edit than semantic similarity**, and that it is cheaper (FR-3), faster
> (FR-1), and — critically — **groundable** (FR-4/FR-5), which an embedding never is.

---

## PR — the press release (to a skeptical future contributor)

**Heading:** The Atlas — a codebase's shared, grounded knowledge, served to agents as current-truth, not guesses.

**Sub-heading:** For AI coding agents (and the humans who steward them): the task-relevant facts about the
code, retrieved by structure in one hop, guaranteed current or withheld — no embeddings, no RAG, no landfill.

**Summary.** Coding agents today rebuild their understanding of a codebase from scratch on every task, by
reading files into the context window and hoping the important ones are in there. The Atlas is a git-native
substrate that holds what the project knows — grounded to the code at a content hash — and serves each agent a
**curated, minimal, currently-true pack** for the scope it is working in. Retrieval is a deterministic
structural index (BLAKE3-merkle over the AST + dependency graph), so it is fast (FR-1), cheap (FR-3), and
**auditable**: a served fact is either provably still true of the code or it is withheld (FR-4/FR-5).

**The problem (from the agent's POV).** _Locate_ (find the grounded fact) and _Confirm_ (is it still true?)
are two of the three highest-pain job-map steps (_Modify_ — edit-over-append — is the third, addressed below),
and today's tools address neither of these two: raw file-reads bury the
1 relevant fact in 50 irrelevant ones (fails FR-2); an embedding index returns _similar-looking_ code, which
is the wrong relation for an edit and **cannot tell you whether what it returned is stale** (fails FR-4). The
agent acts on superseded knowledge and ships a plausible-but-wrong change.

**The solution (+ what they use today).** Today an agent uses one of: **raw file reads** (no relevance, no
currency), **embeddings/RAG** (approximate relevance, no currency, cost ∝ corpus size), or an **MCP memory
server** (unstructured, ungrounded, append-only → landfill). The Atlas replaces all three with one substrate:
structural retrieval for _Locate_, a grounding truth-gate for _Confirm_, and edit-over-append for _Modify_ —
each the exact mechanism the painful job-map step needs.

**Quote (the steward).** "I stopped paying an embedding bill to get _similar_ code back and started getting
the _right, current_ code back — and I can see in the PR diff exactly which knowledge changed and why."

---

## Internal FAQ — the pre-mortem

**Q: What do agents use today, concretely?**

- **Raw file reads / grep** — zero relevance ranking, zero currency signal. The agent pays tokens (FR-3) to
  read files it didn't need and still misses the one it did (FR-2).
- **Embeddings / RAG** (vector DB over chunks) — approximate semantic recall; cost and index size scale with
  the _whole corpus_, not the task; and the returned chunk carries **no proof it still matches the code**.
- **MCP memory servers** — a key-value or free-text store; unstructured, ungrounded, and append-only, so it
  degrades into the "montanha de lixo" the anti-garbage law (FR-7) exists to prevent.

**Q: Why is ours better / cheaper / faster?**

- **Better relevance (FR-2):** for a code edit the relevant set is _structural_ — the symbol's callers,
  callees, type-surface, enclosing scope, governing territory. The dependency graph returns that set
  **exactly**; an embedding returns things that _read_ similar, which is a proxy for the wrong relation.
- **Cheaper (FR-3, FR-7):** no embedding compute, no vector index to build or host; cost ∝ the _importance
  surface you actually work on_ (born-from-work), not corpus size. Growth is sublinear by edit-over-append.
- **Faster (FR-1):** retrieval is a hash-keyed structural lookup + graph closure — pointer-chasing, not an
  ANN similarity search over millions of vectors.
- **Groundable (FR-4/FR-5) — the one embeddings _structurally cannot_ do:** every fact is anchored to a code
  hash; drift flips it to stale and it is withheld or flagged. A vector has no notion of "still true."

**Q: What must be true for this to work?** (the load-bearing assumptions, each becomes a risk below)

1. Structural retrieval actually meets FR-1/FR-2 **without** embeddings — the _feasibility bet_, spiked next.
2. Agents will **prefer** a curated minimal pack over stuffing their (large) context window — the _value bet_.
3. The dynamic, scope-local tool/pack surface is **drivable** by an agent with low error — the _usability bet_.
4. The substrate stays coherent and within the owner's maintenance appetite **as it grows** — the _viability bet_.

**Q: Top 3 reasons it fails?**

1. **Convention-coupled code with no explicit edge** (a serializer and its deserializer in different crates,
   string-keyed dispatch) — structural retrieval is _under-approximate_ here; the relevant fact has no graph
   path. (Feasibility risk; bounded fallback below.)
2. **Agents ignore it** and stuff files anyway because context windows are large enough — the value bet fails
   if "current + minimal" doesn't beat "everything." (Value risk.)
3. **Stewardship burden** — genesis/curation becomes a chore, or the store drifts into landfill despite
   edit-over-append. (Viability risk.)

**Q: What genuinely-new capability must we build?** The **structural retrieval + grounding index** (the
no-embeddings engine) — the one thing no off-the-shelf component gives us. Everything else (git storage, MCP
tool projection, packs) is assembly. So the build risk lives almost entirely in the feasibility bet — which is
why we spike it first.

---

## The feasibility spike (done first — the riskiest bet) — FR-1 + FR-2 without embeddings

**The bet, falsifiably:** a deterministic structural index meets **FR-1** (retrieve the grounded fact fast)
and **FR-2** (retrieved context is task-relevant) with **zero vector/ANN**, for the dominant edit case, with a
**named, bounded, still-non-embedding fallback** for the residual.

**Mechanism (grounded, not hoped — this is prior art, not invention):**

- **Parse + resolve:** tree-sitter for the AST (the Aider repo-map technique), SCIP (Sourcegraph, per-language
  precise references) for name resolution → a def→ref graph. Both are production, incremental, IDE-latency.
- **Retrieve by structure, not similarity:** the three deterministic retrieval modes — `scope(path)` → the
  enclosing spatial nodes; `dependency(unit)` → forward/reverse closure = the blast radius; `trigger(tag)` →
  tag-matched nodes. The **territory** overlay (owner/tier) is a governing _partition_ of `relate()`, not a
  fourth mode. Union, partitioned by relation-kind = the curated pack. Lookup is **O(closure)**, not O(corpus)
  — but the closure itself is **capped** (see FR-1 verdict below), never left unbounded.
- **Rank:** personalized PageRank over the def→ref graph (the Aider repo-map method, NetworkX PPR, damping/seed
  pinned = reproducible) → FR-2's precision without a learned relevance model. At **retrieval**, the pack first
  carries every `tier≥T1` invariant of the territory as a **mandatory floor** (spec §3.4 / acceptance #9 —
  completeness, never a ranked drop), bounded by `maxHops=2`/`K=8` (RETR-11); PPR ranks only the discretionary
  band _below_ that floor. (Binary-search-to-budget is the _genesis_ site-budget mechanism, not retrieval — a
  distinction D2 must keep.)
- **Ground:** each served fact carries a StructRef anchored to a BLAKE3 **subtree** hash; an edit that changes
  the cited unit's own bytes flips it stale → withheld/flagged (an added import, a **blank-line-separated**
  license/file header ABOVE the unit, or an unrelated rename ELSEWHERE, stays FRESH — drift keys on the unit's
  subtree, not "any edit in range"; spec §3.1, acceptance #1). A reformat INSIDE the cited unit does flip it —
  the hash is over raw bytes, an accepted false alarm. A comment **contiguous** (no blank line) with the cited
  declaration is its bound doc-comment and editing it flips the unit too — classification is by contiguity, not
  file position (ADR-0014). <!-- AMENDED 2026-08-02 (HONESTY-TAPROOT): was "a reformat / added-import
  / unrelated rename inside the unit stays FRESH", which was never delivered. AMENDED 2026-08-09 (ADR-0014):
  the header-above leg is FRESH only when blank-line-separated; a contiguous header is a bound doc-comment and drifts. -->
  This is why the retrieval is **auditable** where an embedding is not.

**Why the relevance claim (FR-2) is _stronger_, not just cheaper:** the relevant set for "edit function F" is
F's callers (who breaks), callees (what F relies on), type-surface (the contract), and governing territory
(who ratifies). The dependency graph returns _precisely_ that set. Semantic similarity returns "code that looks
like F," which is neither necessary nor sufficient for the edit. Structural proximity is the _right relation_;
similarity is a proxy for a different one.

**External validation (honest, dated, sourced — the direction is proven, not contrarian):**
**Sourcegraph Cody** deprecated its embeddings retrieval backbone at Enterprise GA, moving to keyword +
code-graph search ("How Cody understands your codebase"). **Aider** has been structural since inception — a
def→ref graph ranked by personalized PageRank, never embeddings-based (`repomap.py`). We are deliberate, not
first. **Honest caveat (not overstated):** this is _not_ a universal industry abandonment of vectors —
**Augment**, for one, runs a **hybrid** index that fuses vector embeddings _with_ a def/call graph and BM25.
So the evidence supports "structural retrieval is a proven, competitive path," **not** "the industry dropped
embeddings." Our no-embeddings stance is a deliberate constraint (FR non-goal), not a claim everyone made it.

**The honest failure mode (where the bet is genuinely at risk):** **convention-coupling** — two code sites
that must change together but share _no_ AST/dependency edge (serializer/deserializer across crates, a
string-keyed registry, a config-schema ↔ its parser). Structural closure is _under-approximate_ there; the
relevant fact has no path to the edit site. This is the one place FR-2 can miss, and it is real (flagged in the
index review).

**The fallback (still zero embeddings) that bounds the failure:**

- **coChanged band** (already in the design — INDEX-13 / RETR-10) — git-history logical/temporal coupling
  (association-rule over commits): sites that _historically_ change together, auto-unioned as a labeled,
  correlational (not causal) fallback band when the structural closure is thin. Deterministic, no vectors.
- **functional-axis coverage gate** (INDEX-16) — a standing unresolved-edge-ratio gate that flags units whose
  convention-coupling is un-modeled, so the gap is _visible and measured_, never silent.
- Measured, not asserted: **FR-2 = precision@k on a labeled benchmark that deliberately includes
  convention-coupled cases** — the spike's number, set at ratification (D3).

**Spike verdict — Feasibility risk = LOW–MEDIUM, concentrated in a measured tail.**

- FR-1 (speed): **LOW risk** — structural lookup + precomputed PPR is IDE-latency prior art and there is no
  embedding compute to be slow; but "O(closure)" is exactly the cost the design **caps** — RETR-11
  (`maxHops=2`/`K=8`) and INDEX-12 (dependency fold bounded, _never_ O(blast-radius), via dirty-bit + lazy
  on-read recompute), because a hub's naive closure is O(repo) absent those caps. So: retired **under the
  caps**, target number pending D3 — _not_ "by construction" (the honest bar we hold FR-2 to as well).
- FR-2 (relevance): **LOW–MEDIUM** — structural closure _is_ the relevant set for the dominant edit case; the
  residual (convention-coupling) is caught by a non-embedding fallback and **made visible** by a coverage gate.
  Honest limit: the fallback is _correlational_, so the guarantee is only as strong as the static graph plus a
  labeled coChanged band — not a proof. The open question is "how large is the convention-coupled tail in a
  given repo," an **empirical number we measure** (precision@k on a benchmark that includes convention-coupled
  cases), not an unknown we hope on.
- **No path to "we need embeddings"** exists in this design: the fallback for the one weak case is git-history
  correlation, itself embedding-free. The no-embeddings constraint (FR non-goal) holds end-to-end.

---

## The four risks (Cagan's four risk _categories_ — not a per-FR cover)

These are the four risk categories, not one row per FR; FR-6 (reconcile), FR-8 (re-spawnable), FR-10
(Knowledge/Memory purity) ride inside Value/Usability/Viability below rather than getting their own row.

| risk                                                    | the bet                                                   | retired by (cites)                                                                                                                                                                                                                                                                                                                                                                                                               | residual                                                                                  |
| ------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Value** — agents rely on it over ad-hoc context       | current+minimal beats everything-stuffed                  | FR-2 (relevance) · FR-3 (tokens) · FR-4/5 (currency) · FR-10 (purity); evidence (arXiv 2602.11988) that **LLM-generated** context files _reduce_ task resolution (−0.5% SWE-bench Lite, −2% AGENTbench) while **developer-written** context _helps_ (+2.4–4%) — so "more context" is not itself the win; the _right, current, grounded_ context is (and ours is graph-derived + grounded, not LLM-guessed → on the helping side) | agents with huge windows may stuff anyway; measured by adoption/hit-rate on the benchmark |
| **Usability** — agent-ergonomics                        | drivable from a tool schema + an injected pack, low error | node-as-tool + **curated own-pack** (agent never assembles context) + location-scoped surface; push-as-file fallback needs **zero grant** (subagent-transport ladder)                                                                                                                                                                                                                                                            | dynamic tool surface may confuse; measured by tool-call error rate                        |
| **Feasibility** — the no-embeddings retrieval bet       | structural retrieval meets FR-1/FR-2                      | **spiked above** — LOW–MEDIUM, tail-bounded                                                                                                                                                                                                                                                                                                                                                                                      | convention-coupled tail size (empirical)                                                  |
| **Viability** — stewardship within the owner's appetite | self-maintaining, sublinear, nothing manually curated     | FR-9 (human effort) via **born-from-work** ($0 genesis, enrich by blast-radius) · FR-7 (sublinear, edit-over-append) · derived-not-written awareness (zero-maintenance) · git-native (nothing dies, nothing hand-curated)                                                                                                                                                                                                        | genesis cost on huge repos; bounded by scope + budget ceiling (genesis cost-discipline)   |

## Appetite & non-goals (carried from D0, made explicit here)

- **Appetite:** the owner's maintenance budget is **near-zero manual curation** — the substrate must be
  _born from the work_ and decay by non-use, not tended by a team of curators (FR-9). Genesis is _scopable_
  and budget-capped; the cold tail is paid for lazily by born-from-work, never up front.
- **Non-goals** (bounding every DP downstream): no embeddings, no RAG, no ANN — ever (ratified constraint).
  Not a vector database; not a chat-memory server; not a search engine over raw files.

## Next

- **D2 — Structure:** map each FR → its design parameter (DP) + the coupling matrix
  ([`axiomatic-design`](../../.claude/skills/axiomatic-design/SKILL.md)); draw boundaries at the
  decision-most-likely-to-change (the convention-coupling fallback is one such seam).
- **D4 — Ratify:** each existing Atlas invariant → a ratified Register row grounding to one of the FRs / a risk
  retired here.
