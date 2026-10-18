<!-- ⚠ TRANSITIONAL NORMATIVE SOURCE — do NOT delete yet.
Completeness VERIFIED (2026-07-16): docs/reference/atlas-*.md carries every invariant (A-1..A-18), the
data model, tools, persistence, discovery, and the node lifecycle. BUT every reference file currently
GROUNDS to this monolith as its normative source (no atlas code exists yet — per docs/CONVENTIONS.md,
reference grounds to code; with no code, it grounds here). This file is RETAINED as the source until the
atlas code lands and the reference re-grounds to source@sha — then it retires. Do not add new content
here; add it to the relevant reference/atlas-*.md. -->

# The Atlas — Specification

> **Phase:** DEFINE (the normative spec). **Status:** draft v0 for ratification.
> **Companion:** the prose [product design](../design/atlas.md) · the one-pager [`atlas-concept.html`](../atlas-concept.html).
> This is the _contract_ — precise enough that a seat transcribes against it and CI fences it. Keywords
> **MUST / MUST NOT / SHOULD / MAY** are normative. This spec is faithful to the Atlas concept as designed
> for Maestro; deltas introduced for Orchestra are marked **[Δ Orchestra]**.

---

## 1. Scope

This spec defines the Atlas: the grounded knowledge layer that is Orchestra's layer 0. It covers the data
model, the truth invariants, the node lifecycle, the read/write tool surface, persistence, and the
acceptance criteria. It does **not** cover the Conductor, the seats' internals, or the DEFINE/DESIGN
personas — those consume the Atlas; they are specified elsewhere.

**The Atlas holds two content kinds: Knowledge and Memory.** Both live in the _same_ Atlas — the same
content-addressed hashed index (§3.5–3.6), the same grounding primitive (§3.1), the same templated-write
rule (A-13), the same portable export (A-8). They are **distinct and never conflated**: **Knowledge** is
shared, grounded to the codebase, project-level (this document); **Memory** is member-scoped — per seat
_and_ the orchestrator, in three types (task/pr/project) — specified in [memory.md](./memory.md). A Memory
entry MUST NOT be stored as shared Knowledge, and a Knowledge fact MUST NOT be stored as Memory (a shared
graph holding one agent's private hunches becomes inoperable garbage; private craft treated as project
truth becomes false shared belief). **But they are parts of one Atlas, not two systems.** See the
[product design §2](../design/atlas.md#2-knowledge-and-memory--two-parts-of-one-atlas).

## 2. Vocabulary

| Term             | Meaning                                                                                                                                                                                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Knowledge**    | **shared, grounded, project-level** truth about the codebase — the Atlas. Evolves by edit/supersede.                                                                                                                                                                                       |
| **Memory**       | **scoped, per-member** craft/experience — a _separate_ layer, out of this spec. Never merged into Knowledge.                                                                                                                                                                               |
| **Territory**    | a region of the repo (directory/module granularity) with an owner, a criticality tier, and a day-one blast radius.                                                                                                                                                                         |
| **Grounding**    | the content-addressed receipt of a fact: a `StructRef` anchored by the BLAKE3 `subtreeHash` of the cited code's AST subtree (§3.1). Line-ranges are display-only, never the drift oracle.                                                                                                  |
| **subtreeHash**  | BLAKE3 hash of the cited structural unit's AST subtree, taken over the unit's **raw source slice** (NFC-normalized only) — the drift oracle (§3.1). An edit that does not TOUCH the unit MUST NOT change it; a real change to the unit MUST. A reformat OF the unit DOES change it (§3.1). |
| **Fact / node**  | a unit of knowledge. Two families: **advisory** (a grounded claim) and **predicate** (a checkable statement with a `HOLDS/BROKEN/NA` verdict).                                                                                                                                             |
| **Tier**         | criticality: `T0` (must-be-right), `T1` (load-bearing), `T2` (default).                                                                                                                                                                                                                    |
| **Freshness**    | `FRESH` (grounding re-checks) or `DRIFTED` (source moved).                                                                                                                                                                                                                                 |
| **Pack**         | a territory's retrieval unit: ≤~2K tokens of its `tier≥T1` invariants, staleness-flagged.                                                                                                                                                                                                  |
| **Candidate**    | a proposed, un-ratified fact in staging (from the explorer).                                                                                                                                                                                                                               |
| **Blast radius** | the reverse-dependency closure of a file/territory (who breaks if it changes).                                                                                                                                                                                                             |

## 3. Data model (normative shapes)

Types below are the seam. Identity is **content-addressed**; grounding and status are **out of identity**
(they are recomputed side-indexes).

### 3.1 Grounding — the trust primitive (structural anchor, not line-ranges)

Grounding anchors a fact to a **structural unit** of the code, identified by the hash of its subtree —
**not** to line numbers. Line numbers are fragile: an import added above, or an unrelated rename elsewhere,
shifts them and would drift a fact whose code did not change (a false `BROKEN`). The anchor is therefore a
content-addressed **structural ref**, and line-ranges are demoted to display metadata.

```
Grounding      = { entries: GroundingEntry[] }          // sorted by anchor
GroundingEntry = {
  anchor:     StructRef,   // the drift oracle — a content hash of the structural unit's raw source slice
  path:       string,      // repo-relative, for humans/navigation
  displayLines?: string,   // OPTIONAL navigation hint ("42-50") — NEVER the drift oracle
}
StructRef = { kind:'symbol'|'block'|'file', qualifiedPath: string, subtreeHash: string }
```

- **The drift oracle is `subtreeHash`**, computed over the cited unit's **raw source slice**
  (`src.slice(startIndex, endIndex)`), NFC-normalized only by `canonicalForm`. An edit that does not TOUCH
  the cited unit MUST NOT drift a fact; a real change to the cited unit MUST.
  - ⚠️ **AMENDED 2026-08-02 (HONESTY-TAPROOT) — this bullet previously specified a normalizer that was
    never built.** It read: _"computed over the unit's **normalized** AST subtree (whitespace,
    comments-if-configured, and De-Bruijn/param-name/lifetime noise erased — reuse v1's `SymRef` /
    `normalizedSignature`)"_. No such normalization exists in the product; the hash is over raw bytes. The
    consequence, stated plainly rather than left implicit: **a reformat OF the cited unit DRIFTS the fact.**
    That is a false alarm, and it is ACCEPTED. Any cheap normalization over raw text also erases whitespace
    that is SEMANTIC in TS/TSX — string, template and regex literals, JSX text, ASI — and the trade is
    asymmetric: a false alarm costs one re-ground, a false negative lets the truth gate serve `HOLDS` on a
    stale fact. Delivering the normalizer is REFUSED, not deferred. See `req-grd.md#REQ-GROUND-5b`.
