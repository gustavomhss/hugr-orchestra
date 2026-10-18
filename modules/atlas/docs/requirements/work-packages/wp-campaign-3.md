# Work Packages — CAMPAIGN-3 (state S4)

> Provenance, transcript & re-spawn durability. Four epics (EPIC-4-a, EPIC-4-b, EPIC-5-a, EPIC-5-b),
> sliced into one WP per (epic × module). Every substantive field is a `ptr+digest` (driftless law);
> `intent` is the sole prose carve-out (non-authoritative, executor-invisible). `exec` fields
> (`outputs`/`provenance`/`trace_ref`) are present-but-empty at S4-freeze. Digests are tooling-filled at
> freeze — pointer lines carry a `# ptr+digest` marker, no hash is fabricated here.
>
> Pointer roots: `requirements/req-*.md` (REQ text), `requirements/goldens-*.md` (frozen SCN goldens),
> `reference/atlas-*.md` (module contract/anchor), `requirements/invariant-register.md` (rationale).

---

## EPIC-4-a — provenance metering committed per WP

### WP-3.4-a.PERSIST — PERSIST slice of EPIC-4-a

epic: EPIC-4-a
id: WP-3.4-a.PERSIST
content_hash: <filled-at-freeze>
title: Provenance trailer + git note, hashed pointers, full per-agent metering
intent: >
Commit each WP's provenance as a git-native trailer plus a mirroring note, keep large bodies in the CAS
behind hashed pointers, and record complete per-agent metering (model/tokens/gates/verdict) so a unit of
work is auditable for cost and origin. (Prose handle only — not reasoned against.)
source_reqs: # ptr+digest

- source: ../req-pst.md#REQ-PERSIST-3-a # ptr+digest
- source: ../req-pst.md#REQ-PERSIST-3-b # ptr+digest
- source: ../req-pst.md#REQ-PERSIST-4-a # ptr+digest
- source: ../req-pst.md#REQ-PERSIST-4-b # ptr+digest
- source: ../req-pst.md#REQ-PERSIST-4-c # ptr+digest
- source: ../req-pst.md#REQ-PERSIST-6 # ptr+digest
  seam-freezes: [ ]
  anchor: reference/atlas-persist.md#persist-3 · #persist-4 · #persist-6 (provenance/metering contract site) # value
  interface_contract: # ptr+digest
- source: ../../reference/atlas-persist.md#persist-3 # ptr+digest
- source: ../../reference/atlas-persist.md#persist-4 # ptr+digest
  exclusions: > # value
  No merge/CRDT logic (KERNEL/EPIC-3); no forge-adapter or notes-refspec push (EPIC-4-b); no transcript
  large-object or cred-scrub (EPIC-5-a); provenance CONTENT of E-states is exec-filled, not authored here.
  inputs: # ptr+digest
- source: ../../reference/atlas-persist.md#cas-store # ptr+digest
  action: > # value
  Realize the trailer writer, the git-note mirror, the hashed-pointer attachment over CAS, and the metering
  record; verify each against its referenced golden. Zero design choices — transcribe the frozen contract.
  action_surface: [ read(req/golden/reference ptrs), write(persist module target), run(persist test-goldens) ] # value
  guardrails: > # value
  Edit only the PERSIST module target under anchor; no writes to KERNEL/MEM/forge surfaces; large bodies
  MUST go to CAS (never inlined as a git object); no schema invention beyond the referenced contract.
  repair_budget: > # value
  N=3; early-stop on repeated-identical-failure, no-change edit, or semantic-dup of a prior attempt.
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-pst.md#SCN-PERSIST-3a-1 # ptr+digest
- source: ../goldens-pst.md#SCN-PERSIST-3b-1 # ptr+digest
- source: ../goldens-pst.md#SCN-PERSIST-4a-1 # ptr+digest
- source: ../goldens-pst.md#SCN-PERSIST-4b-1 # ptr+digest
- source: ../goldens-pst.md#SCN-PERSIST-4c-1 # ptr+digest
- source: ../goldens-pst.md#SCN-PERSIST-6-1 # ptr+digest
  deps: [ CAMPAIGN-1 (prereq, roadmap) ] parallel_group: [P] # ptr → prereq; safe-parallel with WP-3.4-b.PERSIST
  exit_predicate: all acceptance SCNs green ∧ all module gates pass # value (machine-checkable)
  context_refs: # closed list
