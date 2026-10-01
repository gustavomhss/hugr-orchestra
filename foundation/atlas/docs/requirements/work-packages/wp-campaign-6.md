# Work Packages — CAMPAIGN-6 (state S4)

> Retrieval, memory & turn-header injection. One WP-card per (epic × module), conforming to
> `method/wp-template.md`. Every substantive field is a `ptr+digest` (the digest is tooling-filled at
> S4-freeze — the `# ptr+digest` marker flags it); `exec` fields are present-but-empty. `intent` is the one
> non-authoritative prose carve-out. Prereqs (frozen upstream, out of this slice): CAMPAIGN-2 (index substrate:
> relate/PPR/territories/drift-oracle) + CAMPAIGN-5 (knowledge write-decision/lifecycle).

---

## EPIC-18 — calibration ledger (hits, decay, MISS-oracle)

### WP-6.18.KNOW — KNOW slice of EPIC-18

epic: EPIC-18
id: WP-6.18.KNOW
content_hash: <filled-at-freeze>
title: served-fact hits ledger + door-2 threshold calibration + decay/re-entry
intent: >
A served fact accrues a logged hit when it governs a decision; the Door-2 admission threshold calibrates on observed downstream hits (never proposer self-assessment); an unconsulted fact decays out to CAS (never deleted) and may re-enter on a later hit. (non-authoritative)
source_reqs: # ptr+digest

- source: ../req-knw.md#REQ-KNOW-17a # ptr+digest
- source: ../req-knw.md#REQ-KNOW-17b # ptr+digest
- source: ../req-knw.md#REQ-KNOW-17c # ptr+digest
- source: ../req-knw.md#REQ-KNOW-17d # ptr+digest
  seam-freezes: [ "served-fact hits/calibration ledger (KNOW-17) owned-by KNOW, consumed-by RETR", "served-fact hits/calibration ledger (KNOW-17) owned-by KNOW, consumed-by GEN" ]
  anchor: knowledge module · the served-fact hits ledger + Door-2 calibration path (resolve against the code tree at execution; oracle = the KNOW-17 reference model)
  interface_contract: # ptr+digest
- source: ../../reference/atlas-knowledge.md#know-17 # ptr+digest
  exclusions: does NOT own the RETR per-kind hitRate ledger (RETR-8, internal to RETR) nor the RETR off-atlas ledger (RETR-13); does NOT define pack cap/drop order.
  inputs: # ptr+digest
- source: ../../reference/atlas-knowledge.md#know-17 # ptr+digest
  action: implement KNOW-17 hits accrual + Door-2 threshold calibration + decay/re-entry to satisfy the referenced goldens; no behaviour beyond the frozen reqs.
  action_surface: [ read-atlas-index, write-cas, run-goldens ]
  guardrails: edit only the knowledge module hits/calibration surface; no LLM in the calibration decision; decayed facts archived to CAS, never deleted; fail-closed on malformed input.
  repair_budget: N=3 · early-stop on {repeated-failure, no-change, semantic-dup}
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-knw.md#SCN-KNOW-17a-1 # ptr+digest
- source: ../goldens-knw.md#SCN-KNOW-17b-1 # ptr+digest
- source: ../goldens-knw.md#SCN-KNOW-17c-1 # ptr+digest
- source: ../goldens-knw.md#SCN-KNOW-17d-1 # ptr+digest
  deps: [ ] parallel_group: [P]
  exit_predicate: all acceptance goldens green ∧ all gates pass
  context_refs: # closed list
- source: ../../roadmap/roadmap.md#epic-18
- source: ../surface-map.md#knw
  owner: unassigned@dispatch # value · set by techlead dispatch
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-KNOW-17

### WP-6.18.RETR — RETR slice of EPIC-18

epic: EPIC-18
id: WP-6.18.RETR
content_hash: <filled-at-freeze>
title: caps tuned by observed hits + hitRate drop-order + per-territory off-atlas (MISS-oracle) ledger
intent: >
Injection caps tune on the ledger's observed hits (not static guesswork); per-kind hitRate drives the RETR-6 drop order (least-used first); a per-territory off-atlas rate is logged, deterministic, rate-0 on no history, never throws, and crossing threshold raises a calibration prompt. (non-authoritative)
source_reqs: # ptr+digest

- source: ../req-ret.md#REQ-RETR-8a # ptr+digest
- source: ../req-ret.md#REQ-RETR-8b # ptr+digest
- source: ../req-ret.md#REQ-RETR-13a # ptr+digest
- source: ../req-ret.md#REQ-RETR-13b # ptr+digest
- source: ../req-ret.md#REQ-RETR-13c # ptr+digest
- source: ../req-ret.md#REQ-RETR-13d # ptr+digest
- source: ../req-ret.md#REQ-RETR-13e # ptr+digest
  seam-freezes: [ "served-fact hits/calibration ledger (KNOW-17) consumed-from KNOW (frozen upstream)" ]
  anchor: retrieval module · caps/drop-order tuning + off-atlas per-territory ledger (oracle = retrieval/ref/\*.ts reference model per goldens-ret.md)
  interface_contract: # ptr+digest
- source: ../../reference/atlas-retrieval.md#retr-8 # ptr+digest
- source: ../../reference/atlas-knowledge.md#know-17 # ptr+digest
  exclusions: does NOT define the served-fact hits ledger (KNOW-17, consumed); does NOT set the injection ceiling/cold-start order (RETR-6, EPIC-22); the off-atlas threshold value is DEFINE-supplied (SCN-RETR-13b-1 is parametric on θ — do not invent the constant).
  inputs: # ptr+digest