- **Hash function: BLAKE3** (`[Δ Orchestra]`, replacing v1's SHA-256), chosen because it is _internally a
  Merkle tree_ — the same hash yields the hierarchical, incrementally-verifiable index of §3.5. Behind the
  `@orchestra/kernel` encoder seam, so it is swappable; correctness does not depend on the choice,
  performance + subtree-verifiability do.
- **Fallback:** a non-parseable file (`kind:'file'`) anchors on the BLAKE3 of its bytes — the weakest rung,
  isolated to where structure is unavailable. Line-ranges alone are NEVER a valid anchor.
- A `Grounding` is **real** iff it has ≥1 entry and every entry carries a non-empty `subtreeHash`.
- An unresolvable citation (unit gone, path absent) MUST fail closed — dropped from `ground()`, treated as
  `DRIFTED` by `driftDetect()`. It MUST NOT throw.

### 3.2 Facts (nodes)

```
AdvisoryNode  = { kind:'advisory',  id, tier, claimNorm, grounding, freshness,
                  claims: ClaimEntry[], authoring:'ADVISORY'|'SUPERSEDED' }
PredicateNode = { kind:'predicate', id, tier, check, grounding, status, freshness,
                  claims: ClaimEntry[], authoring:'PREDICATED'|'SUPERSEDED' }

ClaimEntry    = { claimNorm, claimText, provenance }
Provenance    = { source, trusted: boolean, sha? }      // untrusted → advisory, excluded from the gate
Status        = 'HOLDS' | 'BROKEN' | 'NA' | 'advisory'  // a recomputed side-index, never in identity
```

- `id` MUST be minted only through the canonical encoder (a hash of the node's canonical form); it MUST
  NOT be hand-rolled. Two independent encoders MUST agree byte-for-byte.
- A write is an **upsert**, never a blind insert (§4 A-12): an identical `id` is idempotent; claims about
  one subject merge by set-union. A _changed_ **advisory** fact is **edited in place** (git preserves the
  prior — the repo's history is the archive); a _changed_ **predicate** fact **supersedes** (mints a new
  node, identity = its `check`; old retained via `supersededBy` + lineage). The store MUST NOT hold rival
  duplicate/stale nodes for the same subject.
- **[Δ Orchestra]** Both families ship **day-one** (ratified — matches [KNOW-9](../reference/atlas-knowledge.md)):
  the **advisory** family (a grounded claim, no verdict) and the **predicate** family (checkable `check` +
  mechanical `HOLDS/BROKEN/NA`). The store still operates on **advisory alone** when no evaluator is wired,
  but the predicate family is **not** deferred.

**Canonical form — the named, CI-gated identity contract `[Δ Orchestra]`.** `id = Encoder.hash(canonicalForm(node))`
holds _only_ if `canonicalForm` is **one** deterministic byte-string across every implementation. It is pinned
to **RFC 8785 (JSON Canonicalization Scheme, JCS)** — or a **stricter subset** of it — with these hard rules,
so two encoders in two languages MUST emit the identical preimage ([KERNEL-1/2](../reference/atlas-kernel.md)):

- **No floats in the preimage.** The canonical form MUST NOT contain IEEE-754 floating-point numbers; numbers
  MUST be integers (or exact decimal strings). JCS float serialization is a cross-language divergence source
  and is **forbidden** — a fact carrying a float MUST be rejected fail-closed, never silently rounded.
- **Unicode NFC.** Every string MUST be normalized to **Unicode NFC** before hashing; a non-NFC string is
  normalized (or rejected), never hashed as-is — two canonically-equal strings MUST NOT key two objects.
- **One fixed string-escape policy.** Exactly the JCS escape rules (minimal escaping, `\uXXXX` only where
  required, no gratuitous escapes); the policy MUST NOT vary by encoder.
- **Sorted keys, no insignificant whitespace** (JCS): object-key order and spacing MUST NOT enter identity.
- **Conformance corpus (CI-gated).** A **language-agnostic test-vector corpus** (input object → expected
  canonical bytes → expected digest) MUST live beside the encoder seam; **every** encoder implementation MUST
  reproduce it **byte-for-byte in CI**. This corpus is what turns KERNEL-1's "two encoders agree" from an
  aspiration into a **build gate**: a float / Unicode-form / key-order / escape divergence fails CI, so it can
  never silently store **two** CAS objects for one fact or fork the convergent fold with no error.

### 3.3 Territory & structure

```
Territory = { path, owner, tier, files[], regions?, blastRadius }
Edge      = { kind:'depends-on'|'composition'|'citation'|'coverage', from, to… }
```

- The **structural plane** — territories + `depends-on` edges + blast radius — MUST be **mechanically
  derived** from the real file tree/import graph, `$0`-LLM, and MUST be reconstructable at any time.
- A territory's blast radius MUST be the union of the reverse-closures of its files (empty edges → an
  honestly empty blast radius, never fabricated).

### 3.4 Pack (retrieval)

```
Pack = { territory, axisHash, invariants: PackInvariant[], tokenEstimate, stale }
PackInvariant = { nodeId, tier, claim }   // 1-line structured, never a prose blob
```

- A pack MUST carry every `tier≥T1` invariant of its territory and MUST be `≤ ~2K` tokens.
- `stale` MUST be `true` iff any grounding backing the pack has drifted.
- A malformed/missing territory MUST yield an empty pack, never a throw.

### 3.5 The structural index — one tree, two jobs (drift + discovery) `[Δ Orchestra]`

A single hierarchical, content-hashed index backs both drift detection and knowledge discovery:

```
repo → crate/package → module → file → item (fn/type) → block
```

- Each level carries the BLAKE3 hash of its subtree (the Merkle property is native to BLAKE3, §3.1). A
  change re-hashes only the affected path from leaf to root; every unaffected subtree keeps its hash, so
  facts anchored there stay `FRESH`.
- **The dependency axis ADDRESSES; it does not COMMIT.** A dependency-axis node's `subtreeHash` is the
  identity of its path (`id({file: path})`) and carries no content, so the leaf-to-root re-hashing above
  does **not** apply to it: the axis is **not** a freshness oracle, and an anchor on it is **not** a
  grounding.
- The **same** index resolves a `path` (file / folder / module / crate) to its territory and its facts —
  this is what makes knowledge **discoverable by scope** (§6.1). Drift and discovery are one structure,
  not two.

### 3.6 Retrieval — a hashed structural index, NOT embeddings/RAG `[Δ Orchestra]`

**Hard rule: the Atlas uses no embeddings and no RAG — ever.** Retrieval is a **deterministic hashed
structural index** over the content-addressed store (a Bazel-style CAS: every object — structural node,
Knowledge fact, Memory entry — keyed by its BLAKE3 hash; the store is `hash → object`; export = the CAS
dump). Objects are organized in _our_ typed format (§3.2), not a generic document store. Relevance is
resolved three ways, all deterministic:

1. **By scope (path).** Resolve a path to its node(s) in the tree (§3.5) and collect the facts anchored
   there, rolled up along the hierarchy (a file query also surfaces its module's and crate's invariants).
2. **By dependency.** Follow `depends-on` edges (blast radius) to pull facts about what the code depends on
   and who depends on it — relevance via the **real graph**, not similarity.
3. **By trigger/tag.** Cross-cutting rules (protocols) carry territory/pattern triggers and attach by match.

The index **is** the drift oracle: because retrieval keys on subtree hashes, a stale entry (anchor hash ≠
current) is visible at query time and excluded/flagged — no separate staleness pass, no re-embedding.

**The trade, stated honestly:** this drops fuzzy "vaguely-related" recall. Relevance MUST be expressible
structurally (path / dependency / tag). In exchange the Atlas is deterministic, `$0` (no embedding model),
never index-stale, auditable, and self-checking — the right trade for knowledge grounded in code.

## 4. Invariants (the guarantees — each is falsifiable)

| #                                         | Invariant                                   | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------- |
| **A-1 Truth-gate (M2)**                   | A fact never self-declares true.            | The only path to a served `HOLDS` is `isGrounded ∧ driftDetect==FRESH`. An ungrounded or drifted `HOLDS` candidate MUST downgrade to `NA`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **A-2 Fail-closed write**                 | Ungrounded facts don't enter.               | `emit` MUST reject (no persist) a node whose grounding does not re-derive at `source@sha`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **A-3 Drift → BROKEN blocks merge**       | The map can't rot silently.                 | At merge-reconcile, exactly the `DRIFTED` subset flips `BROKEN`; any `BROKEN` flip is a **blocking** verdict (exit 2), never a silent green.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **A-4 Bounded re-author**                 | Drift is proportional.                      | Reconcile re-authors `==                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | DRIFTED | `, never `N` (the whole store). |
| **A-5 Empty & honest**                    | Knowledge starts un-authored.               | Move-in output MUST carry zero invariants; every territory ships the `T2/advisory` default by construction.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **A-6 T0 human-only**                     | Criticality isn't auto-assigned.            | A `T0` tier MUST NOT be auto-promoted; heuristics MAY only _flag_ a candidate for human ratification.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **A-7 Propose ≠ ratify**                  | Miner ≠ acceptor.                           | The explorer MAY only write **candidates** (staging); ratification is the lead/reconcile's, with reviewer veto and billy required for T0.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **A-8 Portable / no lock-in**             | It's yours.                                 | The full store MUST export to open JSON that replays 1:1 into a fresh store; no proprietary encoding, no external reference.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **A-9 Provenance**                        | Every claim has a receipt.                  | Each written claim MUST carry `Provenance`; an `untrusted` source is advisory and excluded from the gate.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **[Δ] A-10 Fed or why-not**               | The store can't go empty unnoticed.         | A sealing wave MUST have fed the Atlas (`ResultCard.absorb`) or emitted a grounded why-not; a probe records it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **[Δ] A-11 Reconstructable**              | Truth is a fold, not a blob.                | The Atlas state MUST be reconstructable by folding the append-only event log; no capability depends on a mutable in-place snapshot.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **A-12 Edit-over-append**                 | Knowledge stays current, not a landfill.    | A write MUST be an upsert (§3.2): re-emitting an unchanged fact is idempotent; a subject's claims merge by set-union. A _changed_ **advisory** fact is **edited in place** — git preserves the prior version (the repo's own history is the archive; rewind a PR ⇒ the Atlas rewinds), no in-store lineage pile. A _changed_ **predicate** fact **mints a new node and supersedes** the old (identity = its `check`; head advances, old retained as lineage). Querying a territory MUST return one _current_ node per subject, never a history pile. The append-only **event log** and the edited/superseded **knowledge** it folds to are distinct: events accrete, facts evolve. |
| **A-13 Templated write**                  | No free prose, ever.                        | Every fact MUST be written against a fixed, per-kind **template** (declared fields + a hard char/token cap + rules), not free text. A write that doesn't fill its template's required fields, or exceeds its cap, is rejected fail-closed. (Same rule binds every Memory type — see [memory spec](./memory.md).)                                                                                                                                                                                                                                                                                                                                                                   |
| **A-14 No embeddings / no RAG**           | Retrieval is deterministic.                 | The Atlas MUST NOT use embeddings, vector similarity, or RAG. Retrieval is a hashed structural index (§3.6) resolved by scope / dependency / trigger only. Two identical queries MUST return identical results; there is no nearest-neighbor fuzz and no embedding model in the system.                                                                                                                                                                                                                                                                                                                                                                                            |
| **A-15 Proactive, location-scoped tools** | Knowledge pokes; the tool list stays small. | Entering a scope MUST poke the navigator with that scope's pack (push) and expose its nodes as tools (pull); only the **current** scope's nodes may be exposed at once (retracted on leaving). The whole graph MUST NOT be exposed as tools simultaneously.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **A-16 Nothing dies**                     | Versioned, never deleted.                   | No memory or knowledge is ever deleted; superseded/decayed/closed entries are **archived** (deduped), retained and re-spawnable. All of it travels with the repo (commit/PR/branch/fork) — git-native, via tracked store + commit trailers + `refs/notes/orchestra`. "Decay" = leaving the _active/injected_ set only.                                                                                                                                                                                                                                                                                                                                                             |
| **A-17 Per-agent provenance**             | Every run is accounted for, in git.         | Every ephemeral agent's WP MUST record `model`, tokens (input/output/cache), tool-uses, wall-time, retries/reworks, gates, verdict, and `transcriptSha` — committed via the event log + git note/trailer.                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **A-18 Re-invokable**                     | Redispatch + replay, portable.              | Any ephemeral agent MUST be re-invokable from the versioned record as **(a) idempotent redispatch** (same brief → same seat) **+ (b) faithful replay** of the recorded transcript for audit, on another machine / user / fork, with no non-git state required. Deterministic _resume_ from where it stopped MUST NOT be claimed (hosted models are nondeterministic; side effects don't rewind).                                                                                                                                                                                                                                                                                   |

