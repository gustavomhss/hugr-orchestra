# The Atlas — functional surface (the complete behavioral catalog)

> Produced with the [`functional-surface`](../../.claude/skills/functional-surface/SKILL.md) rubric.
> The user-facing catalog of **everything the Atlas does** — actors, goals, use cases (with extensions),
> how-to, and the reactive/policy + CRUD surfaces — the **completeness backstop** the requirements
> decomposition (S1/S3) consumes. Runs after [D1 framing](product-framing.md), before D2 Structure.
> Grounded in the real design (`spec/atlas.md`, `spec/memory.md`, `design/atlas.md`, the
> `reference/atlas-*.md` set); every reactive/CRUD row carries a real invariant ID. **Un-prioritized by
> definition** — the whole surface, not an MVP slice.
>
> **Status: v3 — converged** (4 iterations, per the owner's "iterate ~4×"): v1 author lenses 1–4 → round-1
> `jimmy` grounded lens-5/6 sweep + negative-space critic (grew the surface ~3×, fixed 4 grounding errors) →
> round-2 fresh critic + grounding-accuracy pass → round-3 folded round-2's 7 findings. Grounding
> independently verified 33/33; loop-until-dry reached. An optional formal cold-review can seal it before D2.

---

## L0 — Actor–Goal census (the completeness ledger)

Every actor (incl. **non-human** + **time/event triggers**) × their goals. Goal levels: **`+`**
summary(kite) · **`!`** user-goal(sea) · **`-`** subfunction(fish).

### Actors

- **Human — Steward/Owner** (`STW`): ratifies T0, declares territories/tiers, reviews the knowledge-delta, rewinds, exports, sets maintenance appetite.
- **AI — Orchestrator/Lead** (`ORC`, PODIUM kit — grounded `TEAM.md`): composes packs, dispatches, absorbs, ratifies non-T0, meters, keeps the logbook.
- **AI — consuming seat** (`SEAT`): charlie/patty (exec) · lucy/bobby/frankie (verify) · **billy** (security — owns T0 ratification input + cred-scrub, `KNOW-8/18`, `PERSIST-10a`) · **jimmy** (explore/mine, `COMPASS`) · **rosie** (docs — owns docs-as-CAS-objects + their drift-check, `INDEX-11`) · **walt** (DEFINE — curates `ontology`/`slot='definition'` nodes + the ratified DEFINE artifact that sources mission/goal, `MEM-11`, `GEN-9`).
- **Non-human — Git repo** (`GIT`): emits commit/PR-open/PR-merge/branch/**merge**/rebase/squash/fork/clone/push; is the archive.
- **Non-human — Host/forge adapter** (`HOST`: GitHub/GitLab/Gitea): attaches trailers/notes/PR-memory, configures the notes refspec (`§7.1`, `PERSIST-8`).
- **Non-human — Merge driver** `orchestra-atlas` (`MRG`): git invokes it on merge to OR-Set-union Atlas events (`PERSIST-11`, `KERNEL-12`).
- **Non-human — Genesis engine** (`GEN`): seeds the hot frontier; enriches on demand.
- **Non-human — Index/CAS** (`IDX`, BLAKE3-merkle): resolves retrieval, computes the write-decision, folds drift.
- **Non-human — Predicate check-engine** (`CHK`: CodeQL/Semgrep/LSP): evaluates HOLDS/BROKEN/NA deterministically (`KNOW-16`, `GEN-12`).
- **Non-human — Drift oracle** (`DRF`): re-checks grounding; flips FRESH→DRIFTED→BROKEN/STALE.
- **Non-human — Ledger/calibration oracle** (`LDG`): logs cited hits + off-atlas reads; drives drop-order, eviction, MISS-oracle (`RETR-8/13`, `KNOW-17`).
- **Time/event triggers** (`TIME`): decay(frecency) · wave open/close · scope-change(poke) · injection-ceiling · budget-window.

### The matrix (actor → goals) — no empty row; every goal has an owner actor

| actor            | goals                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SEAT**         | `!`G1 Locate the grounded fact · `!`G2 Confirm a fact is current · `!`G3 Receive a curated own-pack (no self-assembly) · `!`G4 Query what's related · `!`G5 **Consult my own scoped memory (task/pr)** · `!`G6 Record what I changed, with provenance · `-`G1a Drill down · `-`G4a Call a node as a tool · `-`G5a Be re-spawned with my own closing fold auto-recalled (`MEM-13`)                                                                  |
| **ORC**          | `+`G0 Run a wave end-to-end against the Atlas · `!`G7 Compose+push an own-pack at dispatch · `!`G8 Absorb a result into knowledge+seat memory · `!`G9 Ratify non-T0 candidates · `!`G10 **Meter cost/provenance per WP** · `!`G24 **Assemble+inject the turn-header** (Awareness+Orientation+Rules, derived, capped) · `!`G25 **Consult/write the logbook** · `-`G26 Promote a task/pr lesson into project memory                                  |
| **STW**          | `!`G11 Ratify T0 knowledge (human-only) · `!`G12 Declare territories/tiers · `!`G13 Review the knowledge-delta in a PR · `!`G14 Rewind/supersede a fact · `!`G15 Export the atlas (OKF) · `!`G16 **Set genesis scope + maintenance appetite** · `!`G27 **Diff the atlas across two versions** · `!`G28 **Diagnose/repair via `atlas doctor`** · `!`G35 **Migrate the atlas format across a `cv` bump** · `-`G13a Audit a fact's provenance/receipt |
| **GEN**          | `!`G17 Seed the hot frontier ($0-LLM skeleton → enrich) · `!`G29 **Deepen a scope via the 3 governed loops** (REVIEW/ENRICH/EXPAND, budget-gated, fixpoint-stop, `GEN-14`) · `-`G17a Enrich-from-demand on a cold territory (born-from-work, `KNOW-13`)                                                                                                                                                                                            |
| **IDX**          | `!`G18 Resolve a retrieval (scope/dependency/trigger) · `!`G19 Decide write vs update vs supersede (3-hash) · `!`G30 **Fold the index incrementally on edit** (dirty-bit + lazy, `INDEX-2/12`) · `!`G31 **Rebuild the index from versioned source** (recovery) · `-`G18a Enforce the T0 coverage gate (`INDEX-16`)                                                                                                                                 |
| **CHK**          | `!`G32 Evaluate a predicate's check → HOLDS/BROKEN/NA (`KNOW-16`)                                                                                                                                                                                                                                                                                                                                                                                  |
| **DRF**          | `!`G20 **Re-check grounding across the blast-radius closure** · `-`G20a Serve advisory drift as STALE (flagged, non-blocking, `GROUND-13`) · `-`G20b Auto-re-ground mechanical drift; flip BROKEN only on semantic drift (`KNOW-5`, `TOOLS-13`)                                                                                                                                                                                                    |
| **GIT/HOST/MRG** | `!`G21 Carry the atlas with every commit/PR/branch/**merge**/fork · `!`G22 Re-spawn an ephemeral agent from versioned state · `!`G33 **OR-Set-union two branches' Atlas events on merge** (byte-identical, `MRG`) · `-`G21a Attach trailers/notes/PR-memory (`HOST`, `§7.1`)                                                                                                                                                                       |
| **LDG**          | `!`G34 **Log a cited hit / off-atlas read; drive drop-order, eviction, MISS-oracle** (`RETR-8/13`, `KNOW-17`)                                                                                                                                                                                                                                                                                                                                      |
| **TIME**         | `!`G23 Archive by frecency decay (never delete, `MEM-7`) · `-`G23a Open/close a wave                                                                                                                                                                                                                                                                                                                                                               |

_(Lens-1: non-human actors GIT/HOST/MRG/GEN/IDX/CHK/DRF/LDG + TIME explicit. Lens-2: no empty row; every goal owned. **Honest note:** the L0 is a list, not a grid — the "no empty column" predicate is N/A-by-format; only the row check is meaningful here.)_

---

## L1 — The backbone (narrative flow)

```
Init/Genesis → Orient → Navigate → Retrieve/Pack → Confirm → Act → Monitor → Modify → Conclude
   → Ratify → Decay/Archive → Export/Fork    [with the reactive edges folded in §Reactive]
```

| activity          | tasks                                                                                                                                                                                  |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Init/Genesis**  | scope frontier · parse+resolve (tree-sitter/SCIP) · rank (PPR) · seed skeleton · synthesize checks · **self-install merge-driver**                                                     |
| **Orient**        | **assemble the turn-header** — Awareness (mission/constitution/terrain/ontology/taste, derived, memoized) + Orientation (goal/last/current/state, folded) + Rules (top-12 by frecency) |
| **Navigate**      | scope-change settles (debounce N=2) → fire poke (inject pack) + expose scope's node-tools → retract on leave                                                                           |
| **Retrieve/Pack** | resolve scope/dependency/trigger · relate() the blast radius · assemble own-pack (tier≥T1 floor, then PPR, ~1.5K) · **coverage-gate flag if unresolved-edge ratio high**               |
| **Confirm**       | check grounding@subtree-hash · read FRESH/DRIFTED/BROKEN/STALE leg · withhold/flag                                                                                                     |
| **Act**           | seat consumes the pack (writes code — _not the Atlas's job_)                                                                                                                           |
| **Monitor**       | on edit → index-fold (dirty-bit) → re-check drift across forward-closure · surface contradiction                                                                                       |
| **Modify**        | propose (anchor,slot,body) · route mechanically (create/update/supersede) · edit-over-append                                                                                           |
| **Conclude**      | ResultCard.absorb → write knowledge + seat memory · logbook entry · provenance trailer + note                                                                                          |
| **Ratify**        | propose→ratify (jimmy proposes; lead/wave-close ratifies; T0 human-only; lucy/bobby veto)                                                                                              |
| **Decay/Archive** | frecency decays → leaves injected set → ARCHIVE (git), never delete                                                                                                                    |
| **Export/Fork**   | export OKF · clone/fork carries everything · re-spawn deterministically                                                                                                                |

_(Lens-3: re-walked per persona — SEAT: Navigate→Act; ORC: Orient→Retrieve→Conclude→Ratify; STW: Ratify→Review→Export→Doctor; system actors walk the reactive edges.)_

---

## L2 — Use cases (MSS + extensions)

Sea-level (`!`) use cases: MSS 3–9 steps + **Extensions** (per-step negative-space). Core cases carry
fuller treatment; the rest MSS + key extensions. _(The 4 grounding errors from v1 are fixed here + below.)_

### UC-G1 — Seat locates the grounded fact for its scope

**MSS:** 1) issue `scope(path)`/`own(unit)`. 2) IDX resolves enclosing nodes + dependency closure. 3) filter to tier≥T1 floor, rank rest by PPR under `maxHops=2`/`K=8`. 4) pack returns, each fact w/ StructRef + grounding leg. 5) seat reads.
**Extensions:** 1a. path unresolved → nearest enclosing scope + `[no-node]` (never invent). 2a. hub closure O(repo) → INDEX-12 cap (dirty-bit+lazy), report truncation. 3a. tier≥T1 alone > budget → T0-first then truncate lower (RETR-6 drop-order); never drop T0. 4a. fact DRIFTED/BROKEN → withhold/flag (UC-G2). 4b. no grounded fact → empty + surface coverage gap (never fabricate).

