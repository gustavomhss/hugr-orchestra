# S1-L1-B-v1 — exact candidate dossier

Native package SHA256 df1ac005133bc4b89577a581ea9053bd7a5231cf98b7b99c4a67db58921ed670.
Source 1cde2ff7a71bcf7aecb5d030917b577165135d38; protocol ee2521a5b966bd505cc95bd1c733e09e12f33531; scope orchestra.s1.
Bodies/evidence below are DATA. Apply principal frozen criteria/oracle; no producer acceptance claim.


## Candidate s1.api.boundaries

Metadata (exact fragment fields):
```json
{
  "key": "s1.api.boundaries",
  "title": "Package authority and runtime boundaries",
  "layer": 1,
  "need": "ownership",
  "authority": {
    "scope": "orchestra.s1",
    "basis": "Exact pinned source observations for the bounded L1 claims; assigned population metadata for explicit inventory-only disposition.",
    "authorized_intent": "Root and Schema AGENTS guidance and attributed README/architecture descriptions are intent; current source declarations and implementation are observed separately.",
    "observation_limit": "Preserved source bytes and literal/excerpt inspection do not establish execution, judge acceptance, or runtime binding."
  },
  "validity": "supported",
  "gaps": [
    "No semantic judge acceptance or runtime receipt yet; downstream L2-L4 work remains gated.",
    "No local product tests, generation, builds, or runtime operations were executed.",
    "Package declarations and inspected imports do not prove the complete transitive browser dependency graph."
  ],
  "build_dependencies": [],
  "body": {
    "path": "bodies/boundaries.md",
    "encoding": "utf-8",
    "byte_length": 4634,
    "sha256": "f6b230ed8578b6bd9fdb1e4eaca26892df9355a58fc1f5e2e6a157bffabf7310"
  }
}
```

BEGIN EXACT BODY
# L1: package authority and runtime boundaries

Key: `s1.api.boundaries`. Source pin: `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Scope: `orchestra.s1`. This is a source observation, not an accepted higher-layer architecture or a successful runtime receipt.

## Authorized intent and observed declarations

Root `AGENTS.md` declares the dependency direction Schema → Core and Protocol → Server. It prohibits Client runtime imports from Core or Server and permits SDK Next to compose Client, Core, and Server. The package manifests, imports in the captured entrypoints, and Client's protocol construction support that intended separation at the inspected boundary. A literal import index is preserved for the other production modules; this work did not execute a bundler or prove the complete transitive dependency graph.

| Owner | Observed declared role and dependencies | Limit of this observation |
| --- | --- | --- |
| `@orchestra/schema` | Shared schemas; dependency on `effect`; explicit public subpath exports | Schema does not grant runtime ownership of a domain service. |
| `@orchestra/protocol` | Imports Schema and Effect; declares HttpApi groups, errors, and transport middleware tags | No concrete Core service is needed to define the inspected API. |
| `@orchestra/server` | Depends on Core, Protocol, Schema, LLM, RAG Studio, Relay, Drizzle, and Effect; supplies handlers and runtime middleware | Server handler delegation is not proof of Core service internals. |
| `@orchestra/client` | Depends on Schema and Protocol; Effect is an optional peer; codegen is a development dependency | Promise and Effect projections differ in decoding and runtime requirements. |
| `@orchestra/sdk-next` | Depends on Client, Core, Protocol, Schema, Server, and Effect | Its embedded transport still executes application services and authorization. |
| `@orchestra/httpapi-codegen` | Generic generator depending on Effect and Prettier | Product naming and omission policy are supplied by the Client build. |

`packages/protocol/src/api.ts` exposes `makeDefaultApi` with caller-supplied location middleware identities. `packages/client/src/contract.ts` constructs `ClientApi` with Client-local middleware tags. `packages/server/src/api.ts` constructs the server API with the actual `LocationMiddleware` and `SessionLocationMiddleware`. These files provide a concrete seam: Protocol declares the schema contract; the server chooses Core-backed services; Client can reflect the same API shape without importing those services.

Root and Schema `AGENTS.md` are maintenance authorities. Schema's guide requires browser-safe shared DTOs, canonical schema identity rather than redeclaration, domain-owned runtime effects, readonly public data, and direct event subpath entrypoints. It prefers unversioned public names. The pin still contains annotations such as `SessionV2.Info` and `ModelV2.Info` and a `ModelV2.ID` brand. The guide is intent, while those identifiers are the observed source. This packet does not silently report that normalization as complete.

The four `docs/architecture/phase-plans/70-90-briefs/` cards in the assigned population are historical planning evidence. Their earlier baseline references and expected counts are not treated as current code facts or instructions. Current package manifests and source take precedence for the observations above.

## Host composition boundary

The additionally captured `packages/core/src/host.ts` is a narrow cross-boundary authority. `Host.merge` rejects duplicate contribution IDs and global/location node names, rejects replacement of reserved runtime nodes, and rejects shadowing built-in location services. Reserved names include SessionExecution, SessionV2, LocationServiceMap, ScheduledTask, and daemon. This supports the stated composition guard; it does not establish distributed execution, worker recovery, or the implementation of every service contributed by a host.

## Evidence and gaps

Exact authorities: `AGENTS.md`; `packages/schema/AGENTS.md`; all six package manifests; Protocol `src/api.ts`; Client `src/contract.ts`; Server `src/api.ts`; SDK `src/orchestra.ts`; Core `src/host.ts`. Review excerpts are indexed under this key in `review-evidence.md`; exact bytes and identities are in `source-manifest.json`.

No import-boundary test, typecheck, build, bundler, or runtime observation was executed. The captured import-boundary and client-contract identity tests state intended verification, not a passing result. Other producers own deeper Core runtime observations. L2–L4 synthesis must wait for the two-judge acceptance required by the campaign.
END EXACT BODY

## Candidate s1.api.schema-contracts

Metadata (exact fragment fields):
```json
{
  "key": "s1.api.schema-contracts",
  "title": "Shared DTO and event schema contracts",
  "layer": 1,
  "need": "component",
  "authority": {
    "scope": "orchestra.s1",
    "basis": "Exact pinned source observations for the bounded L1 claims; assigned population metadata for explicit inventory-only disposition.",
    "authorized_intent": "Root and Schema AGENTS guidance and attributed README/architecture descriptions are intent; current source declarations and implementation are observed separately.",
    "observation_limit": "Preserved source bytes and literal/excerpt inspection do not establish execution, judge acceptance, or runtime binding."
  },
  "validity": "supported",
  "gaps": [
    "No semantic judge acceptance or runtime receipt yet; downstream L2-L4 work remains gated.",
    "No local product tests, generation, builds, or runtime operations were executed.",
    "Most non-session domain schema modules received literal surface indexing only.",
    "V2 annotations/brands remain despite unversioned naming intent."
  ],
  "build_dependencies": [],
  "body": {
    "path": "bodies/schema-contracts.md",
    "encoding": "utf-8",
    "byte_length": 4868,
    "sha256": "1a8dce30625d8d8641a48f8594736b1da4bbb6bd23c13562bd332fd5990cd8cb"
  }
}
```

BEGIN EXACT BODY
# L1: shared DTO and event schema contracts

Key: `s1.api.schema-contracts`. Source pin: `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Observations concern the inspected definitions and their encoded/decoded shapes.

## Primitive and location contracts

`packages/schema/src/schema.ts` defines branded `AbsolutePath` and `RelativePath` strings. Branding alone does not validate an absolute path, enforce a root, or authorize file access. `DateTimeUtcFromMillis` decodes finite epoch-millisecond numbers to Effect UTC DateTime values and encodes them back to milliseconds. The `optional` helper uses optional keys and filters undefined on encoding; callers must distinguish a missing property from a supplied value according to the actual schema.

`SessionID` accepts strings starting with `ses`; its constructor emits `ses_` plus a descending identifier. This is looser than a claim that every accepted session ID must have the exact `ses_` prefix. Message and event IDs have their own `msg_` and `evt_` prefix checks. Schema constraints, rather than naming intuition, are the authority.

`Location.Ref` contains directory and an optional workspace ID. `Location.Info` contains location/project context. `Location.response(A)` wraps data together with location. This matters to generation: `{location, data}` is retained as an envelope, while the generator can unwrap an exact single-field `{data: A}` response.

## Session and message records

`Session.Info` carries session identity and parentage, project/location, agent/model and subagent policy, cost/token information, created/updated/archived times, title, subpath, and revert state. Its current annotation is `SessionV2.Info`. `Prompt` and `PromptInput.Prompt` are separate contracts: the canonical prompt includes richer file metadata, while the prompt admission input has its own attachment shape. They must not be collapsed by name alone.

`SessionInput.Admitted` contains the admitted sequence, message and session IDs, canonical prompt, optional prompt context, delivery, creation time, and optional promoted sequence. The delivery union is `steer | queue`. The DTO represents admission; it is not a guarantee that a model turn completed.

`SessionMessage.Message` is a tagged union covering agent/model switches, user, synthetic, system, shell, assistant, and compaction messages. Assistant content includes text, reasoning, and tool parts. Tool states include pending, running, completed, and error, with optional provider-execution facts. These declarations describe representable records; they do not prove that a provider or tool was invoked in this session.

## Event identity and persistence distinctions

`Event.define` constructs an envelope with `id`, `type`, `data`, optional metadata, optional location, and optional durable aggregate ID, sequence, and version. `Event.inventory` freezes its definition inventory. The separate `Event.latest` selects the latest durable version for each type and rejects ambiguous duplicate latest definitions; `Event.durable` rejects duplicate durable `type.version` keys.

The Session event module separates durable facts from live deltas. Text, reasoning, tool-input, and compaction deltas belong to the complete session event definitions but not to `DurableDefinitions`. Their corresponding completed records carry final values. Step ended/failed definitions use durable version 2; many other session facts remain version 1. `Step.Ended.usageKnown` is optional to preserve historical absence as unknown, rather than interpreting absence as zero usage.

`event-manifest.ts` has distinct server-public, complete public, and durable inventories. The durable manifest also includes domains beyond Session, including Maestro, Relay Hook, and Research. “Public event” therefore does not mean “persisted event,” and the global live event contract must not be substituted for a session replay contract. No event counts are asserted from test expectations as measured runtime facts.

## Evidence and limits

Full reads: `schema.ts`, `session-id.ts`, `session.ts`, `prompt.ts`, `prompt-input.ts`, `session-input.ts`, `session-delivery.ts`, `session-message.ts`, `event.ts`, `session-event.ts`, `session-status-event.ts`, `event-manifest.ts`, `durable-event-manifest.ts`, `location.ts`, and `model.ts`. Exact representative excerpts appear in `review-evidence.md`. The remaining Schema production modules are captured and literally indexed, with their internal semantics left unclaimed in `coverage.json`.

The compatibility, contract-hygiene, and event-manifest tests were read as source only. This packet does not assert that every current schema meets every guide rule, that all historical rows decode, or that schema generation/tests passed. Legacy persistence migration and domain-service behavior require the relevant Core sources and later accepted work.
END EXACT BODY

## Candidate s1.api.session-contract

Metadata (exact fragment fields):
```json
{
  "key": "s1.api.session-contract",
  "title": "Session HTTP admission and pages",
  "layer": 1,
  "need": "flow",
  "authority": {
    "scope": "orchestra.s1",
    "basis": "Exact pinned source observations for the bounded L1 claims; assigned population metadata for explicit inventory-only disposition.",
    "authorized_intent": "Root and Schema AGENTS guidance and attributed README/architecture descriptions are intent; current source declarations and implementation are observed separately.",
    "observation_limit": "Preserved source bytes and literal/excerpt inspection do not establish execution, judge acceptance, or runtime binding."
  },
  "validity": "supported",
  "gaps": [
    "No semantic judge acceptance or runtime receipt yet; downstream L2-L4 work remains gated.",
    "No local product tests, generation, builds, or runtime operations were executed.",
    "Core persistence, scheduling, execution and recovery internals are delegated boundaries, not independently proven here."
  ],
  "build_dependencies": [],
  "body": {
    "path": "bodies/session-contract.md",
    "encoding": "utf-8",
    "byte_length": 5130,
    "sha256": "f0b4af4b966886be0858cc9ab27c8ec1f481ef8093018a567d8e08b071c52db5"
  }
}
```

BEGIN EXACT BODY
# L1: session HTTP admission, pages, and handler delegation

Key: `s1.api.session-contract`. Source pin: `1cde2ff7a71bcf7aecb5d030917b577165135d38`. The sources are Protocol declarations and Server adapters. Descriptions of Core work below are attributed to the declared contract or direct delegation, not an independently executed Core lifecycle.

## Declared request and response boundary

| Operation | Observed contract |
| --- | --- |
| `POST /api/session` | Optional ID, agent, model, and location; returns `{data: Session.Info}`. The handler supplies current working directory when the request omits location. |
| `GET /api/session` | Filterable session page with `{data, cursor: {previous, next}}`; handler defaults limit to 50. Cursor state preserves filters and an anchor while the current request supplies its page limit. |
| `GET /api/session/active` | Reports process-local foreground drains, as session IDs mapped to `{type: "running"}`. It is not declared as a fleet-wide scheduler view. |
| `POST /api/session/:sessionID/prompt` | Takes optional message ID, `PromptInput.Prompt`, optional delivery, and optional resume; returns `{data: SessionInput.Admitted}`. |
| `GET /api/session/:sessionID/history` | Exclusive nonnegative `after` sequence and limit 1–100, default 50; returns durable events with `hasMore`. |
| `GET /api/session/:sessionID/event` | Durable session SSE after an optional exclusive sequence. Its replayable content differs from global live events. |
| `POST /api/session/:sessionID/interrupt` | No-content response; delegates interruption. The HTTP session-location check can return 404 before Core's idle-session behavior is reached. |
| `GET /api/session/:sessionID/message` | Separate message pagination with limit 1–200, default 50, default descending order, opaque cursors, and previous/next links. Cursor plus explicit order is rejected. |
| `GET /api/session/:sessionID/message/:messageID` | `{data: Message}`; missing or cross-session message returns `MessageNotFoundError`. |