- source: ../../reference/atlas-retrieval.md#retr-8 # ptr+digest
- source: ../../reference/atlas-knowledge.md#know-17 # ptr+digest
  action: implement RETR-8 cap-tuning + hitRate drop-order and the RETR-13 off-atlas ledger against the referenced goldens; consume the KNOW-17 hits contract, do not redefine it.
  action_surface: [ read-atlas-index, read-ledger, run-goldens ]
  guardrails: edit only the retrieval caps/ledger surface; deterministic ledger; no-history ⇒ rate 0, never throw; threshold θ bound only from DEFINE, never fabricated.
  repair_budget: N=3 · early-stop on {repeated-failure, no-change, semantic-dup}
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-ret.md#SCN-RETR-8a-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-8b-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-13a-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-13b-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-13c-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-13d-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-13e-1 # ptr+digest
  deps: [ WP-6.18.KNOW ] parallel_group: —
  exit_predicate: all acceptance goldens green ∧ all gates pass
  context_refs: # closed list
- source: ../../roadmap/roadmap.md#epic-18
- source: ../req-ret.md#needs-reconciliation
- source: ../surface-map.md#ret
  owner: unassigned@dispatch # value
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-RETR-8

### WP-6.18.GEN — GEN slice of EPIC-18

epic: EPIC-18
id: WP-6.18.GEN
content_hash: <filled-at-freeze>
title: genesis seeds loose-but-thin, hits-calibrated (not self-assessed), decay
intent: >
Genesis does not rest the non-obvious/actionable gate on proposer self-assessment; it seeds loose-but-thin, each seeded fact accrues logged hits (KNOW-17), an unconsulted seed decays out (archived, re-enterable), and the ranking threshold calibrates against observed hits. UNAMENDED by ADR-0012, which adds the a-priori obviousness score as the cold-start prior composing with — never replacing — hits-decay. (non-authoritative)
source_reqs: # ptr+digest

- source: ../req-gen.md#REQ-GEN-16a # ptr+digest
- source: ../req-gen.md#REQ-GEN-16b # ptr+digest
- source: ../req-gen.md#REQ-GEN-16c # ptr+digest
- source: ../req-gen.md#REQ-GEN-16d # ptr+digest
- source: ../req-gen.md#REQ-GEN-16e # ptr+digest
  seam-freezes: [ "served-fact hits/calibration ledger (KNOW-17) consumed-from KNOW (frozen upstream)" ]
  anchor: genesis module · seed-gate calibration path (consumes KNOW-17 hits; oracle = the GEN-16 reference model)
  interface_contract: # ptr+digest
- source: ../../reference/atlas-genesis.md#gen-16 # ptr+digest
- source: ../../reference/atlas-knowledge.md#know-17 # ptr+digest
  exclusions: does NOT define the hits ledger or Door-2 mechanics (KNOW-17, consumed); GEN only proposes/seeds and calibrates its own admission threshold off the shared hits.
  inputs: # ptr+digest
- source: ../../reference/atlas-genesis.md#gen-16 # ptr+digest
- source: ../../reference/atlas-knowledge.md#know-17 # ptr+digest
  action: implement GEN-16 loose-but-thin seeding + hits-calibrated admission + decay against the referenced goldens; consume the KNOW-17 hits contract, do not redefine it.
  action_surface: [ read-atlas-index, write-cas, run-goldens ]
  guardrails: edit only the genesis seed-gate surface; gate never rests on self-assessment; decayed seeds archived, never deleted.
  repair_budget: N=3 · early-stop on {repeated-failure, no-change, semantic-dup}
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-gen.md#SCN-GEN-16a-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-16b-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-16c-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-16d-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-16e-1 # ptr+digest
  deps: [ WP-6.18.KNOW ] parallel_group: —
  exit_predicate: all acceptance goldens green ∧ all gates pass
  context_refs: # closed list
- source: ../../roadmap/roadmap.md#epic-18
- source: ../surface-map.md#gen
  owner: unassigned@dispatch # value
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-GEN-16

---

## EPIC-19 — bounded pack assembly (tier floor, PPR, cap)

### WP-6.19.RETR — RETR slice of EPIC-19

epic: EPIC-19
id: WP-6.19.RETR
content_hash: <filled-at-freeze>
title: the bounded pack — relevance-from-index, ~2K cap, T0-then-T1-by-rank, per-type caps, total surface
intent: >
Relevance resolves only from the hashed structural index; a pack stays ≤~2K, fills every T0 in full then T1 by (hits-desc, ppr-desc, nodeKey-asc), caps-win-over-silent-drop with a truncation marker + pull-reachable tail, merged packs share one budget, no free prose; each injection kind respects its own sweet-spot cap under the pinned measure; a malformed scope yields empty and never throws. (non-authoritative)
source_reqs: # ptr+digest

- source: ../req-ret.md#REQ-RETR-1 # ptr+digest
- source: ../req-ret.md#REQ-RETR-2a # ptr+digest
- source: ../req-ret.md#REQ-RETR-2b # ptr+digest
- source: ../req-ret.md#REQ-RETR-2c # ptr+digest
- source: ../req-ret.md#REQ-RETR-2d # ptr+digest
- source: ../req-ret.md#REQ-RETR-2e # ptr+digest
- source: ../req-ret.md#REQ-RETR-2f # ptr+digest
- source: ../req-ret.md#REQ-RETR-7a # ptr+digest
- source: ../req-ret.md#REQ-RETR-7b # ptr+digest
- source: ../req-ret.md#REQ-RETR-7c # ptr+digest
- source: ../req-ret.md#REQ-RETR-7d # ptr+digest
- source: ../req-ret.md#REQ-RETR-9a # ptr+digest
- source: ../req-ret.md#REQ-RETR-9b # ptr+digest
  seam-freezes: [ "bounded-pack contract (RETR-2 cap/fill/no-prose + pinned measure) owned-by RETR, consumed-by TOOLS" ]
  anchor: retrieval module · pack assembler + per-type cap enforcement + total-surface guard (oracle = retrieval/ref/{pack,rank}.ts per goldens-ret.md; caps under cl100k_base pinned measure)
  interface_contract: # ptr+digest