### UC-G2 — Seat confirms a fact is current

**MSS:** 1) read F's grounding leg. 2) IDX compares F's cited **subtree-hash** to live code. 3) match → **FRESH**, serve. 4) act.
**Extensions:** 2a. subtree changed → **DRIFTED**; predicate → CHK re-runs check: HOLDS→re-ground, else **BROKEN**. 2b. advisory (no check) → cannot mechanically decide → serve **STALE**/flagged, non-blocking (never auto-reground silently, never block, `GROUND-13`). **2c. the cited unit's OWN bytes unchanged though the file around it changed (import, or a **blank-line-separated** license/file header added above it, unrelated rename elsewhere) → stays FRESH, no re-check, no flag (`spec §3.1`, acceptance #1) — the precision side that prevents line-shift drift-thrash. A reformat INSIDE the cited unit is NOT in this class: it moves the raw-source-slice hash and correctly reads DRIFTED (AMENDED 2026-08-02 — the old text listed "reformat/comment" here and was never delivered). A comment **contiguous** (no blank line) with the cited declaration is NOT in this class either: it is that declaration's bound doc-comment, so editing it DRIFTS the unit — classification is by contiguity, not file position (AMENDED 2026-08-09, ADR-0014).** 3a. forward-dependency's signature/type changed → F's rState drifts transitively (`GROUND-11`). 4a. F BROKEN and cited by the edit → block the merge (`A-3`).

