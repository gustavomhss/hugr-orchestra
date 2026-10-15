# Work Packages — CAMPAIGN-2 (state S4)

> The structural-index substrate. One WP-card per (epic × module), conforming to
> [`method/wp-template.md`](../../method/wp-template.md). Every substantive field is a `ptr+digest`
> (the digest is tooling-filled at freeze — the `# ptr+digest` marker flags it). `intent` is the one
> prose carve-out (non-authoritative, executor-invisible). `exec` fields (`outputs`/`provenance`/`trace_ref`)
> are present-but-empty at S4-freeze. Modules in this campaign: `index`, `retrieval`.
>
> Seam-freezes in this campaign: **1** — EPIC-8-b: the relate-axes contract, owned-by INDEX, consumed-by RETR.
> REQ→WP partition: 66 REQs → 9 WPs, exactly-one owner (self-check below).

---

## EPIC-6 — mechanical structural index build

### WP-2.6.INDEX — index slice of EPIC-6

epic: EPIC-6
id: WP-2.6.INDEX
content_hash: <filled-at-freeze>
title: mechanical SCIP-derived structural index build (model-free, byte-identical rebuild)
intent: >
Build the one content-addressed structural index mechanically from the real file tree / import graph
via a per-language SCIP indexer, $0-LLM and model-free on the build path; rebuilding twice with the
same indexer is byte-identical; unresolvable / cross-language edges are declared, not guessed.
source_reqs: # ptr+digest

- source: ../req-idx.md#REQ-INDEX-3a # ptr+digest
- source: ../req-idx.md#REQ-INDEX-3b # ptr+digest
- source: ../req-idx.md#REQ-INDEX-3c # ptr+digest
- source: ../req-idx.md#REQ-INDEX-3d # ptr+digest
- source: ../req-idx.md#REQ-INDEX-3e # ptr+digest
  seam-freezes: [ ]
  anchor: index/ (build facet — single content-addressed index over the SCIP-derived axes)
  interface_contract: # ptr+digest
- source: ../../reference/atlas-index.md#index-3 # ptr+digest
- source: index/ref/build.ts # ptr+digest
- source: index/ref/depgraph.ts # ptr+digest
  exclusions: >
  No rollup/re-hash fold (EPIC-7-a), no drift dirty-bit/rState (EPIC-7-b), no resolve/modes (EPIC-8-a),
  no relate/closure (EPIC-8-b), no territory/ownership (EPIC-9-a), no coverage gate (EPIC-9-b);
  NOT REQ-INDEX-11a/11b (CAS-grounding — CAMPAIGN-4). No embeddings/vector/ANN. No model in the build path.
  inputs: [ ]
  action: implement index/ref/build.ts to satisfy the frozen goldens; run the block conformance + determinism suite
  action_surface: [ Read, Edit, Write, Bash(index-test-runner + fmt/clippy only) ]
  guardrails: edits confined to index/\*\*; no writes outside the module; no new runtime deps; goldens/reqs read-only; no LLM/embedding call site
  repair_budget: N=3 · early-stop on {repeated-identical-failure, no-change-diff, semantic-dup}
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-idx.md#SCN-INDEX-3a-1 # ptr+digest
- source: ../goldens-idx.md#SCN-INDEX-3b-1 # ptr+digest
- source: ../goldens-idx.md#SCN-INDEX-3c-1 # ptr+digest
- source: ../goldens-idx.md#SCN-INDEX-3d-1 # ptr+digest
- source: ../goldens-idx.md#SCN-INDEX-3e-1 # ptr+digest
  deps: [ ] parallel_group: [P]
  exit_predicate: all acceptance SCN green ∧ block gates (fmt/clippy + byte-identical rebuild gate via SCN-INDEX-3d-1) pass
  context_refs: # closed list
- source: ../req-idx.md
- source: ../goldens-idx.md
- source: ../../reference/atlas-index.md
  owner: # value — techlead dispatch (FORGE seat)
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-INDEX-3

### WP-2.6-b.INDEX — composed-index slice of EPIC-6

epic: EPIC-6
id: WP-2.6-b.INDEX
content_hash: <filled-at-freeze>
title: composed-index facet — one index over N axes backs both drift + discovery, 0 separate passes
intent: >
Compose the single content-addressed index from the built axes (EPIC-6) and the resolve surface
(EPIC-8-a) so that one index, exposing N axes, serves both jobs — drift and discovery — with no
separate discovery structure and no separate staleness sweep.
source_reqs: # ptr+digest