- source: ../../reference/atlas-retrieval.md#retr-2 # ptr+digest
  exclusions: does NOT own atlas-query surfacing (TOOLS-6, consumer); does NOT own stale/re-ground semantics (RETR-3, EPIC-22) nor the injection ceiling (RETR-6, EPIC-22); Awareness/Orientation are derived, never written here (RETR-7c).
  inputs: # ptr+digest
- source: ../../reference/atlas-retrieval.md#retr-2 # ptr+digest
- source: ../../reference/atlas-retrieval.md#retr-7 # ptr+digest
  action: implement RETR-1/2/7/9 pack assembly + caps + total surface against the referenced goldens under the pinned cap measure; no behaviour beyond the frozen reqs.
  action_surface: [ read-atlas-index, tokenize-cl100k, run-goldens ]
  guardrails: edit only the retrieval pack surface; enforce every cap as a concrete Pack.tokenEstimate under the pinned tokenizer; cap wins over completeness (never a silent drop); malformed scope ⇒ empty, never a throw.
  repair_budget: N=3 · early-stop on {repeated-failure, no-change, semantic-dup}
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-ret.md#SCN-RETR-1-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-2a-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-2b-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-2c-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-2d-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-2e-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-2f-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-7a-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-7b-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-7c-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-7d-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-9a-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-9b-1 # ptr+digest
  deps: [ ] parallel_group: [P]
  exit_predicate: all acceptance goldens green ∧ all gates pass
  context_refs: # closed list
- source: ../../roadmap/roadmap.md#epic-19
- source: ../surface-map.md#ret
  owner: unassigned@dispatch # value
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-RETR-2

### WP-6.19.TOOLS — TOOLS slice of EPIC-19

epic: EPIC-19
id: WP-6.19.TOOLS
content_hash: <filled-at-freeze>
title: atlas-query — resolve scope to covering territories, return the bounded tier≥T1 pack, re-ground stale
intent: >
atlas-query accepts any scope (file/folder/module/crate), resolves it through the index to covering territories, returns a ≤~2K pack of tier≥T1 invariants, and requires re-grounding before a stale:true pack is trusted. (non-authoritative)
source_reqs: # ptr+digest

- source: ../req-tls.md#REQ-TOOLS-6a # ptr+digest
- source: ../req-tls.md#REQ-TOOLS-6b # ptr+digest
- source: ../req-tls.md#REQ-TOOLS-6c # ptr+digest
  seam-freezes: [ "bounded-pack contract (RETR-2) consumed-from RETR (frozen upstream)" ]
  anchor: tools module · atlas-query handler (resolve→pack) over the index and RETR pack assembler
  interface_contract: # ptr+digest
- source: ../../reference/atlas-retrieval.md#retr-2 # ptr+digest
- source: ../../reference/atlas-tools.md#tools-6 # ptr+digest
  exclusions: does NOT assemble/cap the pack (RETR-2, consumed); does NOT define stale/re-ground semantics (RETR-3, EPIC-22, consumed frozen upstream) — only enforces re-ground-before-trust at the query surface.
  inputs: # ptr+digest
- source: ../../reference/atlas-tools.md#tools-6 # ptr+digest
- source: ../../reference/atlas-retrieval.md#retr-2 # ptr+digest
  action: implement the atlas-query tool (scope-resolve → bounded tier≥T1 pack → stale re-ground) against the referenced goldens; consume the RETR pack contract, do not reimplement assembly.
  action_surface: [ read-atlas-index, call-retr-packer, run-goldens ]
  guardrails: edit only the atlas-query tool surface; pack is a read projection with no write authority; stale:true ⇒ re-ground before trust.
  repair_budget: N=3 · early-stop on {repeated-failure, no-change, semantic-dup}
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-tls.md#SCN-TOOLS-6a-1 # ptr+digest
- source: ../goldens-tls.md#SCN-TOOLS-6b-1 # ptr+digest
- source: ../goldens-tls.md#SCN-TOOLS-6c-1 # ptr+digest
  deps: [ WP-6.19.RETR ] parallel_group: —
  exit_predicate: all acceptance goldens green ∧ all gates pass
  context_refs: # closed list
- source: ../../roadmap/roadmap.md#epic-19
- source: ../surface-map.md#tls
  owner: unassigned@dispatch # value
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-TOOLS-6

---

## EPIC-20 — OwnPack: curated, zero-assembly delivery

### WP-6.20.RETR — RETR slice of EPIC-20

epic: EPIC-20
id: WP-6.20.RETR
content*hash: <filled-at-freeze>
title: OwnPack — mechanical, zero-assembly own*<unit> pushed at dispatch, capped, drill-down, epic-composed, deduped
intent: >
Every scope-unit projects an own*<id> tool returning a curated OwnPack, pre-composed so the agent never chooses scope/assembles; composition is mechanical/deterministic from index reads with no LLM and no free prose, capped under the ceiling, with pull-reachable drill-down; a seat gets its own by default; grounding source follows unit level; an epic is not a grounded own unit so own*<epic> composes from goal + feature OwnPacks; own dedups against a co-injected pack (own wins, pack shows a pointer). (non-authoritative)
source_reqs: # ptr+digest

- source: ../req-ret.md#REQ-RETR-12a # ptr+digest
- source: ../req-ret.md#REQ-RETR-12b # ptr+digest
- source: ../req-ret.md#REQ-RETR-12c # ptr+digest
- source: ../req-ret.md#REQ-RETR-12d # ptr+digest
- source: ../req-ret.md#REQ-RETR-12e # ptr+digest
- source: ../req-ret.md#REQ-RETR-12f # ptr+digest
- source: ../req-ret.md#REQ-RETR-12g # ptr+digest
- source: ../req-ret.md#REQ-RETR-12h # ptr+digest
- source: ../req-ret.md#REQ-RETR-12i # ptr+digest
- source: ../req-ret.md#REQ-RETR-12j # ptr+digest
- source: ../req-ret.md#REQ-RETR-12k # ptr+digest
- source: ../req-ret.md#REQ-RETR-12l # ptr+digest
  seam-freezes: [ ]
  anchor: retrieval module · OwnPack composer + own\_<unit> projection (oracle = retrieval/ref/own.ts per goldens-ret.md)
  interface_contract: # ptr+digest