### UC-G3 — Seat receives a curated own-pack (no self-assembly)

**MSS:** 1) ORC/IDX composes `own(U)`: tier≥T1 + terrain + bounded relate() + scoped memory. 2) pushed at dispatch (or `own_<U>` tool). 3) drill-down (finer/refresh/complement) pull-reachable. 4) seat never chooses scope nor assembles.
**Extensions:** 1a. U is an _epic_ → not a grounded node; compose from goal (Orientation) + the features' OwnPacks (Knowledge≠Memory). 1b. > ~1.5K → keep floor, rest to drill-down. 2a. no MCP grant → push-as-file `.atlas/*` (zero-grant); CLI floor (`TOOLS-11/11a`).

### UC-G4 — Seat queries what's related (+ convention-coupling fallback)

**MSS:** 1) `relate(unit)`. 2) IDX unions the 3 axes partitioned by relation-kind (enclosing/dependents=blast/dependencies/governing=territory). 3) short labeled list; model doesn't walk the graph.
**Extensions:** 2a. closure under-approximate (convention-coupling) → **auto-union the coChanged git-history band, labeled correlational** (`INDEX-13`) — the feasibility-residual fallback. 2b. related huge → cap ~300 tok, rank tier then PPR.

### UC-G5 — Seat consults its own scoped memory _(NEW — the Memory-read path; FR-10 crown jewel)_

**Actor:** SEAT · **Trigger:** seat needs its private experience (not project Knowledge).
**MSS:** 1) seat requests `memory(scope=task|pr)`. 2) relay returns the seat's **own** MemoryFacts (craft-lessons, attempted/failedWith/stoppedAt) — distinct from Knowledge. 3) seat reads; it never auto-injects (consultable, not injected) **except** the re-spawn recall (UC-G5a).
**Extensions:** 2a. cross-seat / cross-WP read → **not injected** into another member's turn-header (injection-scoping, `MEM-4`) — but this is **NOT access control**: Memory is git-native, so a repo reader can read any seat's bytes; `MEM-1` is injection-scoping, _not_ confidentiality, and MUST NOT be read as isolation. True per-seat confidentiality = **opt-in per-seat encryption** (a future option, at a re-spawn/portability cost). 2b. empty (first task) → return empty, no fabrication. 2c. **Memory contradicts grounded Knowledge → Knowledge wins** (Memory is experience, Knowledge is grounded truth — the boundary law). 2d. over cap → decayed/archived (never deleted).
**UC-G5a — re-spawn recall:** on re-spawn onto a task/PR it touched, the seat's own closing fold (`attempted/failedWith/lesson`) is **PUSHed** at spawn — the one exception to "consultable never auto-injects" (`MEM-13`).

### UC-G6 — Seat records what it changed, with provenance

**MSS:** 1) reflection → structured `MemoryFact[]` (relay ABSORB). 2) each = (anchor, slot, body). 3) IDX routes: contentHash dedup → nodeKey miss=CREATE / hit=UPDATE(advisory)/SUPERSEDE(predicate). 4) provenance trailer (WP/model/tokens/gates/verdict/transcript-SHA) via `attachToCommit`. 5) knowledge-delta visible in PR.
**Extensions:** 2a. unstable LLM (anchor,slot) → primaryAnchor computed **mechanically** from referenced symbols + a deterministic `claimNorm`-collision **report** (a signal, never a write-time merge — `docs/design/dedup-identity.md`) → CREATE mints its own node; structural near-dup coverage is the derived-on-read `subsumes` relation. 3a. T0 candidate → human-only ratify. 3b. un-grounded → rejected at the truth door; harmful to store (secret/PII) → rejected; **true-but-obvious → ADMITTED carrying a low obviousness score**, ranked a-posteriori (ADR-0012). 3c. **delta conflicts with a concurrent seat's delta → mechanical merge on contentHash, else surface as a knowledge-conflict for review** (see UC-G33). 4a. transcript has a secret → cred-scrub redacts at source, **blocks** the write (`PERSIST-10a`).

