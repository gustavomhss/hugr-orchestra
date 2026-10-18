# S0 — Invariant Register · CAMPAIGN-10 (the authoring surface)

> state: **S0** (design-freeze candidate) · consumes: `reference/atlas-authoring.md` + `design/authoring.md`
> §4 (the 5-gate ratification table) · produces: `INV-<MODULE>-<n>` for the authoring surface · next: S1
> (EARS), gated on DEFINE ratification + `freeze/authoring-v0`.
>
> **Greenfield, not a lift.** Unlike `invariant-register-adapters.md` (enumerated verbatim from an existing
> frozen reference), this surface did not exist. The normative clauses were **authored** in
> `reference/atlas-authoring.md` under the product-design rubric (Define → Surface → Frame → Structure →
> Ratify) and every one of them passed the 5-gate bar in `design/authoring.md` §4 before landing here.
> Modules: **`AUTH`** (new — the authoring doors) plus extensions to the existing **`CLI`** and **`MCP`**
> families. All three are disjoint.
>
> **Gate status:** GATE — pending (the reconciler run is recorded in `roadmap-authoring.md` §Reconciler).
> COLD-REVIEW — **pending** (owner must dispatch; this register has NOT been cold-reviewed and MUST NOT be
> treated as frozen).

### INV-AUTH-1

behavioural: true
anchor: reference/atlas-authoring.md#author-1
text: "every anchor set and every grounding the authoring surface computes MUST be derived through the same composition seam the atlas-emit truth-gate re-derives against; there MUST NOT be a second derivation, a cached digest table, or a per-caller re-implementation, and a caller MUST NOT be required to perform its own set-up for its fold to match the runtime's"
clauses: [ "planner derivations go through the SAME seam the truth-gate re-derives against", "no second derivation / cached digest table / per-caller re-implementation exists", "a caller performs no set-up of its own for its fold to match the runtime's" ]
unwanted: [ "a planner computes a grounding a subsequent emit at the same rev rejects", "a caller must warm up state itself for its fold to match the runtime's" ]
method-tag:

### INV-AUTH-2

behavioural: true
anchor: reference/atlas-authoring.md#author-2
text: "no authoring door MUST write, mutate, stage, or queue any byte — not to the CAS, not to the projection sidecar, not to any cache; the governed write surface remains exactly {atlas-emit, atlas-link} and no member of the authoring surface MUST appear in WRITE_PATHS or GOVERNANCE_SURFACE"
clauses: [ "an authoring door writes 0 bytes to CAS, projection, and cache", "WRITE_PATHS remains exactly {atlas-emit, atlas-link}", "no authoring door is a member of WRITE_PATHS or GOVERNANCE_SURFACE" ]
unwanted: [ "a planner persists, caches, or stages state", "an authoring door is registered in WRITE_PATHS or GOVERNANCE_SURFACE" ]
method-tag:

### INV-AUTH-3

behavioural: true
anchor: reference/atlas-authoring.md#author-3
text: "the anchors door MUST return exactly the groundable units the built index carries under the path — each with qualifiedPath, kind, and the current subtreeHash — MUST NOT invent, omit, or reorder a unit, MUST report the rev the set was computed at, and MUST yield the honest empty set with a reason (never a throw) for an untracked, non-git, or unreadable path"
clauses: [ "returns exactly the built index's unit set under the path (qualifiedPath · kind · current subtreeHash)", "invents no unit, omits no unit, and preserves a deterministic order", "reports the rev the set was computed at", "an untracked / non-git / unreadable path yields the honest empty set with a reason, never a throw" ]
unwanted: [ "a unit absent from the index is emitted, or a present unit is omitted", "two runs over the same tree differ in order or content", "a non-git or unreadable path throws instead of yielding an empty set with a reason" ]
method-tag:

### INV-AUTH-4

behavioural: true
anchor: reference/atlas-authoring.md#author-4
text: "for a file in a language with no configured grammar the anchors door MUST return the file-level unit AND MUST declare the hole explicitly (extension, file count, reason); a silent file-level fallback indistinguishable from a language with no sub-file structure is a violation"
clauses: [ "a grammar-less language's file still yields its file-level unit", "the hole is declared explicitly with extension, file count, and reason", "a silent file-level fallback is forbidden" ]
unwanted: [ "a grammar-less language degrades to file level with no declared hole" ]
method-tag:

### INV-AUTH-5

behavioural: true
anchor: reference/atlas-authoring.md#author-5
text: "the slots door MUST return exactly the members of the closed PredicateSlot union — all of them, none besides — each with its meaning, derived from the union rather than transcribed so a spec revision that adds a slot cannot leave the door stale"
clauses: [ "the returned set equals the closed PredicateSlot union exactly (all members, no others)", "each member carries its meaning", "the set is DERIVED from the union, not transcribed" ]
unwanted: [ "the door returns a slot absent from the union, or omits a member of it", "a slot added to the union does not appear at the door" ]
method-tag:

### INV-AUTH-6

behavioural: true
anchor: reference/atlas-authoring.md#author-6
text: "the draft door MUST return a GroundedFact in which every field the governed emit door reads is present and well-formed; identity MUST be minted by the product's own nodeKey formula over the candidate view; the grounding's subtreeHash MUST be the value the one grounding computer currently derives for the cited anchor; the author supplies only the anchor, the slot, and the claim, and every other field MUST be computed or defaulted"
clauses: [ "every field the emit door reads is present and well-formed on the drafted fact", "identity is minted by the product's own nodeKey formula over the candidate view", "the grounding subtreeHash is the value the one computer currently derives for the anchor", "the author supplies only anchor + slot + claim; all other fields are computed or defaulted" ]
unwanted: [ "a drafted fact is missing a field the emit door reads", "the author is required to supply a computed field (identity or subtreeHash)" ]
method-tag:

### INV-AUTH-7

behavioural: true
anchor: reference/atlas-authoring.md#author-7
text: "a draft MUST record the rev its grounding was computed at, and if a draft is emitted at a different rev than the one it carries the refusal MUST name the rev mismatch rather than attributing the failure to the claim"
clauses: [ "a draft records the rev its grounding was computed at", "emitting at a different rev yields a refusal naming the rev mismatch" ]
unwanted: [ "a rev-mismatched draft is refused with a reason that blames the claim or the grounding generally" ]
method-tag:

### INV-AUTH-8

behavioural: true
anchor: reference/atlas-authoring.md#author-8
text: "a fact drafted at rev R and emitted with --at R against an unchanged repository MUST be accepted by the truth door"
clauses: [ "draft@R then emit --at R on an unchanged repo is accepted by the truth door" ]
unwanted: [ "a draft produced by the product's own door is rejected by the product's own gate at the same rev on an unchanged repo" ]
method-tag:

### INV-AUTH-9

behavioural: true
anchor: reference/atlas-authoring.md#author-9
text: "a draft MUST state which route it will take at the governed door — auto-accept or full ratification — and when full ratification is required MUST name the channel that authorizes it; an author MUST NOT have to discover the requirement by having a write refused"
clauses: [ "a draft states its route: auto-accept or full-ratify", "a full-ratify draft names the channel that authorizes it" ]
unwanted: [ "a draft that will route to full-ratify reports no route, so the requirement is discovered only via a refused write" ]
method-tag:

### INV-AUTH-10

behavioural: true
anchor: reference/atlas-authoring.md#author-10
text: "when a current node already exists at the drafted (anchor, slot) identity the draft MUST report the operation as an UPDATE of that node, otherwise as a CREATE"
clauses: [ "an occupied (anchor, slot) identity drafts as UPDATE", "a free (anchor, slot) identity drafts as CREATE" ]
unwanted: [ "a draft over an occupied identity reports CREATE (or reports nothing), hiding that an existing node will be updated" ]
method-tag:

### INV-AUTH-11

behavioural: true
anchor: reference/atlas-authoring.md#author-11
text: "the check door MUST evaluate the same gates, in the same order, as the governed write door, and its verdict MUST agree with the door's verdict for the same fact at the same rev under the same actor and token"
clauses: [ "check evaluates the same gates in the same order as the governed door", "check's verdict agrees with the door's verdict for the same fact / rev / actor / token" ]
unwanted: [ "check passes an input the governed door refuses, or refuses an input the door accepts" ]
method-tag:

### INV-AUTH-12

behavioural: true
anchor: reference/atlas-authoring.md#author-12
text: "any refusal on the authoring surface, and any refusal on the governed write doors caused by a malformed payload, MUST name which gate refused and what would fix it; a raw runtime error message MUST NEVER reach a user as the reason"
clauses: [ "every refusal names the gate that refused", "every refusal carries a remedy", "no raw runtime error message reaches a user as the reason" ]
unwanted: [ "a malformed payload surfaces a runtime error string (type error / stack trace / undefined-property read) as the refusal reason" ]
method-tag:

### INV-AUTH-13

behavioural: true
anchor: reference/atlas-authoring.md#author-13
text: "retiring or superseding an existing fact MUST be expressed as a draft variant carrying the superseded authoring state and MUST be persisted through atlas-emit under its full set of gates; no retire or delete write door MUST exist"
clauses: [ "retire/supersede is a draft variant carrying the superseded authoring state", "it persists through atlas-emit under the full gate set", "no retire or delete write door exists" ]
unwanted: [ "a retire path persists outside atlas-emit, or bypasses any of its gates" ]
method-tag:

### INV-AUTH-14

