# Wave Plan — Atlas WP execution (post scaffold-freeze)

> The dispatch decision record that opens WP execution. Derived from the frozen roadmap
> (`roadmap.md`, 50 epics × 8 campaigns), the 71 WP cards (`work-packages/wp-campaign-*.md`), and the
> **frozen scaffold** (`packages/*/ref/*.ts`, 9 packages L0–L8, `tsc -b` green, 119 files ≤400 LOC).
> Two independent gates cleared this plan's inputs: bobby (architectural cold-review of the scaffold —
> **APPROVE**, 6/6 structural invariants PASS, zero unflagged decision-leaks) + jimmy (mechanical
> WP→file ownership matrix). Nothing here is self-reported.

## GO/NO-GO — HYBRID (campaign-parallel, WP-serial on shared files)

Campaigns are the parallel unit (they partition epics ⇒ disjoint REQs ⇒ disjoint packages). **Every
write-conflict is INTRA-campaign** (see §Conflict-map) — no cross-campaign shared writer exists — so
the campaign-parallel structure holds and the only serialization is _within_ a campaign's own wave.

## Merge order (DAG-ordered — from the roadmap topo)

```
WAVE A : CAMPAIGN-1 ∥ CAMPAIGN-2      (kernel/persist floor  ∥  index)
WAVE B : CAMPAIGN-3 ∥ CAMPAIGN-4      (persist/mem host      ∥  grounding/knowledge/tools truth-gate)
WAVE C : CAMPAIGN-5                    (knowledge lifecycle — router/template/tier)
WAVE D : CAMPAIGN-6 ∥ CAMPAIGN-8      (retrieval/memory serve ∥ genesis bootstrap)
WAVE E : CAMPAIGN-7                    (tools public surface + atlas-diff; edge C7→C3 provenance)
```

Topo: {1,2} → {3,4} → {5} → {6,8} → {7}. A campaign opens only when its DAG-predecessors are SEALED.

## Package → WP fan-in (parallelism width)

| package   | #WPs | package       | #WPs                                           |
| --------- | ---- | ------------- | ---------------------------------------------- |
| tools     | 12   | memory        | 7                                              |
| knowledge | 11   | kernel        | 6                                              |
| persist   | 8    | retrieval     | 6                                              |
| index     | 8    | grounding     | 5                                              |
| genesis   | 8    | **contracts** | **0** (pure types — frozen at scaffold, no WP) |

Total = 71 WPs. Cap ≤6 concurrent per wave for non-trivial prompts (techlead §1.4).

## Conflict-map — shared ref files (single-write-owner / sequencing)

Mechanically extracted (jimmy). Every co-writer pair is **intra-campaign**; classification:

| ref file                                                        | writers                      | campaign | verdict                         | order                            |
| --------------------------------------------------------------- | ---------------------------- | -------- | ------------------------------- | -------------------------------- |
| `tools/ref/handler.ts`                                          | 7.26-b, 7.26-c, 7.32.TOOLS   | 7        | **SEQUENTIAL** (one dispatcher) | 7.26-b → 7.26-c → 7.32           |
| `index/ref/depgraph.ts`                                         | 2.6, 2.8-b.INDEX             | 2        | **SEQUENTIAL**                  | 2.6 (build) → 2.8-b (depends-on) |
| `index/ref/fold.ts`                                             | 2.7-a, 2.7-b                 | 2        | **SEQUENTIAL**                  | 2.7-a (rollup) → 2.7-b (drift)   |
| `knowledge/ref/router.ts`                                       | 5.13-a, 5.13-b               | 5        | **SEQUENTIAL**                  | 5.13-a → 5.13-b                  |
| `tools/ref/handler.ts` (also oracle for 7.26-a/b via rename R1) | 7.26-a, 7.26-b, 7.26-c, 7.32 | 7        | **SEQUENTIAL** (one dispatcher) | 7.26-a → -b → -c → 7.32          |

Read-only cross-package consumers (NOT co-writers, no conflict): `index/ref/depgraph.ts` ← WP-2.8-b.RETR
(guardrail "MUST NOT edit index/\*\*"); `kernel/ref/fold.ts` ← WP-7.32.PERSIST (reused fold oracle).

**Everything else is CONFLICT-FREE** at package grain. Caveat (§Reconciliation R4): the 15 ref-naming
WPs are file-pinned; the other 56 are req/golden-anchored — their intra-package file-disjointness rests
on the facet-narrative + single-package guardrail, to be made mechanical at digest-freeze.

## Reconciliation registry — MUST close before/at digest-freeze

