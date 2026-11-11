# Core adapters to Atlas, Relay and workspace movement

Layer: **L1 — pinned factual basis**. Need: `component`. Scope: `orchestra.s1`.
Source revision: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Observed implementation

The Atlas adapter binds `@orchestra/atlas-boundary/surface` to one store root and trusted project ID. It runs the synchronous boundary calls in process, translating throws to `AtlasSurface.Unavailable`; this can hold the fiber while the boundary walks its tree. A non-repository root uses the active directory; a repository uses its worktree. Territory writes inject project ID on the host side. Delegate handles each interview answer separately and rejects empty replies. The legacy screen mining path caps sites at 200, runs four model calls concurrently, omits failed replies and passes the result to boundary admission; its source says candidates are staged, not promoted. This is a preexisting adapter and is not this Genesis protocol's publication/import path. [1]

The Relay adapter is Location-scoped, stores state under the global data root by project, and defers disk acquisition until needed. `verify` serializes checks, runs the external gate core and records its verdict. A pass that cannot be appended becomes `unavailable/unrecorded`; a failing verdict remains fail. Recovery only considers a run-lock directory older than process start and not held in this process; it appends a recovery note before deleting the lock. This is a conservative local observation, not proof that all other hosts are dead. Workflow-bound progressive arms refuse the generic evaluate path with `WORKFLOW_NATIVE_SETTLEMENT_REQUIRED`; transition uses the native workflow evaluator port. `trial` is separately specified as trusted command execution without grading or ledger passage. [2]

`MoveSession` resolves the destination project and refuses a different project. If moving changes between worktree roots, it captures and applies source changes before publishing `Session.Moved`, then discards the source changes. A later source-reset failure occurs after the destination and Session event may already have changed; the function has no cross-filesystem/event rollback transaction. The inspected function does not itself coordinate an active runner, so caller quiescence must be checked before changing that flow. [3]

RAG Studio's assigned Core file defines source/chunk/revision/question/trace/pipeline tables. Chunks intentionally lack a source foreign key for later orphan cleanup, and this schema has no embedding column or vector table. A declared schema is not a running retrieval engine; the retrieval/pipeline implementation belongs to its module owner. [4]

## Normative intent and gaps

Core owns these adapters and their platform services, while Atlas and Relay modules own their engines and governance semantics. Follow boundary packages for behavior beyond the adapter; do not substitute this source-only L1 for S3/S4 runtime proofs. The inventory preserves Relay workflow/hook helpers, historical runtime-closure documents and control-plane plans as distinct deeper evidence obligations. No Atlas/Relay command, session move, gate, workflow trial or database operation executed.

## Source anchors

- **1.** `packages/core/src/atlas.ts:f6718654785fb155e1bb1b2acb7e9985478b983b` — surface adapter, per-question delegate and legacy mine, lines 41–48,75–148,248–304,318–341.
- **2.** `packages/core/src/relay.ts:25fb509203f933a2e8b0f311c3fc8f9476d53e16` — gate recording, recovery and workflow boundary, lines 120–172,176–217,319–414,473–538.
- **3.** `packages/core/src/control-plane/move-session.ts:49fe728d6956ca1555a763548e9458ea5f3938dc` — project check, change transfer and event ordering, lines 77–148.
- **4.** `packages/core/src/rag-studio/sql.ts:214ab3375acc34072ee74c3123501c80615bf488` — current Core schema boundary, lines 1–81.
