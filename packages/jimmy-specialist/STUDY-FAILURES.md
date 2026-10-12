# Study v15: sanitized candidate failure diagnosis

Scope: five retained candidate failures, diagnosed from actual native execution,
provider-wire records, task metadata, provenance and independent cold grades.
Classification is additive; original results and acceptance criteria are preserved.

| Slot | Class | First failing stage | Minimum general contract |
| --- | --- | --- | --- |
| R08 rep1 | A: runtime/transport | Final HTTP-200 SSE stream terminates; assistant remains unfinished; no parent output. | Preserve native timeout controls through both relay hops; retain typed timeout origin and partial output without marking it complete. |
| R05 rep2 | B: authored qualification; recovered A incident | Completed final report loses the declared-versus-verified provenance boundary. | Keep identity claims at the strength established by evidence and preserve explicit verification limits in the parent report. |
| R08 rep2 | B: authored qualification | Completed final report drops an applicable condition despite cited evidence. | Preserve material applicability/counterconditions in the answer; citations do not substitute for stated qualifications. |
| R10 rep2 | A: runtime/transport | Final HTTP-200 SSE stream terminates; assistant remains unfinished; no parent output. | Same transport/timeout contract as R08 rep1. |
| R14 rep2 | B: resumed handoff | Recovery succeeds; completed parent handoff drops a material qualification. | Carry recovered constraints through final publication, not only through retained records. |

## Exact native errors and observed execution

- R08 rep1 and R10 rep2 persist `UnknownError` with message
  `The operation timed out.`
- `TaskTool.runTask` propagates this as
  `Subagent failed (task_id: <actual-session-id>): The operation timed out.`
- Their final wire streams lasted 279522 ms and 263986 ms respectively.
  Both had HTTP 200, `response-cancelled`, and no 600000 ms dispatch abort.
- R08 rep1 also had a recovered `read` denial:
  `The user has specified a rule which prevents you from using this specific tool call.`
  A relative method-file read left the admitted Location; this is not evidence
  that broader filesystem permission is required.
- R05 rep2 wire 6 recorded `response-stream-failed`; a pending
  `research_record` part ended with `Tool execution aborted`. Later turns
  completed. This is not a recorded tool-input schema rejection.

## Involved code and contracts

- External `provider-transport-v12.mjs` reconstructs `Request` and drops the
  Bun-specific `timeout: false` supplied by `Provider.getSDK`.
- External `provider-proxy-v12.mjs` independently uses `idleTimeout: 255` and
  does not pass `timeout: false` to its upstream fetch. Exact timer/hop origin
  is not retained, so the trace does not prove which timer fired.
- Native `Provider.wrapSSE`, `ProviderError.ResponseStreamError`,
  `MessageV2.fromError`, `SessionRetry.retryable` and `TaskTool.runTask` are
  the relevant stream/error propagation boundary. The persisted timeout is
  `UnknownError`, not the typed `ProviderResponseStreamError` path.
- `SessionRetry.retryable` does not match `The operation timed out.` with
  its timeout pattern. Any repair must keep retries within existing ceilings.
- `DiscoveryResult.assemble` decodes `Research.Card` from `jimmy-result` into
  `discovery-work-result-v1`. R05 rep2, R08 rep2 and R14 rep2 have
  `card.parsed=true` and `referencesChecked=true`.
- The two timeout slots have truncated/missing envelopes. Their decoder
  fallback follows the stream failure; it is not a demonstrated schema defect.
- R14 rep2 has admitted own checkpoint, real interruption and compaction,
  successful own recall, finding reopening and 3/3 retained-source reopening.
  Its interruption-related `MessageAbortedError` is expected; resume succeeds.

Acceptance remains all cases with three repetitions under unchanged criteria.
Later verification requires a new lead-frozen candidate and fresh actual runs
and cold grades; no averaging, best-of retry selection or reuse of old answers.
