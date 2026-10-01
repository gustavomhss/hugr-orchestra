# Work Packages — CAMPAIGN-7 (state S4)

> The governed tool surface & tri-transport. Epics EPIC-26-a / -b / -c, all single-module (**TOOLS**); plus
> **EPIC-32** (`atlas-diff` version-delta projection), a two-module vertical **PERSIST → TOOLS**.
> EPIC-26-a/-b/-c are single-module ⇒ one WP per epic and **no seam-freeze**. EPIC-32 spans two modules ⇒ one WP
> per module (WP-7.32.PERSIST / WP-7.32.TOOLS) with a **single seam-freeze**: the version-delta contract is
> owned by the upstream **PERSIST** slice (it computes the read-only fold-diff) and consumed by the **TOOLS**
> slice (it surfaces `atlas-diff`) — never smeared into both. TLS authors no FSPEC; it consumes KERNEL's
> store/`FSPEC-merge` frozen upstream — recorded as a consumed contract in `interface_contract`, never smeared
> into a WP it does not own.
>
> Driftless law: every substantive field below is a `ptr+digest` (the `# ptr+digest` marker; digest is
> tooling-filled at freeze). `intent` is the one prose carve-out (non-authoritative, executor-invisible).
> The `exec` fields (`outputs`/`provenance`/`trace_ref`) are present-but-empty at S4-freeze.

---

## EPIC-26-a — single governed write-door & store integrity

### WP-7.26-a.TOOLS — TOOLS slice of EPIC-26-a

epic: EPIC-26-a
id: WP-7.26-a.TOOLS
content_hash: <filled-at-freeze>
title: governed write-doors + append-only/permissioned store integrity
intent: >
Wire the governance surface to exactly five tools with every write flowing through a governed door
(WRITE_PATHS = {atlas-emit, atlas-link}, ADR-0003), refuse every
back-channel / direct / ungrounded write at write-or-read, keep read projections read-only, and make each
tool pure+total (malformed fails closed). Human handle only — non-authoritative.
source_reqs: # ptr+digest

- source: ../req-tls.md#REQ-TOOLS-1a # ptr+digest
- source: ../req-tls.md#REQ-TOOLS-1b # ptr+digest
- source: ../req-tls.md#REQ-TOOLS-1c # ptr+digest
- source: ../req-tls.md#REQ-TOOLS-1d # ptr+digest
- source: ../req-tls.md#REQ-TOOLS-2a # ptr+digest
- source: ../req-tls.md#REQ-TOOLS-2b # ptr+digest
- source: ../req-tls.md#REQ-TOOLS-15a # ptr+digest
- source: ../req-tls.md#REQ-TOOLS-15b # ptr+digest
- source: ../req-tls.md#REQ-TOOLS-15c # ptr+digest
  seam-freezes: [ ]
  anchor: # value
  target: the TOOLS governance layer — the five-tool surface {atlas-init, atlas-query, atlas-emit,
  atlas-reconcile, atlas-link} + the store medium; production tools differential-tested against the named reference
  oracles tools/ref/guard.ts (WRITE_PATHS/governed-write-doors {atlas-emit, atlas-link}; surface = the five-tool Tool union in types.ts;
  append-only store medium = @atlas/persist) · tools/ref/handler.ts (pure/total wrapper) ·
  tools/ref/emit.ts (fail-closed writer). Insertion site = the write-door + store-integrity entry points.
  interface_contract: # ptr+digest
- source: ../../reference/atlas-tools.md#tools-1 # ptr+digest
- source: ../../reference/atlas-tools.md#tools-2 # ptr+digest
- source: ../../reference/atlas-tools.md#tools-15 # ptr+digest
- source: ../../reference/atlas-kernel.md#store # ptr+digest
  exclusions: # value
- Adversarial security-exploitability of the write-door (shell-armed seat red-teaming the
  append-only/permission model) is billy / FR-12 (FORTRESS) — NOT authored here; 1c/15b/15c assert the
  FUNCTIONAL refusal only.
- The KNOW-5 mechanical/semantic classifier and drift/reconcile behaviour (TOOLS-8/13) — not in this epic.
- CLI/MCP parity, doctor, transports (EPIC-26-b / -c) — out of scope here.
  inputs: # ptr+digest