- source: ../req-idx.md#REQ-INDEX-1a # ptr+digest
- source: ../req-idx.md#REQ-INDEX-1b # ptr+digest
  seam-freezes: [ ]
  anchor: index/ (composition facet — one index, N axes, two jobs; composes build + resolve)
  interface_contract: # ptr+digest
- source: index/ref/index.ts # ptr+digest
  exclusions: >
  Composition facet ONLY — the mechanical build is EPIC-6 (WP-2.6.INDEX), resolve/modes is EPIC-8-a
  (WP-2.8-a.INDEX); this card only composes them into the one index. No rollup fold, drift, relate,
  territory, or coverage; does not rebuild the axes nor add a resolve mode.
  inputs: [ ]
  action: implement the composition in packages/index/src/index.ts (compose build + resolve into one index) to satisfy the frozen goldens; run the block conformance suite
  action_surface: [ Read, Edit, Write, Bash(index-test-runner + fmt/clippy only) ]
  guardrails: edit only packages/index/src/index.ts (composition); no writes outside the module; no new runtime deps; goldens/reqs read-only; no LLM/embedding call site
  repair_budget: N=3 · early-stop on {repeated-identical-failure, no-change-diff, semantic-dup}
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-idx.md#SCN-INDEX-1a-1 # ptr+digest
- source: ../goldens-idx.md#SCN-INDEX-1b-1 # ptr+digest
  deps: [ WP-2.6.INDEX, WP-2.8-a.INDEX ] parallel_group: [ ]
  exit_predicate: all acceptance SCN green ∧ block gates (fmt/clippy + one-index/no-separate-pass assertion) pass
  context_refs: # closed list
- source: ../req-idx.md
- source: ../goldens-idx.md
- source: ../../reference/atlas-index.md
  owner: # value — techlead dispatch (FORGE seat)
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-INDEX-1

---

## EPIC-7-a — incremental rollup re-hash leaf→root

### WP-2.7-a.INDEX — index slice of EPIC-7-a

epic: EPIC-7-a
id: WP-2.7-a.INDEX
content_hash: <filled-at-freeze>
title: structural-fold facet — BLAKE3 rollup of children, edit re-hashes leaf→root only
intent: >
Rollup is BLAKE3 of a node's children; an edit re-hashes only the touched leaf→root path on the
affected axis, unaffected subtrees keep their id; each node carries rId (structure) + rState, a Delta
names the changed buckets, and the dependency-fold eager re-hash stays bounded (never O(blast-radius)).
source_reqs: # ptr+digest

- source: ../req-idx.md#REQ-INDEX-2a # ptr+digest
- source: ../req-idx.md#REQ-INDEX-2b # ptr+digest
- source: ../req-idx.md#REQ-INDEX-2c # ptr+digest
- source: ../req-idx.md#REQ-INDEX-12a # ptr+digest
- source: ../req-idx.md#REQ-INDEX-12b # ptr+digest
- source: ../req-idx.md#REQ-INDEX-12c # ptr+digest
- source: ../req-idx.md#REQ-INDEX-12d # ptr+digest
- source: ../req-idx.md#REQ-INDEX-12e # ptr+digest
- source: ../req-idx.md#REQ-INDEX-12f # ptr+digest
  seam-freezes: [ ]
  anchor: index/ (rollup/structural-fold facet — rId re-hash leaf→root; Delta over changed buckets)
  interface_contract: # ptr+digest
