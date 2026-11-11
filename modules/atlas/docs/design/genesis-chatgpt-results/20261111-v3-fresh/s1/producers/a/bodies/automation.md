# Actions admission, scheduled dispatch and Board decision records

Layer: **L1 — pinned factual basis**. Need: `flow`. Scope: `orchestra.s1`.
Source revision: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Observed implementation

Actions is Location-scoped and resolves repository bindings only on first operation, allowing non-Git Locations to boot. GitHub and GitLab readers are selected from the binding; authoring, resources and commands have separate dispatch paths. Execution clones caller data and compares the admitted intent kind and any expected endpoint target fields before performing. One-time command output is validated separately from its durable operation acknowledgement. [1,2]

`ActionsOperations.prepare` requires a real absolute Location and signed-in account, strictly decodes intent, binds provider/account/revision/Location/client identity, reconciles exact retries and refuses conflicting reuse. It sweeps expiry independently, checks ledger/unknown-outcome capacity, and stores a prepared row inside an immediate transaction. Execution can claim only a still-prepared, unexpired matching row as `sending`; other states return their receipt. The provider action runs outside the SQL transaction with a deadline and disposal signal. Failure without definitive evidence becomes `outcome_unknown`; finalization records the outcome. `reconcile` observes only accepted or unknown rows and never calls the perform callback. This separates command admission from confirmed external outcome. [3]

The scheduler claims due slots transactionally and dispatches through normal `SessionV2.create` then durable `prompt`. Legacy runs select Maestro in the task directory. Capability runs check owner agent/placement and current claim before Session creation and again before admission. A documented race remains between the last check and prompt admission: a revoked claim may still receive an honest `started` receipt, including one run beyond a repeat limit. Started proves admission, not completion of the Session's model/tool work. [4]

Stale dispatch claims are selected after the 120-second lease. Takeover compares exact owner/claim time, checks whether the prompt reached `SessionInput`, voids unadmitted claims for replanning, and retries already admitted identity only to reconcile and wake. A failed legacy due slot is consumed rather than silently retried. The separately composed daemon ticks at boot and waits for due times or writes; failures are logged and later passes continue. This SQL dispatch lease is distinct from the process-local Session execution coordinator. [4]

Board answers produce decision records. Changing a standing answer rejects an already-overturned record, invalid option or unchanged answer, inserts a new record with `supersedes_id`, links the old record with `overturned_by_id`, updates the current question answer and appends activity. Recording an outcome addresses the current standing decision and logs Maestro's reason. It preserves answer lineage without claiming that a recorded outcome independently verifies the underlying work. [5]

## Normative intent and gaps

These services expose different meanings for preparation, sending, admission, acknowledgement, observation and recorded decisions. They are not interchangeable “done” statuses. Provider-specific Actions transport/reconciliation, scheduler cadence calculations and Board issue/epic automation are deeper family members not exhaustively interpreted here. No external workflow, schedule, Board write or product test ran.

## Source anchors

- **1.** `packages/core/src/actions.ts:4f81df84763bd63e7680de8fd40c60b583ef68ca` — Location binding, reader routing and execute, lines 49–85,171–216.
- **2.** `packages/core/src/actions/contract.ts:62521cbd3f4860049c3480a2bf9f2ed650c6c9f8` — transport, adapter and operation boundaries, lines 8–88.
- **3.** `packages/core/src/actions/operations.ts:83c0b9e03b063bd59bc2d30317f7de85cbb99ee4` — prepare, execution CAS and observation-only reconcile, lines 16–203.
- **4.** `packages/core/src/scheduled-task.ts:0a89bbdc576091ca01445e45e1500ed4008898a9` — claims, admission race, takeover and daemon, lines 23–32,121–244,272–320,481–504.
- **5.** `packages/core/src/board/decision.ts:4b219f5b62517b2c4f9749a1a99e6257cfeff167` — decision history, change and outcome, lines 11–128.
