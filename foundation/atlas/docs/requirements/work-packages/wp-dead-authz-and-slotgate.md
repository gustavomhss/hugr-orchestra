# Work Packages — HOTFIX (out-of-band, not S4-campaign)

> A single standalone WP card for two defects found by measurement against the real repository, not
> authored fresh from a requirement. Conforms loosely to
> [`method/wp-template.md`](../../method/wp-template.md) where the template fits an already-executed
> hotfix; the `exec` fields are FILLED, not empty, because this WP is DONE, not S4-frozen for later
> dispatch. Pointers are relative to this file (`docs/requirements/work-packages/`).
> The worked example this follows is [`wp-fix-scip-local-edges.md`](wp-fix-scip-local-edges.md).

---

### WP-FIX-8.WRITE — two authz implementations where the tested one was dead, and a vocabulary gate stated in three places and enforced in none (#186, #152)

epic: none (out-of-band hotfix, dispatched by the lead against a task list that had NOT been re-verified)
id: WP-FIX-8.WRITE
title: Delete the dead KNOW-11 authz decision (`packages/knowledge/src/write/authz.ts`) and ENFORCE the
closed-13 `predicateSlot` vocabulary at the production write path

intent: >
Two defects, one shape: **the artefact that carries the specification was not the artefact that ran.**

**#186 — TWO AUTHZ IMPLEMENTATIONS.** `write/authz.ts` exported `authz(op, actor, fact)` /
`inScope(actor, scope)` / `authzApi`, the KNOW-11 reference model: exported from the barrel, named by
every document, covered by three test files, and called by NOTHING. The live gate is `actorInScope`
(`adapter-io/src/policy.ts`), reached from `governed-emit.ts` gate "2. AUTHZ". They were not the same
predicate: `inScope` decided `actor === scope` (NOMINAL equality), the shipped door decides
ADMIN-DECLARED membership out of `.atlas/policy.json`. So "the live path adopts the specified one" was
never available — it would have deleted admin-declared membership and replaced KNOW-11 with string
equality. The specified module was DELETED and its specification moved to the live gate. `isScope`
SURVIVES: it is the runtime SHAPE guard for the `(scope, tier)` pair, not part of the decision, and it
is reached on every governed write from three production sites.

**#152 — THE CLOSED-SLOT VOCABULARY.** The 13-member `predicateSlot` set was written out in THREE
places and enforced in NONE. `nodeKey = hash(primaryAnchorId ‖ predicateSlot)`, so an unrecognised slot
did not fail — it silently minted a NEW address, which is precisely what closedness exists to prevent
("same topic" is decidable only because the vocabulary is finite — atlas-knowledge:150). The three
statements are now ONE runtime list, and it is CALLED, fail-closed, at `upsert` — the funnel both
durable write paths pass through.

## measured, on the shipped binary (not reasoned about from source)

**#186 — the reader-side call chain.** The BUILT `dist` was instrumented with a `stderr` marker at the head
of each candidate function, and the REAL `atlas emit` binary was driven as a SUBPROCESS over a real temp git
repo with a real `.atlas/policy.json`, a real SCIP-free index and a grounded fact whose citation re-derives
FRESH. Chain: `packages/cli/dist/src/bin.js` → `composeRuntime` (`adapter-io/src/compose.ts:193`) →
`createGovernedEmit` (`compose.ts:307` / `wire.ts:159`) → `governed-emit.ts` gate 2 → `actorInScope`.
Markers reached on a SUCCESSFUL write:

| marker                       | module                            | reached |
| ---------------------------- | --------------------------------- | ------- |
| `ADAPTERIO.actorInScope`     | `adapter-io/src/policy.ts`        | **YES** |
| `KNOWLEDGE.isScope`          | `knowledge/src/write/authz.ts`    | **YES** |
| `KNOWLEDGE.upsert`           | `knowledge/src/write/upsert.ts`   | **YES** |
| `KNOWLEDGE.authz`            | `knowledge/src/write/authz.ts`    | never   |
| `KNOWLEDGE.inScope`          | `knowledge/src/write/authz.ts`    | never   |
| `KNOWLEDGE.isClosedSlot`     | `knowledge/src/write/template.ts` | never   |
| `KNOWLEDGE.validateTemplate` | `knowledge/src/write/template.ts` | never   |
| `KNOWLEDGE.isKnownSlot`      | `knowledge/src/write/router.ts`   | never   |
| `GROUNDING.validateTemplate` | `grounding/src/emit-guard.ts`     | never   |

