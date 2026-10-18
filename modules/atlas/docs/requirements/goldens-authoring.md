# Goldens — Block AUTHORING (CAMPAIGN-10) · S3 generate-from-method-tag

> **state:** S3 · **protocol:** [`goldens`](../../.claude/skills/goldens/SKILL.md) +
> [`completeness`](../../.claude/skills/completeness/SKILL.md) Gate-3 teeth ·
> **axiom:** S1 frozen (`requirements-authoring.md`; 73 REQs) + S2 frozen (`method-tags-authoring.md`; 18
> INVs tagged, **0 `formal`**) · **owner:** lead; cold-review **pending**.
>
> **Derivation (generated from the method-tag, not hand-authored where a generator exists):**
>
> - **5 `PBT` INVs** (AUTH-1, AUTH-8, AUTH-11, AUTH-12, MCP-4) → **`gen: PBT`** — the agreement laws.
>   Each SCN is a concrete witness instancing a `∀` law whose full statement lives in
>   [`properties-authoring.md`](./properties-authoring.md); the witness is the entry point, the property is the
>   coverage.
> - **8 `exhaustive` INVs** (AUTH-2, AUTH-5, AUTH-9, AUTH-10, AUTH-13, CLI-5, CLI-6, MCP-3) →
>   **`gen: exhaustive`** — the input space is a finite closed set (the door set, the 13-slot union, the
>   route decision table, the two-state occupancy, the write-path set, the parser's command map, the leg
>   set, the three surface constants). Enumeration IS the golden.
> - **5 `reference-model` INVs** (AUTH-3, AUTH-4, AUTH-6, AUTH-7, AUTH-14) → **`gen: conformance`** — each
>   SCN is a differential witness against the named S2 oracle (the built `Axes`, the mixed-language
>   fixture, the emit door's read-set, the two-commit fixture, the per-node read door).
> - **0 `residue`** — every INV has a named oracle; no oracle-less case survives the S2 tags.
>
> **Non-vacuity note.** Every guard SCN carries an **interesting witness**: a real grammar-less file
> adjacent to real symbol units; a real reworded claim at an occupied identity (not a fresh one); an input
> that fails **two** gates at once (the only shape that reveals gate-order divergence); a partially-populated
> Verdict (the only shape that reveals transport re-serialization). No antecedent-failure vacuity.

## Fixture universe (concrete witnesses, reused across every SCN)

### `fix-author` — a committed two-language repo (the anchors / draft / round-trip oracle)

| path             | lang | role                                                                       |
| ---------------- | ---- | -------------------------------------------------------------------------- |
| `.gitignore`     | —    | contains `dist/`                                                           |
| `src/app.ts`     | ts   | defines `run()` and `helper()` — two `::` symbol units under one file unit |
| `src/util.ts`    | ts   | defines `greet()`                                                          |
| `core/engine.rs` | rs   | **no configured grammar** ⇒ file-level unit + a declared hole              |
| `core/mod.rs`    | rs   | second grammar-less file ⇒ the hole's `fileCount` is **2**, not a constant |
| `docs/notes.md`  | —    | a non-code tracked file (a file unit with no symbol children)              |

Two commits: `R1` (as above) and `R2` (one byte changed inside `src/app.ts::run`) — the rev-mismatch and
drift witnesses. A sibling `not-a-repo/` directory (no `.git`) is the non-git witness.

### Actors and tokens

`α_in` — an actor inside scope `src`. `α_out` — an actor in no scope. `τ_∅` — the empty ratifier.
`τ_lead` — a non-empty non-billy ratifier. `τ_billy` — the T0 ratifier.

---

## Block AUTH

### SCN-AUTH-1a-1 — planner and gate derive the same hash

source: REQ-AUTH-1a · gen: PBT (witness of PROP-AUTH-1)
Given `fix-author` at `R1`
When the planner seam derives the anchor for `src/app.ts::run` and the emit truth-gate re-derives the same anchor at `R1`
Then the two `subtreeHash` values are identical.

### SCN-AUTH-1b-1 — there is exactly one derivation site

source: REQ-AUTH-1b · gen: exhaustive
Given the built package graph
When the call sites that compute an anchor `subtreeHash` are enumerated
Then exactly one seam is found, and both the planner and the truth-gate route to it.

### SCN-AUTH-1c-1 — the seam warms itself

source: REQ-AUTH-1c · gen: conformance
Given a cold process that has performed no grammar warm-up
When the seam is asked for the anchors of `src/app.ts`
Then the `::` symbol units are present (not a file-level-only fold).

### SCN-AUTH-1d-1 — no planner/gate disagreement

source: REQ-AUTH-1d · gen: PBT (guard)
Given a grounding the planner computed for `core/engine.rs` at `R1`
When it is emitted at `R1` on the unchanged `fix-author`
Then the truth gate does not reject it for that grounding.
teeth: breaks-on a planner that folds without warm grammars — the file anchor passes and only a symbol anchor diverges.

### SCN-AUTH-1e-1 — cold caller, same fold

source: REQ-AUTH-1e · gen: PBT (guard)
Given two processes, one warmed and one cold
When both request the anchors of `src/app.ts` at `R1`
Then the two unit sets are byte-identical.

### SCN-AUTH-2a-1 — a planner writes nothing

source: REQ-AUTH-2a · gen: exhaustive
Given a write-spy store whose `put`, `persistProjection`, and cache writes throw on call
When each of `anchors`, `slots`, `draft`, `check` is invoked with valid arguments
Then all four complete and the spy records zero calls.

### SCN-AUTH-2b-1 — the write surface is still two

source: REQ-AUTH-2b · gen: exhaustive
Given the built `WRITE_PATHS` constant
When it is compared to `['atlas-emit','atlas-link']`
Then it is deep-equal.

### SCN-AUTH-2c-1 — no authoring door is a governed member

source: REQ-AUTH-2c · gen: exhaustive
Given the authoring door set and the two frozen surface constants
When membership is tested for every door
Then no door is a member of `WRITE_PATHS` or `GOVERNANCE_SURFACE`.

### SCN-AUTH-2d-1 — byte-identical store after a planner run

source: REQ-AUTH-2d · gen: exhaustive (guard)
Given a seeded store and its byte census
When every authoring door is invoked with valid, malformed, and empty arguments
Then the store's byte census is unchanged.
teeth: breaks-on a door that memoizes its index build to disk "as a cache" — a CAS-only assertion misses it.

### SCN-AUTH-2e-1 — registration guard fires

source: REQ-AUTH-2e · gen: exhaustive (guard)
Given a mutant in which `atlas-draft` is added to `WRITE_PATHS`
When the surface conformance check runs
Then it fails.

### SCN-AUTH-3a-1 — anchors equal the index's units

source: REQ-AUTH-3a · gen: conformance
Given `fix-author` at `R1`
When `anchors src` is invoked
Then the returned units deep-equal the built index's units under `src`, each carrying `qualifiedPath`, `kind`, and the current `subtreeHash`.

### SCN-AUTH-3b-1 — no invention, omission, or reordering

source: REQ-AUTH-3b · gen: conformance
Given the reference unit set for `src`
When `anchors src` is compared to it as an ordered sequence
Then the sequences are identical.

### SCN-AUTH-3c-1 — anchors report the rev

source: REQ-AUTH-3c · gen: conformance
Given `fix-author` at `R1`
When `anchors src` is invoked
Then the reported `rev` equals `R1`.

### SCN-AUTH-3d-1 — honest empty with a reason

source: REQ-AUTH-3d · gen: conformance
Given the `not-a-repo/` directory
When `anchors not-a-repo` is invoked
Then `units` is empty and a reason is present.

### SCN-AUTH-3e-1 — zero phantom, zero missing

source: REQ-AUTH-3e · gen: conformance (guard)
Given `fix-author` at `R1`
When the returned unit set is differenced against the built index's unit set
Then both differences are empty.

### SCN-AUTH-3f-1 — order-stable across runs

source: REQ-AUTH-3f · gen: conformance (guard)
Given `fix-author` at `R1`
When `anchors src` is invoked twice
Then the two results are byte-identical.
teeth: breaks-on a lister that sorts by insertion order — content-equality passes, sequence-equality does not.

### SCN-AUTH-3g-1 — never a throw

source: REQ-AUTH-3g · gen: conformance (guard)
Given a path that exists but is unreadable
When `anchors` is invoked on it
Then a structured empty result is returned and no exception escapes.

### SCN-AUTH-4a-1 — a grammar-less file still anchors

source: REQ-AUTH-4a · gen: conformance
Given `fix-author` at `R1`
When `anchors core` is invoked
Then `core/engine.rs` and `core/mod.rs` are present as file-level units.

### SCN-AUTH-4b-1 — the hole is declared with a real count

source: REQ-AUTH-4b · gen: conformance
Given `fix-author` at `R1`
When `anchors core` is invoked
Then `holes` contains exactly one entry with extension `.rs`, `fileCount` **2**, and a reason.
teeth: breaks-on a hard-coded extension list or a `fileCount` of 0 — the count is asserted against the fixture's real census.

### SCN-AUTH-4c-1 — symbol-capable files carry no hole

source: REQ-AUTH-4c · gen: conformance
Given `fix-author` at `R1`
When `anchors src` is invoked
Then the `.ts` files carry `::` symbol units and `holes` is empty.

### SCN-AUTH-4d-1 — undeclared degradation is a violation

source: REQ-AUTH-4d · gen: conformance (guard)
Given a mutant lister that returns `core/*.rs` at file level with `holes: []`
When the golden runs
Then it fails.

### SCN-AUTH-5a-1 — slots equal the union

source: REQ-AUTH-5a · gen: exhaustive
Given the closed `PredicateSlot` union
When `slots` is invoked
Then the returned slot set is set-equal to the union (13 members).

### SCN-AUTH-5b-1 — each slot carries a meaning

source: REQ-AUTH-5b · gen: exhaustive
When `slots` is invoked
Then every returned member carries a non-empty meaning.

### SCN-AUTH-5c-1 — derived, not transcribed

source: REQ-AUTH-5c · gen: exhaustive
Given a mutant that adds a 13th member to the `PredicateSlot` union without editing the door
When the project is type-checked
Then the build fails on a non-exhaustive mapping (the door is total over the union).

### SCN-AUTH-5d-1 — no extra, no missing

source: REQ-AUTH-5d · gen: exhaustive (guard)
When the returned set is differenced against the union in both directions
Then both differences are empty.

### SCN-AUTH-5e-1 — a new member reaches the door

source: REQ-AUTH-5e · gen: exhaustive (guard)
Given the mutant union of SCN-AUTH-5c-1 with the door's mapping extended
When `slots` is invoked
Then the 13th member is returned with no other door change.
teeth: breaks-on a hand-transcribed array — set-equality passes today and fails only when the union grows, which is when nobody re-reads the door.

### SCN-AUTH-6a-1 — a draft is complete for the door

source: REQ-AUTH-6a · gen: conformance
Given the field set the governed emit door destructures
When a fact is drafted for `src/util.ts::greet`
Then every field in that set is present and well-formed on the drafted fact.

### SCN-AUTH-6b-1 — identity is minted, not invented

source: REQ-AUTH-6b · gen: conformance
Given a drafted fact
When its `id` is compared to `nodeKey(candidateView(fact))`
Then they are equal.
teeth: breaks-on a drafter that invents an `id` — the fact still emits (the door re-mints), so only the formula comparison catches it.

### SCN-AUTH-6c-1 — the grounding hash is the computer's value

source: REQ-AUTH-6c · gen: conformance
Given a drafted fact anchored at `src/app.ts::run` at `R1`
When its `subtreeHash` is compared to the computer's current value for that anchor
Then they are equal.

### SCN-AUTH-6d-1 — three inputs, everything else computed

source: REQ-AUTH-6d · gen: conformance
When `draft` is invoked with only an anchor, a slot, and a claim
Then it returns a complete fact with no further input required.

### SCN-AUTH-6e-1 — no missing door-read field

source: REQ-AUTH-6e · gen: conformance (guard)
Given a mutant drafter that omits `predicateSlot`
When the completeness golden runs
Then it fails.

### SCN-AUTH-6f-1 — no computed field demanded

source: REQ-AUTH-6f · gen: conformance (guard)
When `draft` is invoked without an `id` and without a `subtreeHash`
Then it succeeds.

### SCN-AUTH-7a-1 — a draft carries its rev

source: REQ-AUTH-7a · gen: conformance
Given `fix-author` at `R1`
When a fact is drafted
Then the draft's `rev` equals `R1`.

### SCN-AUTH-7b-1 — a rev mismatch is named

source: REQ-AUTH-7b · gen: conformance
Given a draft computed at `R1`
When it is emitted with `--at R2`
Then the refusal names the rev mismatch.

### SCN-AUTH-7c-1 — the claim is not blamed

source: REQ-AUTH-7c · gen: conformance (guard)
Given the refusal of SCN-AUTH-7b-1
When its reason is inspected
Then it does not attribute the failure to the claim.
teeth: breaks-on a generic "grounding does not re-derive" reason when the true cause is a rev mismatch the product could detect.

### SCN-AUTH-8a-1 — the round trip closes

source: REQ-AUTH-8a · gen: PBT (witness of PROP-AUTH-8)
Given `fix-author` at `R1`
When a fact is drafted for `src/app.ts::run` with slot `invariant` and emitted with `--at R1`
Then the truth door accepts it.

### SCN-AUTH-8b-1 — no self-rejection across anchor kinds

source: REQ-AUTH-8b · gen: PBT (guard)
Given every unit in `fix-author`'s unit set at `R1` — file, directory, symbol, and the grammar-less files
When each is drafted and emitted at `R1`
Then every emit is accepted.
teeth: breaks-on a drafter correct for file anchors and wrong for the `::` symbol unit path — the natural witness is a file anchor.

### SCN-AUTH-9a-1 — the route is stated

source: REQ-AUTH-9a · gen: exhaustive
Given the finite route decision space (tier × kind × contested × lowRisk)
When a draft is produced at each point
Then the declared route equals the route the governed door takes.

### SCN-AUTH-9b-1 — the authorizing channel is named

source: REQ-AUTH-9b · gen: exhaustive
Given a `T0` advisory draft
When it is produced
Then it declares `full-ratify` and names its authorizing channel.

### SCN-AUTH-9c-1 — no discovery by refusal

source: REQ-AUTH-9c · gen: exhaustive (guard)
Given a `T2` **predicate** draft (auto-accept fails on kind, not tier)
When it is produced
Then it declares `full-ratify` before any emit is attempted.
teeth: breaks-on a drafter that hard-codes "T0 ⇒ full-ratify" — the T0 witness passes while the predicate route is silently reported as auto-accept.

### SCN-AUTH-10a-1 — an occupied identity drafts as UPDATE

source: REQ-AUTH-10a · gen: exhaustive
Given a store already holding a node at `(src/util.ts::greet, invariant)`
When a draft is produced at that anchor and slot
Then the operation is reported as UPDATE.

### SCN-AUTH-10b-1 — a free identity drafts as CREATE

source: REQ-AUTH-10b · gen: exhaustive
Given an empty store
When a draft is produced at `(src/util.ts::greet, invariant)`
Then the operation is reported as CREATE.

### SCN-AUTH-10c-1 — a reworded claim is still an UPDATE

source: REQ-AUTH-10c · gen: exhaustive (guard)
Given a store holding a node at `(src/util.ts::greet, invariant)` with claim `"C1"`
When a draft is produced at the same anchor and slot with a **different** claim `"C2"`
Then the operation is reported as UPDATE.
teeth: breaks-on an occupancy check keyed on the CAS `contentHash` instead of the `nodeKey` — the reworded case is precisely why the invariant exists.

### SCN-AUTH-11a-1 — the gate order matches

source: REQ-AUTH-11a · gen: PBT (witness of PROP-AUTH-11)
Given a fact that fails **both** the truth gate and the authz gate (an ungrounded fact written by `α_out`)
When `check` and the governed door both run
Then both report the same gate as the first refusal.
teeth: breaks-on a `check` that evaluates authz before truth — every single-failure input still agrees.

### SCN-AUTH-11b-1 — verdicts agree

source: REQ-AUTH-11b · gen: PBT (witness of PROP-AUTH-11)
Given a corpus spanning acceptance and each of the four gate refusals
When `check` and the governed door run on every member
Then their verdicts are equal on every member.

### SCN-AUTH-11c-1 — divergence fails the build

source: REQ-AUTH-11c · gen: PBT (guard)
Given a mutant `check` that skips the ratify gate
When the parity property runs over a `T0` fact with `τ_∅`
Then it fails.

### SCN-AUTH-12a-1 — the refusing gate is named

source: REQ-AUTH-12a · gen: PBT (witness of PROP-AUTH-12)
Given a fact whose `grounding.entries` is absent entirely
When it is emitted
Then the refusal names the `shape` gate.

### SCN-AUTH-12b-1 — a remedy is carried

source: REQ-AUTH-12b · gen: PBT (witness of PROP-AUTH-12)
Given each of the four gate refusals
When each reason is inspected
Then each carries a non-empty remedy.

### SCN-AUTH-12c-1 — no runtime error as a reason

source: REQ-AUTH-12c · gen: PBT (witness of PROP-AUTH-12)
Given the exact payload that produced `Cannot read properties of undefined (reading 'length')` in the 2026-07-25 dogfood
When it is emitted
Then the reason names a gate and matches no runtime-error shape.

### SCN-AUTH-12d-1 — the malformed space is legible

source: REQ-AUTH-12d · gen: PBT (guard)
Given a fuzzed payload space — wrong types, missing fields, `null`/`undefined` at every position, oversized values, prototype-polluting keys
When each is emitted
Then every refusal names a gate from the closed set and carries a remedy.
teeth: breaks-on a validator that structures only the anticipated shapes and lets the rest fall through to a catch-all — which is the observed failure.

### SCN-AUTH-13a-1 — retire is a draft variant

source: REQ-AUTH-13a · gen: exhaustive
Given an existing node
When a retire draft is produced for it
Then the drafted fact carries the superseded authoring state.

### SCN-AUTH-13b-1 — retire persists through the governed door

source: REQ-AUTH-13b · gen: exhaustive
Given a retire draft
When it is persisted
Then the persistence occurred via `atlas-emit`.

### SCN-AUTH-13c-1 — no retire or delete door exists

source: REQ-AUTH-13c · gen: exhaustive
Given the enumerated write-path set
When it is compared to `{atlas-emit, atlas-link}`
Then it is set-equal — no retire and no delete member.

### SCN-AUTH-13d-1 — no gate bypass on retire

source: REQ-AUTH-13d · gen: exhaustive (guard)
Given a gate-invocation spy on the emit door
When a retire draft is emitted
Then every gate a grounded-fact emit invokes was invoked.
teeth: breaks-on a retire that skips the truth gate because "a superseded fact need not re-ground" — persistence still succeeds; only the spy catches it.

### SCN-AUTH-14a-1 — the receipt carries the read identity

source: REQ-AUTH-14a · gen: conformance
Given a successful emit
When the receipt is inspected
Then it carries the identity the per-node read door and the link door consume.

### SCN-AUTH-14b-1 — the receipt resolves with no query

source: REQ-AUTH-14b · gen: conformance
Given a successful emit and **only** its receipt
When the receipt is resolved through the per-node read door
Then the resolved node is the emitted fact.

### SCN-AUTH-14c-1 — the receipt serves both consumers

source: REQ-AUTH-14c · gen: conformance (guard)
Given a successful emit
When the receipt is used by the per-node read door **and** by the drift/doctor CAS read-back
Then both succeed.
teeth: breaks-on a receipt that carries the `nodeKey` but drops the CAS id — the read-door arm passes alone.

---

## Block CLI

### SCN-CLI-5a-1 — help covers the command map

source: REQ-CLI-5a · gen: exhaustive
Given the parser's command map
When `atlas help` is invoked
Then every command in the map appears, with its arity and flags.

### SCN-CLI-5b-1 — help covers the write-governing environment

source: REQ-CLI-5b · gen: exhaustive
When `atlas help` is invoked
Then the actor-identity channel and the ratifier-token channel are both named.

### SCN-CLI-5c-1 — no undocumented command

source: REQ-CLI-5c · gen: exhaustive (guard)
Given a mutant that adds a command to the parser without touching help
When the containment golden runs
Then it fails.
teeth: breaks-on help hand-listing the commands — correct the day it is written, stale the first time a command is added.

### SCN-CLI-5d-1 — no undocumented write channel

source: REQ-CLI-5d · gen: exhaustive (guard)
Given the set of environment variables the composition root reads
When it is differenced against the set help names
Then the difference is empty.

### SCN-CLI-6a-1 — the render covers the record

source: REQ-CLI-6a · gen: exhaustive
Given a populated result record for every leg
When each is rendered
Then every field name of the record appears in the rendered output.

### SCN-CLI-6b-1 — the init regression witness

source: REQ-CLI-6b · gen: exhaustive (guard)
Given an `init` result carrying `territories`, `blastRadius`, and `t0Candidates`
When it is rendered
Then all three appear.
teeth: breaks-on a render that returns after the first recognised field shape — exactly today's behaviour, where two of three fields never reach the user.

---

## Block MCP

### SCN-MCP-3a-1 — the advertised set is the union

source: REQ-MCP-3a · gen: exhaustive
When the MCP server's tool list is requested
Then it is set-equal to `GOVERNANCE_SURFACE ∪ READ_SURFACE`.

### SCN-MCP-3b-1 — the sets are disjoint

source: REQ-MCP-3b · gen: exhaustive
When `READ_SURFACE` is intersected with `GOVERNANCE_SURFACE` and with `WRITE_PATHS`
Then both intersections are empty.

### SCN-MCP-3c-1 — read members write nothing

source: REQ-MCP-3c · gen: exhaustive
Given the write-spy store
When every `READ_SURFACE` member is invoked over MCP
Then the spy records zero calls.
teeth: breaks-on a read door that delegates to the emit leg "for convenience" — cardinality and disjointness all still pass.

### SCN-MCP-3d-1 — the governed counts are derived, not fixed

source: REQ-MCP-3d · gen: exhaustive
When the two frozen constants are measured
Then `|GOVERNANCE_SURFACE| == 6` (derived + budgeted, ADR-0006 Decision 2) and `|WRITE_PATHS| == 3`.

### SCN-MCP-3e-1 — no read-to-write routing

source: REQ-MCP-3e · gen: exhaustive (guard)
Given a mutant `atlas-anchors` leg that calls the emit door
When the write-spy golden runs
Then it fails.

### SCN-MCP-3f-1 — nothing is omitted from the advertisement

source: REQ-MCP-3f · gen: exhaustive (guard)
Given every member of both sets
When the advertised list is searched
Then every member is found.

### SCN-MCP-3g-1 — publishing grows no governed set

source: REQ-MCP-3g · gen: exhaustive (guard)
Given the advertised union including the four new planners and the three pre-existing read doors
When the two frozen constants are re-measured
Then they are unchanged at the derived six and three (ADR-0006 Decision 2).

### SCN-MCP-4a-1 — byte-identical verdicts

source: REQ-MCP-4a · gen: PBT (witness of PROP-MCP-4)
Given a valid input for each authoring door
When each is driven over the subprocess CLI and over the stdio MCP harness
Then the serialized `Verdict`s are byte-identical.

### SCN-MCP-4b-1 — a partially-populated result does not diverge

source: REQ-MCP-4b · gen: PBT (witness of PROP-MCP-4)
Given an `anchors` result whose optional `holes` is empty and whose optional reason is absent
When it is driven over both transports
Then the two serialized `Verdict`s are byte-identical.
teeth: breaks-on an MCP-side JSON round-trip that drops an `undefined`-valued optional field — fully-populated inputs look identical.

### SCN-MCP-4c-1 — divergence fails the parity check

source: REQ-MCP-4c · gen: PBT (guard)
Given a mutant MCP transport that coerces a missing field to `null`
When the parity property runs
Then it fails.

### SCN-AUTH-15a-1 — the fast-path verdicts are derived, not a constant

source: REQ-AUTH-15a · gen: conformance
Given the `routeWrite` decision for a grounded T2 advisory candidate whose truth-gate result is HOLDS
When the `RatifyContext` supplied by the door is inspected
Then `lowRisk` is `true` BECAUSE the truth gate was cleared, and `contested` is `false` BECAUSE no
contention was observed — each derived from the observed state, never from a module-level constant.
teeth: breaks-on a `RatifyContext` built from a hardcoded `{ contested: false, lowRisk: true }` literal at
module scope — a mutant that pins the gate open passes shape/truth/authz but is caught by this byte-level
derivation check.

### SCN-AUTH-15b-1 — a contended write is contested, so no auto-accept

source: REQ-AUTH-15b · gen: conformance (guard)
Given a T2 advisory grounded candidate whose commit attempt collides with a concurrent advance
When the write door computes the ratification context for the retry
Then `contested` is `true`, and `route` answers `full-ratify` (no auto-accept on a contested write).
teeth: breaks-on a door that never surfaces the retry's contention — it keeps `lowRisk:true, contested:false`
across a collision and auto-accepts a write that should be re-checked by the retry loop.

### SCN-AUTH-15c-1 — lowRisk requires a cleared truth gate and the advisory class

source: REQ-AUTH-15c · gen: conformance (guard)
Given a candidate that did NOT clear the truth gate (UNGROUNDED) or that is not `T2` advisory (a predicate)
When the door computes the fast-path context
Then `lowRisk` is `false`, even though the candidate may be `T2`.
teeth: breaks-on a door that marks `lowRisk:true` for any T2 advisory regardless of the truth verdict — the
candidate then routes auto-accept without ever clearing the gate.

### SCN-AUTH-16a-1 — served-in-a-pack increments the usage counter

source: REQ-AUTH-16a · gen: conformance
Given an advisory node served inside a pack to a reader
When the pack is delivered
Then the node's per-node usage counter increments by one.
teeth: breaks-on a served fact whose counter does NOT move — the growth path would starve at zero for every node.

### SCN-AUTH-16b-1 — the fixed threshold rises a node implicitly

source: REQ-AUTH-16b · gen: conformance
Given an advisory node whose usage counter is one below the fixed `USE_THRESHOLD`
When it is served once more
Then the counter reaches the threshold and the node rises to the next class automatically — no human, no further gate.
teeth: breaks-on a rise gated on anything other than the plain integer (a calibrated function, a human, a per-context threshold).

### SCN-AUTH-16c-1 — the human seal is an alternative, sufficient evidence

source: REQ-AUTH-16c · gen: conformance
Given an advisory node with a usage counter still below `USE_THRESHOLD`
When a human ratify token records a deliberate endorsement for it
Then the node rises, independent of the counter.
teeth: breaks-on a rise that requires BOTH the seal and the threshold — the seal must be sufficient alone (the owner's "neither mandatory").

### SCN-AUTH-16d-1 — neither growth evidence is mandatory

source: REQ-AUTH-16d · gen: conformance (guard)
Given an advisory node that is never served enough to reach `USE_THRESHOLD` and receives no seal
When the decay pass runs
Then the node stays advisory and decays by non-use rather than rising.
teeth: breaks-on a node rising at zero counter or by default — a node that earned nothing must stay advisory.

---

## Completeness (S3 predicates)

| predicate                                                        | verdict                                                                                                                                                                       |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| every REQ has ≥1 SCN                                             | ✅ 80/80 (1:1 — each S1 guard REQ carries its own guard SCN)                                                                                                                  |
| every unwanted-behaviour clause has its guard SCN                | ✅ 27/27                                                                                                                                                                      |
| every SCN keys off its REQ and uses concrete values              | ✅ — all values come from the `fix-author` fixture, the named actors/tokens, or the frozen constants                                                                          |
| cases generated wherever a generator exists                      | ✅ — `gen:` is declared per SCN; **0 residue**                                                                                                                                |
| no SCN is a third copy of the fact                               | ⚠️ judgment — **COLD-REVIEW pending**                                                                                                                                         |
| teeth: every guard SCN names a mutant a weaker golden would miss | ✅ **18** explicit `teeth:` lines (counted mechanically) on the load-bearing goldens; the remaining guards are structural set-differences whose mutant is the negation itself |

**DoD: NOT MET** — GATE pending, COLD-REVIEW pending.