## 5. Lifecycle

A node moves through a fixed set of events (deterministic unless noted):

```
author_on_miss → (index_T0) → author_predicate → merge_recheck → drift_detect
              → reconcile (unchanged | changed→BROKEN | advisory) → [supersede] | trivial_reject
```

- **drift_detect** and **merge_recheck** MUST be deterministic (pure re-hash at the grounding).
- **supersede** retains the old node, addressable, with a `supersededBy` link and an ordered lineage
  (old→new) — history is never destroyed.
- Every `(event, state)` pair that is invalid MUST return a structured rejection, never throw.

## 6. Tool surface (read/write API — CLI + MCP parity)

Five tools, each **pure + total** (a malformed arg fails closed to an honest empty verdict), each shipping
its own `next + invariant` guidance. Two of the five are governed write doors (`atlas-emit`, `atlas-link`);
the rest read/derive (ADR-0003):

| Tool              | Does                                        | Contract                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `atlas-init`      | `$0`-LLM structural move-in                 | returns the territory skeleton + blast radius + T0-candidate flags; auto-promotes nothing (A-5, A-6).                                                                                                                                                                                                                                                                                                              |
| `atlas-query`     | a territory's pack                          | returns a `≤2K` **governing** pack of `tier≥T1` invariants, beside a separately capped ADVISORY band of `T2` machine proposals no ratifier saw (ADR-0013, owner-ratified 2026-08-03; INV-TOOLS-6 amended 2026-08-04); `stale:true` ⇒ re-ground before trusting (§3.4 pack/stale rule; A-1 truth-gate).                                                                                                             |
| `atlas-emit`      | fail-closed grounded write                  | re-derives the citation `@sha`; ungrounded ⇒ rejected, not persisted (A-2).                                                                                                                                                                                                                                                                                                                                        |
| `atlas-reconcile` | merge-time drift → BROKEN                   | flips the `DRIFTED` subset `BROKEN`; exits 2 to block the merge on any flip (A-3).                                                                                                                                                                                                                                                                                                                                 |
| `atlas-link`      | governed sameAs assertion **or retraction** | links two existing nodeKeys as the same fact after authz-over-the-merged-class + a ratifier (`billy` when any class member is `T0`); a non-destructive read-side equivalence edge, never a merge. With `--retract` / `retract:true` it WITHDRAWS a previously asserted equivalence through the SAME gates — an APPEND, never a delete, and the class splits on the next read (ADR-0003, incl. §Retraction / A-D3). |

