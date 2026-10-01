# Requirements — Block KNW (knowledge) · S1 lift-and-tag

### REQ-KNOW-1 — truth is never self-declared

source: INV-KNOW-1 @ reference/atlas-knowledge.md#know-1
If a fact declares its own truth, then the knowledge module shall not honor that self-declaration.
normative-clause: "A fact never self-declares true."

### REQ-KNOW-2 — ungrounded facts fail closed

source: INV-KNOW-2 @ reference/atlas-knowledge.md#know-2
If a fact is ungrounded, then the knowledge module shall not admit it into the store.
normative-clause: "Ungrounded facts don't enter."

### REQ-KNOW-3a — drift oracle is the subtreeHash

source: INV-KNOW-3 @ reference/atlas-knowledge.md#know-3
The knowledge module shall use the BLAKE3 subtreeHash as the drift oracle.
normative-clause: "The drift oracle MUST be the BLAKE3 `subtreeHash`"

### REQ-KNOW-3b — an edit that does not touch the cited unit stays FRESH

source: INV-KNOW-3 @ reference/atlas-knowledge.md#know-3
When an import, or a blank-line-separated license/file header, is added above the cited unit, or an unrelated symbol elsewhere is renamed, the knowledge module shall keep the fact FRESH. A reformat OF the cited unit, a rename OF the cited symbol, and an edit to a comment CONTIGUOUS (no blank line) with the cited declaration — its bound doc-comment — DRIFT it (ADR-0014).
normative-clause: "an import, or a blank-line-separated license/file header, added above the cited unit, or an unrelated rename elsewhere, MUST stay `FRESH`; a reformat OF the cited unit, a rename OF the cited symbol, and an edit to a comment CONTIGUOUS with the cited declaration (its bound doc-comment) DRIFT it, and MUST — classification is by contiguity, not file position (ADR-0014)"

