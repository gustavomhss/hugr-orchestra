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

The provider host table is transcribed from
`packages/capability-assets/src/providers.ts` and provider names in `catalog.ts`
at `2a971d2a1372ea3598b567455de87d11c132de82`. Core does not import Assets.
`prisma_postgres` is the discovery-normalized spelling of `prisma-postgres`.
The original HTTPS endpoint must validate before an exact localhost HTTP
`Options.fixtureOrigin` can override its destination. This option is only for
trusted test construction, never model arguments.

Initialization offers 2025-11-25; 2025-03-26 and 2025-06-18 are also accepted.
Tools capability is required. Each POST accepts JSON and SSE and uses one exact
JSON-RPC ID; batches fail. Initialized notifications and replies to server requests
require empty HTTP 202 acknowledgements. Sampling, elicitation and other unsupported
server methods receive `-32601`; ping receives an empty result. No server request
executes a model, approval, filesystem access, or tool.

## Bounds and lifecycle

Defaults: 4 MiB aggregate catalog envelopes (including initialization and all read
SSE framing/notifications), 256 tools, 16 pages, 4 MiB call response envelopes,
256 KiB encoded requests, 30 seconds total acquisition/call, four scoped sessions
per factory, 512 generation identities, and 64 JSON-RPC SSE messages per acquisition
or call. UTF-8 bytes are counted before decoding/buffering/parsing. JSON nesting
is bounded at 64, cursor bytes at 4096, session IDs at 256 visible ASCII characters,
tool names at 256 characters, descriptions at 2048, and credential headers at 16384.
Positive integer options are required; timeout must fit a native timer.

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
persisted across host restarts. Credential rotation always requires an explicit new
open; sessions are never shared or pooled.

Sessions retain headers only in their own scoped connection. Failed opens immediately
close their child scope and release permits; closing a successful scope invalidates
the session, aborts active readers and attempts DELETE when assigned and credentials
remain unexpired. Expiry is checked again before every outbound POST. DELETE is best effort, byte bounded,
and limited to the lesser of one second and the configured timeout. Interruption and
unexpected defects remain Effect causes. Expected errors contain only fixed transport
reasons, never endpoint, credentials, session ID or vendor body.

## Deliberate limits and caller responsibilities

- POST Streamable HTTP only: no GET listener, reconnection, resumability, retry,
  legacy SSE/stdio fallback, OAuth refresh/discovery, tasks, roots or sampling.
- A disconnect before a response fails. HTTP 404 invalidates the current session;
  a later explicit host operation can open a new one. A call is never reposted.
- Aborting local fetch or deleting a session does not prove a remote mutation was
  cancelled. Callers must retain durable intent and reconcile ambiguous failures;
  timeout on a call reports `outcome_unknown`.
- Input/output schemas and descriptions are preserved. Boolean schemas are accepted
  for the existing local validator, despite the 2025-11-25 tools specification's
  object-only input-schema wording. Schemas are not compiled or default dialects
  rewritten. Call arguments must be objects; structured content must be an object.
- Returned content remains untrusted vendor data. Callers enforce captured registry,
  permission policy, input/output validation, disclosure and durable replay.
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