- Every tool MUST be callable identically over the CLI and over MCP, with a published input schema.
- **[Δ Orchestra]** the write path (`atlas-emit` at wave-close) is driven by `ResultCard.absorb`, not a
  separate authoring ritual (A-10).

**Governance surface ≠ advertised surface.** The five tools above are the _governance_ surface, of which
exactly two are write doors. Alongside them the product exposes a **`READ_SURFACE`** — a disjoint set that
carries **zero write authority** (the authoring planners `atlas-anchors`/`-slots`/`-draft`/`-check`, plus
the read projections `doctor`/`node`/`diff`). Both sets are advertised over MCP and reachable from the CLI;
neither `GOVERNANCE_SURFACE` (5) nor `WRITE_PATHS` (2) grows as a result. See
[ADR-0005](../adr/ADR-0005-mcp-read-surface.md).

### 6.0 Authoring — how a fact is prepared before it reaches a write door

The truth gate re-derives every grounding at emit time, which makes a valid fact **mechanically expensive
and semantically cheap** to produce: its `subtreeHash` and identity can only be computed by running the
index. The authoring surface closes that gap without adding write authority — every door below computes a
payload and persists nothing, exactly as `atlas doctor reground` already does.

| Door            | Does                                | Contract                                                                                                                                                                                                                                                                                   |
| --------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `atlas-anchors` | list where a fact can be grounded   | returns the built index's units under a path (`qualifiedPath` · kind · current `subtreeHash`) + the rev, and **declares** any language it has no grammar for rather than silently degrading (AUTHOR-3/4).                                                                                  |
| `atlas-slots`   | the claim vocabulary                | returns the closed `PredicateSlot` union, derived from the union itself so it cannot go stale (AUTHOR-5).                                                                                                                                                                                  |
| `atlas-draft`   | compose a fact the door will accept | the author supplies anchor + slot + claim; identity, grounding, and rev-stamp are computed; the draft states whether it will auto-accept or need full ratification, and whether it is a CREATE or an UPDATE (AUTHOR-6/7/9/10). Retire is a draft variant — **not** a new door (AUTHOR-13). |
| `atlas-check`   | dry-run the write                   | evaluates the _same gates in the same order_ as the governed door and names which one would refuse and what would fix it; persists nothing (AUTHOR-11/12).                                                                                                                                 |

