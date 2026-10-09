# The classes

## The idea

Orchestra's work is split into **functional classes** — domains of the engineering craft, each with
an **owner** member, a **scope** (the phase/territory it may write), and a **use** (what it does). The
classes keep upstream product/architecture/specification/planning separate from orchestration, building,
reviewing, discovering and maintenance. The upstream disciplines belong to one member, not separate product,
architect and planner personas (see [TEAM.md](../TEAM.md)).

In the foundation model, every class relates to **both** kinds of the one Atlas, and the two are kept
strictly apart:

- **Knowledge (shared)** — what the class reads from, produces into, or checks against the _shared_
  grounded truth about the code. Read is **universal**; write is the **owner's** scope.
- **Memory (per member)** — the craft and experience each member of the class keeps _privately_ about
  doing the work. Read is the member's **own** only; never merged into Knowledge.

These are never one thing. Below they stay in **separate columns** per class, on purpose: collapse them
and you get both failure modes at once — the shared graph clogged with private hunches, and private craft
mistaken for ratified truth.

## The classes

The upstream rows follow the target ownership in [TEAM.md](../TEAM.md). Native `walt` registration, profile
`upstream`, config/environment label resolution, packaged assets and the result card/projection are implemented
and reviewed. Core/V1 restricted Arsenal authoring bindings and `UpstreamProposal.inspect` are now implemented
in unlanded candidate `ff3b57d4a6323a150949072d06ad379f666a65af`, not deployed or domain-qualified. Actual
V2 application binding, Maestro planning transfer and W6 immutable publication/revision, actual upstream
provenance and native approved-scope binding remain mandatory pending integration; real qualification
remains pending. See the
[Maestro/runtime handoff](../../../../specs/upstream-specialist/maestro-planning-handoff.md) for source pins.
This map grants no capability and is not semantic enforcement. The Memory column describes the foundation
model, not installed memory for each row: the runtime Atlas Memory boundary supports only `backend`.

| Class            | Owner(s)                            | Scope (writes)                                        | Knowledge flavour — **shared**                                                                                                                                    | Memory flavour — **per member**                                                                                               |
| ---------------- | ----------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Produto, arquitetura, especificação e planejamento** | `walt` | Assigned product/design/spec proposals, acceptance, Tasks/WPs, briefs, dependency plans and roadmaps | Grounds unified upstream proposals in current evidence; retains field provenance and owner decision requests; does not implement, self-approve or dispatch work. | The member's upstream experience — task/pr notes and standing rules. |
| **Orquestração** | Maestro (the Conductor) | ORCHESTRATE — assign → review/adopt → dispatch → integrate | Organizes and decides within owner authority; assigns upstream authoring, binds adopted proposals to actual placement, readiness, permissions and execution evidence; requests revisions rather than filling plan gaps. | The orchestrator's own memory plus its logbook — the append-only per-PR decision journal. |
| **Build**        | `backend`, `patty`                  | EXECUTE — backend / frontend artifacts                | Receives the territory's **pack** to transcribe against real anchors; at wave-close its `ResultCard.absorb` feeds candidate facts back.                           | each builder's private craft — "where the docs lie", what was tried/failed on a WP (task memory), decisions on a PR.          |
| **Revisão** | `lucy`, `billy`, `frankie` | VERIFY — general cold review, security, process | Checks deliverables against real invariants and architectural consequences as part of the whole; no dedicated architecture-only seat or transfer of that mandate to upstream. Ratification follows existing authority rules. | Each reviewer's own review craft — recurring smells, traps and prior verdicts. |
| **Discovery**    | `jimmy`                             | SUPPORT — exploration / research                      | **Proposes** grounded Knowledge candidates: mines the current blast radius (just-in-time, never the whole repo), adversarially contested before staging.          | jimmy's own findings kept private — "this repo's docs lie" is its **Memory**, not a shared fact (same act, two destinations). |
| **Manutenção**   | `rosie`                             | SUPPORT — documentation-gardening                     | Re-checks facts/prose against current code (staleness by AST fingerprint), flags drift — the drift-check applied to Knowledge and to the docs themselves.         | rosie's gardening craft — which docs rot fastest here, orphan patterns it has learned to spot.                                |

## Why it's this way

**Universal read, owned write** mirrors the Atlas's own owner+scope model (a `CODEOWNERS` binds each
`packages/atlas-*/` to its owner). Anyone may _read_ shared Knowledge — the upstream specialist, Maestro,
every seat — because ground truth is a public good of the repo. Only the owning class may _write_ its
scope, so authorship is accountable and a wave can be sliced into disjoint write-scopes.

**Knowledge and Memory stay in separate columns for a reason.** Discovery is the clearest case: when
`jimmy` mines a territory, what it _proposes for the shared graph_ is a Knowledge candidate (grounded,
contested, ratified by someone else); what it _keeps for itself_ — a hunch, a "the README lies here" — is
its own Memory. Same act, two destinations, never confused. Collapse the columns and the shared graph
fills with un-grounded per-agent hunches while private craft gets mistaken for ratified fact.

**The GAN rule rides on these classes.** A Build WP is not sealable until a Revisão evaluator returns a
passing ResultCard under the foundation contract. The Revisão class owns VERIFY and Maestro coordinates
the "cold-review every returning agent" requirement. A class list is not proof that a runtime gate enforces
semantic behavior or that any particular delivery has passed review. Existing governed authority bindings
remain host-owned; upstream proposals and structural checks do not approve or authorize execution.

**Work units keep their existing lifecycle.** Tasks can remain small, inline assignments; upstream authors
their planning content without adding a compulsory WP, compiler, arm or progressive steps. A WP step is not
a Task and does not require a new per-step human approval ceremony. Maestro requests revisions from upstream
when review or execution finds a planning gap; it does not silently author a substitute plan.

## Where it fits

- Why Knowledge is shared, grounded, and edited-not-appended: **[explanation/knowledge.md](./knowledge.md)**.
- The Knowledge shapes, invariants, and tools: **[reference/atlas-knowledge.md](../reference/atlas-knowledge.md)**.
- The per-member Memory kind — its three types, the injected/consultable split, the orchestrator's
  logbook — has its **own reference**, **[reference/atlas-memory.md](../reference/atlas-memory.md)** (not
  an open TODO; it is specified there).
- The full phase map and the persona roster: **[TEAM.md](../TEAM.md)**.
