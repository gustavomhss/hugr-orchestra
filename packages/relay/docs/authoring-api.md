# Authoring API

Audience: agents. Status: current.

Orchestra's Workflows and Hooks screens consume the native Server `HttpApi` through the generated
Client. Maintenance: [relay-authoring](skills/relay-authoring/SKILL.md). All monorepo paths below are
relative to the Orchestra checkout root; they are outside the Relay-only documentation link inventory.

## Installed routing

Use the Orchestra server already serving the app. Authoring needs no Python sidecar. The app adapter
is `packages/app/src/orchestra/relay/client.ts`; it calls `sdk.v2.relay.document`, `sdk.v2.relay.publish`
and `sdk.v2.relay.hook` with Location identity. Protocol definitions live in
`packages/protocol/src/groups/relay-document.ts` and `packages/protocol/src/groups/relay-hook.ts`.
Successful resource responses use the Location envelope; errors are typed Protocol errors.

<!-- native-authoring-handlers:begin -->

| Handler | Source |
|---|---|
| `RelayDocumentHandler` | `packages/server/src/handlers/relay-document.ts` |
| `RelayPublishHandler` | `packages/server/src/handlers/relay-document.ts` |
| `RelayHookHandler` | `packages/server/src/handlers/relay-hook.ts` |

<!-- native-authoring-handlers:end -->

`packages/server/src/handlers.ts` registers these handlers. `packages/server/src/relay-documents.ts`
owns the project store and editor view, using native `src/authoring/{store,graph,hook}.ts` and
Location-scoped `SkillV2`. Storage is `<Global.data>/relay/<projectID>/authoring.sqlite3`.
Profiles seed once per project per server process; seed failure leaves user documents usable.

## Endpoints

Paths below use the native `/api/relay` prefix. Consult Protocol for payloads and typed errors.

| Method and path | Result |
|---|---|
| `GET/POST /document`, `GET/PATCH/DELETE /document/:documentID` | List, create, read, save or remove workflow/hook drafts |
| `GET /document/:documentID/version[/:versionID]` | Saved versions |
| `POST /document/:documentID/publish`, `/unpublish` | Publish a compiled current version or withdraw publication |
| `GET /document/:documentID/sprint`, `/export` | Compiled sprint with binding digests, or workflow/hook definition |
| `POST /document/:documentID/check` | 403 `maestro-execution-required`; executable workflow checks are owned by Maestro |
| `GET /node-types` | Workflow and hook catalogs |
| `GET/POST /scope`, `PATCH/DELETE /scope/:scopeID` | Project document scopes |
| `GET/POST /hook`, `DELETE /hook/:installID` | List, install or uninstall published hook snapshots |
| `POST /hook/:installID/update` | Repin an install to its document's published version |
| `POST /hook/:installID/enable`, `/disable`; `PATCH /hook/order` | Hook activation and order |
| `GET /hook/:installID/decisions`, `POST /hook/repair` | Recorded decisions and explicit store repair |

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
  export itself does not install hooks. Explicit native install uses the published snapshot.

## Native save and execution boundary

Native updates require `versionId` or `expectedChecksum`, unless payload `force` is true.
Stale guards return 409; an unguarded, unforced update returns 400. Saves do not publish.
Publishing compiles first and records the signed-in principal. Installing a hook pins its published
version; republishing or editing the document does not update an existing install automatically.

Authoring routes do not provide the Python host's `bootstrap`, SSE, execution-retry or skill-upload
API. Use the host's Skill catalog and approved native execution binding. Profiles requiring tools
without native implementations remain unavailable; retaining standalone tools does not enable them.

## Retained Python regression reference

The former Python `api/v1` host is not the installed API. Its application, HTTP server and runner
remain in [lib/relay_authoring/](../lib/relay_authoring/) for
`tests/test_authoring.py` and `tests/test_authoring_hooks.py`, which import them directly.
Its daemon-backed receipts, prefix evaluation, frozen retry budgets and no-replay events describe
that regression surface only. The Python authoring launch pair is retired; historical changelog
entries record its original delivery rather than current startup instructions.