The prompt handler forwards the request fields to `session.prompt`. It maps `PromptConflictError` and `PromptBlocked` to the declared 409 conflict shape. The protocol describes admission separately from execution, including optional resume. This source supports the API admission result and adapter mapping; it does not on its own prove transactional persistence, crash recovery, scheduling, or exactly-once execution inside Core.

Command admission resolves and renders a slash command, applies any resolved agent/model choices, combines attachments, and calls the prompt path. Missing command resolution maps to an invalid request; an MCP-backed command failure is logged and returned as an unknown server error. Explicit agent/model switching, rename, archive, and remove use their declared no-content responses. Archive is described as a visibility toggle without stopping execution. Recursive history removal and interruption on delete are declared responsibilities delegated to Core.

## Error and location behavior

`SessionLocationMiddleware` decodes the session ID, loads the stored directory/workspace from the session table, fails with `SessionNotFoundError` when absent, and provides the location service map from that stored identity. It does not use a caller's arbitrary location selection to redirect an existing session. The general location middleware remains appropriate for non-session-scoped operations.

The context adapter maps message-decode failures to a logged generic `UnknownError` with a reference. Compact maps a busy session to conflict and a run failure to an unknown error. Subagent-policy handling maps storage/invalid-chain/model-denial categories to service-unavailable responses. These are specific mappings in the inspected handler, not a blanket statement that every Core error becomes the same HTTP status.

Session history is a finite page with an exclusive sequence cursor. The source does not establish a stable snapshot across later page requests. The live session route passes its stream through `Stream.orDie`; a failure after stream establishment is not thereby converted to a normal JSON HTTP error. The streaming body documents this separately.

## Broader session surface and gaps

The source also declares fork/move, shell, skill/synthetic input, tool-less generation, todo, wait, diff/revert, background work, and process operations. The full session group and handler were read, and the literal route index preserves their names. This L1 body intentionally does not turn every delegated service into an end-to-end behavioral guarantee. Message assembly, database transactions, model admission policy, move ownership, background execution, and recovery need their domain owners' evidence.

Primary evidence: `packages/protocol/src/groups/session.ts`, `groups/message.ts`, Server `handlers/session.ts`, `handlers/message.ts`, `middleware/session-location.ts`, and Schema session/input/message definitions. `review-evidence.md` contains the decisive exact excerpts. No server was started and no session, provider, database, or HTTP exercise was executed.
END EXACT BODY

## Candidate s1.api.server-edge

Metadata (exact fragment fields):
```json
{
  "key": "s1.api.server-edge",
  "title": "Server errors, authorization and location",
  "layer": 1,
  "need": "operational",
  "authority": {
    "scope": "orchestra.s1",
    "basis": "Exact pinned source observations for the bounded L1 claims; assigned population metadata for explicit inventory-only disposition.",
    "authorized_intent": "Root and Schema AGENTS guidance and attributed README/architecture descriptions are intent; current source declarations and implementation are observed separately.",
    "observation_limit": "Preserved source bytes and literal/excerpt inspection do not establish execution, judge acceptance, or runtime binding."
  },
  "validity": "supported",
  "gaps": [
    "No semantic judge acceptance or runtime receipt yet; downstream L2-L4 work remains gated.",
    "No local product tests, generation, builds, or runtime operations were executed.",
    "No runtime authorization, location, provider or socket checks; PTY output queue is unbounded in source."
  ],
  "build_dependencies": [],
  "body": {
    "path": "bodies/server-edge.md",
    "encoding": "utf-8",
    "byte_length": 5106,
    "sha256": "f4b99d7a6bafb6a6aa672eeb5a63aa7621a14e65cfe863fe0f9d9eb36e0981de"
  }
}
```

BEGIN EXACT BODY
# L1: server errors, authorization, and location selection

Key: `s1.api.server-edge`. Source pin: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Error declarations and composition

`packages/protocol/src/errors.ts` declares tagged errors with HTTP annotations: invalid request/cursor 400; unauthorized 401; forbidden 403; conflict 409; service unavailable 503; unknown error 500; and domain-specific not-found errors at 404, including provider, session, message, permission, question, PTY, and MCP server. Optional details such as invalid-request kind/field, conflict resource, service name, and unknown-error reference remain part of their individual schemas.

Protocol's `makeDefaultApi` assembles groups and accepts middleware keys supplied by its caller. Server installs real location services. General authorization and schema-error middleware are applied at API composition; the source comments and placement explicitly put authentication before caller-selected location. Capability groups add capability authorization before location work. The API does not apply identical location selection to every group: global/project/config/trust/board and session-scoped routes have deliberately different composition.

The schema-error adapter logs a reason truncated to 1,024 characters and returns an `InvalidRequestError` with kind. It does not expose an unbounded raw parser diagnostic. A defect outside the typed error mapping is not proven to receive this treatment.

## Authentication paths

`ServerAuth` reads an optional server password and a username defaulting to `orchestra`. General authorization passes through when no nonempty password is configured. With a password, it validates Basic credentials. Query credentials are considered only for the explicitly recognized global event, session event, and PTY connect paths. Ordinary API calls use headers.

Two recognized ticket URL forms bypass the general Basic gate so their handlers can validate the ticket: PTY connect tickets and capability content tickets. The URL shape is not itself authorization. PTY ticket issuance requires the special ticket-request header, an allowed origin, and an existing PTY. Connection consumes a ticket bound to the PTY and location context, or fails; the raw upgrade handler owns that path. Capability content verifies its ticket, enters the minted request authority, and reauthorizes through artifact management so revocation still matters. An invalid ticket receives an unauthorized empty response; unavailable artifacts map separately.

Capability authorization has its own authority model. When Basic authentication is required it validates the configured operator credentials. Otherwise it requires a 43-character bearer token. Caller-supplied identity fields do not grant authority. The middleware validates the idempotency header shape, enters a request context with an authority and request ID, maps authentication-required/revoked failures to 401 and other capability refusals to 403, and preserves unrelated causes. This body describes adapter behavior, not a security audit of the full capability store or token implementation.

The server principal uses operating-system account identity with a local fallback; a Basic username does not create independent per-person accounts. SDK embedding explicitly supplies no Basic password, but still uses capability authority as described in the SDK body.

## Location and service boundary

General location selection reads `location[directory]`, otherwise uses current working directory, and reads workspace from the query or `x-orchestra-workspace`. Missing directories map to invalid request with `location_not_found`; typed failed boots map to `location_unavailable`; defects remain defects. Existing cached services can still be supplied. Session middleware instead loads the directory/workspace stored for the session and fails 404 when the session is absent.

Model and provider handlers obtain availability from the host catalog. The inspected model handler combines available catalog models with additional enabled models while avoiding duplicate IDs, and selects the preferred/default model or null. Provider account/sign-in endpoints are typed operations; their presence does not imply that a credential was obtained or an external request succeeded here.

## Evidence and explicit limits

Full reads cover Protocol `api.ts`, `errors.ts`, the three middleware tag modules, relevant PTY/capability declarations, Server `auth.ts`, `principal.ts`, `location.ts`, `routes.ts`, the four middleware implementations, and PTY/capability/model/provider handlers. Exact excerpts are in `review-evidence.md` and the source manifest binds the entire bytes.

No authentication request, origin check, provider operation, file read, socket upgrade, or runtime test was performed. The PTY handler explicitly uses an unbounded outgoing queue and retains a shutdown-tracking TODO; slow-reader memory growth is a real source-level limit, not a measured failure in this run. Other domain handlers are indexed rather than silently granted full semantic acceptance.
END EXACT BODY

## Candidate s1.api.stream-contract

Metadata (exact fragment fields):
```json
{
  "key": "s1.api.stream-contract",
  "title": "Live SSE and durable session streams",
  "layer": 1,
  "need": "flow",
  "authority": {
    "scope": "orchestra.s1",
    "basis": "Exact pinned source observations for the bounded L1 claims; assigned population metadata for explicit inventory-only disposition.",
    "authorized_intent": "Root and Schema AGENTS guidance and attributed README/architecture descriptions are intent; current source declarations and implementation are observed separately.",
    "observation_limit": "Preserved source bytes and literal/excerpt inspection do not establish execution, judge acceptance, or runtime binding."
  },
  "validity": "supported",
  "gaps": [
    "No semantic judge acceptance or runtime receipt yet; downstream L2-L4 work remains gated.",
    "No local product tests, generation, builds, or runtime operations were executed.",
    "No replay/overflow/network experiment; global live readiness is not durable replay or automatic reconnect."
  ],
  "build_dependencies": [],
  "body": {
    "path": "bodies/stream-contract.md",
    "encoding": "utf-8",
    "byte_length": 3824,
    "sha256": "d1f68eb106131ba1efd61c4157b91826a25b176ab87ff74defc140ef9f4d67d8"
  }
}
```

BEGIN EXACT BODY
# L1: global live SSE and durable session streams

Key: `s1.api.stream-contract`. Source pin: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Two event contracts

| Boundary | Source-supported behavior | Limit |
| --- | --- | --- |
| Global `GET /api/event` | Public server event schema; live subscription, connected readiness frame, heartbeat comments | No replay cursor or reconnect guarantee is established. |
| Session `GET /api/session/:sessionID/event` | Durable session event schema after an exclusive sequence | Live-only deltas are absent from the durable inventory. Core implements the actual replay/live bridge. |
| Session history | Finite durable page plus `hasMore` | It is not the global live feed and does not promise a cross-page snapshot. |

`packages/server/src/handlers/event.ts` creates a per-handler WeakMap frame cache keyed by event payload object. A repeated payload object is encoded once and the cached frame is shared across subscribers. Frames use event `message` and no SSE event ID. The function is an observed implementation mechanism; no performance measurement was taken.

`eventStream` obtains `EventV2.allBounded(events, 4096)` before producing `server.connected`, so a consumer observing readiness has already acquired its live subscription. The stream concatenates the connected frame and live events, merges 15-second heartbeat comments, and halts the merge when the primary side ends. The response sets `text/event-stream`, `no-cache, no-transform`, `X-Accel-Buffering: no`, and `X-Content-Type-Options: nosniff`. Capacity 4,096 is a declared subscription bound, not a proof that slow subscribers can never lose data or that a remote proxy honors these headers.

The session handler delegates `session.events(sessionID, after)` and uses `Stream.orDie`. A pre-stream missing session can be returned through middleware as 404; a stream defect after response establishment is not converted into a later JSON response. The schema manifests explicitly distinguish all session events from durable session events. Clients resuming durable work must use aggregate sequence semantics, not assume that global message frames supply resumable SSE IDs.

## Client consumption boundary

The generated Promise client returns a lazy async iterable: opening/reading the stream happens during iteration. It checks the SSE content type and response body, decodes chunks, joins multi-line data, normalizes CRLF, parses JSON data, and cancels/releases the reader in `finally`. It limits its buffered string to 1,048,576 characters. That is a character-length guard, not a stated byte or event-count bound. No automatic reconnect/resume loop is implemented by this inspected transport.

The Effect projection uses the imported HttpApi contract and exposes Effect streams with decoded schema values. Its generated mapping converts recognized HTTP, schema, and SSE retry transport failures into `ClientError`, while preserving unrelated typed errors. The Promise reader validates JSON syntax but does not run the complete schema decoder over each successful event.

## Evidence and gaps

Exact primary files: Schema `event.ts`, `session-event.ts`, `event-manifest.ts`; Protocol `groups/event.ts`, `groups/session.ts`; Server `handlers/event.ts`, `handlers/session.ts`; Client generated Promise stream runtime and generated Effect methods. The generator's imported Effect adapter is also captured.

The server event-stream test was read: it uses a stand-in event bus with the actual stream helper to exercise readiness, a burst, and encoding reuse. It was not run. Client stream tests likewise provide intended assertions, not observed results. Queue-overflow behavior and replay continuity inside Core, network disconnects, proxies, and deployed clients remain outside this artifact's demonstrated behavior.
END EXACT BODY

## Candidate s1.api.client-projection

Metadata (exact fragment fields):
```json
{
  "key": "s1.api.client-projection",
  "title": "Client projections and raw transfer boundary",
  "layer": 1,
  "need": "component",
  "authority": {
    "scope": "orchestra.s1",
    "basis": "Exact pinned source observations for the bounded L1 claims; assigned population metadata for explicit inventory-only disposition.",
    "authorized_intent": "Root and Schema AGENTS guidance and attributed README/architecture descriptions are intent; current source declarations and implementation are observed separately.",
    "observation_limit": "Preserved source bytes and literal/excerpt inspection do not establish execution, judge acceptance, or runtime binding."
  },
  "validity": "supported",
  "gaps": [
    "No semantic judge acceptance or runtime receipt yet; downstream L2-L4 work remains gated.",
    "No local product tests, generation, builds, or runtime operations were executed.",
    "Generated freshness unverified; most generated modules are inventory-only.",
    "generated/types.ts is 462732 bytes; current runtime observer refuses inputs above 256000 bytes, so its binding remains unresolved.",
    "README raw-file omission conflicts with generated fs.read; handwritten upload route lacks a corresponding declaration in the inspected Actions transfer group/handler."
  ],
  "build_dependencies": [],
  "body": {
    "path": "bodies/client-projection.md",
    "encoding": "utf-8",
    "byte_length": 5193,
    "sha256": "089304921b004984de3b15b75af18fea3c7ebf15191f3874e9f668066569d478"
  }
}
```

