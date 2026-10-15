# S1 — Requirements (EARS) · CAMPAIGN-10 (the authoring surface)

> state: **S1** · consumes: `requirements/invariant-register-authoring.md` @ `freeze/authoring-v0` ·
> produces: `REQ-<MODULE>-<n>[-c]` · next: S2 (method-tags).
>
> **Projection, not authoring.** Every REQ projects exactly one frozen invariant clause into one testable
> EARS sentence — one `SHALL`, one pattern. `normative-clause:` quotes the load-bearing clause verbatim
> from `reference/atlas-authoring.md`. Each `unwanted[]` clause becomes its own `If-then` guard REQ.
>
> **80 REQs over 20 INVs.** Gate status: GATE — pending · COLD-REVIEW — **pending**.

---

## Block AUTH — the authoring doors

### REQ-AUTH-1a — one derivation seam

source: INV-AUTH-1 @ reference/atlas-authoring.md#author-1
The authoring surface shall derive every anchor set and every grounding through the same composition seam the `atlas-emit` truth-gate re-derives against.
normative-clause: "Every anchor set and every grounding this surface computes MUST be derived through the **same composition seam** the `atlas-emit` truth-gate re-derives against"

### REQ-AUTH-1b — no second derivation

source: INV-AUTH-1 @ reference/atlas-authoring.md#author-1
The authoring surface shall contain no second derivation, cached digest table, or per-caller re-implementation of the grounding computation.
normative-clause: "There MUST NOT be a second derivation, a cached digest table, or a per-caller re-implementation."

### REQ-AUTH-1c — the seam owns its set-up

source: INV-AUTH-1 @ reference/atlas-authoring.md#author-1
The grounding seam shall perform any set-up its fold requires, such that a caller performs none of its own.
normative-clause: "A caller MUST NOT be required to perform its own set-up (e.g. an AST-grammar warm-up) for its fold to match the runtime's — the seam owns that."

### REQ-AUTH-1d — planner and gate never disagree

source: INV-AUTH-1 @ reference/atlas-authoring.md#author-1 (unwanted)
If a planner computes a grounding for an anchor at a rev, then an emit of that grounding at the same rev on an unchanged repository shall not be rejected for that grounding.
normative-clause: "the **same composition seam** the `atlas-emit` truth-gate re-derives against"

### REQ-AUTH-1e — no caller-side warm-up

source: INV-AUTH-1 @ reference/atlas-authoring.md#author-1 (unwanted)
If a caller invokes the grounding seam without performing any set-up of its own, then the seam shall still produce the fold the runtime produces.
normative-clause: "A caller MUST NOT be required to perform its own set-up … for its fold to match the runtime's"

### REQ-AUTH-2a — planners write nothing

source: INV-AUTH-2 @ reference/atlas-authoring.md#author-2
An authoring door shall write zero bytes to the CAS, to the projection sidecar, and to any cache.
normative-clause: "No door defined in this document MUST write, mutate, stage, or queue any byte — not to the CAS, not to the projection sidecar, not to any cache."

### REQ-AUTH-2b — the write surface is unchanged

source: INV-AUTH-2 @ reference/atlas-authoring.md#author-2
The governed write surface shall remain exactly `{atlas-emit, atlas-link}`.
normative-clause: "The governed write surface remains exactly `{atlas-emit, atlas-link}`"

### REQ-AUTH-2c — no authoring door is a governance or write member

source: INV-AUTH-2 @ reference/atlas-authoring.md#author-2
No member of the authoring surface shall appear in `WRITE_PATHS` or in `GOVERNANCE_SURFACE`.
normative-clause: "no member of this surface MUST appear in `WRITE_PATHS` or `GOVERNANCE_SURFACE`"

### REQ-AUTH-2d — no persistence, cache, or staging

source: INV-AUTH-2 @ reference/atlas-authoring.md#author-2 (unwanted)
If an authoring door completes a call, then the durable store, the projection sidecar, and every cache shall be byte-identical to their pre-call state.
normative-clause: "MUST write, mutate, stage, or queue any byte"

### REQ-AUTH-2e — registration guard