**#152 — the harm, at the binary, BEFORE the fix.** The same grounded, authorized, ratified fact, emitted
three times with only the slot changed. All three were ACCEPTED at exit 0, at THREE DIFFERENT addresses:

| `predicateSlot`                       | verdict (pre-fix)         | minted id   |
| ------------------------------------- | ------------------------- | ----------- |
| `invariant` (in vocabulary)           | exit 0 · `status: ok`     | `9f563fef…` |
| `free-text-whatever` (outside the 12) | **exit 0 · `status: ok`** | `46d8e1b8…` |
| absent                                | exit 0 · `status: ok`     | `9af8c5e0…` |

## the decisions

**D1 — DELETE, not adopt (#186).** `authz`, `authzApi`, `AuthzApi`, `AuthzOp` and `inScope` are removed.
`authzApi` / `AuthzApi` / `AuthzOp` had no reference anywhere in the tree, tests included. `isScope` is kept.

**D2 — ONE runtime list (#152).** `template.ts`'s duplicate `CLOSED_SLOTS` literal is deleted and
`isClosedSlot` DELEGATES to `isKnownSlot` (`router.ts`), which is where `nodeKey` — the identity the
closedness protects — is computed. A `cv` bump now edits one runtime list. `isKnownSlot` was widened to be
TOTAL over `unknown` (`typeof === 'string'` first), because the value boundary is where the erased type
stops helping.

**D3 — the gate lives at `upsert`, and it RAISES.** Same argument the ARCH-10 block in that file already
makes for `GovernanceAuthorityError`: the reducer is the one funnel every durable write passes through
(`governed-emit.ts:361` for `atlas emit`/`atlas promote`, `cli/mine.ts:52` for the staging write), so the
rule is a property of the WRITE and not of one door's gate order; and a returned refusal would be silently
discarded, because `governed-emit.ts` calls `upsert(...).store` and drops the decision.

**D4 — ABSENT STANDS ASIDE. The field is OPTIONAL; the gate refuses PRESENT-and-unrecognised only.**
This is the card's A2 question answered, and it is a NARROWING, written down as one:

1. MEASURED 2026-08-04 across 300 model calls in two runs: ZERO stored facts carry a `predicateSlot`.
   The cause is mechanical and upstream — `buildAdvisory` / `buildPredicate`
   (`genesis/src/admit-harness.ts:240,259`), the only fact constructors the product's own producer has,
   never set the field. Fail-closed-on-absent would refuse 100% of `atlas mine` and `atlas promote`
   writes from the first day. That is not a gate, it is an outage.
2. It would be a CONTRACT CHANGE. `WriteRequest.slot` and `GroundedFact.predicateSlot` are declared
   R3-OPTIONAL deliberately (~17 merged fact literals omit them). Optional→required bumps `cv`.
3. The two are not the same harm. An UNRECOGNISED slot escapes the vocabulary and mints an unpredictable
   new address. An ABSENT slot is deterministic — every slot-less fact at one anchor hashes to the SAME
   key, so they COLLIDE and force UPDATE/union, which is the behaviour closedness exists to produce.
   This gate therefore does NOT make "every fact carries a slot" true. Closing that leg requires the
   PRODUCER to populate the field, which is upstream of this WP. **Open follow-up: `predicateSlot` is not
   populated by any producer; until it is, this gate protects only the door a human or agent authors
   through (`atlas emit`, MCP) — which is exactly where an unrecognised slot was previously accepted in
   silence.**

**D5 — the refusal is re-filed as a DECISION at the door.** Discovered by measurement while wiring D3: the
first working version shipped `exit 1 · status: error` with a correct reason, because `cli/map.ts`
`deriveStatus` classifies a governance refusal on `data.emitted === false` and a throw carries no `EmitOut`.
That is byte-for-byte the defect `governed-emit-address.ts` was created for (task #136, the canonical-form
violation one gate over), so it takes that file's own decision: `commitRefusalOf` re-files it, and the exit
code follows the door's record. `deriveStatus` is untouched. Recognition is STRUCTURAL
(`isClosedSlotError`), never `instanceof`: the check crosses a package boundary and two `dist` copies of
`@atlas/knowledge` in one process would break class identity and turn a governance decline back into an
unhandled throw.

source_reqs: # ptr+digest

- source: ../req-knw.md#REQ-KNOW-10b # ptr+digest — template-violation rejected; the out-of-vocab slot cell was never enforced at a write path
- source: ../req-knw.md#REQ-KNOW-11c # ptr+digest — out-of-scope write rejected; realized by `actorInScope` at the door, no longer by a dead nominal model

seam-freezes: [ ] (no cross-module obligation created; `isClosedSlotError` is an ADDITIVE export)

anchor:

- `packages/knowledge/src/write/authz.ts` — contracted to `isScope` (#186)
- `packages/knowledge/src/write/closed-slot.ts` — NEW: the refusal, its discriminant, its recogniser
- `packages/knowledge/src/write/upsert.ts` — the gate, first thing in the reducer
- `packages/knowledge/src/write/router.ts` — the ONE runtime vocabulary; `isKnownSlot` total over `unknown`
- `packages/knowledge/src/write/template.ts` — duplicate list deleted, `isClosedSlot` delegates
- `packages/adapter-io/src/governed-emit-address.ts` — `commitRefusalOf` re-files the refusal (D5)
- `packages/adapter-io/src/governed-emit.ts` — gate 3.5 documented; the header count FIFTEEN → SIXTEEN

## exec

outputs:

- `packages/knowledge/test/wp-closed-slot-gate.test.ts` (NEW, 9 cases) — one runtime list; the gate; the
  absent-slot decision; the refusal text and its structural recogniser.
- `packages/e2e-blackbox/test/s29-closed-slot.blackbox.test.ts` (NEW, 5 cases) — the same story at the
  REAL binary: control accepted, out-of-vocab refused at exit 2 with the value + all 12 named, nothing
  durable, the absent slot still accepted, the store still serves.
- `packages/knowledge/test/wp-owner-not-required.test.ts` — the five dead-fence cases removed; a
  regression fence added that the barrel must not re-export a second authz decision.
- `packages/knowledge/test/wp-5.14-know.lifecycle.test.ts`, `packages/e2e/test/s05-write-governance.e2e.test.ts`
  — the KNOW-11 transcriptions against the dead functions removed, with the live realization NAMED.

provenance: measured on the built `dist` in a subprocess (the instrumented-marker probe and the three-slot
emit table above), then mutation-tested; not inferred from source.

trace_ref: >
I6 — six mutants, each asserted `occurrences: 1` and proved to CHANGE the file before any suite ran,
restored byte-identically after; exit codes read directly. ALL SIX KILLED:
M1 gate removed (upsert) → suite exit 1
M2 `isKnownSlot` returns true (vocabulary opened) → suite exit 1
M3 absent-slot stand-aside inverted → suite exit 1 (pins D4 as a DECISION)
M4 `isClosedSlotError` always false → suite exit 1
M5 `commitRefusalOf` re-file removed (rebuild + binary) → suite exit 1 (pins D5)
M6 a second `inScope` re-added to the barrel (rebuild) → suite exit 1 (pins #186)
M6 SURVIVED on its first run and that is recorded rather than glossed: the fence reads the BUILT barrel
(`vitest.config.ts` declares no `@atlas/*` alias), so a `src` mutant does not reach it until `tsc -b`.
Re-run with the rebuild it was KILLED. A mutant that never reached the code under test is not a survivor.

exit_predicate: one authz implementation reachable from production (proven on the built binary) ∧ an
out-of-vocabulary slot REFUSED at exit 2 naming the value, the vocabulary and the door ∧ the absent-slot
behaviour explicit, tested and documented ∧ `tsc -b` clean ∧ every `harness/gates/*.mjs` exit 0 by name ∧
the suite reconciled against `origin/master` with the literal delta.

owner: KNOWLEDGE territory · builder_id: `charlie`

---

## What the lead's framing got wrong

1. **"The tested one is dead" is true of the API, FALSE of the file.** `write/authz.ts` was LIVE — `isScope`
   has three production call sites and runs on every governed write. Deleting "the dead authz module" would
   have removed a guard that gate 0 depends on. The dead thing was an API surface inside a live module,
   which is a strictly harder case: `reference-model-guard` measures whole MODULES, so it could not have
   caught this and its header says so ("a dead export added to a module that is otherwise LIVE is not
   caught"). A3's second finding is therefore not "the module was not declared" — it is that this class is
   OUTSIDE what that gate can see, and the cover for it is now a test, not the guard.

2. **The two authz implementations were not two implementations of one rule.** They implemented DIFFERENT
   rules. That is what made rule 2's "the live path adopts the specified one" branch unavailable rather than
   merely unattractive, and it is the reason the deletion is a fix and not a tidy-up.

3. **"Stated in THREE places" undercounts by one in code and overcounts by one in force.** The three runtime
   /type statements are `types.ts` (a TYPE — erased, so it never enforced anything even in principle),
   `router.ts` (KNOW-15i) and `template.ts` (KNOW-10). But `grounding/src/emit-guard.ts` carries a FOURTH
   `validateTemplate` — a coarse structured-vs-prose check with no slot leg and, itself, zero production
   callers. It is not part of this fix and is left alone; it is named here so the next reader does not
   discover it as a fifth surprise.

4. **A2 is right that enforcing an absent field is a no-op — but it is not the case being enforced.** The
   gate fires on PRESENT-and-unrecognised, and the blackbox story proves a real `atlas emit` reaching it.
   What A2 correctly predicts is the residual: this gate does not and cannot make "every fact carries a
   slot" true while no producer sets one. That is stated as D4 and left OPEN rather than papered over.

5. **Does the closed-slot check belong at the write door at all, rather than at the producer? BOTH, and the
   producer leg is the one that is missing.** The door is the right place for the check that exists —
   `nodeKey` is minted there, an out-of-vocab slot corrupts the identity _at that moment_, and the door is
   the boundary where an author-supplied string arrives from `JSON.parse`. But the producer is where the
   FIELD should start being populated, and until it is, the vocabulary is enforced over a field that only
   hand-authored and MCP-authored facts carry. Putting the check ONLY at the producer would have left the
   `atlas emit` / MCP door — the one an agent uses — open, which is the door the measurement found open.

6. **The card's `action_surface` could not satisfy the card's own invariants, and three files outside it
   were edited.** Each is named, with why:
   - `packages/knowledge/src/types.ts` — one ORPHAN SENTENCE pointing at the deleted `inScope`. The quality
     standard forbids leaving it ("no orphan sentence left pointing at a deleted module").
   - `packages/e2e/test/s05-write-governance.e2e.test.ts` — it imported `authz`/`inScope`, so `tsc -b` could
     not pass without it, and I4 requires that no test be left green about a deleted module.
   - `packages/adapter-io/src/governed-emit-address.ts` + `governed-emit.ts` — rule 3 says "wire the
     closed-slot check into the write door", and the write door is in `adapter-io`. Without D5 the refusal
     renders `exit 1 · status: error`, which this repo has already classified once as a defect (#136).
     `compose.ts` and `wire.ts` — the two files the card told me to STOP on — were NOT touched, and neither
     was any file named in another live seat's exclusion.

7. **`governed-emit.ts` was at 398 of its 400-LOC ceiling.** A new gate could not be documented there at the
   standard the file itself sets; the refusal went into a new `knowledge/src/write/closed-slot.ts` and the
   re-file into the existing `governed-emit-address.ts`, and the door's header entry had to be compressed to
   two lines to fit. Worth knowing before the next gate is added to that door: there is no room left.
