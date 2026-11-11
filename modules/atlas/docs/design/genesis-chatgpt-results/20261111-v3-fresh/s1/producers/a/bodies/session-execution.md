# Local Session execution, continuation and interruption

Layer: **L1 — pinned factual basis**. Need: `flow`. Scope: `orchestra.s1`.
Source revision: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Observed implementation

`SessionExecution` exposes active IDs, explicit resume, advisory wake, interrupt, exclusive operations and `withRunner`. The local implementation owns one `SessionRunCoordinator`; a drain looks up the Session through `SessionStore`, then obtains the runner from `LocationServiceMap.get(session.location)`. No Session ID is a layer-construction input. The recording-only `noopLayer` does not execute; requesting its runner dies explicitly. [1,2]

The coordinator keeps an in-memory map keyed by Session. Explicit `run` starts idle work with `force:true` or joins an active entry. Only a starter opting into `interruptOnCancel` owns cancellation; a joining waiter does not. `wake` coalesces pending work and starts non-forced drains when idle. `exclusive` refuses busy work or waits when requested. `stop` clears the pending wake and interrupts the exact current entry. Different keys can execute concurrently; none of this state is a durable cluster lease. [3]

At the start of a provider attempt the runner checks the stored Location against its bound Location, consults `TaskGovernance.beforeTurn`, selects the agent, initializes missing System Context before promotion, then promotes eligible inputs. New input resets the provider-turn allowance. A queue promotion takes one queued input and the eligible steer batch. It loads projected history using the context baseline sequence and prepares catalog definitions. The last allowed provider turn advertises no tools. [4]

The ordinary turn has one explicit `llm.stream(request)`. A selected registered `ExecutionHost` instead receives one host stream with history and controlled execution/authorization ports. A missing named host is a defect. For ordinary local tools, the publisher records the complete call before its child settlement starts. The runner waits for all started settlements after provider-stream completion before continuation. Hosted-engine Orchestra calls also pass through registry settlement, but are projected as provider-executed events. [4]

Non-forced drains do nothing when neither steer nor queue is pending. Before productive work they fail tools left projected as running by an earlier process. The inner loop continues for settled local calls or pending steering; only when it would become idle does the outer loop promote the next queue input. Interruption clears tool fibers, records interruption outcomes where appropriate, and cancels the Session's open permission and question requests. A runner failure outside a provider turn records a failed assistant step when possible. [4,5]

## Normative intent and real limits

The process-local map is the execution ownership boundary. EventV2 replay-owner fields do not make it clustered. Root AGENTS and the runner comments reserve durable multi-node ownership, durable execution status and post-crash provider continuation for future work. An interrupted drain preserves already admitted inbox data for later wake/resume; it does not silently rerun abandoned side effects. [3,4,5]

The runner's checkbox comment is not a complete feature census: later code implements snapshots and compaction paths that older unchecked items still mention. Statements here follow executable branches. General retry bounding, identical-tool-loop control and stale runtime-attachment semantics are not established merely by the provider-turn step limit. Hosted engine internals are outside this L1 authority; their implementations belong to the engine-adapter owner. No provider request, shell command or product test was executed for this evidence.

## Source anchors

- **1.** `packages/core/src/session/execution.ts:a0af7f2c15cb10366d493b3d4eb971d3d28c1618` — Interface, noopLayer, lines 12–53.
- **2.** `packages/core/src/session/execution/local.ts:e7b758462abfd388f937fb18b79f82f2733dffad` — local drain routing, lines 10–55.
- **3.** `packages/core/src/session/run-coordinator.ts:526a1e28f6027d744a95f145159be9cc59109ac2` — make, run, wake, exclusive, stop, lines 10–153.
- **4.** `packages/core/src/session/runner/llm.ts:c3ad8d87a58923d40797d38a77ff65367bbe66b6` — runTurnAttempt, providerStream, drain, interruption, lines 67–115,185–270,289–357,427–580,616–682.
- **5.** `docs/specs/v2/session.md:e3574b87bc3b12c0eca603f96821a16ec89399fc` — execution and follow-up contract, lines 22–52,212–219.
