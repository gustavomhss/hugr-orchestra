# Work Packages — CAMPAIGN-1 (state S4)

> The CAS + merge + persistence floor. One **WP-card** per (epic × module), conforming to
> [`method/wp-template.md`](../../method/wp-template.md). Every substantive field is a `ptr+digest`
> (the digest is tooling-filled at freeze — the pointer carries a `# ptr+digest` marker, no fabricated
> hashes); `content_hash` is `# filled-at-freeze`; the `exec` fields (`outputs`/`provenance`/`trace_ref`)
> are present-but-empty. `intent` is the one prose carve-out (non-authoritative, executor-invisible).
>
> **Campaign coverage:** 6 epics · 9 WPs · 50 REQs (KERNEL 30 + PERSIST 20) · REQ→WP = total function
> (each REQ owned by exactly one WP; orphans/doubles = 0). **Seam-freezes = 3** (all owner = KERNEL,
> consumer = PERSIST; upstream-holds-the-contract, lexicographic tiebreak KERNEL < PERSIST — concordant).

---

## EPIC-1

### WP-1.1-a.KERNEL — KERNEL slice of EPIC-1-a

epic: EPIC-1-a
id: WP-1.1-a.KERNEL
content_hash: <filled-at-freeze>
title: Content-addressed object identity & canonical encoding (hashing seam)
intent: >
Give every Atlas object a computed identity — id = Encoder.hash(canonicalForm(object)) reached only
through the @atlas/kernel encoder seam (default BLAKE3) — so identity is never asserted and a
non-canonical / hand-rolled / side-index-tainted preimage fails closed. (Non-authoritative handle.)
source_reqs: # ptr+digest

- source: ../req-krn.md#REQ-KERNEL-1a # ptr+digest
- source: ../req-krn.md#REQ-KERNEL-1b # ptr+digest
- source: ../req-krn.md#REQ-KERNEL-1c # ptr+digest
- source: ../req-krn.md#REQ-KERNEL-2a # ptr+digest
- source: ../req-krn.md#REQ-KERNEL-2b # ptr+digest
- source: ../req-krn.md#REQ-KERNEL-2c # ptr+digest
- source: ../req-krn.md#REQ-KERNEL-8a # ptr+digest
- source: ../req-krn.md#REQ-KERNEL-8b # ptr+digest
  seam-freezes: [ ]
  anchor: packages/kernel/src/ — the @atlas/kernel encoder seam + canonicalForm(); id-computation entry points
  interface_contract: # ptr+digest
- source: ../req-krn.md#REQ-KERNEL-1a # ptr+digest
- source: ../req-krn.md#REQ-KERNEL-2a # ptr+digest
  exclusions: >
  No merge/fold logic (EPIC-3); no store/append (EPIC-2-a); no export (EPIC-1-b); grounding/status/freshness
  are NOT in the preimage and are out of scope here (they are recomputed, never re-key).
  inputs: # ptr+digest