Two properties bind the surface to the rest of the product: **one grounding computer** — planners and the
truth gate derive through a single seam, never two (AUTHOR-1) — and **round-trip acceptance** — a fact
drafted at rev `R` and emitted `--at R` on an unchanged repo is accepted (AUTHOR-8). Full normative text:
[`reference/atlas-authoring.md`](../reference/atlas-authoring.md); rationale:
[ADR-0004](../adr/ADR-0004-authoring-planner-doors.md).

### 6.1 Discovery — path-addressed, tool + hook `[Δ Orchestra]`

Knowledge for the code someone is touching MUST surface _without being asked_ — the "magically available"
requirement. It resolves through the structural index (§3.5) and reaches the worker two ways (the SDK
triad: a Skill teaches the call, a Hook injects it):

- **As a tool.** `atlas-query <path>` accepts any scope — a file, folder, module, or crate — resolves it
  through the index to the covering territory/-ies, and returns the merged pack. Callable by any agent,
  LLM, or human, over CLI + MCP.
- **As proactive injection (hook).** When the working context enters a territory (a PreToolUse/edit touches
  a path under it), a hook resolves `path → territory → pack` and injects it — no explicit call. Injection
  is subject to the pack bound (`≤ ~2K`, §3.4); a `stale` pack MUST be re-grounded before it is trusted.