### UC-G7 — Orchestrator composes+pushes an own-pack at dispatch

**MSS:** 1) infer scope from WP. 2) `own(U)`. 3) inject into brief (push, zero-grant) or wire `own_<U>`. 4) dispatch. **Ext:** 2a. spans territories → carry each governing tier-rules; T0 injects first. 3a. brief+pack > budget → floor-then-truncate + drill-down.

### UC-G8 — Orchestrator absorbs a result into knowledge + seat memory

**MSS:** 1) MAESTRO-ARM relay armed by brief-hash token. 2) ABSORB → parse reflection → knowledge candidates (UC-G6) + seat craft-lesson (distinct facts). 3) write both. 4) logbook ritual entry. **Ext:** 1a. token ≠ brief content-hash → HOLD (fail-closed). 2a. multi-gate mutation → fail-closed HOLD. 3a. project-memory over cap → frecency eviction.

### UC-G9 — Ratify a candidate (non-T0 lead; T0 human = UC-G11)

**MSS:** 1) jimmy proposes candidate + grounding receipt. 2) admission check (grounded? harmful to store?) + obviousness SCORED, never vetoed (ADR-0012). 3) tier routes: T1/T2 → lead + lucy/bobby veto; T0 → human-only. 4) admit, or ABSTAIN (why-not grounded, first-class).
**Extensions:** 2a. receipt induces rubber-stamp → fast-path auto-accept _only_ for advisory low-risk grounded. 3a. lucy/bobby veto → return to proposer. **3b. candidate contradicts an admitted grounded fact (both FRESH) → do not silently co-admit; corroborate (N-sample/refuter) → steward adjudication; record ABSTAIN-why (the integrity case, FR-5/FR-10).** 4a. uncertain/high-blast → corroborate before admit.

### UC-G11 — Steward + billy ratify a T0 candidate (human-only gate) _(NEW — the permission-sensitive gate)_

**Actors:** STW + billy (security) · **Trigger:** a candidate lands in a T0 territory.
**MSS:** 1) the candidate is queued for T0 ratification (never auto-admitted — `A-6` human-only, `A-7` propose≠ratify). 2) billy reviews the security/cred surface; STW reviews the fact. 3) both accept → admit to the active set; else ABSTAIN (why-not grounded).
**Extensions:** 2a. no human available → the candidate **stays un-admitted indefinitely** (never auto-promote; a T0 fact cannot enter on a machine's say-so). 2b. billy veto vs steward accept → **conflict resolves to withhold** (any veto blocks a T0 admit). 2c. cred-scrub blocks during ratify (a secret in the candidate/transcript) → the write is blocked at source (`PERSIST-10a`), ratify cannot proceed until scrubbed. 2d. the fact governs a **T0-adjacent uncovered path** → default-deny until an owner is assigned (`INDEX-14`).

### UC-G10 — Orchestrator meters cost/provenance per WP _(NEW — FR-9 instrument)_

**MSS:** 1) ORC tallies tokens/gates/model/verdict/wall-time per WP. 2) writes the provenance trailer + note (`attachToCommit`, `A-17`, `PERSIST-3`). 3) aggregates cost per WP/wave/model (feeds ROI/breaker). **Ext:** 2a. no provenance emitted → HOLD. 3a. WP over budget → flag. 3b. **records which served facts the seat actually cited → hit-rate feeds born-from-work enrich priority + the Value-risk adoption metric** (`RETR-8`, `KNOW-17`).

### UC-G12 — Steward declares territories/tiers

**MSS:** 1) STW writes the manifest (globs→owner·tier). 2) IDX reconciles vs the tree. 3) territory-axis built. 4) tier-rules + ratification-tier + memory-scoping derive. **Ext:** 1a. manifest drifts/empty → **regenerate `owner` from structural graph + git-blame, reconcile, flag divergence; `tier` stays human-ratified** (`INDEX-15`). 2a. unit matches 2 territories → partition (1 unit = 1 territory). 2b. path matches no glob / T0-adjacent → flag `uncovered`; T0-adjacent **defaults to deny** until owner assigns (`INDEX-14`).

### UC-G13 — Steward reviews the knowledge-delta in a PR

**MSS:** 1) PR carries the in-tree atlas delta (sharded by hash) + PR-memory + logbook (`attachToPR`, `§7.1`). 2) STW reads added/edited/superseded facts + trailers. 3) approve or request changes on the _knowledge_. **Ext:** 2a. superseded → git shows lineage (git IS the archive). 3a. un-grounded/landfill fact → reject at review.

### UC-G14 / UC-G33 — Rewind, and reconcile a concurrent/merge edit _(G33 NEW — git-native's hardest case)_

**UC-G14 MSS:** 1) STW rewinds a PR/commit. 2) atlas is git-native → rewinds with it. 3) no separate rollback. **Ext:** rebase/cherry-pick/squash → `AtlasState` folds byte-identical (fold is over the event **set**, not commit sequence); trailers survive onto the new SHA (`PERSIST-12`).
**UC-G33 MSS (concurrent/merge):** 1) two branches (or two seats) emit events touching the same `nodeKey`. 2) on merge, the `orchestra-atlas` **merge-driver** OR-Set-unions the event sets by content-hash → byte-identical regardless of merge direction, no last-writer, no clock, no LLM (`PERSIST-11`, `KERNEL-10/11`). **Ext:** 2a. driver not installed (fresh clone) → plain 3-way text merge of the append-only JSONL still unions losslessly; next re-fold dedups by id (`KERNEL-12` safe-degrade). 2b. genuine semantic conflict (same slot, incompatible bodies) → surface as a knowledge-conflict for steward adjudication in the PR.

