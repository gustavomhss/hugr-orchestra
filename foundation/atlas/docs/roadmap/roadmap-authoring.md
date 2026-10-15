# Roadmap — CAMPAIGN-10 (the authoring surface) · state C

> **state:** C · **protocol:** [`C-roadmap`](../method/prompts/C.md) + `completeness`/`reconciler` ·
> **axiom:** S1+S3 frozen (`requirements-authoring.md` 73 REQs · `goldens-authoring.md` 73 SCNs) ·
> **owner:** lead; verticality + DAG cold-review **pending** (bobby / BLUEPRINT).
>
> The **warp** axis: vertical capabilities across the authoring modules, grouped into dependency-ordered
> campaigns. The **weft** (per-module slice) is S4's job under these epics
> ([`work-packages/wp-campaign-10.md`](../requirements/work-packages/wp-campaign-10.md)). IDs are
> surface-scoped; the parent atlas holds CAMPAIGN-1..8 (the core) and CAMPAIGN-9 (the productization ring).
>
> **Backbone** (functional-surface L1, from [`design/authoring-surface-study.md`](../design/authoring-surface-study.md) §4):
> `move in → find a place → say it → check it → record it → keep it true`.
> The built product covers the first and last columns. **This campaign builds the middle four.**

---

### EPIC-A1 — see where I can ground

goal-trace: "an author cannot cite what they cannot name → the one grounding computer is exposed as a door that lists the built index's real units with their real hashes → the discovery floor, on which every other authoring door stands"
vertical: adapter-io (the shared grounding seam · anchors derivation) → tools (the anchors leg · result types · published schema) → cli (`atlas anchors` · render) — demoable: `atlas anchors src` on a real repo prints citable units with the hashes the emit gate will re-derive, and `atlas anchors core` declares the Rust hole instead of hiding it
reqs: [ REQ-AUTH-1a, REQ-AUTH-1b, REQ-AUTH-1c, REQ-AUTH-1d, REQ-AUTH-1e, REQ-AUTH-2a, REQ-AUTH-2b, REQ-AUTH-2c, REQ-AUTH-2d, REQ-AUTH-2e, REQ-AUTH-3a, REQ-AUTH-3b, REQ-AUTH-3c, REQ-AUTH-3d, REQ-AUTH-3e, REQ-AUTH-3f, REQ-AUTH-3g, REQ-AUTH-4a, REQ-AUTH-4b, REQ-AUTH-4c, REQ-AUTH-4d ]
campaign: CAMPAIGN-10.1
note: **not split.** 21 REQs, but 11 of them are unwanted-behaviour guards, and the capability is single
("see where I can ground"). It spans seam → leg → CLI, so it is not a module slab. A split at the seam
would produce a non-demoable child, which carpaccio forbids. Carries the write-freedom invariant (AUTH-2)
because it births the first planners and the write-spy harness every later epic reuses.

### EPIC-A2 — compose a fact the door accepts

goal-trace: "a grounded fact is mechanically expensive and semantically cheap → the product computes the mechanical part and asks the author only for the meaning → the authoring act itself"
vertical: tools (slots · draft legs · DraftOut) → adapter-io (identity + grounding via the A1 seam) → cli (`atlas slots`, `atlas draft`) — demoable: `atlas draft --anchor <from anchors> --slot invariant --claim "…"` emits a complete fact JSON that `atlas emit --at <rev>` **accepts**
reqs: [ 26 REQs — the union of EPIC-A2-a and EPIC-A2-b below ]
campaign: CAMPAIGN-10.1
split: **Path** (SPIDR) — the main authoring path (A2-a) from the alternate lifecycle paths (A2-b)

### EPIC-A2-a — the main path: draft an advisory fact that round-trips