| #   | item                                                                                                  | detail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | close where                                                                              |
| --- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| R1  | **Dangling ref pointers** ✅ CLOSED                                                                   | tools cards named `tools/ref/{store,tool,ladder}.ts`; scaffold has them under real facet names. Rename applied (read-of-cards): `store→guard` (writePaths/single-write-door; surface=Tool union in types.ts, append-only store=@atlas/persist), `tool→handler` (pure/total wrapper + Verdict guidance stamp), `ladder→transport`. Nothing missing — pure rename; input-list dups deduped.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | DONE in wp-campaign-7.md                                                                 |
| R2  | **`@orchestra/*` residual** ✅ CLOSED                                                                 | was 3 occ of `@orchestra/kernel` in 2 cards (WP-1.1-a.KERNEL ×2, WP-4.10-a.GROUND ×1) → `@atlas/kernel`. (The `merge=orchestra-atlas` git driver name is unrelated — kept.)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | DONE in wp-campaign-{1,4}.md                                                             |
| R3  | **Reference contradictions** (bobby tripwires — scaffold correctly refused to invent)                 | (a) Event shape: atlas-kernel vs fspec-merge (KERNEL-10, scaffold pinned fspec-merge, dropped kind/actor/at); (b) ClaimEntry = kernel Event vs atlas-knowledge `{claimNorm,claimText,provenance}`; (c) KNOW fields owner/scope/predicateSlot/supersededBy required-by-invariant, absent from record; (d) frecency vs hits (scaffold pinned MEM-7 frecency).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | reconciled IN the owning WP (KRN/KNW/MEM data-model WPs) — flagged in ref, not a blocker |
| R4  | **File-ownership for the 56 req-anchored WPs**                                                        | make each WP's owned `src/<facet>.ts` mechanical by binding source_reqs→facet at digest-freeze, so intra-package disjointness is proven not asserted                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | digest-freeze tooling                                                                    |
| R5  | **Card `parallel_group` vs conflict-map + ref-anchor vs src-target** (bobby Dim 4)                    | ✅ PARTLY CLOSED: WP-7.26-b/c marked `[P]` but share `src/handler.ts` → corrected to SEQUENTIAL per the conflict-map (cards now cite it). REMAINING: several cards' `anchor` names `ref/<facet>.ts` as the _target_, but `ref/` is the read-only oracle — the **write target is `src/<facet>.ts`**. The conflict-map + BIND now resolve `src_target`; the card `anchor` prose should be re-pointed at `src/` at digest-freeze (R4 makes it mechanical).                                                                                                                                                                                                                                                                                                                                                                                                                           | wp-campaign-7.md (done) + digest-freeze (R4)                                             |
| R6  | **Acceptance-artifact prerequisites for FULL-assurance GATE** (EXECUTION-PROTOCOL _Assurance levels_) | ✅ **Wave P DONE** (commit `4612964`): the frozen property set `properties-*.md` (134 ∀-laws, one per behavioural INV, cold-reviewed faithful) — GATE now runs at **PBT** assurance (mutation + PBT + witness + diff-scope + purity), which disproves fixture-overfitting. `differential` is **subsumed by PBT** (no executable oracle needed — path (a) rejected: would rewrite 102 pure-type ref files + reopen scaffold/digest). ✅ **Wave H DONE** (commit `fdf105c`): ~340 independent held-out `-2` fixtures, one per behavioural conformance REQ, append-only (3396 insertions, 0 deletions); cold-reviewed genuinely independent (not clones), no smuggled threshold. GATE's held-out leg now AVAILABLE ⇒ **FULL assurance**. A leg stays UNAVAILABLE only for a residue/DEFINE-pending (θ/τ/κ/Θ) or delegated (billy/FR-12) REQ — recorded honestly per-WP, never faked. | ✅ **Wave P + Wave H both DONE** — GATE at FULL assurance                                |

R1+R2 are trivial text fixes (do before wave). R3 is designed-in (each is a 1-line ref FLAG the WP resolves against the reference). R4 is the digest-freeze deliverable.

## Execution risk flags (design-judgment — NOT spec-conformance)

These are risks the gates do **not** catch: the gates verify "we built what we specced," not "we specced the
right thing." Flagged here so they get de-risked during execution, not discovered after.

| #      | flag                                                                                                                                | risk                                                                                                                                                                                                                                                                                                                                                            | mitigation at execution                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **X1** | **Announcement granularity = PACK, not per-node** (WP-6.21.RETR, RETR-4/5; tri-transport WP-7.26-c) · **OWNER DECISION 2026-07-18** | The original "expose a scope's **node-tools** on entry, retract on leave" flavor risks a **tool-swarm**: hundreds of per-fact tools pinging collapses the model's tool-selection accuracy, bloats context, and adds latency — worse than nothing. It also leans on harness features many runtimes lack (mid-turn scope detect + dynamic tool (de)registration). | **The unit that announces availability is the logical PACK, not the individual node** — and the pack IS `own_<unit>` (crate / module / feature / territory boundary; no new boundary invented). On a scope settle, only the **pack(s) governing the current scope announce** (a handful, scope-local — never every crate). Per-node access is **drill-down WITHIN the pack**, reached through it, never a top-level swarm. This also dissolves the harness risk: few coarse, logically-bounded packs (potentially near-static) ≫ many dynamic node-tools. Spine stays **`own_<unit>` push-as-file** (`TOOLS-14`, works everywhere); pack-announce is the enhancement to validate-then-trust. **Execution note:** WP-6.21 (node-tool projection) must project at **pack grain**, with node-level as an in-pack drill-down — reshape its exposure model accordingly at BIND. |
| **X2** | **Three-slab turn-header** (Awareness / Orientation / Rules — WP-6.22, 6.24-a/b, 6.25)                                              | Possible over-factoring: three separate injected slabs earn their keep only if their **cadences genuinely differ** (Awareness memoized/near-static · Orientation folds per-milestone · Rules ranked by frecency). If in practice they move together, it's taxonomy-for-its-own-sake.                                                                            | Watch during execution: if the three cadences don't diverge on real usage, collapse to one header slab. Not fatal either way — it's an internal composition, not a public contract.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **X3** | **Memory value, not structure** (MEM distillation — WP-6.23/6.25; cross-ref the Maestro M1–M4 lesson)                               | The schema (task/pr = one `MemoryFact` shape, different scopes) is lean and fine. The hard part no spec can guarantee: **is the distilled craft-lesson worth injecting, or is it garbage?** A known-hard problem (already hit in Maestro: "extract a real craft-lesson, not a copy of the reflection").                                                         | Judge memory quality by _observed cited-hit rate_ (the ledger, `KNOW-17/RETR-8`), not by whether the write succeeded. A lesson nobody cites decays out by frecency — the design self-corrects, but only if we measure hits honestly.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