source: INV-AUTH-2 @ reference/atlas-authoring.md#author-2 (unwanted)
If an authoring door is registered in `WRITE_PATHS` or `GOVERNANCE_SURFACE`, then the surface conformance check shall fail.
normative-clause: "no member of this surface MUST appear in `WRITE_PATHS` or `GOVERNANCE_SURFACE`"

### REQ-AUTH-3a — anchors are the index's units

source: INV-AUTH-3 @ reference/atlas-authoring.md#author-3
The `anchors` door shall return exactly the groundable units the built index carries under the requested path, each carrying its `qualifiedPath`, its `kind`, and its current `subtreeHash`.
normative-clause: "`anchors <path>` MUST return exactly the groundable units the built index carries under `path` — each with its `qualifiedPath`, `kind`, and the **current** `subtreeHash`"

### REQ-AUTH-3b — no invention, omission, or reordering

source: INV-AUTH-3 @ reference/atlas-authoring.md#author-3
The `anchors` door shall neither invent, omit, nor reorder a unit.
normative-clause: "and MUST NOT invent, omit, or reorder a unit"

### REQ-AUTH-3c — anchors report their rev

source: INV-AUTH-3 @ reference/atlas-authoring.md#author-3
The `anchors` door shall report the rev the unit set was computed at.
normative-clause: "It MUST report the `rev` the set was computed at."

### REQ-AUTH-3d — honest empty on an unreachable path

source: INV-AUTH-3 @ reference/atlas-authoring.md#author-3
The `anchors` door shall yield the empty unit set together with its reason for a path outside the tracked set, in a non-git directory, or unreadable.
normative-clause: "A path outside the tracked set, a non-git directory, or an unreadable path MUST yield the honest empty set with its reason"

### REQ-AUTH-3e — no phantom or missing unit

source: INV-AUTH-3 @ reference/atlas-authoring.md#author-3 (unwanted)
If a unit is absent from the built index, then `anchors` shall not emit it; and if a unit is present, then `anchors` shall emit it.
normative-clause: "MUST return exactly the groundable units the built index carries under `path` … MUST NOT invent, omit"

### REQ-AUTH-3f — anchors are order-stable

source: INV-AUTH-3 @ reference/atlas-authoring.md#author-3 (unwanted)
If the same tree is queried more than once at the same rev, then `anchors` shall yield identical order and content.
normative-clause: "MUST NOT … reorder a unit"

### REQ-AUTH-3g — never a throw

source: INV-AUTH-3 @ reference/atlas-authoring.md#author-3 (unwanted)
If the requested path is non-git or unreadable, then `anchors` shall return a structured empty result rather than raising.
normative-clause: "**never a throw**"

### REQ-AUTH-4a — a grammar-less file still anchors

source: INV-AUTH-4 @ reference/atlas-authoring.md#author-4
For a file in a language with no configured grammar, `anchors` shall return that file's file-level unit.
normative-clause: "For a file in a language with **no** configured grammar, `anchors` MUST return the file-level unit"

### REQ-AUTH-4b — the hole is declared

source: INV-AUTH-4 @ reference/atlas-authoring.md#author-4
For a language with no configured grammar, `anchors` shall declare the hole with its extension, its file count, and its reason.
normative-clause: "**and** MUST declare the hole explicitly (`holes[]`: the extension, the file count, the reason)"

### REQ-AUTH-4c — no silent fallback

source: INV-AUTH-4 @ reference/atlas-authoring.md#author-4
The `anchors` door shall not degrade to file level without declaring the hole.
normative-clause: "A silent file-level fallback — indistinguishable from a language that genuinely has no sub-file structure — is a violation."

### REQ-AUTH-4d — undeclared degradation guard

source: INV-AUTH-4 @ reference/atlas-authoring.md#author-4 (unwanted)
If a file's language has no configured grammar and the result carries no corresponding hole entry, then the result shall be treated as a violation.
normative-clause: "A silent file-level fallback … is a violation."

### REQ-AUTH-5a — the slot set is the union

source: INV-AUTH-5 @ reference/atlas-authoring.md#author-5
The `slots` door shall return exactly the members of the closed `PredicateSlot` union — all of them and no others.
normative-clause: "`slots` MUST return exactly the members of the closed `PredicateSlot` union — all of them, none besides"