behavioural: true
anchor: reference/atlas-authoring.md#author-14
text: "the value the governed emit door returns on success MUST include the identity the per-node read door and the link door consume, so an author can address the fact just written without a separate query to discover its handle"
clauses: [ "the successful emit receipt includes the identity the read/link doors consume", "the returned identity resolves through the per-node read door without an intervening query" ]
unwanted: [ "the emit receipt carries only an identity no other door accepts" ]
method-tag:

### INV-CLI-5

behavioural: true
anchor: reference/atlas-authoring.md#entry-cli-5
text: "the CLI MUST expose a help door that names every command, its positional arguments and flags, and the environment channels that govern a write; a user MUST NOT need to read source to discover the command surface"
clauses: [ "the help door names every command with its positionals and flags", "the help door names the environment channels that govern a write" ]
unwanted: [ "a command exists in the parser and is absent from help", "a write-governing environment channel is undocumented at the help door" ]
method-tag:

### INV-CLI-6

behavioural: true
anchor: reference/atlas-authoring.md#entry-cli-6
text: "for every leg the CLI render MUST surface every field of the leg's result record; a field present in the result and absent from the render is a silent drop and a violation"
clauses: [ "for every leg, the rendered key set covers every field of the result record" ]
unwanted: [ "a field present in a leg's result record does not appear in the CLI render" ]
method-tag:

### INV-MCP-3

behavioural: true
anchor: reference/atlas-authoring.md#entry-mcp-3
text: "the MCP server MUST advertise GOVERNANCE_SURFACE ∪ READ_SURFACE, where READ_SURFACE is a disjoint set every member of which carries zero write authority; GOVERNANCE_SURFACE MUST remain exactly five and WRITE_PATHS exactly two, and membership of READ_SURFACE MUST NOT confer, imply, or route to a write"
clauses: [ "the advertised set equals GOVERNANCE_SURFACE ∪ READ_SURFACE", "READ_SURFACE is disjoint from GOVERNANCE_SURFACE and from WRITE_PATHS", "every READ_SURFACE member carries zero write authority", "GOVERNANCE_SURFACE remains exactly five and WRITE_PATHS exactly two" ]
unwanted: [ "a READ_SURFACE member routes to a write path", "the advertised set omits a governance tool or a read-surface member", "GOVERNANCE_SURFACE or WRITE_PATHS grows as a side effect of publishing a read door" ]
method-tag:

### INV-MCP-4

behavioural: true
anchor: reference/atlas-authoring.md#entry-mcp-4
text: "for identical input every authoring door MUST produce a byte-identical Verdict over the CLI and over MCP; the two transports MUST NOT diverge in coercion, defaulting, error shape, or field set"
clauses: [ "identical input yields a byte-identical Verdict across CLI and MCP for every authoring door", "the transports do not diverge in coercion, defaulting, error shape, or field set" ]
unwanted: [ "a transport coerces, defaults, or reshapes a result the other does not" ]
method-tag:

---

## Completeness (S0 predicates — reported, not assumed)

| predicate                                                           | verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| every INV has final text + anchor + `behavioural`                   | ✅ 18/18                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| every non-behavioural INV carries an `exempt:` reason               | ✅ vacuous — **0** non-behavioural INVs in this surface (every clause constrains observable behaviour)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| zero open design question inside a ratified INV                     | ✅ **both DEFINE items dispositioned (task #83, owner-authorized).** **A-D3** (`sameAs` retraction) is DECIDED and BUILT as a MODE of `atlas-link`, `GOVERNANCE_SURFACE`/`WRITE_PATHS` unchanged — ADR-0003 §Retraction. **A-D4** (KNOW-8 staging prose vs runtime) was MEASURED and the prose NARROWED — the measurable held **vacuously** (severance, not ratification) — and the residual build task is now DONE: the governed promotion door ships as `atlas promote`, a CLI-only curator command publishing through the existing `atlas-emit` door (`GOVERNANCE_SURFACE`/`WRITE_PATHS` unchanged), so the measurable holds non-vacuously. Both were deliberately **not** INVs here. Recorded in `reference/atlas-authoring.md` §Decisions |
| zero `owner: TBD`                                                   | ✅                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| zero unresolved contradiction with a ratified invariant             | ✅ INV-TOOLS-1 / ADR-0003 untouched — verified: `GOVERNANCE_SURFACE` 5, `WRITE_PATHS` 2, both unchanged by every clause above                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| every clause normative, singular-in-intent, free of `~`/TBD         | ⚠️ **judgment — belongs to COLD-REVIEW, pending**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| every INV cites an outcome statement, job-map step, or retired risk | ✅ `design/authoring.md` §4 table — all 18 rows carry a citation and a rejected alternative                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

**DoD: NOT MET.** GATE pending, COLD-REVIEW pending. This register is a **freeze candidate**, not a freeze.