- source: ../../reference/atlas-retrieval.md#retr-12 # ptr+digest
  exclusions: does NOT choose scope or assemble by LLM; does NOT own the base pack assembler (RETR-2, EPIC-19) — reuses its bounded reads; drill-down detail stays pull-reachable, never inlined.
  inputs: # ptr+digest
- source: ../../reference/atlas-retrieval.md#retr-12 # ptr+digest
  action: implement RETR-12 OwnPack composition + own\_<unit> projection + epic-composition + dedup against the referenced goldens; mechanical index reads only.
  action_surface: [ read-atlas-index, read-manifest, run-goldens ]
  guardrails: edit only the retrieval OwnPack surface; no LLM, no free prose; capped under the ceiling; epic never treated as a grounded own unit; dedup by nodeId with own winning.
  repair_budget: N=3 · early-stop on {repeated-failure, no-change, semantic-dup}
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-ret.md#SCN-RETR-12a-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-12b-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-12c-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-12d-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-12e-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-12f-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-12g-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-12h-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-12i-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-12j-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-12k-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-12l-1 # ptr+digest
  deps: [ ] parallel_group: [P]
  exit_predicate: all acceptance goldens green ∧ all gates pass
  context_refs: # closed list
- source: ../../roadmap/roadmap.md#epic-20
- source: ../surface-map.md#ret
  owner: unassigned@dispatch # value
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-RETR-12

---

## EPIC-21 — poke: debounced scope-change navigation

### WP-6.21.RETR — RETR slice of EPIC-21

epic: EPIC-21
id: WP-6.21.RETR
content_hash: <filled-at-freeze>
title: poke — tool-call-hook navigation, N=2 debounce, once-per-scope, current-scope node-tools retracted on leave
intent: >
The poke sources from the harness tool-call hook (push tier of TOOLS-11): a single-file Edit/Read/Write is a navigation signal, multi-file Grep/Glob and Bash path-args are suppressed; a settled scope-entry fires one unasked poke after an N=2 debounce, transient crossings never poke, at most once per scope per session; only current-scope nodes are exposed as MCP tools and retract on leave, never the whole graph. (non-authoritative)
source_reqs: # ptr+digest

- source: ../req-ret.md#REQ-RETR-4a # ptr+digest
- source: ../req-ret.md#REQ-RETR-4b # ptr+digest
- source: ../req-ret.md#REQ-RETR-4c # ptr+digest
- source: ../req-ret.md#REQ-RETR-4d # ptr+digest
- source: ../req-ret.md#REQ-RETR-4e # ptr+digest
- source: ../req-ret.md#REQ-RETR-4f # ptr+digest
- source: ../req-ret.md#REQ-RETR-4g # ptr+digest
- source: ../req-ret.md#REQ-RETR-4h # ptr+digest
- source: ../req-ret.md#REQ-RETR-4i # ptr+digest
- source: ../req-ret.md#REQ-RETR-5a # ptr+digest
- source: ../req-ret.md#REQ-RETR-5b # ptr+digest
- source: ../req-ret.md#REQ-RETR-5c # ptr+digest
  seam-freezes: [ "poke event source = TOOLS-11 push tier consumed-from TOOLS (frozen upstream, CAMPAIGN-7)" ]
  anchor: retrieval module · poke debounce automaton + node-tool projection/retraction (oracle = the RETR-4 reference model per goldens-ret.md)
  interface_contract: # ptr+digest
- source: ../../reference/atlas-retrieval.md#retr-4 # ptr+digest
- source: ../../reference/atlas-retrieval.md#retr-5 # ptr+digest
- source: ../../reference/atlas-tools.md#tools-11 # ptr+digest
  exclusions: does NOT implement the TOOLS-11 push transport (consumed frozen upstream, CAMPAIGN-7); does NOT project the whole graph; does NOT assemble the injected pack (RETR-2, EPIC-19) — only triggers its injection on a settled poke.
  inputs: # ptr+digest
- source: ../../reference/atlas-retrieval.md#retr-4 # ptr+digest
- source: ../../reference/atlas-retrieval.md#retr-5 # ptr+digest
  action: implement RETR-4 debounced poke automaton + RETR-5 current-scope node-tool projection/retraction against the referenced goldens; source events from the TOOLS-11 push tier, do not reimplement it.
  action_surface: [ read-atlas-index, subscribe-toolcall-hook, run-goldens ]
  guardrails: edit only the retrieval poke/tool-projection surface; only single-file navigation drives scope-change; N=2 debounce before poke; at most once per scope per session; retract node-tools on leave.
  repair_budget: N=3 · early-stop on {repeated-failure, no-change, semantic-dup}
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-ret.md#SCN-RETR-4a-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-4b-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-4c-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-4d-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-4e-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-4f-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-4g-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-4h-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-4i-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-5a-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-5b-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-5c-1 # ptr+digest
  deps: [ ] parallel_group: [P]
  exit_predicate: all acceptance goldens green ∧ all gates pass
  context_refs: # closed list
- source: ../../roadmap/roadmap.md#epic-21
- source: ../surface-map.md#ret
  owner: unassigned@dispatch # value
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-RETR-4

---

## EPIC-22 — injection ceiling & drop-by-hit-rate

### WP-6.22.RETR — RETR slice of EPIC-22

