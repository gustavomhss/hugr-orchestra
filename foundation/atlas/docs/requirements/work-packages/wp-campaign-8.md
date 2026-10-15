# Work Packages — CAMPAIGN-8 (state S4)

> Genesis seeding (the one-time seeder). One WP-card per (epic × module), conforming to
> `../../method/wp-template.md`. Every **substantive** field is a `ptr+digest` (the digest is
> tooling-filled at freeze — the `# ptr+digest` marker stands where the hash lands; no hash is
> fabricated here). `intent` is the sole prose carve-out (non-authoritative, executor-invisible).
> `exec` fields (`outputs`/`provenance`/`trace_ref`) are present-but-empty at S4-freeze.
> Campaign prerequisites (CAMPAIGN-2, CAMPAIGN-4, CAMPAIGN-5) are readiness edges from the roadmap
> DAG; they surface as hashed `inputs[]` materials, not as intra-campaign WP `deps`.

---

## EPIC-27 — move-in: deterministic $0-LLM skeleton

Cross-module epic (TOOLS → GEN). `atlas-init` (TOOLS) produces the structural skeleton + blast
radius + T0-candidate flags; the deterministic S0/S1 genesis (GEN) consumes that skeleton and adds
the reproducible PPR ranking. **One** seam-freeze — the producing module (TOOLS) owns it; GEN
consumes it. The obligation is not duplicated: the skeleton contract is authored once, in the TOOLS
WP; the GEN WP holds only a consumed-from pointer.

### WP-8.27.TOOLS — TOOLS slice of EPIC-27

epic: EPIC-27
id: WP-8.27.TOOLS
content*hash: <filled-at-freeze>
title: atlas-init move-in — $0-LLM structural skeleton, blast radius, T0-candidate flags
intent: >
atlas-init performs move-in as a $0-LLM structural operation, returning the territory skeleton +
blast radius + T0-candidate flags. It never sets a tier above T2, never auto-promotes a T0, and
heuristics may only \_flag* a T0 candidate. (Human handle only — nothing is verified against this.)
source_reqs: # ptr+digest

- source: ../req-tls.md#REQ-TOOLS-5a # ptr+digest
- source: ../req-tls.md#REQ-TOOLS-5b # ptr+digest
- source: ../req-tls.md#REQ-TOOLS-5c # ptr+digest
- source: ../req-tls.md#REQ-TOOLS-5d # ptr+digest
- source: ../req-tls.md#REQ-TOOLS-5e # ptr+digest
  seam-freezes: [ "atlas-init skeleton (skeleton + blast radius + T0-candidate flags) owned-by TOOLS, consumed-by GEN" ]
  anchor: atlas-tools module · atlas-init handler (move-in entrypoint) — governance surface tool
  interface_contract: # ptr+digest
- source: ../../reference/atlas-tools.md#tools-5 # ptr+digest
  exclusions: >
  no LLM call; no embedding/vector/ANN; does not set tier > T2; does not auto-promote a T0; does not
  write outside atlas-init's return object; not the genesis ranking (that is WP-8.27.GEN); not the
  five-tool surface / write-door integrity (EPIC-26 / CAMPAIGN-7).
  inputs: # ptr+digest
- source: repo@rev # ptr+digest
- source: ../../reference/atlas-index.md # ptr+digest
  action: >
  Implement atlas-init to derive the territory skeleton, blast radius, and T0-candidate flags purely
  from the structural index at the pinned rev; return them in the tool's structured verdict with tier
  clamped ≤ T2 and T0 only flagged. Satisfy each source_req's golden.
  action_surface: [ Read, Edit, Write, Bash(build + test + gate-runner only) ]
  guardrails:
  paths: writes confined to the atlas-tools/atlas-init module; may READ the index + reference only
  edit-lint: method fmt + lint gate must pass; no new subsystem
  forbidden: editing the GEN/genesis module; any write path other than the atlas-init return object
  repair_budget: { N: 3, early_stop: [ repeated-failure, no-change, semantic-dup ] }
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-tls.md#SCN-TOOLS-5a-1 # ptr+digest
- source: ../goldens-tls.md#SCN-TOOLS-5b-1 # ptr+digest
- source: ../goldens-tls.md#SCN-TOOLS-5c-1 # ptr+digest
- source: ../goldens-tls.md#SCN-TOOLS-5d-1 # ptr+digest
- source: ../goldens-tls.md#SCN-TOOLS-5e-1 # ptr+digest
  deps: [ ] parallel_group: [P]
  exit_predicate: all acceptance SCN green ∧ all method gates pass ∧ every ptr+digest resolves (no STALE)
  context_refs: # closed list