### 6.2 Nodes as tools — proactive, location-scoped `[Δ Orchestra]`

The graph **projects into an MCP tool surface**: any node (Knowledge fact or Memory entry) that covers the
navigator's current scope is reachable as a tool that injects its context. Two dynamics, tied to
navigation:

- **Poke (push).** As an LLM navigates the repo and **crosses into a new scope** (a file/folder/module/
  crate — inferred from the paths in its tool calls), a hook fires a **poke**: it injects a compact notice
  - that scope's pack, unasked. Knowledge announces itself where it applies.
- **Tool (pull).** The nodes covering the current scope are **exposed as MCP tools** right there, so the
  LLM can drill (scope → node → grounding) on demand.
- **Location-scoped, for scale (MUST).** Only the current scope's nodes are exposed as tools at once; on
  leaving the scope they retract. Exposing the whole graph as tools at once would flood the context with
  schemas and is forbidden — the tool surface is **dynamic**, following where the navigator is.

This stays fully deterministic (structural addressing, no RAG — A-14); it only makes retrieval _pushed at
the right moment_ rather than waited-for.

## 7. Persistence, versioning & re-spawn `[Δ Orchestra]`

The Atlas is **git-native**: it is a _living part of the repo's version control_, not a sidecar. Everything
travels with the repo at every commit/PR/branch/fork/merge, by construction. This is the Maestro
provenance model (git notes + commit trailers + archive-not-delete), elevated to law.

- **Content-addressed store.** Node ids = hashes of canonical form; grounding = the structural `subtreeHash`
  (§3.1, BLAKE3). State is a **fold over the append-only event log** (A-11) — reconstructable, versioned.
