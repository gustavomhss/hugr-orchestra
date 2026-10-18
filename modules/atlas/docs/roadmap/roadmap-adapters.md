# Roadmap — Campaign-9 (the productization ring) · state C

> **state:** C · **protocol:** [`C-roadmap`](../method/prompts/C.md) + `completeness`/`reconciler` ·
> **axiom:** S1+S3 frozen (`requirements-adapters.md` 55 REQs · `goldens-adapters.md` 56 SCNs) ·
> **owner:** orchestrator; verticality + DAG cold-reviewed by bobby (BLUEPRINT).
>
> The **warp** axis: vertical capabilities (across adapter/entrypoint modules), grouped into dependency-ordered
> campaigns aligned to the four product phases. The **weft** (per-module slice) is S4's job, under these epics.
> IDs are ring-scoped (this file is the ring's own portfolio); the parent atlas holds CAMPAIGN-1..8 (the core).
> Backbone (functional-surface L1): `init → query → emit → reconcile → mine → serve(MCP)/publish(forge)`.

---

### EPIC-1 — init/query over real adapters

goal-trace: "an agent can't trust a hand-fed map → a real repo is indexed and addressable behind one wired door → the read floor (CLI + init read-path)"
vertical: adapter-io (fs·scip·index-wire) → @atlas/index → wire (five-leg handler) → cli (surface·render·init) — demoable: `atlas init <ts-repo>` prints the true skeleton+blast-radius, `atlas query` answers
reqs: [ REQ-WIRE-1a, REQ-WIRE-1b, REQ-CLI-1a, REQ-CLI-1b, REQ-CLI-1c, REQ-CLI-2a, REQ-CLI-2b, REQ-CLI-2c, REQ-CLI-3a, REQ-CLI-3b, REQ-CLI-3c, REQ-CLI-3d, REQ-ADAPTER-1a, REQ-ADAPTER-1b, REQ-ADAPTER-1c, REQ-ADAPTER-1d, REQ-ADAPTER-2a, REQ-ADAPTER-2b, REQ-ADAPTER-2c, REQ-ADAPTER-5a, REQ-ADAPTER-5b ]
campaign: CAMPAIGN-9.1

### EPIC-1-a — one wired handler behind a total CLI

goal-trace: "CLI and MCP must never diverge → a single wired handler drives a total, fail-safe command surface with deterministic render → the shared entrypoint floor"
vertical: wire (five-leg handler) → cli (command→leg map·authority·render·exit) — demoable (self-contained against Verdict + argv fixtures, no adapter): `atlas <cmd>` renders a Verdict deterministically and sets the exit code from it, a malformed invocation yields a structured error (never a crash), and both entrypoints prove they share one handler instance (`cliHandler === mcpHandler`). (Real per-leg output arrives with the adapters in EPIC-1-b / CAMPAIGN-9.2.)
reqs: [ REQ-WIRE-1a, REQ-WIRE-1b, REQ-CLI-1a, REQ-CLI-1b, REQ-CLI-1c, REQ-CLI-2a, REQ-CLI-2b, REQ-CLI-2c, REQ-CLI-3a, REQ-CLI-3b, REQ-CLI-3c, REQ-CLI-3d ]
campaign: CAMPAIGN-9.1
split: Interface (the shared entrypoint contract) from EPIC-1

### EPIC-1-b — atlas init builds a real single-language index

goal-trace: "the map must come from real code, not a fixture → the fs walker + SCIP reader feed @atlas/index build/resolve/coverage → the init read-path"
vertical: adapter-io (fs-walk·scip-read·index-wire) → @atlas/index → the init leg — demoable: `atlas init <ts-repo>` prints the true skeleton; a dangling reference resolves to `to: null`, never a fabricated edge
reqs: [ REQ-ADAPTER-1a, REQ-ADAPTER-1b, REQ-ADAPTER-1c, REQ-ADAPTER-1d, REQ-ADAPTER-2a, REQ-ADAPTER-2b, REQ-ADAPTER-2c, REQ-ADAPTER-5a, REQ-ADAPTER-5b ]
campaign: CAMPAIGN-9.1
split: Path (the single-language init route) from EPIC-1

### EPIC-2 — multi-language + sub-file index refinement

goal-trace: "real repos span languages → per-language SCIP dispatch + additive AST units with honest holes → the multi-language index refinement"
vertical: adapter-io (scip-dispatch·ast-fold) → @atlas/index — demoable: `atlas init` on a `ts`+`py`+`rb` repo resolves cross-file edges, and the un-indexed `rb` file is an honest structural hole (no fabricated/dropped edge)
reqs: [ REQ-ADAPTER-3a, REQ-ADAPTER-3b, REQ-ADAPTER-3c, REQ-ADAPTER-4a, REQ-ADAPTER-4b, REQ-ADAPTER-4c ]
campaign: CAMPAIGN-9.1

### EPIC-3 — durable content-addressed store

goal-trace: "a fact emitted today must be there tomorrow → a tamper-safe disk CAS implements StoreApi with cross-process durability + projection rehydrate → the persistence floor"
vertical: adapter-io (disk-store·rehydrate) → kernel StoreApi → the emit/query legs — demoable: `atlas emit` in run A, `atlas query` in a fresh run B sees the fact byte-identical; a tampered on-disk value reads as absent
reqs: [ REQ-ADAPTER-6a, REQ-ADAPTER-6b, REQ-ADAPTER-6c, REQ-ADAPTER-12a, REQ-ADAPTER-12b ]
campaign: CAMPAIGN-9.2

### EPIC-4 — governed dedup/supersede write lands durably

goal-trace: "the same fact twice must land once → the parked writeDecision binds nodeKey→probe→routeWrite→upsert→flush idempotently → the governed durable write"
vertical: adapter-io (store) → knowledge writeDecision binding → the emit leg — demoable: emitting the same fact twice yields one node; a superseding emit records the supersedes pointer
reqs: [ REQ-ADAPTER-7a, REQ-ADAPTER-7b, REQ-ADAPTER-7c ]
campaign: CAMPAIGN-9.2

### EPIC-5 — atlas reconcile classifies drift over a real merge-base

goal-trace: "a cited fact goes stale when code moves → DriftSource computes drift across the git merge-base feeding the mechanical-vs-semantic classification → the reconcile capability"
vertical: adapter-io (git-drift) → tools reconcile → the reconcile leg — demoable: `atlas reconcile` on a git sandbox where a cited file changed classifies the drift and sets `exitCode` per TOOLS-8
reqs: [ REQ-ADAPTER-9a, REQ-ADAPTER-9b ]
campaign: CAMPAIGN-9.2

### EPIC-6 — atlas mine seeds candidates from a real repo

goal-trace: "a fresh repo has no facts → the frozen genesis run-controller mines candidates over real git history + one bounded LLM call per site → the mine capability"
vertical: adapter-io (git-history·llm-proposer) → genesis run-controller → the mine driver (CLI) — demoable: `atlas mine <repo>` with a recorded proposer yields ranked candidate facts, exactly one proposer call per site
reqs: [ REQ-ADAPTER-8a, REQ-ADAPTER-8b, REQ-ADAPTER-8c, REQ-ADAPTER-11a, REQ-ADAPTER-11b, REQ-ADAPTER-11c, REQ-CLI-4a, REQ-CLI-4b, REQ-CLI-4c ]
campaign: CAMPAIGN-9.3

### EPIC-6-a — deterministic history ranking (the $0 seed floor)

goal-trace: "the seed must be reproducible and mint nothing → real git log/blame/coupling ranks structurally, deterministic for a fixed rev → the $0 deterministic route"
vertical: adapter-io (git-history) → genesis rank — demoable: the ranking engine (not yet the `atlas mine` command — its driver lands in EPIC-6-b) is byte-identical across two runs at a fixed rev and mints 0 facts
reqs: [ REQ-ADAPTER-8a, REQ-ADAPTER-8b, REQ-ADAPTER-8c ]
campaign: CAMPAIGN-9.3
split: Path (the $0 deterministic seed route) from EPIC-6

### EPIC-6-b — bounded LLM proposal + the mine driver

goal-trace: "candidates need a model, gated → the single bounded SiteProposer call drives the frozen run-controller, candidate-only → the LLM extract + mine-driver route"
vertical: adapter-io (llm-proposer) → genesis extract/run-controller → cli (mine leg) — demoable: `atlas mine` makes exactly one bounded call per site and every write is candidate-only, never ratified
reqs: [ REQ-ADAPTER-11a, REQ-ADAPTER-11b, REQ-ADAPTER-11c, REQ-CLI-4a, REQ-CLI-4b, REQ-CLI-4c ]
campaign: CAMPAIGN-9.3
split: Path (the LLM-extract + driver route) from EPIC-6

### EPIC-7 — the MCP server exposes the five governed tools

goal-trace: "an agent drives Atlas over MCP → the stdio server publishes GOVERNANCE_SURFACE ∪ READ_SURFACE through the shared handler, fail-closed → the MCP entrypoint"
vertical: wire (shared handler) → mcp-server (five tools·schemas·fail-closed transport) — demoable: an MCP client's `atlas-query` returns a verdict byte-identical to the CLI's; a tool error returns a structured rejected Verdict, no crash
reqs: [ REQ-MCP-1a, REQ-MCP-1b, REQ-MCP-1c, REQ-MCP-2a, REQ-MCP-2b, REQ-MCP-2c ]
campaign: CAMPAIGN-9.4

### EPIC-8 — the forge carries the atlas onto a real host

goal-trace: "knowledge must travel with the code → the forge writes trailer+note+PR and stays rewrite-honest → the git write-back capability"
vertical: adapter-io/persist (forge host-adapter) → the publish path — demoable: emit → a git-sandbox host carries the provenance trailer + `refs/notes/orchestra` note + PR projection; a history rewrite keeps the trailer and orphans the note-carried data per PERSIST-\*
reqs: [ REQ-ADAPTER-10a, REQ-ADAPTER-10b, REQ-ADAPTER-10c ]
campaign: CAMPAIGN-9.4

---

### CAMPAIGN-9.1 — read a real repo (Phase 0: init/query floor)

epics: [ EPIC-1-a, EPIC-1-b, EPIC-2 ]
prerequisites: [ ]
horizon: Now

### CAMPAIGN-9.2 — durable knowledge (Phase 1: emit/reconcile persist)

epics: [ EPIC-3, EPIC-4, EPIC-5 ]
prerequisites: [ CAMPAIGN-9.1 ]
horizon: Next

### CAMPAIGN-9.3 — cold-start mining (Phase 2: LLM seed)

epics: [ EPIC-6-a, EPIC-6-b ]
prerequisites: [ CAMPAIGN-9.1, CAMPAIGN-9.2 ]
horizon: Later

### CAMPAIGN-9.4 — serve + write-back (Phase 3: MCP + forge)

epics: [ EPIC-7, EPIC-8 ]
prerequisites: [ CAMPAIGN-9.1, CAMPAIGN-9.2 ]
horizon: Later

---

## Coverage

**REQ → epic partition** (over the 10 LEAF epics; EPIC-1 and EPIC-6 are split-parent umbrellas, not counted):
leaves = EPIC-1-a · EPIC-1-b · EPIC-2 · EPIC-3 · EPIC-4 · EPIC-5 · EPIC-6-a · EPIC-6-b · EPIC-7 · EPIC-8.

| leaf epic | reqs                                                    | n   |
| --------- | ------------------------------------------------------- | --- |
| EPIC-1-a  | WIRE-1a/1b, CLI-1a/1b/1c, CLI-2a/2b/2c, CLI-3a/3b/3c/3d | 12  |
| EPIC-1-b  | ADAPTER-1a/1b/1c/1d, ADAPTER-2a/2b/2c, ADAPTER-5a/5b    | 9   |
| EPIC-2    | ADAPTER-3a/3b/3c, ADAPTER-4a/4b/4c                      | 6   |
| EPIC-3    | ADAPTER-6a/6b/6c, ADAPTER-12a/12b                       | 5   |
| EPIC-4    | ADAPTER-7a/7b/7c                                        | 3   |
| EPIC-5    | ADAPTER-9a/9b                                           | 2   |
| EPIC-6-a  | ADAPTER-8a/8b/8c                                        | 3   |
| EPIC-6-b  | ADAPTER-11a/11b/11c, CLI-4a/4b/4c                       | 6   |
| EPIC-7    | MCP-1a/1b/1c, MCP-2a/2b/2c                              | 6   |
| EPIC-8    | ADAPTER-10a/10b/10c                                     | 3   |

- **total: 55 / 55** REQs. **orphans: 0 · doubles: 0** (partition total + disjoint).
- **splits lossless:** EPIC-1 = EPIC-1-a ∪ EPIC-1-b (12+9=21, Interface+Path); EPIC-6 = EPIC-6-a ∪ EPIC-6-b (3+6=9, Path+Path). `union(children).reqs == parent.reqs` for both.
- **campaign DAG edges:** 9.1 → 9.2 → {9.3, 9.4}; 9.1 → {9.3, 9.4}. **Acyclic** (a strict forward order 9.1 ≺ 9.2 ≺ 9.3/9.4).
- **horizon histogram:** Now 1 (9.1) · Next 1 (9.2) · Later 2 (9.3, 9.4).
- every leaf epic carries a `goal-trace`, touches ≥1 module, and is independently demoable (carpaccio: a capability, not a layer); every split cites a SPIDR pattern.

## [NEEDS RECONCILIATION]

- None. Every REQ joined a vertical, independently-demoable epic; no REQ was forced into a horizontal/module-only
  slab. (The S0 phase-deferred DEFINEs D4/D5/D6 surface at CAMPAIGN-9.2/9.3/9.4 respectively, as already logged.)

## Completion report

- roadmap: `docs/roadmap/roadmap-adapters.md`
- epics: 10 leaf (+2 split-parent umbrellas EPIC-1, EPIC-6) · campaigns: 4
- REQ→epic partition: 55/55, orphans 0, doubles 0
- splits applied: 2 — EPIC-1 (Interface), EPIC-6 (Path×2); both lossless
- DAG acyclic: yes (9.1 ≺ 9.2 ≺ 9.3/9.4)
- horizon: Now 1 · Next 1 · Later 2
- open [NEEDS RECONCILIATION]: 0
- → next_state **S4** (slice work-packages, the weft).