**Standing directive for the execution waves:** treat `own_<unit>` **push-as-file as the always-works spine**; treat X1's dynamic node-tools as the luxury to validate-then-trust. None of X1–X3 blocks Wave A (kernel/persist/index) — they surface at Campaigns 6–7 (retrieval/memory/tools).

### D1 — the own-pack carries an availability manifest (OWNER DECISION 2026-07-18)

`own_<unit>` injects not only the curated brief but the **cognizance of the on-demand surface** — a lightweight
**availability manifest** so the agent's _pull_ is informed, not blind (you can't pull what you don't know exists).
The manifest lists, as **pointers + one-line labels + how-to-pull** (name/digest — **never the content**):

- **adjacent packs** (`own_<neighbour>`, the governing territory's pack),
- the **deeper drill-down** available here (finer / refresh / complement),
- the relevant **memory scopes** (this seat's pr-memory, this territory's logbook),
- **where the rich knowledge lives** (which territory is well-covered, which seat holds relevant experience).

**Guardrail (or it becomes a second swarm):** the manifest is a **bounded index** — pointers only, capped, and
relevance/frecency-ranked; it counts against the pack budget and drops by hit-rate like everything else. It is a
small "you-are-here + reachable map," never the facts themselves. **Execution note:** WP-6.20.RETR (OwnPack
composer) gains an _availability-manifest_ facet — pointers to reachable packs/memory/knowledge, ranked + capped,
content-free — reshape the composer at BIND. Fits the Awareness lineage (lay-of-the-land) but scoped to the unit.

### D2 — CLI-floor is UNIVERSAL across all three surfaces (OWNER DECISION 2026-07-18)

Every callable — **knowledge**, **memory**, **and the governance/mcp tools** — MUST be reachable over the **CLI
/ bash floor**, so a sub-agent or a model **with no MCP** (no tool grant, no in-process server) is never locked
out. Reads (recall / query / node / diff / doctor) resolve over CLI directly; writes funnel through the single
write-door (`atlas-emit`), which is itself a CLI tool (TOOLS-3) — so writes are CLI too, via the one door, never
a second path.

**Where it's already airtight:** knowledge nodes + the five governance tools — `TOOLS-3` (CLI≡MCP parity),
`TOOLS-10` (one handler behind MCP / poke / CLI), `TOOLS-11` ("the CLI is the floor, not the fallback";
a `Read`-only no-grant seat still reaches everything).

**The gap to pin (owner's point):** the tri-transport / CLI-floor guarantee is pinned in the **TOOLS** module for
knowledge nodes; the **memory** surface (`memory-recall`) describes the verb as _consultable_ but does **not**
restate the CLI-floor invariant on itself. Intent is "one handler, CLI floor for everything," but it is
implied-not-pinned for memory. **Execution note:** WP-6.23.MEM (memory recall path) must hold `memory-recall`
to the same `TOOLS-10/11` CLI-floor (one handler, byte-identical over MCP / poke / CLI, `Read`-only-seat
reachable) — pin it explicitly at BIND, and thread the memory-recall handler through the tri-transport handler
(WP-7.26-c) so there is genuinely **one** transport contract across knowledge ∧ memory ∧ tools, not two.

## Per-WP execution machine (deferred — Phase 3, off critical path)

Each WP runs BIND→RED→GREEN→REFACTOR\*→GATE→SEAL (RED = confirm the frozen golden fails, not author it;
model never writes FS — orchestration applies post-gate; mutation-at-seal catches false-green). Not built
yet; the wave cannot execute until it + the digest-freeze tooling exist.

## Definition of Done (per WP)

GATE green (typecheck + the WP's frozen goldens, by reference) ∧ cold-review APPROVE (decorrelated seat)
→ SEAL. Merge in the DAG order above; main stays green; ≤400 LOC/file holds (godfile-guard in CI).
