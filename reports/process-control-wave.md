# Process control (J02, pipe mode)

Baseline `fa525499fb`. This wave delivers the canonical `process_control` leaf for asset A31. A process started through it outlives the tool call, keeps owner-checked input/output, and has durable job state. Pty mode, the operator HTTP APIs (I03C) and the `job_read`/`job_cancel` leaves come in later waves. Windows and Linux kill-tree qualification is separate.

## Frozen decisions

### Schemas

- Schemas live in `packages/core/src/capability/process-control/contract.ts`.
- The leaf has one input union with 10 actions: start, list, status, log, wait, write, submit, close-input, stop and transfer.
- `start` takes an explicit argv (1..256 entries), never shell text. It also takes an optional `cwd`, an optional `env` map, and `mode`. `mode:"pty"` fails `unsupported_operation`.

### Execution

- Each process has exactly one durable job: kind `local-process`, operation `process.start`, created through `CapabilityJobs.create`. Inside the start call, the same invocation moves the job intent→submitting→running through `transition`.
- After exit or stop, the registry calls the start-captured `settle`, which uses `CapabilityJobs.observeHost` with the producer proof:

  | Exit | Job state |
  |---|---|
  | 0 | completed |
  | non-zero or signal | failed |
  | stop | cancel-requested, then cancelled |

- An exit code or signal is visible live through the registry only. The durable `Observation` has no slot for it, and after a restart the process is lost anyway.
- Start reuses the bash approval engine. There is no second permission system:
  - `permission.assert({action:"bash", resources:[display], save:[display]})`, where `display` is the argv joined with POSIX shell quoting.
  - The `LocationMutation` external-directory assert for `cwd`.
  - `ToolSafetyGit.before` and `ToolSafetySandbox.wrap`.
  - The environment is `ToolSafetySandbox.environment()` with the explicit `env` entries laid over it. Explicit names must match the identifier pattern; values are not filtered, because the caller bound them on purpose.
- The registry is a process-global node (`CapabilityProcessRegistry`). Handles live in a registry-owned Scope per process. They outlive the tool fiber and the Location idle TTL, never serialize, and are killed (as a tree) when the host scope closes.

### Output

- Output is a merged stdout+stderr byte buffer with a capacity of 1 MiB per process.
- Cursors are absolute UTF-8 byte offsets. `log` returns `{start,end,text,lost?,eof}`, and `text` never splits a UTF-8 sequence.
- A cursor older than `retainedStart` reports `lost:[cursor,retainedStart)` and starts at `retainedStart`.
- `wait` returns when `end > cursor`, on eof or exit, or at the timeout (60 s max). Interrupting it detaches only that waiter.
- Exited entries stay readable for 30 minutes, and at most 32 exited entries are kept (the oldest is evicted first). After that the ID behaves as unknown.

### Ownership

- Every action checks the caller's issued owner against the entry's current owner: Session, agent and placement must all be equal. An unknown ID, a foreign owner and an evicted ID all fail identically with `target_denied`. `list` returns only the caller's processes (at most 32).
- `write` sends raw UTF-8 bytes. `submit` sends the data plus `"\n"` (pipe mode). `close-input` sends EOF. Writing after `close-input` or after exit fails with `unsupported_operation`.
- `stop` kills the tree with the existing spawner semantics (process group on POSIX, `taskkill /T` on win32). The outcome is `local-stop` only if the exit is observed within 5 s, otherwise `incomplete`.
- `transfer` is allowed only from a child Session to its persisted live parent (`session.parent_id`).
  - The parent must have the same placement and a non-empty persisted agent. The new owner is `{parent sessionID, parent agent, same placement}`.
  - It requires a running entry before the durable update. If the process exits after that commit, `Live.transfer` still swaps the owner (guarded by `owner === from`).
  - The order is: owner check, then the durable `CapabilityJobs.transferHost` (SQL owner update guarded by the expected generation), then `Live.transfer(from,to)`.
  - Afterwards the old owner gets `target_denied` on every action. Arbitrary destinations are impossible.

### Startup sweep

- When the Location's capability tools node is built, it marks lost every `local-process` job for that placement that meets all three conditions:
  - its state is in {submitting, submitted, running, cancel-requested, unknown};
  - it is not in `registry.live()`;
  - its `time_created` is earlier than `registry.startedAt`.
