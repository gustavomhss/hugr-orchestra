# Work Packages — CAMPAIGN-4 (state S4)

> Grounding & the truth-gate. One WP-card per (epic × module), conforming to `method/wp-template.md`.
> Every substantive field is a `ptr+digest` (the digest is tooling-filled at freeze — the `# ptr+digest`
> marker flags it; no hash is fabricated here). `intent` is the one non-authoritative prose carve-out.
> `exec` fields (`outputs`/`provenance`/`trace_ref`) are present-but-empty at S4-freeze.
> Modules in this campaign: GROUND · KNOW · INDEX · TOOLS.

---

## EPIC-10 — subtreeHash freshness oracle (10-a) · transitive freshness (10-b)

### WP-4.10-a.GROUND — grounding slice of EPIC-10-a

epic: EPIC-10-a
id: WP-4.10-a.GROUND
content_hash: <filled-at-freeze>
title: subtreeHash local drift-oracle in the grounding gate
intent: >
Make the grounding gate compute and read each entry's `subtreeHash` (via the kernel encoder seam) as the sole drift oracle — displayLines/line-ranges never anchor, ungrounded is never FRESH, an unresolvable citation grounds the whole fact to nothing and reads DRIFTED without throwing, a real change drifts and an edit that does not touch the cited unit does not. (non-authoritative handle)
source_reqs: # ptr+digest

- source: ../req-grd.md#REQ-GROUND-1a # ptr+digest
- source: ../req-grd.md#REQ-GROUND-1b # ptr+digest
- source: ../req-grd.md#REQ-GROUND-1c # ptr+digest
- source: ../req-grd.md#REQ-GROUND-2a # ptr+digest
- source: ../req-grd.md#REQ-GROUND-2b # ptr+digest
- source: ../req-grd.md#REQ-GROUND-3a # ptr+digest
- source: ../req-grd.md#REQ-GROUND-3b # ptr+digest
- source: ../req-grd.md#REQ-GROUND-3c # ptr+digest
- source: ../req-grd.md#REQ-GROUND-5a # ptr+digest
- source: ../req-grd.md#REQ-GROUND-5b # ptr+digest
- source: ../req-grd.md#REQ-GROUND-10a # ptr+digest
- source: ../req-grd.md#REQ-GROUND-10b # ptr+digest
  seam-freezes: [ "grounding drift-oracle semantics owned-by GROUND, consumed-by INDEX", "grounding drift-oracle semantics owned-by GROUND, consumed-by KNOW", "subtreeHash CAS-object identity consumed-from INDEX (owned-by INDEX, WP-4.10-a.INDEX)" ]
  anchor: packages/grounding/src/ — `ground()`, `driftDetect()`, `subtreeHash` computation call-site (routes through the `@atlas/kernel` encoder seam)
  interface_contract: # ptr+digest
- source: ../../reference/atlas-grounding.md#ground-1 # ptr+digest
- source: ../../reference/atlas-grounding.md#ground-2 # ptr+digest
- source: ../../reference/atlas-grounding.md#ground-3 # ptr+digest
- source: ../../reference/atlas-grounding.md#ground-10 # ptr+digest
  exclusions: forward-closure/transitive freshness (owned by WP-4.10-b.GROUND); the truth-gate `gateHolds` admission (EPIC-11); the KERNEL encoder implementation (frozen upstream, CAMPAIGN-1); the per-object BLAKE3-CAS identity itself (owned by WP-4.10-a.INDEX)
  inputs: # ptr+digest