- source: ../../reference/atlas-kernel.md#kernel-1 # ptr+digest
- source: ../../reference/atlas-kernel.md#kernel-2 # ptr+digest
- source: ../../reference/atlas-kernel.md#kernel-8 # ptr+digest
  action: Implement the encoder seam + canonicalForm + id computation to satisfy the source_reqs; run the acceptance goldens (conformance/differential vs kernel/ref) green.
  action_surface: [ read-repo, edit(packages/kernel/**), run-tests(kernel), typecheck ]
  guardrails: >
  Edit only under packages/kernel/\*\*. No second CAS store. No hash call outside the seam. Do not add
  grounding/status/freshness to the canonical preimage. No network, no clock, no LLM in the identity path.
  repair_budget: N=3; early-stop on { repeated-identical-failure, no-change diff, semantic-dup edit }.
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-krn.md#SCN-KERNEL-1a-1 # ptr+digest
- source: ../goldens-krn.md#SCN-KERNEL-1b-1 # ptr+digest
- source: ../goldens-krn.md#SCN-KERNEL-1c-1 # ptr+digest
- source: ../goldens-krn.md#SCN-KERNEL-2a-1 # ptr+digest
- source: ../goldens-krn.md#SCN-KERNEL-2b-1 # ptr+digest
- source: ../goldens-krn.md#SCN-KERNEL-2c-1 # ptr+digest
- source: ../goldens-krn.md#SCN-KERNEL-8a-1 # ptr+digest
- source: ../goldens-krn.md#SCN-KERNEL-8b-1 # ptr+digest
  deps: [ ] parallel_group: [P] — foundational, no in-campaign predecessor
  exit_predicate: all acceptance SCNs green ∧ encoder conformance-vector corpus passes (divergence fails build) ∧ module gates (typecheck/lint) pass
  context_refs: # closed list
- source: ../../reference/atlas-kernel.md
- source: ../req-krn.md
- source: ../goldens-krn.md
  owner: FORGE/kernel seat
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-KERNEL-1
- source: ../invariant-register.md#INV-KERNEL-2
- source: ../invariant-register.md#INV-KERNEL-8

### WP-1.1-b.KERNEL — KERNEL slice of EPIC-1-b

epic: EPIC-1-b
id: WP-1.1-b.KERNEL
content_hash: <filled-at-freeze>
title: Self-contained open-JSON (OKF) export of the CAS
intent: >
The CAS exports to open JSON that replays 1:1 into a fresh store — no proprietary encoding, no external
reference, no host dependency. KERNEL owns this export contract; PERSIST consumes it. (Non-authoritative.)
source_reqs: # ptr+digest

- source: ../req-krn.md#REQ-KERNEL-6a # ptr+digest
- source: ../req-krn.md#REQ-KERNEL-6b # ptr+digest
  seam-freezes: [ "open-JSON export (OKF) contract owned-by KERNEL, consumed-by PERSIST" ]
  anchor: packages/kernel/src/ — CAS export/import (OKF) entry points; the open-JSON serializer
  interface_contract: # ptr+digest
- source: ../req-krn.md#REQ-KERNEL-6a # ptr+digest
- source: ../req-krn.md#REQ-KERNEL-6b # ptr+digest
  exclusions: >
  No PERSIST store+trailers wiring, no git layer, no lock-in policy (EPIC-1-b PERSIST slice owns that);
  no identity/encoding redefinition (consumes WP-1.1-a.KERNEL).
  inputs: # ptr+digest
- source: ../../reference/atlas-kernel.md#kernel-6 # ptr+digest
  action: Implement the OKF export/import over the CAS to satisfy the source_reqs; verify a round-trip replays byte-for-byte into a fresh store and a malformed bundle fails closed.
  action_surface: [ read-repo, edit(packages/kernel/**), run-tests(kernel), typecheck ]
  guardrails: >
  Edit only under packages/kernel/\*\*. Export MUST carry no proprietary encoding / external ref / host
  dependency. No lossy transform. Do not reach into PERSIST or git internals.
  repair_budget: N=3; early-stop on { repeated-identical-failure, no-change diff, semantic-dup edit }.
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-krn.md#SCN-KERNEL-6a-1 # ptr+digest
- source: ../goldens-krn.md#SCN-KERNEL-6b-1 # ptr+digest
  deps: [ WP-1.1-a.KERNEL ]
  exit_predicate: all acceptance SCNs green ∧ export→fresh-store replay is 1:1 ∧ malformed bundle fails closed ∧ module gates pass
  context_refs: # closed list
- source: ../../reference/atlas-kernel.md
- source: ../req-krn.md
- source: ../goldens-krn.md
  owner: FORGE/kernel seat
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-KERNEL-6

### WP-1.1-b.PERSIST — PERSIST slice of EPIC-1-b

epic: EPIC-1-b
id: WP-1.1-b.PERSIST
content_hash: <filled-at-freeze>
title: Portable source = store + trailers · open-JSON export, no lock-in on git
intent: >
The portable source is the tracked store plus commit trailers; a PR attachment is never a datum's sole
home; the full store still exports to open JSON that replays 1:1, with no lock-in layered on git. Consumes
the OKF export contract frozen upstream in KERNEL. (Non-authoritative handle.)
source_reqs: # ptr+digest

- source: ../req-pst.md#REQ-PERSIST-1-a # ptr+digest
- source: ../req-pst.md#REQ-PERSIST-1-b # ptr+digest
- source: ../req-pst.md#REQ-PERSIST-9-a # ptr+digest
- source: ../req-pst.md#REQ-PERSIST-9-b # ptr+digest
  seam-freezes: [ "open-JSON export (OKF) contract consumed-from KERNEL (frozen upstream in WP-1.1-b.KERNEL)" ]
  anchor: packages/persist/src/ — store+trailers portable-source assembly; full-store open-JSON export path
  interface_contract: # ptr+digest
- source: ../req-krn.md#REQ-KERNEL-6a # ptr+digest
- source: ../req-krn.md#REQ-KERNEL-6b # ptr+digest
  exclusions: >
  Does NOT define or re-implement the open-JSON format (owned by WP-1.1-b.KERNEL); no provenance trailers
  (EPIC-4, CAMPAIGN-3); no merge/fold (EPIC-3); no forge/host adapter (EPIC-4-b).
  inputs: # ptr+digest
- source: ../../reference/atlas-persist.md#persist-1 # ptr+digest
- source: ../../reference/atlas-persist.md#persist-9 # ptr+digest
  action: Wire the portable source as store+trailers and the full-store open-JSON export over the KERNEL OKF seam; verify replay 1:1 into a fresh store and that no datum's sole home is the PR attachment.
  action_surface: [ read-repo, edit(packages/persist/**), run-tests(persist), typecheck ]
  guardrails: >
  Edit only under packages/persist/\*\*. No lock-in on top of git. PR attachment MUST remain a projection.
  Do not modify the KERNEL OKF serializer — consume it as frozen.
  repair_budget: N=3; early-stop on { repeated-identical-failure, no-change diff, semantic-dup edit }.
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-pst.md#SCN-PERSIST-1a-1 # ptr+digest
- source: ../goldens-pst.md#SCN-PERSIST-1b-1 # ptr+digest
- source: ../goldens-pst.md#SCN-PERSIST-9a-1 # ptr+digest
- source: ../goldens-pst.md#SCN-PERSIST-9b-1 # ptr+digest
  deps: [ WP-1.1-b.KERNEL ]
  exit_predicate: all acceptance SCNs green ∧ full-store export replays 1:1 ∧ PR-attachment-as-sole-home rejected ∧ module gates pass
  context_refs: # closed list
- source: ../../reference/atlas-persist.md
- source: ../req-pst.md
- source: ../goldens-pst.md
  owner: FORGE/persist seat
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-PERSIST-1
- source: ../invariant-register.md#INV-PERSIST-9

---

## EPIC-2

### WP-1.2-a.KERNEL — KERNEL slice of EPIC-2-a

epic: EPIC-2-a
id: WP-1.2-a.KERNEL
content_hash: <filled-at-freeze>
title: Single content-keyed store · append-only log · pure/total entry points
intent: >
One CAS keyed by hash (no second store); an append-only event log that rejects in-place mutation/delete;
every entry point pure and total so malformed input yields a structured rejection or honest empty, never a
throw. (Non-authoritative handle.)
source_reqs: # ptr+digest

- source: ../req-krn.md#REQ-KERNEL-3a # ptr+digest
- source: ../req-krn.md#REQ-KERNEL-3b # ptr+digest
- source: ../req-krn.md#REQ-KERNEL-4a # ptr+digest
- source: ../req-krn.md#REQ-KERNEL-4b # ptr+digest
- source: ../req-krn.md#REQ-KERNEL-7a # ptr+digest
- source: ../req-krn.md#REQ-KERNEL-7b # ptr+digest
  seam-freezes: [ ]
  anchor: packages/kernel/src/ — the single CAS, the append-only event-log writer, the entry-point boundary
  interface_contract: # ptr+digest
- source: ../req-krn.md#REQ-KERNEL-3a # ptr+digest
- source: ../req-krn.md#REQ-KERNEL-4a # ptr+digest
- source: ../req-krn.md#REQ-KERNEL-7a # ptr+digest
  exclusions: >
  No fold/replay (EPIC-2-b); no export (EPIC-1-b); no merge driver (EPIC-3); identity computation consumed
  from WP-1.1-a.KERNEL, not redefined.
  inputs: # ptr+digest
- source: ../../reference/atlas-kernel.md#kernel-3 # ptr+digest
- source: ../../reference/atlas-kernel.md#kernel-4 # ptr+digest
- source: ../../reference/atlas-kernel.md#kernel-7 # ptr+digest
  action: Implement the single hash-keyed CAS, the append-only log, and pure/total entry points to satisfy the source_reqs; verify an in-place mutate/delete is rejected and a malformed input returns a value, never an exception.
  action_surface: [ read-repo, edit(packages/kernel/**), run-tests(kernel), typecheck ]
  guardrails: >
  Edit only under packages/kernel/\*\*. Exactly one store, content-addressed. Log strictly append-only.
  No entry point may throw on malformed input. No clock, no network, no LLM.
  repair_budget: N=3; early-stop on { repeated-identical-failure, no-change diff, semantic-dup edit }.
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-krn.md#SCN-KERNEL-3a-1 # ptr+digest
- source: ../goldens-krn.md#SCN-KERNEL-3b-1 # ptr+digest
- source: ../goldens-krn.md#SCN-KERNEL-4a-1 # ptr+digest
- source: ../goldens-krn.md#SCN-KERNEL-4b-1 # ptr+digest
- source: ../goldens-krn.md#SCN-KERNEL-7a-1 # ptr+digest
- source: ../goldens-krn.md#SCN-KERNEL-7b-1 # ptr+digest
  deps: [ ] parallel_group: [P] — foundational
  exit_predicate: all acceptance SCNs green ∧ mutation/delete rejected ∧ malformed→structured-reject/empty (no throw) ∧ module gates pass
  context_refs: # closed list
- source: ../../reference/atlas-kernel.md
- source: ../req-krn.md
- source: ../goldens-krn.md
  owner: FORGE/kernel seat
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-KERNEL-3
- source: ../invariant-register.md#INV-KERNEL-4
- source: ../invariant-register.md#INV-KERNEL-7

### WP-1.2-b.KERNEL — KERNEL slice of EPIC-2-b

epic: EPIC-2-b
id: WP-1.2-b.KERNEL
content_hash: <filled-at-freeze>
title: State rebuilt by fold · no mutable snapshot dependency
intent: >
Replaying the log from empty rebuilds a byte-identical Atlas; no capability depends on a mutable in-place
snapshot. KERNEL owns the fold-reconstruction contract; PERSIST consumes it. (Non-authoritative handle.)
source_reqs: # ptr+digest

- source: ../req-krn.md#REQ-KERNEL-5a # ptr+digest
- source: ../req-krn.md#REQ-KERNEL-5b # ptr+digest
  seam-freezes: [ "fold-reconstruction contract owned-by KERNEL, consumed-by PERSIST" ]
  anchor: packages/kernel/src/ — the fold() reconstruction over the event log; AtlasState builder
  interface_contract: # ptr+digest
- source: ../req-krn.md#REQ-KERNEL-5a # ptr+digest
- source: ../req-krn.md#REQ-KERNEL-5b # ptr+digest
  exclusions: >
  Convergence/commutativity of the CRDT merge fold is EPIC-3-b (WP-1.3-b.KERNEL), not here; store/append
  consumed from WP-1.2-a.KERNEL; PERSIST archive/rebase behaviour owned by the PERSIST slice.
  inputs: # ptr+digest
- source: ../../reference/atlas-kernel.md#kernel-5 # ptr+digest
  action: Implement fold-reconstruction so replaying the log from empty yields a byte-identical Atlas with no mutable snapshot; verify against the acceptance goldens.
  action_surface: [ read-repo, edit(packages/kernel/**), run-tests(kernel), typecheck ]
  guardrails: >
  Edit only under packages/kernel/\*\*. No mutable in-place snapshot may back any capability. Replay MUST be
  byte-identical. No clock/network/LLM in the fold.
  repair_budget: N=3; early-stop on { repeated-identical-failure, no-change diff, semantic-dup edit }.
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-krn.md#SCN-KERNEL-5a-1 # ptr+digest
- source: ../goldens-krn.md#SCN-KERNEL-5b-1 # ptr+digest
  deps: [ WP-1.2-a.KERNEL ]
  exit_predicate: all acceptance SCNs green ∧ empty-replay is byte-identical ∧ no mutable-snapshot dependency ∧ module gates pass
  context_refs: # closed list
- source: ../../reference/atlas-kernel.md
- source: ../req-krn.md
- source: ../goldens-krn.md
  owner: FORGE/kernel seat
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-KERNEL-5

### WP-1.2-b.PERSIST — PERSIST slice of EPIC-2-b

epic: EPIC-2-b
id: WP-1.2-b.PERSIST
content_hash: <filled-at-freeze>
title: Convergent fold-reconstruction · never-delete archive · byte-identical rebase/rewind
intent: >
Atlas state reconstructs by folding the append-only set from empty, convergent and order-independent, never
depending on linear history or a mutable snapshot; memory/knowledge is never deleted (superseded/decayed/
closed entries are archived, deduped, retained, re-spawnable; forgetting leaves only the active set); a
rebase/cherry-pick leaves AtlasState byte-identical and rewind holds on non-linear history. Consumes the
fold contract frozen upstream in KERNEL. (Non-authoritative handle.)
source_reqs: # ptr+digest

- source: ../req-pst.md#REQ-PERSIST-2-a # ptr+digest
- source: ../req-pst.md#REQ-PERSIST-2-b # ptr+digest
- source: ../req-pst.md#REQ-PERSIST-2-c # ptr+digest
- source: ../req-pst.md#REQ-PERSIST-5-a # ptr+digest
- source: ../req-pst.md#REQ-PERSIST-5-b # ptr+digest
- source: ../req-pst.md#REQ-PERSIST-5-c # ptr+digest
- source: ../req-pst.md#REQ-PERSIST-5-d # ptr+digest
- source: ../req-pst.md#REQ-PERSIST-12-a # ptr+digest
- source: ../req-pst.md#REQ-PERSIST-12-b # ptr+digest
  seam-freezes: [ "fold-reconstruction contract consumed-from KERNEL (frozen upstream in WP-1.2-b.KERNEL; convergence per KERNEL-11)" ]
  anchor: packages/persist/src/ — set-fold reconstruction over git history; archive/forget path; rebase/rewind reconciliation
  interface_contract: # ptr+digest
- source: ../req-krn.md#REQ-KERNEL-5a # ptr+digest
- source: ../req-krn.md#REQ-KERNEL-5b # ptr+digest
- source: ../req-krn.md#REQ-KERNEL-11 # ptr+digest
  exclusions: >
  Does NOT define fold semantics or convergence (owned by KERNEL WP-1.2-b + WP-1.3-b); no merge driver
  wiring (EPIC-3-b PERSIST slice); no provenance/transcript retention (CAMPAIGN-3).
  inputs: # ptr+digest
- source: ../../reference/atlas-persist.md#persist-2 # ptr+digest
- source: ../../reference/atlas-persist.md#persist-5 # ptr+digest
- source: ../../reference/atlas-persist.md#persist-12 # ptr+digest
  action: Reconstruct AtlasState by folding the append-only set over git history (order-independent, no linear-history/snapshot dependency); implement never-delete archive + forget-to-active-set; verify rebase/cherry-pick and rewind leave AtlasState byte-identical.
  action_surface: [ read-repo, edit(packages/persist/**), run-tests(persist), typecheck ]
  guardrails: >
  Edit only under packages/persist/\*\*. Never delete a memory/knowledge entry. Reconstruction MUST NOT
  depend on linear commit history or a mutable snapshot. Do not redefine the KERNEL fold — consume it frozen.
  repair_budget: N=3; early-stop on { repeated-identical-failure, no-change diff, semantic-dup edit }.
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-pst.md#SCN-PERSIST-2a-1 # ptr+digest
- source: ../goldens-pst.md#SCN-PERSIST-2b-1 # ptr+digest
- source: ../goldens-pst.md#SCN-PERSIST-2c-1 # ptr+digest
- source: ../goldens-pst.md#SCN-PERSIST-5a-1 # ptr+digest
- source: ../goldens-pst.md#SCN-PERSIST-5b-1 # ptr+digest
- source: ../goldens-pst.md#SCN-PERSIST-5c-1 # ptr+digest
- source: ../goldens-pst.md#SCN-PERSIST-5d-1 # ptr+digest
- source: ../goldens-pst.md#SCN-PERSIST-12a-1 # ptr+digest
- source: ../goldens-pst.md#SCN-PERSIST-12b-1 # ptr+digest
  deps: [ WP-1.2-b.KERNEL ]
  exit_predicate: all acceptance SCNs green ∧ shuffled set folds to one state ∧ rebase/rewind byte-identical ∧ delete rejected/archive retained/re-spawnable ∧ module gates pass
  context_refs: # closed list
- source: ../../reference/atlas-persist.md
- source: ../req-pst.md
- source: ../goldens-pst.md
  owner: FORGE/persist seat
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-PERSIST-2
- source: ../invariant-register.md#INV-PERSIST-5
- source: ../invariant-register.md#INV-PERSIST-12

---

## EPIC-3

### WP-1.3-a.KERNEL — KERNEL slice of EPIC-3-a

epic: EPIC-3-a
id: WP-1.3-a.KERNEL
content_hash: <filled-at-freeze>
title: Single-event content identity · idempotent append · seq-not-key
intent: >
Every event's id = Encoder.hash(canonicalForm(event)); re-appending an existing id is a no-op; two logs
combine by set-union on id; positional seq is never an object key or a merge discriminator and a colliding
seq never collides identity. (Non-authoritative handle.)
source_reqs: # ptr+digest

- source: ../req-krn.md#REQ-KERNEL-9a # ptr+digest
- source: ../req-krn.md#REQ-KERNEL-9b # ptr+digest
- source: ../req-krn.md#REQ-KERNEL-9c # ptr+digest
- source: ../req-krn.md#REQ-KERNEL-9d # ptr+digest
- source: ../req-krn.md#REQ-KERNEL-9e # ptr+digest
  seam-freezes: [ ]
  anchor: packages/kernel/src/ — event-id computation, idempotent append(), set-union combine
  interface_contract: # ptr+digest
- source: ../../spec/fspec-merge.md#event-identity # ptr+digest
- source: ../../spec/fspec-merge.md#idempotent-append # ptr+digest
- source: ../../spec/fspec-merge.md#seq-invariant # ptr+digest
  exclusions: >
  Collision/nodeKey resolution and the convergent commutative fold are EPIC-3-b (WP-1.3-b.KERNEL); no merge
  driver / git wiring (PERSIST). Object identity primitives consumed from WP-1.1-a.KERNEL.
  inputs: # ptr+digest
- source: ../../reference/atlas-kernel.md#kernel-9 # ptr+digest
- source: ../../spec/fspec-merge.md # ptr+digest
  action: Implement content-addressed event identity, idempotent append, and set-union log combine to satisfy the source_reqs; verify appending the same event twice yields one entry and a colliding seq never collides identity.
  action_surface: [ read-repo, edit(packages/kernel/**), run-tests(kernel), typecheck ]
  guardrails: >
  Edit only under packages/kernel/\*\*. seq MUST NOT be an identity or merge key. Append MUST be idempotent by
  content id. No clock/network/LLM in the append/identity path.
  repair_budget: N=3; early-stop on { repeated-identical-failure, no-change diff, semantic-dup edit }.
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-krn.md#SCN-KERNEL-9a-1 # ptr+digest
- source: ../goldens-krn.md#SCN-KERNEL-9b-1 # ptr+digest
- source: ../goldens-krn.md#SCN-KERNEL-9c-1 # ptr+digest
- source: ../goldens-krn.md#SCN-KERNEL-9d-1 # ptr+digest
- source: ../goldens-krn.md#SCN-KERNEL-9e-1 # ptr+digest
  deps: [ WP-1.2-a.KERNEL ]
  exit_predicate: all acceptance SCNs green (PBT witnesses of KERNEL-9 laws) ∧ double-append→one-entry ∧ colliding-seq no identity collision ∧ module gates pass
  context_refs: # closed list
- source: ../../reference/atlas-kernel.md
- source: ../../spec/fspec-merge.md
- source: ../req-krn.md
- source: ../goldens-krn.md
  owner: FORGE/kernel seat
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-KERNEL-9

### WP-1.3-b.KERNEL — KERNEL slice of EPIC-3-b

epic: EPIC-3-b
id: WP-1.3-b.KERNEL
content_hash: <filled-at-freeze>
title: Collision set-union · forced-head tie-break · convergent commutative fold · self-installing driver
intent: >
≥2 events on the same nodeKey resolve order-independently by set-union into one node; a forced single head
ties by contentHash alone; no collision path drops an event, consults an LLM, or reads a clock; fold is
commutative+associative to a byte-identical AtlasState; the merge driver is self-installing and its
content-keyed JSONL log degrades safely under a plain text merge. This is the FSPEC-merge cluster KERNEL
owns; PERSIST consumes it. (Non-authoritative handle.)
source_reqs: # ptr+digest

- source: ../req-krn.md#REQ-KERNEL-10a # ptr+digest
- source: ../req-krn.md#REQ-KERNEL-10b # ptr+digest
- source: ../req-krn.md#REQ-KERNEL-10c # ptr+digest
- source: ../req-krn.md#REQ-KERNEL-11 # ptr+digest
- source: ../req-krn.md#REQ-KERNEL-12a # ptr+digest
- source: ../req-krn.md#REQ-KERNEL-12b # ptr+digest
- source: ../req-krn.md#REQ-KERNEL-12c # ptr+digest
  seam-freezes: [ "FSPEC-merge (merge-driver fold: set-union · contentHash-head · convergent commutative fold) owned-by KERNEL, consumed-by PERSIST" ]
  anchor: packages/kernel/src/ — the merge/collision fold, head() tie-break, self-install bootstrap, content-keyed JSONL log form
  interface_contract: # ptr+digest
- source: ../../spec/fspec-merge.md#set-union # ptr+digest
- source: ../../spec/fspec-merge.md#head-tiebreak(max-by-contentHash) # ptr+digest
- source: ../../spec/fspec-merge.md#convergence # ptr+digest
- source: ../../spec/fspec-merge.md#self-install # ptr+digest
- source: ../../spec/fspec-merge.md#jsonl-degrade # ptr+digest
  exclusions: >
  The git merge-driver registration + on-disk union behaviour under a bypassed driver is the PERSIST slice
  (WP-1.3-b.PERSIST); event identity / idempotent append consumed from WP-1.3-a.KERNEL; no provenance/notes.
  inputs: # ptr+digest
- source: ../../reference/atlas-kernel.md#kernel-10 # ptr+digest
- source: ../../reference/atlas-kernel.md#kernel-11 # ptr+digest
- source: ../../reference/atlas-kernel.md#kernel-12 # ptr+digest
- source: ../../spec/fspec-merge.md # ptr+digest
  action: Implement the collision set-union fold, contentHash head tie-break, convergent commutative+associative fold, the self-installing bootstrap, and the content-keyed JSONL log form to satisfy the source_reqs and the FSPEC-merge model.
  action_surface: [ read-repo, edit(packages/kernel/**), run-tests(kernel), typecheck ]
  guardrails: >
  Edit only under packages/kernel/\*\*. Head = MAX-by-contentHash (per fspec-merge.md, authoritative). No
  collision path may drop an event / consult an LLM / read a clock. Fold MUST be byte-identical under any
  permutation/re-batch/union. JSONL log MUST survive a plain text merge.
  repair_budget: N=3; early-stop on { repeated-identical-failure, no-change diff, semantic-dup edit }.
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-krn.md#SCN-KERNEL-10a-1 # ptr+digest
- source: ../goldens-krn.md#SCN-KERNEL-10b-1 # ptr+digest
- source: ../goldens-krn.md#SCN-KERNEL-10c-1 # ptr+digest
- source: ../goldens-krn.md#SCN-KERNEL-11-1 # ptr+digest
- source: ../goldens-krn.md#SCN-KERNEL-12a-1 # ptr+digest
- source: ../goldens-krn.md#SCN-KERNEL-12b-1 # ptr+digest
- source: ../goldens-krn.md#SCN-KERNEL-12c-1 # ptr+digest
  deps: [ WP-1.3-a.KERNEL ]
  exit_predicate: all acceptance SCNs green (FSPEC-merge witnesses) ∧ permutation/re-batch/union → byte-identical AtlasState ∧ head=max-by-contentHash ∧ 0 events dropped ∧ module gates pass
  context_refs: # closed list
- source: ../../reference/atlas-kernel.md
- source: ../../spec/fspec-merge.md
- source: ../req-krn.md
- source: ../goldens-krn.md
  owner: FORGE/kernel seat
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-KERNEL-10
- source: ../invariant-register.md#INV-KERNEL-11
- source: ../invariant-register.md#INV-KERNEL-12

### WP-1.3-b.PERSIST — PERSIST slice of EPIC-3-b

epic: EPIC-3-b
id: WP-1.3-b.PERSIST
content_hash: <filled-at-freeze>
title: Git merge driver unions by content-hash & re-folds · direction-independent · bypass loses no event
intent: >
Merging two branches never line-merges the log; a registered merge=orchestra-atlas driver unions the two
event sets by content-hash and re-folds; colliding seq is never a conflict; a shared nodeKey resolves by
the deterministic fold-merge; the merged Atlas is byte-identical regardless of direction; the driver is
self-installing; and an append-only on-disk union means a bypassed plain 3-way merge loses/corrupts no
event. Consumes the FSPEC-merge fold frozen upstream in KERNEL. (Non-authoritative handle.)
source_reqs: # ptr+digest

- source: ../req-pst.md#REQ-PERSIST-11-a # ptr+digest
- source: ../req-pst.md#REQ-PERSIST-11-b # ptr+digest
- source: ../req-pst.md#REQ-PERSIST-11-c # ptr+digest
- source: ../req-pst.md#REQ-PERSIST-11-d # ptr+digest
- source: ../req-pst.md#REQ-PERSIST-11-e # ptr+digest
- source: ../req-pst.md#REQ-PERSIST-11-f # ptr+digest
- source: ../req-pst.md#REQ-PERSIST-11-g # ptr+digest
  seam-freezes: [ "FSPEC-merge (merge-driver fold) contract consumed-from KERNEL (frozen upstream in WP-1.3-b.KERNEL; KERNEL-9/10/11)" ]
  anchor: packages/persist/src/ — the git merge driver (.gitattributes merge=orchestra-atlas), setup-hook registration, on-disk append-only union log
  interface_contract: # ptr+digest
- source: ../../spec/fspec-merge.md#set-union # ptr+digest
- source: ../../spec/fspec-merge.md#convergence # ptr+digest
- source: ../../spec/fspec-merge.md#head-tiebreak # ptr+digest
- source: ../req-krn.md#REQ-KERNEL-9c # ptr+digest
- source: ../req-krn.md#REQ-KERNEL-10a # ptr+digest
- source: ../req-krn.md#REQ-KERNEL-11 # ptr+digest
  exclusions: >
  Does NOT define the fold/collision semantics or the head rule (owned by WP-1.3-b.KERNEL); event identity
  from WP-1.3-a.KERNEL; no provenance trailers/notes (CAMPAIGN-3); no forge/host adapter (EPIC-4-b).
  inputs: # ptr+digest
- source: ../../reference/atlas-persist.md#persist-11 # ptr+digest
- source: ../../spec/fspec-merge.md # ptr+digest
  action: Register and implement the git merge driver over the KERNEL merge fold — union by content-hash + re-fold, self-installing on init/clone, append-only JSONL on-disk union; verify two branches merge either order to one byte-identical head, 0 lost, and an unconfigured clone still unions losslessly.
  action_surface: [ read-repo, edit(packages/persist/**), edit(.gitattributes), run-tests(persist), typecheck ]
  guardrails: >
  Edit only under packages/persist/\*\* and .gitattributes. MUST NOT line-merge the log or resolve a nodeKey by
  hand. Merge MUST be direction-independent (byte-identical). Bypassed driver MUST lose/corrupt no event. Do
  not redefine the KERNEL fold — consume it frozen.
  repair_budget: N=3; early-stop on { repeated-identical-failure, no-change diff, semantic-dup edit }.
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-pst.md#SCN-PERSIST-11a-1 # ptr+digest
- source: ../goldens-pst.md#SCN-PERSIST-11b-1 # ptr+digest
- source: ../goldens-pst.md#SCN-PERSIST-11c-1 # ptr+digest
- source: ../goldens-pst.md#SCN-PERSIST-11d-1 # ptr+digest
- source: ../goldens-pst.md#SCN-PERSIST-11e-1 # ptr+digest
- source: ../goldens-pst.md#SCN-PERSIST-11f-1 # ptr+digest
- source: ../goldens-pst.md#SCN-PERSIST-11g-1 # ptr+digest
  deps: [ WP-1.3-b.KERNEL ]
  exit_predicate: all acceptance SCNs green ∧ either-order merge → byte-identical head, 0 lost ∧ colliding-seq no conflict ∧ bypassed-driver loses no event ∧ module gates pass
  context_refs: # closed list
- source: ../../reference/atlas-persist.md
- source: ../../spec/fspec-merge.md
- source: ../req-pst.md
- source: ../goldens-pst.md
  owner: FORGE/persist seat
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-PERSIST-11