goal-trace: "the shortest true path from 'I know something' to 'Atlas accepted it' → slots + draft + a rev-stamped payload → the acceptance property of the whole campaign"
vertical: tools (slots · draft) → adapter-io (grounding seam) → cli — demoable: the four-call chain `anchors → slots → draft → emit` completes, and PROP-AUTH-8 holds over the fixture's whole unit set
reqs: [ REQ-AUTH-5a, REQ-AUTH-5b, REQ-AUTH-5c, REQ-AUTH-5d, REQ-AUTH-5e, REQ-AUTH-6a, REQ-AUTH-6b, REQ-AUTH-6c, REQ-AUTH-6d, REQ-AUTH-6e, REQ-AUTH-6f, REQ-AUTH-7a, REQ-AUTH-7b, REQ-AUTH-7c, REQ-AUTH-8a, REQ-AUTH-8b ]
campaign: CAMPAIGN-10.1
split: Path (the happy authoring path) from EPIC-A2

### EPIC-A2-b — the lifecycle paths: route, update, retire

goal-trace: "authoring is not only creation → the draft discloses its ratification route, distinguishes CREATE from UPDATE, and expresses retire without a new write door → the full authoring lifecycle at zero governance cost"
vertical: tools (route disclosure · occupancy lookup · supersede variant) → adapter-io (projection rehydrate · route function) → cli (`--supersede`) — demoable: a T0 draft announces it needs the ratifier **before** any write; a reworded claim at an occupied anchor reports UPDATE; a retire persists only through `atlas-emit`
reqs: [ REQ-AUTH-9a, REQ-AUTH-9b, REQ-AUTH-9c, REQ-AUTH-10a, REQ-AUTH-10b, REQ-AUTH-10c, REQ-AUTH-13a, REQ-AUTH-13b, REQ-AUTH-13c, REQ-AUTH-13d ]
campaign: CAMPAIGN-10.1
split: Path (the alternate lifecycle paths) from EPIC-A2

### EPIC-A3 — know before I write