- source: ../req-idx.md#REQ-INDEX-11a # ptr+digest
  action: implement the drift oracle exactly to the four referenced GROUND clauses; compute subtreeHash only through the kernel encoder seam; make resolution total (no throw); verify against the referenced goldens.
  action_surface: [ edit packages/grounding/**, run grounding unit+PBT suite, run goldens harness ]
  guardrails: no edits outside packages/grounding/\*\*; no locally-inlined hash call (GROUND-10b); no new decisions beyond the referenced clauses; edit-lint clean.
  repair_budget: N=3; early-stop on repeated-identical failure, no-change loop, or semantic-dup patch.
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-grd.md#SCN-GROUND-1a-1 # ptr+digest
- source: ../goldens-grd.md#SCN-GROUND-1b-1 # ptr+digest
- source: ../goldens-grd.md#SCN-GROUND-1c-1 # ptr+digest
- source: ../goldens-grd.md#SCN-GROUND-2a-1 # ptr+digest
- source: ../goldens-grd.md#SCN-GROUND-2b-1 # ptr+digest
- source: ../goldens-grd.md#SCN-GROUND-3a-1 # ptr+digest
- source: ../goldens-grd.md#SCN-GROUND-3b-1 # ptr+digest
- source: ../goldens-grd.md#SCN-GROUND-3c-1 # ptr+digest
- source: ../goldens-grd.md#SCN-GROUND-5a-1 # ptr+digest
- source: ../goldens-grd.md#SCN-GROUND-5b-1 # ptr+digest
- source: ../goldens-grd.md#SCN-GROUND-10a-1 # ptr+digest
- source: ../goldens-grd.md#SCN-GROUND-10b-1 # ptr+digest
  deps: [ ] parallel_group: [P] with WP-4.10-a.INDEX (owner side of the CAS-identity seam)
  exit_predicate: all listed acceptance goldens green ∧ grounding gates (fmt/lint/PBT) pass ∧ no throw on unresolvable citation.
  context_refs: # closed list
- source: ../../reference/atlas-grounding.md#ground-1
- source: ../../reference/atlas-grounding.md#ground-2
- source: ../../reference/atlas-grounding.md#ground-3
- source: ../../reference/atlas-grounding.md#ground-5
- source: ../../reference/atlas-grounding.md#ground-10
  owner: seat-grounding
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-GROUND-1

### WP-4.10-a.KNOW — knowledge slice of EPIC-10-a

epic: EPIC-10-a
id: WP-4.10-a.KNOW
content_hash: <filled-at-freeze>
title: knowledge drift oracle binds to the grounding subtreeHash
intent: >
Bind the knowledge module's drift verdict to GROUND's subtreeHash oracle — an edit that does not touch the cited unit stays FRESH, a real change to it DRIFTs (as does a reformat of it, and a rename of it). Consumes the oracle; does not redefine it. (non-authoritative handle)
source_reqs: # ptr+digest

- source: ../req-knw.md#REQ-KNOW-3a # ptr+digest
- source: ../req-knw.md#REQ-KNOW-3b # ptr+digest
- source: ../req-knw.md#REQ-KNOW-3c # ptr+digest
  seam-freezes: [ "grounding drift-oracle semantics consumed-from GROUND (owned-by GROUND, WP-4.10-a.GROUND)" ]
  anchor: packages/knowledge/src/ — drift-verdict binding site that reads the grounding oracle
  interface_contract: # ptr+digest
- source: ../../reference/atlas-grounding.md#ground-1 # ptr+digest
- source: ../../reference/atlas-knowledge.md#know-3 # ptr+digest
  exclusions: defining or computing subtreeHash (owned by WP-4.10-a.GROUND); the write-decision/upsert (EPIC-13, CAMPAIGN-5); the drift mechanical/semantic split (EPIC-12).
  inputs: # ptr+digest
- source: ../req-grd.md#REQ-GROUND-1a # ptr+digest
  action: wire the KNOW drift verdict to the GROUND oracle; do not re-implement hashing; verify against the referenced goldens.
  action_surface: [ edit packages/knowledge/**, run knowledge exhaustive suite, run goldens harness ]
  guardrails: no edits outside packages/knowledge/\*\*; no second copy of the oracle; consume-only across the seam; edit-lint clean.
  repair_budget: N=3; early-stop on repeated-identical failure, no-change loop, or semantic-dup patch.
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-knw.md#SCN-KNOW-3a-1 # ptr+digest
- source: ../goldens-knw.md#SCN-KNOW-3b-1 # ptr+digest
- source: ../goldens-knw.md#SCN-KNOW-3c-1 # ptr+digest
  deps: [ WP-4.10-a.GROUND ]
  exit_predicate: all listed acceptance goldens green ∧ knowledge gates pass ∧ oracle consumed via the frozen seam (no local hash).
  context_refs: # closed list
- source: ../../reference/atlas-knowledge.md#know-3
- source: ../../reference/atlas-grounding.md#ground-1
  owner: seat-knowledge
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-KNOW-3

### WP-4.10-a.INDEX — index slice of EPIC-10-a

epic: EPIC-10-a
id: WP-4.10-a.INDEX
content_hash: <filled-at-freeze>
title: every Atlas object is a BLAKE3-CAS object, grounded & drift-checked
intent: >
Make every Atlas object — code, knowledge, memory, provenance, transcripts and docs — a BLAKE3-keyed CAS object, and ground+drift-check each like any fact (consuming GROUND's oracle for the drift-check). (non-authoritative handle)
source_reqs: # ptr+digest

- source: ../req-idx.md#REQ-INDEX-11a # ptr+digest
- source: ../req-idx.md#REQ-INDEX-11b # ptr+digest
  seam-freezes: [ "subtreeHash CAS-object identity owned-by INDEX, consumed-by GROUND", "grounding drift-oracle semantics consumed-from GROUND (owned-by GROUND, WP-4.10-a.GROUND)" ]
  anchor: packages/index/src/ — CAS-object registration (BLAKE3 key) + per-object grounded/drift-checked flagging
  interface_contract: # ptr+digest
- source: ../../reference/atlas-index.md#index-11 # ptr+digest
- source: ../../reference/atlas-grounding.md#ground-1 # ptr+digest
  exclusions: the drift-oracle FRESH/DRIFTED semantics (owned by WP-4.10-a.GROUND); structural rollup/rState (EPIC-7, CAMPAIGN-2); the transitive closure fold (EPIC-10-b).
  inputs: # ptr+digest
- source: ../req-grd.md#REQ-GROUND-1a # ptr+digest
  action: register every Atlas object under a BLAKE3-CAS key; route drift-check of each object through GROUND's oracle; verify against the referenced goldens.
  action_surface: [ edit packages/index/**, run index unit suite, run goldens harness ]
  guardrails: no edits outside packages/index/\*\*; do not redefine the drift oracle; edit-lint clean.
  repair_budget: N=3; early-stop on repeated-identical failure, no-change loop, or semantic-dup patch.
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-idx.md#SCN-INDEX-11a-1 # ptr+digest
- source: ../goldens-idx.md#SCN-INDEX-11b-1 # ptr+digest
  deps: [ WP-4.10-a.GROUND ] parallel_group: [P] with WP-4.10-a.GROUND on 11a (CAS-identity is the owner side)
  exit_predicate: all listed acceptance goldens green ∧ index gates pass ∧ every object BLAKE3-CAS keyed ∧ drift-check delegates to the GROUND oracle.
  context_refs: # closed list
- source: ../../reference/atlas-index.md#index-11
- source: ../../reference/atlas-grounding.md#ground-1
  owner: seat-index
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-INDEX-11

### WP-4.10-b.GROUND — grounding slice of EPIC-10-b

epic: EPIC-10-b
id: WP-4.10-b.GROUND
content_hash: <filled-at-freeze>
title: transitive freshness folds own hash + closure interface (never callee body)
intent: >
Fold a fact's freshness from both its own grounding-set subtreeHash and its forward-closure's interface/signature-level rState — a callee contract change drifts callers, a pure-body refactor does not, and freshness is phrased as structural-unchange, never "the claim is true." (non-authoritative handle)
source_reqs: # ptr+digest

- source: ../req-grd.md#REQ-GROUND-11a # ptr+digest
- source: ../req-grd.md#REQ-GROUND-11b # ptr+digest
- source: ../req-grd.md#REQ-GROUND-11c # ptr+digest
- source: ../req-grd.md#REQ-GROUND-11d # ptr+digest
- source: ../req-grd.md#REQ-GROUND-11e # ptr+digest
- source: ../req-grd.md#REQ-GROUND-11f # ptr+digest
  seam-freezes: [ "forward-closure interface/signature-level rState consumed-from INDEX-12 (frozen upstream, CAMPAIGN-2)" ]
  anchor: packages/grounding/src/ — the freshness-fold over (own grounding-set subtreeHash ⊕ forward-closure interface rState on the INDEX-12 dependency axis)
  interface_contract: # ptr+digest
- source: ../../reference/atlas-grounding.md#ground-11 # ptr+digest
- source: ../../reference/atlas-index.md#index-12 # ptr+digest
  exclusions: the local single-entry drift oracle (owned by WP-4.10-a.GROUND); computing INDEX-12 rState (frozen upstream, CAMPAIGN-2); the truth-gate admission (EPIC-11).
  inputs: # ptr+digest
- source: ../req-idx.md#REQ-INDEX-12a # ptr+digest
- source: ../req-grd.md#REQ-GROUND-1a # ptr+digest
  action: implement the two-part freshness fold to the six GROUND-11 clauses; fold interface-level rState only, never callee full-body subtreeHash; phrase freshness as structural-unchange; verify against the referenced goldens.
  action_surface: [ edit packages/grounding/**, run grounding PBT+unit suite, run goldens harness ]
  guardrails: no edits outside packages/grounding/\*\*; never fold a callee's full-body hash (11b); no truth-assertion phrasing (11e); edit-lint clean.
  repair_budget: N=3; early-stop on repeated-identical failure, no-change loop, or semantic-dup patch.
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-grd.md#SCN-GROUND-11a-1 # ptr+digest
- source: ../goldens-grd.md#SCN-GROUND-11b-1 # ptr+digest
- source: ../goldens-grd.md#SCN-GROUND-11c-1 # ptr+digest
- source: ../goldens-grd.md#SCN-GROUND-11d-1 # ptr+digest
- source: ../goldens-grd.md#SCN-GROUND-11e-1 # ptr+digest
- source: ../goldens-grd.md#SCN-GROUND-11f-1 # ptr+digest
  deps: [ WP-4.10-a.GROUND ]
  exit_predicate: all listed acceptance goldens green ∧ grounding gates pass ∧ contract-change-drifts-callers / body-refactor-does-not both hold.
  context_refs: # closed list
- source: ../../reference/atlas-grounding.md#ground-11
- source: ../../reference/atlas-index.md#index-12
  owner: seat-grounding
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-GROUND-11

### WP-4.10-d.GROUND — the SPAN amendment (owner-approved 2026-08-02)

epic: EPIC-10-a
id: WP-4.10-d.GROUND
content_hash: <filled-at-freeze>
title: a grounding entry carries a SPAN into content-addressed bytes — explicitly not a copied quote
intent: >
Give the "where inside the cited unit" leg a carrier. A grounding entry gains an OPTIONAL `span` = `{contentHash, start, end}`: the digest of the byte sequence plus a byte range into it, and NO copy of the text. A quote is a second, unversioned copy of the source — it drifts silently and nothing can check it was ever there; a span RE-DERIVES (re-read the bytes, verify the digest, slice). Additive and absent-tolerant on the `builtAt`/`sameAs`/`derivedAt` precedent; inert on the drift rail, so GROUND-1/GROUND-2 are untouched. (non-authoritative handle)
source_reqs: # ptr+digest

- source: ../req-grd.md#REQ-GROUND-1d # ptr+digest
- source: ../req-grd.md#REQ-GROUND-1e # ptr+digest
- source: ../req-grd.md#REQ-GROUND-1f # ptr+digest
- source: ../req-grd.md#REQ-GROUND-1g # ptr+digest
  seam-freezes: [ "the grounding receipt shape owned-by GROUND, consumed-by KNOW (additive optional field — no consumer edit required)", "the `Encoder` digest seam consumed-from KERNEL (GROUND-10 / KERNEL-2a)" ]
  anchor: packages/grounding/src/span.ts (`bindSpan` — `mintSpan`/`readSpan`) + `src/types.ts` (`GroundingSpan`, `GroundingEntry.span?`); `packages/adapter-io/src/prompt.ts` (`PromptFactory.evidenceSpan`) is the MINTER — and it is NOT REACHED: it has zero production callers (task #159, measured below), so this card lands the carrier and NOT the carriage.
  interface_contract: # ptr+digest
- source: ../../reference/atlas-grounding.md#ground-1 # ptr+digest
- source: ../../reference/atlas-grounding.md#ground-2 # ptr+digest
- source: ../../reference/atlas-grounding.md#ground-10 # ptr+digest
  exclusions: the drift oracle itself (unchanged — WP-4.10-a.GROUND); narrowing the span below FILE granularity (needs the AST slicing seam, not this card); attaching the span to the mined receipt in `cli/src/mine.ts` (a different seat owns that file — reported, not done); folding `span` into the canonical preimage (a KERNEL-8 amendment, explicitly NOT claimed).
  inputs: # ptr+digest
- source: ../req-krn.md#REQ-KERNEL-8a # ptr+digest
  action: add the `span` carrier to the frozen receipt as an OPTIONAL field; implement mint/read over the INJECTED `Encoder` seam, total and fail-closed; keep drift/grounding verdicts invariant under every span edit; mint the production span from bytes ATLAS read, never from the model's answer.
  action_surface: [ edit packages/grounding/**, edit packages/adapter-io/src/prompt.ts, run grounding + adapter-io suites, run the gate set ]
  guardrails: no new type parallel to `Grounding`/`GroundingEntry`/`StructRef`/`Hash`/`SubtreeHash`; no stored text anywhere in the receipt; no `{{SPAN}}` slot and no "state which lines you used" clause in `prompts/propose.md` (the prompt digest MUST NOT change — a proposer-supplied span reinstates the exact self-certification ADR-0011 removed); GROUND-2 keeps holding.
  repair_budget: N=3; early-stop on repeated-identical failure, no-change loop, or semantic-dup patch.
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-grd.md#SCN-GROUND-1d-1 # ptr+digest
- source: ../goldens-grd.md#SCN-GROUND-1e-1 # ptr+digest
- source: ../goldens-grd.md#SCN-GROUND-1f-1 # ptr+digest
- source: ../goldens-grd.md#SCN-GROUND-1g-1 # ptr+digest
- source: ../goldens-grd.md#SCN-GROUND-1g-2 # ptr+digest
  deps: [ WP-4.10-a.GROUND ] parallel_group: [S] — serial after the drift oracle it must stay inert on
  exit_predicate: all listed acceptance goldens green ∧ `isGrounded`/`driftDetect` verdicts provably invariant under add/remove/corrupt of a span ∧ the shipped prompt artifact's digest unchanged ∧ the KERNEL-8 tamper limit MEASURED and recorded on REQ-GROUND-1f rather than implied away.
  context_refs: # closed list
- source: ../../reference/atlas-grounding.md#ground-1
- source: ../../reference/atlas-grounding.md#ground-2
- source: ../../reference/atlas-grounding.md#ground-10
- source: ../../reference/atlas-kernel.md#kernel-8
  owner: seat-grounding
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-GROUND-1

---

> **REACH, MEASURED THROUGH THE BUILT BINARY — the span does NOT arrive in a durable fact (task #159, 2026-08-03).**
> `atlas mine` was run from `packages/cli/dist/src/bin.js` on a real git repository with a real
> `.atlas/index.scip` and a real operator-configured `roles.propose` command: exit 0, `llmCalls 2`,
> `seeded 2`, two facts persisted to `.atlas/cas/`. Every stored grounding entry is `{anchor, path}`; the
> string `span` occurs **0 times** anywhere under `.atlas/`. Three independent reasons, all structural — this
> is not a missing one-liner:
>
> 1. `PromptFactory.evidenceSpan` has ZERO production callers. `cli/src/mine-proposer.ts:57-63` builds the
>    factory and consumes `.build` and `.digest` only; `ResolvedProposer` has no field to carry a span, so
>    the minted span is discarded at the point of creation.
> 2. The receipt is not built there at all. `cli/src/mine-gate.ts` `makeAdmitGate` takes its grounding from
>    `reground` → `adapter-io/src/compose-mine-admission.ts` → `grounding/src/ground.ts` `ground(node, axes)`,
>    which resolves anchors against the INDEX AXES and never reads a byte of source. `GroundableUnit.citations`
>    has no `span` field, so there is no seam through which a span could enter a receipt.
> 3. Even wired, it would store nothing today: every site the shipped frontier emits is `kind: 'file'`
>    (`genesis/src/seeds.ts:145` hard-codes it; the probe run's two sites both reported `"kind":"file"`), and
>    the per-`kind` rule this card states requires the span to be ABSENT for `file`.
>
> **CONSEQUENCE FOR SEQUENCING, reported not acted on:** (3) means #159 cannot be _proven reached_ before
> #182 lands symbol-granular sites, because the only anchor kind that exists today is the one kind for which
> the contract forbids a span. The carrier is nonetheless the right thing to land first — #182 needs the
> shape and needs the UTF-16→byte conversion obligation (`GroundingSpan` docstring) written down before it
> mints its first interior offset. Wiring the carriage is a change to what a mined fact STORES and is left
> to the owner of that path.

## EPIC-11 — truth-gate (11-a) · admission, obviousness scored (11-b)

### WP-4.11-a.GROUND — grounding slice of EPIC-11-a

epic: EPIC-11-a
id: WP-4.11-a.GROUND
content_hash: <filled-at-freeze>
title: truth-gate — grounded ∧ FRESH, fail-closed at emit, no free-prose fact
intent: >
Enforce the truth-gate through `gateHolds` on the grounded∧FRESH inputs (GROUND-2/3/5); at `emit`, ungrounded and free-prose facts fail closed and never persist. This WP owns the truth-gate contract consumed by KNOW and TOOLS. (non-authoritative handle)
source_reqs: # ptr+digest

- source: ../req-grd.md#REQ-GROUND-4 # ptr+digest
- source: ../req-grd.md#REQ-GROUND-6 # ptr+digest
- source: ../req-grd.md#REQ-GROUND-9 # ptr+digest
  seam-freezes: [ "truth-gate contract (grounded ∧ FRESH, fail-closed at emit) owned-by GROUND, consumed-by KNOW", "truth-gate contract (grounded ∧ FRESH, fail-closed at emit) owned-by GROUND, consumed-by TOOLS" ]
  anchor: packages/grounding/src/ — `gateHolds` (gates on GROUND-2/3/5 grounded∧FRESH) + the fail-closed emit guard
  interface_contract: # ptr+digest
- source: ../../reference/atlas-grounding.md#ground-4 # ptr+digest
- source: ../../reference/atlas-grounding.md#ground-6 # ptr+digest
- source: ../../reference/atlas-grounding.md#ground-9 # ptr+digest
  exclusions: the harm door / admission composition (owned by WP-4.11-b.GROUND); atlas-emit re-derivation surface (owned by WP-4.11-a.TOOLS); the HOLDS→NA downgrade and missing-field/over-cap reject guards (flagged [NEEDS RECONCILIATION] in req-grd.md, not yet a REQ — out of scope until lifted).
  inputs: # ptr+digest
- source: ../req-grd.md#REQ-GROUND-2a # ptr+digest
- source: ../req-grd.md#REQ-GROUND-5a # ptr+digest
  action: implement `gateHolds` to gate strictly on grounded∧FRESH; make emit fail-closed for ungrounded and free-prose facts; verify against the referenced goldens.
  action_surface: [ edit packages/grounding/**, run grounding PBT+unit suite, run goldens harness ]
  guardrails: no edits outside packages/grounding/\*\*; fail-closed default (never fail-open); no new admission decisions beyond the referenced clauses; edit-lint clean.
  repair_budget: N=3; early-stop on repeated-identical failure, no-change loop, or semantic-dup patch.
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-grd.md#SCN-GROUND-4-1 # ptr+digest
- source: ../goldens-grd.md#SCN-GROUND-4-2 # ptr+digest
- source: ../goldens-grd.md#SCN-GROUND-4-3 # ptr+digest
- source: ../goldens-grd.md#SCN-GROUND-6-1 # ptr+digest
- source: ../goldens-grd.md#SCN-GROUND-9-1 # ptr+digest
- source: ../goldens-grd.md#SCN-GROUND-9-2 # ptr+digest
  deps: [ WP-4.10-a.GROUND ]
  exit_predicate: all listed acceptance goldens green ∧ grounding gates pass ∧ ungrounded/free-prose emit fails closed with nothing persisted.
  context_refs: # closed list
- source: ../../reference/atlas-grounding.md#ground-4
- source: ../../reference/atlas-grounding.md#ground-6
- source: ../../reference/atlas-grounding.md#ground-9
  owner: seat-grounding
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-GROUND-4

### WP-4.11-a.KNOW — knowledge slice of EPIC-11-a

epic: EPIC-11-a
id: WP-4.11-a.KNOW
content_hash: <filled-at-freeze>
title: truth never self-declared; ungrounded facts fail closed
intent: >
In the knowledge store, a fact never self-declares true and an ungrounded fact does not enter — consuming GROUND's truth-gate contract. (non-authoritative handle)
source_reqs: # ptr+digest

- source: ../req-knw.md#REQ-KNOW-1 # ptr+digest
- source: ../req-knw.md#REQ-KNOW-2 # ptr+digest
  seam-freezes: [ "truth-gate contract consumed-from GROUND (owned-by GROUND, WP-4.11-a.GROUND)" ]
  anchor: packages/knowledge/src/ — store admission path that defers to the grounding truth-gate
  interface_contract: # ptr+digest
- source: ../../reference/atlas-grounding.md#ground-4 # ptr+digest
- source: ../../reference/atlas-knowledge.md#know-1 # ptr+digest
- source: ../../reference/atlas-knowledge.md#know-2 # ptr+digest
  exclusions: defining `gateHolds`/emit fail-closed (owned by WP-4.11-a.GROUND); the harm door + obviousness score (EPIC-11-b); the write-decision routing (CAMPAIGN-5).
  inputs: # ptr+digest
- source: ../req-grd.md#REQ-GROUND-4 # ptr+digest
  action: make store admission reject self-declared-truth and ungrounded facts by deferring to the grounding gate; verify against the referenced goldens.
  action_surface: [ edit packages/knowledge/**, run knowledge exhaustive suite, run goldens harness ]
  guardrails: no edits outside packages/knowledge/\*\*; no second copy of the gate; consume-only; edit-lint clean.
  repair_budget: N=3; early-stop on repeated-identical failure, no-change loop, or semantic-dup patch.
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-knw.md#SCN-KNOW-1-1 # ptr+digest
- source: ../goldens-knw.md#SCN-KNOW-2-1 # ptr+digest
  deps: [ WP-4.11-a.GROUND ]
  exit_predicate: all listed acceptance goldens green ∧ knowledge gates pass ∧ self-declared/ungrounded facts rejected via the frozen gate.
  context_refs: # closed list
- source: ../../reference/atlas-knowledge.md#know-1
- source: ../../reference/atlas-knowledge.md#know-2
- source: ../../reference/atlas-grounding.md#ground-4
  owner: seat-knowledge
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-KNOW-1

### WP-4.11-a.TOOLS — tools slice of EPIC-11-a

epic: EPIC-11-a
id: WP-4.11-a.TOOLS
content_hash: <filled-at-freeze>
title: atlas-emit re-derives citation at source@sha, rejects a node that does not re-derive
intent: >
`atlas-emit` re-derives each citation at `source@sha` and rejects a node whose grounding does not re-derive (`emitted:false`, nothing persisted) — the emit-surface consumer of GROUND's truth-gate. (non-authoritative handle)
source_reqs: # ptr+digest

- source: ../req-tls.md#REQ-TOOLS-7a # ptr+digest
- source: ../req-tls.md#REQ-TOOLS-7b # ptr+digest
  seam-freezes: [ "truth-gate contract consumed-from GROUND (owned-by GROUND, WP-4.11-a.GROUND)" ]
  anchor: packages/tools/src/ — `atlas-emit` re-derivation + fail-closed reject path
  interface_contract: # ptr+digest
- source: ../../reference/atlas-tools.md#tools-7 # ptr+digest
- source: ../../reference/atlas-grounding.md#ground-6 # ptr+digest
  exclusions: templated/upsert write semantics TOOLS-7c/7d (EPIC-13, CAMPAIGN-5); the five-tool governance surface (EPIC-26, CAMPAIGN-7); defining `gateHolds` (owned by WP-4.11-a.GROUND).
  inputs: # ptr+digest
- source: ../req-grd.md#REQ-GROUND-6 # ptr+digest
  action: implement the atlas-emit re-derive-at-source@sha check and reject-non-rederiving path (`emitted:false`, persist nothing); verify against the referenced goldens.
  action_surface: [ edit packages/tools/**, run tools unit suite, run goldens harness ]
  guardrails: no edits outside packages/tools/\*\*; only-write-path stays atlas-emit; fail-closed reject; edit-lint clean.
  repair_budget: N=3; early-stop on repeated-identical failure, no-change loop, or semantic-dup patch.
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-tls.md#SCN-TOOLS-7a-1 # ptr+digest
- source: ../goldens-tls.md#SCN-TOOLS-7b-1 # ptr+digest
  deps: [ WP-4.11-a.GROUND ]
  exit_predicate: all listed acceptance goldens green ∧ tools gates pass ∧ non-rederiving node emits false and persists nothing.
  context_refs: # closed list
- source: ../../reference/atlas-tools.md#tools-7
- source: ../../reference/atlas-grounding.md#ground-6
  owner: seat-tools
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-TOOLS-7

### WP-4.11-b.GROUND — grounding slice of EPIC-11-b

epic: EPIC-11-b
id: WP-4.11-b.GROUND
content_hash: <filled-at-freeze>
title: admission (grounded AND not harmful to store); obviousness scored; untrusted excluded; repo-wide rule anchored to a policy block
intent: >
Admit a fact iff both doors pass (truth = re-checks FRESH; harm = not a secret / PII); ADMIT the true-but-obvious carrying a low obviousness score, never reject it (ADR-0012); exclude untrusted-source claims from `gateHolds`; ground a repo-wide rule to a policy artifact's section-block subtreeHash (never whole-file byte-hash unless non-parseable), rejecting an anchorless rule. This WP owns the admission gate consumed by KNOW. (non-authoritative handle)
source_reqs: # ptr+digest

- source: ../req-grd.md#REQ-GROUND-7a # ptr+digest
- source: ../req-grd.md#REQ-GROUND-7b # ptr+digest
- source: ../req-grd.md#REQ-GROUND-7c # ptr+digest
- source: ../req-grd.md#REQ-GROUND-8 # ptr+digest
- source: ../req-grd.md#REQ-GROUND-12a # ptr+digest
- source: ../req-grd.md#REQ-GROUND-12b # ptr+digest
- source: ../req-grd.md#REQ-GROUND-12c # ptr+digest
- source: ../req-grd.md#REQ-GROUND-12d # ptr+digest
- source: ../req-grd.md#REQ-GROUND-12e # ptr+digest
  seam-freezes: [ "admission gate (truth ∧ ¬harmful) + obviousness score + untrusted-source exclusion owned-by GROUND, consumed-by KNOW" ]
  anchor: packages/grounding/src/ — the admission gate (`gateHolds` truth door + harmful-to-store door; obviousness SCORED, never a door) + untrusted-source exclusion + policy-artifact anchoring
  interface_contract: # ptr+digest
- source: ../../reference/atlas-grounding.md#ground-7 # ptr+digest
- source: ../../reference/atlas-grounding.md#ground-8 # ptr+digest
- source: ../../reference/atlas-grounding.md#ground-12 # ptr+digest
  exclusions: provenance-receipt authorship (owned by WP-4.11-b.KNOW); the truth-door FRESH re-check internals (frozen from WP-4.11-a.GROUND); calibration of the obviousness/hits ranking threshold (EPIC-18, CAMPAIGN-6 — and per ADR-0012 the retrieval weight is deliberately NOT pinned here).
  inputs: # ptr+digest
- source: ../req-grd.md#REQ-GROUND-4 # ptr+digest
  action: implement both admission doors, the untrusted-source exclusion, and policy-artifact section-block anchoring per the GROUND-7/8/12 clauses; reject anchorless rules; verify against the referenced goldens.
  action_surface: [ edit packages/grounding/**, run grounding PBT+unit suite, run goldens harness ]
  guardrails: no edits outside packages/grounding/\*\*; both-doors-required (fail either ⇒ block); untrusted excluded from the gate; edit-lint clean.
  repair_budget: N=3; early-stop on repeated-identical failure, no-change loop, or semantic-dup patch.
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-grd.md#SCN-GROUND-7a-1 # ptr+digest
- source: ../goldens-grd.md#SCN-GROUND-7b-1 # ptr+digest
- source: ../goldens-grd.md#SCN-GROUND-7c-1 # ptr+digest
- source: ../goldens-grd.md#SCN-GROUND-8-1 # ptr+digest
- source: ../goldens-grd.md#SCN-GROUND-12a-1 # ptr+digest
- source: ../goldens-grd.md#SCN-GROUND-12b-1 # ptr+digest
- source: ../goldens-grd.md#SCN-GROUND-12c-1 # ptr+digest
- source: ../goldens-grd.md#SCN-GROUND-12d-1 # ptr+digest
- source: ../goldens-grd.md#SCN-GROUND-12e-1 # ptr+digest
  deps: [ WP-4.11-a.GROUND ]
  exit_predicate: all listed acceptance goldens green ∧ grounding gates pass ∧ true-but-obvious ADMITTED WITH A LOW SCORE (ADR-0012 — obviousness is scored, never gated) ∧ untrusted excluded ∧ anchorless rule rejected.
  context_refs: # closed list
- source: ../../reference/atlas-grounding.md#ground-7
- source: ../../reference/atlas-grounding.md#ground-8
- source: ../../reference/atlas-grounding.md#ground-12
  owner: seat-grounding
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-GROUND-7

### WP-4.11-b.KNOW — knowledge slice of EPIC-11-b

epic: EPIC-11-b
id: WP-4.11-b.KNOW
content_hash: <filled-at-freeze>
title: every claim carries provenance; untrusted source ⇒ advisory, excluded from the gate
intent: >
Every claim carries a provenance receipt; an untrusted-source claim is marked advisory and excluded from the gate — the provenance-side consumer of GROUND's untrusted-exclusion seam. (non-authoritative handle)
source_reqs: # ptr+digest

- source: ../req-knw.md#REQ-KNOW-14a # ptr+digest
- source: ../req-knw.md#REQ-KNOW-14b # ptr+digest
- source: ../req-knw.md#REQ-KNOW-14c # ptr+digest
  seam-freezes: [ "untrusted-source exclusion consumed-from GROUND (owned-by GROUND, WP-4.11-b.GROUND)" ]
  anchor: packages/knowledge/src/ — claim provenance-receipt attach + advisory-marking of untrusted sources
  interface_contract: # ptr+digest
- source: ../../reference/atlas-knowledge.md#know-14 # ptr+digest
- source: ../../reference/atlas-grounding.md#ground-8 # ptr+digest
  exclusions: the gate's exclusion mechanism itself (owned by WP-4.11-b.GROUND); the harm-door / obviousness-score logic (owned by WP-4.11-b.GROUND); write-decision/upsert (CAMPAIGN-5).
  inputs: # ptr+digest
- source: ../req-grd.md#REQ-GROUND-8 # ptr+digest
  action: attach a provenance receipt to every claim; mark untrusted-source claims advisory and route them out of the gate; verify against the referenced goldens.
  action_surface: [ edit packages/knowledge/**, run knowledge exhaustive suite, run goldens harness ]
  guardrails: no edits outside packages/knowledge/\*\*; do not re-implement the gate exclusion; consume-only; edit-lint clean.
  repair_budget: N=3; early-stop on repeated-identical failure, no-change loop, or semantic-dup patch.
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-knw.md#SCN-KNOW-14a-1 # ptr+digest
- source: ../goldens-knw.md#SCN-KNOW-14b-1 # ptr+digest
- source: ../goldens-knw.md#SCN-KNOW-14c-1 # ptr+digest
  deps: [ WP-4.11-b.GROUND ]
  exit_predicate: all listed acceptance goldens green ∧ knowledge gates pass ∧ every claim has a receipt ∧ untrusted marked advisory + excluded.
  context_refs: # closed list
- source: ../../reference/atlas-knowledge.md#know-14
- source: ../../reference/atlas-grounding.md#ground-8
  owner: seat-knowledge
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-KNOW-14

---

## EPIC-12 — classify drift (12-a) · auto-re-ground (12-b)

### WP-4.12-a.KNOW — knowledge slice of EPIC-12-a

epic: EPIC-12-a
id: WP-4.12-a.KNOW
content_hash: <filled-at-freeze>
title: split the drifted subset — mechanical auto-re-grounds, semantic blocks, re-author == |semantic|
intent: >
At reconcile, split the DRIFTED subset; mechanical drift (claim still re-derives at the new @sha) auto-re-grounds with no human/no block; semantic drift (no longer re-derives) flips BROKEN and blocks (exit 2); human re-author count == |semantic|. This WP owns the mechanical/semantic split contract consumed by GROUND and TOOLS. (non-authoritative handle)
source_reqs: # ptr+digest

- source: ../req-knw.md#REQ-KNOW-5a # ptr+digest
- source: ../req-knw.md#REQ-KNOW-5b # ptr+digest
- source: ../req-knw.md#REQ-KNOW-5c # ptr+digest
- source: ../req-knw.md#REQ-KNOW-5d # ptr+digest
  seam-freezes: [ "KNOW-5 mechanical/semantic drift-split contract owned-by KNOW, consumed-by GROUND", "KNOW-5 mechanical/semantic drift-split contract owned-by KNOW, consumed-by TOOLS" ]
  anchor: packages/knowledge/src/ — reconcile drift classifier (mechanical vs semantic) + re-author-count bound
  interface_contract: # ptr+digest
- source: ../../reference/atlas-knowledge.md#know-5 # ptr+digest
  exclusions: advisory→STALE resolution (owned by WP-4.12-a.GROUND); the atlas-reconcile exit-code/DriftItem surface (owned by WP-4.12-a.TOOLS); the one-pass auto-re-ground writer (EPIC-12-b, WP-4.12-b.TOOLS).
  inputs: # ptr+digest
- source: ../req-grd.md#REQ-GROUND-1a # ptr+digest
  action: implement the reconcile split with mechanical auto-re-ground and semantic BROKEN/block(exit 2); bound human re-author to |semantic|; verify against the referenced goldens.
  action_surface: [ edit packages/knowledge/**, run knowledge exhaustive suite, run goldens harness ]
  guardrails: no edits outside packages/knowledge/\*\*; re-author count strictly == |semantic| (never |DRIFTED|/N); edit-lint clean.
  repair_budget: N=3; early-stop on repeated-identical failure, no-change loop, or semantic-dup patch.
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-knw.md#SCN-KNOW-5a-1 # ptr+digest
- source: ../goldens-knw.md#SCN-KNOW-5b-1 # ptr+digest
- source: ../goldens-knw.md#SCN-KNOW-5c-1 # ptr+digest
- source: ../goldens-knw.md#SCN-KNOW-5d-1 # ptr+digest
  deps: [ WP-4.10-a.GROUND ]
  exit_predicate: all listed acceptance goldens green ∧ knowledge gates pass ∧ mechanical→re-ground(exit 0) / semantic→BROKEN(exit 2) / re-author == |semantic|.
  context_refs: # closed list
- source: ../../reference/atlas-knowledge.md#know-5
  owner: seat-knowledge
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-KNOW-5

### WP-4.12-a.GROUND — grounding slice of EPIC-12-a

epic: EPIC-12-a
id: WP-4.12-a.GROUND
content_hash: <filled-at-freeze>
title: structural freshness resolves advisory drift to STALE; KNOW owns upward `kind` routing
intent: >
GROUND owns structural freshness only: an advisory fact whose grounding drifts resolves to STALE, is never forced into either arm, is never silently re-grounded, and never blocks a merge. KNOW owns upward `kind` routing and the KNOW-5 mechanical/semantic split. (non-authoritative handle)
source_reqs: # ptr+digest

- source: ../req-grd.md#REQ-GROUND-13a # ptr+digest
- source: ../req-grd.md#REQ-GROUND-13b # ptr+digest
- source: ../req-grd.md#REQ-GROUND-13c # ptr+digest
- source: ../req-grd.md#REQ-GROUND-13d # ptr+digest
- source: ../req-grd.md#REQ-GROUND-13e # ptr+digest
  seam-freezes: [ "KNOW-5 mechanical/semantic drift-split contract consumed-from KNOW (owned-by KNOW, WP-4.12-a.KNOW)" ]
  anchor: packages/knowledge/src/lifecycle/freshness.ts - advisory->STALE structural-freshness helper
  interface_contract: # ptr+digest
- source: ../../reference/atlas-grounding.md#ground-13 # ptr+digest
- source: ../../reference/atlas-knowledge.md#know-5 # ptr+digest
  exclusions: upward `kind` routing and defining the mechanical/semantic split (owned by WP-4.12-a.KNOW); the reconcile exit-code surface (owned by WP-4.12-a.TOOLS); auto-re-ground writing (EPIC-12-b).
  inputs: # ptr+digest
- source: ../req-knw.md#REQ-KNOW-5a # ptr+digest
  action: implement advisory->STALE structural freshness in the KNOW-owned helper; consume KNOW-owned upward `kind` routing without implementing it; verify against the referenced goldens.
  action_surface: [ edit packages/knowledge/src/lifecycle/freshness.ts, run knowledge PBT+unit suite, run goldens harness ]
  guardrails: GROUND must not import Knowledge types; advisory STALE never blocks; never silently re-ground advisory; edit-lint clean.
  repair_budget: N=3; early-stop on repeated-identical failure, no-change loop, or semantic-dup patch.
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-grd.md#SCN-GROUND-13a-1 # ptr+digest
- source: ../goldens-grd.md#SCN-GROUND-13b-1 # ptr+digest
- source: ../goldens-grd.md#SCN-GROUND-13c-1 # ptr+digest
- source: ../goldens-grd.md#SCN-GROUND-13d-1 # ptr+digest
- source: ../goldens-grd.md#SCN-GROUND-13e-1 # ptr+digest
  deps: [ WP-4.12-a.KNOW ]
  exit_predicate: all listed acceptance goldens green ∧ grounding gates pass ∧ advisory drift → STALE non-blocking ∧ predicate drift routed to the KNOW-5 split.
  context_refs: # closed list
- source: ../../reference/atlas-grounding.md#ground-13
- source: ../../reference/atlas-knowledge.md#know-5
  owner: seat-knowledge
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-GROUND-13

### WP-4.12-a.TOOLS — tools slice of EPIC-12-a

epic: EPIC-12-a
id: WP-4.12-a.TOOLS
content_hash: <filled-at-freeze>
title: atlas-reconcile classifies drift into a reviewable DriftItem[]; exit 2 only on semantic
intent: >
`atlas-reconcile` classifies the DRIFTED subset by the KNOW-5 split into a reviewable `DriftItem[]` (never all-or-nothing); exits 2 only on semantic drift (no silent green), exits 0 when drift is entirely mechanical, and re-authors == |semantic|. Consumes the KNOW-5 split. (non-authoritative handle)
source_reqs: # ptr+digest

- source: ../req-tls.md#REQ-TOOLS-8a # ptr+digest
- source: ../req-tls.md#REQ-TOOLS-8b # ptr+digest
- source: ../req-tls.md#REQ-TOOLS-8c # ptr+digest
- source: ../req-tls.md#REQ-TOOLS-8d # ptr+digest
  seam-freezes: [ "KNOW-5 mechanical/semantic drift-split contract consumed-from KNOW (owned-by KNOW, WP-4.12-a.KNOW)" ]
  anchor: packages/tools/src/ — `atlas-reconcile` DriftItem[] classifier + exit-code path
  interface_contract: # ptr+digest
- source: ../../reference/atlas-tools.md#tools-8 # ptr+digest
- source: ../../reference/atlas-knowledge.md#know-5 # ptr+digest
  exclusions: defining the mechanical/semantic split (owned by WP-4.12-a.KNOW); the --accept-reground auto-writer (EPIC-12-b, WP-4.12-b.TOOLS); advisory→STALE resolution (owned by WP-4.12-a.GROUND).
  inputs: # ptr+digest
- source: ../req-knw.md#REQ-KNOW-5a # ptr+digest
  action: present reconcile drift as a reviewable DriftItem[]; exit 2 only on semantic, exit 0 on mechanical-only; re-author == |semantic|; verify against the referenced goldens.
  action_surface: [ edit packages/tools/**, run tools unit suite, run goldens harness ]
  guardrails: no edits outside packages/tools/\*\*; never a silent green on semantic drift; never all-or-nothing; edit-lint clean.
  repair_budget: N=3; early-stop on repeated-identical failure, no-change loop, or semantic-dup patch.
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-tls.md#SCN-TOOLS-8a-1 # ptr+digest
- source: ../goldens-tls.md#SCN-TOOLS-8b-1 # ptr+digest
- source: ../goldens-tls.md#SCN-TOOLS-8c-1 # ptr+digest
- source: ../goldens-tls.md#SCN-TOOLS-8d-1 # ptr+digest
  deps: [ WP-4.12-a.KNOW ]
  exit_predicate: all listed acceptance goldens green ∧ tools gates pass ∧ semantic⇒exit 2 ∧ mechanical-only⇒exit 0 ∧ re-author == |semantic|.
  context_refs: # closed list
- source: ../../reference/atlas-tools.md#tools-8
- source: ../../reference/atlas-knowledge.md#know-5
  owner: seat-tools
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-TOOLS-8

### WP-4.12-b.TOOLS — tools slice of EPIC-12-b

epic: EPIC-12-b
id: WP-4.12-b.TOOLS
content_hash: <filled-at-freeze>
title: atlas-reconcile --accept-reground auto-re-grounds mechanical drift in one pass, reports regroundedCount
intent: >
`atlas-reconcile --accept-reground` auto-re-grounds every mechanical DriftItem in one pass (anchor moved, claim still re-derives) with no human/no block, reports `regroundedCount`, never auto-touches semantic drift (those still surface + exit 2), and each re-ground write passes the atlas-emit fail-closed check. Single-module (TOOLS) slice. (non-authoritative handle)
source_reqs: # ptr+digest

- source: ../req-tls.md#REQ-TOOLS-13a # ptr+digest
- source: ../req-tls.md#REQ-TOOLS-13b # ptr+digest
- source: ../req-tls.md#REQ-TOOLS-13c # ptr+digest
- source: ../req-tls.md#REQ-TOOLS-13d # ptr+digest
  seam-freezes: [ "mechanical DriftItem classification consumed-from KNOW-5 (frozen upstream, WP-4.12-a.KNOW)", "atlas-emit fail-closed check (TOOLS-7) consumed-from GROUND truth-gate (frozen upstream, WP-4.11-a.TOOLS / WP-4.11-a.GROUND)" ]
  anchor: packages/tools/src/ — `atlas-reconcile --accept-reground` one-pass mechanical re-ground writer + regroundedCount report
  interface_contract: # ptr+digest
- source: ../../reference/atlas-tools.md#tools-13 # ptr+digest
- source: ../../reference/atlas-tools.md#tools-7 # ptr+digest
  interface_contract_note: consumes the KNOW-5 mechanical subset (frozen upstream) and the TOOLS-7 fail-closed check (frozen upstream); no new intra-epic cross-module obligation — EPIC-12-b is single-module.
  exclusions: classifying drift / the DriftItem[] surface (owned by WP-4.12-a.TOOLS); the KNOW-5 split definition (owned by WP-4.12-a.KNOW); defining the atlas-emit fail-closed check (owned by WP-4.11-a.GROUND / consumed via WP-4.11-a.TOOLS); semantic drift handling.
  inputs: # ptr+digest
- source: ../req-knw.md#REQ-KNOW-5b # ptr+digest
- source: ../req-tls.md#REQ-TOOLS-7b # ptr+digest
  action: implement one-pass auto-re-ground over the mechanical subset, report regroundedCount, leave semantic drift untouched (surface + exit 2), and route each re-ground write through the atlas-emit fail-closed check; verify against the referenced goldens.
  action_surface: [ edit packages/tools/**, run tools unit suite, run goldens harness ]
  guardrails: no edits outside packages/tools/\*\*; never auto-touch semantic drift; each re-ground write passes the emit fail-closed check; edit-lint clean.
  repair_budget: N=3; early-stop on repeated-identical failure, no-change loop, or semantic-dup patch.
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-tls.md#SCN-TOOLS-13a-1 # ptr+digest
- source: ../goldens-tls.md#SCN-TOOLS-13b-1 # ptr+digest
- source: ../goldens-tls.md#SCN-TOOLS-13c-1 # ptr+digest
- source: ../goldens-tls.md#SCN-TOOLS-13d-1 # ptr+digest
  deps: [ WP-4.12-a.KNOW, WP-4.12-a.TOOLS, WP-4.11-a.TOOLS ]
  exit_predicate: all listed acceptance goldens green ∧ tools gates pass ∧ mechanical anchors healed in one pass with reported count ∧ semantic untouched ∧ each write passes the emit check.
  context_refs: # closed list
- source: ../../reference/atlas-tools.md#tools-13
- source: ../../reference/atlas-tools.md#tools-7
  owner: seat-tools
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-TOOLS-13