- source: ../req-pst.md
- source: ../goldens-pst.md
- source: ../../reference/atlas-persist.md
  owner: PST-builder # value
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-PERSIST-3
- source: ../invariant-register.md#INV-PERSIST-4
- source: ../invariant-register.md#INV-PERSIST-6

---

## EPIC-4-b — host-forge adapter carries the atlas

### WP-3.4-b.PERSIST — PERSIST slice of EPIC-4-b

epic: EPIC-4-b
id: WP-3.4-b.PERSIST
content_hash: <filled-at-freeze>
title: Host-forge adapter, notes push refspec, PR-as-projection, rewrite-surviving trailer datum
intent: >
Abstract the forge behind a host adapter, configure the notes push refspec so the atlas rides every PR,
treat host PR data as a disposable projection, and put clone-required data in a trailer that survives a
history rewrite (while note-carried data honestly orphans). (Prose handle only.)
source_reqs: # ptr+digest

- source: ../req-pst.md#REQ-PERSIST-8-a # ptr+digest
- source: ../req-pst.md#REQ-PERSIST-8-b # ptr+digest
- source: ../req-pst.md#REQ-PERSIST-8-c # ptr+digest
- source: ../req-pst.md#REQ-PERSIST-13-a # ptr+digest
- source: ../req-pst.md#REQ-PERSIST-13-b # ptr+digest
- source: ../req-pst.md#REQ-PERSIST-13-c # ptr+digest
- source: ../req-pst.md#REQ-PERSIST-13-d # ptr+digest
  seam-freezes: [ ]
  anchor: reference/atlas-persist.md#persist-8 · #persist-13 (host-adapter / trailer-durability contract site) # value
  interface_contract: # ptr+digest
- source: ../../reference/atlas-persist.md#persist-8 # ptr+digest
- source: ../../reference/atlas-persist.md#persist-13 # ptr+digest
  exclusions: > # value
  No provenance-field authoring or metering (EPIC-4-a); no transcript large-object / cred-scrub (EPIC-5-a);
  no re-spawn/replay substrate (EPIC-5-b); no forge-specific business logic beyond the abstract adapter.
  inputs: # ptr+digest
- source: ../../reference/atlas-persist.md#cas-store # ptr+digest
  action: > # value
  Realize the abstract host adapter, the notes push-refspec configuration, PR-data-as-projection, and the
  rewrite-surviving trailer datum; verify each against its referenced golden. Transcription only.
  action_surface: [ read(req/golden/reference ptrs), write(persist module target), run(persist test-goldens) ] # value
  guardrails: > # value
  Edit only the PERSIST module target under anchor; the forge is reached ONLY through the adapter (no direct
  forge calls elsewhere); clone-required data MUST live in a trailer, not solely a note.
  repair_budget: > # value
  N=3; early-stop on repeated-identical-failure, no-change edit, or semantic-dup of a prior attempt.
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-pst.md#SCN-PERSIST-8a-1 # ptr+digest
- source: ../goldens-pst.md#SCN-PERSIST-8b-1 # ptr+digest
- source: ../goldens-pst.md#SCN-PERSIST-8c-1 # ptr+digest
- source: ../goldens-pst.md#SCN-PERSIST-13a-1 # ptr+digest
- source: ../goldens-pst.md#SCN-PERSIST-13b-1 # ptr+digest
- source: ../goldens-pst.md#SCN-PERSIST-13c-1 # ptr+digest
- source: ../goldens-pst.md#SCN-PERSIST-13d-1 # ptr+digest
  deps: [ CAMPAIGN-1 (prereq, roadmap) ] parallel_group: [P] # ptr → prereq; safe-parallel with WP-3.4-a.PERSIST
  exit_predicate: all acceptance SCNs green ∧ all module gates pass # value (machine-checkable)
  context_refs: # closed list