### REQ-AUTH-5b — each slot carries its meaning

source: INV-AUTH-5 @ reference/atlas-authoring.md#author-5
The `slots` door shall return each member together with its meaning.
normative-clause: "each with its meaning"

### REQ-AUTH-5c — derived, not transcribed

source: INV-AUTH-5 @ reference/atlas-authoring.md#author-5
The `slots` door shall derive its set from the `PredicateSlot` union rather than from a transcribed copy.
normative-clause: "The set MUST be derived from the union, not transcribed, so a spec revision that adds a slot cannot leave the door stale."

### REQ-AUTH-5d — no extra or missing slot

source: INV-AUTH-5 @ reference/atlas-authoring.md#author-5 (unwanted)
If a slot is absent from the `PredicateSlot` union, then `slots` shall not return it; and if a slot is a member, then `slots` shall return it.
normative-clause: "all of them, none besides"

### REQ-AUTH-5e — a new union member reaches the door

source: INV-AUTH-5 @ reference/atlas-authoring.md#author-5 (unwanted)
If a member is added to the `PredicateSlot` union, then `slots` shall return it with no change to the door.
normative-clause: "so a spec revision that adds a slot cannot leave the door stale"

### REQ-AUTH-6a — a draft is complete for the door

source: INV-AUTH-6 @ reference/atlas-authoring.md#author-6
The `draft` door shall return a `GroundedFact` in which every field the governed emit door reads is present and well-formed.
normative-clause: "`draft` MUST return a `GroundedFact` in which **every field the governed emit door reads** is present and well-formed."

### REQ-AUTH-6b — identity is minted by the product formula

source: INV-AUTH-6 @ reference/atlas-authoring.md#author-6
The `draft` door shall mint the fact's identity with the product's own `nodeKey` formula over the candidate view.
normative-clause: "Identity MUST be minted by the product's own `nodeKey` formula over the candidate view"

### REQ-AUTH-6c — the grounding hash is the computer's current value

source: INV-AUTH-6 @ reference/atlas-authoring.md#author-6
The `draft` door shall set the grounding's `subtreeHash` to the value the one grounding computer currently derives for the cited anchor.
normative-clause: "the grounding's `subtreeHash` MUST be the value the computer (AUTHOR-1) currently derives for the cited anchor"

### REQ-AUTH-6d — only three fields are asked of the author

source: INV-AUTH-6 @ reference/atlas-authoring.md#author-6
The `draft` door shall require of the author only the anchor, the slot, and the claim, computing or defaulting every other field.
normative-clause: "The author supplies the **anchor, the slot, and the claim**; every other field MUST be computed or defaulted, never demanded."

### REQ-AUTH-6e — no missing door-read field

source: INV-AUTH-6 @ reference/atlas-authoring.md#author-6 (unwanted)
If a field is read by the governed emit door, then a drafted fact shall carry it.
normative-clause: "**every field the governed emit door reads** is present and well-formed"

### REQ-AUTH-6f — no computed field demanded of the author

source: INV-AUTH-6 @ reference/atlas-authoring.md#author-6 (unwanted)
If a field is computed by the grounding computer or the identity formula, then `draft` shall not require the author to supply it.
normative-clause: "every other field MUST be computed or defaulted, never demanded"

### REQ-AUTH-7a — a draft carries its rev

source: INV-AUTH-7 @ reference/atlas-authoring.md#author-7
A draft shall record the rev its grounding was computed at.
normative-clause: "A draft MUST record the `rev` its grounding was computed at."

### REQ-AUTH-7b — a rev mismatch is named

source: INV-AUTH-7 @ reference/atlas-authoring.md#author-7
When a draft is emitted at a rev other than the one it carries, the refusal shall name the rev mismatch.
normative-clause: "If a draft is emitted at a different rev than the one it carries, the refusal MUST name the rev mismatch"

### REQ-AUTH-7c — the claim is not blamed

source: INV-AUTH-7 @ reference/atlas-authoring.md#author-7 (unwanted)
If a draft is refused because of a rev mismatch, then the refusal shall not attribute the failure to the claim.
normative-clause: "rather than attributing the failure to the claim"