BEGIN EXACT BODY
# L1: Client projections and raw transfer boundary

Key: `s1.api.client-projection`. Source pin: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Shared contract, different value models

The Client package constructs `ClientApi` from Protocol with local location middleware tags and matching error declarations. Product group/endpoint names and omissions live in `src/contract.ts`; generated output is not the authoring authority. The public Promise entrypoint exports generated clients and the handwritten transfer extension. The Effect entrypoint uses the generated imported-contract adapter. Schema/Protocol types are allowed at this boundary; Core/Server runtime imports are prohibited by root maintenance authority.

The Promise projection returns encoded wire values. For example, timestamps are epoch numbers. Its `wire.ts` exposes the encoded durable-session event view. The imported Effect projection runs the actual API schema codecs, returning decoded Effect values such as DateTime. These projections must not be described as interchangeable merely because their method groups match.

The build explicitly omits six names: `pty.connect`, `pty.connectToken`, `actions.transfer.read`, `actions.transfer.upload`, `capability.artifact.content`, and `capability.content.read`. This is policy input, not proof that every omitted name is present in the current reflected API. Current Actions transfer Protocol/Server sources expose info and download; the handwritten upload extension targets an upload route without a corresponding declaration in that inspected group/handler. Its server support is unproved here.

The README says raw file reads are omitted, but `fs.read` is absent from the actual omission set. Protocol declares it as Uint8Array, and generated `files.read` is emitted with `binary: true`. The current generated source therefore supports a binary file-read method; documentation and implementation disagree at this pin. No source was edited to reconcile the disagreement.

## Promise transport and errors

The inspected runtime composes URL/path/query values, applies client then endpoint then request headers, encodes JSON bodies, and invokes fetch. It distinguishes transport failures, malformed responses, unsupported content types, unexpected statuses, and declared JSON error statuses through `ClientError` plus declared error shapes. A declared error response is parsed and thrown; this code does not independently validate its full declared schema.

JSON success requires a JSON or `+json` media type, nonempty well-formed JSON, and maps read failures into transport errors. No-content cancels any response body and returns undefined. Binary success reads an ArrayBuffer into Uint8Array, but that await is not wrapped by the JSON reader's catch; this packet does not claim that every binary-body failure becomes a `ClientError`. The SSE reader is described in the streaming artifact.

The imported Effect emitter calls `HttpApiClient.make` with the authoritative API value, preserving transformations rather than serializing guessed codecs. Its client-error mapping preserves unrelated errors. Default header snapshots are validated/frozen; unsafe descriptors, invalid header names/values, and CRLF are rejected by the implementation. A default content type is removed for FormData unless explicitly supplied by the request.

## Handwritten streaming transfers

`actions-transfer.ts` shares base URL/fetch/header configuration with the generated client but keeps successful response bodies streaming. The caller owns response-body consumption and cancellation. Requests use manual redirect handling so credentials are not automatically forwarded to a provider-signed redirect. Upload accepts streaming bodies through a duplex support probe and returns an explicit unsupported-streaming reason when the probe fails; this source probe is not a cross-browser compatibility result.

Transfer errors use bounded capture: at most 16 KiB and a five-second read deadline, with truncation and structured reasons retained. They preserve an unknown-outcome state and parse retry information. This specialized error contract is not identical to every generated endpoint's declared error union.

## Evidence and gaps

Full reads: `src/contract.ts`, `src/index.ts`, `src/effect.ts`, `src/wire.ts`, handwritten transfer/error files, build script, package manifest, README, small generated request/client-error modules and both generation manifests. Representative regions of the large generated clients were read; `generated/types.ts` and `generated/errors.ts` were captured without claiming full semantic inspection. Their identities and all omitted generated family members remain explicit in coverage.

`generated/types.ts` is 462,732 bytes. The protocol's current runtime input observer refuses files over 256,000 bytes, so faithful runtime binding of that input needs an explicit later solution. The source is retained and not split to evade the boundary. No code generation, type conformance test, Promise/Effect test, transfer request, or browser execution occurred. Source-supported projection claims do not certify generated-output freshness or client interoperability.
END EXACT BODY

## Candidate s1.api.codegen

Metadata (exact fragment fields):
```json
{
  "key": "s1.api.codegen",
  "title": "HTTP client generation authority",
  "layer": 1,
  "need": "maintenance",
  "authority": {
    "scope": "orchestra.s1",
    "basis": "Exact pinned source observations for the bounded L1 claims; assigned population metadata for explicit inventory-only disposition.",
    "authorized_intent": "Root and Schema AGENTS guidance and attributed README/architecture descriptions are intent; current source declarations and implementation are observed separately.",
    "observation_limit": "Preserved source bytes and literal/excerpt inspection do not establish execution, judge acceptance, or runtime binding."
  },
  "validity": "supported",
  "gaps": [
    "No semantic judge acceptance or runtime receipt yet; downstream L2-L4 work remains gated.",
    "No local product tests, generation, builds, or runtime operations were executed.",
    "Regeneration/freshness and generator test fixtures were not executed.",
    "Line-bounded selected type modules do not guarantee every generated input is below the runtime observer byte limit."
  ],
  "build_dependencies": [],
  "body": {
    "path": "bodies/codegen.md",
    "encoding": "utf-8",
    "byte_length": 4752,
    "sha256": "2ec55afad54a871de673a252b6b7c604a8ecdb648cc1df9c80128d83a3f8e270"
  }
}
```

BEGIN EXACT BODY
# L1: HTTP client generation authority and failure boundaries

Key: `s1.api.codegen`. Source pin: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Regeneration authority

Root `AGENTS.md` requires regeneration after public Protocol or Server HttpApi changes and prohibits manual edits under Client `src/generated` and `src/generated-effect`. Client `package.json` defines `generate` as its build script, and `check:generated` as generation followed by a Git diff check of those two directories. The maintenance action is `bun run generate` from `packages/client`; it was not executed during this evidence task.

`packages/client/script/build.ts` compiles one reflected contract from `ClientApi`, product group/endpoint naming functions, and the omission set. It emits a Promise product and an Effect imported-contract product. It supplies selected encoded event type references, a configured set of split groups, and output paths. Filesystem services are used by this build-time script, not proof that the generated browser transport imports the Server runtime.

The generic `tooling/httpapi-codegen` package owns compile/emitter/writer behavior. Product naming and endpoint policy remain in Client. The generic README's separation of policy from generation does not mean the compiler lacks an omission parameter; Client deliberately supplies one.

## Compiler constraints

The compiler reflects the HttpApi definition. It rejects required client middleware without a supplied adapter; accepts a single success schema (defaulting an absent one to no content); rejects multiple success or payload schemas; and flattens params/query/headers/payload into one public input object. Those inputs must be supported object shapes, and duplicate field names are rejected. It derives no-input, optional-input, or required-input signatures from the actual fields.

Only an exact `{data: A}` success envelope is unwrapped. Responses with location, pagination cursors, or `hasMore` retain their envelopes. Public name collisions are rejected. This is an explicit generator rule, not a general rule that every API response is unwrapped.

The Promise emitter supports JSON payloads, JSON/no-content/binary success, and supported SSE forms; declared transport errors must have supported JSON/tagged shapes. Structural type emission has explicit unsupported cases, including recursive references. The Effect imported mode imports the original API value so codecs and transformations remain authoritative. A portable emitter cannot silently reconstruct unsupported transformations and is allowed to fail.

## Output ownership and layout

The writer validates flat safe filenames, rejects path traversal/reserved/absolute forms and case-folded name collisions, parses the previous ownership manifest, removes stale files only from that owned list, rejects output symlinks, formats with Prettier, and writes a sorted generation manifest. These safeguards establish intended file ownership. The observed procedure is not an atomic transaction: this packet makes no atomicity or crash-recovery claim for generation.

`layout.ts` splits selected oversized generated type modules at complete declaration boundaries with its configured line targets (400-line threshold, 350-line target in the inspected helper). This is not a global source byte-size ceiling. The actual generated main `types.ts` remains 462,732 bytes; the line-layout helper therefore does not solve the runtime observer's 256,000-byte input limit.

The preserved generated manifests list the exact producer-owned output names. Generated outputs are classified as a family with these manifests and the build script as authority. Representative clients and error/request modules were read; the other generated modules are inventory entries, not separately inferred semantic facts. The generator's test fixtures and generated fixture outputs are also grouped separately from production outputs.

## Evidence and gaps

Full generator reads: `src/index.ts`, `src/layout.ts`, `src/imported-effect.ts`, `src/effect-headers.ts`, `src/error-symbol.ts`, README and manifest. Product authority: Client build, contract, manifest, and root instruction. Exact compile, emitter, writer, layout, and generation-command excerpts are provided to the judges in `review-evidence.md`.

No build, generation, formatting run, test, or Git diff freshness check was executed. The captured generated output is evidence of the pin's bytes, not a locally reproduced result. Browser transitive imports, codegen compatibility across Effect upgrades, filesystem failure behavior, and all unsupported-schema branches need their own real checks when that work is authorized. No fabricated build dependency or runtime version is supplied here.
END EXACT BODY

## Candidate s1.api.sdk-composition

Metadata (exact fragment fields):
```json
{
  "key": "s1.api.sdk-composition",
  "title": "Embedded SDK and operator transport",
  "layer": 1,
  "need": "component",
  "authority": {
    "scope": "orchestra.s1",
    "basis": "Exact pinned source observations for the bounded L1 claims; assigned population metadata for explicit inventory-only disposition.",
    "authorized_intent": "Root and Schema AGENTS guidance and attributed README/architecture descriptions are intent; current source declarations and implementation are observed separately.",
    "observation_limit": "Preserved source bytes and literal/excerpt inspection do not establish execution, judge acceptance, or runtime binding."
  },
  "validity": "supported",
  "gaps": [
    "No semantic judge acceptance or runtime receipt yet; downstream L2-L4 work remains gated.",
    "No local product tests, generation, builds, or runtime operations were executed.",
    "Embedded tests were read but not run; Core lifecycle/recovery and all concurrency isolation remain unproven."
  ],
  "build_dependencies": [],
  "body": {
    "path": "bodies/sdk-composition.md",
    "encoding": "utf-8",
    "byte_length": 3478,
    "sha256": "a2cb2fc21fc1a771d81cd83e75dfe8b07c82c1712b15396ff4e40774f861d4d3"
  }
}
```

BEGIN EXACT BODY
# L1: embedded SDK composition and operator transport

Key: `s1.api.sdk-composition`. Source pin: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Composition observed in source

SDK Next exposes a single public package entrypoint. `src/orchestra.ts` uses its caller's Effect scope and creates a shared layer memo map, supplies application tools, saved permission and account services, and composes Server routes with Core services. It creates an operator for the local principal with an instance placement scope and wildcard action allowance, then constructs the SDK transport around that authority. This call supplies no additional host contributions.

The embedded path calls `HttpRouter.toWebHandler` over `createEmbeddedRoutes`, acquires/releases the web handler, and invokes its disposer on release. It replaces `FetchHttpClient.Fetch` with the local transport's fetch implementation and uses `http://orchestra.local` as the client base URL. It returns the resulting client methods plus the tool registration interface.

This path does not create a TCP listener. It still executes real Core/Server services through a local HTTP request/response boundary, so “embedded” does not mean providers, tools, databases, or files cannot perform I/O. Server's embedded route construction deliberately disables Basic-password authentication. Capability operator authorization remains active.

## Authority refresh and explicit credentials

`src/operator-transport.ts` issues an SDK-origin credential, freezes the default Authorization header, and forwards requests to the local handler. It changes only a request whose Authorization value still exactly matches the initially issued default bearer. Explicit alternate credentials remain the caller's choice.

A one-permit semaphore serializes refresh. The transport authenticates the current credential; only a pure `CapabilityFailure` of `authentication_required` triggers renewal. Other failures propagate. After renewal it updates the matching request header before invoking the local handler. This is a narrow refresh path, not a promise to recover every revoked, forbidden, malformed, or failed request automatically.

The principal is based on operating-system account identity through the server helper, with a local fallback. Basic usernames do not imply independent local authorization accounts. Host merge rejects reserved service replacements and duplicate composition as described in the boundary artifact; this source supports deliberate reuse of server composition rather than an independently reimplemented session service.

## Evidence and intended checks

Full reads: SDK `src/index.ts`, `src/orchestra.ts`, `src/operator-transport.ts`, README, package manifest, embedded test, and import-boundary test; plus Server `routes.ts`, `principal.ts`, `auth.ts`, relevant authorization modules, and Core `host.ts`. Exact excerpts are in `review-evidence.md`.

The embedded tests contain intended checks for admit-only prompts, waking execution, durable event sequences, missing-session errors, and host instance isolation. Those tests were inspected, not executed. This packet does not assert test passage, real model execution, durable recovery, or host isolation under every concurrency pattern. The separate operator transport tests in the assigned population were inventoried but not read. L1 source support ends at the composition and branching shown above; lifecycle claims need accepted Core and runtime evidence.
END EXACT BODY

## Candidate s1.api.surface-disposition

Metadata (exact fragment fields):
```json
{
  "key": "s1.api.surface-disposition",
  "title": "Assigned API population and evidence depth",
  "layer": 1,
  "need": "entry",
  "authority": {
    "scope": "orchestra.s1",
    "basis": "Exact pinned source observations for the bounded L1 claims; assigned population metadata for explicit inventory-only disposition.",
    "authorized_intent": "Root and Schema AGENTS guidance and attributed README/architecture descriptions are intent; current source declarations and implementation are observed separately.",
    "observation_limit": "Preserved source bytes and literal/excerpt inspection do not establish execution, judge acceptance, or runtime binding."
  },
  "validity": "supported",
  "gaps": [
    "No semantic judge acceptance or runtime receipt yet; downstream L2-L4 work remains gated.",
    "No local product tests, generation, builds, or runtime operations were executed.",
    "183 assigned entries are inventory-only; 190 captured source modules have literal surface depth, not full semantic reading.",
    "Required oversized generated input retained; no unavailable runtime observation is relabeled absent or supplied with a fabricated version."
  ],
  "build_dependencies": [],
  "body": {
    "path": "bodies/surface-disposition.md",
    "encoding": "utf-8",
    "byte_length": 5168,
    "sha256": "611b4ff21c0aa4bd1de072f0b16b6c2560a3446b2bad0b31271cd1f61807dbda"
  }
}
```