- source: ../goldens-tls.md#concrete-fixture-universe # ptr+digest
- source: tools/ref/guard.ts # ptr+digest
- source: tools/ref/handler.ts # ptr+digest
- source: tools/ref/emit.ts # ptr+digest
  action: # value (zero-decision recipe)
  Implement the five-tool surface + store so each acceptance SCN passes as a differential/conformance run
  against its named tools/ref/\*.ts oracle; run the goldens harness; do not add a sixth governance tool or an
  ungoverned write path outside {atlas-emit, atlas-link}.
  action_surface: # value
  [ Read, Edit, Write (TOOLS package only), run goldens/conformance harness, run PBT-fuzz for 2b ]
  guardrails: # value
- edit only within the TOOLS package + its tests; never edit ../reference/\*, ../req-tls.md, ../goldens-tls.md
- no new write path may surface; writePaths must stay == 1 (atlas-emit)
- no network; deterministic (no wall-clock / mutable-cache reads — purity)
  repair_budget: # value
  N: 3 ; early-stop on { repeated-identical-failure, no-change-diff, semantic-duplicate-edit }
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-tls.md#SCN-TOOLS-1a-1 # ptr+digest
- source: ../goldens-tls.md#SCN-TOOLS-1b-1 # ptr+digest
- source: ../goldens-tls.md#SCN-TOOLS-1c-1 # ptr+digest
- source: ../goldens-tls.md#SCN-TOOLS-1d-1 # ptr+digest
- source: ../goldens-tls.md#SCN-TOOLS-2a-1 # ptr+digest
- source: ../goldens-tls.md#SCN-TOOLS-2b-1 # ptr+digest
- source: ../goldens-tls.md#SCN-TOOLS-15a-1 # ptr+digest
- source: ../goldens-tls.md#SCN-TOOLS-15b-1 # ptr+digest
- source: ../goldens-tls.md#SCN-TOOLS-15c-1 # ptr+digest
  deps: [ ] parallel_group: —
  exit_predicate: # value
  all 9 acceptance SCNs green ∧ conformance/PBT gates pass ∧ surface count == 5 ∧ writePaths == 2 (WRITE_PATHS == {atlas-emit, atlas-link}) ∧
  ungroundedRowsServed == 0 ∧ no tool throws on malformed input
  context_refs: # closed list
- source: ../../reference/atlas-tools.md#tools-1
- source: ../../reference/atlas-tools.md#tools-2
- source: ../../reference/atlas-tools.md#tools-15
- source: ../goldens-tls.md
  owner: charlie (FORGE) # value
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-TOOLS-1
- source: ../invariant-register.md#INV-TOOLS-2
- source: ../invariant-register.md#INV-TOOLS-15

---

## EPIC-26-b — CLI/MCP parity, guidance & read-only doctor

### WP-7.26-b.TOOLS — TOOLS slice of EPIC-26-b

epic: EPIC-26-b
id: WP-7.26-b.TOOLS
content_hash: <filled-at-freeze>
title: CLI≡MCP parity on one schema + per-result guidance + read/advisory-only doctor
intent: >
One published schema behind both the CLI and MCP adapters over the one handler (byte-identical results incl.
identical malformed rejection), every Verdict carries {next, invariant} guidance, and atlas doctor stays a
read/advisory-only diagnostic view whose proposed writes funnel through atlas-emit. Human handle only.
source_reqs: # ptr+digest

- source: ../req-tls.md#REQ-TOOLS-3a # ptr+digest
- source: ../req-tls.md#REQ-TOOLS-3b # ptr+digest
- source: ../req-tls.md#REQ-TOOLS-4 # ptr+digest
- source: ../req-tls.md#REQ-TOOLS-12a # ptr+digest
- source: ../req-tls.md#REQ-TOOLS-12b # ptr+digest
- source: ../req-tls.md#REQ-TOOLS-12c # ptr+digest
  seam-freezes: [ ]
  anchor: # value
  target: the CLI + MCP adapters over the one handler tools/ref/handler.ts (which carries the Verdict
  guidance stamp, TOOLS-4; Verdict type in tools/ref/types.ts), and the doctor projection
  tools/ref/doctor.ts. Insertion site = the
  two transport adapters + the doctor sub-command surface (archive / why-broken / hot-set / reground-plan).
  interface_contract: # ptr+digest