epic: EPIC-22
id: WP-6.22.RETR
content_hash: <filled-at-freeze>
title: injection ceiling per turn + drop-by-hit-rate (two pins spared) + cold-start order + stale pack not trusted
intent: >
The sum of everything auto-injected per turn respects a ~5K ceiling; on overflow droppable kinds drop by observed per-kind hit-rate (least-used first); Awareness.constitution(T0) and protocols.safetyCritical never drop; a cold-start default order applies until the ledger has data, then it reorders by hit-rate; a per-kind drop-counter is ledgered; a stale:true pack is not trusted and re-grounded (stale == a backing drifted). (non-authoritative)
source_reqs: # ptr+digest

- source: ../req-ret.md#REQ-RETR-6a # ptr+digest
- source: ../req-ret.md#REQ-RETR-6b # ptr+digest
- source: ../req-ret.md#REQ-RETR-6c # ptr+digest
- source: ../req-ret.md#REQ-RETR-6d # ptr+digest
- source: ../req-ret.md#REQ-RETR-6e # ptr+digest
- source: ../req-ret.md#REQ-RETR-6f # ptr+digest
- source: ../req-ret.md#REQ-RETR-3a # ptr+digest
- source: ../req-ret.md#REQ-RETR-3b # ptr+digest
- source: ../req-ret.md#REQ-RETR-3c # ptr+digest
  seam-freezes: [ "injection-budget + fresh-pack contract (RETR-6 ceiling/drop + RETR-3 stale) owned-by RETR, consumed-by TOOLS" ]
  anchor: retrieval module · turn injection-budget enforcer + drop-by-hit-rate + stale/re-ground (oracle = retrieval/ref/drop.ts per goldens-ret.md; caps under cl100k_base pinned measure)
  interface_contract: # ptr+digest
- source: ../../reference/atlas-retrieval.md#retr-6 # ptr+digest
- source: ../../reference/atlas-retrieval.md#retr-3 # ptr+digest
- source: ../../reference/atlas-retrieval.md#retr-8 # ptr+digest
  exclusions: does NOT own the phase-transition auto-inject trigger (TOOLS-14, consumer); the per-kind hitRate ledger itself is RETR-8 (WP-6.18.RETR, same module) — this WP consumes it for drop order; the two pins never drop.
  inputs: # ptr+digest
- source: ../../reference/atlas-retrieval.md#retr-6 # ptr+digest
- source: ../../reference/atlas-retrieval.md#retr-3 # ptr+digest
  action: implement RETR-6 ceiling + hit-rate drop order + cold-start + drop-counter and RETR-3 stale/re-ground against the referenced goldens under the pinned measure.
  action_surface: [ read-atlas-index, read-ledger, tokenize-cl100k, run-goldens ]
  guardrails: edit only the retrieval injection-budget/stale surface; never drop the two pins; cold-start order until ledger has data; stale == any backing drifted (never a guess).
  repair_budget: N=3 · early-stop on {repeated-failure, no-change, semantic-dup}
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-ret.md#SCN-RETR-6a-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-6b-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-6b-2 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-6c-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-6d-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-6e-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-6f-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-3a-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-3b-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-3c-1 # ptr+digest
  deps: [ WP-6.18.RETR ] parallel_group: —
  exit_predicate: all acceptance goldens green ∧ all gates pass
  context_refs: # closed list
- source: ../../roadmap/roadmap.md#epic-22
- source: ../surface-map.md#ret
  owner: unassigned@dispatch # value
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-RETR-6

### WP-6.22.TOOLS — TOOLS slice of EPIC-22

epic: EPIC-22
id: WP-6.22.TOOLS
content*hash: <filled-at-freeze>
title: phase-transition auto-inject of a fresh pack, no grant, mid-task pull not load-bearing
intent: >
At every phase transition the orchestrator auto-injects a fresh atlas-query/own*<unit> pack into the seat's context; the push holds with no tool grant; mid-task PULL is an optimization only, never load-bearing. (non-authoritative)
source_reqs: # ptr+digest

- source: ../req-tls.md#REQ-TOOLS-14a # ptr+digest
- source: ../req-tls.md#REQ-TOOLS-14b # ptr+digest
- source: ../req-tls.md#REQ-TOOLS-14c # ptr+digest
  seam-freezes: [ "injection-budget + fresh-pack contract (RETR-6/RETR-3) consumed-from RETR (frozen upstream)" ]
  anchor: tools/orchestrator module · phase-transition auto-inject hook
  interface_contract: # ptr+digest
- source: ../../reference/atlas-retrieval.md#retr-6 # ptr+digest
- source: ../../reference/atlas-tools.md#tools-14 # ptr+digest
  exclusions: does NOT define the injection ceiling/drop order or stale/re-ground (RETR-6/RETR-3, consumed); only triggers a fresh-pack push at phase transition and keeps mid-task pull non-load-bearing.
  inputs: # ptr+digest
- source: ../../reference/atlas-tools.md#tools-14 # ptr+digest
- source: ../../reference/atlas-retrieval.md#retr-6 # ptr+digest
  action: implement the TOOLS-14 phase-transition auto-inject (push, no grant) + non-load-bearing mid-task pull against the referenced goldens; consume the RETR fresh-pack contract.
  action_surface: [ orchestrator-phase-hook, call-retr-injector, run-goldens ]
  guardrails: edit only the phase-transition push surface; push needs no tool grant; mid-task pull must not be load-bearing.
  repair_budget: N=3 · early-stop on {repeated-failure, no-change, semantic-dup}
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-tls.md#SCN-TOOLS-14a-1 # ptr+digest
- source: ../goldens-tls.md#SCN-TOOLS-14b-1 # ptr+digest
- source: ../goldens-tls.md#SCN-TOOLS-14c-1 # ptr+digest
  deps: [ WP-6.22.RETR ] parallel_group: —
  exit_predicate: all acceptance goldens green ∧ all gates pass
  context_refs: # closed list