- It uses `markLostHost`, with the proof built from the stored row and evidence `startup-owner-absent`. It never respawns, writes stdin or adopts a PID.
- This assumes a single host process per DB, the same assumption as process-local SessionExecution.

## Ownership of work

| Owner | Scope |
|---|---|
| Lead | `contract.ts`, the output/registry stubs, the registration in `capability/tools.ts`, integration and the report |
| P1 | `process-control/output.ts` and its tests |
| P2 | `process-control/registry.ts` (global node, spawn, stdin, kill-tree, exit retention, transfer swap) and tests with real child processes |
| P3 | `CapabilityJobs.transferHost` in `job/index.ts`, `process-control/sweep.ts`, and their tests |
| P4 | `process-control/index.ts` (the leaf `make({jobs})` returning `{ tools: { process_control } }`) and leaf tests through real tool settlement |

Each slice is at most 400 LOC and gets a cold review. Focused local tests only; one PR+CI at the end of the campaign.

## Landing results

The wave landed on `native-capabilities`. Each author slice passed a cold review, and the blockers raised were fixed, re-reviewed and probed red, then restored green:

| Slice | Head | Content |
|---|---|---|
| P1 output | `7195783ba7` | UTF-8 byte ring with absolute cursors and boundary-safe text. `lost` now also covers bytes skipped to reach a character boundary. Waiters wake only when a whole character is readable. A BOM is preserved. A 20k-case fuzz in review found no failures. |
| P2 registry | `cecd07a3de` | Registry-owned per-process Scopes with a bounded, parallel shutdown. Spawn starts immediately, which fixes a leak on immediate shutdown. The JobID is reserved before spawn. The stdin backlog is bounded (`quota_exceeded`). A `ToolSafety.Denied` raised by prepare propagates unchanged. Transfer still works after exit. |
| P3 jobs | `7381ac76bd` | `CapabilityJobs.transferHost`. `host()` checks provenance against the first `producerOwner`, which only transferHost writes. `proofFromRow` is for trusted hosts only. Sweep logs each skipped row. |
| P4 leaf | `6b0a9cd7ff` | `process_control`. See "Security fixes from review" below. |

### Security fixes from review

The leaf builds one display string: the sorted explicit env as `KEY=value` prefixes, followed by the quoted argv. That single string feeds:
- the bash permission check;
- `ToolSafetyGit`;
- `ToolSafety.before`, which covers destructive-command refusals, askBefore and requireSandbox;
- command hooks.

`ToolSafety.Denied` now passes through to the HOLD path. The bash and shell paths are unchanged, and the existing bash and tool-safety suites stay green.

### Lead integration

- `capability/tools.ts` registers `process_control` and runs the startup sweep. A sweep failure is logged and never blocks the Location; interrupts are not swallowed. The node now depends on `CapabilityProcessRegistry`, `LocationMutation` and `AppProcess`.
- `ToolSafetyCommands.command` falls back to `args.command` for any other tool shape registered under the name `process_control`.
- `capability-tools.test.ts` now asserts that `process_control` is registered; removing the registration turns it red. It also overrides `LocationMutation`, because the fixture placement is not a real directory.
- Fixed a pre-existing failure: the expected tool lists in `location-layer.test.ts` had gone stale. They lacked every capability leaf registered by earlier waves.

### Verification

This is a local focused run, not campaign CI:

| Test | Result |
|---|---|
| output | 19 pass |
| registry | 15 pass |
| jobs-transfer | 3 pass |
| sweep | 2 pass |
| jobs | 23 pass |
| process-control and process-control-safety | 6 pass |
| capability-tools | 2 pass |
| location-layer | 5 pass |
| tool-bash and tool-safety* | 57 pass |
| Server artifact routes | pass |

Typecheck passes in core, server, sdk-next and orchestra.

### Follow-ups

- **Pty mode.**
- **Operator HTTP (I03C).**
- **`job_read`/`job_cancel` leaves.**
- **Kill-tree qualification on Linux and Windows.**
- **Escaped descendant holding stdout:** when one remains after the main child exits, the entry never settles and stop reports `incomplete`.
- **Regex-based command gates:** askBefore and git hygiene can be bypassed by a quoted `;`/`|`/`&` inside an argv element. This gap is shared with bash. For process_control, match on parsed tokens instead.
- **Signal names:** they are parsed from the spawner error text.
- **Command hooks:** the process_control hooks change has no dedicated test.
- **Campaign CI:** expect more stale cross-wave expectations like `location-layer`.