### UC-G15 — Steward exports the atlas (OKF)

**MSS:** 1) `export()`. 2) rehydrate all content-addressed objects (incl. remote-backend blobs). 3) emit 100%-portable OKF bundle. **Ext:** 1a. remote CAS (OCI/S3) → export always rehydrates. 1b. **backend** key identical across OCI/S3 (BLAKE3) → _backend_ migration never re-keys (distinct from a `cv` bump — UC-G35). 1c. **import** the reverse: a bundle replays 1:1 into a fresh store (`KERNEL-6`/`PERSIST-9`, acceptance #8); a malformed/partial or `cv`-mismatched bundle → **fail-closed**, never partial-apply.

### UC-G35 — Migrate the atlas format across a `cv` bump _(NEW — the versioning class)_

**Actor:** STW/IDX · **Trigger:** the canonicalization-version / write-template `cv` changes (e.g. a new `predicateSlot` is added — `KNOW-10` "bumps `cv`").
**MSS:** 1) a `cv` bump changes `canonicalForm` → **re-keys every affected id** (unlike a backend swap, which preserves keys). 2) a replayable `old→new` id migration rewrites the store; export bundles carry their `cv`. **Extensions:** 1a. import a bundle with a mismatched `cv` → migrate-or-fail-closed, never silently mix keyspaces. 1b. _(open design question — `spec §9`: the replayable migration is specified as a requirement here, its mechanism is not yet frozen; flagged for S1, not hand-waved.)_

### UC-G16 — Steward sets genesis scope + maintenance appetite _(NEW — FR-9 control surface)_

**MSS:** 1) STW sets budget ceiling + genesis `--scope` + (frecency is automatic). 2) GEN/IDX derive the seeded frontier. **Ext:** 1a. appetite too low → cold tail never enriched → surface as coverage gap (visible, not silent). 1b. appetite changed mid-project → re-scope without re-seed.

### UC-G17 — Genesis seeds the hot frontier

**MSS:** 1) scope frontier (hotspots × SZZ-fragility × PPR-centrality). 2) $0-LLM skeleton. 3) propose→verify predicates only where checkable AND tier≥T1. 4) admit machine-checked likely-invariants; else ABSTAIN. **Ext:** 3a. empty/tautological check → TEETH gate (HOLDS-current AND flip-BROKEN-on-mutant) rejects. 3b. cost ceiling → marginal-value stop; cold tail lazily by born-from-work. 3c. no git history (new/squashed) → structural + type-surface centrality fallback. **3d. language lacks precise SCIP → degrade to tree-sitter-only + coChanged, flag on the coverage gate, never drop silently (feasibility tail).** 3e. **run interrupted / budget-killed mid-scan → resume from the last completed ranked site (`resumeToken`); a malformed rev → an honest partial skeleton + `resumeToken`, never a throw (`GEN-8`).**

### UC-G20 — Drift oracle re-checks grounding across the blast-radius _(NEW as full UC — retires FR-4/FR-5)_

**MSS:** 1) on edit, IDX computes the forward-closure. 2) DRF re-checks each cited fact's leg. 3) flip FRESH→DRIFTED→BROKEN/STALE. **Ext:** 1a. hub closure O(repo) → INDEX-12 cap applies (dirty-bit + lazy + `state-suspect` beyond `maxHops=2`). 2a. a mid-closure node already BROKEN → propagate, don't double-count. 2b. re-check expensive under budget → lazy/on-read. 2c. CHK's check tool (CodeQL/Semgrep) unavailable → mark `NA`/suspect, never assume HOLDS.

### UC-G24 — Orchestrator assembles+injects the turn-header _(NEW — the most-injected surface)_

**MSS:** 1) assemble Awareness (mission/constitution/terrain/ontology/taste — **derived** from the atlas root rollup, memoized per facet source-hash) + Orientation (goal/last/current/state — **folded** from the event log) + Rules (top-12 by frecency). 2) inject once per turn, byte-identical across seats, capped (~Awareness 400 / Orientation 250 / Rules 500). **Ext:** 1a. an Awareness facet's source node moves → re-roll only that facet (`MEM-11/12`). 1b. injection sum > ~5K ceiling → drop droppable kinds by hit-rate; `constitution`(T0) + `safetyCritical` never drop (`RETR-6`). 1c. milestone → Orientation folds incrementally (`MEM-6`).

### UC-G28 — Steward diagnoses/repairs via `atlas doctor` _(NEW — the ops surface)_

**MSS:** 1) STW runs `atlas doctor` (`why-broken` / `hot-set --budget` / guided `reground`). 2) read-only diagnosis; any write funnels through a governed door (`atlas-emit`/`atlas-link`) (`TOOLS-12/15`, ADR-0003). **Ext:** 1a. direct store write bypassing a governed door → rejected structurally (governed write-door). 1b. index corrupt → route to UC-G31.

### UC-G31 — Index rebuilds from versioned source _(NEW — FR-8 recovery)_

**MSS:** 1) integrity check fails / BLAKE3 mismatch. 2) re-parse + re-resolve + re-rank from git-persisted source. 3) verify against last-good root hash. **Ext:** 1a. source unavailable → fail-closed, serve nothing rather than stale.

### UC-G22 — Re-spawn / replay an ephemeral agent from versioned state _(NEW — the FR-8 headline)_

