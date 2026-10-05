# atlas-authoring — Reference (the authoring surface)

> owner: orchestrator · grounding: every clause cites an outcome statement (FR-A\*), a job-map step, or a
> risk it retires — per [`design/authoring.md`](../design/authoring.md); the architectural decisions are
> recorded in [`ADR-0004`](../adr/ADR-0004-authoring-planner-doors.md) +
> [`ADR-0005`](../adr/ADR-0005-mcp-read-surface.md) · status: **draft — S0 design-freeze candidate for
> CAMPAIGN-10** (DEFINE seat = owner ratifies)

## Purpose

Atlas governs _writes_ completely: two fail-closed doors, authz, ratification, re-derived grounding. What
it does not have is a way for a **human or an agent to produce a fact the doors will accept**. Every fact
Atlas has held to date was constructed by a test helper that imports the product's own libraries.

This document is the **constitution of the authoring surface**: the doors that let an author _prepare_ and
_confirm_ a fact. It authors **no new write behaviour** — every door here computes a payload and persists
nothing. The governed write surface (`atlas-emit`, `atlas-link`) is unchanged, and INV-TOOLS-1 is untouched.

## Boundary (what this surface is, and is NOT)

- **It is a set of PLANNERS.** A planner reads the repo and the projection, computes a payload, and
  returns it. It opens **no write path** and carries **no write authority**. The already-ratified
  precedent is `atlas doctor reground`, which returns a `RegroundPlan{ emit: GroundedFact }` documented as
  _"a PROPOSAL only; persists nothing. Run through atlas-emit to persist."_ (TOOLS-12).
- **It is NOT a governance extension.** `GOVERNANCE_SURFACE` stays exactly six
  (`atlas-init`/`-query`/`-emit`/`-reconcile`/`-link`/`-memory-emit`) and `WRITE_PATHS` stays exactly three
  (`atlas-emit`, `atlas-link`, `atlas-memory-emit`). See ADR-0003, amended by ADR-0006 Decision 2.
- **It is NOT a second index.** Every anchor and every grounding this surface computes is derived through
  the _same_ seam the emit truth-gate re-derives against. A second computer would manufacture the exact
  drift Atlas exists to detect (AUTHOR-1).
- **It is NOT a staging area.** Nothing here is held, queued, or retried. A planner's output is a value the
  author holds; the store changes only when that value goes through `atlas-emit`.
- **Transports.** Every door is exposed on **both** the CLI and MCP (owner directive). MCP advertises them
  as a `READ_SURFACE` that is disjoint from `GOVERNANCE_SURFACE` — see ENTRY-MCP-3.

## Data model (this surface's own shapes; core shapes imported, never redefined)

```
AnchorUnit  = { qualifiedPath: string, kind: 'file'|'dir'|'symbol', subtreeHash: string, path: string }
AnchorsOut  = { rev: string, units: AnchorUnit[], holes: LanguageHole[] }
LanguageHole= { ext: string, fileCount: number, reason: string }   // AUTHOR-4 — an honest structural hole
SlotInfo    = { slot: PredicateSlot, meaning: string }             // PredicateSlot imported from @atlas/knowledge
SlotsOut    = { slots: SlotInfo[] }                                // exactly the closed union, in order
DraftOut    = { fact: GroundedFact, rev: string, operation: 'CREATE'|'UPDATE',
                route: 'auto-accept'|'full-ratify', requires?: string }
GateName    = 'shape' | 'truth' | 'authz' | 'ratify'
CheckOut    = { wouldEmit: boolean, gates: { gate: GateName, pass: boolean, reason?: string,
                                             remedy?: string }[] }
```

`GroundedFact`, `PredicateSlot` are `@atlas/knowledge`-owned — **imported, never redefined**. `Verdict`,
`Guidance` are `@atlas/tools`-owned. No shape here duplicates a core shape.

## Invariants

### The grounding computer (the shared seam every planner stands on)

- <a id="author-1"></a>**AUTHOR-1 One grounding computer.** Every anchor set and every grounding this
  surface computes MUST be derived through the **same composition seam** the `atlas-emit` truth-gate
  re-derives against — the built `Axes` over `foldAstUnits(walkFileTree(repo))` plus the SCIP projection.
  There MUST NOT be a second derivation, a cached digest table, or a per-caller re-implementation. A caller
  MUST NOT be required to perform its own set-up (e.g. an AST-grammar warm-up) for its fold to match the
  runtime's — the seam owns that. _(retires the Feasibility risk; cites FR-A1/A2/A6)_