- source: ../../reference/atlas-index.md#index-2 # ptr+digest
- source: ../../reference/atlas-index.md#index-12 # ptr+digest
- source: index/ref/rollup.ts # ptr+digest
- source: index/ref/fold.ts # ptr+digest
  exclusions: >
  Structure-rehash facet ONLY — no drift dirty-bit / rState lazy / maxHops (EPIC-7-b: 12g–12k).
  No resolve, relate, territory, or coverage. Consumes the built index (EPIC-6), does not rebuild it.
  inputs: [ ]
  action: implement index/ref/rollup.ts + fold.ts (structure arm) to satisfy the frozen goldens; run the fold conformance/PBT suite
  action_surface: [ Read, Edit, Write, Bash(index-test-runner + fmt/clippy only) ]
  guardrails: edits confined to index/\*\*; no writes outside the module; no new runtime deps; goldens/reqs read-only
  repair_budget: N=3 · early-stop on {repeated-identical-failure, no-change-diff, semantic-dup}
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-idx.md#SCN-INDEX-2a-1 # ptr+digest
- source: ../goldens-idx.md#SCN-INDEX-2b-1 # ptr+digest
- source: ../goldens-idx.md#SCN-INDEX-2c-1 # ptr+digest
- source: ../goldens-idx.md#SCN-INDEX-12a-1 # ptr+digest
- source: ../goldens-idx.md#SCN-INDEX-12b-1 # ptr+digest
- source: ../goldens-idx.md#SCN-INDEX-12c-1 # ptr+digest
- source: ../goldens-idx.md#SCN-INDEX-12d-1 # ptr+digest
- source: ../goldens-idx.md#SCN-INDEX-12e-1 # ptr+digest
- source: ../goldens-idx.md#SCN-INDEX-12f-1 # ptr+digest
  deps: [ WP-2.6.INDEX ] parallel_group: [P]
  exit_predicate: all acceptance SCN green ∧ block gates (fmt/clippy + bounded-rehash assertion) pass
  context_refs: # closed list
- source: ../req-idx.md
- source: ../goldens-idx.md
- source: ../../reference/atlas-index.md
  owner: # value — techlead dispatch (FORGE seat)
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-INDEX-2
- source: ../invariant-register.md#INV-INDEX-12

---

## EPIC-7-b — drift dirty-bit propagation & stale gate

### WP-2.7-b.INDEX — index slice of EPIC-7-b

epic: EPIC-7-b
id: WP-2.7-b.INDEX
content_hash: <filled-at-freeze>
title: drift-state facet — eager dirty-bit on reverse closure, lazy rState, maxHops=2 cap
intent: >
A stale entry (anchor hash ≠ current) is visible + excluded/flagged at query time with no re-embedding
and no separate sweep; an edit propagates a drift dirty-bit eagerly across the reverse closure, the
rState hash resolves lazily on-read, the eager re-hash is capped at maxHops=2, and any deeper node is
marked state-suspect, resolved only when queried.
source_reqs: # ptr+digest

- source: ../req-idx.md#REQ-INDEX-5a # ptr+digest
- source: ../req-idx.md#REQ-INDEX-5b # ptr+digest
- source: ../req-idx.md#REQ-INDEX-5c # ptr+digest
- source: ../req-idx.md#REQ-INDEX-12g # ptr+digest
- source: ../req-idx.md#REQ-INDEX-12h # ptr+digest
- source: ../req-idx.md#REQ-INDEX-12i # ptr+digest
- source: ../req-idx.md#REQ-INDEX-12j # ptr+digest
- source: ../req-idx.md#REQ-INDEX-12k # ptr+digest
  seam-freezes: [ ]
  anchor: index/ (drift-state facet — dirty-bit eager reverse-closure; rState lazy on-read; maxHops=2)
  interface_contract: # ptr+digest
- source: ../../reference/atlas-index.md#index-5 # ptr+digest
- source: ../../reference/atlas-index.md#index-12 # ptr+digest
- source: index/ref/fold.ts # ptr+digest
  exclusions: >
  Drift-state facet ONLY — no structure rId re-hash / Delta bucket-naming (EPIC-7-a: 2a–2c, 12a–12f).
  No re-embedding, no separate staleness sweep. Consumes the fold from EPIC-6/7-a, does not redefine it.
  inputs: [ ]
  action: implement the drift arm of index/ref/fold.ts (dirty-bit + lazy rState + hop cap) to satisfy the frozen goldens; run the drift conformance suite
  action_surface: [ Read, Edit, Write, Bash(index-test-runner + fmt/clippy only) ]
  guardrails: edits confined to index/\*\*; no writes outside the module; no new runtime deps; goldens/reqs read-only
  repair_budget: N=3 · early-stop on {repeated-identical-failure, no-change-diff, semantic-dup}
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-idx.md#SCN-INDEX-5a-1 # ptr+digest
- source: ../goldens-idx.md#SCN-INDEX-5b-1 # ptr+digest
- source: ../goldens-idx.md#SCN-INDEX-5c-1 # ptr+digest
- source: ../goldens-idx.md#SCN-INDEX-12g-1 # ptr+digest
- source: ../goldens-idx.md#SCN-INDEX-12h-1 # ptr+digest
- source: ../goldens-idx.md#SCN-INDEX-12i-1 # ptr+digest
- source: ../goldens-idx.md#SCN-INDEX-12j-1 # ptr+digest
- source: ../goldens-idx.md#SCN-INDEX-12k-1 # ptr+digest
  deps: [ WP-2.6.INDEX ] parallel_group: [P]
  exit_predicate: all acceptance SCN green ∧ block gates (fmt/clippy + maxHops-cap assertion) pass
  context_refs: # closed list