- source: ../req-pst.md
- source: ../goldens-pst.md
- source: ../../reference/atlas-persist.md
  owner: PST-builder # value
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-PERSIST-8
- source: ../invariant-register.md#INV-PERSIST-13

---

## EPIC-5-a — transcript retained in full, cred-scrubbed

> Two modules touched (PERSIST, MEM). One cross-module obligation: the credential-scrub / named-scanner
> pre-write gate is produced on the PERSIST transcript-durability path and consumed by MEM's export write.
> Seam-freeze owner = PERSIST (upstream producer of the redact-at-source + server-side scanner); consumer =
> MEM. Not smeared — the obligation lives once on the owner card.

### WP-3.5-a.PERSIST — PERSIST slice of EPIC-5-a

epic: EPIC-5-a
id: WP-3.5-a.PERSIST
content_hash: <filled-at-freeze>
title: Transcript as scrubbed CAS large-object, pointer-only in git, redact-at-source
intent: >
Persist the raw transcript in full as a content-addressed large object with only a pointer in git, redact
secrets at source before the object forms, and keep the record lossless (adjacent non-secret bytes intact).
(Prose handle only.)
source_reqs: # ptr+digest

- source: ../req-pst.md#REQ-PERSIST-10-a # ptr+digest
- source: ../req-pst.md#REQ-PERSIST-10-b # ptr+digest
- source: ../req-pst.md#REQ-PERSIST-10-c # ptr+digest
- source: ../req-pst.md#REQ-PERSIST-10-d # ptr+digest
- source: ../req-pst.md#REQ-PERSIST-10a-a # ptr+digest
- source: ../req-pst.md#REQ-PERSIST-10a-b # ptr+digest
- source: ../req-pst.md#REQ-PERSIST-10a-c # ptr+digest
- source: ../req-pst.md#REQ-PERSIST-10a-d # ptr+digest
- source: ../req-pst.md#REQ-PERSIST-10a-e # ptr+digest
  seam-freezes: [ "cred-scrub / named-scanner pre-write gate owned-by PERSIST, consumed-by MEM" ]
  anchor: reference/atlas-persist.md#persist-10 · #persist-10a (transcript large-object / redact-at-source site) # value
  interface_contract: # ptr+digest
- source: ../../reference/atlas-persist.md#persist-10 # ptr+digest
- source: ../../reference/atlas-persist.md#persist-10a # ptr+digest
  exclusions: > # value
  No memory-export JSON path (that is WP-3.5-a.MEM, consumer of this seam); no re-spawn/replay (EPIC-5-b);
  the scanner detection-engine ARCHITECTURE (REQ-PERSIST-10a-c server-side hook, 10a-d ≥2 engines) is
  domain-delegated to billy/FR-12 — NOT modelled here, per the frozen goldens delegation note.
  inputs: # ptr+digest