**Actor:** GIT/system → SEAT · **Trigger:** an agent must be reconstructed (new machine, fork, resume).
**MSS:** 1) on a clean clone, the seat is **idempotently redispatched** — same brief (content-hash) → same seat, same governed inputs (`A-18`). 2) its own closing fold is auto-recalled at spawn (UC-G5a, `MEM-13`). 3) the raw transcript is fetch-on-demand for **audit/replay** (not a resume substrate).
**Extensions:** 1a. **deterministic _resume_ is NOT claimed** — the model is non-deterministic and side-effects don't rewind; re-spawn = **redispatch + replay**, never "continue exactly where it stopped" (`A-18` honest boundary). 2a. transcript fetch-on-demand miss (pruned large-object) → replay degrades to the structured checkpoint, flagged; audit says so. 3a. required non-git state absent → **fail-closed**, do not fabricate a partial agent.

### UC-G27 — Steward diffs the atlas across two versions _(NEW — audit/onboard)_

**MSS:** 1) `atlas-diff <shaA> <shaB>`. 2) tree-diff over shards → added/edited/superseded/decayed facts with provenance. **Ext:** 1a. across a rebase → fold is set-based, diff is stable.
_Realized by:_ **PERSIST-14** (read-only fold-diff — the version-delta) / **TOOLS-16** (`atlas-diff` read-only projection, not a write tool) → **EPIC-32** → **WP-7.32.PERSIST** (owns the delta) + **WP-7.32.TOOLS** (surfaces it).

### UC-G29 — Genesis deepens a scope via the 3 governed loops _(NEW)_

**MSS:** REVIEW/ENRICH/EXPAND, each opt-in, budget-gated, diminishing-returns/fixpoint stop; reuses propose→verify+relate; never changes default cost (`GEN-14`). **Ext:** budget hit → stop; loop-until-dry/fixpoint reached → stop.

### UC-G18/G19/G30/G32 — Index/Check mechanics

Covered mechanically: retrieval (UC-G1), write-decision (UC-G6, 3 orthogonal hashes: contentHash dedup · nodeKey create/update/supersede · subtreeHash drift), **incremental fold** (dirty-bit eager on reverse closure, rState lazy on-read, `maxHops=2` cap, `INDEX-2/12`), predicate check (CHK → HOLDS/BROKEN/NA, `KNOW-16`).

### UC-G25/G26 — Logbook + lesson-promotion

**G25:** ORC writes one logbook entry per PR (append-only, fixed sections: shipped/decisions+why/tradeoffs/risks/openThreads), consultable by prId/date/territory/topic, never injected (`MEM-8`). **G26:** a task/pr lesson is deliberately promoted into project memory (capped, `memory §4.2`).

---

## L3 — Manual (how-to + reference; Diátaxis — these two modes only)

| goal            | how-to                                                                                              | reference (contract)                                              |
| --------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| G1 Locate       | "Call `atlas-query <path\|unit>`."                                                                  | bands: node · related · grounding-leg                             |
| G3 Own-pack     | "You receive `own_<unit>`; drill down finer/refresh/complement."                                    | `own_<U>`; ~1.5K cap                                              |
| G4 Relate       | "Call `atlas relate <unit>`."                                                                       | partitions: enclosing/dependents/dependencies/governing/coChanged |
| G5 Memory       | "Consult your own with `memory-recall`; it's private, consultable, not injected (except re-spawn)." | `memory(scope=task\|pr)`; per-seat grant; MemoryFact schema       |
| G6 Record       | "Emit a ResultCard; the relay absorbs it."                                                          | `ResultCard.absorb`; provenance trailer                           |
| G11/G12 Steward | "Declare territories in the manifest; ratify T0 in the PR."                                         | manifest (globs→owner·tier); T0 human-only                        |
| G14 Rewind      | "Rewind the PR — the atlas rewinds with it."                                                        | git-native archive; merge-driver OR-Set union                     |
| G15 Export      | "Run `export()` for a portable OKF bundle."                                                         | OKF; backend-agnostic rehydrate                                   |
| G27 Diff        | "Run `atlas-diff <A> <B>`."                                                                         | tree-diff over shards                                             |
| G28 Doctor      | "Run `atlas doctor why-broken\|hot-set\|reground`."                                                 | read-only; writes via emit only                                   |
| any node        | "Callable three ways: MCP tool · injected via poke · `atlas node <addr>` from a script."            | tri-transport (`TOOLS-10`); read/subscribe only                   |

---

## Reactive / policy behaviors (Lens 5 — system-initiated, no human actor)