- source: ../../reference/atlas-tools.md#tools-3 # ptr+digest
- source: ../../reference/atlas-tools.md#tools-4 # ptr+digest
- source: ../../reference/atlas-tools.md#tools-12 # ptr+digest
- source: tools/ref/handler.ts # ptr+digest
  exclusions: # value
- The write-door + store integrity (EPIC-26-a) and the tri-transport node handler / spawn ladder
  (EPIC-26-c) — out of scope here.
- doctor's diagnostic ANALYSES themselves (why-broken heuristics) are consumed, not authored here; this WP
  asserts only the read/advisory / no-persist / no-write-authority property.
  inputs: # ptr+digest
- source: ../goldens-tls.md#concrete-fixture-universe # ptr+digest
- source: tools/ref/handler.ts # ptr+digest
- source: tools/ref/doctor.ts # ptr+digest
  action: # value
  Build the CLI+MCP adapters over the one handler and the doctor projection so each acceptance SCN passes:
  the PBT witnesses (3a/3b) prove cli(x) ≡ mcp(x) incl. malformed; the conformance SCNs prove per-result
  guidance and doctor no-write-authority. Run the goldens harness.
  action_surface: # value
  [ Read, Edit, Write (TOOLS package only), run goldens/conformance harness, run PBT equivalence harness for 3a/3b ]
  guardrails: # value
- edit only within the TOOLS package + its tests; the two transports MUST NOT diverge (no MCP-only envelope,
  no CLI-only coercion)
- doctor must add no store-mutating method; directStoreMutations must stay == 0
- governance surface stays == 5 (doctor is not a governance tool)
  repair_budget: # value
  N: 3 ; early-stop on { repeated-identical-failure, no-change-diff, semantic-duplicate-edit }
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-tls.md#SCN-TOOLS-3a-1 # ptr+digest
- source: ../goldens-tls.md#SCN-TOOLS-3b-1 # ptr+digest
- source: ../goldens-tls.md#SCN-TOOLS-4-1 # ptr+digest
- source: ../goldens-tls.md#SCN-TOOLS-12a-1 # ptr+digest
- source: ../goldens-tls.md#SCN-TOOLS-12b-1 # ptr+digest
- source: ../goldens-tls.md#SCN-TOOLS-12c-1 # ptr+digest
  deps: [ WP-7.26-a.TOOLS ] parallel_group: — (SEQUENTIAL before WP-7.26-c.TOOLS: shared src/handler.ts per wave-plan §Conflict-map)
  exit_predicate: # value
  all 6 acceptance SCNs green ∧ PBT equivalence (cli≡mcp incl. malformed) holds ∧ emptyGuidance == 0 ∧
  directStoreMutations == 0 ∧ surface stays == 5
  context_refs: # closed list
- source: ../../reference/atlas-tools.md#tools-3
- source: ../../reference/atlas-tools.md#tools-4
- source: ../../reference/atlas-tools.md#tools-12
- source: ../goldens-tls.md
  owner: charlie (FORGE) # value
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-TOOLS-3
- source: ../invariant-register.md#INV-TOOLS-4
- source: ../invariant-register.md#INV-TOOLS-12

---

## EPIC-26-c — tri-transport addressability & spawn ladder

### WP-7.26-c.TOOLS — TOOLS slice of EPIC-26-c

epic: EPIC-26-c
id: WP-7.26-c.TOOLS
content_hash: <filled-at-freeze>
title: tri-transport byte-identity (MCP/poke/CLI) + native-first honest spawn ladder
intent: >
Every node is addressable by content address over MCP, poke, and CLI against the one handler with a
byte-identical Verdict contract and no added write path; the CLI is unscoped; push reaches a no-grant seat;
ad-hoc pull walks the fixed native-first ladder (SDK-MCP → registered-MCP+grant → poke-as-file → relay →
CLI), down-ranks tiers 1&2 on an MCP-incapable harness, never silently falls through a native tier, and
reports the tier it actually started on. Human handle only.
source_reqs: # ptr+digest