- <a id="author-2"></a>**AUTHOR-2 Planners carry zero write authority.** No door defined in this document
  MUST write, mutate, stage, or queue any byte — not to the CAS, not to the projection sidecar, not to any
  cache. The governed write surface remains exactly `{atlas-emit, atlas-link}`, and no member of this
  surface MUST appear in `WRITE_PATHS` or `GOVERNANCE_SURFACE`. _(cites FR-A4)_

### Discovery (Prepare — "where can I ground, and what can I say?")

- <a id="author-3"></a>**AUTHOR-3 Anchors are faithful and total.** `anchors <path>` MUST return exactly
  the groundable units the built index carries under `path` — each with its `qualifiedPath`, `kind`, and
  the **current** `subtreeHash` — and MUST NOT invent, omit, or reorder a unit. It MUST report the `rev`
  the set was computed at. A path outside the tracked set, a non-git directory, or an unreadable path MUST
  yield the honest empty set with its reason — **never a throw**. _(cites FR-A1)_
- <a id="author-4"></a>**AUTHOR-4 Language holes are declared, not hidden.** Symbol-level anchoring exists
  only for languages with a configured grammar. For a file in a language with **no** configured grammar,
  `anchors` MUST return the file-level unit **and** MUST declare the hole explicitly (`holes[]`: the
  extension, the file count, the reason). A silent file-level fallback — indistinguishable from a language
  that genuinely has no sub-file structure — is a violation. _(cites FR-A1; retires the Value risk of
  overclaiming coverage)_
- <a id="author-5"></a>**AUTHOR-5 Slots are the closed vocabulary, exactly.** `slots` MUST return exactly
  the members of the closed `PredicateSlot` union — all of them, none besides — each with its meaning. The
  set MUST be derived from the union, not transcribed, so a spec revision that adds a slot cannot leave the
  door stale. _(cites FR-A2)_

### Composition (Prepare — "give me a payload the door will accept")

- <a id="author-6"></a>**AUTHOR-6 A draft is structurally complete.** `draft` MUST return a `GroundedFact`
  in which **every field the governed emit door reads** is present and well-formed. Identity MUST be minted
  by the product's own `nodeKey` formula over the candidate view; the grounding's `subtreeHash` MUST be the
  value the computer (AUTHOR-1) currently derives for the cited anchor. The author supplies the **anchor,
  the slot, and the claim**; every other field MUST be computed or defaulted, never demanded. _(cites FR-A2)_
- <a id="author-7"></a>**AUTHOR-7 A draft is rev-stamped.** A draft MUST record the `rev` its grounding was
  computed at. If a draft is emitted at a different rev than the one it carries, the refusal MUST name the
  rev mismatch rather than attributing the failure to the claim. _(cites FR-A6, FR-A3)_
