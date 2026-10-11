# Authoring API

Audience: agents. Status: current.

The authoring service stores workflow and hook documents for one workspace, compiles workflows to Relay
sprints, publishes definitions and evaluates them through the Relay daemon. Orchestra's Workflows and
Hooks screens consume it. It ships no UI. Source: [lib/relay_authoring/](../lib/relay_authoring/),
entrypoint [bin/relay-api](../bin/relay-api), maintenance [relay-authoring](skills/relay-authoring/SKILL.md).

## Run

```sh
python3 bin/relay-api serve --workspace /absolute/project --port 8790
```

| Option | Default and role |
|---|---|
| `--workspace` | Current directory; checks run here |
| `--data-dir` | `~/.relay/authoring`; workspace-scoped SQLite documents, versions, scopes, executions, uploads and run state |
| `--base-path` | `/relay/`; the API lives under `<base>api/v1/` and health under `<base>healthz` |
| `--host-origin` | Repeatable exact HTTP(S) origins allowed as `Host` and `Origin` besides loopback |
| `--skill-root` | Repeatable extra skill roots; the host passes its own skill directories here |
| `--relay-root`, `--relay-url` | Relay checkout for profiles and the daemon; or an already running daemon |

The service binds `127.0.0.1` and trusts its caller: it has no authentication. The host owns
authentication, authorization and same-origin proxying. Startup seeds one document per shipped
`profiles/*.sprint.json` (named `Relay · <profile>`); profile files are never edited.

## Endpoints

All bodies are JSON objects. Errors return `{message, code}` with an HTTP status (400 invalid,
403 host or origin refused, 404 unknown, 409 conflict or state refusal, 502 daemon protocol fault).

| Method and path | Result |
|---|---|
| `GET bootstrap` | Protocol version, workspace identity and feature flags (`hookExecution`, `cancelEvaluation`, `dispatchAgent` are `false`) |
| `GET node-types` | `{workflow, hook}` node catalogs: type, label, ports, parameters with defaults and options |
| `GET events` | Server-sent events, see below |
| `GET documents`, `GET documents/<id>` | Documents with `checksum`, `activeVersion` and expanded scopes |
| `POST documents`, `PATCH documents/<id>` | Save a draft; `versionId` and `expectedChecksum` guard against stale writes, `?force=true` overwrites |
| `DELETE documents/<id>` | Delete a document |
| `POST documents/<id>/publish` | Mark a valid version as the published definition (`versionId`, optional `expectedChecksum`) |
| `POST documents/<id>/unpublish` | Withdraw the published definition |
| `GET documents/<id>/sprint` | Compiled sprint and skill bindings (digests, not contents) |
| `GET documents/<id>/export` | `{kind: "workflow", definition: <sprint>}` or `{kind: "hook", definition: <relay.hook.v1>}` |
| `GET/POST scopes`, `PATCH/DELETE scopes/<id>` | User scopes; documents reference them in `tags` |
| `GET skills`, `POST skills/refresh`, `POST skills/upload` | Skill catalog from the workspace, the machine and `--skill-root`; uploads take `{filename, content}` for one `.md` |
| `GET executions[?documentId=]`, `GET executions/<id>` | Execution receipts |
| `POST executions` | `{documentId, destination?}` starts an evaluation; `destination` (a step name) evaluates the prefix up to it |
| `POST executions/<id>/retry` | Retry the latest failed attempt of a run with its frozen sprint, state and budget |
| `GET executions/<id>/audit` | `relay verify` report over the run's ledger |

## Documents

- `nodes[]`: `{id, name, type, position: [x, y], parameters}`; IDs and names are unique.
  `connections`: `{<source name>: {main: [[{node: <target name>, type: "main", index: 0}]]}}`.
  `nodeGroups[]`: phases `{id, name, description, nodeIds}`; `description` is the full phase protocol.
- A workflow is one chain. The optional `relay.startTrigger` node carries `relayBrief` and
  `relayRetryBudget` (0 to 99); it is not a WP and stays outside every phase. Each other node is a
  WP of kind `relay.execute|gate|review|inject|human` with `instructions`, `checklist` (JSON list),
  `skill`, `skillMode` and, for `inject`, `text` and `file`. Edges, not array order, set the order.
- Every phase must be one contiguous stretch of the chain; interleaved phases are refused with
  `unsupported-macro-topology`. Branches, cycles, disconnected steps and duplicate criterion IDs
  are refused. IDs and control bytes stay exact; unknown sprint and WP fields survive in
  `meta.relay.sprint`.
- Incomplete drafts save with `meta.relay.diagnostics`; publish and evaluation refuse them.
  Malformed shapes are refused before they are stored.
- A hook holds one `relay.hookEventTrigger` (`operation` read/edit/write/command, `timing`
  before/after), optional `relay.hookCondition` nodes (outputs Yes and No) and actions
  (`relay.hookRemind|Block|Approve|Verify|Repair|Record`). Block and Approve need a `before`
  event. Export is `relay.hook.v1` with `installed: false` and `binding: "host-required"`; the
  service never installs or runs hooks.

## Executions and events

An execution records `status` (`running`, `success`, `error`, `crashed`), the frozen document in
`workflowData`, `relay` (run ID, sprint, skill bindings, destination, outcome, state and ledger
paths) and `data.resultData.runData[<step name>]` steps with `status`, timings and the daemon
`output`. Evaluation calls the original daemon; it does not dispatch agents. Escalation blocks
every retry of the run; a restart marks in-flight executions `crashed` and never reruns them.
Kind `human` cannot run on the CLI driver.

`GET events` streams `document.saved`, `execution.started`, `node.started`, `node.finished` and
`execution.finished`, each with `workspaceId`. A lagging client is disconnected; streams have no
replay, so reload resources after a reconnect.

## Not in this service

Hook installation on host events, agent dispatch per WP, cancellation, ARM release and
authentication belong to the Orchestra host.