- source: ../req-tls.md#REQ-TOOLS-10a # ptr+digest
- source: ../req-tls.md#REQ-TOOLS-10b # ptr+digest
- source: ../req-tls.md#REQ-TOOLS-10c # ptr+digest
- source: ../req-tls.md#REQ-TOOLS-10d # ptr+digest
- source: ../req-tls.md#REQ-TOOLS-11-a # ptr+digest
- source: ../req-tls.md#REQ-TOOLS-11-b # ptr+digest
- source: ../req-tls.md#REQ-TOOLS-11-c # ptr+digest
- source: ../req-tls.md#REQ-TOOLS-11-d # ptr+digest
- source: ../req-tls.md#REQ-TOOLS-11a-a # ptr+digest
- source: ../req-tls.md#REQ-TOOLS-11a-b # ptr+digest
- source: ../req-tls.md#REQ-TOOLS-11a-c # ptr+digest
- source: ../req-tls.md#REQ-TOOLS-11a-d # ptr+digest
  seam-freezes: [ ]
  anchor: # value
  target: the tri-transport node handler tools/ref/handler.ts (one handler behind MCP / poke / CLI) and the
  direction-split spawn/pull resolver tools/ref/transport.ts. Insertion site = the three transport bindings +
  the native-first ladder resolver (spawn, down-rank, report startedTier).
  interface_contract: # ptr+digest
- source: ../../reference/atlas-tools.md#tools-10 # ptr+digest
- source: ../../reference/atlas-tools.md#tools-11 # ptr+digest
- source: ../../reference/atlas-tools.md#tools-11a # ptr+digest
- source: tools/ref/handler.ts # ptr+digest
  exclusions: # value
- The no-write-path arm (10c) is a POSITIVE reference-model property of the same handler (a write attempt is
  refused / no store-mutating method) — NOT a formal model; formal verification is out of scope.
- The write-door + store (EPIC-26-a) and CLI/MCP parity + doctor (EPIC-26-b) — out of scope here.
  inputs: # ptr+digest
- source: ../goldens-tls.md#concrete-fixture-universe # ptr+digest
- source: tools/ref/handler.ts # ptr+digest
- source: tools/ref/transport.ts # ptr+digest
  action: # value
  Bind the one handler to the three transports and build the native-first ladder so each acceptance SCN
  passes: PBT witnesses (10a–10d) prove mcp(a)≡poke(a)≡cli(a) + contract identity + no-write-path + CLI
  unscoped; conformance SCNs (11-_, 11a-_) prove push-no-grant, native-first order, one-handler tier
  equality, SDK in-process spawn, MCP-incapable down-rank, no silent fall-through, honest startedTier. Run
  the goldens harness.
  action_surface: # value
  [ Read, Edit, Write (TOOLS package only), run goldens/conformance harness, run PBT tri-equivalence harness for 10a–10d ]
  guardrails: # value
- edit only within the TOOLS package + its tests; the three transports MUST NOT diverge in contract
- add NO write path over any transport (all read/subscribe; writes funnel through atlas-emit)
- the ladder must never silently fall through an advertised-native tier and must report the true startedTier
  repair_budget: # value
  N: 3 ; early-stop on { repeated-identical-failure, no-change-diff, semantic-duplicate-edit }
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-tls.md#SCN-TOOLS-10a-1 # ptr+digest
- source: ../goldens-tls.md#SCN-TOOLS-10b-1 # ptr+digest
- source: ../goldens-tls.md#SCN-TOOLS-10c-1 # ptr+digest
- source: ../goldens-tls.md#SCN-TOOLS-10d-1 # ptr+digest
- source: ../goldens-tls.md#SCN-TOOLS-11-a-1 # ptr+digest
- source: ../goldens-tls.md#SCN-TOOLS-11-b-1 # ptr+digest
- source: ../goldens-tls.md#SCN-TOOLS-11-c-1 # ptr+digest
- source: ../goldens-tls.md#SCN-TOOLS-11-d-1 # ptr+digest
- source: ../goldens-tls.md#SCN-TOOLS-11a-a-1 # ptr+digest
- source: ../goldens-tls.md#SCN-TOOLS-11a-b-1 # ptr+digest
- source: ../goldens-tls.md#SCN-TOOLS-11a-c-1 # ptr+digest
- source: ../goldens-tls.md#SCN-TOOLS-11a-d-1 # ptr+digest
  deps: [ WP-7.26-a.TOOLS, WP-7.26-b.TOOLS ] parallel_group: — (SEQUENTIAL after WP-7.26-b.TOOLS: shared src/handler.ts per wave-plan §Conflict-map)
  exit_predicate: # value
  all 12 acceptance SCNs green ∧ PBT tri-equivalence (mcp≡poke≡cli) holds ∧ no write path added on any
  transport ∧ ladder native-first order preserved ∧ startedTier reported honestly per harness
  context_refs: # closed list