- <a id="author-8"></a>**AUTHOR-8 Draft→emit round-trips.** A fact drafted at rev `R` and emitted with
  `--at R` against an unchanged repository MUST be accepted by the truth door. This is the **acceptance
  property of the whole surface**: if it fails, the surface has not delivered its outcome. _(cites FR-A6 —
  the campaign's exit criterion)_
- <a id="author-9"></a>**AUTHOR-9 The ratification route is stated up front.** A draft MUST state which
  route it will take at the governed door — auto-accept, or full ratification — and, when full
  ratification is required, MUST name the channel that authorizes it. An author MUST NOT have to discover
  the requirement by having a write refused. _(cites FR-A3)_
- <a id="author-10"></a>**AUTHOR-10 CREATE and UPDATE are distinguishable.** When a current node already
  exists at the drafted `(anchor, slot)` identity, the draft MUST report the operation as an UPDATE of that
  node; otherwise as a CREATE. A draft MUST NOT silently overwrite the author's mental model of what will
  happen. _(cites FR-A2, FR-A3)_
- <a id="author-13"></a>**AUTHOR-13 Retire is a draft, not a door.** Retiring or superseding an existing
  fact MUST be expressed as a draft variant that carries the superseded authoring state, and MUST be
  persisted through `atlas-emit` under its full set of gates. No retire/delete write door MUST exist.
  _(cites FR-A4)_

### Confirmation (Confirm — "will this be accepted, and if not, why?")

- <a id="author-11"></a>**AUTHOR-11 The dry-run agrees with the door.** `check` MUST evaluate the same
  gates, in the same order, as the governed write door, and its verdict MUST agree with the door's verdict
  for the same fact at the same rev under the same actor and token. A divergence between `check` and the
  door is a defect in `check`, never a tolerated approximation. _(cites FR-A3, FR-A11 parity)_
- <a id="author-12"></a>**AUTHOR-12 Every refusal is legible.** Any refusal on this surface, and any
  refusal on the governed write doors caused by a malformed payload, MUST name **which gate refused** and
  **what would fix it**. A raw runtime error message (a type error, a stack trace, an undefined-property
  read) MUST NEVER reach a user as the reason. _(cites FR-A3; the dogfood's observed failure)_

### Monitoring (Monitor — "what did I just write, and how do I address it?")

- <a id="author-14"></a>**AUTHOR-14 The receipt closes the loop.** The value the governed emit door returns
  on success MUST include the identity the read doors (`atlas node`) and the link door (`atlas-link`)
  consume. An author MUST be able to address the fact they just wrote without performing a separate query
  to discover its handle. _(cites FR-A3; the F4 finding)_

### Entrypoints (the two transports)

- <a id="entry-cli-5"></a>**ENTRY-CLI-5 The CLI publishes a help surface.** The CLI MUST expose a help
  door that names every command, its positional arguments and flags, and the environment channels that
  govern a write (the actor identity and the ratifier token). A user MUST NOT need to read source to
  discover the command surface. _(cites FR-A3, and the Usability risk)_
- <a id="entry-cli-6"></a>**ENTRY-CLI-6 The CLI renders the whole record.** For every leg, the CLI render
  MUST surface every field of the leg's result record. A field present in the result and absent from the
  render is a silent drop and a violation. _(cites FR-A3; the F5 finding — two of three `InitOut` fields
  are dropped today)_
- <a id="entry-mcp-3"></a>**ENTRY-MCP-3 The advertised MCP surface is the governance surface UNION the
  read surface.** The MCP server MUST advertise `GOVERNANCE_SURFACE ∪ READ_SURFACE`, where `READ_SURFACE`
  is a disjoint set every member of which carries **zero** write authority. `GOVERNANCE_SURFACE` is the
  DERIVED + BUDGETED surface of ADR-0006 Decision 2 — today six (`atlas-init`, `atlas-query`, `atlas-emit`,
  `atlas-reconcile`, `atlas-link`, `atlas-memory-emit`) — and `WRITE_PATHS` is its derived write subset (today
  three: `atlas-emit`, `atlas-link`, `atlas-memory-emit`); membership of `READ_SURFACE` MUST NOT confer,
  imply, or route to a write. _(cites FR-A5, FR-A4; ADR-0005; ADR-0006 Decision 2; owner directive)_
- <a id="entry-mcp-4"></a>**ENTRY-MCP-4 Parity covers every authoring door.** For identical input, every
  door in this document MUST produce a byte-identical `Verdict` over the CLI and over MCP. The two
  transports MUST NOT diverge in coercion, defaulting, error shape, or field set. _(cites FR-A5; extends
  the existing TOOLS-3 CLI≡MCP property to the new doors)_
- <a id="entry-auth-15"></a>**ENTRY-AUTH-15 The fast-path verdicts are DERIVED, never hardcoded.** The
  write door MUST supply the two KNOW-18/ARCH-9 fast-path verdicts — `contested` and `lowRisk` — as values
  DERIVED from store/door state, never as a module-level constant that pins the gate open (which ARCH-9
  forbids by name). `contested` MUST be derived from actual store contention observed during the write
  attempt (the commit-retry detects it); `lowRisk` MUST be derived from the candidate having cleared the
  door's own TRUTH gate (a real prior verdict) and being on the advisory `T2` class. A candidate that did
  not clear the truth gate, or that is not `T2`/advisory, MUST NOT be presented as low-risk. The common
  T2-advisory-grounded auto-accept is preserved, but it is now the OBSERVED outcome of two real verdicts,
  not a hardcoded default. _(cites ARCH-9; ADR-0010 ruling 2026-09-03: no invented threshold; the verdicts
  derive from observed state, never a calibrated constant)_
- <a id="entry-auth-16"></a>**ENTRY-AUTH-16 Growth is by USE-OR-SEAL, neither mandatory.** A node in the
  advisory class grows by ONE of two earned evidences, either sufficient, neither required. The USE
  evidence: each time the node is SERVED in a pack (delivered to a reader/orchestrator), a per-node usage
  counter increments, and when the counter reaches a FIXED named constant (`USE_THRESHOLD`, one tunable
  place in the code — never a calibrated function of anything), the node rises to the next class
  implicitly, auto-accepted by the growth path with no human and no further gate — the threshold is
  deliberately a plain integer, and a node that is never served just stays advisory. The SEAL evidence: a
  human ratify token records a deliberate endorsement; that is also sufficient, independent of the counter.
  A node that earns neither stays advisory and decays by non-use (KNOW-17), and there is NO required human
  gate on the growth path — the human seal is a plus, never a precondition. _(cites ADR-0010 owner ruling
  2026-09-03: use-or-seal, neither mandatory, no human-in-the-loop, plain counter)_

## Acceptance (this surface's falsifiable checks — S3 lifts goldens from these)

1. A planner run against a read-only store completes and writes **0** bytes. _(AUTHOR-2)_
2. Mutating the planner's fold makes a subsequently drafted fact **rejected** by the emit truth-gate — i.e.
   the two derivations are provably the same seam. _(AUTHOR-1)_
3. `anchors` over the committed fixture repo deep-equals the built index's unit set for that path; a
   second run is byte-identical; a non-git path yields `units: []` with a reason and no throw. _(AUTHOR-3)_
4. `anchors` over a fixture containing a file in a grammar-less language returns that file at file level
   **and** a `holes[]` entry naming the extension and count. _(AUTHOR-4)_
5. `slots` deep-equals the closed `PredicateSlot` union; adding a member to the union without updating the
   door is impossible by construction. _(AUTHOR-5)_
6. A fact drafted from `anchors` output at rev `R`, emitted `--at R` on an unchanged repo, is **accepted**;
   the same draft emitted after an edit to the anchored unit is refused with the drift reason. _(AUTHOR-8,
   AUTHOR-7)_
7. A draft at a `(anchor, slot)` already occupied reports `UPDATE`; at a fresh one, `CREATE`. _(AUTHOR-10)_
8. A T0 draft reports `full-ratify` and names its authorizing channel **before** any emit is attempted; a
   T2 advisory draft reports `auto-accept`. _(AUTHOR-9)_
9. For a corpus spanning accepted and refused facts, `check`'s verdict equals the governed door's verdict
   on every member. _(AUTHOR-11)_
10. For every refusal in that corpus, the reason names a gate from the closed `GateName` set and carries a
    remedy; **no** reason matches a runtime-error shape. _(AUTHOR-12)_
11. The identity returned by a successful emit resolves through the per-node read door. _(AUTHOR-14)_
12. `help` names every command in the parser's command list, with its arity and the two environment
    channels. _(ENTRY-CLI-5)_
13. For every leg, the set of keys in the rendered output ⊇ the set of fields in the result record.
    _(ENTRY-CLI-6)_
14. The advertised MCP tool list equals `GOVERNANCE_SURFACE ∪ READ_SURFACE`; `GOVERNANCE_SURFACE` is the
    DERIVED + BUDGETED six and `WRITE_PATHS` its derived three (ADR-0006 Decision 2); every `READ_SURFACE`
    member writes 0 bytes. _(ENTRY-MCP-3)_
15. For a corpus of inputs, the `Verdict` from the CLI and from MCP are byte-identical for every door.
    _(ENTRY-MCP-4)_

## Decisions (ratified / DEFINE-pending — the S0 `[NEEDS RECONCILIATION]` queue)

| #        | decision                                                                                                        | status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A-D1** | The authoring doors are planners, not write doors; `GOVERNANCE_SURFACE`/`WRITE_PATHS` unchanged                 | **proposed** — ADR-0004                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **A-D2** | MCP advertises `GOVERNANCE_SURFACE ∪ READ_SURFACE`; the already-invocable read doors (`doctor`, `node`) join it | **proposed** — ADR-0005 (reconciled 2026-08-24); owner-directed. `READ_SURFACE` is TEN members — `anchors`/`slots`/`draft`/`check`/`doctor`/`node` (the authoring doors) plus the four memory-read doors. `diff` does NOT join: it is a declared zero-caller reference model (`packages/tools/src/diff.ts`), unwired to any transport — ARCH-5 (advertised≡invocable) forbids advertising it until it is genuinely wired, in a later WP                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **A-D3** | `sameAs` retraction — a wrong link used to be permanent and transitively contagious                             | **DECIDED (owner-authorized, task #83) — BUILT.** Retraction is a **MODE of the existing `atlas-link` door** (`atlas link <a> <b> --retract` / MCP `atlas-link {a,b,retract:true}`), **not a sixth tool**: `GOVERNANCE_SURFACE` stays 5 and `WRITE_PATHS` stays `{atlas-emit, atlas-link}`, so no ratified invariant moves. **[COUNT SUPERSEDED 2026-09-03]** — the "stays 5 / stays {emit, link}" was true at decision time (five-leg, ADR-0003); ADR-0006 Decision 2 (owner-ratified) made the surface DERIVED + BUDGETED and CAMPAIGN-11 added `atlas-memory-emit` (now six/three). The decision's load-bearing point — a retraction is a MODE, not a new door, so no invariant moves — is unchanged. (INV-TOOLS-1 is a _property_ since ADR-0003; INV-TOOLS-15's store-row medium is untouched — a `sameAs` edge lives in the projection sidecar). Two properties are load-bearing: **(1) identical gates** — distinct → both-known → authz-over-the-merged-class → ratify all run for a retraction exactly as for an assertion, so undoing a `T0`-class merge needs `billy` just as making it did; **(2) an APPEND, never a delete** — the peer stays in `sameAs` and the withdrawal is recorded in `sameAsRetracted`, so who asserted and who retracted both survive. The read fold `deriveSameAs` skips a withdrawn edge and the class **splits**; the gate fold `sameAsClassOf` stays deliberately retraction-blind (it prices authority, and shrinkage is the bypass direction). Retraction **latches**: re-asserting a retracted pair is refused (`retracted-pair`), because un-retracting would mean deleting the evidence. See ADR-0003 §Retraction                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **A-D4** | KNOW-8's propose→ratify prose vs. the runtime — **CLOSED by WP-PROMOTE**                                        | **MEASURED (task #83) → BUILT (WP-PROMOTE).** Neither offered reading was right. Measured by probe over the whole suite incl. the real CLI subprocesses: (1) `stage()` is a pure in-memory wrapper whose only production callers are the two GOVERNED WRITE DOORS — the explorer never calls it; (2) durable staging **is built and driven** — `atlas mine` writes candidates to its own sidecar via `commitStaging` (80 hits, all from `cli/src/mine.ts`); (3) **nothing reads staging back** — `loadStaging` had ZERO production callers (now deleted) and there is no `promote` command. So KNOW-8's measurable ("0 explorer writes reach the store except via a ratifier") **HELD, and held VACUOUSLY**: 0 explorer writes reached the store by ANY route. What enforced the separation then was **severance, not ratification** — _"mining cannot mutate governed knowledge because it cannot REACH it, not because a check says no"_ (`cli/src/mine.ts`). The prose now says this at `knowledge/src/ratify/ratify.ts`, `invariant-register.md` (KNOW-8), `reference/atlas-knowledge.md` (KNOW-8), `method-tags-knw.md` and `req-knw.md` (REQ-KNOW-8b). **BUILT (WP-PROMOTE) — the vacuity is gone.** `atlas promote` is a CLI-only curator command (`packages/cli/src/promote.ts` → `packages/adapter-io/src/governed-promote.ts`) that reads the staging sidecar through the store's own read-only decision, rehydrates each candidate's whole fact from CAS, and presents it to the EXISTING `atlas-emit` door — pre-decided by ADR-0008 as "an ordinary use of the existing emit door, NOT new surface", so `GOVERNANCE_SURFACE` stays 5 and `WRITE_PATHS` stays `{atlas-emit, atlas-link}`. **[COUNT SUPERSEDED 2026-09-03]** — see A-D3; the decision's load-bearing point (a curator door is ordinary use of the existing emit door, NOT new surface) is unchanged under ADR-0006 Decision 2 (now six/three). The load-bearing detail: the door DERIVES `origin:'promoted'` into the KNOW-18 `RatifyContext`, which removes the fast path. Without it a mined candidate — T2 ∧ advisory ∧ grounded by construction — would have routed `auto-accept`, `ratify()` would never have run, and KNOW-8 would have gone from vacuously TRUE to FALSE. `origin` is a new field rather than a forged `contested:true`/`lowRisk:false` because forging either puts a lie about store state into a record the next reader believes. Severance still describes what protects the EXPLORER; ratification now describes the CURATOR |
| **A-D5** | Symbol anchoring stays TypeScript-only for CAMPAIGN-10                                                          | **ratified as scope** — the hole is declared (AUTHOR-4), not closed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
