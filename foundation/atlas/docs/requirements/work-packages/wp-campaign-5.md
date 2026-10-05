# Work Packages — CAMPAIGN-5 (state S4)

> Knowledge write-decision & lifecycle. One WP-card per (epic × module), conforming to
> [`method/wp-template.md`](../../method/wp-template.md). Every substantive field is a `ptr+digest`
> (pointer + `# ptr+digest` marker; digest tooling-filled at freeze — no hash fabricated here).
> `exec` fields (`outputs`/`provenance`/`trace_ref`) are present-but-empty at S4-freeze.
> Pointers are relative to this file (`docs/requirements/work-packages/`).

---

## EPIC-13-a — write-decision routes create/update/supersede

### WP-5.13-a.KNOW — KNOW slice of EPIC-13-a

epic: EPIC-13-a
id: WP-5.13-a.KNOW
content*hash: <filled-at-freeze>
title: Write-routing rules — every write an upsert (create/update/supersede)
intent: >
*(non-authoritative handle)\_ the three-hash route mechanically picks create/update/supersede so a re-emitted fact upserts instead of duplicating: identical fact is idempotent, changed advisory edits in place, changed predicate supersedes with lineage, one current node per subject.
source_reqs: # ptr+digest

- source: ../req-knw.md#REQ-KNOW-4a # ptr+digest
- source: ../req-knw.md#REQ-KNOW-4b # ptr+digest
- source: ../req-knw.md#REQ-KNOW-4c # ptr+digest
- source: ../req-knw.md#REQ-KNOW-4d # ptr+digest
- source: ../req-knw.md#REQ-KNOW-4e # ptr+digest
- source: ../req-knw.md#REQ-KNOW-4f # ptr+digest
- source: ../req-knw.md#REQ-KNOW-4g # ptr+digest
  seam-freezes: [ "write-decision/upsert contract owned-by KNOW, consumed-by TOOLS" ] (owner of the EPIC-13-a KNOW→TOOLS obligation; not smeared into WP-5.13-a.TOOLS)
  anchor: `knowledge/` — the write-decision router (reference site `knowledge/ref/router.ts` per method-tags-knw §KNOW-4)
  interface_contract: # ptr+digest
- source: ../method-tags-knw.md#KNOW-4 # ptr+digest
  exclusions: nodeKey / primaryAnchorId identity formulae (owned by WP-5.13-b.KNOW); template/scope validation (WP-5.14.KNOW); tier routing (WP-5.15.KNOW); the templated-insert TOOLS surface (WP-5.13-a.TOOLS, consumes this seam).
  inputs: # ptr+digest
- source: ../req-knw.md#REQ-KNOW-4a # ptr+digest
- source: ../req-knw.md#REQ-KNOW-4g # ptr+digest
- source: ../goldens-knw.md # ptr+digest
  action: implement the write-decision router so each of the seven KNOW-4 cells routes per its frozen golden; no LLM in the route.
  action_surface: `[ read(knowledge/**), edit(knowledge/**), run(test:knowledge) ]`
  guardrails: writes confined to `knowledge/**`; no edits to other modules; edit-lint policy on; forbidden zones = `tools/**`, `index/**`, `ground/**`.
  repair_budget: `N=3 · early-stop: { repeated-identical-failure, no-change-diff, semantic-dup-edit }`
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-knw.md#SCN-KNOW-4a-1 # ptr+digest
- source: ../goldens-knw.md#SCN-KNOW-4b-1 # ptr+digest
- source: ../goldens-knw.md#SCN-KNOW-4c-1 # ptr+digest
- source: ../goldens-knw.md#SCN-KNOW-4d-1 # ptr+digest
- source: ../goldens-knw.md#SCN-KNOW-4e-1 # ptr+digest
- source: ../goldens-knw.md#SCN-KNOW-4f-1 # ptr+digest
- source: ../goldens-knw.md#SCN-KNOW-4g-1 # ptr+digest
  deps: [ ] parallel_group: [P] with sibling KNOW WPs (disjoint anchors)
  exit_predicate: all KNOW-4 acceptance SCNs green ∧ module gates (fmt/clippy/type) pass ∧ all pointer digests resolve (no `STALE`).
  context_refs: # closed list