- source: ../../roadmap/roadmap.md#epic-22
- source: ../surface-map.md#tls
  owner: unassigned@dispatch # value
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-TOOLS-14

---

## EPIC-23 — Knowledge≠Memory boundary & injection-scoping

### WP-6.23.MEM — MEM slice of EPIC-23

epic: EPIC-23
id: WP-6.23.MEM
content_hash: <filled-at-freeze>
title: inject only own Memory · scoping-not-access-control · no Memory↔Knowledge crossover · consultable only via explicit recall
intent: >
A member's turn-header injects only its own Memory; Memory is git-native so scoping is not access control; a Memory entry is never stored as shared Knowledge and a Knowledge fact never as Memory; task/pr/logbook never auto-inject on a running turn and return only via explicit memory-recall. (non-authoritative)
source_reqs: # ptr+digest

- source: ../req-mem.md#REQ-MEM-1a # ptr+digest
- source: ../req-mem.md#REQ-MEM-1b # ptr+digest
- source: ../req-mem.md#REQ-MEM-2a # ptr+digest
- source: ../req-mem.md#REQ-MEM-2b # ptr+digest
- source: ../req-mem.md#REQ-MEM-4a # ptr+digest
- source: ../req-mem.md#REQ-MEM-4b # ptr+digest
  seam-freezes: [ ]
  anchor: memory module · turn-header injection scoping + Memory/Knowledge boundary gate + consultable recall path
  interface_contract: # ptr+digest
- source: ../../reference/atlas-memory.md#mem-1 # ptr+digest
- source: ../../reference/atlas-memory.md#mem-2 # ptr+digest
- source: ../../reference/atlas-memory.md#mem-4 # ptr+digest
  exclusions: does NOT implement Knowledge write-decision (KNOW, CAMPAIGN-5); does NOT access-control bytes (scoping only); consultable types never auto-inject.
  inputs: # ptr+digest
- source: ../../reference/atlas-memory.md#mem-1 # ptr+digest
- source: ../../reference/atlas-memory.md#mem-2 # ptr+digest
- source: ../../reference/atlas-memory.md#mem-4 # ptr+digest
  action: implement MEM-1/2/4 own-only injection scoping + boundary rejection + explicit-recall gating against the referenced goldens.
  action_surface: [ read-atlas-index, read-memory-store, run-goldens ]
  guardrails: edit only the memory injection/boundary surface; reject Memory-as-Knowledge and Knowledge-as-Memory writes; no auto-inject of task/pr/logbook on a running turn.
  repair_budget: N=3 · early-stop on {repeated-failure, no-change, semantic-dup}
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-mem.md#SCN-MEM-1a-1 # ptr+digest
- source: ../goldens-mem.md#SCN-MEM-1b-1 # ptr+digest
- source: ../goldens-mem.md#SCN-MEM-2a-1 # ptr+digest
- source: ../goldens-mem.md#SCN-MEM-2b-1 # ptr+digest
- source: ../goldens-mem.md#SCN-MEM-4a-1 # ptr+digest
- source: ../goldens-mem.md#SCN-MEM-4b-1 # ptr+digest
  deps: [ ] parallel_group: [P]
  exit_predicate: all acceptance goldens green ∧ all gates pass
  context_refs: # closed list
- source: ../../roadmap/roadmap.md#epic-23
- source: ../surface-map.md#mem
  owner: unassigned@dispatch # value
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-MEM-1

---

## EPIC-24-a — Awareness slab (derived, memoized)

### WP-6.24-a.MEM — MEM slice of EPIC-24-a

epic: EPIC-24-a
id: WP-6.24-a.MEM
content_hash: <filled-at-freeze>
title: Awareness slab — assembled from Atlas root, per-facet grounded/drift-checked, capped, UN-SEEDED sentinel, byte-identical, facet-cached, assembled once per root-state
intent: >
The injected Awareness (mission/constitution/terrain/ontology/taste) is assembled from the Atlas root, each facet grounded (node@sha) and drift-checked, top-tier only under ~400 tok, ontology from walt's slot='definition' nodes; an absent source renders a labeled UN-SEEDED sentinel, never hand-written, byte-identical across members, tail pull-reachable, no generic-card substitute; each facet is cached on its own source subtree hash and the slab is assembled once per root-state and shared. (non-authoritative)
source_reqs: # ptr+digest

- source: ../req-mem.md#REQ-MEM-11a # ptr+digest
- source: ../req-mem.md#REQ-MEM-11b # ptr+digest
- source: ../req-mem.md#REQ-MEM-11c # ptr+digest
- source: ../req-mem.md#REQ-MEM-11d # ptr+digest
- source: ../req-mem.md#REQ-MEM-11e # ptr+digest
- source: ../req-mem.md#REQ-MEM-11f # ptr+digest
- source: ../req-mem.md#REQ-MEM-11g # ptr+digest
- source: ../req-mem.md#REQ-MEM-11h # ptr+digest
- source: ../req-mem.md#REQ-MEM-11i # ptr+digest
- source: ../req-mem.md#REQ-MEM-12a # ptr+digest
- source: ../req-mem.md#REQ-MEM-12b # ptr+digest
  seam-freezes: [ ]
  anchor: memory module · Awareness slab assembler + per-facet cache keyed on source subtree hash
  interface_contract: # ptr+digest
- source: ../../reference/atlas-memory.md#mem-11 # ptr+digest
- source: ../../reference/atlas-memory.md#mem-12 # ptr+digest
  exclusions: does NOT author facet content (assembled from the Atlas root only); does NOT fabricate an absent facet (UN-SEEDED sentinel); ontology producer (walt/DEFINE) and Awareness-source creation (GEN-9) are upstream/out-of-scope here — only consumed.
  inputs: # ptr+digest