### REQ-AUTH-8a — draft→emit round-trips

source: INV-AUTH-8 @ reference/atlas-authoring.md#author-8
When a fact drafted at rev R is emitted with `--at R` against an unchanged repository, the truth door shall accept it.
normative-clause: "A fact drafted at rev `R` and emitted with `--at R` against an unchanged repository MUST be accepted by the truth door."

### REQ-AUTH-8b — no self-rejection

source: INV-AUTH-8 @ reference/atlas-authoring.md#author-8 (unwanted)
If a fact was produced by the product's own draft door at rev R and the repository is unchanged, then the product's own truth gate shall not reject it at rev R.
normative-clause: "MUST be accepted by the truth door"

### REQ-AUTH-9a — the route is stated

source: INV-AUTH-9 @ reference/atlas-authoring.md#author-9
A draft shall state whether it will auto-accept or route to full ratification at the governed door.
normative-clause: "A draft MUST state which route it will take at the governed door — auto-accept, or full ratification"

### REQ-AUTH-9b — the authorizing channel is named

source: INV-AUTH-9 @ reference/atlas-authoring.md#author-9
When a draft will route to full ratification, it shall name the channel that authorizes it.
normative-clause: "and, when full ratification is required, MUST name the channel that authorizes it"

### REQ-AUTH-9c — no discovery by refusal

source: INV-AUTH-9 @ reference/atlas-authoring.md#author-9 (unwanted)
If a draft will route to full ratification, then the requirement shall be visible before any write is attempted.
normative-clause: "An author MUST NOT have to discover the requirement by having a write refused."

### REQ-AUTH-10a — an occupied identity drafts as UPDATE

source: INV-AUTH-10 @ reference/atlas-authoring.md#author-10
When a current node already exists at the drafted `(anchor, slot)` identity, the draft shall report the operation as an UPDATE of that node.
normative-clause: "When a current node already exists at the drafted `(anchor, slot)` identity, the draft MUST report the operation as an UPDATE of that node"

### REQ-AUTH-10b — a free identity drafts as CREATE

source: INV-AUTH-10 @ reference/atlas-authoring.md#author-10
When no current node exists at the drafted `(anchor, slot)` identity, the draft shall report the operation as a CREATE.
normative-clause: "otherwise as a CREATE"

### REQ-AUTH-10c — no silent overwrite

source: INV-AUTH-10 @ reference/atlas-authoring.md#author-10 (unwanted)
If a draft targets an occupied identity, then it shall not report CREATE and shall not omit the operation.
normative-clause: "A draft MUST NOT silently overwrite the author's mental model of what will happen."

### REQ-AUTH-11a — same gates, same order

source: INV-AUTH-11 @ reference/atlas-authoring.md#author-11
The `check` door shall evaluate the same gates, in the same order, as the governed write door.
normative-clause: "`check` MUST evaluate the same gates, in the same order, as the governed write door"

### REQ-AUTH-11b — verdicts agree

source: INV-AUTH-11 @ reference/atlas-authoring.md#author-11
The `check` door's verdict shall equal the governed door's verdict for the same fact at the same rev under the same actor and token.
normative-clause: "and its verdict MUST agree with the door's verdict for the same fact at the same rev under the same actor and token"

### REQ-AUTH-11c — divergence is a defect

source: INV-AUTH-11 @ reference/atlas-authoring.md#author-11 (unwanted)
If `check` accepts an input the governed door refuses, or refuses an input the door accepts, then the divergence shall be treated as a defect in `check`.
normative-clause: "A divergence between `check` and the door is a defect in `check`, never a tolerated approximation."

### REQ-AUTH-12a — the refusing gate is named

source: INV-AUTH-12 @ reference/atlas-authoring.md#author-12
Any refusal on the authoring surface, and any refusal on a governed write door caused by a malformed payload, shall name which gate refused.
normative-clause: "Any refusal on this surface, and any refusal on the governed write doors caused by a malformed payload, MUST name **which gate refused**"

### REQ-AUTH-12b — a remedy is carried

source: INV-AUTH-12 @ reference/atlas-authoring.md#author-12
Every such refusal shall carry what would fix it.
normative-clause: "and **what would fix it**"