- **Provenance lives in git itself.** Per WP: a commit **trailer** block + a **git note** (`refs/notes/
orchestra`) carrying `WP / Model / Gates / Verdict / Transcript-SHA` — so it moves with the commit
  automatically, across clone/fork/machine.
- **Nothing dies — archived, not deleted.** The _hot_ set stays lean (injected project memory,
  current-truth knowledge); everything else is **archived** (deduped, merge-on-rerun-never-loses-data). A
  superseded fact, a decayed memory, a closed task — all retained, versioned, retrievable, re-spawnable.
  "Forgetting" means _leaving the active/injected set_, never leaving the repo.
- **Per-agent provenance & metering, committed.** Every ephemeral agent's WP records, in the event log +
  dossier: `model`, tokens (`input/output/cache`), tool-uses, wall-time, **retries/reworks**, gates,
  verdict, and the `transcriptSha`.
- **Transcript is a content-addressed large object, fetch-on-demand (ratified 2026-07-16).** Retained in
  **full — never truncated or lossily compressed** (owner law). Its SHA is committed as attestation; the
  body is stored as a **content-addressed large object** (git-LFS / partial-clone `blob:none` semantics or
  an equivalent CAS large-object store) with only its **hash pointer** in git — full, lossless, versioned,
  **fetch-on-demand** so a routine clone no longer drags every MB. This **revises** the earlier in-tree
  placement (which forced a `.git` bloat-vs-history-rewrite dilemma); the content-addressed object delivers
  full + transparent + re-spawnable losslessly, trading "in every default clone by construction" for
  "content-addressed + fetch-on-demand". Because the object is immutable and hash-referenced, a
  **credential/secret scrub MUST pass before it is written** — **redact-at-source primary**, a ≥2-engine
  scanner (client + server-side pre-receive) as backstop; nothing reaches the store unscrubbed (mirrors
  [PERSIST-10/10a](../reference/atlas-persist.md)).
- **Re-invokable anywhere = redispatch + replay, not deterministic resume.** Because the whole record is
  versioned git state, any ephemeral agent is **idempotently redispatchable** — same brief → same seat
  (A-18) — for another user, on another machine, from a clone or fork, and its recorded transcript is
  **faithfully replayable** for audit. A hosted model is nondeterministic and side effects do not rewind,
  so "resume from exactly where it stopped" is **not** claimed (mirrors [PERSIST-10b](../reference/atlas-persist.md)).
- **Export** MUST still be an open JSON dump that replays 1:1 (A-8) — no lock-in on top of git.

### 7.1 Where it lives — attached to commits and PRs, via a host adapter `[Δ Orchestra]`

Memory and Knowledge do not sit in a sidecar database — they live **inside the git host the user uses**
(GitHub, GitLab, Gitea, Bitbucket, …), attached to its native objects:

- **On commits:** git notes (`refs/notes/orchestra`) + commit trailers carry per-commit provenance/metering
  and the knowledge-delta. Pure git — portable, travels with the object.
- **On PRs:** the PR's memory — the PR-memory, the orchestrator's logbook entry _for that PR_, and the
  knowledge-delta the PR ratified — is attached to the **actual PR** (a body section / a structured
  Orchestra comment / metadata) via the host's API.

A **host adapter** abstracts the service: `attachToCommit(sha, …)` / `attachToPR(prId, …)` + their reads,
one implementation per host (GitHub/GitLab/Gitea/Bitbucket/plain-git). Host-agnostic by construction.
_(A different axis from the agent-runtime host adapter — this one targets the git forge, not the IDE.)_

**Source of truth stays git-native — so re-spawn (A-18) holds.** The portable source is the tracked store +
commit notes, present in any clone/fork on any machine; the **PR attachment is a first-class surface** the
adapter renders onto the host (so it truly lives inside GitHub, visible and attached) and is
reconstructable from the git-native source. Two caveats the adapter MUST handle, or the "it's on GitHub"
claim fools us:

- `git push` does **not** push `refs/notes/*` by default — the adapter MUST configure the refspec.
- Host-side PR data (comments/body) does **not** arrive with a bare `git clone` — hence the git-native
  store is the source, the host surface is a projection.

## 8. Acceptance criteria (the `atlas-acceptance` fences — falsifiable)

Each maps to an invariant; each is a test that MUST fail if the invariant is violated.

