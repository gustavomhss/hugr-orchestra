# atlas-knowledge — Reference

> owner: reconcile/lead (write = ratify) · propose = jimmy (explorer) · grounding: claims cite [spec/atlas.md](../spec/atlas.md) §§1–8; drift-checked in CI (rosie) · status: draft

## Purpose

The **Knowledge** kind of the Atlas: the shared, grounded, project-level truth about the codebase. One of
the Atlas's two content kinds (the other is per-member [Memory](./atlas-memory.md)); both live in one
substrate — same content-addressed hashed index, same grounding, same templated write, same export — and
are never conflated. This reference specifies the Knowledge shapes, invariants, tool surface, and fences.
The Memory kind is specified separately in [atlas-memory.md](./atlas-memory.md).

## Data model

Identity is **content-addressed** (a node id is the BLAKE3 hash of its canonical form; two independent
encoders MUST agree byte-for-byte). Grounding and status are **out of identity** — recomputed side-indexes.

```
GroundedFact  = AdvisoryNode | PredicateNode

AdvisoryNode  = { kind:'advisory',  id, tier, claimNorm, grounding, freshness,
                  claims: ClaimEntry[], authoring:'ADVISORY'|'SUPERSEDED' }
PredicateNode = { kind:'predicate', id, tier, check, grounding, status, freshness,
                  claims: ClaimEntry[], authoring:'PREDICATED'|'SUPERSEDED' }

ClaimEntry    = { claimNorm, claimText, provenance }
Provenance    = { source, trusted: boolean, sha? }     // untrusted → advisory, excluded from the gate
Status        = 'HOLDS' | 'BROKEN' | 'NA' | 'advisory' // recomputed side-index, never in identity
Freshness     = 'FRESH' | 'DRIFTED'
Tier          = 'T0' | 'T1' | 'T2'                     // must-be-right / load-bearing / default
Candidate     = a proposed, un-ratified fact in staging (from the explorer)
```

**Node families (both ship day-one — owner decision).** `advisory` is the flat, honest default (a grounded
claim, no verdict). `predicate` adds a checkable `check` + mechanical `HOLDS/BROKEN/NA`. Both are available
from day-one; the store still operates on advisory alone when no evaluator is wired (KNOW-9).

**Grounding** anchors a fact to a structural unit by the BLAKE3 hash of its subtree, taken over the unit's
raw source slice (NFC-normalized only) — never to line numbers. Full shape and the drift-oracle rules are in [spec §3.1](../spec/atlas.md) (the grounding
reference). A `Grounding` is real iff it has ≥1 entry, each with a non-empty `subtreeHash`.

**Structure.** `Territory = { path, owner, tier, files[], regions?, blastRadius }`; `Pack` is a territory's
`≤~2K`-token retrieval unit of its `tier≥T1` invariants (see [spec §3.3–3.4](../spec/atlas.md)).

**Store projection & the read-side `sameAs` relation.** The committed store rehydrates to a
`StoreProjection = { current: nodeKey→CurrentNode, cas, builtAt? }` (`packages/knowledge/src/write/router.ts`)
— one current node per `nodeKey` (KNOW-4g). Two **additive, optional** carriers ride it: `CurrentNode.sameAs`
— the **sorted, de-duped** nodeKeys a human asserted name the SAME fact at an unrelated code site, stored
**symmetrically** on both endpoints (WP-SAMEAS); and `StoreProjection.builtAt` — the git HEAD sha the stored
per-fact freshness was computed against (the **freshness watermark**, N11; stamped at persist by the store
adapter — [ADAPT-STORE-4](./atlas-adapters.md)). Both absent on pre-feature / non-git projections (back-compat).
Like `subsumes` (WP-DEDUP-2), `sameAs` is **derived on read** and **non-destructive** — never a merge:
`deriveSameAs(projection) → SameAs[]` (`packages/knowledge/src/read/sameas.ts`) is a **union-find TRANSITIVE**
equivalence fold over the stored edges into sorted canonical pairs (`a<b`; `A≡B, B≡C ⇒ A≡C`; a dangling peer not
in `current` is ignored, never a throw). Its write side is the pure symmetric reducer
`linkSameAs(projection, a, b) → StoreProjection` (`packages/knowledge/src/write/link.ts`) — **total** (no-op on
`a===b` or an absent endpoint), sorted + de-duped, idempotent.