- source: ../req-tls.md#REQ-TOOLS-5a
- source: ../goldens-tls.md#SCN-TOOLS-5a-1
- source: ../../reference/atlas-tools.md#tools-5
  owner: <techlead-dispatch: TOOLS seat>
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-TOOLS-5

### WP-8.27.GEN — GEN slice of EPIC-27

epic: EPIC-27
id: WP-8.27.GEN
content_hash: <filled-at-freeze>
title: deterministic $0-LLM S0/S1 genesis — reproducible skeleton + PPR ranking, degenerate-history fallback
intent: >
Genesis computes S0/S1 as $0-LLM pure functions of repo@rev, reproducing a byte-identical skeleton
and candidate ranking across runs and machines. Cost tracks the PPR frontier (hotspot × SZZ ×
blast), never file/line count. Every stage binds a named deterministic structural mechanism, no
embeddings/ANN. A degenerate history falls the personalization vector back to structural centrality.
source_reqs: # ptr+digest

- source: ../req-gen.md#REQ-GEN-1a # ptr+digest
- source: ../req-gen.md#REQ-GEN-1b # ptr+digest
- source: ../req-gen.md#REQ-GEN-1c # ptr+digest
- source: ../req-gen.md#REQ-GEN-3a # ptr+digest
- source: ../req-gen.md#REQ-GEN-3b # ptr+digest
- source: ../req-gen.md#REQ-GEN-10a # ptr+digest
- source: ../req-gen.md#REQ-GEN-10b # ptr+digest
- source: ../req-gen.md#REQ-GEN-11a # ptr+digest
- source: ../req-gen.md#REQ-GEN-11b # ptr+digest
- source: ../req-gen.md#REQ-GEN-11c # ptr+digest
- source: ../req-gen.md#REQ-GEN-15a # ptr+digest
- source: ../req-gen.md#REQ-GEN-15b # ptr+digest
- source: ../req-gen.md#REQ-GEN-15c # ptr+digest
  seam-freezes: [ "atlas-init skeleton consumed-from TOOLS (frozen upstream — WP-8.27.TOOLS owns it)" ]
  anchor: atlas-genesis module · S0/S1 stage (deterministic skeleton build + personalized-PageRank ranking)
  interface_contract: # ptr+digest
- source: ../../reference/atlas-tools.md#tools-5 # ptr+digest
- source: ../../reference/atlas-genesis.md#gen-11 # ptr+digest
  exclusions: >
  no LLM call anywhere in S0/S1; no embedding/vector store/ANN; does not author the atlas-init
  skeleton (consumed from TOOLS); not the budgeted LLM proposal (EPIC-28-a); not admission/teeth
  (EPIC-28-b); not resume/hand-off (EPIC-30).
  inputs: # ptr+digest
- source: repo@rev # ptr+digest
- source: ../../reference/atlas-tools.md#tools-5 # ptr+digest
- source: ../../reference/atlas-index.md # ptr+digest
  action: >
  Implement S0/S1 as pure functions of repo@rev: build the skeleton from the atlas-init seam, compute
  the candidate ranking via SZZ + hotspots + temporal-coupling feeding a personalized PageRank with
  pinned damping/seed, bind each stage to its named mechanism, and detect degenerate history to fall
  back to structural centrality. Satisfy each source_req's golden.
  action_surface: [ Read, Edit, Write, Bash(build + test + gate-runner only) ]
  guardrails:
  paths: writes confined to the atlas-genesis module; may READ the seam + index + reference only
  edit-lint: method fmt + lint gate must pass; determinism gate (byte-identical re-run) enforced
  forbidden: editing the atlas-tools/atlas-init module; introducing a model or randomness into ranking
  repair_budget: { N: 3, early_stop: [ repeated-failure, no-change, semantic-dup ] }
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-gen.md#SCN-GEN-1a-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-1b-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-1c-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-3a-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-3b-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-10a-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-10b-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-11a-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-11b-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-11c-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-15a-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-15b-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-15c-1 # ptr+digest
  deps: [ WP-8.27.TOOLS ] parallel_group: [ ]
  exit_predicate: all acceptance SCN green ∧ all method gates pass ∧ determinism (byte-identical skeleton+ranking) holds ∧ every ptr+digest resolves
  context_refs: # closed list