1. **Structural drift, not line drift.** A real change to the cited structural unit ⇒ `DRIFTED`; an import,
   or a _blank-line-separated_ license/file header added _above_ it, or an unrelated rename _elsewhere_, ⇒
   still `FRESH`. A reformat OF the cited unit ⇒ `DRIFTED` (the oracle hashes raw bytes — an accepted false
   alarm, §3.1). An edit to a comment _contiguous_ (no blank line) with the cited declaration ⇒ `DRIFTED` —
   it is the declaration's bound leading doc-comment, so classification is by contiguity, not file position
   (ADR-0014). _(A-1, §3.1)_
   <!-- AMENDED 2026-08-02 (HONESTY-TAPROOT): "a reformat … ⇒ still FRESH" was never delivered; the
        acceptance test as written could only pass on a fixture that held the hash constant by hand.
        AMENDED 2026-08-09 (ADR-0014, owner-ratified): the header-above leg is FRESH only when
        blank-line-separated; a contiguous leading comment is a bound doc-comment and DRIFTS the unit. -->
2. **Ungrounded reject.** `atlas-emit` of a node with no resolvable citation ⇒ `emitted:false`, nothing
   persisted. _(A-2)_
3. **Drift blocks the merge.** A merge that drifts a fact ⇒ `atlas-reconcile` reports `BROKEN` non-empty ⇒
   exit 2. _(A-3)_
4. **Bounded re-author.** Drifting `k` of `N` facts ⇒ `reauthorCount == k`. _(A-4)_
5. **Empty move-in.** `atlas-init` on any tree ⇒ zero invariants; all territories `T2/advisory`. _(A-5)_
6. **No T0 auto-promote.** A territory matching a T0 keyword ⇒ `t0Candidate:true` **and** `tier=='T2'`. _(A-6)_
7. **Propose ≠ ratify.** The explorer path can only stage candidates; no explorer write reaches the
   committed store without a reconcile. _(A-7)_
8. **Round-trip export.** `export → import` yields a byte-identical store. _(A-8)_
9. **Pack bound.** Every pack `≤ ~2K` tokens and carries every `tier≥T1` invariant of its territory.
10. **[Δ] Fed-or-why-not.** A sealing wave with no `absorb` and no why-not ⇒ the probe records a violation.
11. **[Δ] Fold reconstruct.** Replaying the event log rebuilds an identical Atlas.
12. **Totality.** Every tool + seam returns a structured empty/rejection on malformed input; none throws.
13. **Edit-over-append.** Emitting a _changed_ fact about a known subject ⇒ no duplicate: a changed
    **advisory** is edited in place (git keeps the prior), a changed **predicate** is superseded; a
    territory query returns one current node per subject, not a history dump. _(A-12)_
14. **Knowledge/Memory no-conflation.** No per-member Memory write lands in the shared **Knowledge** kind;
    a seat-craft lesson MUST NOT become a shared Knowledge fact (both live in the one Atlas). _(§1 boundary)_
15. **Discovery by scope.** `atlas-query` on a file, folder, module, and crate each returns the merged pack
    covering that scope; entering a territory injects it via the hook, unasked. _(§6.1)_
16. **Templated write.** A fact missing a required template field, or over its cap, is rejected; no
    free-prose fact is ever persisted. _(A-13)_
17. **Deterministic retrieval.** Two identical queries return byte-identical results; grep the codebase —
    there is no embedding model, vector store, or RAG call anywhere in the Atlas. _(A-14)_
18. **Poke & scope.** Navigating into a module pokes its pack and exposes only that scope's node-tools;
    leaving retracts them; the tool list never holds the whole graph. _(A-15)_
19. **Nothing deleted.** Supersede a fact, decay a memory, close a task ⇒ each is present in the archive
    and re-spawnable; no code path deletes a memory/knowledge entry. _(A-16)_
20. **Provenance in git.** After a WP seals, its `model`/tokens/tools/wall-time/retries/verdict/
    transcriptSha are readable from the git note + trailer on the commit. _(A-17)_
21. **Re-spawn on a clean clone.** Clone the repo on another machine (no sidecar state) ⇒ an ephemeral
    agent re-spawns from the versioned record and idempotently reproduces its WP. _(A-18)_

## 9. Open spec questions (to ratify)

- **`GROUNDED` threshold by claim class** — how many independent corroborations, code vs web.
- **Territory granularity** — directory vs symbol-level regions, and when append-only regions
  (registries/barrels) permit union-merge.
- **cv (canonicalization version) & migration** — do we need replayable `old→new` id migration on a spec
  bump on day one, or defer until a canonicalization-version bump actually occurs?
- **Skeleton→deep-mine trigger** — the exact signal that turns an advisory-only skeleton territory into a
  dispatch of the explorer.