- source: ../req-idx.md
- source: ../goldens-idx.md
- source: ../../reference/atlas-index.md
  owner: # value — techlead dispatch (FORGE seat)
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-INDEX-5
- source: ../invariant-register.md#INV-INDEX-12

---

## EPIC-8-a — resolve a scope to covering nodes

### WP-2.8-a.INDEX — index slice of EPIC-8-a

epic: EPIC-8-a
id: WP-2.8-a.INDEX
content_hash: <filled-at-freeze>
title: resolve/modes facet — covering node, hierarchy roll-up, exactly three modes, ≥3 axes
intent: >
Resolving a path returns the covering node and a file query rolls up its module's + crate's invariants;
relevance is resolved by exactly three modes (scope / dependency / trigger) with no fourth; the index
exposes ≥3 axes (spatial / territory / dependency), cross-indexes one object on all applicable axes,
and never duplicates it.
source_reqs: # ptr+digest

- source: ../req-idx.md#REQ-INDEX-4a # ptr+digest
- source: ../req-idx.md#REQ-INDEX-4b # ptr+digest
- source: ../req-idx.md#REQ-INDEX-6a # ptr+digest
- source: ../req-idx.md#REQ-INDEX-6b # ptr+digest
- source: ../req-idx.md#REQ-INDEX-7a # ptr+digest
- source: ../req-idx.md#REQ-INDEX-8a # ptr+digest
- source: ../req-idx.md#REQ-INDEX-9a # ptr+digest
- source: ../req-idx.md#REQ-INDEX-9b # ptr+digest
- source: ../req-idx.md#REQ-INDEX-10a # ptr+digest
- source: ../req-idx.md#REQ-INDEX-10b # ptr+digest
- source: ../req-idx.md#REQ-INDEX-10c # ptr+digest
  seam-freezes: [ ]
  anchor: index/ (resolve facet — covering-node resolve + three-mode retrieval over ≥3 cross-indexed axes)
  interface_contract: # ptr+digest
- source: ../../reference/atlas-index.md#index-4 # ptr+digest
- source: ../../reference/atlas-index.md#index-6 # ptr+digest
- source: ../../reference/atlas-index.md#index-10 # ptr+digest
- source: index/ref/resolve.ts # ptr+digest
- source: index/ref/retrieval.ts # ptr+digest
  exclusions: >
  Resolve/modes route ONLY — no relate()/blast-radius (EPIC-8-b), no rollup fold, no drift, no territory,
  no coverage. Consumes the axes built in EPIC-6; does not compute the relate closure (that is RETR/8-b).
  inputs: [ ]
  action: implement index/ref/resolve.ts + retrieval.ts (mode dispatch) to satisfy the frozen goldens; run the resolve conformance suite
  action_surface: [ Read, Edit, Write, Bash(index-test-runner + fmt/clippy only) ]
  guardrails: edits confined to index/\*\*; no writes outside the module; no new runtime deps; goldens/reqs read-only
  repair_budget: N=3 · early-stop on {repeated-identical-failure, no-change-diff, semantic-dup}
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-idx.md#SCN-INDEX-4a-1 # ptr+digest
- source: ../goldens-idx.md#SCN-INDEX-4b-1 # ptr+digest
- source: ../goldens-idx.md#SCN-INDEX-6a-1 # ptr+digest
- source: ../goldens-idx.md#SCN-INDEX-6b-1 # ptr+digest
- source: ../goldens-idx.md#SCN-INDEX-7a-1 # ptr+digest
- source: ../goldens-idx.md#SCN-INDEX-8a-1 # ptr+digest
- source: ../goldens-idx.md#SCN-INDEX-9a-1 # ptr+digest
- source: ../goldens-idx.md#SCN-INDEX-9b-1 # ptr+digest
- source: ../goldens-idx.md#SCN-INDEX-10a-1 # ptr+digest
- source: ../goldens-idx.md#SCN-INDEX-10b-1 # ptr+digest
- source: ../goldens-idx.md#SCN-INDEX-10c-1 # ptr+digest
  deps: [ WP-2.6.INDEX ] parallel_group: [P]
  exit_predicate: all acceptance SCN green ∧ block gates (fmt/clippy + three-mode exhaustiveness assertion) pass
  context_refs: # closed list