> **AMENDED 2026-08-02 (HONESTY-TAPROOT), narrowing to what is actually delivered.**
> Previously: "a reformat/rename/import-above MUST stay `FRESH`". Of those three legs only **import-above**
> is delivered (and only since `f2a8659`, when the symbol's byte start index left the anchor key). The other
> two are false, both MEASURED through the real `foldAstUnits → build → driftDetect` chain:
>
> - **reformat OF the cited unit ⇒ `DRIFTED`.** The oracle hashes the unit's raw source slice, NFC-normalized
>   only, so `return 42;` → `return  42;` moves the hash. Deliberate — see REQ-GROUND-5b for the full reason;
>   in short, any cheap normalization over raw text also erases whitespace that is SEMANTIC in TS/TSX, and a
>   false negative (serving HOLDS on a stale fact) costs far more than a false alarm.
> - **rename OF the cited symbol ⇒ `DRIFTED`, and by a STRONGER mechanism than a hash move: the anchor
>   becomes UNRESOLVABLE.** The anchor key is `<parent>::<kind>:<ordinal>[:<name>]`, so the name is part of
>   the key; renaming `computeArr` → `computeArrears` retires the key entirely and the fact fails closed
>   under GROUND-3, never re-binding to the renamed unit. This leg was NOT covered by the `f2a8659`
>   REQ-GROUND-5b amendment, because GROUND-5b only ever claimed an _unrelated_ rename ELSEWHERE — which is
>   delivered. KNOW-3 claimed the strictly stronger "the symbol renamed", and that claim was never true.
>   Atlas has no rename-tracking; re-grounding after a rename is an author action, not an automatic one.
>
> **AMENDED 2026-08-09 (ADR-0014, owner-ratified same-landing).** The "license-header added above ⇒ FRESH"
> leg is now qualified by CONTIGUITY, co-amended with the `adapter-io` slice change (rule #198). KNOW-3 and
> GROUND-5 are both consumers of the SAME `subtreeHash` oracle; ADR-0014 redefined that oracle's preimage to
> include a declaration's bound leading doc-comment, so the header-above leg is FRESH only when
> blank-line-separated, and a CONTIGUOUS leading comment (the decl's bound doc-comment) DRIFTS the fact. The
> import-above leg does NOT regress (an import is not a `comment` node). The owner ratified this KNOW-3 leg
> together with GROUND-5 on 2026-08-09 as one landing.

### REQ-KNOW-3c — real change drifts

source: INV-KNOW-3 @ reference/atlas-knowledge.md#know-3
When a real change is made to the cited unit, the knowledge module shall mark the fact DRIFTED.
normative-clause: "a real change to the cited unit MUST `DRIFT`"

### REQ-KNOW-4a — every write is an upsert

source: INV-KNOW-4 @ reference/atlas-knowledge.md#know-4
The knowledge module shall perform every fact write as an upsert.
normative-clause: "A write MUST be an upsert"

### REQ-KNOW-4b — identical fact is idempotent

source: INV-KNOW-4 @ reference/atlas-knowledge.md#know-4
When an identical fact is written again, the knowledge module shall treat the write as idempotent.
normative-clause: "identical fact idempotent"

### REQ-KNOW-4c — advisory claims set-union

source: INV-KNOW-4 @ reference/atlas-knowledge.md#know-4
When a new claim is written for an existing advisory subject, the knowledge module shall set-union the claim into the node.
normative-clause: "an advisory subject's claims **set-union**"

### REQ-KNOW-4d — changed advisory edited in place

source: INV-KNOW-4 @ reference/atlas-knowledge.md#know-4
When an advisory fact changes, the knowledge module shall edit it in place.
normative-clause: "A _changed_ **advisory** fact is **edited in place**"

### REQ-KNOW-4e — changed predicate supersedes

source: INV-KNOW-4 @ reference/atlas-knowledge.md#know-4
When a predicate fact changes with the same check and new evidence, the knowledge module shall supersede the prior node.
normative-clause: "A _changed_ **predicate** (same `check`, new evidence) **supersedes**"

### REQ-KNOW-4f — different check is a new node

source: INV-KNOW-4 @ reference/atlas-knowledge.md#know-4
When a fact carries a different check, the knowledge module shall create a new node.
normative-clause: "a _different_ `check` is a new node (identity includes its `check` — KNOW-15)"

### REQ-KNOW-4g — one current node per subject

source: INV-KNOW-4 @ reference/atlas-knowledge.md#know-4
When a territory is queried, the knowledge module shall return one current node per (anchor, slot[, check]).
normative-clause: "A territory query MUST return one current node per `(anchor, slot[, check])`"

### REQ-KNOW-5a — split the drifted subset

source: INV-KNOW-5 @ reference/atlas-knowledge.md#know-5
When a merge reconciles, the knowledge module shall split the DRIFTED subset into mechanical and semantic drift.
normative-clause: "At reconcile the `DRIFTED` subset MUST be split"

### REQ-KNOW-5b — mechanical drift auto-re-grounds

source: INV-KNOW-5 @ reference/atlas-knowledge.md#know-5
When a drifted fact's claim still re-derives at the new @sha, the knowledge module shall auto-re-ground it with no human and no block.
normative-clause: "**mechanical** (the anchor moved but the claim still re-derives at the new `@sha`) is **auto-re-grounded, no human, no block**"

### REQ-KNOW-5c — semantic drift blocks

source: INV-KNOW-5 @ reference/atlas-knowledge.md#know-5
If a drifted fact's claim no longer re-derives, then the knowledge module shall flip it to BROKEN and block the merge with exit 2.
normative-clause: "**semantic** (the claim no longer re-derives) flips `BROKEN` and blocks (exit 2)"

### REQ-KNOW-5d — re-author count equals semantic count

source: INV-KNOW-5 @ reference/atlas-knowledge.md#know-5
When a merge is reconciled, the knowledge module shall make the human re-author count equal the semantic-drift count.
normative-clause: "Human re-author count MUST equal `|semantic|`, never `|DRIFTED|`, never `N`"

### REQ-KNOW-6a — init carries zero invariants

source: INV-KNOW-6 @ reference/atlas-knowledge.md#know-6
When knowledge is initialized, the knowledge module shall produce output carrying zero invariants.
normative-clause: "`atlas-init` output MUST carry zero invariants"

### REQ-KNOW-6b — territories ship T2/advisory default

source: INV-KNOW-6 @ reference/atlas-knowledge.md#know-6
The knowledge module shall ship every territory with the T2/advisory default by construction.
normative-clause: "every territory ships the `T2/advisory` default by construction"

### REQ-KNOW-7a — no T0 auto-promotion

source: INV-KNOW-7 @ reference/atlas-knowledge.md#know-7
If a T0 tier would be assigned automatically, then the knowledge module shall not auto-promote it.
normative-clause: "A `T0` tier MUST NOT be auto-promoted"

### REQ-KNOW-7b — heuristics only flag

source: INV-KNOW-7 @ reference/atlas-knowledge.md#know-7
The knowledge module shall let heuristics only flag a candidate for human ratification.
normative-clause: "heuristics MAY only _flag_ a candidate for human ratification"

### REQ-KNOW-8a — explorer writes only candidates

source: INV-KNOW-8 @ reference/atlas-knowledge.md#know-8
If the explorer writes a fact, then the knowledge module shall record it only as a staged candidate.
normative-clause: "The explorer MAY write only **candidates** (staging)"

### REQ-KNOW-8b — ratification is the ratifier's

source: INV-KNOW-8 @ reference/atlas-knowledge.md#know-8
The knowledge module shall route ratification to the reconcile/lead with reviewer veto.
normative-clause: "ratification is the reconcile/lead's, with reviewer veto"
runtime-gap (A-D4, measured task #83) — **AMENDED / CLOSED by WP-PROMOTE (2026-08-02)**: "it was NOT WIRED for the explorer's candidates: `ratify()` gated both governed write doors, but no route carried a STAGED candidate to it — nothing read the staging sidecar back and there was no `promote` command, so a mined candidate was never ratified because it was never offered. `atlas promote` is that route (`requirements-adapters.md#REQ-CLI-7a`), and it offers each candidate to the existing `atlas-emit` door under a ratify context in which the KNOW-18 fast path does not apply. The sibling clause REQ-KNOW-8a (explorer writes only candidates) was and remains satisfied, durably, via `commitStaging`."

### REQ-KNOW-8c — T0 requires billy

source: INV-KNOW-8 @ reference/atlas-knowledge.md#know-8
If a candidate is T0, then the knowledge module shall require billy for its ratification.
normative-clause: "billy required for `T0`"

### REQ-KNOW-9a — both families day-one

source: INV-KNOW-9 @ reference/atlas-knowledge.md#know-9
The knowledge module shall make both node families available on day-one.
normative-clause: "Both node families MUST be available day-one (owner decision)"

### REQ-KNOW-9b — advisory standalone without evaluator

source: INV-KNOW-9 @ reference/atlas-knowledge.md#know-9
While no evaluator is wired, the knowledge module shall remain fully operable on the advisory family alone.
normative-clause: "the store MUST still operate on advisory alone when no evaluator is wired"

### REQ-KNOW-10a — no free prose

source: INV-KNOW-10 @ reference/atlas-knowledge.md#know-10
If a write would introduce free prose, then the knowledge module shall not persist it.
normative-clause: "No free prose, ever."

### REQ-KNOW-10b — template-violation rejected

source: INV-KNOW-10 @ reference/atlas-knowledge.md#know-10
If a fact is missing a required template field or is over its cap, then the knowledge module shall reject it.
normative-clause: "A fact missing a required template field, or over its cap, is rejected"

### REQ-KNOW-11a — every fact carries a scope

source: INV-KNOW-11 @ reference/atlas-knowledge.md#know-11
amendment: **AMENDED 2026-08-03** (owner-ratified) — reverses the `owner` fence added by #178/PR#105 (`fix(knowledge): enforce KNOW-11a owner fence in authz() write branch`, master `44026ae`). `owner` is REMOVED from this MUST; `scope` stands unchanged as the sole ownership anchor. Measured on the built binary: nothing supplies `owner` on any shipped write path (`atlas emit`, `atlas mine` both stamp `scope`, never `owner`), and `authz()` — the function #178 wired the owner leg into — has zero production callers; the live write door (`adapter-io/src/governed-emit.ts`) gates through `actorInScope` in `adapter-io/src/policy.ts`, keyed on `scope` alone, and always was. `owner` was never a gate input: authorization is `inScope(actor, fact.scope)`. Producer identity is already carried on every claim by `provenance.source` (`ClaimProvenance`, KNOW-14, MUST-required) — `owner` was a second, optional, unpopulated answer to the question `provenance.source` already answers.
The knowledge module shall make every fact carry a scope.
normative-clause: "Every fact MUST carry a `scope`"

### REQ-KNOW-11b — read is universal

source: INV-KNOW-11 @ reference/atlas-knowledge.md#know-11
The knowledge module shall allow any agent or human to read any fact.
normative-clause: "read is universal (any agent/human)"

### REQ-KNOW-11c — out-of-scope write rejected

source: INV-KNOW-11 @ reference/atlas-knowledge.md#know-11
If a write falls outside the owner's scope, then the knowledge module shall reject it.
normative-clause: "write is the owner's (the class member for that territory)"

### REQ-KNOW-12a — no fact-history is lost

source: INV-KNOW-12 @ reference/atlas-knowledge.md#know-12
If a fact is superseded or edited, then the knowledge module shall keep its prior version recoverable.
normative-clause: "No fact-history is lost."

### REQ-KNOW-12b — prior versions in CAS, deduped

source: INV-KNOW-12 @ reference/atlas-knowledge.md#know-12
The knowledge module shall persist prior versions as their own content-addressed CAS objects, deduped and never byte-copied.
normative-clause: "Prior versions persist as their own **content-addressed CAS objects** (deduped, never byte-copied)"

### REQ-KNOW-12c — advisory edit keeps no lineage pointer

source: INV-KNOW-12 @ reference/atlas-knowledge.md#know-12
When an advisory fact is edited in place, the knowledge module shall keep no lineage pointer and rely on git as the archive.
normative-clause: "**Advisory** edit-in-place keeps **no** lineage pointer — git is the archive"

### REQ-KNOW-12d — predicate supersede adds only a pointer

source: INV-KNOW-12 @ reference/atlas-knowledge.md#know-12
When a predicate fact is superseded, the knowledge module shall add only a supersededBy pointer into CAS.
normative-clause: "a **predicate** SUPERSEDE adds only a `supersededBy` **pointer** into CAS — a link, not a redundant copy"

### REQ-KNOW-12e — working store stays lean

source: INV-KNOW-12 @ reference/atlas-knowledge.md#know-12
The knowledge module shall keep the working store lean.
normative-clause: "The working store stays lean (edit-in-place / decay drops from the hot set)"

### REQ-KNOW-13a — production only at the three moments

source: INV-KNOW-13 @ reference/atlas-knowledge.md#know-13
If fact production is attempted outside the three moments as a repo-wide sweep, then the knowledge module shall not produce facts.
normative-clause: "Facts MUST be produced only at the three moments (init skeleton → enrich-by-blast-radius → wave-close write), never a repo-wide sweep"

### REQ-KNOW-13b — sealing wave fed-or-why-not

source: INV-KNOW-13 @ reference/atlas-knowledge.md#know-13
If a sealing wave neither fed the Atlas nor emitted a grounded why-not, then the knowledge module shall record a violation.
normative-clause: "A sealing wave MUST have fed the Atlas or emitted a grounded why-not"

### REQ-KNOW-14a — every claim carries provenance

source: INV-KNOW-14 @ reference/atlas-knowledge.md#know-14
The knowledge module shall make every claim carry a provenance receipt.
normative-clause: "Every claim has a receipt."

### REQ-KNOW-14b — untrusted source marked advisory

source: INV-KNOW-14 @ reference/atlas-knowledge.md#know-14
If a claim's source is untrusted, then the knowledge module shall mark the claim advisory.
normative-clause: "untrusted source ⇒ advisory, excluded from the gate"

### REQ-KNOW-14c — untrusted claim excluded from the gate

source: INV-KNOW-14 @ reference/atlas-knowledge.md#know-14
If a claim's source is untrusted, then the knowledge module shall exclude the claim from the gate.
normative-clause: "untrusted source ⇒ advisory, excluded from the gate"

### REQ-KNOW-15a — write-decision is a pure function of three hashes

source: INV-KNOW-15 @ reference/atlas-knowledge.md#know-15
The knowledge module shall decide DEDUP, UPDATE, CREATE, or SUPERSEDE as a pure function of three hashes.
normative-clause: "Whether a candidate **DEDUPs / UPDATEs / CREATEs / SUPERSEDEs** MUST be a pure function of three hashes"

### REQ-KNOW-15b — advisory nodeKey formula

source: INV-KNOW-15 @ reference/atlas-knowledge.md#know-15
For an advisory fact, the knowledge module shall compute the nodeKey as hash(primaryAnchorId ‖ predicateSlot).
normative-clause: "`hash(primaryAnchorId ‖ predicateSlot)` for advisory"

### REQ-KNOW-15c — predicate nodeKey includes the check

source: INV-KNOW-15 @ reference/atlas-knowledge.md#know-15
For a predicate fact, the knowledge module shall compute the nodeKey as hash(primaryAnchorId ‖ predicateSlot ‖ normalize(check)) so that a distinct check is a distinct node.
normative-clause: "`hash(primaryAnchorId ‖ predicateSlot ‖ normalize(check))` for predicate (so a distinct `check` is a distinct node, never a sibling-supersede)"

### REQ-KNOW-15d — primaryAnchorId computed mechanically

source: INV-KNOW-15 @ reference/atlas-knowledge.md#know-15
The knowledge module shall compute primaryAnchorId mechanically as the tightest structural unit containing every symbol the claim references.
normative-clause: "`primaryAnchorId` MUST be **computed mechanically** as the tightest structural unit containing every symbol the claim references"

### REQ-KNOW-15e — no LLM-chosen anchor

source: INV-KNOW-15 @ reference/atlas-knowledge.md#know-15
If an anchor would be chosen by an LLM, then the knowledge module shall not use it as the primaryAnchorId.
normative-clause: "**never an LLM-chosen anchor**"

### REQ-KNOW-15f — move-aware re-anchoring

source: INV-KNOW-15 @ reference/atlas-knowledge.md#know-15
When the anchored unit is renamed or moved, the knowledge module shall re-anchor to the same node without a spurious CREATE.
normative-clause: "It is move-aware (rename/move never orphans into a spurious CREATE)"

### REQ-KNOW-15g — secondary citations feed drift only

source: INV-KNOW-15 @ reference/atlas-knowledge.md#know-15
The knowledge module shall let secondary citations feed drift only, never identity.
normative-clause: "secondary citations feed drift only, never identity"

### REQ-KNOW-15h — a claimNorm collision is reported, not merged

source: INV-KNOW-15 @ reference/atlas-knowledge.md#know-15
note: reconciled to the FROZEN dedup/identity model (`docs/design/dedup-identity.md`, owner-ratified 2026-07-20; WP-DEDUP-1/2). The old write-time near-duplicate MERGE was REMOVED — write-time dedup is now **D0 `contentHash` → DEDUP** and **D1 `nodeKey` → UPDATE/union** only; structural near-duplication is a derived-on-read relation, never a write-time merge.
On a CREATE whose `claimNorm` collides with an existing sibling-slot node, the knowledge module shall report the collision as a deterministic signal and still mint the candidate's own node — never a write-time merge; structural near-duplication shall instead be the derived-on-read `subsumes` relation.
normative-clause: "A `claimNorm` collision at write time MUST be **reported** (a deterministic, exact NFC+trim signal — `claimSimilarity∈{0,1}`, no fuzzy τ) but MUST NOT force a MERGE; write-time dedup is **D0 `contentHash` / D1 `nodeKey`** only, and structural near-duplication is the **derived-on-read `subsumes` relation** (see `docs/design/dedup-identity.md`), never a write-time merge"

### REQ-KNOW-15i — slot from closed vocabulary

source: INV-KNOW-15 @ reference/atlas-knowledge.md#know-15
If a fact's predicateSlot is outside the closed vocabulary, then the knowledge module shall reject it.
normative-clause: "`predicateSlot` MUST come from the closed vocabulary"

### REQ-KNOW-15j — no LLM in the write-decision

source: INV-KNOW-15 @ reference/atlas-knowledge.md#know-15
If any step of the write-decision would consult an LLM, then the knowledge module shall not perform it.
normative-clause: "No step may consult an LLM."

### REQ-KNOW-16a — check is a deterministic index-query

source: INV-KNOW-16 @ reference/atlas-knowledge.md#know-16
The knowledge module shall evaluate a PredicateNode.check as a deterministic query over the Atlas index or a pinned declarative assertion to HOLDS, BROKEN, or NA.
normative-clause: "A `PredicateNode.check` MUST be a **deterministic query over the Atlas index** (structural / dependency axes) or a pinned declarative assertion, evaluated mechanically to `HOLDS/BROKEN/NA`"

### REQ-KNOW-16b — no code execution or sandbox

source: INV-KNOW-16 @ reference/atlas-knowledge.md#know-16
If a check would require arbitrary code execution or a sandbox, then the knowledge module shall not evaluate it.
normative-clause: "**no arbitrary code execution, no sandbox**"

### REQ-KNOW-16c — runtime check stays advisory

source: INV-KNOW-16 @ reference/atlas-knowledge.md#know-16
If a check needs runtime or behavioral execution, then the knowledge module shall keep the fact advisory.
normative-clause: "A check needing runtime/behavioral execution is **out of scope for v0** and MUST stay `advisory`"

### REQ-KNOW-16d — evaluator is pure

source: INV-KNOW-16 @ reference/atlas-knowledge.md#know-16
The knowledge module shall keep the evaluator pure, yielding the same verdict for the same index state with no clock or IO.
normative-clause: "The evaluator MUST be pure (same index state ⇒ same verdict, no clock/IO)"

### REQ-KNOW-16e — verdict feeds reconcile

source: INV-KNOW-16 @ reference/atlas-knowledge.md#know-16
The knowledge module shall feed the check verdict to atlas-reconcile.
normative-clause: "its verdict feeds `atlas-reconcile`"

### REQ-KNOW-17a — served fact accrues a hit

source: INV-KNOW-17 @ reference/atlas-knowledge.md#know-17
When a served fact governs a decision, the knowledge module shall accrue a logged hit for it.
normative-clause: "A served fact MUST accrue **`hits`** — a logged event each time it governs a decision"

### REQ-KNOW-17b — door-2 threshold calibrates on hits

source: INV-KNOW-17 @ reference/atlas-knowledge.md#know-17
The knowledge module shall calibrate the Door-2 admission threshold against observed downstream hits, never the proposer's self-assessment.
normative-clause: "the usefulness judgment (non-obvious ∧ actionable) MUST calibrate its **ranking** threshold against **observed downstream hits**, never the proposer's self-assessment; it is never an admission veto (ADR-0012), and it composes with — never replaces — the a-priori obviousness score, which is the cold-start prior"

### REQ-KNOW-17c — unconsulted fact decays out

source: INV-KNOW-17 @ reference/atlas-knowledge.md#know-17
When no wave ever consults a served fact, the knowledge module shall decay it out of the served/pack set, archived to CAS and never deleted.
normative-clause: "A served fact that **no wave ever consults** MUST **decay** out of the served/pack set (archived to CAS, never deleted — KNOW-12)"

### REQ-KNOW-17d — decayed fact may re-enter on a hit

source: INV-KNOW-17 @ reference/atlas-knowledge.md#know-17
When a decayed fact receives a later hit, the knowledge module shall permit it to re-enter the served set.
normative-clause: "MAY re-enter on a later hit"

### REQ-KNOW-18a — confidence fast-path auto-accept

source: INV-KNOW-18 @ reference/atlas-knowledge.md#know-18
When a candidate is grounded, low-risk, and T2 advisory, the knowledge module shall permit auto-accept with no human.
normative-clause: "A candidate that is **grounded ∧ low-risk ∧ `T2` advisory** MAY **auto-accept** (fast-path, no human)"

### REQ-KNOW-18b — risky candidates route to full ratification

source: INV-KNOW-18 @ reference/atlas-knowledge.md#know-18
If a candidate is T0, contested, or predicate, then the knowledge module shall route it to full human ratification.
normative-clause: "`T0`, **contested** (reviewer veto / conflicting node), and **all predicate** candidates MUST route to full human ratification"

## [NEEDS RECONCILIATION]

- INV-KNOW-15: the clause asserts move-awareness ("rename/move never orphans into a spurious CREATE"), and the register flags "⚠ move-aware needs similarity matcher" — the precision boundary (what counts as the same node vs a spurious CREATE for a move+edit) is not pinned in the clause; route to DEFINE. _(The old near-dup "forces MERGE on a `claimNorm` collision" arm and its similarity threshold τ are now RESOLVED, not DEFINE-open: per the frozen dedup/identity model — `docs/design/dedup-identity.md` — a `claimNorm` collision is **reported** under exact NFC+trim equality (no fuzzy τ) and **never merges** at write time; structural near-duplication is the derived-on-read `subsumes` relation.)_
- INV-KNOW-10: the Invariants-section clause states only "No free prose, ever." and delegates the concrete reject-triggers to spec A-13 ("→ see spec **A-13**"); the missing-field / over-cap guard (REQ-KNOW-10b) was necessarily lifted verbatim from the same reference's Acceptance check #9 rather than a KNOW-10 Invariants clause — confirm Acceptance #9 is the authoritative guard source or lift the triggers into the invariant clause.