## Invariants

Each is falsifiable and maps to a spec axiom. `MUST` / `MUST NOT` are normative.

| #                                                                                                                      | Invariant                                                             | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Spec       |
| ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ---------- | ------- | ----------------------------------------------------------- | -------- |
| **KNOW-1** Truth-gate                                                                                                  | A fact never self-declares true.                                      | → see spec **A-1**; enforced in atlas-knowledge (the served-`HOLDS` gate; the structural mechanism is KNOW-3).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | A-1        |
| **KNOW-2** Fail-closed write                                                                                           | Ungrounded facts don't enter.                                         | → see spec **A-2**; enforced by `atlas-emit` (atlas-tools TOOLS-7).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | A-2        |
| **KNOW-3** Structural anchor ⚠️ **AMENDED 2026-08-02 · unit-boundary AMENDED + RATIFIED 2026-08-09 (ADR-0014, owner)** | Grounding is a hash, not a line-range.                                | The drift oracle MUST be the BLAKE3 `subtreeHash`; an import, or a **blank-line-separated** license/file header added **above** the cited unit, and an unrelated rename **elsewhere**, MUST stay `FRESH`; a real change to the cited unit MUST `DRIFT`. **A reformat OF the cited unit DRIFTS** (the oracle hashes raw bytes — accepted false alarm); **a rename OF the cited symbol DRIFTS** (the name is in the anchor key `<parent>::<kind>:<ordinal>[:<name>]`, so the anchor becomes unresolvable and fails closed; there is no rename-tracking); **an edit to a comment CONTIGUOUS with the cited declaration (its bound leading doc-comment) DRIFTS** — ADR-0014 extends the `subtreeHash` preimage over that comment, so classification is by contiguity, not file position. _Was (2026-08-02): "a reformat/rename/import-above MUST stay `FRESH`" — only the import-above leg was ever delivered. The 2026-08-09 amendment qualifies the header-above leg by contiguity and adds the bound-doc-comment DRIFT leg._                                                                                                                                                                                                                                                                                                                                                                | A-1, §3.1  |
| **KNOW-4** Upsert; git is the history                                                                                  | Current, not a landfill — no redundant in-store copy.                 | A write MUST be an upsert: identical fact idempotent; an advisory subject's claims **set-union**. A _changed_ **advisory** fact is **edited in place** — the Atlas is git-native, so its prior version is preserved by the repo's own history (rewind a PR ⇒ the Atlas rewinds). A _changed_ **predicate** (same `check`, new evidence) **supersedes**; a _different_ `check` is a new node (identity includes its `check` — KNOW-15). A territory query MUST return one current node per `(anchor, slot[, check])`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | A-12       |
| **KNOW-5** Drift splits mechanical vs semantic                                                                         | Only _semantic_ rot blocks; a moved anchor doesn't.                   | At reconcile the `DRIFTED` subset MUST be split: **mechanical** (the anchor moved but the claim still re-derives at the new `@sha`) is **auto-re-grounded, no human, no block**; **semantic** (the claim no longer re-derives) flips `BROKEN` and blocks (exit 2). Human re-author count MUST equal `                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | semantic   | `, never ` | DRIFTED | `, never `N`. (Tool surface: `atlas-reconcile` TOOLS-8/13.) | A-3, A-4 |
| **KNOW-6** Empty & honest                                                                                              | Knowledge starts un-authored.                                         | `atlas-init` output MUST carry zero invariants; every territory ships the `T2/advisory` default by construction.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | A-5        |
| **KNOW-7** T0 human-only                                                                                               | Criticality isn't auto-assigned.                                      | A `T0` tier MUST NOT be auto-promoted; heuristics MAY only _flag_ a candidate for human ratification.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | A-6        |
| **KNOW-8** Propose ≠ ratify                                                                                            | Miner ≠ acceptor.                                                     | The explorer MAY write only **candidates** (staging); ratification is the reconcile/lead's, with reviewer veto and billy required for `T0`. A **grounded, low-risk, `T2` advisory** candidate MAY be ratified by the deterministic **fast-path** (KNOW-18) with no human; `T0` / contested / **all predicate** candidates MUST get full human ratification. <br>✅ **AS BUILT TODAY (A-D4; measured task #83, AMENDED by WP-PROMOTE):** both clauses are real. `atlas mine` writes candidates durably to its own sidecar through `commitStaging` and never touches the projection; `atlas promote` reads them back and presents each to the existing `atlas-emit` door, which derives `origin:'promoted'` — a field the payload cannot choose — so the KNOW-18 fast path does **not** apply to a promotion and every staged candidate faces `ratify`. The measurable ("0 explorer writes reach the store except via a ratifier") therefore no longer holds vacuously: from task #83 until that door landed it held because NOTHING read staging back (SEVERANCE, not ratification), and it now holds because the one route that exists runs through the ratifier. Severance is still what protects the EXPLORER half; ratification is what protects the CURATOR half. No new governed surface: `GOVERNANCE_SURFACE` stays 5 and `WRITE_PATHS` stays `{atlas-emit, atlas-link}` (ADR-0008). | A-7        |
| **KNOW-9** Both families day-one                                                                                       | Advisory + predicate from the start.                                  | Both node families MUST be available day-one (owner decision); the store MUST still operate on advisory alone when no evaluator is wired — but the predicate family is **not** deferred.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | §3.2       |
| **KNOW-10** Templated write                                                                                            | No free prose, ever.                                                  | → see spec **A-13**; enforced in atlas-knowledge (per-kind template + the closed `predicateSlot` vocabulary below; KNOW-15).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | A-13       |
| **KNOW-11** Scope ⚠️ **AMENDED 2026-08-03 — OWNER RATIFIED**                                                           | Read universal, write scope-owned.                                    | Every fact MUST carry a `scope`; read is universal (any agent/human), write is the class member's for that territory's scope. Producer identity is carried by `Provenance.source` (KNOW-14), not a separate `owner` field — `owner` was never a gate input (the write door keys on `scope` alone via `inScope`) and is removed from this MUST. _Was: "Every fact MUST carry an `owner` + `scope`; read is universal (any agent/human), write is the owner's (the class member for that territory)." — reverses the `owner` enforcement landed by #178/PR#105 after measurement showed no shipped write path supplies `owner` and `authz()`/`inScope` have zero production callers (the live door gates via a separate `actorInScope`, `adapter-io/policy.ts`)._                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | §ownership |
| **KNOW-12** Nothing dies — git + CAS, no redundant copy                                                                | History is git-provided and CAS-retained, never a duplicated archive. | No fact-history is lost. Prior versions persist as their own **content-addressed CAS objects** (deduped, never byte-copied) plus the repo's git history (rewind a commit/PR ⇒ the Atlas rewinds). **Advisory** edit-in-place keeps **no** lineage pointer — git is the archive; a **predicate** SUPERSEDE adds only a `supersededBy` **pointer** into CAS — a link, not a redundant copy. The working store stays lean (edit-in-place / decay drops from the hot set).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | A-16       |
| **KNOW-13** Born from work                                                                                             | Coverage tracks the work.                                             | Facts MUST be produced only at the three moments (init skeleton → enrich-by-blast-radius → wave-close write), never a repo-wide sweep. A sealing wave MUST have fed the Atlas or emitted a grounded why-not.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | A-10, §8   |
| **KNOW-14** Provenance                                                                                                 | Every claim has a receipt.                                            | → see spec **A-9**; enforced in atlas-knowledge (untrusted source ⇒ advisory, excluded from the gate).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | A-9        |
| **KNOW-15** Deterministic write-decision                                                                               | Create-vs-update is computed, never judged.                           | Whether a candidate **DEDUPs / UPDATEs / CREATEs / SUPERSEDEs** MUST be a pure function of three hashes (see _The write decision_): the candidate's **content hash**; the **`nodeKey`** — `hash(primaryAnchorId ‖ predicateSlot)` for advisory, `hash(primaryAnchorId ‖ predicateSlot ‖ normalize(check))` for predicate (so a distinct `check` is a distinct node, never a sibling-supersede); and the anchor's **`subtreeHash`**. `primaryAnchorId` MUST be **computed mechanically** as the tightest structural unit containing every symbol the claim references — **never an LLM-chosen anchor** (an LLM-picked anchor is the one landfill leak: anchor-granularity drift + slot-overlap fork `nodeKey` across runs for the same real fact). It is move-aware (rename/move never orphans into a spurious CREATE); secondary citations feed drift only, never identity. A `claimNorm` collision at CREATE MUST be **reported** as a deterministic signal (exact NFC+trim, no fuzzy τ) but MUST NOT force a write-time MERGE — write-time dedup is `contentHash`/`nodeKey` only, and structural near-duplication is the **derived-on-read `subsumes` relation** (see `docs/design/dedup-identity.md`). `predicateSlot` MUST come from the closed vocabulary. No step may consult an LLM.                                                                                                | A-12       |
| **KNOW-16** Predicate check = deterministic index-query                                                                | "HOLDS/BROKEN" needs a real, pure machine — not code.                 | A `PredicateNode.check` MUST be a **deterministic query over the Atlas index** (structural / dependency axes) or a pinned declarative assertion, evaluated mechanically to `HOLDS/BROKEN/NA` — **no arbitrary code execution, no sandbox**. A check needing runtime/behavioral execution is **out of scope for v0** and MUST stay `advisory`. The evaluator MUST be pure (same index state ⇒ same verdict, no clock/IO) and its verdict feeds `atlas-reconcile`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | §3.2       |
| **KNOW-17** Usefulness is a-posteriori                                                                                 | Kept because _consumed_, not because _proposed_.                      | A served fact MUST accrue **`hits`** — a logged event each time it governs a decision (a seat or cold-reviewer cites its node-id as "fact applied" in the event log). The usefulness judgment (non-obvious ∧ actionable) MUST calibrate its **ranking** threshold against **observed downstream hits**, never the proposer's self-assessment; it is never an admission veto (ADR-0012). Hits-decay is the **warm update** and composes with the a-priori obviousness score, which is the **cold-start prior** — neither replaces the other. A served fact that **no wave ever consults** MUST **decay** out of the served/pack set (archived to CAS, never deleted — KNOW-12) and MAY re-enter on a later hit. Genesis starts loose-but-thin; born-from-work (KNOW-13) prunes by real usage.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | A-10, A-16 |
| **KNOW-18** Confidence fast-path                                                                                       | Human review is spent on risk, not rubber-stamp.                      | A candidate that is **grounded ∧ low-risk ∧ `T2` advisory** MAY **auto-accept** (fast-path, no human), backstopped by the KNOW-17 hits-decay — anything the fast-path over-admits decays out. `T0`, **contested** (reviewer veto / conflicting node), and **all predicate** candidates MUST route to full human ratification (KNOW-8; billy for `T0`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | A-6, A-7   |

## Surface / API

The four Knowledge tools — each **pure + total** (malformed input fails closed to an honest empty verdict),
CLI + MCP parity, published input schema.

| Tool                 | Does                        | Contract                                                                                                                                                                                                                                                                                                                                       |
| -------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `atlas-init <tree>`  | `$0`-LLM structural move-in | returns the territory skeleton + blast radius + `T0`-candidate flags; auto-promotes nothing (KNOW-6, KNOW-7).                                                                                                                                                                                                                                  |
| `atlas-query <path>` | a territory's pack          | resolves any scope (file/folder/module/crate) to the covering territory/-ies; returns a `≤~2K` **governing** pack of `tier≥T1` invariants, beside a separately capped ADVISORY band of `T2` machine proposals no ratifier saw (ADR-0013, owner-ratified 2026-08-03; INV-TOOLS-6 amended 2026-08-04); `stale:true` ⇒ re-ground before trusting. |
| `atlas-emit <node>`  | fail-closed grounded write  | re-derives the citation `@sha`; ungrounded ⇒ rejected, not persisted (KNOW-2); a changed fact supersedes (KNOW-4).                                                                                                                                                                                                                             |
| `atlas-reconcile`    | merge-time drift → BROKEN   | flips the `DRIFTED` subset `BROKEN`; exits 2 to block the merge on any flip (KNOW-5).                                                                                                                                                                                                                                                          |

At wave-close the write path is driven by `ResultCard.absorb` (the explorer proposes candidates; reconcile
ratifies — grounded low-risk `T2` advisory via the KNOW-18 fast-path, everything risky by human), not a
separate authoring ritual (KNOW-8, KNOW-13).

## Lifecycle

A node moves through deterministic transitions; every invalid `(event, state)` pair MUST return a
structured rejection, never throw.

```
author → drift_detect → reconcile ( unchanged | changed→BROKEN | advisory ) → supersede | trivial_reject
```

- **drift_detect** / the merge re-check MUST be deterministic — a pure re-hash at the grounding
  `subtreeHash` ([atlas-grounding](./atlas-grounding.md)); no clock, no IO.
- **supersede** (predicate only) MUST keep the old node addressable via a `supersededBy` **pointer** — the
  old bytes already persist as a CAS object, so the pointer is a link, not a copy. Advisory changes edit in
  place and rely on git for prior versions. History is never destroyed (KNOW-12).
- **trivial_reject** drops a non-substantive change without minting a node.
- Both node families are available day-one (KNOW-9): an **advisory** node (edited in place, claims union) or
  a checkable **`predicate`** node (a changed `check` is a new node; the _same_ check re-evidenced supersedes).

## The write decision (create vs update) — infallible by construction

The decision "new node or update an existing one?" MUST be **computed, never judged** (KNOW-15). It rests
on **three orthogonal hashes** — conflating them is the classic way an Atlas rots into a landfill:

```
1. contentHash  = Encoder.hash(canonical(candidate))                 // WHAT it says   — dedup leg
2. nodeKey      = identity of the (anchor, slot[, check]) — see below // WHICH node     — create/update leg
3. subtreeHash  = hash of the anchored AST subtree                   // WHERE, current — drift leg (orthogonal)

primaryAnchor  = COMPUTED (not proposed) from the symbols the claim references: the smallest AST subtree
                 that contains every referenced symbol. NOT an LLM-chosen anchor. ONLY the primaryAnchor enters
                 identity — secondary citations live in `grounding.entries` and feed DRIFT only, never the
                 nodeKey (so citing {A,B} vs {A,C} does not fork identity, and moving a secondary anchor
                 never re-mints). It is the index's MOVE-AWARE id (name-stripped subtree match ⇒ a rename
                 is a MOVE, not delete+create).
predicateSlot  = the fact's typed topic, from the CLOSED slot vocabulary (table below) — enumerable, so
                 "same topic" is decidable.

nodeKey(advisory)  = hash(primaryAnchorId ‖ predicateSlot)                    // one node per (anchor, slot); claims set-union
nodeKey(predicate) = hash(primaryAnchorId ‖ predicateSlot ‖ normalize(check)) // the CHECK is part of identity (reconciles KNOW-4)
```

The LLM proposes only the **claim body** (+ `slot`, + `check?`); the **anchor is computed** from the
symbols the claim references, not proposed (KNOW-15). Before a CREATE, a deterministic **`claimNorm`
collision report** may fire (the candidate's `claimNorm` compared, under **exact NFC+trim equality** —
`claimSimilarity∈{0,1}`, no fuzzy τ — against existing `(primaryAnchor, *)` sibling-slot nodes), but per the
frozen dedup/identity model (see `docs/design/dedup-identity.md`, owner-ratified 2026-07-20) a collision is a
**deterministic signal only — it never forces a write-time MERGE**. A routed CREATE at an adjacent anchor
mints its **own** node (each keeps its own grounding). Write-time dedup is exactly the pure lookup below (D0
`contentHash` / D1 `nodeKey`); structural near-duplication is instead a **derived-on-read `subsumes`
relation** (broader ⊃ narrower coverage over the projection), never a merge. The routing is a pure lookup:

| Look up                                                                      | Result                                                                                                                       | Decision                                                                |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `contentHash` already in CAS                                                 | identical bytes                                                                                                              | **DEDUP** — no-op (bump `hits`/freshness only)                          |
| `nodeKey` **miss**                                                           | no node at this `(anchor, slot[, check])`                                                                                    | **CREATE**                                                              |
| `nodeKey` **hit**, family = `advisory`, new claim                            | same `(anchor, slot)`                                                                                                        | **UPDATE** — claim **set-union** in place (git keeps prior — KNOW-4/12) |
| `nodeKey` **hit**, family = `predicate`, same `check`, grounding/claim moved | the _same_ check, re-evidenced                                                                                               | **SUPERSEDE** — mint new, `supersededBy` pointer, old kept in CAS       |
| a **different** predicate `check` on the same `(anchor, slot)`               | different `nodeKey` ⇒ **miss**                                                                                               | **CREATE** — coexists; a sibling check is **never** retired             |
| any of the above, but fails the admission bar                                | **ungrounded** (KNOW-2), or **harmful to store** (secret / PII) — obviousness is scored, never a reason to reject (ADR-0012) | **REJECT**                                                              |

- **The sibling-retire bug this fixes:** because `normalize(check)` is _in_ the predicate key, two distinct
  checks on one `(anchor, slot)` are two nodes (both CREATE) — a new check can no longer SUPERSEDE a
  still-valid sibling. SUPERSEDE fires _only_ for the same check re-evidenced.
- **Why BLAKE3 is load-bearing here:** leg 1 (dedup) is content-addressing for free (KERNEL-1); leg 3's
  `subtreeHash` is a BLAKE3 subtree root, and its **name-insensitive** form is what lets `primaryAnchorId`
  survive a rename — an edit that only moves/renames the unit re-anchors the _same_ node, never orphans it.
- **Why the slot is a closed vocabulary:** `nodeKey` only collides — forcing UPDATE/union instead of a
  parallel node — if "same topic" is _decidable_. A free-text slot never collides ⇒ the store proliferates.
  The enumerated table (below) + the typed template (KNOW-10) make the slot decidable.
- Legs are orthogonal: leg 3 (drift) decides `FRESH/DRIFTED`, **not** create/update — a drifted fact is
  re-checked (KNOW-5), not re-created.
- **The admission bar (now partly mechanical).** Door-1 = grounded (KNOW-2). Door-2 = **harmful to store**
  (secret / PII — the one class where storing IS the harm). **Obviousness is no longer a door**
  ([ADR-0012](../adr/ADR-0012-obviousness-is-scored-never-gated.md)): it is a stored, auditable **score**, and
  the LLM never self-certifies it — **obviousness** is signaled by a deterministic `claimNorm` collision
  **report** against an existing `(anchor,*)` node (a colliding claim is, by construction, not novel) — a
  **signal, not a write-time merge** (`docs/design/dedup-identity.md`); the colliding candidate still mints its
  own node and structural coverage is the derived-on-read `subsumes` relation. **Usefulness is judged
  a-posteriori by `hits`** (KNOW-17) — a served fact no wave consults decays out; the threshold calibrates on
  observed hits, never the proposer's score. The two signals **compose**: the a-priori score is the cold-start
  prior (on a cold graph every fact has 0 hits), hits-decay is the warm update.

### The closed `predicateSlot` vocabulary (normative)

A fact's slot MUST be exactly one of these; the list is **closed** — adding a slot is a spec revision that
bumps the contract version `cv`. Each slot binds to exactly one write template (KNOW-10).

| slot                | the claim is about                                        | example                                             |
| ------------------- | --------------------------------------------------------- | --------------------------------------------------- |
| `invariant`         | a property that must always hold                          | "the queue head is never re-ordered"                |
| `contract`          | the interface / signature agreement                       | "`put` returns the same `Hash` for equal bytes"     |
| `precondition`      | what must hold on entry                                   | "caller holds the write lock"                       |
| `postcondition`     | what is guaranteed on exit                                | "the log grew by exactly one event"                 |
| `sideeffect`        | observable effects (IO / mutation)                        | "writes `.atlas/log.jsonl`"                         |
| `ownership`         | owner / lifetime / concurrency ownership                  | "only `atlas-kernel` may mint a `Hash`"             |
| `perf-bound`        | complexity / latency / allocation bound                   | "O(log n) rehash on edit"                           |
| `security-property` | authz / crypto / taint property                           | "no untrusted claim reaches the gate"               |
| `gotcha`            | a non-obvious pitfall / footgun                           | "`seq` is a hint, not identity"                     |
| `rationale`         | why it is built this way (the WHY)                        | "structural anchor because line-ranges are fragile" |
| `dependency`        | a required relationship / ordering                        | "grounding must resolve before reconcile"           |
| `definition`        | a term / ontology definition (feeds Awareness `ontology`) | "a _territory_ is owner + tier"                     |

### The closed `TestVacuityShape` vocabulary (normative)

A proven `test-vacuity` fact names exactly one of these shapes; the list is **closed and additive-only** —
adding a shape is a spec revision that bumps the contract version `cv`, exactly like the `predicateSlot`
list above (ADR-0015 D5, owner-ratified 2026-08-29). The union is declared in
`@atlas/knowledge` `test-vacuity-types.ts`; a member added there without a row HERE is an undocumented
widening.

Every shape is a SYNTACTIC property of the test's own AST, provable by `scanTestVacuity`
(`@atlas/adapter-io` `test-vacuity.ts`) from the hashed unit's bytes alone. **No shape is a runtime claim
that the test's bug fires** — that is a semantic, cross-procedural question no AST oracle can settle. Each
names a fragile SHAPE, which is what makes the family 0-false-admit by construction and confines the
residual risk to PRECISION (a flagged test may be fine) rather than soundness.

| shape                     | the proven property                                                                                                                                                                                                                 | why it is fragile                                                                                                                                             |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `assertion-only-in-catch` | every assertion-shaped call sits lexically inside a `catch`, at least one does, and there is no assertion-count guard                                                                                                               | if the `try` body completes without throwing, the `catch` never runs and the test passes having asserted nothing                                              |
| `no-assertion-in-test`    | the body contains NO check — call _or_ getter chain — carries no assertion guard, discards at least one expression that is not inside a nested (dead) function, and neither throws, `fail()`s, returns a value, nor holds a `catch` | the test performs no EXPLICIT check, so it can only fail if the work it performs happens to throw — an implicit smoke check, not a verification of any result |
| `assertion-never-invoked` | a matcher rooted in an `expect(...)` call is REFERENCED as a bare expression statement but never CALLED (`expect(x).toBeNull;`), its trailing name being one of the closed `INVOCABLE_MATCHERS` set                                 | the matcher is a FUNCTION, so the statement evaluates it and drops it — the assertion never executes and the test passes silently                             |

`assertion-never-invoked` is tried FIRST, by ORDERED PRECEDENCE rather than by construction: a body can hold both a real catch-assertion and, elsewhere, an un-invoked matcher, and the un-invoked matcher is the more specific defect. The other two are **mutually exclusive by construction** (one requires a catch-assertion, the other refuses any
check and any `catch`), so a given `(unitKey, testName)` yields at most one fact and its identity stays
unambiguous.

**Absence is judged against a broader vocabulary than the shared matcher, and why — measured.** The shared
`isAssertionShaped` requires a whole-word `expect`, so it misses a delegating helper such as
`expectNoCollateral(...)`. Scanning this repo's own tests with `no-assertion-in-test` before that was
accounted for produced 4 facts, and **all four were exactly that pattern** (correct tests asserting inside a
helper) — precision 0/4. So this shape judges absence with a shape-LOCAL widening (`isCheckShaped`: any
callee named `expect*` / `assert*` / `check*` / `verify*` / `ensure*` / `should*`). The widening is local
because broadening the shared matcher would also move the already-measured sibling shape's recall; and it can
only move a test from PROVEN to ABSTAIN, so it costs recall and cannot cost soundness. After it, both shapes
yield **0 facts across this repo's 3365 test-call sites** (467 of 470 files; three fail to parse under the pinned grammar and are excluded fail-closed, by design) — the expected result for a repo whose vacuous
tests were already fixed (#114).

**A check need not be a call.** Cold review found the call-only version proving a body whose only check was a chai getter chain (`x.should.be.ok;`) — a real false admit against the published claim, since the claim is "checks nothing", not "makes no check-shaped call". Absence is now judged over non-call member chains too.

**Why a chai getter is NOT an un-invoked assertion.** `x.should.be.ok;` looks identical in shape to `expect(x).toBeNull;` but asserts ON ACCESS — chai defines `ok`/`true`/`empty` as getters with side effects. Flagging it would be a false admit. The rail is that the chain must contain an `expect(` CALL, which is the family whose matchers are function-valued and therefore dead when un-invoked.

**Residual limit, stated:** a helper named outside that vocabulary (`hasNoCollateral(...)`) still yields a
proven fact — sound, since no check-shaped call appears in that body, but imprecise. Pinned by a
characterization test so a future widening is deliberate and visible rather than silent drift.

## Acceptance

One falsifiable check per invariant; each MUST fail if its invariant is violated.

1. **Structural drift, not line drift.** A change to the cited unit ⇒ `DRIFTED`; an import or license
   header added **above** it, or an unrelated rename **elsewhere**, ⇒ still `FRESH`. A reformat OF the
   cited unit ⇒ `DRIFTED`, and a rename OF the cited symbol ⇒ `DRIFTED` (anchor unresolvable).
   _(KNOW-1, KNOW-3)_ <!-- AMENDED 2026-08-02 (HONESTY-TAPROOT) -->
2. **Ungrounded reject.** `atlas-emit` of a node with no resolvable citation ⇒ `emitted:false`, nothing
   persisted. _(KNOW-2)_
3. **Edit-over-append.** Emitting a _changed_ fact about a known subject ⇒ the old node is superseded (not
   duplicated); a territory query returns one current node per subject, not a history dump. _(KNOW-4)_
4. **Drift split: only semantic blocks.** A merge that drifts `k` facts, of which `s` no longer re-derive:
   the `k-s` **mechanical** ones auto-re-ground (no human, exit 0 for that subset); the `s` **semantic** ones
   flip `BROKEN`, exit 2, and human `reauthorCount == s` (never `k`, never `N`). _(KNOW-5)_
5. **Empty move-in.** `atlas-init` on any tree ⇒ zero invariants; all territories `T2/advisory`. _(KNOW-6)_
6. **No T0 auto-promote.** A territory matching a T0 keyword ⇒ `t0Candidate:true` **and** `tier=='T2'`.
   _(KNOW-7)_
7. **Propose ≠ ratify.** No explorer write reaches the committed store except through a reconcile-side
   ratifier — human for `T0`/contested/predicate, the deterministic fast-path for grounded low-risk `T2`
   advisory; the explorer never self-commits. _(KNOW-8, KNOW-18)_
8. **Advisory standalone.** With no evaluator wired, the store is fully operable on advisory nodes alone;
   the predicate family is present day-one but not required to emit/query/reconcile. _(KNOW-9)_
9. **Templated write.** A fact missing a required template field, or over its cap, is rejected; no
   free-prose fact is ever persisted. _(KNOW-10)_
10. **Owner-scoped write.** A write outside the owner's scope is rejected; a read of any scope succeeds for
    any caller. _(KNOW-11)_
11. **Nothing deleted.** Supersede a fact ⇒ it is present in the archive and re-spawnable; no code path
    deletes a Knowledge entry. _(KNOW-12)_
12. **Fed-or-why-not.** A sealing wave with no `absorb` and no grounded why-not ⇒ the probe records a
    violation; facts appear only for territories the work touched. _(KNOW-13)_
13. **Provenance.** Every persisted claim carries a `Provenance`; an `untrusted`-sourced claim is advisory
    and never counts toward the gate. _(KNOW-14)_
14. **Write-decision is mechanical & move-safe.** The **anchor is computed from the referenced symbols**, not
    LLM-chosen — the same real fact yields the same `nodeKey` across runs. Re-emitting a byte-identical fact
    ⇒ DEDUP (no new node); a restated advisory claim in the same `(anchor, slot)` ⇒ UPDATE/union, never a
    parallel node; a **near-synonymous** claim at adjacent granularity ⇒ the collision is **reported** (a
    deterministic signal) but mints its **own** node — no write-time merge — with coverage as the derived-on-read
    `subsumes` relation (`docs/design/dedup-identity.md`); **renaming/moving the anchored unit ⇒ the fact re-anchors to the same node** (no spurious
    CREATE); citing a second anchor ⇒ same `nodeKey`; the whole routing runs with no LLM call. _(KNOW-15)_
15. **No sibling-retire; slot is closed.** Two **distinct** predicate `check`s on the same `(anchor, slot)`
    ⇒ two coexisting nodes (neither supersedes the other); the _same_ check re-evidenced ⇒ SUPERSEDE. A fact
    whose `slot` is outside the closed vocabulary is rejected. _(KNOW-15)_
16. **Predicate check is a pure index-query.** A `check` evaluates to `HOLDS/BROKEN/NA` deterministically
    from index state alone (no code exec, no clock/IO); a check needing runtime execution is refused and the
    fact stays advisory. _(KNOW-16)_
17. **Usefulness is measured, not asserted.** A served fact that governs a decision gets a logged `hit` citing
    its node-id; a served fact with **zero hits across the decay window** ⇒ archived out of the served/pack
    set (present in CAS, re-spawnable on a later hit); the door-2 threshold is a function of observed hits,
    not the proposer's score. _(KNOW-17)_
18. **Fast-path bounds human review.** A grounded low-risk `T2` advisory candidate ⇒ auto-accepted with no
    human ratification; a `T0` / contested / predicate candidate ⇒ full ratification; anything the fast-path
    over-admits later decays via zero hits (KNOW-17). _(KNOW-18)_