Sweep-order events → policies. Grounded to real invariant IDs (v1's invented `P#` labels removed).

| event                                                                                     | policy (whenever → then)                                                                                                                                                                       | grounding                |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| code unit edited                                                                          | re-hash leaf→root on the affected axis; propagate a drift **dirty-bit** eagerly across reverse closure, recompute `rState` **lazily/on-read**, eager cap `maxHops=2`, deeper = `state-suspect` | INDEX-2/12               |
| cited subtree changes                                                                     | re-check drift across forward-closure; flip FRESH→DRIFTED→BROKEN                                                                                                                               | GROUND-11, A-3           |
| advisory fact's grounding drifts                                                          | resolve to **STALE** (served-with-flag, non-blocking) — never mechanically re-grounded, never blocks                                                                                           | GROUND-13                |
| mechanical drift at reconcile                                                             | auto-re-ground the anchor (no human, no block) under `--accept-reground`; only **semantic** drift flips BROKEN + exit 2                                                                        | KNOW-5, TOOLS-13         |
| merge cites a BROKEN fact                                                                 | block the merge (truth-gate)                                                                                                                                                                   | A-3                      |
| **branch merge**                                                                          | merge-driver OR-Set-unions the two event sets by content-hash → byte-identical, no last-writer/clock/LLM; never a line-merge                                                                   | PERSIST-11, KERNEL-10/11 |
| repo init/clone                                                                           | setup hook **self-installs** `merge=orchestra-atlas` + `.gitattributes` (driver lives in `.git/config`, doesn't travel)                                                                        | PERSIST-11, KERNEL-12    |
| un-configured clone merges the log                                                        | plain 3-way text merge of the append-only JSONL still unions losslessly; re-fold dedups by id                                                                                                  | KERNEL-12                |
| rebase / cherry-pick / squash                                                             | `AtlasState` folds byte-identical (over the set, not commit order); trailers survive onto new SHA                                                                                              | PERSIST-12               |
| git push                                                                                  | adapter configures the refspec to carry `refs/notes/*` (not pushed by default)                                                                                                                 | PERSIST-8/13             |
| WP commit                                                                                 | attach provenance trailer + note (model/tokens/gates/verdict/transcriptSha) via `attachToCommit`                                                                                               | PERSIST-3, A-17          |
| PR open / merge                                                                           | host adapter attaches PR-memory + logbook + ratified knowledge-delta via `attachToPR`                                                                                                          | §7.1, PERSIST-8          |
| transcript about to be written                                                            | cred/secret scrub MUST pass — redact-at-source + ≥2-engine scan; a hit **blocks** the (immutable) write                                                                                        | PERSIST-10a, MEM-9       |
| scope-change                                                                              | settle across N=2 tool calls (debounce), at most once/scope/session, before firing the poke; transient in/out MUST NOT poke                                                                    | RETR-4                   |
| scope entered                                                                             | expose that scope's node-tools (pull); retract on leave                                                                                                                                        | RETR-5                   |
| phase transition                                                                          | auto-inject a fresh `atlas-query`/`own_<unit>` pack (push, no grant) — re-grounding never a seat decision                                                                                      | TOOLS-14                 |
| injection sum > ~5K ceiling                                                               | drop droppable kinds by hit-rate (least-used first); `constitution`(T0) + `safetyCritical` never drop                                                                                          | RETR-6                   |
| served fact/rule cited as governing a decision                                            | increment its `frecency` (a real, auditable hit — not self-assessment)                                                                                                                         | KNOW-17, MEM-7, RETR-8   |
| off-atlas read-rate crosses threshold                                                     | raise a calibration prompt to author the missing tag/edge (MISS-oracle)                                                                                                                        | RETR-13                  |
| T0 territory unresolved/total edges > 15%                                                 | fail the standing coverage gate at build time                                                                                                                                                  | INDEX-16                 |
| reverse closure flagged under-approximate                                                 | auto-union the node's `coChanged` band, labeled correlational                                                                                                                                  | INDEX-13                 |
| path matches no glob / T0-adjacent                                                        | flag `uncovered` (never silent pass); T0-adjacent defaults to **deny** until an owner assigns                                                                                                  | INDEX-14                 |
| manifest drifts/empty                                                                     | regenerate `owner` from graph + git-blame, reconcile, flag divergence; `tier` stays human                                                                                                      | INDEX-15                 |
| direct store write bypassing a governed door                                              | rejected (append-only/permissioned medium or content-address integrity check) — governed write-door                                                                                            | TOOLS-15                 |
| a fact's canonical preimage has a float / non-NFC string / key-order or escape divergence | **fail-closed reject** (a corpus failure, not a runtime surprise) — never round, never emit two CAS objects for one fact                                                                       | KERNEL-1/2               |
| Awareness source node moves                                                               | re-roll only that facet (memoized on its source hash), assembled once/root-state, shared byte-identically                                                                                      | MEM-11/12                |
| milestone / event-log append                                                              | Orientation folds incrementally; every member's injected Orientation reflects new state, byte-identical, no manual write                                                                       | MEM-6/12                 |
| seat re-spawn onto a task/PR it touched                                                   | auto-recall (PUSH) its own closing fold — the one exception to "consultable never auto-injects"                                                                                                | MEM-13                   |
| task closes / PR merges                                                                   | its task/pr memory archived — consultable 90d/50PRs, then archive-only (never deleted)                                                                                                         | MEM-7, memory §7         |
| frecency of a project rule decays to ~0                                                   | evict from the injected set into the archive (no old-popular pinning)                                                                                                                          | MEM-7                    |
| wave enters a cold skeleton territory                                                     | born-from-work dispatches the explorer to mine that territory's blast radius                                                                                                                   | KNOW-13, GEN-7           |
| sealing a wave with no `absorb` and no why-not                                            | the probe records a fed-or-why-not violation                                                                                                                                                   | A-10, KNOW-13            |
| code a doc cites changes                                                                  | the doc (a first-class BLAKE3 CAS object) flags stale exactly like a fact (rosie drift-checks docs)                                                                                            | INDEX-11                 |
| fork/clone                                                                                | the full atlas travels; agents re-spawnable from versioned state                                                                                                                               | PERSIST-12/13            |

---

## Resource / CRUD (Lens 6) — entity × Create/Read/Update/Delete(=archive)/List

✓ surfaced · **M** missing behavior to add downstream · N/A not applicable.

| entity                            | C                        | R                                    | U                          | D=archive                   | L                                                               |
| --------------------------------- | ------------------------ | ------------------------------------ | -------------------------- | --------------------------- | --------------------------------------------------------------- |
| KnowledgeNode                     | ✓                        | ✓                                    | ✓                          | ✓                           | **M** by-tier/territory enumeration (`INDEX-14` territory axis) |
| Candidate (staging)               | ✓                        | ✓                                    | **M** REFINE/CEGIS ≤K      | ✓ ABSTAIN/REJECT            | **M** list for the ranked interview (`GEN-12`)                  |
| MemoryFact — task                 | ✓                        | ✓ (UC-G5)                            | **M** fold-across-attempts | **M** archive on close      | **M** page via memory-recall                                    |
| MemoryFact — pr                   | ✓                        | ✓                                    | **M** update + promote     | **M** archive on merge      | **M**                                                           |
| MemoryFact — project (Rules)      | **M** write always/never | ✓ (injected)                         | **M** promote + frecency   | ✓ evict at frecency→0       | **M** rank injected set                                         |
| MemoryFact — logbook              | ✓ (UC-G25)               | **M** consult by prId/date/territory | **M** supersede-by-link    | N/A                         | **M** chronological                                             |
| Territory/Manifest                | ✓                        | ✓                                    | ~ reconcile                | **M** delete/retire         | ~ terrain                                                       |
| Region (sub-territory)            | **M**                    | **M**                                | N/A                        | N/A                         | **M**                                                           |
| Pack/OwnPack                      | ✓                        | ✓                                    | N/A (re-derived/`refresh`) | N/A                         | N/A                                                             |
| Provenance/Metering               | ✓ (UC-G10)               | ✓                                    | N/A immutable              | N/A                         | **M** aggregate/WP/wave/model                                   |
| Transcript/Checkpoint             | ~ scrub-first            | **M** `fetchTranscript`+replay       | N/A                        | N/A (full, never truncated) | **M** by WP                                                     |
| StructRef/grounding leg           | ✓                        | ✓                                    | **M** mechanical re-ground | N/A                         | N/A                                                             |
| Index/Rollup                      | ✓                        | ✓                                    | ✓ (UC-G30)                 | N/A                         | **M** rollup "everything T0"                                    |
| Awareness slab                    | ✓ (UC-G24)               | ✓ (injected)                         | ✓ re-roll on drift         | N/A                         | N/A                                                             |
| Orientation slab                  | ✓ (UC-G24)               | ✓                                    | ✓ fold on milestone        | N/A                         | N/A                                                             |
| Event/EventLog                    | ✓                        | **M** `fold`→reconstruct             | N/A append-only            | N/A                         | **M** replay rebuilds Atlas                                     |
| Edge                              | ✓                        | ✓                                    | N/A                        | N/A                         | **M** record unresolved/dynamic                                 |
| Doc (docs-as-objects)             | **M**                    | **M**                                | **M** drift-check          | N/A                         | **M** (`INDEX-11`)                                              |
| Host attachment (Note/Trailer/PR) | ~ trailer                | **M** readCommit/readPR              | N/A                        | N/A                         | N/A                                                             |
| Ledger (hits/off-atlas budget)    | **M** log a hit          | **M** budget()/offAtlas()            | **M** decay                | N/A                         | **M**                                                           |

**M cells are behaviors S1 must turn into requirements** — flagged, not silently dropped. Highest-value: the **project Rules-slab CRUD**, the **turn-header assembly** (UC-G24), the **event-log fold/replay**, the **ledger**, **docs-as-objects**, and the **host-adapter PR read+attach**.

---

## Lens-sweep log & closure predicates

| lens                                 | status                                                                                                                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 Actor (incl. non-human + triggers) | ✅ +grounded sweep (13 actors; GIT/HOST/MRG/GEN/IDX/CHK/DRF/LDG explicit)                                                                                                      |
| 2 Actor×Goal matrix                  | ✅ rows non-empty; **column check N/A (list format)**                                                                                                                          |
| 3 Journey / per-persona re-walk      | ✅ 4 personas                                                                                                                                                                  |
| 4 Extension / negative-space         | ✅ round-1 (core + critic gaps folded); long tail to re-verify                                                                                                                 |
| 5 Reactive / policy                  | ✅ round-1 grounded sweep (33 policies, real invariant IDs)                                                                                                                    |
| 6 Resource / CRUD                    | ✅ matrix (M-cells flagged as downstream requirements); grounding 33/33 + CRUD verified clean                                                                                  |
| loop-until-dry                       | ✅ round-2 verification swept → round-3 folded its 7 findings (2 bodyless goals, MEM-1 confidentiality fix, cv-migration, GEN-8 resume, encoder-integrity, import) → converged |

**Closure predicates** (honest, post round-3):

- ✅ Actor×Goal rows non-empty · **N/A** column (list, not grid, by design)
- ✅ Every sea-level UC has extensions — G11/G22 authored in round-3 (the last two bodyless goals); a few `-` subfunctions remain MSS-only by design
- ✅ Kite/fish roll-up — G0 decomposes; no orphan sea-level goal remains (G11/G22/G35 now bodied)
- ✅ Backbone re-walked per persona
- ✅ Every reactive event has a producing actor AND a policy (34-row table, grounding 33/33 verified + 1 added)
- ✅ Every entity CRUD accounted — **M**-cells are named downstream requirements (intentional → S1), not misses
- ✅ loop-until-dry — round-2 came back ONE-MORE-ROUND (scoped); round-3 folded it; the critic pre-judged no round-3 _class_ would remain, and none did

> **Grounding:** an independent accuracy pass verified **33/33 reactive citations + the 4 v1 fixes + all new-UC groundings** against the spec; one loose citation (KnowledgeNode-List) was corrected to `INDEX-14`. The catalog is grounded, complete, and converged.

## Next

- **Optional final cold-review** (2 decorrelated + a DAG pass) against the `functional-surface` contract — the round-1/2/3 sweeps already served as grounded, decorrelated review; this is the formal seal if desired.
- Then **D2 — Structure** (FR→DP coupling matrix) consumes this catalog; the CRUD **M**-cells and the `cv`-migration open question (`spec §9`) carry forward as flagged inputs.