- source: ../req-idx.md
- source: ../goldens-idx.md
- source: ../../reference/atlas-index.md
  owner: # value — techlead dispatch (FORGE seat)
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-INDEX-4
- source: ../invariant-register.md#INV-INDEX-6
- source: ../invariant-register.md#INV-INDEX-7
- source: ../invariant-register.md#INV-INDEX-8
- source: ../invariant-register.md#INV-INDEX-9
- source: ../invariant-register.md#INV-INDEX-10

---

## EPIC-8-b — relate() the honest blast radius

### WP-2.8-b.INDEX — index slice of EPIC-8-b (seam owner)

epic: EPIC-8-b
id: WP-2.8-b.INDEX
content_hash: <filled-at-freeze>
title: honest-edge facet — record unresolvable edges, under-approximate closure unioning coChanged
intent: >
The depends-on graph records every import/call it cannot statically resolve (incl. every cross-language
boundary) as an explicit unresolved/dynamic edge, never silently omitted nor fabricated; a reverse
closure over a node with unresolved edges is reportable under-approximate and, when so flagged, unions
the node's coChanged band labeled correlational — never presented as complete or static.
source_reqs: # ptr+digest

- source: ../req-idx.md#REQ-INDEX-13a # ptr+digest
- source: ../req-idx.md#REQ-INDEX-13b # ptr+digest
- source: ../req-idx.md#REQ-INDEX-13c # ptr+digest
- source: ../req-idx.md#REQ-INDEX-13d # ptr+digest
- source: ../req-idx.md#REQ-INDEX-13e # ptr+digest
- source: ../req-idx.md#REQ-INDEX-13f # ptr+digest
  seam-freezes: [ "relate-axes contract (three index axes + unresolved/dynamic-edge recording + under-approximate reverse closure unioning coChanged) owned-by INDEX, consumed-by RETR" ]
  anchor: index/ (depends-on graph facet — unresolved-edge recording + under-approximate closure + coChanged union)
  interface_contract: # ptr+digest
- source: ../../reference/atlas-index.md#index-13 # ptr+digest
- source: index/ref/depgraph.ts # ptr+digest
  exclusions: >
  INDEX edge-honesty facet ONLY — does NOT compute relate()'s partitioned/ranked/capped output (that is
  RETR, WP-2.8-b.RETR, the seam consumer). No resolve modes (8-a), no territory (9-a), no coverage (9-b).
  inputs: [ ]
  action: implement the unresolved-edge + under-approximate-closure arm of index/ref/depgraph.ts to satisfy the frozen goldens; run the depgraph conformance suite
  action_surface: [ Read, Edit, Write, Bash(index-test-runner + fmt/clippy only) ]
  guardrails: edits confined to index/\*\*; no writes outside the module; no new runtime deps; goldens/reqs read-only; never fabricate a resolved target
  repair_budget: N=3 · early-stop on {repeated-identical-failure, no-change-diff, semantic-dup}
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-idx.md#SCN-INDEX-13a-1 # ptr+digest
- source: ../goldens-idx.md#SCN-INDEX-13b-1 # ptr+digest
- source: ../goldens-idx.md#SCN-INDEX-13c-1 # ptr+digest
- source: ../goldens-idx.md#SCN-INDEX-13d-1 # ptr+digest
- source: ../goldens-idx.md#SCN-INDEX-13e-1 # ptr+digest
- source: ../goldens-idx.md#SCN-INDEX-13f-1 # ptr+digest
  deps: [ WP-2.6.INDEX ] parallel_group: [P]
  exit_predicate: all acceptance SCN green ∧ block gates (fmt/clippy + no-fabricated-edge assertion) pass
  context_refs: # closed list
