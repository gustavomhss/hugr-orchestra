# Native Streamable HTTP MCP transport

`CapabilityMcp.make(options?)` is a synchronous, host-only factory. Its only public
operations are `listTools(selection)` and scoped `open(selection)`. A session exposes
`listTools` and `callTool(name, input)`. No model tool, executor, permission decision,
schema compiler, credential lookup, account selection, or durable replay lives here.
The caller supplies an approved Connection resolution and its exact credential.
`selection.endpoint` is that Connection's scoped endpoint; target resource data and
credential metadata cannot change its URL or authorization.

## Protocol and provenance

Written against the MCP 2025-11-25 specification, consulted 2026-10-09:

- https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
- https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle
- https://modelcontextprotocol.io/specification/2025-11-25/server/tools
- https://modelcontextprotocol.io/specification/2025-11-25/schema
- https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks

The provider host table is transcribed from
`packages/capability-assets/src/providers.ts` and provider names in `catalog.ts`
at `2a971d2a1372ea3598b567455de87d11c132de82`. Core does not import Assets.
`prisma_postgres` is the discovery-normalized spelling of `prisma-postgres`.
The original HTTPS endpoint must validate before an exact localhost HTTP
`Options.fixtureOrigin` can override its destination. This option is only for
trusted test construction, never model arguments.

Initialization offers 2025-11-25; 2025-03-26 and 2025-06-18 are also accepted.
Tools capability is required. Each POST accepts JSON and SSE and uses one exact
JSON-RPC ID; batches fail. SSE needs a blank-line event delimiter: EOF does not
dispatch a truncated event. Duplicate correlated responses completed within the same
acquired chunk fail; arbitrary later-chunk duplicates are not detected after reader cancellation.
Initialized notifications and replies to server requests
require empty HTTP 202 acknowledgements. Sampling, elicitation and other unsupported
server methods receive `-32601`; ping receives an empty result. No server request
executes a model, approval, filesystem access, or tool.
Known ping, progress, log and tools-list-changed traffic validates its standard params
before acknowledgement or discard; common params `_meta` must be an object.
Tools-list-changed params retain arbitrary JSON extension fields, as allowed by
NotificationParams; an `id` still makes that known notification invalid.

## Bounds and lifecycle

Defaults: 4 MiB aggregate catalog envelopes (including initialization and all read
SSE framing/notifications), 256 tools, 16 pages, 4 MiB call response envelopes,
256 KiB encoded requests, 30 seconds total acquisition/call, four scoped sessions
per factory, 512 generation identities, and 64 JSON-RPC SSE messages per acquisition
or call. UTF-8 bytes are counted before decoding/buffering/parsing. JSON nesting
is bounded at 64, cursor bytes at 4096, session IDs at 256 visible ASCII characters,
tool names at 256 characters, descriptions at 2048, and credential headers at 16384.
Positive integer options are required; timeout must fit a native timer.
Incoming HTTP headers are subject to native fetch's bounds, not a custom aggregate
header-byte quota. Only the assigned session-ID value has the transport's explicit header bound.

Catalog acquisition returns complete coverage only after the terminal page.
Duplicates, cursor cycles and all exhausted budgets fail. `byteLength` measures
response body bytes, including full envelopes and read SSE framing, not HTTP header
or compressed wire bytes. SSE acquisition ends at the correlated response and cancels
its reader; later unsolicited traffic is not read or included. Repeat session lists
include the original initialization byte cost in their catalog budget.

Generations increase monotonically within a factory. Keys bind Connection/Target
references and generations, owner and approved endpoint; values hash all sorted raw
tools, including schemas, descriptions and metadata. Identical catalogs reuse their
generation. A full identity map fails closed rather than evicting and reusing history.
Create one host factory for the required generation lifetime; generations are not
persisted or deterministic across host restarts: numeric generations depend on each
factory's acquisition order. Credential rotation always requires an explicit new
open; sessions are never shared or pooled.

Sessions retain headers only in their own scoped connection. Failed opens immediately
close their child scope and release permits; closing a successful scope invalidates
the session, aborts and joins active native fetch/reader tasks, then attempts DELETE when assigned and credentials
remain unexpired. Expiry is checked again before every outbound POST. DELETE is best effort, byte bounded,
and limited to the lesser of one second and the configured timeout. Interruption and
unexpected defects remain Effect causes. Expected errors contain only fixed transport
reasons, never endpoint, credentials, session ID or vendor body. Failed child scopes
detach from their parent rather than retaining cleanup entries until parent close.
Terminal operation failure/interruption closes its dead child immediately, even if
the caller catches the cause inside a live parent scope. Healthy sessions stay scoped.
Permits are released after task settlement and bounded DELETE. The explicit async
interruption finalizer joins JS `finally`; beta83 `tryPromise` alone does not.
Disposal is masked and single-flight. All failed operations and the parent finalizer
join the same completion latch, which includes cleanup defects. A separate removable
parent attachment stays open while the resource scope's finalizers run: beta83 marks
that resource scope `Closed` before finalization finishes. Owner detachment skips its
own disposal callback, avoiding a self-join; completion is published only after resource
cleanup and the detachment phase.
Call arguments are descriptor-checked, byte-bounded detached JSON captured at each
Effect execution before serial permit wait. Inert `toJSON` data survives; callable
serializers, accessors, cycles and custom object/array prototypes are not executed.

