# Background processes (session indicator)

Agents start and drive long-running processes through `process_control`
(`packages/core/src/capability/process-control/contract.ts`). The actions are start, list, status, log, wait, write,
submit, close-input, stop and transfer. No HTTP route exposes process state.

## Contract available today

Every `process_control` tool result in the transcript carries a `ProcessStatus`:

- `process.id`
- `state`, one of `intent`, `submitting`, `submitted`, `running`, `completed`, `failed`, `cancel-requested`,
  `cancelled`, `unknown` or `lost`
- the output window
- `input` (`open` or `closed`)
- `exit` (code or signal)

## Requirements

- P01. The session header shows a compact indicator, "2 running", when the latest known status of any process in the
  session is non-terminal. Terminal states are `completed`, `failed`, `cancelled` and `lost`.
- P02. The indicator opens a popover listing each process: argv summary from its start call, state, exit, and the
  time of the latest status. The popover says this is the latest status the agent observed, not live state.
- P03. Each item links to the tool call that reported it in the transcript.
- P04. P01 to P03 derive only from transcript tool parts. They add no server route.

## Later (needs a route)

- P05. Live status and a Stop button need a read route and a stop route scoped to the session, going through
  `CapabilityAuthorization`. They are out of this campaign's scope unless the owner asks.

## Tests

Model test: derive the indicator from a fixture transcript with started, running and completed processes, including a
process whose last status is `unknown`.