- source: ../../reference/atlas-tools.md#tools-10
- source: ../../reference/atlas-tools.md#tools-11
- source: ../../reference/atlas-tools.md#tools-11a
- source: ../goldens-tls.md
  owner: charlie (FORGE) # value
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-TOOLS-10
- source: ../invariant-register.md#INV-TOOLS-11
- source: ../invariant-register.md#INV-TOOLS-11a

---

## EPIC-32 — atlas-diff (version-delta projection)

### WP-7.32.PERSIST — PERSIST slice of EPIC-32

epic: EPIC-32
id: WP-7.32.PERSIST
content_hash: <filled-at-freeze>
title: version-delta = deterministic read-only fold-diff (added/edited/superseded/decayed + provenance)
intent: >
Compute diff(shaA,shaB) as a PURE READ over the two folded AtlasStates: partition the changed facts into
added/edited/superseded/decayed, each carrying its provenance, byte-identical across runs and independent of
fold/event order, materializing no stored diff. Owns the version-delta contract the TOOLS slice surfaces.
Human handle only — non-authoritative.
source_reqs: # ptr+digest

- source: ../req-pst.md#REQ-PERSIST-14-a # ptr+digest
- source: ../req-pst.md#REQ-PERSIST-14-b # ptr+digest
- source: ../req-pst.md#REQ-PERSIST-14-c # ptr+digest
- source: ../req-pst.md#REQ-PERSIST-14-d # ptr+digest
- source: ../req-pst.md#REQ-PERSIST-14-e # ptr+digest
- source: ../req-pst.md#REQ-PERSIST-14-f # ptr+digest
  seam-freezes: [ "version-delta contract owned-by PERSIST, consumed-by TOOLS" ]
  anchor: # value
  target: the PERSIST version-delta — the read-only fold-diff `persist/ref/diff.ts` layered over the
  FSPEC-merge `fold` (`kernel/ref/fold.ts`), partitioning `fold(shaA)` vs `fold(shaB)` by the PERSIST-5
  supersede/decay lifecycle. Insertion site = the `diff(shaA,shaB)` read entry point (no write path).
  interface_contract: # ptr+digest
- source: ../../reference/atlas-persist.md#persist-14 # ptr+digest
- source: ../method-tags-pst.md#INV-PERSIST-14 # ptr+digest
- source: ../../spec/fspec-merge.md#down # ptr+digest (the `fold` reducer consumed as oracle, frozen upstream)
  exclusions: # value
- The `atlas-diff` CLI/MCP surface (surfacing the delta, CLI≡MCP, no write path, write surface stays {atlas-emit, atlas-link}) is the
  TOOLS slice WP-7.32.TOOLS — NOT authored here; this WP owns the delta computation only.
- No new merge/fold model — the fold is consumed frozen from CAMPAIGN-1 (`FSPEC-merge`); a materialized/stored
  diff is explicitly out of scope (ADR-P14: read-only fold-diff over the log).
  inputs: # ptr+digest
- source: ../goldens-pst.md#req-persist-14--version-delta--read-only-fold-diff-pbt--reuses-fspec-merge-fold # ptr+digest
- source: persist/ref/diff.ts # ptr+digest
- source: kernel/ref/fold.ts # ptr+digest
  action: # value (zero-decision recipe)
  Implement `diff(shaA,shaB) = partition(fold(shaA), fold(shaB))` so each acceptance SCN passes as a PBT/
  conformance run against `persist/ref/diff.ts` (reusing the `fold` oracle); mutate nothing, materialize no
  stored diff, carry provenance on every entry; run the goldens harness.
  action_surface: # value
  [ Read, Edit, Write (PERSIST package only), run goldens/conformance harness, run PBT for 14-a/14-b/14-e/14-f ]
  guardrails: # value