## Deliberate limits and caller responsibilities

- POST Streamable HTTP only: no GET listener, reconnection, resumability, retry,
  legacy SSE/stdio fallback, OAuth refresh/discovery, tasks, roots or sampling.
- A disconnect before a response fails. HTTP 404 invalidates the current session;
  a later explicit host operation can open a new one. A call is never reposted.
- Aborting local fetch or deleting a session does not prove a remote mutation was
  cancelled. Callers must retain durable intent and reconcile ambiguous failures;
  post-dispatch loss without a definitive correlated result/error reports
  `outcome_unknown`, including disconnect, body loss, malformed results, ambiguous
  HTTP errors and timeout. Definitive HTTP 401/403/404 and correlated protocol
  errors retain typed failures. Interruption retains its Effect cause and still
  requires reconciliation; neither abort nor DELETE proves remote nonexecution.
- Input/output schemas and descriptions are preserved. Boolean schemas are accepted
  for the existing local validator, despite the 2025-11-25 tools specification's
  object-only input-schema wording. Schemas are not compiled or default dialects
  rewritten. Object-form schemas require root `type: "object"`, with string `$schema`,
  object `properties` and string-array `required` when present. Immediate property-map
  values must be schema objects or the documented native boolean-schema extension;
  these values are not recursively compiled or rewritten. Unknown JSON keywords
  stay exact. Call arguments must be objects; structured content must be an object.
- Discovery fails `unsupported_operation` for task-required tools because this
  synchronous interface cannot invoke them correctly. Task-optional tools can be
  called normally; execution metadata still participates in the generation hash.
- Returned content remains untrusted vendor data. Callers enforce captured registry,
  permission policy, input/output validation, disclosure and durable replay.
- Wire checks validate required fields and optional metadata, annotations and icon
  field shapes. They do not validate URI syntax, ISO timestamps, MIME registries or
  base64 payloads, fetch referenced resources/icons, or validate vendor JSON Schemas.
  Unknown JSON extension fields remain opaque. Embedded resource content follows
  the official anyOf: at least one string text/blob representation, including both
  strings. The opposite field is an allowed extension, not an invented XOR constraint.
- Tests use real localhost HTTP through fetch. They do not qualify live providers.

## Verification

From `packages/core`, with the owner's local-test permission:

```sh
ORCHESTRA_LOCAL_TESTS=1 bun test ./test/capability-mcp.test.ts
bun typecheck
```

Review boundaries: `index.ts` owns host selection, scoped lifetime and generations;
`http.ts` owns fetch/readers, byte quotas and incremental SSE;
`protocol.ts` owns JSON-RPC and MCP wire shape checks and request encoding.

A development mutation probe removed the response-ID comparison in `protocol.ts`.
The real localhost `rejects wrong numeric ID` fixture failed its assertion:
`Expected: true; Received: false` for `Exit.isFailure(exit)`. The comparison was
restored. This demonstrates that the correlation assertion detects that bypass;
it is not a claim of exhaustive protocol or live-provider qualification.

The failed-open child-scope fixture also reproduced a retained parent cleanup entry
(`Expected: 0; Received: 1`) before replacing manual child attachment with the installed
Effect 4.0.0-beta.83 `Scope.fork`. Successful opens still attach one cleanup entry.

Cold-review follow-up mutation probes each failed their focused fixture before
restoration: disabling ambiguous-outcome mapping (`outcome_unknown` became
`acquisition_failed`), removing the per-execution snapshot (queued nested value
changed), skipping dead-child close (DELETE count stayed zero), skipping close's
active-task join (release preceded cleanup), dropping the interruption join (one
native task remained after Fiber interruption), bypassing known traffic validation,
allowing task-required discovery, and dropping object-schema root validation.
The latter three accepted malformed/unsupported traffic or catalogs and failed the
fixture's expected-failure assertion. These are local fixture observations, not CI
or live-provider qualification. The close-order fixture includes a controlled
pending JS-cleanup barrier alongside real native fetch; the interruption fixture
checks the actual native reader task's settlement.

Further recheck fixtures first reproduced early second-call return during held DELETE,
rejection of valid list-changed extensions, and acceptance of malformed property-map
values against the prior implementation. Four restored-after-red mutation probes
then independently removed the disposal completion join, replaced the parent's join
with bare `Scope.close`, restored the extension-key whitelist, and removed immediate
property-value checks. The held-DELETE fixture caught second/parent return before
release (`Expected: false; Received: true`); extension acceptance failed with
`MCP list notification failed`; property rejection failed with
`Expected: true; Received: false`. A second held-DELETE fixture interrupts the cleanup
owner's active call and checks that cleanup still completes once, all waiters join,
and a new healthy scope reuses the released permit.