- source: ../req-knw.md
- source: ../goldens-knw.md
- source: ../method-tags-knw.md
- source: ../invariant-register.md#INV-KNOW-4
  owner: KNOW territory (FORGE) · builder_id `<dispatch>`
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-KNOW-4

### WP-5.13-a.TOOLS — TOOLS slice of EPIC-13-a

epic: EPIC-13-a
id: WP-5.13-a.TOOLS
content*hash: <filled-at-freeze>
title: Templated writes — upserts not blind inserts
intent: >
*(non-authoritative handle)\_ the emit surface issues templated writes that upsert (not blind inserts), consuming the KNOW write-decision contract frozen upstream.
source_reqs: # ptr+digest

- source: ../req-tls.md#REQ-TOOLS-7c # ptr+digest
- source: ../req-tls.md#REQ-TOOLS-7d # ptr+digest
  seam-freezes: [ "write-decision/upsert contract consumed-from KNOW (frozen upstream, WP-5.13-a.KNOW)" ]
  anchor: `tools/` — the atlas-emit templated-write surface
  interface_contract: # ptr+digest
- source: ../method-tags-knw.md#KNOW-4 # ptr+digest
- source: ../method-tags-tls.md#TOOLS-7 # ptr+digest
  exclusions: the write-decision routing itself (owned by WP-5.13-a.KNOW); nodeKey/anchor identity (WP-5.13-b.KNOW); the five-tool governance surface & write-doors (out of CAMPAIGN-5, EPIC-26).
  inputs: # ptr+digest
- source: ../req-tls.md#REQ-TOOLS-7c # ptr+digest
- source: ../req-tls.md#REQ-TOOLS-7d # ptr+digest
- source: ../goldens-tls.md # ptr+digest
  action: wire the templated-write emit path to call the KNOW router (upsert), never a blind insert; satisfy the two TOOLS-7 goldens.
  action_surface: `[ read(tools/**), read(knowledge/**), edit(tools/**), run(test:tools) ]`
  guardrails: writes confined to `tools/**`; consumes `knowledge/**` read-only; no re-decision of the route; forbidden zones = `knowledge/**` (write).
  repair_budget: `N=3 · early-stop: { repeated-identical-failure, no-change-diff, semantic-dup-edit }`
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-tls.md#SCN-TOOLS-7c-1 # ptr+digest
- source: ../goldens-tls.md#SCN-TOOLS-7d-1 # ptr+digest
  deps: [ WP-5.13-a.KNOW ] parallel_group: (consumes its seam) · not [P] with its owner
  exit_predicate: SCN-TOOLS-7c/7d green ∧ module gates pass ∧ pointer digests resolve (no `STALE`).
  context_refs: # closed list
- source: ../req-tls.md
- source: ../goldens-tls.md
- source: ../method-tags-tls.md
- source: ../method-tags-knw.md#KNOW-4
  owner: TOOLS territory (FORGE) · builder_id `<dispatch>`
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-TOOLS-7

---

## EPIC-13-b — mechanical nodeKey & primary-anchor identity

### WP-5.13-b.KNOW — KNOW slice of EPIC-13-b

epic: EPIC-13-b
id: WP-5.13-b.KNOW
content*hash: <filled-at-freeze>
title: Anchor-identity facet — mechanical nodeKey & primaryAnchorId (no LLM in the write-decision)
intent: >
*(non-authoritative handle)\_ the write-decision is a pure function of three hashes; nodeKey and primaryAnchorId are computed mechanically (move-aware re-anchoring, secondary citations feed drift only, a `claimNorm`-collision report that is a signal not a write-time merge, slot from a closed vocabulary) with no LLM choosing an anchor.
source_reqs: # ptr+digest