### REQ-AUTH-12c — no runtime error as a reason

source: INV-AUTH-12 @ reference/atlas-authoring.md#author-12
No refusal reason shall be a raw runtime error message.
normative-clause: "A raw runtime error message (a type error, a stack trace, an undefined-property read) MUST NEVER reach a user as the reason."

### REQ-AUTH-12d — malformed payload guard

source: INV-AUTH-12 @ reference/atlas-authoring.md#author-12 (unwanted)
If a payload is malformed, then the refusal shall name the failing gate and remedy rather than surfacing a type error, a stack trace, or an undefined-property read.
normative-clause: "a type error, a stack trace, an undefined-property read"

### REQ-AUTH-13a — retire is a draft variant

source: INV-AUTH-13 @ reference/atlas-authoring.md#author-13
Retiring or superseding an existing fact shall be expressed as a draft variant carrying the superseded authoring state.
normative-clause: "Retiring or superseding an existing fact MUST be expressed as a draft variant that carries the superseded authoring state"

### REQ-AUTH-13b — retire persists through the governed door

source: INV-AUTH-13 @ reference/atlas-authoring.md#author-13
A retire draft shall be persisted through `atlas-emit` under its full set of gates.
normative-clause: "and MUST be persisted through `atlas-emit` under its full set of gates"

### REQ-AUTH-13c — no retire or delete door

source: INV-AUTH-13 @ reference/atlas-authoring.md#author-13
No retire or delete write door shall exist.
normative-clause: "No retire/delete write door MUST exist."

### REQ-AUTH-13d — no gate bypass on retire

source: INV-AUTH-13 @ reference/atlas-authoring.md#author-13 (unwanted)
If a retire is persisted, then it shall have passed every gate a grounded-fact emit passes.
normative-clause: "under its full set of gates"

### REQ-AUTH-14a — the receipt carries the read identity

source: INV-AUTH-14 @ reference/atlas-authoring.md#author-14
The value the governed emit door returns on success shall include the identity the per-node read door and the link door consume.
normative-clause: "The value the governed emit door returns on success MUST include the identity the read doors (`atlas node`) and the link door (`atlas-link`) consume."

### REQ-AUTH-14b — the receipt resolves

source: INV-AUTH-14 @ reference/atlas-authoring.md#author-14
An author shall be able to address the fact just written using the emit receipt alone.
normative-clause: "An author MUST be able to address the fact they just wrote without performing a separate query to discover its handle."

### REQ-AUTH-14c — no unusable-only receipt

source: INV-AUTH-14 @ reference/atlas-authoring.md#author-14 (unwanted)
If an emit succeeds, then its receipt shall not consist solely of an identity no other door accepts.
normative-clause: "without performing a separate query to discover its handle"

---

## Block CLI — the command-line entrypoint (extension)

### REQ-CLI-5a — help covers every command

source: INV-CLI-5 @ reference/atlas-authoring.md#entry-cli-5
The CLI help door shall name every command together with its positional arguments and flags.
normative-clause: "The CLI MUST expose a help door that names every command, its positional arguments and flags"

### REQ-CLI-5b — help covers the write-governing environment

source: INV-CLI-5 @ reference/atlas-authoring.md#entry-cli-5
The CLI help door shall name the environment channels that govern a write.
normative-clause: "and the environment channels that govern a write (the actor identity and the ratifier token)"

### REQ-CLI-5c — no undocumented command

source: INV-CLI-5 @ reference/atlas-authoring.md#entry-cli-5 (unwanted)
If a command exists in the parser's command list, then help shall name it.
normative-clause: "names every command"

### REQ-CLI-5d — no source-reading required

source: INV-CLI-5 @ reference/atlas-authoring.md#entry-cli-5 (unwanted)
If a channel governs a write, then help shall name it.
normative-clause: "A user MUST NOT need to read source to discover the command surface."

### REQ-CLI-6a — the render covers the record

source: INV-CLI-6 @ reference/atlas-authoring.md#entry-cli-6
For every leg, the CLI render shall surface every field of the leg's result record.
normative-clause: "For every leg, the CLI render MUST surface every field of the leg's result record."

### REQ-CLI-6b — no silent drop