- edit only within the PERSIST package + its tests; never edit ../reference/\*, ../req-pst.md, ../goldens-pst.md
- the diff must mutate no state (mutations == 0) and materialize no stored diff (fold-comparison only)
- no network; deterministic (byte-identical across runs; order-independent over the fold)
  repair_budget: # value
  N: 3 ; early-stop on { repeated-identical-failure, no-change-diff, semantic-duplicate-edit }
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-pst.md#SCN-PERSIST-14a-1 # ptr+digest
- source: ../goldens-pst.md#SCN-PERSIST-14b-1 # ptr+digest
- source: ../goldens-pst.md#SCN-PERSIST-14c-1 # ptr+digest
- source: ../goldens-pst.md#SCN-PERSIST-14d-1 # ptr+digest
- source: ../goldens-pst.md#SCN-PERSIST-14e-1 # ptr+digest
- source: ../goldens-pst.md#SCN-PERSIST-14f-1 # ptr+digest
  deps: [ ] parallel_group: —
  exit_predicate: # value
  all 6 acceptance SCNs green ∧ PBT (partition-totality · determinism · order-independence) holds ∧
  mutations == 0 ∧ no materialized diff ∧ every delta entry carries provenance ∧ all pointer digests resolve
  context_refs: # closed list
- source: ../../reference/atlas-persist.md#persist-14
- source: ../method-tags-pst.md
- source: ../goldens-pst.md
  owner: charlie (FORGE) # value
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-PERSIST-14

---

### WP-7.32.TOOLS — TOOLS slice of EPIC-32

epic: EPIC-32
id: WP-7.32.TOOLS
content_hash: <filled-at-freeze>
title: atlas-diff read-only version projection (CLI≡MCP · no write path · write surface stays the two governed doors)
intent: >
Surface the PERSIST-14 version-delta through `atlas-diff <shaA> <shaB>` as a read-only projection —
byte-identical over CLI and MCP against one schema, opening no write path, and NOT a governance write
door (a read projection like node TOOLS-10 / doctor TOOLS-12, ADR-0003). Consumes the delta contract frozen upstream by
WP-7.32.PERSIST. Human handle only.
source_reqs: # ptr+digest

- source: ../req-tls.md#REQ-TOOLS-16a # ptr+digest
- source: ../req-tls.md#REQ-TOOLS-16b # ptr+digest
- source: ../req-tls.md#REQ-TOOLS-16c # ptr+digest
- source: ../req-tls.md#REQ-TOOLS-16d # ptr+digest
- source: ../req-tls.md#REQ-TOOLS-16e # ptr+digest
  seam-freezes: [ "version-delta contract consumed-from PERSIST (WP-7.32.PERSIST, frozen upstream)" ]
  anchor: # value
  target: the `atlas-diff` read-only projection `tools/ref/diff.ts` over the CLI + MCP adapters bound to the one
  handler `tools/ref/handler.ts`. Insertion site = the two transport bindings for `atlas-diff` reading the
  PERSIST-14 delta; no write path, not on the governance write surface.
  interface_contract: # ptr+digest
- source: ../../reference/atlas-tools.md#tools-16 # ptr+digest
- source: ../req-pst.md#REQ-PERSIST-14-a # ptr+digest (the consumed version-delta contract, frozen upstream)
- source: tools/ref/handler.ts # ptr+digest
  exclusions: # value
- The delta computation (fold-diff / partition / provenance) is owned by WP-7.32.PERSIST — consumed here,
  never re-authored.
- The no-write-path arm (16d) + the not-a-write-tool arm (16e) are POSITIVE reference-model properties
  of the read handle — NOT a formal model; formal verification is out of scope.
- The write-door + store (EPIC-26-a), CLI/MCP parity + doctor (EPIC-26-b), tri-transport + ladder (EPIC-26-c)
  — out of scope here.
  inputs: # ptr+digest
- source: ../goldens-tls.md#req-tools-16--atlas-diff-read-only-version-projection-reference-model--climcp-delegated-to-tools-3 # ptr+digest
- source: tools/ref/diff.ts # ptr+digest
- source: tools/ref/handler.ts # ptr+digest
  action: # value
  Bind `atlas-diff` over the CLI + MCP adapters to the one handler so each acceptance SCN passes: it faithfully
  renders the consumed PERSIST-14 delta, returns byte-identical over CLI and MCP, exposes no store-mutating
  method, and does not grow the governance write surface; run the goldens harness.
  action_surface: # value
  [ Read, Edit, Write (TOOLS package only), run goldens/conformance harness ]
  guardrails: # value