- source: ../req-idx.md
- source: ../goldens-idx.md
- source: ../../reference/atlas-index.md
  owner: # value — techlead dispatch (FORGE seat)
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-INDEX-13

### WP-2.8-b.RETR — retrieval slice of EPIC-8-b (seam consumer)

epic: EPIC-8-b
id: WP-2.8-b.RETR
content_hash: <filled-at-freeze>
title: relate/blast-radius facet — partitioned, deterministic relate() ranked+capped from index axes
intent: >
relate(unit) returns the related-node set computed purely from the index's three axes, partitioned by
relation kind, deterministic, no LLM; coChanged is opt-in and labeled, never mixed into structural bands;
dependents (and forward dependencies) are cut at maxHops=2, ranked (tier↓, ppr↓, distance↑, nodeKey↑),
capped at K=8, with honest truncation meta (truncated + total + returned).
source_reqs: # ptr+digest

- source: ../req-ret.md#REQ-RETR-10a # ptr+digest
- source: ../req-ret.md#REQ-RETR-10b # ptr+digest
- source: ../req-ret.md#REQ-RETR-10c # ptr+digest
- source: ../req-ret.md#REQ-RETR-10d # ptr+digest
- source: ../req-ret.md#REQ-RETR-10e # ptr+digest
- source: ../req-ret.md#REQ-RETR-10f # ptr+digest
- source: ../req-ret.md#REQ-RETR-11a # ptr+digest
- source: ../req-ret.md#REQ-RETR-11b # ptr+digest
- source: ../req-ret.md#REQ-RETR-11c # ptr+digest
- source: ../req-ret.md#REQ-RETR-11d # ptr+digest
- source: ../req-ret.md#REQ-RETR-11e # ptr+digest
  seam-freezes: [ "relate-axes contract consumed-from INDEX (WP-2.8-b.INDEX, frozen upstream) — RETR reads the axes + coChanged band, never recomputes the closure" ]
  anchor: retrieval/ (relate facet — partition + rank + cap over the index-supplied axes/closure)
  interface_contract: # ptr+digest