- source: ../req-gen.md#REQ-GEN-1a
- source: ../goldens-gen.md#SCN-GEN-1a-1
- source: ../../reference/atlas-genesis.md#gen-11
- source: ../../reference/atlas-tools.md#tools-5
  owner: <techlead-dispatch: GEN seat>
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-GEN-11

---

## EPIC-28-a — budgeted, grounded LLM proposal

Single-module epic (GEN only) → exactly one WP, no seam-freeze.

### WP-8.28-a.GEN — GEN slice of EPIC-28-a

epic: EPIC-28-a
id: WP-8.28-a.GEN
content_hash: <filled-at-freeze>
title: budgeted grounded proposal — spend highest-first under a hard ceiling, every seed passes the truth door and carries an obviousness score
intent: >
The LLM fires only on ranked sites, highest-first, one bounded call per site, under a hard budget
(default min(frontier,200)), halting at marginal value; no repo-wide sweep. Every seeded fact is
grounded by subtreeHash, passes the truth door at atlas-emit and carries a harness-computed obviousness
score (never rejected for being obvious — ADR-0012), self-declares nothing; mined signals
are ranking heuristics only and churn alone mints no fact.
source_reqs: # ptr+digest

- source: ../req-gen.md#REQ-GEN-2a # ptr+digest
- source: ../req-gen.md#REQ-GEN-2b # ptr+digest
- source: ../req-gen.md#REQ-GEN-2c # ptr+digest
- source: ../req-gen.md#REQ-GEN-2d # ptr+digest
- source: ../req-gen.md#REQ-GEN-2e # ptr+digest
- source: ../req-gen.md#REQ-GEN-2f # ptr+digest
- source: ../req-gen.md#REQ-GEN-4a # ptr+digest
- source: ../req-gen.md#REQ-GEN-4b # ptr+digest
- source: ../req-gen.md#REQ-GEN-4c # ptr+digest
- source: ../req-gen.md#REQ-GEN-4d # ptr+digest
- source: ../req-gen.md#REQ-GEN-6a # ptr+digest
- source: ../req-gen.md#REQ-GEN-6b # ptr+digest
- source: ../req-gen.md#REQ-GEN-6c # ptr+digest
  seam-freezes: [ ]
  anchor: atlas-genesis module · S2 proposal driver (budgeted, ranked-site LLM call + admission-gate call + obviousness scoring)
  interface_contract: # ptr+digest