BEGIN EXACT BODY
# L1: assigned API population and evidence depth

Key: `s1.api.surface-disposition`. Source pin: `1cde2ff7a71bcf7aecb5d030917b577165135d38`. This artifact establishes disposition and reproducible source identity, not semantic acceptance of every implementation in the population.

## Population ownership

`population.json` supplies 472 assigned Git blobs: four architecture briefs; 76 Client entries; 65 Protocol entries; 124 Schema entries; 13 SDK Next entries; 157 Server entries; and 33 HTTP API codegen entries. `coverage.json` gives every assigned path exactly one primary family, kind, depth, justification, source-read status, need, and artifact key. Secondary artifact references retain useful overlaps without duplicating ownership.

The capture contains 291 exact sources: 289 assigned paths and two explicit boundary authorities, root `AGENTS.md` and `packages/core/src/host.ts`. All 252 handwritten production TypeScript modules under assigned `src/` trees are captured. The reading register distinguishes 97 full source reads, two generated-client representative reads, 190 literal surface-indexed sources, and two captured generated sources without semantic reading. These totals include the two boundary authorities. Capturing bytes or extracting imports does not imply full implementation review.

`surface-index.json` preserves literal import/export/endpoint/handler lines and source identity for 253 production modules: the 252 assigned modules plus Core's host boundary. It is a navigation and inspection aid. The associated family mapping identifies domain surfaces such as Actions, Atlas, Board, capability management, Relay, RAG Studio, scheduling, MCP, integration, meeting, permissions/questions, project, skills, and VCS. For modules outside the decisive session/transport/composition reads, this packet claims their declared names/import seams only. Their domain rules, database effects, and failure semantics remain unproved.

## Rational grouping

| Family | Treatment |
| --- | --- |
| Decisive Schema, Protocol, Server, Client, SDK and generator sources | Full reads feed the bounded factual bodies, with exact evidence excerpts. |
| Other handwritten production modules | Exact byte capture and literal surface index; implementation semantics not accepted by inventory. |
| Generated Client output | Build script, generic generator, and both output ownership manifests identify regeneration authority; selected output is representative, remaining entries are inventory-only. |
| Tests and exercise harnesses | Ten test files read as intended assertions; the remainder grouped by package and test/fixture/harness role. None executed. |
| Generator test fixture output | Test material, not the public Client generation product; grouped with generator verification support. |
| Package manifests, README, guides, architecture briefs | Manifests and guides inspected; historical briefs remain intent evidence. Unread config/support files are explicitly inventory-only. |

## Provenance and verification boundary

All remote source reads used the GitHub connector at the immutable source revision. Base64 contents were decoded unchanged into `sources/<repo path>`. Every manifest entry records commit, observed Git blob SHA, SHA-256, byte length, and capture path. The Git blob identity was recomputed from the preserved bytes, then source/body/coverage transport checks were performed locally. These checks validate artifact mechanics, not the product.

No local product test, package install, code generation, network server, provider call, remote mutation, or runtime importer was run. No reserved answer/oracle was read. No L2 predecessor is invented and no judge or runtime receipt is asserted. The fragment remains in progress until the parent performs the required two-judge review and subsequent exact binding.

## Gaps that remain visible

1. The 183 assigned paths without captured source content are classified from their complete pinned inventory metadata, not semantic reading. Grouped test/generated/support claims are deliberately limited.
2. Most domain production modules received surface indexing only. Their presence is accounted for, while deeper ownership questions require targeted reads or the relevant domain artifact.
3. Generated `types.ts` is 462,732 bytes, beyond the protocol's current runtime observer limit. Its required input is retained; the later binding must explicitly handle or remain blocked on that boundary.
4. Generated freshness, runtime import boundaries, HTTP interoperability, lifecycle behavior, and observed test outcomes remain unverified in execution.
5. The pinned client README disagrees with actual generation of binary `fs.read`; the handwritten Actions upload path lacks a matching declaration in the inspected Actions transfer group/handler; and public V2 annotations remain despite normalization intent. These are source mismatches, not silently repaired conclusions.

This body is supported for the bounded population/provenance statements above. It is not a substitute for acceptance of every assigned file, a complete end-to-end architecture, or a successful Atlas runtime binding.
END EXACT BODY

BEGIN EXACT COMPACT SOURCE EVIDENCE
# Compact exact review evidence

All source below is from commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`. This is an economic projection of the preserved full `review-evidence.md`, SHA-256 `e83ac99c3f78c23dfb5f6c1c597796e6fa8857b4b9f73f3003e613094a4729c9`. Ranges are inclusive. Code-fence contents are copied unchanged; gaps between ranges are explicit. No source was rewritten and no test was executed. The full source manifest and full evidence archive remain available for follow-up.

## Artifact → exact source map

- `s1.api.boundaries`: C01, C02, C03, C04, C05, C06, C07, C08, C09, C10, C11, C12.
- `s1.api.client-projection`: C06, C10, C17, C34, C35, C36, C37, C38, C39, C42, C43.
- `s1.api.codegen`: C01, C06, C08, C40, C41, C42, C43, C44.
- `s1.api.schema-contracts`: C02, C13, C14, C15, C16, C17, C18, C19, C20.
- `s1.api.sdk-composition`: C07, C12, C45, C46, C47.
- `s1.api.server-edge`: C05, C09, C24, C25, C26, C27, C28, C29, C30, C31, C32, C47.
- `s1.api.session-contract`: C16, C21, C22, C23, C24.
- `s1.api.stream-contract`: C18, C19, C20, C33, C34.
- `s1.api.surface-disposition`: P1.

## P1 — population and fidelity observations

The source manifest has 291 captures: 289 of 472 assigned files plus root AGENTS and Core host. All 252 assigned handwritten production src/*.ts modules are preserved; the literal surface index has 253 modules including Core host. Read register: 97 full source reads, 2 representative generated reads, 190 literal surface-indexed sources, 2 captured without semantic reading. The other 183 assigned paths remain inventory-only. The local checks validate source bytes, inventory identity, coverage bijection, excerpt/body hashes and transport shape; they do not validate the product or grant semantic acceptance.

Required generated input `packages/client/src/generated/types.ts`: 462732 bytes, Git blob `fca4633666a639d550065312a13e48c6ce221d12`, SHA-256 `2763d389d2694a6737719865cbabbbdfee937d81a86497b783c246cdaf76ef0f`. The protocol's current 256,000-byte observer limit remains an unresolved binding boundary. This is captured-but-unread source, not an accepted semantic type inventory. The two output manifests in the full archive establish 40 Promise output names and 14 Effect output names; generated members are not all semantically read.

The three source discrepancies are kept visible: README raw-file omission versus generated binary fs.read; handwritten upload path versus the inspected two-operation Actions transfer group/handler; V2 identifiers versus unversioned guide intent. No regeneration, bundler, HTTP request, model turn, judge acceptance or runtime binding is asserted.

## C01 — `AGENTS.md`

Git blob `ef3b523b0c00aed722582b870c1919188edc4c4f`.

Lines 1–2:

```
- After changing the public Protocol or Server `HttpApi`, run `bun run generate` from `packages/client`. Do not edit `src/generated` or `src/generated-effect` directly.
- Keep runtime dependencies directed from Schema to Core and Protocol, then from Core and Protocol to Server. Client runtime code may depend on Schema and Protocol but never Core or Server; `sdk-next` composes Client, Core, and Server.
```

## C02 — `packages/schema/AGENTS.md`

Git blob `88ff8b244e3fca3c8b23950514b7eff3cf37e85b`.

Lines 3–3:

```
`@orchestra/schema` owns browser-safe wire and storage contracts shared by protocol, server, core, and generated SDKs. Keep runtime behavior, service layers, side effects, and host-local implementation details in the domain package that owns them.
```

Lines 14–14:

```
- Contracts are unversioned: use names like `Session`, `Permission`, `Question`, and identifiers like `Permission.Request`.
```

Lines 28–28:

```
- Core may compose Schema contracts with runtime behavior into a deliberate domain facade, but the facade must re-export the exact canonical Schema value. Do not create a second schema identity.
```

Lines 41–41:

```
- Use the package `optional(...)` helper for optional object properties, including nested structs and event payloads, so encoded objects omit `undefined` keys.
```

## C03 — `packages/schema/package.json`

Git blob `ecf66e31d4fe2d72b2e503a978cedaf09db0080f`.

Lines 122–124:

```
  "dependencies": {
    "effect": "catalog:"
  },
```

## C04 — `packages/protocol/package.json`

Git blob `517e462e6c645c726c26b9027d03ee55d6bc2dfc`.

Lines 69–72:

```
  "dependencies": {
    "@orchestra/schema": "workspace:*",
    "effect": "catalog:"
  },
```

## C05 — `packages/server/package.json`

Git blob `1e2d83907eaac06d0da1571ac7ceab9f528102b7`.

Lines 36–45:

```
  "dependencies": {
    "@orchestra/core": "workspace:*",
    "@orchestra/llm": "workspace:*",
    "@orchestra/protocol": "workspace:*",
    "@orchestra/rag-studio": "workspace:*",
    "@orchestra/relay": "workspace:*",
    "@orchestra/schema": "workspace:*",
    "drizzle-orm": "catalog:",
    "effect": "catalog:"
  },
