# Atlas — Docs

The map. Docs follow **[CONVENTIONS.md](./CONVENTIONS.md)** — Diátaxis × docs-as-code (co-located) ×
grounded (the docs dogfood the Atlas: reference is pinned to `source@sha` and drift-checked).

## Start here

- **[SESSION-STATE.md](./SESSION-STATE.md)** — _if you are a session picking this repository up cold, read
  this first._ Where the work stands, how to re-derive every figure on it, what is decided and what is
  merely believed, and the open decisions that are the owner's to take. Dated: check its baseline commit
  against `master` before trusting its measurements.
- **[../README.md](../README.md)** — what the Atlas is + the build order.
- **[method/README.md](./method/README.md)** — the decomposition method that produced this spec.
- **[CONVENTIONS.md](./CONVENTIONS.md)** — how we document (this contract).

## The Atlas (layer 0) — knowledge + memory, one substrate

### Explanation — _why_ (concepts, rationale)

- [explanation/grounding.md](./explanation/grounding.md) — why grounded, structural-not-line, no-RAG
- [explanation/knowledge.md](./explanation/knowledge.md) — the shared kind; Knowledge ≠ Memory, one Atlas
- [explanation/classes.md](./explanation/classes.md) — the 7 classes (owner + scope)
- [explanation/memory.md](./explanation/memory.md) — the per-member kind; injected vs consultable
- [explanation/versioning.md](./explanation/versioning.md) — git-native, nothing dies, re-spawnable
- [explanation/genesis-reasoning.md](./explanation/genesis-reasoning.md) — genesis: why structural-not-embeddings, the S2 propose→verify loop, cost & limits

### Reference — _what exactly_ (per crate; migrates into `packages/atlas-*/` when it lands)

- [reference/atlas-kernel.md](./reference/atlas-kernel.md) — CAS · BLAKE3 · event log
- [reference/atlas-grounding.md](./reference/atlas-grounding.md) — StructRef/subtreeHash · truth-gate · admission (truth ∧ ¬harmful; obviousness scored)
- [reference/atlas-index.md](./reference/atlas-index.md) — hashed structural tree · drift oracle · no-RAG
- [reference/atlas-knowledge.md](./reference/atlas-knowledge.md) — GroundedFact · tiers · upsert/supersede
- [reference/atlas-memory.md](./reference/atlas-memory.md) — task/pr/project/logbook + Orientation
- [reference/atlas-retrieval.md](./reference/atlas-retrieval.md) — packs · poke · tool projection · caps
- [reference/atlas-persist.md](./reference/atlas-persist.md) — git-native · commits+PRs · archive · re-spawn
- [reference/atlas-tools.md](./reference/atlas-tools.md) — init/query/emit/reconcile/link (CLI+MCP)
- [reference/atlas-adapters.md](./reference/atlas-adapters.md) — the productization ring (adapters + entrypoints)
- [reference/atlas-architecture.md](./reference/atlas-architecture.md) — hierarquia de camadas · modelo de exposição de tools · modelo de autoridade (ARCH-1..12)
- [reference/atlas-authoring.md](./reference/atlas-authoring.md) — the authoring surface: anchors · slots · draft · check (planners, zero write authority)

### How-to — _tasks_

- [how-to/write-a-project-rule.md](./how-to/write-a-project-rule.md)
- [how-to/query-the-atlas.md](./how-to/query-the-atlas.md)

## Decisions (ADRs — immutable, superseded never edited)

- [adr/ADR-0001](./adr/ADR-0001-r3-data-model-reconciliation.md) — R3 data-model reconciliation
- [adr/ADR-0002](./adr/ADR-0002-freshness-watermark.md) — the CQRS freshness watermark
- [adr/ADR-0003](./adr/ADR-0003-governed-write-doors.md) — INV-TOOLS-1: single write door → governed write doors
- [adr/ADR-0004](./adr/ADR-0004-authoring-planner-doors.md) — the authoring surface is planners, not write doors
- [adr/ADR-0005](./adr/ADR-0005-mcp-read-surface.md) — the advertised MCP surface is governance ∪ read
- [adr/ADR-0006](./adr/ADR-0006-architecture-hierarchy-and-tool-exposure.md) — the layer hierarchy is machine-checked; the tool surface is derived and budgeted
- [adr/ADR-0007](./adr/ADR-0007-governance-class-is-a-property-of-the-node.md) — a write's governance class belongs to the node it targets, not to the write

## Product design (prose) & legacy specs

- [design/atlas.md](./design/atlas.md) — the product design (working-backwards prose)
- [design/authoring.md](./design/authoring.md) — the authoring surface: Define · Frame · Structure · Ratify
- [design/authoring-surface-study.md](./design/authoring-surface-study.md) — the functional-surface catalog behind it (L0–L3 + the six lenses)
- [spec/atlas.md](./spec/atlas.md) · [spec/memory.md](./spec/memory.md) — the **transitional normative
  source** the `reference/` files currently ground to (completeness verified; content-complete in
  `reference/`). Retires when the atlas **code** lands and reference re-grounds to `source@sha`.

## Chewed visuals (HTML artifacts)

`atlas.html` (the consolidated one-pager) · piece explainers: `atlas-concept` · `atlas-classes` ·
`atlas-folders` · `atlas-sizes` · `project-memory` · `project-memory-example`.