- source: ../../reference/atlas-genesis.md#gen-2 # ptr+digest
  exclusions: >
  does not compute the ranking (consumed from EPIC-27's PPR frontier); does not perform admission or
  the teeth check (EPIC-28-b); does not set escalation defaults (EPIC-28-c); does not define the
  admission gate itself (CAMPAIGN-4) or the write-decision (CAMPAIGN-5) — it calls them.
  inputs: # ptr+digest
- source: repo@rev # ptr+digest
- source: ../../reference/atlas-genesis.md#gen-11 # ptr+digest
- source: ../../reference/atlas-grounding.md # ptr+digest
- source: ../../reference/atlas-tools.md#tools-7 # ptr+digest
  action: >
  Drive S2 proposals over the ranked frontier highest-first, one bounded call per site, enforcing the
  hard budget ceiling and the trailing-admit-rate halt; ground each candidate by subtreeHash and route
  it through the truth door at atlas-emit, attaching the harness-computed obviousness score; treat mined signals as ranking heuristics only. Satisfy each
  source_req's golden.
  action_surface: [ Read, Edit, Write, Bash(build + test + gate-runner only) ]
  guardrails:
  paths: writes confined to the atlas-genesis module; grounding/emit gates READ-called, never edited
  edit-lint: method fmt + lint gate must pass
  forbidden: any repo-wide LLM sweep; minting a fact from churn/SZZ alone; a seed self-declaring true
  repair_budget: { N: 3, early_stop: [ repeated-failure, no-change, semantic-dup ] }
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-gen.md#SCN-GEN-2a-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-2b-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-2c-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-2d-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-2e-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-2f-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-4a-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-4b-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-4c-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-4d-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-6a-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-6b-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-6c-1 # ptr+digest
  deps: [ ] parallel_group: [P]
  exit_predicate: all acceptance SCN green ∧ all method gates pass ∧ every ptr+digest resolves
  context_refs: # closed list
- source: ../req-gen.md#REQ-GEN-2a
- source: ../goldens-gen.md#SCN-GEN-2a-1
- source: ../../reference/atlas-genesis.md#gen-2
  owner: <techlead-dispatch: GEN seat>
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-GEN-2

---

## EPIC-28-b — mechanical admission with teeth

Single-module epic (GEN only) → exactly one WP, no seam-freeze.

### WP-8.28-b.GEN — GEN slice of EPIC-28-b

epic: EPIC-28-b
id: WP-8.28-b.GEN
content_hash: <filled-at-freeze>
title: mechanical admission with teeth — predicate admitted only on HOLDS-and-flips-BROKEN, vacuous checks dropped
intent: >
In S2 the LLM only proposes typed candidates; admission is mechanical. A predicate is admitted only
if its synthesized check compiles, returns HOLDS on current code, and flips to BROKEN on a mutated
counterfactual (teeth); a failing check refines ≤K then drops, never forced. Advisory passes the two
doors. Chain-of-thought is scratch. Abstention is valid, unpressured; a predicate is labelled a
machine-checked likely-invariant, never a proof; a sound type/LSP oracle is preferred first.
source_reqs: # ptr+digest

- source: ../req-gen.md#REQ-GEN-12a # ptr+digest
- source: ../req-gen.md#REQ-GEN-12b # ptr+digest
- source: ../req-gen.md#REQ-GEN-12c # ptr+digest
- source: ../req-gen.md#REQ-GEN-12d # ptr+digest
- source: ../req-gen.md#REQ-GEN-12e # ptr+digest
- source: ../req-gen.md#REQ-GEN-12f # ptr+digest
- source: ../req-gen.md#REQ-GEN-12g # ptr+digest
- source: ../req-gen.md#REQ-GEN-12h # ptr+digest
- source: ../req-gen.md#REQ-GEN-12i # ptr+digest
- source: ../req-gen.md#REQ-GEN-12j # ptr+digest
- source: ../req-gen.md#REQ-GEN-12k # ptr+digest
  seam-freezes: [ ]
  anchor: atlas-genesis module · S2 admission engine (mechanical admit + synthesized-check teeth/mutant gate)
  interface_contract: # ptr+digest
- source: ../../reference/atlas-genesis.md#gen-12 # ptr+digest
  exclusions: >
  does not propose candidates' ranking/budget (EPIC-28-a); does not set escalation tiers/CEGIS-K
  defaults (EPIC-28-c); does not define the predicate check-engine semantics (CAMPAIGN-5 EPIC-16) —
  it invokes them; does not persist chain-of-thought.
  inputs: # ptr+digest
- source: ../../reference/atlas-genesis.md#gen-2 # ptr+digest
- source: ../../reference/atlas-knowledge.md # ptr+digest
- source: ../../reference/atlas-grounding.md # ptr+digest
  action: >
  Implement mechanical admission: compile + evaluate each predicate candidate's synthesized check to
  HOLDS-on-current, require a flip-to-BROKEN on a mechanically-mutated counterfactual (drop vacuous),
  REFINE ≤K then drop failures; admit advisories only through the two doors; prefer the type-checker/LSP
  oracle where the slot is type-expressible; treat abstention as valid. Satisfy each source_req's golden.
  action_surface: [ Read, Edit, Write, Bash(build + test + gate-runner only) ]
  guardrails:
  paths: writes confined to the atlas-genesis module; check-engine/gates READ-called, never edited
  edit-lint: method fmt + lint gate must pass
  forbidden: admitting a predicate without a HOLDS-and-flips check; persisting chain-of-thought; pressuring emit
  repair_budget: { N: 3, early_stop: [ repeated-failure, no-change, semantic-dup ] }
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-gen.md#SCN-GEN-12a-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-12b-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-12c-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-12d-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-12e-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-12f-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-12g-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-12h-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-12i-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-12j-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-12k-1 # ptr+digest
  deps: [ ] parallel_group: [P]
  exit_predicate: all acceptance SCN green ∧ all method gates pass ∧ every ptr+digest resolves
  context_refs: # closed list
- source: ../req-gen.md#REQ-GEN-12a
- source: ../goldens-gen.md#SCN-GEN-12a-1
- source: ../../reference/atlas-genesis.md#gen-12
  owner: <techlead-dispatch: GEN seat>
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-GEN-12

---

## EPIC-28-c — tiered escalation defaults (cheap-by-default)

Single-module epic (GEN only) → exactly one WP, no seam-freeze.

### WP-8.28-c.GEN — GEN slice of EPIC-28-c

epic: EPIC-28-c
id: WP-8.28-c.GEN
content_hash: <filled-at-freeze>
title: tiered escalation defaults — base tier one sample/advisory/CEGIS≤1, refuter for T0 only, per-stage cost
intent: >
Every S2 mechanism beyond a single grounded proposal is off at base tier, switching on only when a
cheap signal shows a candidate high-value AND uncertain. Defaults: one sample, advisory unless
checkable at tier≥T1, CEGIS K≤1, refuter only for T0, Semgrep before CodeQL, query DB built once. No
whole-repo pass required; scopable to a subtree (cold tail → born-from-work); cost reported per stage.
source_reqs: # ptr+digest

- source: ../req-gen.md#REQ-GEN-13a # ptr+digest
- source: ../req-gen.md#REQ-GEN-13b # ptr+digest
- source: ../req-gen.md#REQ-GEN-13c # ptr+digest
- source: ../req-gen.md#REQ-GEN-13d # ptr+digest
- source: ../req-gen.md#REQ-GEN-13e # ptr+digest
- source: ../req-gen.md#REQ-GEN-13f # ptr+digest
- source: ../req-gen.md#REQ-GEN-13g # ptr+digest
- source: ../req-gen.md#REQ-GEN-13h # ptr+digest
- source: ../req-gen.md#REQ-GEN-13i # ptr+digest
- source: ../req-gen.md#REQ-GEN-13j # ptr+digest
- source: ../req-gen.md#REQ-GEN-13k # ptr+digest
  seam-freezes: [ ]
  anchor: atlas-genesis module · S2 escalation controller (tier-gated mechanism switches + per-stage cost report)
  interface_contract: # ptr+digest
- source: ../../reference/atlas-genesis.md#gen-13 # ptr+digest
  exclusions: >
  does not perform the admission/teeth check itself (EPIC-28-b); does not define budget/spend order
  (EPIC-28-a); does not implement CodeQL/Semgrep engines — it orders and gates them; not the deepening
  loops (EPIC-31).
  inputs: # ptr+digest
- source: ../../reference/atlas-genesis.md#gen-11 # ptr+digest
- source: ../../reference/atlas-genesis.md#gen-12 # ptr+digest
  action: >
  Implement the escalation controller: keep every extra S2 mechanism off at base tier, switch on only
  on a high-value-and-uncertain cheap signal, apply the frozen defaults (one sample, advisory-unless-
  checkable≥T1, CEGIS K≤1, refuter T0-only, Semgrep-before-CodeQL, query-DB-once), keep the run scopable
  with no whole-repo pass, and report cost per stage. Satisfy each source_req's golden.
  action_surface: [ Read, Edit, Write, Bash(build + test + gate-runner only) ]
  guardrails:
  paths: writes confined to the atlas-genesis module
  edit-lint: method fmt + lint gate must pass
  forbidden: turning on extra mechanisms at base tier; requiring a whole-repo pass; unreported stage cost
  repair_budget: { N: 3, early_stop: [ repeated-failure, no-change, semantic-dup ] }
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-gen.md#SCN-GEN-13a-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-13b-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-13c-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-13d-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-13e-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-13f-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-13g-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-13h-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-13i-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-13j-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-13k-1 # ptr+digest
  deps: [ ] parallel_group: [P]
  exit_predicate: all acceptance SCN green ∧ all method gates pass ∧ every ptr+digest resolves
  context_refs: # closed list
- source: ../req-gen.md#REQ-GEN-13a
- source: ../goldens-gen.md#SCN-GEN-13a-1
- source: ../../reference/atlas-genesis.md#gen-13
  owner: <techlead-dispatch: GEN seat>
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-GEN-13

---

## EPIC-29 — candidate-only writes, batched ratification, Awareness sources

Single-module epic (GEN only) → exactly one WP, no seam-freeze.

### WP-8.29.GEN — GEN slice of EPIC-29

epic: EPIC-29
id: WP-8.29.GEN
content_hash: <filled-at-freeze>
title: seed-and-hand-off — candidate-only writes, one batched ratification pass, Awareness sources (never fabricated)
intent: >
Genesis writes only candidates, hands T0/contested facts to a batched ranked human ratification (never
one question at a time, never auto-promoted). It creates the sources every Awareness facet rolls up
from; a source-less facet renders UN-SEEDED and is never fabricated; the mission stub stays unratified
until a real DEFINE artifact is ratified.
source_reqs: # ptr+digest

- source: ../req-gen.md#REQ-GEN-5a # ptr+digest
- source: ../req-gen.md#REQ-GEN-5b # ptr+digest
- source: ../req-gen.md#REQ-GEN-5c # ptr+digest
- source: ../req-gen.md#REQ-GEN-5d # ptr+digest
- source: ../req-gen.md#REQ-GEN-9a # ptr+digest
- source: ../req-gen.md#REQ-GEN-9b # ptr+digest
- source: ../req-gen.md#REQ-GEN-9c # ptr+digest
- source: ../req-gen.md#REQ-GEN-9d # ptr+digest
  seam-freezes: [ ]
  anchor: atlas-genesis module · candidate-write + batched-ratification hand-off + Awareness-source seeding stage
  interface_contract: # ptr+digest
- source: ../../reference/atlas-genesis.md#gen-5 # ptr+digest
  exclusions: >
  does not define ratification routing/tiers (CAMPAIGN-5 EPIC-15) — it feeds the batch; does not assemble
  the Awareness slab (CAMPAIGN-6 EPIC-24-a) — it only creates the sources; does not perform the proposal
  or admission (EPIC-28-a/b).
  inputs: # ptr+digest
- source: ../../reference/atlas-genesis.md#gen-2 # ptr+digest
- source: ../../reference/atlas-knowledge.md # ptr+digest
- source: ../../reference/atlas-memory.md # ptr+digest
  action: >
  Implement candidate-only writes and assemble one batched ranked ratification pass for T0/contested
  facts (no auto-promote, never one-at-a-time); create the Awareness facet sources, render source-less
  facets UN-SEEDED without fabrication, and keep the mission stub unratified. Satisfy each source_req's golden.
  action_surface: [ Read, Edit, Write, Bash(build + test + gate-runner only) ]
  guardrails:
  paths: writes confined to the atlas-genesis module; ratification/memory contracts READ-called
  edit-lint: method fmt + lint gate must pass
  forbidden: auto-promoting a T0/contested fact; fabricating an Awareness facet; ratifying the mission stub
  repair_budget: { N: 3, early_stop: [ repeated-failure, no-change, semantic-dup ] }
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-gen.md#SCN-GEN-5a-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-5b-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-5c-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-5d-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-9a-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-9b-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-9c-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-9d-1 # ptr+digest
  deps: [ ] parallel_group: [P]
  exit_predicate: all acceptance SCN green ∧ all method gates pass ∧ every ptr+digest resolves
  context_refs: # closed list
- source: ../req-gen.md#REQ-GEN-5a
- source: ../goldens-gen.md#SCN-GEN-5a-1
- source: ../../reference/atlas-genesis.md#gen-5
  owner: <techlead-dispatch: GEN seat>
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-GEN-5

---

## EPIC-30 — genesis resume, robustness & born-from-work hand-off

Single-module epic (GEN only) → exactly one WP, no seam-freeze.

### WP-8.30.GEN — GEN slice of EPIC-30

epic: EPIC-30
id: WP-8.30.GEN
content_hash: <filled-at-freeze>
title: resume & robustness — resume from last site, partial skeleton on malformed input, idempotent incremental re-run
intent: >
Genesis hands the cold tail to born-from-work; a re-run upserts already-grounded facts idempotently
and proceeds incrementally. An interrupted run resumes from the last completed ranked site; a malformed
repo/rev yields an honest empty/partial skeleton with a resumeToken, never a throw. The run also RECORDS
what it covered: one per-site outcome for every planned site (seeded with what, or the grounded GEN-12g
why-not, or never visited with the cause), so a dropped site is distinguishable from an abstaining one.
source_reqs: # ptr+digest

- source: ../req-gen.md#REQ-GEN-7a # ptr+digest
- source: ../req-gen.md#REQ-GEN-7b # ptr+digest
- source: ../req-gen.md#REQ-GEN-7c # ptr+digest
- source: ../req-gen.md#REQ-GEN-8a # ptr+digest
- source: ../req-gen.md#REQ-GEN-8b # ptr+digest
- source: ../req-gen.md#REQ-GEN-8c # ptr+digest
- source: ../req-gen.md#REQ-GEN-12g # ptr+digest — abstention is a valid outcome only if the RUN records it
  seam-freezes: [ ]
  anchor: atlas-genesis module · run-controller (checkpoint/resume + malformed-input degrade + born-from-work hand-off)
  interface_contract: # ptr+digest
- source: ../../reference/atlas-genesis.md#gen-7 # ptr+digest
  exclusions: >
  does not implement the born-from-work capability itself (CAMPAIGN-5 EPIC-17) — it hands off; does not
  define the upsert write-decision (CAMPAIGN-5 EPIC-13) — it calls it; not the proposal/admission stages.
  inputs: # ptr+digest
- source: ../../reference/atlas-genesis.md#gen-11 # ptr+digest
- source: ../../reference/atlas-knowledge.md # ptr+digest
  action: >
  Implement the run controller: checkpoint per completed ranked site and resume from the last one on
  interrupt; on malformed repo/rev emit an honest empty/partial skeleton + resumeToken without throwing;
  make re-runs idempotent (upsert) and incremental; hand the cold tail to born-from-work. Satisfy each
  source_req's golden.
  action_surface: [ Read, Edit, Write, Bash(build + test + gate-runner only) ]
  guardrails:
  paths: writes confined to the atlas-genesis module; write-decision/hand-off contracts READ-called
  edit-lint: method fmt + lint gate must pass; totality gate (no throw on malformed input) enforced
  forbidden: throwing on malformed input; a non-idempotent re-run; remaining a sweeper instead of handing off
  repair_budget: { N: 3, early_stop: [ repeated-failure, no-change, semantic-dup ] }
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-gen.md#SCN-GEN-7a-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-7b-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-7c-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-8a-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-8b-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-8c-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-8a-3 # ptr+digest — the resumed run's site set closes over the ORIGINAL frontier
- source: ../goldens-gen.md#SCN-GEN-12g-3 # ptr+digest — the run REPORTS the grounded why-not, per site
- source: ../goldens-gen.md#SCN-GEN-12g-4 # ptr+digest — a dropped site is distinguishable from an abstaining one
  deps: [ ] parallel_group: [P]
  exit_predicate: all acceptance SCN green ∧ all method gates pass ∧ totality holds (malformed → value, never throw) ∧ every ptr+digest resolves
  context_refs: # closed list
- source: ../req-gen.md#REQ-GEN-7a
- source: ../goldens-gen.md#SCN-GEN-7a-1
- source: ../../reference/atlas-genesis.md#gen-7
  owner: <techlead-dispatch: GEN seat>
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-GEN-7

---

## EPIC-31 — the three governed deepening loops

Single-module epic (GEN only) → exactly one WP, no seam-freeze.

### WP-8.31.GEN — GEN slice of EPIC-31

epic: EPIC-31
id: WP-8.31.GEN
content_hash: <filled-at-freeze>
title: governed deepening loops — REVIEW/ENRICH/EXPAND opt-in, budget-gated, fixpoint-stopping, machinery-reuse
intent: >
The REVIEW / ENRICH / EXPAND loops are each opt-in or default-shallow, budget-gated, and carry a
diminishing-returns / fixpoint stop — no loop runs unbounded. With all loops off, genesis equals the
single cheap pass (GEN-13). Loops reuse existing machinery (propose→verify, relate()), add no new
subsystem, and never duplicate born-from-work's free lazy enrichment.
source_reqs: # ptr+digest

- source: ../req-gen.md#REQ-GEN-14a # ptr+digest
- source: ../req-gen.md#REQ-GEN-14b # ptr+digest
- source: ../req-gen.md#REQ-GEN-14c # ptr+digest
- source: ../req-gen.md#REQ-GEN-14d # ptr+digest
- source: ../req-gen.md#REQ-GEN-14e # ptr+digest
- source: ../req-gen.md#REQ-GEN-14f # ptr+digest
- source: ../req-gen.md#REQ-GEN-14g # ptr+digest
- source: ../req-gen.md#REQ-GEN-14h # ptr+digest
  seam-freezes: [ ]
  anchor: atlas-genesis module · deepening-loop controller (REVIEW/ENRICH/EXPAND, budget+fixpoint gate over reused machinery)
  interface_contract: # ptr+digest
- source: ../../reference/atlas-genesis.md#gen-14 # ptr+digest
  exclusions: >
  adds no new subsystem; does not re-implement propose→verify or relate() — it reuses them; does not
  change the base single-pass cost (EPIC-28-c); does not duplicate born-from-work's lazy enrichment
  (CAMPAIGN-5 EPIC-17).
  inputs: # ptr+digest
- source: ../../reference/atlas-genesis.md#gen-13 # ptr+digest
- source: ../../reference/atlas-genesis.md#gen-12 # ptr+digest
- source: ../../reference/atlas-index.md # ptr+digest
  action: >
  Implement the three deepening loops as opt-in/default-shallow passes over the existing propose→verify
  and relate() machinery, each budget-gated with a diminishing-returns / fixpoint stop and no unbounded
  run; ensure loops-off is byte-for-cost identical to the single cheap pass, add no new subsystem, and do
  not duplicate born-from-work enrichment. Satisfy each source_req's golden.
  action_surface: [ Read, Edit, Write, Bash(build + test + gate-runner only) ]
  guardrails:
  paths: writes confined to the atlas-genesis module; relate()/verify machinery reused, not forked
  edit-lint: method fmt + lint gate must pass
  forbidden: any unbounded loop; a new subsystem; changing the loops-off single-pass cost; duplicating lazy enrichment
  repair_budget: { N: 3, early_stop: [ repeated-failure, no-change, semantic-dup ] }
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-gen.md#SCN-GEN-14a-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-14b-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-14c-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-14d-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-14e-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-14f-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-14g-1 # ptr+digest
- source: ../goldens-gen.md#SCN-GEN-14h-1 # ptr+digest
  deps: [ ] parallel_group: [P]
  exit_predicate: all acceptance SCN green ∧ all method gates pass ∧ loops-off == single-pass cost ∧ every ptr+digest resolves
  context_refs: # closed list
- source: ../req-gen.md#REQ-GEN-14a
- source: ../goldens-gen.md#SCN-GEN-14a-1
- source: ../../reference/atlas-genesis.md#gen-14
  owner: <techlead-dispatch: GEN seat>
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-GEN-14
