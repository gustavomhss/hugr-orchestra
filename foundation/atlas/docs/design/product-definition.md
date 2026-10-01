# The Atlas — product definition (D0: job + outcomes)

> The **Define** phase of the [product-design rubric](../method/product-design.md), applied to the Atlas. Output:
> the functional job + the agent-retargeted job map + the measurable **desired-outcome statements** (= the **FRs**
> the design must satisfy). These are the spine everything downstream hangs off (`FR → DP → invariant → REQ →
golden → WP`). Success is **instrumented, not surveyed** — the "customer" is an AI coding agent, which emits
> ground truth. Grounds to the Atlas mission in [`design/atlas.md`](atlas.md) + [`spec/atlas.md`](../spec/atlas.md).

## The customer & the functional job

- **Customer:** an AI coding agent performing a task in a codebase (the owner + future contributors, secondarily).
- **Functional job (solution-agnostic):** _establish and maintain the knowledge needed to perform a coding task
  correctly_ — find what is true about the code, act on it, and keep that knowledge current as the code changes.

## The job map (the agent's loop) — opportunity is never in Execute

| step        | the agent's need                          | Atlas surface                                  |
| ----------- | ----------------------------------------- | ---------------------------------------------- |
| Define      | what do I need to know for this task?     | scope inference                                |
| **Locate**  | find the grounded fact / knowledge        | **retrieval — high pain**                      |
| Prepare     | load it within the context budget         | pack / injection                               |
| **Confirm** | is it current, not superseded / stale?    | **grounding / drift — high pain**              |
| Execute     | act (write the code)                      | _the model's competence — not the Atlas's job_ |
| Monitor     | detect drift / contradiction while acting | drift oracle                                   |
| **Modify**  | edit / supersede knowledge (not append)   | **edit-over-append — high pain**               |
| Conclude    | persist what changed, with provenance     | wave-close write                               |

Pain concentrates in **Locate · Confirm · Modify** — retrieval, staleness-checking, non-append reconciliation.
Execute (generating code) is the model's competence, not the substrate's. _(The frame predicts the Atlas thesis
— edit/supersede over append, grounded-knowledge vs per-seat-memory — a sign it is the right lens.)_

## Desired-outcome statements — the FRs (measurable, instrumented)

Each is `[minimize|maximize] + metric + object + context`, solution-agnostic, and directly measurable from an
agent-trace benchmark (no survey — every metric is trace-observable; FR-2 additionally needs a labeled-relevance
oracle in the benchmark, measured as precision@k). Target **numbers** are set per FR when it is ratified into an
ATAM scenario (D3 / ratification gate-2); D0 fixes the measurable _shape_.

**Locate**

- **FR-1** — minimize the time to retrieve the grounded fact needed for the current task.
- **FR-2** — maximize the fraction of retrieved context that is task-relevant (signal-to-noise).

**Prepare**

- **FR-3** — minimize the tokens consumed to establish task-relevant context.

**Confirm**

- **FR-4** — minimize the likelihood that an agent acts on superseded or stale knowledge.
- **FR-5** — maximize the fraction of served facts that are currently true of the code (grounding fidelity).

**Modify**

- **FR-6** — minimize the time to reconcile a knowledge edit.
- **FR-7** — minimize the growth of the store per unit of genuinely-new knowledge (the sublinearity test).

**Conclude / cross-cutting**

- **FR-8** — maximize the fraction of ephemeral-agent state re-derivable from the persisted versioned record (re-spawnable).
- **FR-9** — minimize the human ratification/correction actions required per unit of shipped knowledge.
- **FR-10** — minimize the fraction of shared-Knowledge facts that are un-grounded per-seat hunches (no Knowledge↔Memory conflation — the purity of the shared graph).

**Extended scope (added at S0/ratification, 2026-07-17).** FR-1..10 scope the _Knowledge_ product; the invariant
ratification surfaced three areas the Knowledge-centric outcomes did not reach. Rather than ground them to a
bare "need", they are made first-class measurable outcomes (owner decision — complete FR-driven traceability):

- **FR-11 (Memory — per-seat experience)** — maximize the fraction of a seat's _task-relevant own experience_
  (prior attempts, craft-lessons) available to it at the moment of need. _(Sub-metrics, all trace-observable:
  own-recall@need · cross-seat-bleed rate → 0 · manual self-model authoring → 0. The scoping/derivation
  mechanisms live in DP-12, not the outcome. Homes the Memory subsystem — MEM-1/3/4/5/6/8/11/12/13; MEM-10 stays FR-8.)_
- **FR-12 (Safety — no secret leaks the store)** — minimize the probability a credential / secret is persisted
  into the **irreversible content-addressed store**. _(Measurable: secret-scan catch-rate on a seeded corpus,
  leak count = 0 target. Homes PERSIST-10a, MEM-9 — billy's domain.)_
- **FR-13 (Agent-ergonomics — the delivery layer)** — maximize the fraction of agents that use the Atlas
  correctly at low error, **regardless of harness grant**. _(Sub-metrics: tool-call error rate · zero-grant
  reach coverage. The delivery mechanism — tri-transport, push-default — is DP-14, not the outcome. Homes the
  M-Tools delivery invariants — TOOLS-2/3/4/11/11a; the D1 Usability risk is now an FR.)_

Each FR is a benchmark assertion waiting to happen, and the head of the trace `FR → DP → invariant → golden`.

## Non-goals / constraints (explicit, not discovered mid-design)

- **No embeddings, no RAG** — retrieval is deterministic + structural, by construction. A ratified constraint,
  not a preference (it bounds every DP downstream).
- Not a general vector database; not a chat-memory server; not a search engine over raw files.

## Next

- **D1 — Frame:** PR/FAQ (to a skeptical contributor: "what do agents use today" = raw file reads / embeddings-RAG
  / MCP memory) + the four risks. The **feasibility bet = FR-1/FR-2 met without embeddings** — spike it first.
- **D2 — Structure:** map each FR → its design parameter (DP) + the coupling matrix (`axiomatic-design`).
- **D4 — Ratify:** each existing Atlas invariant → a ratified Register row grounding to one of these FRs.