- source: ../../reference/atlas-memory.md#mem-11 # ptr+digest
- source: ../../reference/atlas-memory.md#mem-12 # ptr+digest
  action: implement MEM-11 Awareness assembly (grounded/capped/UN-SEEDED/byte-identical) + MEM-12a/b facet-cache + once-per-root-state against the referenced goldens.
  action_surface: [ read-atlas-index, read-cas, run-goldens ]
  guardrails: edit only the Awareness slab surface; every facet grounded@sha + drift-checked; absent source ⇒ UN-SEEDED, never fabricated; byte-identical across members; never hand-written.
  repair_budget: N=3 · early-stop on {repeated-failure, no-change, semantic-dup}
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-mem.md#SCN-MEM-11a-1 # ptr+digest
- source: ../goldens-mem.md#SCN-MEM-11b-1 # ptr+digest
- source: ../goldens-mem.md#SCN-MEM-11c-1 # ptr+digest
- source: ../goldens-mem.md#SCN-MEM-11d-1 # ptr+digest
- source: ../goldens-mem.md#SCN-MEM-11e-1 # ptr+digest
- source: ../goldens-mem.md#SCN-MEM-11f-1 # ptr+digest
- source: ../goldens-mem.md#SCN-MEM-11g-1 # ptr+digest
- source: ../goldens-mem.md#SCN-MEM-11h-1 # ptr+digest
- source: ../goldens-mem.md#SCN-MEM-11i-1 # ptr+digest
- source: ../goldens-mem.md#SCN-MEM-12a-1 # ptr+digest
- source: ../goldens-mem.md#SCN-MEM-12b-1 # ptr+digest
  deps: [ ] parallel_group: [P]
  exit_predicate: all acceptance goldens green ∧ all gates pass
  context_refs: # closed list
- source: ../../roadmap/roadmap.md#epic-24-a
- source: ../surface-map.md#mem
  owner: unassigned@dispatch # value
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-MEM-11

---

## EPIC-24-b — Orientation slab (incremental fold)

### WP-6.24-b.MEM — MEM slice of EPIC-24-b

epic: EPIC-24-b
id: WP-6.24-b.MEM
content_hash: <filled-at-freeze>
title: Orientation slab — goal from DEFINE, state as event-log fold, byte-identical, capped, never-written, incremental fold
intent: >
Orientation's goal is assembled from the ratified DEFINE artifact and its last/current/state as a fold over the event log; it is injected byte-identically across members, within ~250 tok, never a per-member written entry, and computed as an incremental fold over entries appended since the last header (never a full replay). (non-authoritative)
source_reqs: # ptr+digest

- source: ../req-mem.md#REQ-MEM-6a # ptr+digest
- source: ../req-mem.md#REQ-MEM-6b # ptr+digest
- source: ../req-mem.md#REQ-MEM-6c # ptr+digest
- source: ../req-mem.md#REQ-MEM-6d # ptr+digest
- source: ../req-mem.md#REQ-MEM-6e # ptr+digest
- source: ../req-mem.md#REQ-MEM-12c # ptr+digest
  seam-freezes: [ ]
  anchor: memory module · Orientation incremental-fold assembler over DEFINE + event log
  interface_contract: # ptr+digest
- source: ../../reference/atlas-memory.md#mem-6 # ptr+digest
- source: ../../reference/atlas-memory.md#mem-12 # ptr+digest
  exclusions: does NOT write a per-member Orientation entry (derived only); does NOT author the DEFINE artifact (ratified upstream, consumed); no full replay per turn.
  inputs: # ptr+digest
- source: ../../reference/atlas-memory.md#mem-6 # ptr+digest
- source: ../../reference/atlas-memory.md#mem-12 # ptr+digest
  action: implement MEM-6 Orientation assembly (goal from DEFINE, state as event-log fold, byte-identical, capped, never-written) + MEM-12c incremental fold against the referenced goldens.
  action_surface: [ read-atlas-index, read-event-log, run-goldens ]
  guardrails: edit only the Orientation slab surface; byte-identical across members; ≤~250 tok; never a written entry; incremental fold, never a full replay.
  repair_budget: N=3 · early-stop on {repeated-failure, no-change, semantic-dup}
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-mem.md#SCN-MEM-6a-1 # ptr+digest
- source: ../goldens-mem.md#SCN-MEM-6b-1 # ptr+digest
- source: ../goldens-mem.md#SCN-MEM-6c-1 # ptr+digest
- source: ../goldens-mem.md#SCN-MEM-6d-1 # ptr+digest
- source: ../goldens-mem.md#SCN-MEM-6e-1 # ptr+digest
- source: ../goldens-mem.md#SCN-MEM-12c-1 # ptr+digest
  deps: [ ] parallel_group: [P]
  exit_predicate: all acceptance goldens green ∧ all gates pass
  context_refs: # closed list
- source: ../../roadmap/roadmap.md#epic-24-b
- source: ../surface-map.md#mem
  owner: unassigned@dispatch # value
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-MEM-6

---

## EPIC-25-a — project Rules-slab by frecency

### WP-6.25-a.MEM — MEM slice of EPIC-25-a

epic: EPIC-25-a
id: WP-6.25-a.MEM
content_hash: <filled-at-freeze>
title: project Rules-slab — capped, over-cap write rejected, hit only on cited rule-id, top-12 by frecency, evict-at-near-zero, retained/re-spawnable, never deleted
intent: >
Injected project memory is capped (over-cap write rejected, never a silent overflow); a rule's hit increments only on an explicit cited rule-id governing a decision; the injected set is the top-12 by frecency (a single time-decayed hit score), evicting to the archive at near-zero frecency so no old-popular rule pins a slot; evicted entries are retained/versioned/re-spawnable and memory is never deleted. (non-authoritative)
source_reqs: # ptr+digest