- source: ../../reference/atlas-persist.md#cas-store # ptr+digest
  action: > # value
  Realize the full-transcript CAS large-object, the git pointer, lossless size-mitigation, and the
  redact-at-source scrub; verify against the referenced goldens. Transcription only.
  action_surface: [ read(req/golden/reference ptrs), write(persist module target), run(persist test-goldens) ] # value
  guardrails: > # value
  Edit only the PERSIST module target under anchor; a raw credential MUST NOT reach the content-addressed
  object; git carries only the content-hash pointer; the scrub MUST NOT abridge non-secret bytes.
  repair_budget: > # value
  N=3; early-stop on repeated-identical-failure, no-change edit, or semantic-dup of a prior attempt.
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-pst.md#SCN-PERSIST-10a-1 # ptr+digest
- source: ../goldens-pst.md#SCN-PERSIST-10-b-1 # ptr+digest
- source: ../goldens-pst.md#SCN-PERSIST-10-c-1 # ptr+digest
- source: ../goldens-pst.md#SCN-PERSIST-10-d-1 # ptr+digest
- source: ../goldens-pst.md#SCN-PERSIST-10a-a-1 # ptr+digest
- source: ../goldens-pst.md#SCN-PERSIST-10a-b-1 # ptr+digest
- source: ../goldens-pst.md#SCN-PERSIST-10a-e-1 # ptr+digest
- "REQ-PERSIST-10a-c / 10a-d: no PST golden — acceptance domain-delegated to billy/FR-12" # ptr → requirements/goldens-pst.md (delegation note, frozen upstream)
  deps: [ CAMPAIGN-1 (prereq, roadmap) ]
  exit_predicate: all non-delegated acceptance SCNs green ∧ delegated 10a-c/10a-d satisfied by billy/FR-12 gate ∧ module gates pass # value
  context_refs: # closed list
- source: ../req-pst.md
- source: ../goldens-pst.md
- source: ../../reference/atlas-persist.md
  owner: PST-builder # value
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-PERSIST-10
- source: ../invariant-register.md#INV-PERSIST-10a

### WP-3.5-a.MEM — MEM slice of EPIC-5-a

epic: EPIC-5-a
id: WP-3.5-a.MEM
content_hash: <filled-at-freeze>
title: Memory exports to open JSON; named-scanner hit blocks the write
intent: >
Export every memory type to open JSON round-trippable 1:1, and gate the write behind the named cred-scanner
so a scanner hit fails the export closed. Consumes the scrub/scanner contract frozen on the PERSIST side.
(Prose handle only.)
source_reqs: # ptr+digest

- source: ../req-mem.md#REQ-MEM-9a # ptr+digest
- source: ../req-mem.md#REQ-MEM-9b # ptr+digest
- source: ../req-mem.md#REQ-MEM-9c # ptr+digest
  seam-freezes: [ "cred-scrub / named-scanner pre-write gate consumed-from PERSIST (frozen upstream)" ]
  anchor: reference/atlas-memory.md#mem-9 (memory-export JSON + pre-write scanner gate site) # value
  interface_contract: # ptr+digest
- source: ../../reference/atlas-persist.md#persist-10a # ptr+digest
- source: ../../reference/atlas-memory.md#mem-9 # ptr+digest
  exclusions: > # value
  Does NOT author the scanner/scrub itself (owned by WP-3.5-a.PERSIST); no transcript large-object; no
  re-spawn recall (EPIC-5-b); no memory type/scope decisions beyond the frozen export contract.
  inputs: # ptr+digest
- source: ../../reference/atlas-persist.md#persist-10a # ptr+digest
  action: > # value
  Realize the open-JSON export/import round-trip and wire the pre-write named-scanner gate to fail closed on
  a hit; verify against the referenced goldens. Transcription only.
  action_surface: [ read(req/golden/reference/seam ptrs), write(memory module target), run(memory test-goldens) ] # value
  guardrails: > # value
  Edit only the MEM module target under anchor; MUST call the PERSIST-owned scanner gate (no re-implementation);
  a scanner hit MUST block the write (fail-closed); export MUST be open JSON with no lock-in encoding.
  repair_budget: > # value
  N=3; early-stop on repeated-identical-failure, no-change edit, or semantic-dup of a prior attempt.
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-mem.md#SCN-MEM-9a-1 # ptr+digest
- source: ../goldens-mem.md#SCN-MEM-9b-1 # ptr+digest
- source: ../goldens-mem.md#SCN-MEM-9c-1 # ptr+digest
  deps: [ WP-3.5-a.PERSIST (seam: scanner gate), CAMPAIGN-1 (prereq) ]
  exit_predicate: all acceptance SCNs green ∧ seam contract resolves (digest-match) ∧ module gates pass # value
  context_refs: # closed list