source: INV-CLI-6 @ reference/atlas-authoring.md#entry-cli-6 (unwanted)
If a field is present in a leg's result record, then it shall appear in that leg's CLI render.
normative-clause: "A field present in the result and absent from the render is a silent drop and a violation."

---

## Block MCP — the MCP entrypoint (extension)

### REQ-MCP-3a — the advertised set is the union

source: INV-MCP-3 @ reference/atlas-authoring.md#entry-mcp-3
The MCP server shall advertise `GOVERNANCE_SURFACE ∪ READ_SURFACE`.
normative-clause: "The MCP server MUST advertise `GOVERNANCE_SURFACE ∪ READ_SURFACE`"

### REQ-MCP-3b — the read surface is disjoint

source: INV-MCP-3 @ reference/atlas-authoring.md#entry-mcp-3
`READ_SURFACE` shall be disjoint from `GOVERNANCE_SURFACE` and from `WRITE_PATHS`.
normative-clause: "where `READ_SURFACE` is a disjoint set"

### REQ-MCP-3c — read members carry no write authority

source: INV-MCP-3 @ reference/atlas-authoring.md#entry-mcp-3
Every `READ_SURFACE` member shall carry zero write authority.
normative-clause: "every member of which carries **zero** write authority"

### REQ-MCP-3d — the governed counts are derived, not fixed

source: INV-MCP-3 @ reference/atlas-authoring.md#entry-mcp-3 (amended ADR-0006 Decision 2)
`GOVERNANCE_SURFACE` is the DERIVED + BUDGETED surface of ADR-0006 Decision 2 — today six (`atlas-init`, `atlas-query`, `atlas-emit`, `atlas-reconcile`, `atlas-link`, `atlas-memory-emit`) — and `WRITE_PATHS` is its derived write subset (today three: `atlas-emit`, `atlas-link`, `atlas-memory-emit`).
normative-clause: "`GOVERNANCE_SURFACE` is the DERIVED + BUDGETED surface of ADR-0006 Decision 2"

### REQ-MCP-3e — no read-to-write routing

source: INV-MCP-3 @ reference/atlas-authoring.md#entry-mcp-3 (unwanted)
If a tool is a member of `READ_SURFACE`, then invoking it shall not route to a write path.
normative-clause: "membership of `READ_SURFACE` MUST NOT confer, imply, or route to a write"

### REQ-MCP-3f — no omission from the advertisement

source: INV-MCP-3 @ reference/atlas-authoring.md#entry-mcp-3 (unwanted)
If a tool is a member of either set, then it shall appear in the advertised list.
normative-clause: "MUST advertise `GOVERNANCE_SURFACE ∪ READ_SURFACE`"

### REQ-MCP-3g — publishing a read door grows no governed set

source: INV-MCP-3 @ reference/atlas-authoring.md#entry-mcp-3 (amended ADR-0006 Decision 2)
If a read door is published, then `GOVERNANCE_SURFACE` and `WRITE_PATHS` shall be unchanged, because both are the DERIVED + BUDGETED surface of ADR-0006 Decision 2 rather than a fixed count.
normative-clause: "`GOVERNANCE_SURFACE` is the DERIVED + BUDGETED surface of ADR-0006 Decision 2"

### REQ-MCP-4a — byte-identical verdicts

source: INV-MCP-4 @ reference/atlas-authoring.md#entry-mcp-4
For identical input, every authoring door shall produce a byte-identical `Verdict` over the CLI and over MCP.
normative-clause: "For identical input, every door in this document MUST produce a byte-identical `Verdict` over the CLI and over MCP."

### REQ-MCP-4b — no transport-specific shaping

source: INV-MCP-4 @ reference/atlas-authoring.md#entry-mcp-4
The two transports shall not diverge in coercion, defaulting, error shape, or field set.
normative-clause: "The two transports MUST NOT diverge in coercion, defaulting, error shape, or field set."

### REQ-MCP-4c — divergence guard

source: INV-MCP-4 @ reference/atlas-authoring.md#entry-mcp-4 (unwanted)
If one transport coerces, defaults, or reshapes a result, then the parity check shall fail.
normative-clause: "MUST NOT diverge in coercion, defaulting, error shape, or field set"

