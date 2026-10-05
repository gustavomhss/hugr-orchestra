# The classes

## The idea

Orchestra's work is split into seven **functional classes** — domains of the engineering craft, each with
an **owner** member, a **scope** (the phase/territory it may write), and a **use** (what it does). The
classes are the separation of concerns v1 collapsed into one blurred "lead": defining, architecting,
orchestrating, building, reviewing, discovering, and maintaining are distinct disciplines with distinct
owners (see [TEAM.md](../TEAM.md)).

Every class relates to **both** kinds of the one Atlas, and the two are kept strictly apart:

- **Knowledge (shared)** — what the class reads from, produces into, or checks against the _shared_
  grounded truth about the code. Read is **universal**; write is the **owner's** scope.
- **Memory (per member)** — the craft and experience each member of the class keeps _privately_ about
  doing the work. Read is the member's **own** only; never merged into Knowledge.

These are never one thing. Below they stay in **separate columns** per class, on purpose: collapse them
and you get both failure modes at once — the shared graph clogged with private hunches, and private craft
mistaken for ratified truth.

## The seven classes

| Class            | Owner(s)                            | Scope (writes)                                        | Knowledge flavour — **shared**                                                                                                                                    | Memory flavour — **per member**                                                                                               |
| ---------------- | ----------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Definição**    | `walt`                              | DEFINE — working-backwards, product design, the spec  | Reads the Atlas to ground the spec in what already exists (never imagines the system); its ratified goal/spec is what Knowledge is later verified against.        | walt's own craft of defining _in this repo_ — task/pr notes and standing "always/never" rules for writing spec here.          |
| **Arquitetura**  | `archie`                            | DESIGN — layers, contracts, seams, build order        | Designs over the **real** `depends-on` graph + blast radius (the Atlas structural plane), not a mental model of it.                                               | archie's lessons on architecting this repo — where past designs strained, patterns that generalized badly.                    |
| **Orquestração** | `orchestrator` (the Conductor)      | ORCHESTRATE — decompose → dispatch → integrate        | Reads the real dependency graph + blast radius to slice **disjoint** write-scopes; the structural map _is_ the Atlas (the hard dependency that makes it layer 0). | the orchestrator's own memory **plus its logbook** — the append-only per-PR decision journal (its unique fourth Memory type). |
| **Build**        | `charlie`, `patty`                  | EXECUTE — backend / frontend artifacts                | Receives the territory's **pack** to transcribe against real anchors; at wave-close its `ResultCard.absorb` feeds candidate facts back.                           | each builder's private craft — "where the docs lie", what was tried/failed on a WP (task memory), decisions on a PR.          |
| **Revisão**      | `lucy`, `bobby`, `billy`, `frankie` | VERIFY — cold review, security, architecture, process | Checks diffs against the territory's **real invariants**; **ratifies** candidates at wave-close (reviewers can reject; `billy` is required for T0).               | each reviewer's own review craft — recurring smells, this repo's traps, prior verdicts they learned from.                     |
| **Discovery**    | `jimmy`                             | SUPPORT — exploration / research                      | **Proposes** grounded Knowledge candidates: mines the current blast radius (just-in-time, never the whole repo), adversarially contested before staging.          | jimmy's own findings kept private — "this repo's docs lie" is its **Memory**, not a shared fact (same act, two destinations). |
| **Manutenção**   | `rosie`                             | SUPPORT — documentation-gardening                     | Re-checks facts/prose against current code (staleness by AST fingerprint), flags drift — the drift-check applied to Knowledge and to the docs themselves.         | rosie's gardening craft — which docs rot fastest here, orphan patterns it has learned to spot.                                |

## Why it's this way

**Universal read, owned write** mirrors the Atlas's own owner+scope model (a `CODEOWNERS` binds each
`packages/atlas-*/` to its owner). Anyone may _read_ shared Knowledge — DEFINE, DESIGN, the Conductor,
every seat — because ground truth is a public good of the repo. Only the owning class may _write_ its
scope, so authorship is accountable and a wave can be sliced into disjoint write-scopes.

**Knowledge and Memory stay in separate columns for a reason.** Discovery is the clearest case: when
`jimmy` mines a territory, what it _proposes for the shared graph_ is a Knowledge candidate (grounded,
contested, ratified by someone else); what it _keeps for itself_ — a hunch, a "the README lies here" — is
its own Memory. Same act, two destinations, never confused. Collapse the columns and the shared graph
fills with un-grounded per-agent hunches while private craft gets mistaken for ratified fact.

**The GAN rule rides on these classes.** A Build WP is not sealable until a Revisão evaluator returns a
passing ResultCard — the "cold-review every returning agent" law is structural, drawn straight from the
Revisão class owning VERIFY.

## Where it fits

- Why Knowledge is shared, grounded, and edited-not-appended: **[explanation/knowledge.md](./knowledge.md)**.
- The Knowledge shapes, invariants, and tools: **[reference/atlas-knowledge.md](../reference/atlas-knowledge.md)**.
- The per-member Memory kind — its three types, the injected/consultable split, the orchestrator's
  logbook — has its **own reference**, **[reference/atlas-memory.md](../reference/atlas-memory.md)** (not
  an open TODO; it is specified there).
- The full phase map and the persona roster: **[TEAM.md](../TEAM.md)**.