- source: ../../reference/atlas-retrieval.md#retr-10 # ptr+digest
- source: ../../reference/atlas-retrieval.md#retr-11 # ptr+digest
- source: index/ref/depgraph.ts # ptr+digest
- source: retrieval/ref/relate.ts # ptr+digest
  exclusions: >
  RETR relate presentation/rank/cap ONLY — does NOT record or resolve edges, compute the reverse closure,
  or decide under-approximation (that is INDEX, WP-2.8-b.INDEX). No pack assembly / injection budget
  (CAMPAIGN-6). Consumes the frozen relate-axes contract; never re-derives it.
  inputs: [ ]
  action: implement retrieval/ref/relate.ts (partition + deterministic rank + K-cap + truncation meta) over the INDEX axes to satisfy the frozen goldens; run the relate PBT/conformance suite
  action_surface: [ Read, Edit, Write, Bash(retrieval-test-runner + fmt/clippy only) ]
  guardrails: edits confined to retrieval/**; MUST NOT edit index/**; no new runtime deps; goldens/reqs read-only; no LLM in the closure
  repair_budget: N=3 · early-stop on {repeated-identical-failure, no-change-diff, semantic-dup}
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-ret.md#SCN-RETR-10a-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-10b-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-10c-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-10d-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-10e-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-10f-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-11a-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-11b-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-11c-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-11d-1 # ptr+digest
- source: ../goldens-ret.md#SCN-RETR-11e-1 # ptr+digest
  deps: [ WP-2.8-b.INDEX ] parallel_group: [ ]
  exit_predicate: all acceptance SCN green ∧ block gates (fmt/clippy + determinism + K/maxHops-bound assertion) pass
  context_refs: # closed list
- source: ../req-ret.md
- source: ../goldens-ret.md
- source: ../../reference/atlas-retrieval.md
  owner: # value — techlead dispatch (FORGE seat)
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-RETR-10
- source: ../invariant-register.md#INV-RETR-11

---

## EPIC-9-a — territory & owner assignment

### WP-2.9-a.INDEX — index slice of EPIC-9-a

epic: EPIC-9-a
id: WP-2.9-a.INDEX
content_hash: <filled-at-freeze>
title: territory-assignment facet — hashed-manifest assignment reconciled with graph+blame, $0-LLM
intent: >
Territory assignment derives from the hashed manifest, resolves overlap deterministically (longest-path
then declaration order), byte-identical across rebuilds, calls no model; an unmatched path is flagged
uncovered and a T0-adjacent uncovered path defaults to deny; owner is generated from graph+git-blame with
an explicit override winning, reconciliation deterministic/$0-LLM, tier stays human-ratified, manifest not sole source.
source_reqs: # ptr+digest

- source: ../req-idx.md#REQ-INDEX-14a # ptr+digest
- source: ../req-idx.md#REQ-INDEX-14b # ptr+digest
- source: ../req-idx.md#REQ-INDEX-14c # ptr+digest
- source: ../req-idx.md#REQ-INDEX-14d # ptr+digest
- source: ../req-idx.md#REQ-INDEX-14e # ptr+digest
- source: ../req-idx.md#REQ-INDEX-14f # ptr+digest
- source: ../req-idx.md#REQ-INDEX-15a # ptr+digest
- source: ../req-idx.md#REQ-INDEX-15b # ptr+digest
- source: ../req-idx.md#REQ-INDEX-15c # ptr+digest
- source: ../req-idx.md#REQ-INDEX-15d # ptr+digest
- source: ../req-idx.md#REQ-INDEX-15e # ptr+digest
  seam-freezes: [ ]
  anchor: index/ (territory + ownership facet — manifest assignment; graph+blame owner reconciliation)
  interface_contract: # ptr+digest
- source: ../../reference/atlas-index.md#index-14 # ptr+digest
- source: ../../reference/atlas-index.md#index-15 # ptr+digest
- source: index/ref/territory.ts # ptr+digest
- source: index/ref/ownership.ts # ptr+digest
  exclusions: >
  Territory-assignment facet ONLY — no unresolved-edge ratio publish / T0 coverage gate (EPIC-9-b: 16a–16c).
  No relate, resolve, rollup, or drift. Tier is human-ratified input, not computed here.
  Carries the open [NEEDS RECONCILIATION] on REQ-INDEX-15a (owner-generation SHOULD vs shall) — see flag below.
  inputs: [ ]
  action: implement index/ref/territory.ts + ownership.ts to satisfy the frozen goldens; run the territory conformance + rebuild-determinism suite
  action_surface: [ Read, Edit, Write, Bash(index-test-runner + fmt/clippy only) ]
  guardrails: edits confined to index/\*\*; no writes outside the module; no new runtime deps; goldens/reqs read-only; no model in assignment/reconciliation
  repair_budget: N=3 · early-stop on {repeated-identical-failure, no-change-diff, semantic-dup}
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-idx.md#SCN-INDEX-14a-1 # ptr+digest
- source: ../goldens-idx.md#SCN-INDEX-14b-1 # ptr+digest
- source: ../goldens-idx.md#SCN-INDEX-14c-1 # ptr+digest
- source: ../goldens-idx.md#SCN-INDEX-14d-1 # ptr+digest
- source: ../goldens-idx.md#SCN-INDEX-14e-1 # ptr+digest
- source: ../goldens-idx.md#SCN-INDEX-14f-1 # ptr+digest
- source: ../goldens-idx.md#SCN-INDEX-15a-1 # ptr+digest
- source: ../goldens-idx.md#SCN-INDEX-15b-1 # ptr+digest
- source: ../goldens-idx.md#SCN-INDEX-15c-1 # ptr+digest
- source: ../goldens-idx.md#SCN-INDEX-15d-1 # ptr+digest
- source: ../goldens-idx.md#SCN-INDEX-15e-1 # ptr+digest
  deps: [ WP-2.6.INDEX ] parallel_group: [P]
  exit_predicate: all acceptance SCN green ∧ block gates (fmt/clippy + rebuild byte-identity assertion) pass
  context_refs: # closed list
- source: ../req-idx.md
- source: ../goldens-idx.md
- source: ../../reference/atlas-index.md
  owner: # value — techlead dispatch (FORGE seat)
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-INDEX-14
- source: ../invariant-register.md#INV-INDEX-15

---

## EPIC-9-b — standing coverage gate on unresolved edges

### WP-2.9-b.INDEX — index slice of EPIC-9-b

epic: EPIC-9-b
id: WP-2.9-b.INDEX
content_hash: <filled-at-freeze>
title: coverage-gate rule — publish unresolved-edge ratio per territory, T0 ceiling fails the build
intent: >
On every rollup the unresolved-edge ratio is published as a per-territory health metric; the T0 ceiling
(unresolved/total > 15%) is enforced as a standing gate from day one, and crossing it in a T0 territory
fails the gate (not merely schedules the functional axis).
source_reqs: # ptr+digest

- source: ../req-idx.md#REQ-INDEX-16a # ptr+digest
- source: ../req-idx.md#REQ-INDEX-16b # ptr+digest
- source: ../req-idx.md#REQ-INDEX-16c # ptr+digest
  seam-freezes: [ ]
  anchor: index/ (coverage facet — per-territory unresolved-edge ratio + T0 standing gate)
  interface_contract: # ptr+digest
- source: ../../reference/atlas-index.md#index-16 # ptr+digest
- source: index/ref/coverage.ts # ptr+digest
  exclusions: >
  Coverage-gate rule ONLY — does not record or resolve edges (that is EPIC-8-b/13) nor assign territory
  (EPIC-9-a/14–15); consumes the unresolved-edge set + territory assignment as frozen upstream inputs.
  inputs: [ ]
  action: implement index/ref/coverage.ts (ratio publish + T0 standing gate) to satisfy the frozen goldens; run the coverage conformance suite
  action_surface: [ Read, Edit, Write, Bash(index-test-runner + fmt/clippy only) ]
  guardrails: edits confined to index/\*\*; no writes outside the module; no new runtime deps; goldens/reqs read-only
  repair_budget: N=3 · early-stop on {repeated-identical-failure, no-change-diff, semantic-dup}
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-idx.md#SCN-INDEX-16a-1 # ptr+digest
- source: ../goldens-idx.md#SCN-INDEX-16b-1 # ptr+digest
- source: ../goldens-idx.md#SCN-INDEX-16c-1 # ptr+digest
  deps: [ WP-2.6.INDEX, WP-2.8-b.INDEX, WP-2.9-a.INDEX ] parallel_group: [ ]
  exit_predicate: all acceptance SCN green ∧ block gates (fmt/clippy + T0-ceiling gate-fires assertion) pass
  context_refs: # closed list
- source: ../req-idx.md
- source: ../goldens-idx.md
- source: ../../reference/atlas-index.md
  owner: # value — techlead dispatch (FORGE seat)
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-INDEX-16

---

## S4 self-check (partition proof)

- **REQ→WP partition — 66/66, orphans = 0, doubles = 0:**
  - INDEX (55): 1a,1b,3a,3b,3c,3d,3e (E6=7) · 2a,2b,2c,12a,12b,12c,12d,12e,12f (E7-a=9) ·
    5a,5b,5c,12g,12h,12i,12j,12k (E7-b=8) · 4a,4b,6a,6b,7a,8a,9a,9b,10a,10b,10c (E8-a=11) ·
    13a,13b,13c,13d,13e,13f (E8-b=6) · 14a–14f,15a–15e (E9-a=11) · 16a,16b,16c (E9-b=3).
    (INDEX-11a/11b intentionally excluded — CAMPAIGN-4/EPIC-10-a.)
  - RETR (11): 10a,10b,10c,10d,10e,10f,11a,11b,11c,11d,11e (E8-b RETR slice).
- **Per-epic coverage:** EPIC-6 ✓ (build ∪ composition) · EPIC-7-a ✓ · EPIC-7-b ✓ · EPIC-8-a ✓ · EPIC-8-b ✓ (INDEX ∪ RETR) · EPIC-9-a ✓ · EPIC-9-b ✓.
- **Seam-freezes = 1:** relate-axes contract owned-by INDEX (WP-2.8-b.INDEX), consumed-by RETR (WP-2.8-b.RETR) — not smeared.
- **Driftless:** every substantive field is a `ptr+digest`; acceptance = the frozen goldens by reference; `exec` fields present-but-empty.
- **No new decision:** every card transcribes its epic's frozen reqs + goldens; the only open item is the upstream-flagged
  REQ-INDEX-15a [NEEDS RECONCILIATION] (owner-generation SHOULD→shall), surfaced not re-decided.