- edit only within the TOOLS package + its tests; never re-author the delta (consumed from PERSIST)
- add NO write path over any transport (read/subscribe only; writes funnel through atlas-emit)
- the governance write surface stays {atlas-emit, atlas-link} (atlas-diff is a read projection, not a write door)
  repair_budget: # value
  N: 3 ; early-stop on { repeated-identical-failure, no-change-diff, semantic-duplicate-edit }
  acceptance: # ptr+digest = frozen goldens
- source: ../goldens-tls.md#SCN-TOOLS-16a-1 # ptr+digest
- source: ../goldens-tls.md#SCN-TOOLS-16b-1 # ptr+digest
- source: ../goldens-tls.md#SCN-TOOLS-16c-1 # ptr+digest
- source: ../goldens-tls.md#SCN-TOOLS-16d-1 # ptr+digest
- source: ../goldens-tls.md#SCN-TOOLS-16e-1 # ptr+digest
  deps: [ WP-7.32.PERSIST ] parallel_group: —
  exit_predicate: # value
  all 5 acceptance SCNs green ∧ cli(shaA,shaB) ≡ mcp(shaA,shaB) ∧ 0 write path on the diff surface ∧
  governance write surface == {atlas-emit, atlas-link} ∧ all pointer digests resolve (no STALE)
  context_refs: # closed list
- source: ../../reference/atlas-tools.md#tools-16
- source: ../req-pst.md#REQ-PERSIST-14-a
- source: ../goldens-tls.md
  owner: charlie (FORGE) # value
  outputs: # exec — empty at S4-freeze
  provenance: # exec — empty at S4-freeze
  trace_ref: # exec — empty at S4-freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-TOOLS-16

---

## S4 partition ledger (self-check)

- **REQ→WP partition:** 38/38 CAMPAIGN-7 REQs owned by exactly one WP — orphans = 0, doubles = 0.
  - WP-7.26-a.TOOLS (9): 1a, 1b, 1c, 1d, 2a, 2b, 15a, 15b, 15c
  - WP-7.26-b.TOOLS (6): 3a, 3b, 4, 12a, 12b, 12c
  - WP-7.26-c.TOOLS (12): 10a, 10b, 10c, 10d, 11-a, 11-b, 11-c, 11-d, 11a-a, 11a-b, 11a-c, 11a-d
  - WP-7.32.PERSIST (6): PERSIST-14-a, 14-b, 14-c, 14-d, 14-e, 14-f
  - WP-7.32.TOOLS (5): TOOLS-16a, 16b, 16c, 16d, 16e
- **Epic coverage:** each of EPIC-26-a / -b / -c fully covered by its single TOOLS WP; EPIC-32 fully covered by
  its two module WPs (WP-7.32.PERSIST owns the 6 PERSIST-14 REQs, WP-7.32.TOOLS owns the 5 TOOLS-16 REQs).
- **Seam-freezes:** EPIC-26-a/-b/-c — none (all single-module TOOLS; the KERNEL store / one-handler contract is a
  _consumed-from-upstream_ pointer). EPIC-32 — **one**: the `atlas-diff` version-delta contract is owned by the
  upstream **PERSIST** slice (it computes the read-only fold-diff) and consumed by the downstream **TOOLS** slice
  (it surfaces `atlas-diff`) — a single upstream owner, never smeared across both WPs.
- **Acceptance:** each WP's acceptance = its REQs' frozen SCN goldens by reference (ptr+digest), no prose copy.
- **No new decisions:** every field transcribes frozen upstream; the security-exploitability of the write-door
  is explicitly excluded (billy / FR-12), matching the goldens-tls.md standing note; EPIC-32 adds no decision —
  the delta contract (ADR-P14 read-only fold-diff, not a stored diff) and the read-projection surface (write
  surface stays {atlas-emit, atlas-link}, ADR-0003) are fixed upstream in PERSIST-14 / TOOLS-16.