### REQ-AUTH-15a — the fast-path verdicts are derived, never a hardcoded constant

source: INV-AUTH-15 @ reference/atlas-authoring.md#entry-auth-15
The write door shall supply the `contested` and `lowRisk` fast-path verdicts as values derived from store/door state, not as a module-level constant.
normative-clause: "The write door MUST supply the two KNOW-18/ARCH-9 fast-path verdicts — `contested` and `lowRisk` — as values DERIVED from store/door state, never as a module-level constant that pins the gate open"

### REQ-AUTH-15b — contested derives from observed contention

source: INV-AUTH-15 @ reference/atlas-authoring.md#entry-auth-15
If a write collides or contends with a concurrent change during the commit attempt, then the door shall present the candidate as contested.
normative-clause: "`contested` MUST be derived from actual store contention observed during the write attempt (the commit-retry detects it)"

### REQ-AUTH-15c — lowRisk derives from the truth gate and the advisory class

source: INV-AUTH-15 @ reference/atlas-authoring.md#entry-auth-15 (unwanted)
If a candidate has not cleared the door's truth gate, or is not `T2`/advisory, then the door shall not present it as low-risk.
normative-clause: "`lowRisk` MUST be derived from the candidate having cleared the door's own TRUTH gate (a real prior verdict) and being on the advisory `T2` class. A candidate that did not clear the truth gate, or that is not `T2`/advisory, MUST NOT be presented as low-risk"

### REQ-AUTH-16a — served-in-a-pack increments the usage counter

source: INV-AUTH-16 @ reference/atlas-authoring.md#entry-auth-16
When a node in the advisory class is served in a pack, the knowledge module shall increment a per-node usage counter.
normative-clause: "each time the node is SERVED in a pack (delivered to a reader/orchestrator), a per-node usage counter increments"

### REQ-AUTH-16b — the fixed threshold

source: INV-AUTH-16 @ reference/atlas-authoring.md#entry-auth-16
When a node's usage counter reaches the fixed named constant, the knowledge module shall rise it to the next class implicitly.
normative-clause: "and when the counter reaches a FIXED named constant (`USE_THRESHOLD`, one tunable place in the code — never a calibrated function of anything), the node rises to the next class implicitly, auto-accepted by the growth path with no human and no further gate"

### REQ-AUTH-16c — the human seal is an alternative, sufficient evidence

source: INV-AUTH-16 @ reference/atlas-authoring.md#entry-auth-16
A human ratify token that records a deliberate endorsement shall also be sufficient to rise a node's class, independent of the usage counter.
normative-clause: "a human ratify token records a deliberate endorsement; that is also sufficient, independent of the counter"

### REQ-AUTH-16d — neither growth evidence is mandatory

source: INV-AUTH-16 @ reference/atlas-authoring.md#entry-auth-16 (unwanted)
If a node earns neither a reached threshold nor a human seal, then it shall stay advisory and decay by non-use rather than rising.
normative-clause: "A node that earns neither stays advisory and decays by non-use (KNOW-17), and there is NO required human gate on the growth path — the human seal is a plus, never a precondition"

---

## Completeness (S1 predicates)

| predicate                                                      | verdict                               |
| -------------------------------------------------------------- | ------------------------------------- |
| every behavioural INV has ≥1 REQ                               | ✅ 20/20                              |
| every `unwanted[]` clause has its `If-then` guard REQ          | ✅ 27/27                              |
| zero orphan REQ (every REQ cites an extant INV)                | ✅ 80/80                              |
| every REQ has exactly one `SHALL` and matches one EARS pattern | ⚠️ mechanical — **GATE pending**      |
| every REQ quotes its clause without paraphrase                 | ⚠️ judgment — **COLD-REVIEW pending** |

**Counts (recomputed mechanically, not asserted):** **80 REQs = 53 clause-projections + 27
unwanted-behaviour guards**, over **20 INVs** — matching the register exactly (53 `clauses[]` entries, 27
`unwanted[]` entries). By block: **AUTH 57 · CLI 6 · MCP 10**.

**DoD: NOT MET** — GATE pending, COLD-REVIEW pending.