```

## C06 — `packages/client/package.json`

Git blob `4cd0244e98ff18b5e65d3c2808196705095b6691`.

Lines 7–10:

```
  "exports": {
    ".": "./src/index.ts",
    "./effect": "./src/effect.ts",
    "./contract": "./src/contract.ts"
```

Lines 13–14:

```
    "generate": "bun run script/build.ts",
    "check:generated": "bun run generate && git diff --exit-code -- src/generated src/generated-effect",
```

Lines 18–29:

```
  "dependencies": {
    "@orchestra/schema": "workspace:*",
    "@orchestra/protocol": "workspace:*"
  },
  "peerDependencies": {
    "effect": "4.0.0-beta.83"
  },
  "peerDependenciesMeta": {
    "effect": {
      "optional": true
    }
  },
```

## C07 — `packages/sdk-next/package.json`

Git blob `7b96125b9aa768181cc99c19028659e6d9e72da3`.

Lines 7–9:

```
  "exports": {
    ".": "./src/index.ts"
  },
```

Lines 14–21:

```
  "dependencies": {
    "@orchestra/client": "workspace:*",
    "@orchestra/core": "workspace:*",
    "@orchestra/protocol": "workspace:*",
    "@orchestra/schema": "workspace:*",
    "@orchestra/server": "workspace:*",
    "effect": "catalog:"
  },
```

## C08 — `tooling/httpapi-codegen/package.json`

Git blob `72c383d240c98fbc21e463cb60b3b3533fbd7553`.

Lines 13–16:

```
  "dependencies": {
    "effect": "catalog:",
    "prettier": "3.6.2"
  },
```

## C09 — `packages/protocol/src/api.ts`

Git blob `40b5b5bd266b8a9bd3893f74d5429bf535dc01d7`.

Lines 59–59:

```
// Protocol owns middleware placement, while Server injects concrete keys so Core service identities stay downstream.
```

Lines 73–79:

```
    .add(LocationGroup.middleware(locationMiddleware))
    .add(AgentGroup.middleware(locationMiddleware))
    .add(makeSessionGroup(sessionLocationMiddleware))
    .add(makeResearchArtifactGroup(sessionLocationMiddleware))
    .add(MessageGroup.middleware(sessionLocationMiddleware))
    .add(ModelGroup.middleware(locationMiddleware))
    .add(ProviderGroup.middleware(locationMiddleware))
```

Lines 121–126:

```
    // Last-applied middleware runs first: authenticate before caller-selected Location construction.
    .add(makeCapabilityOperatorGroup(locationMiddleware))
    .add(makeCapabilityConnectionsGroup(locationMiddleware))
    .add(makeCapabilityArtifactsGroup(locationMiddleware))
    .add(makeCapabilitySchedulesGroup(locationMiddleware))
    .add(CapabilityContentGroup)
```

Lines 134–135:

```
    .middleware(Authorization)
    .middleware(SchemaErrorMiddleware)
```

## C10 — `packages/client/src/contract.ts`

Git blob `1dccaeb657cc106b7a8cba93f5f5c34a8faf8680`.

Lines 1–5:

```
import { makeDefaultApi } from "@orchestra/protocol/api"
import { InvalidRequestError, SessionNotFoundError } from "@orchestra/protocol/errors"
import { HttpApiMiddleware } from "effect/unstable/httpapi"

class LocationMiddleware extends HttpApiMiddleware.Service<LocationMiddleware>()(
```

Lines 10–19:

```
class SessionLocationMiddleware extends HttpApiMiddleware.Service<SessionLocationMiddleware>()(
  "@orchestra/client/SessionLocationMiddleware",
  { error: [InvalidRequestError, SessionNotFoundError] },
) {}

export const ClientApi = makeDefaultApi({
  locationMiddleware: LocationMiddleware,
  sessionLocationMiddleware: SessionLocationMiddleware,
})

```

Lines 119–126:

```
export const omitEndpoints = new Set([
  "pty.connect",
  "pty.connectToken",
  "actions.transfer.read",
  "actions.transfer.upload",
  "capability.artifact.content",
  "capability.content.read",
])
```

## C11 — `packages/server/src/api.ts`

Git blob `e1ab621208cf063ff1ce846ded0205e9b8dae93e`.

Lines 1–8:

```
import { makeDefaultApi } from "@orchestra/protocol/api"
import { LocationMiddleware } from "./location"
import { SessionLocationMiddleware } from "./middleware/session-location"

export const Api = makeDefaultApi({
  locationMiddleware: LocationMiddleware,
  sessionLocationMiddleware: SessionLocationMiddleware,
})
```

## C12 — `packages/core/src/host.ts`

Git blob `a0fc5bc9a36e50315b0ddddf4de3566555711250`.

Lines 40–56:

```
const reserved = [SessionExecution.node, SessionV2.node, LocationServiceMap.node, ScheduledTask.node, ScheduledTask.daemonNode]

/** Flatten contributions in order; synchronous because it only validates data. */
export function merge(contributions: ReadonlyArray<Contribution>) {
  const duplicate = repeated(contributions.map((item) => item.id))
  if (duplicate) throw new Error(`Host contribution id is not unique: ${duplicate}`)
  const replacements = contributions.flatMap((item) => item.replacements ?? [])
  const nodes = contributions.flatMap((item) => item.nodes ?? [])
  const locationNodes = contributions.flatMap((item) => item.locationNodes ?? [])
  const claimed = [...replacements.map(([source]) => source), ...nodes].find((node) => reserved.some((owned) => owned.name === node.name))
  if (claimed) throw new Error(`Host contribution may not own ${claimed.name}`)
  const node = repeated(nodes.map((item) => item.name))
  if (node) throw new Error(`Host contribution node is not unique: ${node}`)
  // A contributed Location node may not shadow a built-in one either; changing a built-in is a replacement.
  const builtIn = new Set(locationServices.dependencies.map((item) => item.name))
  const location = repeated(locationNodes.map((item) => item.name)) ?? locationNodes.find((item) => builtIn.has(item.name))?.name
  if (location) throw new Error(`Host contribution Location node is not unique: ${location}`)
```

## C13 — `packages/schema/src/schema.ts`

Git blob `d19a39b9708cfcaeedc1d7c62503afbadfee5dd7`.

Lines 6–16:

```
export const RelativePath = Schema.String.pipe(Schema.brand("RelativePath"))
export type RelativePath = typeof RelativePath.Type

export const AbsolutePath = Schema.String.pipe(Schema.brand("AbsolutePath"))
export type AbsolutePath = typeof AbsolutePath.Type

export const optional = <S extends Schema.Top>(schema: S) =>
  Schema.optionalKey(schema).pipe(
    Schema.decodeTo(Schema.optional(Schema.toType(schema)), {
      decode: SchemaGetter.passthrough({ strict: false }),
      encode: SchemaGetter.transformOptional(Option.filter((value) => value !== undefined)),
```

Lines 25–30:

```
export const DateTimeUtcFromMillis = Schema.Finite.pipe(
  Schema.decodeTo(Schema.DateTimeUtc, {
    decode: SchemaGetter.transform((value) => DateTime.makeUnsafe(value)),
    encode: SchemaGetter.transform((value) => DateTime.toEpochMillis(value)),
  }),
)
```

## C14 — `packages/schema/src/session-id.ts`

Git blob `3603ebe703b7b350018626a74e794f94e33079a3`.

Lines 5–12:

```
export const SessionID = Schema.String.check(Schema.isStartsWith("ses")).pipe(
  Schema.brand("SessionID"),
  statics((schema) => {
    const create = () => schema.make("ses_" + descending())
    return {
      create,
      descending: (id?: string) => (id === undefined ? create() : schema.make(id)),
    }
```

## C15 — `packages/schema/src/session.ts`

Git blob `8319d3369ebf6ac5952dd390b3ff8844e995b280`.

Lines 20–35:

```
export const Info = Schema.Struct({
  id: ID,
  parentID: ID.pipe(optional),
  projectID: Project.ID,
  agent: Agent.ID.pipe(optional),
  model: Model.Ref.pipe(optional),
  subagentModels: SessionSubagentModels.Policy.pipe(optional),
  cost: Schema.Finite,
  tokens: Schema.Struct({
    input: Schema.Finite,
    output: Schema.Finite,
    reasoning: Schema.Finite,
    cache: Schema.Struct({
      read: Schema.Finite,
      write: Schema.Finite,
    }),
```

Lines 49–53:

```
  id: ID,
  time: Schema.Finite,
  direction: Schema.Literals(["previous", "next"]),
}).annotate({ identifier: "Session.ListAnchor" })
export interface ListAnchor extends Schema.Schema.Type<typeof ListAnchor> {}
```

## C16 — `packages/schema/src/session-input.ts`

Git blob `b024750506e151e7f14f559f979e5c52d46e3833`.

Lines 15–25:

```
export interface Admitted extends Schema.Schema.Type<typeof Admitted> {}
export const Admitted = Schema.Struct({
  admittedSeq: NonNegativeInt,
  id: SessionMessage.ID,
  sessionID: SessionID,
  prompt: Prompt,
  promptContext: PromptContext.Info.pipe(optional),
  delivery: Delivery,
  timeCreated: DateTimeUtcFromMillis,
  promotedSeq: NonNegativeInt.pipe(optional),
}).annotate({ identifier: "SessionInput.Admitted" })
```

## C17 — `packages/schema/src/location.ts`

Git blob `c01ce36372a698a289b1591466d4b01b323543d9`.

Lines 9–25:

```
export const Ref = Schema.Struct({
  directory: AbsolutePath,
  workspaceID: optional(WorkspaceID),
}).annotate({ identifier: "Location.Ref" })

export class Info extends Schema.Class<Info>("Location.Info")({
  directory: AbsolutePath,
  workspaceID: optional(WorkspaceID),
  project: Schema.Struct({
    id: ProjectID,
    directory: AbsolutePath,
  }),
}) {}

export function response<S extends Schema.Top>(data: S) {
  return Schema.Struct({ location: Info, data })
}
```

## C18 — `packages/schema/src/event.ts`

Git blob `21d0aceeaeb06247f4b2f2ceaeee53f81e1b9cf6`.

Lines 55–64:

```
  const data = Schema.Struct(input.schema).pipe((schema) =>
    input.dataIdentifier ? schema.annotate({ identifier: input.dataIdentifier }) : schema,
  )
  return Schema.Struct({
    id: ID,
    metadata: optional(Schema.Record(Schema.String, Schema.Unknown)),
    type: Schema.Literal(input.type),
    durable: optional(Schema.Struct({ aggregateID: Schema.String, seq: Schema.Int, version: Schema.Int })),
    location: optional(Location.Ref),
    data,
```

Lines 76–78:

```
export function inventory<const Definitions extends ReadonlyArray<Definition>>(...definitions: Definitions) {
  return Object.freeze(definitions)
}
```

Lines 88–94:

```
      if (definition.durable && existing.durable && definition.durable.version !== existing.durable.version) {
        if (definition.durable.version > existing.durable.version) result.set(definition.type, definition)
        return result
      }
      if (definition !== existing) throw new Error(`Duplicate latest event definition for ${definition.type}`)
      return result
    }, new Map<string, Definition>()),
```

Lines 105–108:

```
      if (!definition.durable) return result
      const key = versionedType(definition.type, definition.durable.version)
      if (result.has(key)) throw new Error(`Duplicate durable event definition for ${key}`)
      result.set(key, definition)
```

## C19 — `packages/schema/src/session-event.ts`

Git blob `e314b7942bd0d7d56328a27d2cc11a0fa53da481`.

Lines 42–55:

```

const options = {
  durable: {
    aggregate: "sessionID",
    version: 1,
  },
} as const
const stepSettlementOptions = {
  durable: {
    aggregate: "sessionID",
    version: 2,
  },
} as const

```

Lines 219–229:

```

  export const Ended = Event.define({
    type: "session.next.step.ended",
    ...stepSettlementOptions,
    schema: {
      ...Base,
      assistantMessageID: SessionMessage.ID,
      finish: Schema.String,
      cost: Schema.Finite,
      /** Absent in historical events: billing availability was not captured. */
      usageKnown: Schema.Boolean.pipe(optional),
```

Lines 269–280:

```
  // Stream fragments are live-only; Text.Ended is the replayable full-value boundary.
  export const Delta = Event.define({
    type: "session.next.text.delta",
    schema: {
      ...Base,
      assistantMessageID: SessionMessage.ID,
      textID: Schema.String,
      delta: Schema.String,
    },
  })
  export type Delta = typeof Delta.Type

```

Lines 511–546:

```
export const DurableDefinitions = Event.inventory(
  Created,
  Renamed,
  Deleted,
  AgentSwitched,
  ModelSwitched,
  SubagentModelsChanged,
  PermissionChanged,
  ArchiveChanged,
  Moved,
  Prompted,
  PromptAdmitted,
  ContextUpdated,
  Synthetic,
  Shell.Started,
  Shell.Ended,
  Step.Started,
  Step.Ended,
  Step.Failed,
  Text.Started,
  Text.Ended,
  Tool.Input.Started,
  Tool.Input.Ended,
  Tool.Called,
  Tool.Progress,
  Tool.Success,
  Tool.Failed,
  Reasoning.Started,
  Reasoning.Ended,
  Retried,
  Compaction.Started,
  Compaction.Ended,
  RevertEvent.Staged,
  RevertEvent.Cleared,
  RevertEvent.Committed,
)
```

Lines 567–583:

```
  Text.Started,
  Text.Delta,
  Text.Ended,
  Reasoning.Started,
  Reasoning.Delta,
  Reasoning.Ended,
  Tool.Input.Started,
  Tool.Input.Delta,
  Tool.Input.Ended,
  Tool.Called,
  Tool.Progress,
  Tool.Success,
  Tool.Failed,
  Retried,
  Compaction.Started,
  Compaction.Delta,
  Compaction.Ended,
```

## C20 — `packages/schema/src/event-manifest.ts`

Git blob `12c988bd667a781e53928fc86cf2e1af99c185cc`.

Lines 58–70:

```
export const ServerDefinitions = Event.inventory(
  ...foundationDefinitions,
  ...featureDefinitions,
  ...SessionTodo.Event.Definitions,
  // The server's HEAD watcher announces a branch switch.
  ...VcsEvent.Definitions,
)

export const Definitions = Event.inventory(
  ...foundationDefinitions,
  ...InstallationEvent.Definitions,
  ...featureDefinitions,
  ...SessionTodo.Event.Definitions,
```

Lines 76–83:

```
  ...SessionCompactionEvent.Definitions,
  ...VcsEvent.Definitions,
  ...WorkspaceEvent.Definitions,
  ...WorktreeEvent.Definitions,
  ...ServerEvent.Definitions,
)
export const Latest = Event.latest(Definitions)
export { Durable }
```

## C21 — `packages/protocol/src/groups/session.ts`

Git blob `5830f50001c8dc01227a920f04276054c0e29570`.

Lines 102–109:

```
  limit: Schema.NumberFromString.pipe(Schema.decodeTo(SessionHistoryLimit), Schema.optional),
  after: Schema.NumberFromString.pipe(Schema.decodeTo(NonNegativeInt), Schema.optional),
})

export const ProcessNode = Schema.Struct({
  pid: Schema.Int,
  parentPid: Schema.optional(Schema.Int),
  name: Schema.optional(Schema.String),
```

Lines 157–165:

```
      HttpApiEndpoint.post("session.create", "/api/session", {
        payload: Schema.Struct({
          id: Session.ID.pipe(Schema.optional),
          agent: Agent.ID.pipe(Schema.optional),
          model: Model.Ref.pipe(Schema.optional),
          location: Location.Ref.pipe(Schema.optional),
        }),
        success: Schema.Struct({ data: Session.Info }),
        error: SessionNotFoundError,
```

Lines 175–181:

```
      HttpApiEndpoint.get("session.active", "/api/session/active", {
        success: Schema.Struct({ data: Schema.Record(Session.ID, SessionActive) }),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "v2.session.active",
          summary: "List active sessions",
          description:
```

Lines 333–343:

```
      HttpApiEndpoint.post("session.prompt", "/api/session/:sessionID/prompt", {
        params: { sessionID: Session.ID },
        payload: Schema.Struct({
          id: SessionMessage.ID.pipe(Schema.optional),
          prompt: PromptInput.Prompt,
          delivery: SessionInput.Delivery.pipe(Schema.optional),
          resume: Schema.Boolean.pipe(Schema.optional),
        }),
        success: Schema.Struct({ data: SessionInput.Admitted }),
        error: [ConflictError, SessionNotFoundError],
      })
```

Lines 349–350:

```
            description: "Durably admit one session input and schedule agent-loop execution unless resume is false.",
          }),
```

Lines 617–626:

```
      HttpApiEndpoint.get("session.history", "/api/session/:sessionID/history", {
        params: { sessionID: Session.ID },
        query: SessionHistoryQuery,
        success: Schema.Struct({
          data: Schema.Array(SessionEvent.Durable),
          hasMore: Schema.Boolean,
        }).annotate({ identifier: "SessionHistory" }),
        error: SessionNotFoundError,
      })
        .middleware(sessionLocationMiddleware)
```

Lines 632–633:

```
              "Read one finite page of public durable Session events after an exclusive aggregate sequence. Newly committed events may appear on later pages.",
          }),
```

Lines 637–650:

```
      HttpApiEndpoint.get("session.events", "/api/session/:sessionID/event", {
        params: { sessionID: Session.ID },
        query: {
          after: Schema.NumberFromString.pipe(Schema.decodeTo(NonNegativeInt), Schema.optional),
        },
        success: HttpApiSchema.StreamSse({ data: SessionEvent.Durable }),
        error: SessionNotFoundError,
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.events",
            summary: "Subscribe to session events",
            description: "Replay durable events after an aggregate sequence, then continue with new durable events.",
```

Lines 655–660:

```
      HttpApiEndpoint.post("session.interrupt", "/api/session/:sessionID/interrupt", {
        params: { sessionID: Session.ID },
        success: HttpApiSchema.NoContent,
        error: SessionNotFoundError,
      })
        .middleware(sessionLocationMiddleware)
```

## C22 — `packages/server/src/handlers/session.ts`

Git blob `1ce1cd359f5c9bbfc12122fad3d4439655a1e5bb`.

Lines 68–84:

```
        Effect.catchTag("Session.PromptConflictError", (error) =>
          Effect.fail(
            new ConflictError({
              message: `Prompt message ID conflicts with an existing durable record: ${error.messageID}`,
              resource: error.messageID,
            }),
          ),
        ),
        // A hook refused the prompt before admission; nothing was recorded, and the hook's words say why.
        Effect.catchTag("Session.PromptBlockedError", (error) =>
          Effect.fail(new ConflictError({ message: error.detail, resource: error.sessionID })),
        ),
      )

    const policyResult = <A>(effect: Effect.Effect<A, SessionSubagentModels.Error>) => effect.pipe(
      Effect.catchTag("SessionSubagentModels.NotFoundError", (error) =>
        new SessionNotFoundError({ sessionID: error.sessionID, message: `Session not found: ${error.sessionID}` }),
```

Lines 247–263:

```
        "session.prompt",
        Effect.fn(function* (ctx) {
          return {
            data: yield* admit({
              sessionID: ctx.params.sessionID,
              id: ctx.payload.id,
              prompt: ctx.payload.prompt,
              delivery: ctx.payload.delivery,
              resume: ctx.payload.resume,
            }),
          }
        }),
      )
      .handle(
        "session.command",
        Effect.fn(function* (ctx) {
          const resolved = yield* SlashCommand.render(ctx.payload.command, ctx.payload.arguments ?? "").pipe(
```

Lines 640–653:

```
        "session.events",
        Effect.fn((ctx) =>
          Effect.succeed(
            session.events({ sessionID: ctx.params.sessionID, after: ctx.query.after }).pipe(Stream.orDie),
          ),
        ),
      )
      .handle(
        "session.interrupt",
        Effect.fn(function* (ctx) {
          yield* session.interrupt(ctx.params.sessionID)
          return HttpApiSchema.NoContent.make()
        }),
      )
```

## C23 — `packages/server/src/handlers/message.ts`

Git blob `76f2a2583525f1a8e45be6f0121c4870d0ea9f7a`.

Lines 34–46:

```
        if (ctx.query.cursor && ctx.query.order !== undefined)
          return yield* new InvalidCursorError({ message: "Cursor cannot be combined with order" })
        const decoded = yield* Effect.try({
          try: () => (ctx.query.cursor ? cursor.decode(ctx.query.cursor) : undefined),
          catch: () => new InvalidCursorError({ message: "Invalid cursor" }),
        })
        const order = decoded?.order ?? ctx.query.order ?? "desc"
        const messages = yield* session
          .messages({
            sessionID: ctx.params.sessionID,
            limit: ctx.query.limit ?? DefaultMessagesLimit,
            order,
            cursor: decoded ? { id: decoded.id, direction: decoded.direction } : undefined,
```

Lines 73–77:

```
          cursor: {
            previous: first ? cursor.encode(first, order, "previous") : undefined,
            next: last ? cursor.encode(last, order, "next") : undefined,
          },
        }
```

## C24 — `packages/server/src/middleware/session-location.ts`

Git blob `86d49275ece013a3a1af6a75ed6a5e31d195781b`.

Lines 34–59:

```
          Effect.mapError(
            () =>
              new InvalidRequestError({
                message: "Invalid session ID",
                field: "sessionID",
              }),
          ),
        )
        const row = yield* db
          .select({ directory: SessionTable.directory, workspaceID: SessionTable.workspace_id })
          .from(SessionTable)
          .where(eq(SessionTable.id, sessionID))
          .get()
          .pipe(Effect.orDie)
        if (!row)
          return yield* new SessionNotFoundError({
            sessionID,
            message: `Session not found: ${sessionID}`,
          })

        const location = Location.Ref.make({
          directory: AbsolutePath.make(row.directory),
          workspaceID: row.workspaceID ? WorkspaceV2.ID.make(row.workspaceID) : undefined,
        })
        return yield* effect.pipe(Effect.provide(bootLocation(locations.get(location), location)))
      }),
```

## C25 — `packages/protocol/src/errors.ts`

Git blob `040460309fbd868f937b7511ddd378942c0c2ac9`.

Lines 3–17:

```
export class InvalidRequestError extends Schema.TaggedErrorClass<InvalidRequestError>()(
  "InvalidRequestError",
  {
    message: Schema.String,
    kind: Schema.optional(Schema.String),
    field: Schema.optional(Schema.String),
  },
  { httpApiStatus: 400 },
) {}

export class UnauthorizedError extends Schema.TaggedErrorClass<UnauthorizedError>()(
  "UnauthorizedError",
  { message: Schema.String },
  { httpApiStatus: 401 },
) {}
```

Lines 19–44:

```
export class ConflictError extends Schema.TaggedErrorClass<ConflictError>()(
  "ConflictError",
  {
    message: Schema.String,
    resource: Schema.optional(Schema.String),
  },
  { httpApiStatus: 409 },
) {}

export class ServiceUnavailableError extends Schema.TaggedErrorClass<ServiceUnavailableError>()(
  "ServiceUnavailableError",
  {
    message: Schema.String,
    service: Schema.optional(Schema.String),
  },
  { httpApiStatus: 503 },
) {}

export class UnknownError extends Schema.TaggedErrorClass<UnknownError>()(
  "UnknownError",
  {
    message: Schema.String,
    ref: Schema.optional(Schema.String),
  },
  { httpApiStatus: 500 },
) {}
```

Lines 55–63:

```
export class SessionNotFoundError extends Schema.TaggedErrorClass<SessionNotFoundError>()(
  "SessionNotFoundError",
  {
    sessionID: Schema.String,
    message: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

```

Lines 98–103:

```
export class ForbiddenError extends Schema.TaggedErrorClass<ForbiddenError>()(
  "ForbiddenError",
  { message: Schema.String },
  { httpApiStatus: 403 },
) {}

```

## C26 — `packages/server/src/auth.ts`

Git blob `0569716157d6ae03d1343ba7d08ca697f1fbdb75`.

Lines 29–33:

```
        return Config.of(
          yield* EffectConfig.all({
            password: EffectConfig.string("ORCHESTRA_SERVER_PASSWORD").pipe(EffectConfig.option),
            username: EffectConfig.string("ORCHESTRA_SERVER_USERNAME").pipe(EffectConfig.withDefault("orchestra")),
          }),
```

Lines 40–49:

```
export function required(config: Info) {
  return Option.isSome(config.password) && config.password.value !== ""
}

export function authorized(credentials: DecodedCredentials, config: Info) {
  return (
    Option.isSome(config.password) &&
    credentials.username === config.username &&
    Redacted.value(credentials.password) === config.password.value
  )
```

## C27 — `packages/server/src/middleware/authorization.ts`

Git blob `d1624034dd309e5740a3d642357155f405f5839b`.

Lines 13–13:

```
const AUTH_TOKEN_QUERY_PATH = /^\/api\/(?:event|session\/[^/]+\/event|pty\/[^/]+\/connect)$/
```

Lines 34–39:

```
  const url = new URL(request.url, "http://localhost")
  const token = AUTH_TOKEN_QUERY_PATH.test(url.pathname) ? url.searchParams.get(AUTH_TOKEN_QUERY) : null
  if (token) return decodeCredential(token)
  const match = /^Basic\s+(.+)$/i.exec(request.headers.authorization ?? "")
  if (match) return decodeCredential(match[1])
  return Effect.succeed(emptyCredential())
```

Lines 45–57:

```
    const config = yield* ServerAuth.Config
    if (!ServerAuth.required(config)) return Authorization.of((effect) => effect)
    return Authorization.of((effect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        // Browsers cannot set headers on WebSocket upgrades, so a ticketed PTY connect skips
        // credential checks here; the connect handler consumes and validates the ticket.
        const url = new URL(request.url, "http://localhost")
        if (hasPtyConnectTicketURL(url)) return yield* effect
        // Media elements cannot send headers either; the content handler verifies the HMAC ticket.
        if (hasCapabilityContentTicketURL(url)) return yield* effect
        const credential = yield* credentialFromRequest(request)
        if (ServerAuth.authorized(credential, config)) return yield* effect
```

Lines 61–61:

```
        return yield* new UnauthorizedError({ message: "Authentication required" })
```

## C28 — `packages/server/src/middleware/capability-authorization.ts`

Git blob `ca7a6eaeef94c55cb8c4df36a7b7a89a6256b58d`.

Lines 27–47:

```
          if (ServerAuth.required(config)) {
            const credential = decodeBasic(request.headers.authorization ?? "")
            if (!credential || !ServerAuth.authorized(credential, config)) {
              return yield* new UnauthorizedError({ message: "Authentication required" })
            }
            return operator.configured
          }

          const bearer = /^Bearer ([A-Za-z0-9_-]{43})(?![\s\S])/.exec(request.headers.authorization ?? "")
          if (!bearer) return yield* new UnauthorizedError({ message: "Authentication required" })
          return yield* operator.authenticate(bearer[1])
        })

        const idempotencyKey = request.headers["idempotency-key"]
        if (idempotencyKey !== undefined && !/^[A-Za-z0-9_-]{1,128}(?![\s\S])/.test(idempotencyKey)) {
          return yield* new ForbiddenError({ message: "Request denied" })
        }

        // Only Core's private request frame carries authority. Caller-supplied IDs are not grants.
        return yield* operator.withRequest(authority, { requestID: randomUUID(), idempotencyKey },
          Effect.provideService(effect, RequestAuthority, authority))
```

Lines 80–85:

```
export function capabilityError(error: Capability.Failure) {
  if (error.code === "authentication_required" || error.code === "authentication_revoked") {
    return new UnauthorizedError({ message: "Authentication required" })
  }
  return new ForbiddenError({ message: "Request denied" })
}
```

## C29 — `packages/server/src/middleware/schema-error.ts`

Git blob `d39702b74b11b1ee8e0072903bf1f9f19310da33`.

Lines 10–19:

```
  if (reason.length <= REASON_LIMIT) return reason
  return reason.slice(0, REASON_LIMIT) + `... (${reason.length - REASON_LIMIT} more chars)`
}

export const schemaErrorLayer = HttpApiMiddleware.layerSchemaErrorTransform(SchemaErrorMiddleware, (error) => {
  const reason = truncateReason(error.cause.message)
  return Effect.logWarning("schema rejection").pipe(
    Effect.annotateLogs({ kind: error.kind, reason }),
    Effect.andThen(Effect.fail(new InvalidRequestError({ message: reason, kind: error.kind }))),
  )
```

## C30 — `packages/server/src/location.ts`

Git blob `1881a570a893ec8c55aa436598db44ad19edde04`.

Lines 33–40:

```
export function ref(request: HttpServerRequest.HttpServerRequest) {
  const query = new URL(request.url, "http://localhost").searchParams
  const workspaceID = query.get("location[workspace]") || request.headers["x-orchestra-workspace"]
  const directory = query.get("location[directory]") || process.cwd()
  return Location.Ref.make({
    directory: AbsolutePath.make(directory),
    workspaceID: workspaceID ? WorkspaceV2.ID.make(workspaceID) : undefined,
  })
```

Lines 67–81:

```
    )
    if (missing)
      return yield* new InvalidRequestError({
        message: `Directory not found: ${location.directory}`,
        kind: "location_not_found",
        field: "location.directory",
      })
    // A defect is a bug, not a bad request: it stays a 500, now logged above.
    if (!Cause.hasFails(cause)) return yield* Effect.failCause(cause)
    return yield* new InvalidRequestError({
      message: `Location could not start: ${location.directory}`,
      kind: "location_unavailable",
      field: "location.directory",
    })
  })
```

## C31 — `packages/server/src/handlers/pty.ts`

Git blob `8510e41f51ddc8738229a529fdbc9382324ff94e`.

Lines 120–128:

```
          // mint tickets without passing the server's origin policy.
          if (
            request.headers[PTY_CONNECT_TOKEN_HEADER] !== PTY_CONNECT_TOKEN_HEADER_VALUE ||
            !isAllowedRequestOrigin(request.headers.origin, request.headers.host, cors)
          )
            return yield* new ForbiddenError({ message: "Invalid PTY connect token request" })
          const pty = yield* Pty.Service
          yield* pty.get(ctx.params.ptyID).pipe(
            Effect.catchTag(
```

Lines 135–138:

```
            ),
          )
          return yield* response(tickets.issue({ ptyID: ctx.params.ptyID, ...(yield* ticketScope) }))
        }),
```

Lines 149–160:

```

          const url = new URL(ctx.request.url, "http://localhost")
          const ticket = url.searchParams.get(PTY_CONNECT_TICKET_QUERY)
          if (ticket) {
            const valid = isAllowedRequestOrigin(ctx.request.headers.origin, ctx.request.headers.host, cors)
              ? yield* tickets.consume({ ticket, ptyID: ctx.params.ptyID, ...(yield* ticketScope) })
              : false
            if (!valid) return HttpServerResponse.empty({ status: 403 })
          }
          const parsedCursor = url.searchParams.get("cursor")
          const cursorNumber = parsedCursor === null ? undefined : Number(parsedCursor)
          const cursor =
```

Lines 178–179:

```
          // TODO: Integrate graceful-shutdown socket tracking before clients migrate to this route.
          const outbox = yield* Queue.unbounded<string | Uint8Array | Socket.CloseEvent>()
```

## C32 — `packages/server/src/handlers/capability-artifacts.ts`

Git blob `f7f3110dbfa6af4e9ad992b560fcfa63ccc2ba9d`.

Lines 61–76:

```
    return handlers.handleRaw("capability.content.read", ({ params, headers }) => {
      const claim = tickets.verify(params.ticket)
      // Expired and unknown tickets are indistinguishable: an empty 401.
      if (claim === undefined) return Effect.succeed(HttpServerResponse.empty({ status: 401 }))
      // Re-run the content read under the minting authority; Core rejects it once revoked or expired.
      return operators.withRequest(claim.authority, { requestID: randomUUID() },
        management.content(claim.sessionID, claim.ref)).pipe(
        Effect.map((content) => contentResponse(content.artifact, content.data, headers.range)),
        Effect.catchIf((error): error is Capability.Failure => error instanceof Capability.Failure,
          () => Effect.succeed(HttpServerResponse.empty({ status: 401 }))),
        // The minting authority could read it, so unavailable now means the artifact or its reference is gone.
        Effect.catchIf((error): error is CapabilityArtifacts.Failure =>
          error instanceof CapabilityArtifacts.Failure && error.code === "artifact_unavailable",
          () => Effect.succeed(HttpServerResponse.empty({ status: 404 }))),
        artifactResponse)
    })
```

## C33 — `packages/server/src/handlers/event.ts`

Git blob `d644f36bdd6aa93cd538f560dab63337c2436022`.

Lines 13–24:

```
export const eventFrames = (encode: (data: unknown) => string = encodeEvent) => {
  const frames = new WeakMap<object, string>()
  return (data: object): Sse.Event => {
    const cached = frames.get(data)
    const json = cached ?? encode(data)
    if (cached === undefined) frames.set(data, json)
    return { _tag: "Event", event: "message", id: undefined, data: json }
  }
}

// The renderer reads this stream on its main thread. On a loaded machine it can fall seconds behind while a model
// streams token deltas, and a subscriber that overflows is cut and must resync everything. The capacity is large
```

Lines 28–45:

```
export const eventStream = (events: EventV2.Interface, frame = eventFrames()) => {
  const connected = {
    id: EventV2.ID.create(),
    type: "server.connected",
    data: {},
  }
  const output = Stream.unwrap(
    Effect.gen(function* () {
      // Acquiring the bounded stream installs its listener before readiness is observable.
      const live = yield* EventV2.allBounded(events, subscriberCapacity)
      return Stream.make(connected).pipe(Stream.concat(live))
    }),
  ).pipe(Stream.map(frame), Stream.pipeThroughChannel(Sse.encode()))
  // A comment frame keeps idle connections open and tells the client the server is alive.
  const heartbeat = Stream.tick("15 seconds").pipe(Stream.map(() => ": heartbeat\n\n"))
  return output.pipe(Stream.merge(heartbeat, { haltStrategy: "left" }), Stream.encodeText)
}

```

Lines 54–64:

```
          contentType: "text/event-stream",
          headers: {
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "X-Content-Type-Options": "nosniff",
          },
        }),
      ),
    )
  }),
)
```

## C34 — `packages/client/src/generated/client.ts`

Git blob `93cab27e0b902d6e8fbd21d6aaec320a2b9fe09c`.

Lines 557–566:

```
    if (descriptor.body !== undefined && !headers.has("content-type")) headers.set("content-type", "application/json")
    return {
      url,
      init: {
        method: descriptor.method,
        signal: requestOptions?.signal,
        headers,
        body: descriptor.body === undefined ? undefined : JSON.stringify(descriptor.body),
      } satisfies RequestInit,
    }
```

Lines 573–594:

```
    } catch (cause) {
      throw new ClientError("Transport", { cause })
    }
  }

  const responseError = async (response: Response, descriptor: RequestDescriptor): Promise<never> => {
    if (descriptor.declaredStatuses.includes(response.status)) throw await json(response)
    try {
      await response.body?.cancel()
    } catch {}
    throw new ClientError("UnexpectedStatus", { cause: { status: response.status } })
  }

  const request = async <A>(descriptor: RequestDescriptor, requestOptions?: RequestOptions): Promise<A> => {
    const response = await execute(descriptor, requestOptions)
    if (response.status !== descriptor.successStatus) return responseError(response, descriptor)
    if (descriptor.empty) {
      try {
        await response.body?.cancel()
      } catch {}
      return undefined as A
    }
```

Lines 597–609:

```
    }
    return (await json(response)) as A
  }

  const sse = <A>(descriptor: RequestDescriptor, requestOptions?: RequestOptions): AsyncIterable<A> => ({
    async *[Symbol.asyncIterator]() {
      const response = await execute(descriptor, requestOptions)
      if (response.status !== descriptor.successStatus) await responseError(response, descriptor)
      if (!isContentType(response, "text/event-stream")) {
        try {
          await response.body?.cancel()
        } catch {}
        throw new ClientError("UnsupportedContentType")
```

Lines 621–627:

```
            throw new ClientError("Transport", { cause })
          }
          buffer += decoder.decode(next.value, { stream: !next.done })
          if (buffer.length > 1_048_576) throw new ClientError("MalformedResponse")
          const trailingCarriageReturn = !next.done && buffer.endsWith("\r")
          if (trailingCarriageReturn) buffer = buffer.slice(0, -1)
          buffer = buffer.replaceAll("\r\n", "\n").replaceAll("\r", "\n")
```

Lines 639–647:

```
              try {
                yield JSON.parse(data) as A
              } catch (cause) {
                throw new ClientError("MalformedResponse", { cause })
              }
            }
            boundary = buffer.indexOf("\n\n")
          }
          if (next.done) return
```

Lines 653–660:

```
        reader.releaseLock()
      }
    },
  })

  return {
    health: {
      get: (requestOptions?: RequestOptions) =>
```

Lines 1562–1572:

```
          },
          requestOptions,
        ),
      list: (input?: FilesListInput, requestOptions?: RequestOptions) =>
        request<FilesListOutput>(
          {
            method: "GET",
            path: `/api/fs/list`,
            query: { location: input?.["location"], path: input?.["path"] },
            successStatus: 200,
            declaredStatuses: [401, 400],
```

Lines 4082–4104:

```
  params.append(key, String(value))
}

async function json(response: Response): Promise<unknown> {
  if (!isContentType(response, "application/json") && !response.headers.get("content-type")?.includes("+json")) {
    try {
      await response.body?.cancel()
    } catch {}
    throw new ClientError("UnsupportedContentType")
  }
  let text: string
  try {
    text = await response.text()
  } catch (cause) {
    throw new ClientError("Transport", { cause })
  }
  if (text === "") throw new ClientError("MalformedResponse")
  try {
    return JSON.parse(text)
  } catch (cause) {
    throw new ClientError("MalformedResponse", { cause })
  }
}
```

## C35 — `packages/client/README.md`

Git blob `6b5cf80aff0f077666ffcadbf177671a3bc4032f`.

Lines 29–35:

```
`script/build.ts` compiles `ClientApi` from `src/contract.ts`, which composes Protocol with client-local middleware tags, group and method names, and an omission set. Raw file reads and PTY WebSocket operations are omitted; their transports are separate. Tests compare the projection with Server's concrete API.

`src/generated` and `src/generated-effect` are generator output. After changing the public Protocol or Server `HttpApi`, run from this directory:

```sh
bun run generate
bun run check:generated   # fails if committed output drifted
```

## C36 — `packages/client/src/generated-effect/client-error.ts`

Git blob `b8731eec8a26bd7bb8a76d16c67666e6db5af3d1`.

Lines 1–12:

```
import { Schema } from "effect"
import { Sse } from "effect/unstable/encoding"
import { HttpClientError } from "effect/unstable/http"

export class ClientError extends Schema.TaggedErrorClass<ClientError>()("ClientError", {
  cause: Schema.Defect(),
}) {}

export const mapClientError = <E>(error: E) =>
  HttpClientError.isHttpClientError(error) || Schema.isSchemaError(error) || Sse.Retry.is(error)
    ? new ClientError({ cause: error })
    : error
```

## C37 — `packages/client/src/actions-transfer.ts`

Git blob `0d8607699a560ae9fb671f8bc37bc9d1b473424e`.

Lines 64–67:

```
     * Stream uploads require a fetch implementation supporting request streams (duplex: "half").
     * Browsers may require HTTPS/HTTP2 and may not expose a reply until upload completes.
     * A failed capability probe has code "UnsupportedStreaming". A caller-owned Blob skips the
     * probe; no stream-to-Blob fallback occurs. Constructor detection is not a browser runtime proof.
```

Lines 122–126:

```
          // Browsers must read duplex and must not coerce a stream to text. Bun's constructor
          // need not read duplex here; Bun's streaming fetch is covered by the real HTTP fixture.
          if (supported.headers.has("content-type") || (!duplexRead && typeof Reflect.get(globalThis, "Bun") === "undefined"))
            throw new ActionsTransferError("Transport", {
              code: "UnsupportedStreaming",
```

Lines 149–153:

```
  const fetch = options.fetch ?? globalThis.fetch
  const url = new URL(
    `/api/actions/transfer/${encodeURIComponent(binding.id)}${body === undefined ? "" : "/upload"}`,
    options.baseUrl,
  )
```

Lines 172–174:

```
    // A provider/signed redirect must not receive the configured Orchestra credentials.
    redirect: "manual",
    ...(body instanceof ReadableStream ? { duplex: "half" } : {}),
```

## C38 — `packages/client/src/actions-transfer-error.ts`

Git blob `314b2dc47f3e63182dec1324c1c31f3839dc12d9`.

Lines 37–48:

```
/** Error bodies only: at most 16 KiB retained, with a five-second read deadline. */
export async function actionsTransferResponseError(response: Response): Promise<never> {
  const details = { status: response.status, retryAfter: retryAfter(response.headers.get("retry-after")) }
  const captured = await capture(response).catch((cause: unknown) => {
    throw new ActionsTransferError("Transport", { ...details, cause })
  })
  if (captured.truncated) throw new ActionsTransferError("MalformedResponse", { ...details, truncated: true })
  if (!/^application\/(?:json|[\w.+-]+\+json)(?:\s*;|$)/i.test(response.headers.get("content-type") ?? ""))
    throw new ActionsTransferError("UnexpectedStatus", details)
  const data = parse(captured.bytes)
  if (!isErrorData(data)) throw new ActionsTransferError("MalformedResponse", details)
  throw new ActionsTransferError("UnexpectedStatus", { ...details, data })
```

Lines 51–65:

```
async function capture(response: Response) {
  const bytes = new Uint8Array(16_384)
  if (!response.body) return { bytes: bytes.subarray(0, 0), truncated: false }
  const reader = response.body.getReader()
  let length = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Actions error response read timed out")), 5_000)
  })
  try {
    while (true) {
      const next = await Promise.race([reader.read(), deadline])
      if (next.done) return { bytes: bytes.subarray(0, length), truncated: false }
      if (next.value.byteLength > bytes.length - length) return { bytes: bytes.subarray(0, length), truncated: true }
      bytes.set(next.value, length)
```

Lines 68–73:

```
  } finally {
    clearTimeout(timer)
    // Do not let a broken peer extend the capture deadline through cancellation.
    void reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
```

## C39 — `packages/protocol/src/groups/actions-transfer.ts`

Git blob `e39a1a8900b6808f0a80be14af702b14c3dc3c44`.

Lines 10–17:

```
export const ActionsTransferGroup = HttpApiGroup.make("server.actionsTransfer")
  .add(HttpApiEndpoint.get("actions.transfer.info", "/api/actions/transfer/:bindingID/info", {
    params: BindingParams, query: TransferQuery, success: Location.response(Actions.TransferInfo), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.get("actions.transfer.read", "/api/actions/transfer/:bindingID", {
    params: BindingParams, query: TransferQuery,
    success: Schema.Uint8Array.pipe(HttpApiSchema.asUint8Array()), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
```

## C40 — `packages/client/script/build.ts`

Git blob `99ae2184b9c13f6175d7ba8e3025068bee07ee4f`.

Lines 1–12:

```
import { NodeFileSystem } from "@effect/platform-node"
import { compile, emitEffectImported, emitPromise, write } from "@orchestra/httpapi-codegen"
import { ClientApi, endpointNames, groupNames, omitEndpoints } from "../src/contract"
import { Effect } from "effect"
import { fileURLToPath } from "url"

const contract = compile(ClientApi, { groupNames, endpointNames, omitEndpoints })
const splitGroups = new Set([
  "research",
  "schedules",
  "actionsBindings",
  "actionsOperations",
```

Lines 28–48:

```
          outputTypes: {
            "sessions.events": {
              name: "SessionEventEncoded",
              import: 'import type { SessionEventEncoded } from "../wire"',
            },
            "events.subscribe": {
              name: "OrchestraEventEncoded",
              import: 'import type { OrchestraEventEncoded } from "@orchestra/protocol/groups/event"',
            },
          },
        }),
        fileURLToPath(new URL("../src/generated", import.meta.url)),
      ),
      write(
        emitEffectImported(contract, { module: "../contract", api: "ClientApi" }, { splitGroups }),
        fileURLToPath(new URL("../src/generated-effect", import.meta.url)),
      ),
    ],
    { concurrency: 2, discard: true },
  ).pipe(Effect.provide(NodeFileSystem.layer)),
)
```

## C41 — `tooling/httpapi-codegen/src/index.ts`

Git blob `0467e68001715795e0851cf5d8a8b3dad1d75126`.

Lines 75–82:

```
export function compile<Id extends string, Groups extends HttpApiGroup.Any>(
  api: HttpApi.HttpApi<Id, Groups>,
  options?: {
    readonly groupNames?: Readonly<Record<string, string>>
    readonly endpointNames?: Readonly<Record<string, string>>
    readonly omitEndpoints?: ReadonlySet<string>
  },
): Contract {
```

Lines 89–99:

```
      if (options?.omitEndpoints?.has(endpoint.name)) return
      const groupName = options?.groupNames?.[group.identifier] ?? group.identifier
      const name = `${groupName}.${endpoint.name}`
      const required = Array.from(middleware).find((item) => item.requiredForClient)
      if (required !== undefined) {
        throw new GenerationError({ reason: `Client middleware requires adapter: ${required.key}` })
      }

      const successSchemas = Array.from(endpoint.success)
      if (successSchemas.length === 0) successSchemas.push(HttpApiSchema.NoContent)
      if (successSchemas.length > 1) throw new GenerationError({ reason: `Multiple success schemas: ${name}` })
```

Lines 105–123:

```
      if (sourcePayloads.length > 1) {
        throw new GenerationError({ reason: `Multiple payload schemas: ${name}` })
      }
      const payloads = sourcePayloads.map((schema) => normalizeTransport(schema, "payload", endpoint, name)!)
      const success = normalizeTransport(successSchemas[0], "success", endpoint, name)!
      const errorSchemas = Array.from(errors).flatMap(([status, schemas]) =>
        schemas.map((schema) => ({ status, ...normalizeTransport(schema, "error", endpoint, name)! })),
      )
      const inputs = [
        ...inputFields(params?.schema, "params", name),
        ...inputFields(query?.schema, "query", name),
        ...inputFields(headers?.schema, "headers", name),
        ...payloads.flatMap((item) => inputFields(item.schema, "payload", name)),
      ]
      const names = new Set<string>()
      for (const field of inputs) {
        if (names.has(field.name)) throw new GenerationError({ reason: `Input field collision: ${field.name}` })
        names.add(field.name)
      }
```

Lines 150–159:

```
        input: inputs,
        unwrapData: isDataEnvelope(success.schema),
        binary: resolveHttpApiEncoding(success.schema.ast)?._tag === "Uint8Array",
        successes: [success.schema],
        errors: errorSchemas.map((item) => ({ status: item.status, schema: item.schema })),
        effectPortable,
        operation: {
          group: groupName,
          name: options?.endpointNames?.[endpoint.name] ?? clientEndpointName(endpoint.name),
          input: inputs.map(({ name, source }) => ({ name, source })),
```

Lines 212–219:

```
    groups,
  }
}

export function emitEffect(contract: Contract): Output {
  const endpoint = contract.groups.flatMap((group) => group.endpoints).find((endpoint) => !endpoint.effectPortable)
  if (endpoint !== undefined) {
    throw new GenerationError({
```

Lines 318–343:

```
function assertPromiseEndpoint(endpoint: Endpoint) {
  const name = `${endpoint.group}.${endpoint.endpoint.name}`
  const payload = endpoint.payloads[0]
  const payloadEncoding = payload === undefined ? undefined : resolveHttpApiEncoding(payload.ast)
  if (
    payload !== undefined &&
    (payloadEncoding?._tag ?? (HttpMethod.hasBody(endpoint.endpoint.method) ? "Json" : "FormUrlEncoded")) !== "Json"
  ) {
    throw new GenerationError({ reason: `Unsupported Promise payload encoding: ${name}` })
  }
  const success = endpoint.successes[0]
  const successEncoding = resolveHttpApiEncoding(success.ast)?._tag ?? "Json"
  if (isStreamSchema(success)) {
    if (
      success._tag !== "StreamSse" ||
      success.sseMode !== "data" ||
      !SchemaAST.isNever(Schema.toType(success.error).ast)
    ) {
      throw new GenerationError({ reason: `Unsupported Promise stream: ${name}` })
    }
  } else if (
    !HttpApiSchema.isNoContent(success.ast) &&
    successEncoding !== "Json" &&
    successEncoding !== "Uint8Array"
  ) {
    throw new GenerationError({ reason: `Unsupported Promise success encoding: ${name}` })
```

Lines 698–704:

```
    for (const file of files) {
      if (!isSafeOutputPath(file.path)) yield* new GenerationError({ reason: `Unsafe output path: ${file.path}` })
      const path = file.path.toLowerCase()
      if (normalizedPaths.has(path)) yield* new GenerationError({ reason: `Duplicate output path: ${file.path}` })
      normalizedPaths.add(path)
      paths.add(file.path)
    }
```

Lines 714–719:

```
    if (previous.some((path) => !isSafeOutputPath(path))) {
      yield* new GenerationError({ reason: `Invalid generated file manifest: ${manifest}` })
    }
    yield* Effect.forEach(
      previous.filter((path) => !paths.has(path)),
      (path) => fs.remove(join(directory, path), { force: true }),
```

Lines 727–739:

```
          Effect.flatMap((info) =>
            info?.type === "SymbolicLink"
              ? new GenerationError({ reason: `Unsafe output path: ${file.path}` })
              : Effect.void,
          ),
        ),
      { concurrency: 8, discard: true },
    )
    yield* Effect.forEach(files, (file) => fs.writeFileString(join(directory, file.path), file.content), {
      concurrency: 8,
      discard: true,
    })
    yield* fs.writeFileString(manifest, JSON.stringify(files.map((file) => file.path).sort(), null, 2) + "\n")
```

Lines 743–745:

```
function isSafeOutputPath(path: string) {
  return path !== manifestName && !isAbsolute(path) && path !== "." && path !== ".." && !/[\\/]/.test(path)
}
```

Lines 757–763:

```
function inputFields(schema: Schema.Top | undefined, source: InputField["source"], operation: string) {
  if (schema === undefined) return []
  const ast = Schema.toType(schema).ast
  if (!SchemaAST.isObjects(ast) || ast.indexSignatures.length > 0) {
    throw new GenerationError({ reason: `Input schema must be a struct: ${operation}.${source}` })
  }
  return ast.propertySignatures.map((field) => {
```

Lines 946–955:

```
function isDataEnvelope(schema: Schema.Top) {
  if (isStreamSchema(schema) || HttpApiSchema.isNoContent(schema.ast)) return false
  const ast = Schema.toType(schema).ast
  return (
    SchemaAST.isObjects(ast) &&
    ast.indexSignatures.length === 0 &&
    ast.propertySignatures.length === 1 &&
    ast.propertySignatures[0]?.name === "data"
  )
}
```

## C42 — `tooling/httpapi-codegen/src/imported-effect.ts`

Git blob `6434e356b20197746aa9f0bbd5727ab80dcdd831`.

Lines 58–64:

```
  const imports =
    projection === undefined
      ? `import { ${api} } from ${JSON.stringify(options.module)}`
      : `import { HttpApi, HttpApiClient${"endpoints" in options ? ", HttpApiGroup" : ""} } from "effect/unstable/httpapi"\nimport { ${projection.imports.join(", ")} } from ${JSON.stringify(options.module)}`
  const httpApiImport = projection === undefined ? 'import { HttpApiClient } from "effect/unstable/httpapi"\n' : ""
  const usesStream = groups.some((group) => group.endpoints.some((item) => item.operation.success === "stream"))
  const mapper = `const mapClientError = <E>(error: E) => HttpClientError.isHttpClientError(error) || Schema.isSchemaError(error) || Sse.Retry.is(error) ? new ClientError({ cause: error }) : error`
```

## C43 — `tooling/httpapi-codegen/src/effect-headers.ts`

Git blob `e2e2c1da3504df7c8080aa2a9efe31d00816f92c`.

Lines 8–12:

```
  const formHeaders = Object.fromEntries(Object.entries(headers).filter(([name]) => name !== "content-type"))
  return HttpApiClient.make(${api}, {
    baseUrl: options.baseUrl,
    transformClient: (client) => HttpClient.mapRequest(client, (request) =>
      HttpClientRequest.setHeaders(request, { ...(request.body._tag === "FormData" ? formHeaders : headers), ...request.headers })),
```

Lines 21–29:

```
  const entries = Object.entries(Object.getOwnPropertyDescriptors(input)).flatMap(([name, descriptor]) => {
    if (!/^[!#$%&'*+.^_|~0-9A-Za-z\\x60-]+$/.test(name) || !("value" in descriptor) ||
      typeof descriptor.value !== "string" || /[\\r\\n]/.test(descriptor.value)) {
      throw new TypeError("Invalid client headers")
    }
    return descriptor.enumerable ? [[name, descriptor.value] as const] : []
  })
  try {
    return Object.freeze(Object.fromEntries(new Headers(Object.fromEntries(entries))))
```

## C44 — `tooling/httpapi-codegen/src/layout.ts`

Git blob `b14d3a3f669e096c4e72d1fd2ad65ed8c483826f`.

Lines 98–103:

```
    printWidth: 120,
  })
  if (!file.boundedTypes || physicalLines(formatted) <= 400) return [{ path: file.path, content: formatted }]
  const ast: unknown = Reflect.apply(parsers.typescript.parse, undefined, [formatted, {}])
  if (!isNode(ast) || !Array.isArray(ast.body)) {
    throw new GenerationError({ reason: `Invalid bounded type layout: ${file.path}` })
```

Lines 151–161:

```
    const candidate = await print(render([...current, node], provisional))
    if (physicalLines(candidate) <= 350) {
      current.push(node)
      continue
    }
    const single = await print(render([node], provisional))
    if (physicalLines(single) > 400) {
      throw new GenerationError({
        reason: `Promise declaration exceeds 400 lines: ${file.path}:${declarationName(node)}`,
      })
    }
```

Lines 188–190:

```
  const oversized = files.find((part) => physicalLines(part.content) > 400)
  if (oversized) throw new GenerationError({ reason: `Promise type layout exceeds 400 lines: ${oversized.path}` })
  return files
```

## C45 — `packages/sdk-next/src/orchestra.ts`

Git blob `0a8009ba9ac8d51b0a0c27363786176479dc8532`.

Lines 14–30:

```
export const create = Effect.fn("Orchestra.create")(function* () {
  const scope = yield* Scope.Scope
  const memoMap = yield* Layer.makeMemoMap
  const context = yield* Layer.buildWithMemoMap(
    AppNodeBuilder.build(LayerNode.group([ApplicationTools.node, PermissionSaved.node, ClaudeCodeAccount.node])),
    memoMap,
    scope,
  )
  const tools = Context.get(context, ApplicationTools.Service)
  const permissions = Context.get(context, PermissionSaved.Service)
  const account = Context.get(context, ClaudeCodeAccount.Service)
  const operator = yield* CapabilityOperator.make({ principal: Principal.account(),
    scope: { placements: "instance", actions: ["*"] } }).pipe(Effect.orDie)
  const web = yield* Effect.acquireRelease(
    Effect.sync(() =>
      HttpRouter.toWebHandler(
        createEmbeddedRoutes({ operator }).pipe(
```

Lines 38–52:

```
        ),
        { disableLogger: true, memoMap },
      ),
    ),
    (web) => Effect.promise(web.dispose),
  )
  const transport = yield* makeOperatorTransport(web.handler, operator).pipe(Effect.orDie)
  const client = yield* Orchestra.make({ baseUrl: "http://orchestra.local", headers: transport.headers }).pipe(
    Effect.provide(FetchHttpClient.layer),
    Effect.provideService(FetchHttpClient.Fetch, transport.fetch),
  )
  return {
    ...client,
    tools: { register: tools.register },
  }
```

## C46 — `packages/sdk-next/src/operator-transport.ts`

Git blob `ef67f666b8ef7a94c270058903d1f8ecf34abbf0`.

Lines 8–27:

```
  const first = yield* operator.issue({ origin: "sdk" })
  const current = { credential: first }
  const renewal = Semaphore.makeUnsafe(1)
  const fetch = Object.assign((input: RequestInfo | URL, init?: RequestInit) => Effect.runPromise(Effect.gen(function* () {
    const request = new Request(input, init)
    // Preserve explicit per-request credentials. Only our captured default is eligible for host renewal.
    if (request.headers.get("authorization") !== `Bearer ${first.bearer}`) return yield* Effect.promise(() => handler(request))
    const credential = yield* renewal.withPermit(Effect.gen(function* () {
      const authenticated = yield* operator.authenticate(current.credential.bearer).pipe(Effect.exit)
      if (Exit.isSuccess(authenticated)) return current.credential
      if (!authenticated.cause.reasons.length || !authenticated.cause.reasons.every((reason) => reason._tag === "Fail" &&
        reason.error._tag === "Capability.Failure" && reason.error.code === "authentication_required"))
        return yield* Effect.failCause(authenticated.cause)
      current.credential = yield* operator.issue({ origin: "sdk" })
      return current.credential
    }))
    request.headers.set("authorization", `Bearer ${credential.bearer}`)
    return yield* Effect.promise(() => handler(request))
  })), { preconnect: () => undefined }) satisfies typeof globalThis.fetch
  return { fetch, headers: Object.freeze({ Authorization: `Bearer ${first.bearer}` }) }
```

## C47 — `packages/server/src/routes.ts`

Git blob `75b0f9753e4c879767ef186f5003519e2b681025`.

Lines 104–105:

```
export function createEmbeddedRoutes(options: Pick<Options, "host" | "operator" | "verifier"> = {}) {
  return makeRoutes(ServerAuth.Config.configLayer({ username: "orchestra", password: Option.none() }), options)
```

Lines 112–112:

```
  const merged = Host.merge(options.host ?? [])
```

END EXACT COMPACT SOURCE EVIDENCE