goal-trace: "a refusal that teaches nothing costs the author a full round trip → a dry-run that provably agrees with the governed door, and refusals that name their gate and their remedy → the confirmation step of the job map"
vertical: adapter-io (the emit door's gate chain exposed as composable, side-effect-free gates) → tools (the check leg · GateName · CheckOut) → cli (`atlas check`) — demoable: `atlas check <anchor> <slot> <claim>` reports exactly which gate would refuse and what to change, and the raw `TypeError` the 2026-07-25 dogfood produced is replaced by a named gate + remedy
reqs: [ REQ-AUTH-11a, REQ-AUTH-11b, REQ-AUTH-11c, REQ-AUTH-12a, REQ-AUTH-12b, REQ-AUTH-12c, REQ-AUTH-12d ]
campaign: CAMPAIGN-10.2

### EPIC-A4 — the loop closes and nothing is hidden

goal-trace: "a product that drops two thirds of its own output and has no help page cannot be learned → the receipt addresses what was written, every leg renders its whole record, and the surface documents itself → the monitor step, and the Usability risk retired"
vertical: adapter-io (emit receipt) → cli (help · render) — demoable: `atlas emit` returns a handle `atlas node` resolves directly; `atlas init` finally prints `blastRadius` and `t0Candidates`; `atlas help` exists at all
reqs: [ REQ-AUTH-14a, REQ-AUTH-14b, REQ-AUTH-14c, REQ-CLI-5a, REQ-CLI-5b, REQ-CLI-5c, REQ-CLI-5d, REQ-CLI-6a, REQ-CLI-6b ]
campaign: CAMPAIGN-10.2

### EPIC-A5 — the agent gets the same doors as the human

goal-trace: "a knowledge substrate whose primary consumer is an agent must be authorable by an agent → the MCP server advertises the governance surface union a disjoint, structurally write-free read surface, at byte-identical parity → the owner's both-transports requirement, and the pre-existing doctor/node/diff asymmetry closed with it"
vertical: tools (READ_SURFACE constant · membership) → mcp-server (advertisement · routing) → e2e-blackbox (parity goldens · the authoring story) → harness (the surface pin) — demoable: an agent authors and emits a fact over MCP alone. [AMENDED 2026-08-25 — see ADR-0004 §Consequences] acceptance is that product-door proof, not deleting `author.ts` (kept for its adversarial-fixture role; happy-path re-point is hygiene follow-up)
reqs: [ REQ-MCP-3a, REQ-MCP-3b, REQ-MCP-3c, REQ-MCP-3d, REQ-MCP-3e, REQ-MCP-3f, REQ-MCP-3g, REQ-MCP-4a, REQ-MCP-4b, REQ-MCP-4c ]
campaign: CAMPAIGN-10.3

---

## Campaigns (release slices, dependency-ordered)

### CAMPAIGN-10.1 — authoring becomes possible

epics: [ EPIC-A1, EPIC-A2-a, EPIC-A2-b ]
prerequisites: [ ADR-0004 ratified ]
horizon: **Now**
increment: a human can author and emit a grounded fact using only product doors, on the CLI.
**STATUS 2026-09-03: SHIPPED.** `atlas anchors`/`slots`/`draft`/`emit` all live and green.

### CAMPAIGN-10.2 — authoring becomes legible

epics: [ EPIC-A3, EPIC-A4 ]
prerequisites: [ CAMPAIGN-10.1 ]
horizon: **Next**
increment: the author knows _before_ writing what will happen, addresses what they wrote, and can discover the surface without reading source.
**STATUS 2026-09-03: SHIPPED.** `atlas check` runs the real emit-door gate chain; `atlas help` exists; every leg renders its whole record.

### CAMPAIGN-10.3 — authoring becomes transport-symmetric

epics: [ EPIC-A5 ]
prerequisites: [ CAMPAIGN-10.1, CAMPAIGN-10.2, ADR-0005 ratified ]
horizon: **Later**
increment: an agent seat has the identical surface, proven by byte-parity; the test-helper crutch is deleted.
**STATUS 2026-09-03: SHIPPED in code** — an agent authors+emits over MCP alone (`s-mcp-authoring`), 18-tool advertisement pinned. **ADR-0005 is still PROPOSED** (its "exactly five" language is superseded by ADR-0006 Decision 2); the roadmap prerequisite is met on paper only. Owner ratification decision pending.

**DAG check.** `10.1 → 10.2 → 10.3`, plus `EPIC-A1 → EPIC-A2-a → EPIC-A2-b` and `EPIC-A2-a → EPIC-A3`
(check composes the gates a draft must satisfy). No cycles. A prerequisite never ships after its
dependent. `EPIC-A4` has no intra-campaign dependency and may run parallel to `EPIC-A3`.

---

## Reconciler (state C gate — run, not assumed)

| check                                                                        | result                                                                                                                  |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **partition** — the epic set partitions the frozen REQ set (total, disjoint) | ✅ 21 + 16 + 10 + 7 + 9 + 10 = **73** = \|REQ\|; **0 orphan, 0 double** (verified by set-difference in both directions) |
| **lossless split** — `union(children).reqs == parent.reqs`                   | ✅ EPIC-A2-a (16) ∪ EPIC-A2-b (10) = 26 = EPIC-A2                                                                       |
| **SPIDR cited on every split**                                               | ✅ one split, cites **Path**                                                                                            |
| every epic has a `goal-trace`                                                | ✅ 6/6 (A2 is the parent of the one split; its children carry their own)                                                |
| every epic touches ≥1 module                                                 | ✅ min 2 (EPIC-A4), max 4 (EPIC-A5)                                                                                     |
| campaign graph is a DAG                                                      | ✅ acyclic, verified above                                                                                              |
| every REQ traces `→ EPIC`                                                    | ✅ 73/73                                                                                                                |
| every REQ has ≥1 SCN                                                         | ✅ 73/73 (`goldens-authoring.md`)                                                                                       |
| every behavioural INV has ≥1 REQ and exactly one method-tag                  | ✅ 18/18                                                                                                                |

**Severity: no CRITICAL.** One **INFO**: EPIC-A1 carries 21 REQs without a split; the justification is
recorded on the epic (11 are guards; a seam-only child would be non-demoable). A reviewer may still
require a split — that is a COLD-REVIEW judgment, not a GATE predicate.

**DoD: NOT MET** — GATE green as recorded above, **COLD-REVIEW pending**. The roadmap is a freeze
candidate, not a freeze.