- source: ../req-mem.md
- source: ../goldens-mem.md
- source: ../../reference/atlas-memory.md
- source: ../../reference/atlas-persist.md#persist-10a
  owner: MEM-builder # value
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-MEM-9

---

## EPIC-5-b — re-spawn: idempotent redispatch & replay

> Two modules touched (PERSIST, MEM). One cross-module obligation: the Checkpoint / archived-fold re-spawn
> substrate (idempotent redispatch + faithful replay, resume-never-claimed) is produced on the PERSIST side
> and consumed by MEM's re-spawn recall (recall pushed off the archived fold, deterministic). Seam-freeze
> owner = PERSIST (upstream producer); consumer = MEM. Not smeared.

### WP-3.5-b.PERSIST — PERSIST slice of EPIC-5-b

epic: EPIC-5-b
id: WP-3.5-b.PERSIST
content_hash: <filled-at-freeze>
title: Ephemeral agent re-invokable off a Checkpoint; idempotent redispatch; faithful replay, no resume claim
intent: >
Make an ephemeral seat reconstructable from a clean clone with no non-git state: idempotent redispatch of
the seat and faithful replay off a Checkpoint, while never claiming deterministic resume. (Prose handle only.)
source_reqs: # ptr+digest

- source: ../req-pst.md#REQ-PERSIST-7-a # ptr+digest
- source: ../req-pst.md#REQ-PERSIST-7-b # ptr+digest
- source: ../req-pst.md#REQ-PERSIST-10b-a # ptr+digest
- source: ../req-pst.md#REQ-PERSIST-10b-b # ptr+digest
- source: ../req-pst.md#REQ-PERSIST-10b-c # ptr+digest
- source: ../req-pst.md#REQ-PERSIST-10b-d # ptr+digest
  seam-freezes: [ "Checkpoint / archived-fold re-spawn substrate owned-by PERSIST, consumed-by MEM" ]
  anchor: reference/atlas-persist.md#persist-7 · #persist-10b (re-invoke / replay-not-resume site) # value
  interface_contract: # ptr+digest
- source: ../../reference/atlas-persist.md#persist-7 # ptr+digest
- source: ../../reference/atlas-persist.md#persist-10b # ptr+digest
  exclusions: > # value
  No memory versioning/recall (that is WP-3.5-b.MEM, consumer of this seam); no transcript large-object /
  cred-scrub (EPIC-5-a); no provenance/forge (EPIC-4); MUST NOT expose a deterministic-resume API.
  inputs: # ptr+digest
- source: ../../reference/atlas-persist.md#cas-store # ptr+digest
  action: > # value
  Realize idempotent seat redispatch, zero non-git-state re-invocation, faithful transcript replay, and the
  Checkpoint substrate distinct from the raw transcript; verify against the referenced goldens. Transcription only.
  action_surface: [ read(req/golden/reference ptrs), write(persist module target), run(persist test-goldens) ] # value
  guardrails: > # value
  Edit only the PERSIST module target under anchor; NO deterministic-resume API on the surface; re-invocation
  MUST read zero non-git state; replay re-feeds recorded I/O, never the live model.
  repair_budget: > # value
  N=3; early-stop on repeated-identical-failure, no-change edit, or semantic-dup of a prior attempt.
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-pst.md#SCN-PERSIST-7a-1 # ptr+digest
- source: ../goldens-pst.md#SCN-PERSIST-7b-1 # ptr+digest
- source: ../goldens-pst.md#SCN-PERSIST-10b-a-1 # ptr+digest
- source: ../goldens-pst.md#SCN-PERSIST-10b-b-1 # ptr+digest
- source: ../goldens-pst.md#SCN-PERSIST-10b-c-1 # ptr+digest
- source: ../goldens-pst.md#SCN-PERSIST-10b-d-1 # ptr+digest
  deps: [ CAMPAIGN-1 (prereq, roadmap) ]
  exit_predicate: all acceptance SCNs green ∧ all module gates pass # value (machine-checkable)
  context_refs: # closed list