- source: ../req-mem.md#REQ-MEM-3a # ptr+digest
- source: ../req-mem.md#REQ-MEM-3b # ptr+digest
- source: ../req-mem.md#REQ-MEM-7a # ptr+digest
- source: ../req-mem.md#REQ-MEM-7b # ptr+digest
- source: ../req-mem.md#REQ-MEM-7c # ptr+digest
- source: ../req-mem.md#REQ-MEM-7d # ptr+digest
- source: ../req-mem.md#REQ-MEM-7e # ptr+digest
- source: ../req-mem.md#REQ-MEM-7f # ptr+digest
  seam-freezes: [ ]
  anchor: memory module · project Rules-slab frecency ranker + eviction/archive path
  interface_contract: # ptr+digest
- source: ../../reference/atlas-memory.md#mem-3 # ptr+digest
- source: ../../reference/atlas-memory.md#mem-7 # ptr+digest
  exclusions: does NOT delete any memory (evict-to-archive only); hit increments only on an explicitly cited rule-id; over-cap write rejected, never truncated silently.
  inputs: # ptr+digest
- source: ../../reference/atlas-memory.md#mem-3 # ptr+digest
- source: ../../reference/atlas-memory.md#mem-7 # ptr+digest
  action: implement MEM-3 cap/reject + MEM-7 cited-hit counting, top-12 frecency, near-zero eviction, retained/re-spawnable against the referenced goldens.
  action_surface: [ read-atlas-index, read-memory-store, write-archive, run-goldens ]
  guardrails: edit only the project Rules-slab surface; over-cap write rejected fail-closed; evict at near-zero frecency to archive; never delete a memory.
  repair_budget: N=3 · early-stop on {repeated-failure, no-change, semantic-dup}
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-mem.md#SCN-MEM-3a-1 # ptr+digest
- source: ../goldens-mem.md#SCN-MEM-3b-1 # ptr+digest
- source: ../goldens-mem.md#SCN-MEM-7a-1 # ptr+digest
- source: ../goldens-mem.md#SCN-MEM-7b-1 # ptr+digest
- source: ../goldens-mem.md#SCN-MEM-7c-1 # ptr+digest
- source: ../goldens-mem.md#SCN-MEM-7d-1 # ptr+digest
- source: ../goldens-mem.md#SCN-MEM-7e-1 # ptr+digest
- source: ../goldens-mem.md#SCN-MEM-7f-1 # ptr+digest
  deps: [ ] parallel_group: [P]
  exit_predicate: all acceptance goldens green ∧ all gates pass
  context_refs: # closed list
- source: ../../roadmap/roadmap.md#epic-25-a
- source: ../surface-map.md#mem
  owner: unassigned@dispatch # value
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-MEM-7

---

## EPIC-25-b — logbook: templated, capped, consultable

### WP-6.25-b.MEM — MEM slice of EPIC-25-b

epic: EPIC-25-b
id: WP-6.25-b.MEM
content_hash: <filled-at-freeze>
title: logbook — untemplated write rejected, prose bounded to sections, orchestrator-only, one append-only entry per PR, capped sections, consultable never injected, supersede by link
intent: >
An untemplated memory write is rejected fail-closed and logbook prose is bounded within its fixed sections; the logbook is orchestrator-only, one append-only entry per PR filling capped fixed sections, consultable (by prId/date/territory) and never injected, and a correction supersedes a past decision by link rather than rewriting history. (non-authoritative)
source_reqs: # ptr+digest

- source: ../req-mem.md#REQ-MEM-5a # ptr+digest
- source: ../req-mem.md#REQ-MEM-5b # ptr+digest
- source: ../req-mem.md#REQ-MEM-8a # ptr+digest
- source: ../req-mem.md#REQ-MEM-8b # ptr+digest
- source: ../req-mem.md#REQ-MEM-8c # ptr+digest
- source: ../req-mem.md#REQ-MEM-8d # ptr+digest
- source: ../req-mem.md#REQ-MEM-8e # ptr+digest
  seam-freezes: [ ]
  anchor: memory module · logbook templated-write gate + per-PR append-only entry + consultable recall
  interface_contract: # ptr+digest
- source: ../../reference/atlas-memory.md#mem-5 # ptr+digest
- source: ../../reference/atlas-memory.md#mem-8 # ptr+digest
  exclusions: does NOT auto-inject the logbook (consultable only — MEM-4 boundary lives in EPIC-23); does NOT rewrite history (supersede-by-link); non-orchestrator writes rejected.
  inputs: # ptr+digest
- source: ../../reference/atlas-memory.md#mem-5 # ptr+digest
- source: ../../reference/atlas-memory.md#mem-8 # ptr+digest
  action: implement MEM-5 templated-write gate + MEM-8 orchestrator-only per-PR append-only capped logbook + supersede-by-link against the referenced goldens.
  action_surface: [ read-atlas-index, write-memory-store, run-goldens ]
  guardrails: edit only the logbook surface; untemplated write rejected fail-closed; orchestrator-only; one append-only entry per PR within per-section caps; consultable, never injected; supersede by link.
  repair_budget: N=3 · early-stop on {repeated-failure, no-change, semantic-dup}
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-mem.md#SCN-MEM-5a-1 # ptr+digest
- source: ../goldens-mem.md#SCN-MEM-5b-1 # ptr+digest
- source: ../goldens-mem.md#SCN-MEM-8a-1 # ptr+digest
- source: ../goldens-mem.md#SCN-MEM-8b-1 # ptr+digest
- source: ../goldens-mem.md#SCN-MEM-8c-1 # ptr+digest
- source: ../goldens-mem.md#SCN-MEM-8d-1 # ptr+digest
- source: ../goldens-mem.md#SCN-MEM-8e-1 # ptr+digest
  deps: [ ] parallel_group: [P]
  exit_predicate: all acceptance goldens green ∧ all gates pass
  context_refs: # closed list
- source: ../../roadmap/roadmap.md#epic-25-b
- source: ../surface-map.md#mem
  owner: unassigned@dispatch # value
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-MEM-8