- source: ../req-knw.md#REQ-KNOW-15a # ptr+digest
- source: ../req-knw.md#REQ-KNOW-15b # ptr+digest
- source: ../req-knw.md#REQ-KNOW-15c # ptr+digest
- source: ../req-knw.md#REQ-KNOW-15d # ptr+digest
- source: ../req-knw.md#REQ-KNOW-15e # ptr+digest
- source: ../req-knw.md#REQ-KNOW-15f # ptr+digest
- source: ../req-knw.md#REQ-KNOW-15g # ptr+digest
- source: ../req-knw.md#REQ-KNOW-15h # ptr+digest
- source: ../req-knw.md#REQ-KNOW-15i # ptr+digest
- source: ../req-knw.md#REQ-KNOW-15j # ptr+digest
  seam-freezes: [ ] (single-module epic; the UPDATE/union leg consumes KRN's FSPEC-merge as oracle — frozen upstream in CAMPAIGN-1, not a CAMPAIGN-5 seam)
  anchor: `knowledge/` — nodeKey/primaryAnchorId identity functions (reference site `knowledge/ref/router.ts` per method-tags-knw §KNOW-15)
  interface_contract: # ptr+digest
- source: ../method-tags-knw.md#KNOW-15 # ptr+digest
  exclusions: the create/update/supersede route selection (owned by WP-5.13-a.KNOW); template/scope lifecycle (WP-5.14.KNOW); KRN `FSPEC-merge` (frozen in CAMPAIGN-1, consumed as oracle only).
  inputs: # ptr+digest
- source: ../req-knw.md#REQ-KNOW-15a # ptr+digest
- source: ../req-knw.md#REQ-KNOW-15j # ptr+digest
- source: ../goldens-knw.md # ptr+digest
  action: implement nodeKey/primaryAnchorId as pure hash+symbol functions per each KNOW-15 golden cell; a `claimNorm` collision is **reported** (a deterministic signal) and the candidate mints its own node — no write-time merge; structural near-dup coverage is the derived-on-read `subsumes` relation (docs/design/dedup-identity.md).
  action_surface: `[ read(knowledge/**), edit(knowledge/**), run(test:knowledge) ]`
  guardrails: writes confined to `knowledge/**`; no LLM call in the identity path; forbidden zones = other module trees.
  repair_budget: `N=3 · early-stop: { repeated-identical-failure, no-change-diff, semantic-dup-edit }`
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-knw.md#SCN-KNOW-15a-1 # ptr+digest
- source: ../goldens-knw.md#SCN-KNOW-15b-1 # ptr+digest
- source: ../goldens-knw.md#SCN-KNOW-15c-1 # ptr+digest
- source: ../goldens-knw.md#SCN-KNOW-15d-1 # ptr+digest
- source: ../goldens-knw.md#SCN-KNOW-15e-1 # ptr+digest
- source: ../goldens-knw.md#SCN-KNOW-15f-1 # ptr+digest
- source: ../goldens-knw.md#SCN-KNOW-15f-2 # ptr+digest
- source: ../goldens-knw.md#SCN-KNOW-15g-1 # ptr+digest
- source: ../goldens-knw.md#SCN-KNOW-15h-1 # ptr+digest
- source: ../goldens-knw.md#SCN-KNOW-15h-2 # ptr+digest
- source: ../goldens-knw.md#SCN-KNOW-15i-1 # ptr+digest
- source: ../goldens-knw.md#SCN-KNOW-15j-1 # ptr+digest
  deps: [ ] parallel_group: [P] with sibling KNOW WPs (disjoint anchors)
  exit_predicate: all KNOW-15 acceptance SCNs green ∧ module gates pass ∧ pointer digests resolve (no `STALE`).
  context_refs: # closed list
- source: ../req-knw.md
- source: ../goldens-knw.md
- source: ../method-tags-knw.md
- source: ../invariant-register.md#INV-KNOW-15
  owner: KNOW territory (FORGE) · builder_id `<dispatch>`
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-KNOW-15

---

## EPIC-14 — fact lifecycle: lineage, template, scope

### WP-5.14.KNOW — KNOW slice of EPIC-14

epic: EPIC-14
id: WP-5.14.KNOW
content*hash: <filled-at-freeze>
title: Fact lifecycle — templated + scope-checked upserts, prior versions deduped in CAS
intent: >
*(non-authoritative handle)\_ no free prose and no lost fact-history: facts are templated (violation rejected), carry owner & scope (read universal, out-of-scope write rejected), prior versions live deduped in CAS, advisory keeps no lineage pointer while predicate supersede adds only a pointer, and the working store stays lean.
source_reqs: # ptr+digest

- source: ../req-knw.md#REQ-KNOW-10a # ptr+digest
- source: ../req-knw.md#REQ-KNOW-10b # ptr+digest
- source: ../req-knw.md#REQ-KNOW-11a # ptr+digest
- source: ../req-knw.md#REQ-KNOW-11b # ptr+digest
- source: ../req-knw.md#REQ-KNOW-11c # ptr+digest
- source: ../req-knw.md#REQ-KNOW-12a # ptr+digest
- source: ../req-knw.md#REQ-KNOW-12b # ptr+digest
- source: ../req-knw.md#REQ-KNOW-12c # ptr+digest
- source: ../req-knw.md#REQ-KNOW-12d # ptr+digest
- source: ../req-knw.md#REQ-KNOW-12e # ptr+digest
  seam-freezes: [ ] (single-module epic)
  anchor: `knowledge/` — template validator + scope guard + CAS lineage (reference site `knowledge/ref/template.ts` per method-tags-knw §KNOW-10)
  interface_contract: # ptr+digest
- source: ../method-tags-knw.md#KNOW-10 # ptr+digest
- source: ../method-tags-knw.md#KNOW-12 # ptr+digest
  exclusions: write-decision routing (WP-5.13-a.KNOW); nodeKey/anchor identity (WP-5.13-b.KNOW); tier ratification (WP-5.15.KNOW); the CAS store primitives themselves (frozen in CAMPAIGN-1).
  inputs: # ptr+digest
- source: ../req-knw.md#REQ-KNOW-10a # ptr+digest
- source: ../req-knw.md#REQ-KNOW-12e # ptr+digest
- source: ../goldens-knw.md # ptr+digest
  action: enforce template + owner/scope on write; persist prior versions deduped in CAS; wire lineage-pointer rules (advisory none, predicate supersede one) per each golden.
  action_surface: `[ read(knowledge/**), edit(knowledge/**), run(test:knowledge) ]`
  guardrails: writes confined to `knowledge/**`; no free-prose persistence; forbidden zones = other module trees.
  repair_budget: `N=3 · early-stop: { repeated-identical-failure, no-change-diff, semantic-dup-edit }`
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-knw.md#SCN-KNOW-10a-1 # ptr+digest
- source: ../goldens-knw.md#SCN-KNOW-10b-1 # ptr+digest
- source: ../goldens-knw.md#SCN-KNOW-10b-2 # ptr+digest
- source: ../goldens-knw.md#SCN-KNOW-11a-1 # ptr+digest
- source: ../goldens-knw.md#SCN-KNOW-11b-1 # ptr+digest
- source: ../goldens-knw.md#SCN-KNOW-11c-1 # ptr+digest
- source: ../goldens-knw.md#SCN-KNOW-12a-1 # ptr+digest
- source: ../goldens-knw.md#SCN-KNOW-12b-1 # ptr+digest
- source: ../goldens-knw.md#SCN-KNOW-12c-1 # ptr+digest
- source: ../goldens-knw.md#SCN-KNOW-12d-1 # ptr+digest
- source: ../goldens-knw.md#SCN-KNOW-12e-1 # ptr+digest
  deps: [ ] parallel_group: [P] with sibling KNOW WPs (disjoint anchors)
  exit_predicate: all KNOW-10/11/12 acceptance SCNs green ∧ module gates pass ∧ pointer digests resolve (no `STALE`).
  context_refs: # closed list
- source: ../req-knw.md
- source: ../goldens-knw.md
- source: ../method-tags-knw.md
- source: ../invariant-register.md#INV-KNOW-10
  owner: KNOW territory (FORGE) · builder_id `<dispatch>`
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-KNOW-12

---

## EPIC-15 — tier-routed ratification (T0 human-only)

### WP-5.15.KNOW — KNOW slice of EPIC-15

epic: EPIC-15
id: WP-5.15.KNOW
content*hash: <filled-at-freeze>
title: Tier-routed ratification — T0 human-only + billy, confidence fast-path for low-risk advisory
intent: >
*(non-authoritative handle)\_ truth is graduated by tier: init carries zero invariants, territories default T2/advisory, no T0 auto-promotion (heuristics only flag), explorer writes only candidates, ratification is the ratifier's, T0 requires billy, and a low-risk advisory takes the confidence fast-path while risky routes to full ratification.
source_reqs: # ptr+digest

- source: ../req-knw.md#REQ-KNOW-6a # ptr+digest
- source: ../req-knw.md#REQ-KNOW-6b # ptr+digest
- source: ../req-knw.md#REQ-KNOW-7a # ptr+digest
- source: ../req-knw.md#REQ-KNOW-7b # ptr+digest
- source: ../req-knw.md#REQ-KNOW-8a # ptr+digest
- source: ../req-knw.md#REQ-KNOW-8b # ptr+digest
- source: ../req-knw.md#REQ-KNOW-8c # ptr+digest
- source: ../req-knw.md#REQ-KNOW-18a # ptr+digest
- source: ../req-knw.md#REQ-KNOW-18b # ptr+digest
  seam-freezes: [ ] (single-module epic)
  anchor: `knowledge/` — the tier-routing/ratification gate (reference site per method-tags-knw §KNOW-6/7/8/18)
  interface_contract: # ptr+digest
- source: ../method-tags-knw.md#KNOW-8 # ptr+digest
- source: ../method-tags-knw.md#KNOW-18 # ptr+digest
  exclusions: the write-decision route (WP-5.13-a.KNOW); template/scope lifecycle (WP-5.14.KNOW); billy's security-gate internals (out of module); candidate-production moments (WP-5.17.KNOW).
  inputs: # ptr+digest
- source: ../req-knw.md#REQ-KNOW-6a # ptr+digest
- source: ../req-knw.md#REQ-KNOW-18b # ptr+digest
- source: ../goldens-knw.md # ptr+digest
  action: route ratification by tier; hold T0 for human + billy with no auto-promotion; apply the confidence fast-path only to low-risk advisory per each golden.
  action_surface: `[ read(knowledge/**), edit(knowledge/**), run(test:knowledge) ]`
  guardrails: writes confined to `knowledge/**`; no auto-promotion of T0; heuristics flag only; forbidden zones = other module trees.
  repair_budget: `N=3 · early-stop: { repeated-identical-failure, no-change-diff, semantic-dup-edit }`
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-knw.md#SCN-KNOW-6a-1 # ptr+digest
- source: ../goldens-knw.md#SCN-KNOW-6b-1 # ptr+digest
- source: ../goldens-knw.md#SCN-KNOW-7a-1 # ptr+digest
- source: ../goldens-knw.md#SCN-KNOW-7b-1 # ptr+digest
- source: ../goldens-knw.md#SCN-KNOW-8a-1 # ptr+digest
- source: ../goldens-knw.md#SCN-KNOW-8b-1 # ptr+digest
- source: ../goldens-knw.md#SCN-KNOW-8c-1 # ptr+digest
- source: ../goldens-knw.md#SCN-KNOW-18a-1 # ptr+digest
- source: ../goldens-knw.md#SCN-KNOW-18b-1 # ptr+digest
  deps: [ ] parallel_group: [P] with sibling KNOW WPs (disjoint anchors)
  exit_predicate: all KNOW-6/7/8/18 acceptance SCNs green ∧ module gates pass ∧ pointer digests resolve (no `STALE`).
  context_refs: # closed list
- source: ../req-knw.md
- source: ../goldens-knw.md
- source: ../method-tags-knw.md
- source: ../invariant-register.md#INV-KNOW-8
  owner: KNOW territory (FORGE) · builder_id `<dispatch>`
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-KNOW-8

---

## EPIC-16 — predicate check-engine (HOLDS/BROKEN/NA)

### WP-5.16.KNOW — KNOW slice of EPIC-16

epic: EPIC-16
id: WP-5.16.KNOW
content*hash: <filled-at-freeze>
title: Predicate check-engine — deterministic index-query, no code execution
intent: >
*(non-authoritative handle)\_ both fact families exist day-one; advisory stands alone without an evaluator; a checkable predicate is a deterministic index-query (no code execution/sandbox), a runtime check stays advisory, the evaluator is pure, and the HOLDS/BROKEN/NA verdict feeds the drift reconcile.
source_reqs: # ptr+digest

- source: ../req-knw.md#REQ-KNOW-9a # ptr+digest
- source: ../req-knw.md#REQ-KNOW-9b # ptr+digest
- source: ../req-knw.md#REQ-KNOW-16a # ptr+digest
- source: ../req-knw.md#REQ-KNOW-16b # ptr+digest
- source: ../req-knw.md#REQ-KNOW-16c # ptr+digest
- source: ../req-knw.md#REQ-KNOW-16d # ptr+digest
- source: ../req-knw.md#REQ-KNOW-16e # ptr+digest
  seam-freezes: [ ] (single-module epic)
  anchor: `knowledge/` — the pure predicate evaluator (reference site per method-tags-knw §KNOW-9/16)
  interface_contract: # ptr+digest
- source: ../method-tags-knw.md#KNOW-16 # ptr+digest
  exclusions: the drift reconcile itself (consumes the verdict, frozen in CAMPAIGN-4); code-execution/sandbox (explicitly excluded); write-decision routing (WP-5.13-a.KNOW).
  inputs: # ptr+digest
- source: ../req-knw.md#REQ-KNOW-9a # ptr+digest
- source: ../req-knw.md#REQ-KNOW-16e # ptr+digest
- source: ../goldens-knw.md # ptr+digest
  action: implement the pure evaluator as a deterministic index-query returning HOLDS/BROKEN/NA with no sandbox; keep runtime checks advisory per each golden.
  action_surface: `[ read(knowledge/**), read(index/**), edit(knowledge/**), run(test:knowledge) ]`
  guardrails: writes confined to `knowledge/**`; index read-only; no code execution path; forbidden zones = other module trees (write).
  repair_budget: `N=3 · early-stop: { repeated-identical-failure, no-change-diff, semantic-dup-edit }`
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-knw.md#SCN-KNOW-9a-1 # ptr+digest
- source: ../goldens-knw.md#SCN-KNOW-9b-1 # ptr+digest
- source: ../goldens-knw.md#SCN-KNOW-16a-1 # ptr+digest
- source: ../goldens-knw.md#SCN-KNOW-16b-1 # ptr+digest
- source: ../goldens-knw.md#SCN-KNOW-16c-1 # ptr+digest
- source: ../goldens-knw.md#SCN-KNOW-16d-1 # ptr+digest
- source: ../goldens-knw.md#SCN-KNOW-16e-1 # ptr+digest
  deps: [ ] parallel_group: [P] with sibling KNOW WPs (disjoint anchors)
  exit_predicate: all KNOW-9/16 acceptance SCNs green ∧ module gates pass ∧ pointer digests resolve (no `STALE`).
  context_refs: # closed list
- source: ../req-knw.md
- source: ../goldens-knw.md
- source: ../method-tags-knw.md
- source: ../invariant-register.md#INV-KNOW-16
  owner: KNOW territory (FORGE) · builder_id `<dispatch>`
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-KNOW-16

---

## EPIC-17 — production only at the governed moments

### WP-5.17.KNOW — KNOW slice of EPIC-17

epic: EPIC-17
id: WP-5.17.KNOW
content*hash: <filled-at-freeze>
title: Production-moments — writes fire only at the three moments; sealing wave fed-or-why-not
intent: >
*(non-authoritative handle)\_ knowledge is produced only at the three governed moments and never freelanced; a sealing wave must feed the atlas or emit a why-not.
source_reqs: # ptr+digest

- source: ../req-knw.md#REQ-KNOW-13a # ptr+digest
- source: ../req-knw.md#REQ-KNOW-13b # ptr+digest
  seam-freezes: [ "fed-or-why-not wave-close write contract owned-by KNOW, consumed-by TOOLS" ] (owner of the EPIC-17 KNOW→TOOLS obligation; not smeared into WP-5.17.TOOLS)
  anchor: `knowledge/` — the production-moment gate (reference site per method-tags-knw §KNOW-13)
  interface_contract: # ptr+digest
- source: ../method-tags-knw.md#KNOW-13 # ptr+digest
  exclusions: the wave-close write driver on the tool side (WP-5.17.TOOLS, consumes this seam); ratification routing (WP-5.15.KNOW); write-decision route (WP-5.13-a.KNOW).
  inputs: # ptr+digest
- source: ../req-knw.md#REQ-KNOW-13a # ptr+digest
- source: ../req-knw.md#REQ-KNOW-13b # ptr+digest
- source: ../goldens-knw.md # ptr+digest
  action: gate production to the three moments; define the fed-or-why-not obligation for a sealing wave per each golden.
  action_surface: `[ read(knowledge/**), edit(knowledge/**), run(test:knowledge) ]`
  guardrails: writes confined to `knowledge/**`; production only at the frozen moments; forbidden zones = other module trees.
  repair_budget: `N=3 · early-stop: { repeated-identical-failure, no-change-diff, semantic-dup-edit }`
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-knw.md#SCN-KNOW-13a-1 # ptr+digest
- source: ../goldens-knw.md#SCN-KNOW-13b-1 # ptr+digest
  deps: [ ] parallel_group: [P] with sibling KNOW WPs (disjoint anchors)
  exit_predicate: SCN-KNOW-13a/13b green ∧ module gates pass ∧ pointer digests resolve (no `STALE`).
  context_refs: # closed list
- source: ../req-knw.md
- source: ../goldens-knw.md
- source: ../method-tags-knw.md
- source: ../invariant-register.md#INV-KNOW-13
  owner: KNOW territory (FORGE) · builder_id `<dispatch>`
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-KNOW-13

### WP-5.17.TOOLS — TOOLS slice of EPIC-17

epic: EPIC-17
id: WP-5.17.TOOLS
content*hash: <filled-at-freeze>
title: Wave-close write driven by absorb — sealing wave must feed or emit why-not
intent: >
*(non-authoritative handle)\_ the wave-close write is driven by absorb; a sealing wave must feed the atlas or emit a why-not, and the probe records a fed-or-why-not violation otherwise.
disposition: delegated-to-orchestra / out-of-atlas-core
ownership_note: ResultCard and wave-close driver are Orchestra-owned; Atlas keeps the opaque EmitApi.absorb seam and does not invent payload/driver.
source_reqs: # ptr+digest

- source: ../req-tls.md#REQ-TOOLS-9a # ptr+digest
- source: ../req-tls.md#REQ-TOOLS-9b # ptr+digest
  seam-freezes: [ "fed-or-why-not wave-close write contract consumed-from KNOW (frozen upstream, WP-5.17.KNOW)" ]
  anchor: `tools/` — opaque EmitApi.absorb seam; Orchestra-owned ResultCard and wave-close driver
  interface_contract: # ptr+digest
- source: ../method-tags-knw.md#KNOW-13 # ptr+digest
- source: ../method-tags-tls.md#TOOLS-9 # ptr+digest
  exclusions: the production-moment gate & fed-or-why-not definition (owned by WP-5.17.KNOW); calibration/injection surfaces (out of CAMPAIGN-5).
  inputs: # ptr+digest
- source: ../req-tls.md#REQ-TOOLS-9a # ptr+digest
- source: ../req-tls.md#REQ-TOOLS-9b # ptr+digest
- source: ../goldens-tls.md # ptr+digest
  action: preserve opaque EmitApi.absorb seam for the Orchestra-owned ResultCard and wave-close driver; do not invent payload/driver. REQ/SCN pointers are integration acceptance only, not Atlas production-code evidence.
  action_surface: `[ read(tools/**), read(knowledge/**), edit(tools/**), run(test:tools) ]`
  guardrails: writes confined to `tools/**`; consumes the KNOW fed-or-why-not contract read-only; no re-decision of the moments; forbidden zones = `knowledge/**` (write).
  repair_budget: `N=3 · early-stop: { repeated-identical-failure, no-change-diff, semantic-dup-edit }`
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-tls.md#SCN-TOOLS-9a-1 # ptr+digest
- source: ../goldens-tls.md#SCN-TOOLS-9b-1 # ptr+digest
  deps: [ WP-5.17.KNOW ] parallel_group: (consumes its seam) · not [P] with its owner
  exit_predicate: SCN-TOOLS-9a/9b green ∧ module gates pass ∧ pointer digests resolve (no `STALE`).
  context_refs: # closed list
- source: ../req-tls.md
- source: ../goldens-tls.md
- source: ../method-tags-tls.md
- source: ../method-tags-knw.md#KNOW-13
  owner: Orchestra (delegated; out-of-atlas-core) · builder_id `<dispatch>`
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-TOOLS-9

---

## Partition ledger (self-check)

- **REQ→WP total function** — 49 REQs, each owned by exactly one WP (orphans = 0, doubles = 0):
  - WP-5.13-a.KNOW = KNOW-4a,4b,4c,4d,4e,4f,4g (7)
  - WP-5.13-a.TOOLS = TOOLS-7c,7d (2)
  - WP-5.13-b.KNOW = KNOW-15a,15b,15c,15d,15e,15f,15g,15h,15i,15j (10)
  - WP-5.14.KNOW = KNOW-10a,10b,11a,11b,11c,12a,12b,12c,12d,12e (10)
  - WP-5.15.KNOW = KNOW-6a,6b,7a,7b,8a,8b,8c,18a,18b (9)
  - WP-5.16.KNOW = KNOW-9a,9b,16a,16b,16c,16d,16e (7)
  - WP-5.17.KNOW = KNOW-13a,13b (2)
  - WP-5.17.TOOLS = TOOLS-9a,9b (2)
  - **sum = 49** ✓ (matches roadmap CAMPAIGN-5 req union)
- **seam-freezes (single upstream owner each, never smeared):**
  - `write-decision/upsert contract` — owned-by KNOW (WP-5.13-a.KNOW), consumed-by TOOLS (WP-5.13-a.TOOLS)
  - `fed-or-why-not wave-close write contract` — owned-by KNOW (WP-5.17.KNOW), consumed-by TOOLS (WP-5.17.TOOLS)
    </content>
    </invoke>