- source: ../req-pst.md
- source: ../goldens-pst.md
- source: ../../reference/atlas-persist.md
  owner: PST-builder # value
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-PERSIST-7
- source: ../invariant-register.md#INV-PERSIST-10b

### WP-3.5-b.MEM — MEM slice of EPIC-5-b

epic: EPIC-5-b
id: WP-3.5-b.MEM
content_hash: <filled-at-freeze>
title: Every memory type versioned & travels; recall pushed at re-spawn off the archived fold
intent: >
Version every memory type so it travels with the record, and at re-spawn push the seat's own closing recall
deterministically off the archived fold — scoped to own + resumed only. Consumes the PERSIST Checkpoint /
archived-fold substrate. (Prose handle only.)
source_reqs: # ptr+digest

- source: ../req-mem.md#REQ-MEM-10a # ptr+digest
- source: ../req-mem.md#REQ-MEM-10b # ptr+digest
- source: ../req-mem.md#REQ-MEM-13a # ptr+digest
- source: ../req-mem.md#REQ-MEM-13b # ptr+digest
- source: ../req-mem.md#REQ-MEM-13c # ptr+digest
  seam-freezes: [ "Checkpoint / archived-fold re-spawn substrate consumed-from PERSIST (frozen upstream)" ]
  anchor: reference/atlas-memory.md#mem-10 · #mem-13 (memory-versioning + re-spawn recall site) # value
  interface_contract: # ptr+digest
- source: ../../reference/atlas-persist.md#persist-10b # ptr+digest
- source: ../../reference/atlas-memory.md#mem-13 # ptr+digest
  exclusions: > # value
  Does NOT author the Checkpoint/redispatch substrate (owned by WP-3.5-b.PERSIST); no transcript/cred-scrub
  (EPIC-5-a); recall MUST NOT claim deterministic resume; scoped to own + resumed fold only.
  inputs: # ptr+digest
- source: ../../reference/atlas-persist.md#persist-10b # ptr+digest
  action: > # value
  Realize per-type memory versioning that travels, and the re-spawn recall pushed deterministically off the
  archived fold scoped to own+resumed; verify against the referenced goldens. Transcription only.
  action_surface: [ read(req/golden/reference/seam ptrs), write(memory module target), run(memory test-goldens) ] # value
  guardrails: > # value
  Edit only the MEM module target under anchor; recall MUST derive from the PERSIST-owned archived fold (no
  re-implementation); push scoped to own+resumed only; recall deterministic off the archived record.
  repair_budget: > # value
  N=3; early-stop on repeated-identical-failure, no-change edit, or semantic-dup of a prior attempt.
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-mem.md#SCN-MEM-10a-1 # ptr+digest
- source: ../goldens-mem.md#SCN-MEM-10b-1 # ptr+digest
- source: ../goldens-mem.md#SCN-MEM-13a-1 # ptr+digest
- source: ../goldens-mem.md#SCN-MEM-13b-1 # ptr+digest
- source: ../goldens-mem.md#SCN-MEM-13c-1 # ptr+digest
  deps: [ WP-3.5-b.PERSIST (seam: archived-fold substrate), CAMPAIGN-1 (prereq) ]
  exit_predicate: all acceptance SCNs green ∧ seam contract resolves (digest-match) ∧ module gates pass # value
  context_refs: # closed list
- source: ../req-mem.md
- source: ../goldens-mem.md
- source: ../../reference/atlas-memory.md
- source: ../../reference/atlas-persist.md#persist-10b
  owner: MEM-builder # value
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-MEM-10
- source: ../invariant-register.md#INV-MEM-13
