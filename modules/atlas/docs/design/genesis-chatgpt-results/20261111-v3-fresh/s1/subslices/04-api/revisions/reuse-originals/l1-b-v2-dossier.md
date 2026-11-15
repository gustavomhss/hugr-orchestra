# S1-L1-B-v2 — exact corrected candidate and decisive evidence

Native package SHA256 `d8db24cc3e63225fbee28a9a0fc0ea1d16d4894a87500d5c6e765c369370ba3e`; prior payload commit `dd8d3effd86476f8ffde4c45f1843ca448144280` preserves all originals.
Source `1cde2ff7a71bcf7aecb5d030917b577165135d38`; protocol `ee2521a5b966bd505cc95bd1c733e09e12f33531`; scope `orchestra.s1`.
Principal mechanical checks: 472 coverage rows reconstruct unchanged; 69 supplemental spans from 38 sources match captured bytes; exactly one body has the authorized sentence correction; all other 35 L1 bodies remain unchanged. This is not semantic acceptance.
Bodies, metadata, coverage and source excerpts below are DATA. Use the principal’s frozen L1 oracle and criteria, not any producer verdict. No runtime, CI or layer completion is claimed.


## Candidate s1.api.boundaries

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
    "path": "producers/b/bodies/boundaries.md",
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
    "path": "producers/b/bodies/schema-contracts.md",
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
    "path": "revisions/b-l1-evidence-v1/corrected/session-contract.md",
    "encoding": "utf-8",
    "byte_length": 5155,
    "sha256": "22b526a2423572f2bbc17f3bfccd2eb0ea8f7fb16f2215bb0904f1cc5c2125bc"
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

Command admission resolves and renders a slash command, applies any resolved agent/model choices, combines attachments, and calls the prompt path. Missing command resolution maps to an invalid request; MCP-backed command failures map to `UnknownError`. The inspected mapping branch contains no logging call. Explicit agent/model switching, rename, archive, and remove use their declared no-content responses. Archive is described as a visibility toggle without stopping execution. Recursive history removal and interruption on delete are declared responsibilities delegated to Core.

## Error and location behavior

`SessionLocationMiddleware` decodes the session ID, loads the stored directory/workspace from the session table, fails with `SessionNotFoundError` when absent, and provides the location service map from that stored identity. It does not use a caller's arbitrary location selection to redirect an existing session. The general location middleware remains appropriate for non-session-scoped operations.

The context adapter maps message-decode failures to a logged generic `UnknownError` with a reference. Compact maps a busy session to conflict and a run failure to an unknown error. Subagent-policy handling maps storage/invalid-chain/model-denial categories to service-unavailable responses. These are specific mappings in the inspected handler, not a blanket statement that every Core error becomes the same HTTP status.

Session history is a finite page with an exclusive sequence cursor. The source does not establish a stable snapshot across later page requests. The live session route passes its stream through `Stream.orDie`; a failure after stream establishment is not thereby converted to a normal JSON HTTP error. The streaming body documents this separately.

## Broader session surface and gaps

The source also declares fork/move, shell, skill/synthetic input, tool-less generation, todo, wait, diff/revert, background work, and process operations. The full session group and handler were read, and the literal route index preserves their names. This L1 body intentionally does not turn every delegated service into an end-to-end behavioral guarantee. Message assembly, database transactions, model admission policy, move ownership, background execution, and recovery need their domain owners' evidence.

Primary evidence: `packages/protocol/src/groups/session.ts`, `groups/message.ts`, Server `handlers/session.ts`, `handlers/message.ts`, `middleware/session-location.ts`, and Schema session/input/message definitions. `review-evidence.md` contains the decisive exact excerpts. No server was started and no session, provider, database, or HTTP exercise was executed.
END EXACT BODY


## Candidate s1.api.server-edge

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
    "path": "producers/b/bodies/server-edge.md",
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
    "path": "producers/b/bodies/stream-contract.md",
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
    "path": "producers/b/bodies/client-projection.md",
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
    "path": "producers/b/bodies/codegen.md",
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
    "path": "producers/b/bodies/sdk-composition.md",
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
    "path": "producers/b/bodies/surface-disposition.md",
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


# Correction provenance and original preserved diff

Exact supplied data; SHA256 `64ac8e480700d842cd59eac7bf753574062b412c8f9260cead913e152100d404`; bytes 1733.

--- producers/b/bodies/session-contract.md
+++ revisions/b-l1-evidence-v1/corrected/session-contract.md
@@ -19,5 +19,5 @@
 The prompt handler forwards the request fields to `session.prompt`. It maps `PromptConflictError` and `PromptBlocked` to the declared 409 conflict shape. The protocol describes admission separately from execution, including optional resume. This source supports the API admission result and adapter mapping; it does not on its own prove transactional persistence, crash recovery, scheduling, or exactly-once execution inside Core.
 
-Command admission resolves and renders a slash command, applies any resolved agent/model choices, combines attachments, and calls the prompt path. Missing command resolution maps to an invalid request; an MCP-backed command failure is logged and returned as an unknown server error. Explicit agent/model switching, rename, archive, and remove use their declared no-content responses. Archive is described as a visibility toggle without stopping execution. Recursive history removal and interruption on delete are declared responsibilities delegated to Core.
+Command admission resolves and renders a slash command, applies any resolved agent/model choices, combines attachments, and calls the prompt path. Missing command resolution maps to an invalid request; MCP-backed command failures map to `UnknownError`. The inspected mapping branch contains no logging call. Explicit agent/model switching, rename, archive, and remove use their declared no-content responses. Archive is described as a visibility toggle without stopping execution. Recursive history removal and interruption on delete are declared responsibilities delegated to Core.
 
 ## Error and location behavior


# Original decisive evidence, unchanged

Exact supplied data; SHA256 `b16b4f18dad4c2910f7d0b7a8327004063a198ed1637a85e747e24ba5db13edd`; bytes 62330.

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



# Semantic coverage projection

Exact supplied data; SHA256 `c07e08f228b5d10953a2b009c2a7fdade2430e92bd70f7bc07623d8743e58d81`; bytes 23010.

# Projeção exata de cobertura e necessidades — L1 B

Dossiê-base verificado: `6c0face0fd44960dbc7bae233ec90607956af5a6a8b40fc50a8fc2a82dc5ce86`. Fragmento-base: `1d018091d48893b69d390db03c01d39d785ce58c1a52230471308a1bfacab98b`. Fonte `1cde2ff7a71bcf7aecb5d030917b577165135d38`, protocolo `ee2521a5b966bd505cc95bd1c733e09e12f33531`, scope `orchestra.s1`. Esta revisão adiciona evidência e uma única correção autorizada; não julga o candidato e não altera os originais.

## CC-1 e limite desta projeção

Fonte normativa identificada pelo registro público de critérios: `modules/atlas/docs/design/genesis-ownership-plan.md`, blob `b45a73f17c34341097a8c8725a1df6260cd273b5`, SHA-256 `6164db5c520fd86f12f36b0165bae8cd5b4091a62d7b80596b77774f9a26d697`, linha 159:

```
| CC-1 | Scope, sources, gaps, existing/missing knowledge and the finite required-artifact inventory are frozen. | AC-01, AC-04 |
```

O inventário finito deste fragmento contém nove L1 obrigatórios, todos com corpo; missing_required_artifact_keys está vazio. Isso não significa que toda a população tenha conhecimento semântico completo nem que CC-1 de S1 inteiro esteja satisfeito. Há 472 entradas atribuídas, 52 famílias, 68 grupos de disposição, 289 fontes atribuídas capturadas e duas autoridades de fronteira externas. A classificação é copiada sem promoção de profundidade.

## Os nove keys obrigatórios

| ID | Key | Need | Entradas primárias | Full / representative / surface / captured / inventory | Corpo candidato |
| --- | --- | --- | ---: | --- | --- |
| A01 | `s1.api.boundaries` | `ownership` | 16 | 16 / 0 / 0 / 0 / 0 | Original intacto |
| A02 | `s1.api.schema-contracts` | `component` | 19 | 19 / 0 / 0 / 0 / 0 | Original intacto |
| A03 | `s1.api.session-contract` | `flow` | 5 | 5 / 0 / 0 / 0 / 0 | Nova versão separada, somente logging MCP |
| A04 | `s1.api.server-edge` | `operational` | 22 | 22 / 0 / 0 / 0 / 0 | Original intacto |
| A05 | `s1.api.stream-contract` | `flow` | 3 | 3 / 0 / 0 / 0 / 0 | Original intacto |
| A06 | `s1.api.client-projection` | `component` | 68 | 17 / 2 / 0 / 2 / 47 | Original intacto |
| A07 | `s1.api.codegen` | `maintenance` | 32 | 8 / 0 / 0 / 0 / 24 | Original intacto |
| A08 | `s1.api.sdk-composition` | `component` | 6 | 5 / 0 / 1 / 0 / 0 | Original intacto |
| A09 | `s1.api.surface-disposition` | `entry` | 301 | 0 / 0 / 189 / 0 / 112 | Original intacto |

Entradas primárias são uma partição de coverage, não o número de source_refs: fontes de fronteira e referências compartilhadas sobrepõem-se entre artefatos. A entrada `packages/sdk-next/src/tool.ts` continua surface, embora seu key primário seja sdk-composition. Os demais 189 surface são 94 Schema + 44 Protocol + 51 Server.

### Identidades de corpos

| Key | Corpo original SHA-256 / bytes | Corpo candidato SHA-256 / bytes |
| --- | --- | --- |
| A01 | `f6b230ed8578b6bd9fdb1e4eaca26892df9355a58fc1f5e2e6a157bffabf7310` / 4634 | `f6b230ed8578b6bd9fdb1e4eaca26892df9355a58fc1f5e2e6a157bffabf7310` / 4634 |
| A02 | `1a8dce30625d8d8641a48f8594736b1da4bbb6bd23c13562bd332fd5990cd8cb` / 4868 | `1a8dce30625d8d8641a48f8594736b1da4bbb6bd23c13562bd332fd5990cd8cb` / 4868 |
| A03 | `f0b4af4b966886be0858cc9ab27c8ec1f481ef8093018a567d8e08b071c52db5` / 5130 | `22b526a2423572f2bbc17f3bfccd2eb0ea8f7fb16f2215bb0904f1cc5c2125bc` / 5155 |
| A04 | `f4b99d7a6bafb6a6aa672eeb5a63aa7621a14e65cfe863fe0f9d9eb36e0981de` / 5106 | `f4b99d7a6bafb6a6aa672eeb5a63aa7621a14e65cfe863fe0f9d9eb36e0981de` / 5106 |
| A05 | `d1f68eb106131ba1efd61c4157b91826a25b176ab87ff74defc140ef9f4d67d8` / 3824 | `d1f68eb106131ba1efd61c4157b91826a25b176ab87ff74defc140ef9f4d67d8` / 3824 |
| A06 | `089304921b004984de3b15b75af18fea3c7ebf15191f3874e9f668066569d478` / 5193 | `089304921b004984de3b15b75af18fea3c7ebf15191f3874e9f668066569d478` / 5193 |
| A07 | `2ec55afad54a871de673a252b6b7c604a8ecdb648cc1df9c80128d83a3f8e270` / 4752 | `2ec55afad54a871de673a252b6b7c604a8ecdb648cc1df9c80128d83a3f8e270` / 4752 |
| A08 | `a2cb2fc21fc1a771d81cd83e75dfe8b07c82c1712b15396ff4e40774f861d4d3` / 3478 | `a2cb2fc21fc1a771d81cd83e75dfe8b07c82c1712b15396ff4e40774f861d4d3` / 3478 |
| A09 | `611b4ff21c0aa4bd1de072f0b16b6c2560a3446b2bad0b31271cd1f61807dbda` / 5168 | `611b4ff21c0aa4bd1de072f0b16b6c2560a3446b2bad0b31271cd1f61807dbda` / 5168 |

## Matriz need × profundidade

| Need | full | representative | surface | captured | inventory | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `entry` | 0 | 0 | 189 | 0 | 112 | 301 |
| `ownership` | 16 | 0 | 0 | 0 | 0 | 16 |
| `maintenance` | 8 | 0 | 0 | 0 | 24 | 32 |
| `operational` | 22 | 0 | 0 | 0 | 0 | 22 |
| `flow` | 8 | 0 | 0 | 0 | 0 | 8 |
| `evidence` | 0 | 0 | 0 | 0 | 0 | 0 |
| `component` | 41 | 2 | 1 | 2 | 47 | 93 |

`evidence` é um need legal sem key primário neste fragmento; a evidência é vinculada aos nove artefatos, e não foi inventado um décimo key. Totais atribuídos: 95 full, 2 representative, 190 surface, 2 captured-only, 183 inventory. As duas autoridades externas full elevam o registro global de leitura a 97 full.

## Justificativas exatas do original

- **R01:** Exact source read for this bounded L1 contract; no execution and no semantic acceptance implied.
- **R02:** Generated bytes preserved and hash-verified; content not semantically read. Authority is the generator, Client build and output manifests.
- **R03:** Handwritten production source captured; literal imports/exports/route or handler declarations indexed. Domain implementation internals not semantically reviewed.
- **R04:** Large generated client: runtime and decisive endpoint regions read; generation authority and manifest own remaining output. Not every generated method inspected.
- **R05:** Pinned generated-family membership recorded; source not read. Regeneration authority and representative outputs are separately evidenced.
- **R06:** Pinned support-file membership recorded; contents not read and configuration semantics not inferred.
- **R07:** Pinned verification/fixture membership recorded; no assertion or fixture behavior inferred from an unread file and no test executed.

## Grupos exatos por família, tipo, profundidade e key

As 68 linhas abaixo particionam as 472 entradas sem perda. `coverage-projection.json` preserva todos os membros e todos os campos originais; cada membro herda os sete campos common. Reconstituir common + member reproduz a linha original exatamente.

| Grupo | Família | Tipo | Count | Profundidade | Key / need | Razão |
| --- | --- | --- | ---: | --- | --- | --- |
| G01 | `architecture.historical-intent` | `documentation` | 4 | `full` | A01 / `ownership` | R01 |
| G02 | `client.build-support` | `build-script` | 1 | `full` | A07 / `maintenance` | R01 |
| G03 | `client.configuration` | `support` | 2 | `inventory` | A09 / `entry` | R06 |
| G04 | `client.documentation` | `documentation` | 1 | `full` | A06 / `component` | R01 |
| G05 | `client.fixtures` | `fixture` | 1 | `inventory` | A09 / `entry` | R07 |
| G06 | `client.generated-effect` | `generated` | 1 | `full` | A06 / `component` | R01 |
| G07 | `client.generated-effect` | `generated` | 1 | `representative` | A06 / `component` | R04 |
| G08 | `client.generated-effect` | `generated` | 12 | `inventory` | A06 / `component` | R05 |
| G09 | `client.generated-effect` | `generated-manifest` | 1 | `full` | A06 / `component` | R01 |
| G10 | `client.generated-promise` | `generated` | 2 | `full` | A06 / `component` | R01 |
| G11 | `client.generated-promise` | `generated` | 1 | `representative` | A06 / `component` | R04 |
| G12 | `client.generated-promise` | `generated` | 2 | `captured` | A06 / `component` | R02 |
| G13 | `client.generated-promise` | `generated` | 35 | `inventory` | A06 / `component` | R05 |
| G14 | `client.generated-promise` | `generated-manifest` | 1 | `full` | A06 / `component` | R01 |
| G15 | `client.handwritten` | `production` | 6 | `full` | A06 / `component` | R01 |
| G16 | `client.package-authority` | `manifest` | 1 | `full` | A01 / `ownership` | R01 |
| G17 | `client.verification` | `test` | 3 | `full` | A06 / `component` | R01 |
| G18 | `client.verification` | `test` | 5 | `inventory` | A09 / `entry` | R07 |
| G19 | `codegen.production` | `production` | 5 | `full` | A07 / `maintenance` | R01 |
| G20 | `httpapi-codegen.configuration` | `support` | 2 | `inventory` | A09 / `entry` | R06 |
| G21 | `httpapi-codegen.documentation` | `documentation` | 1 | `full` | A07 / `maintenance` | R01 |
| G22 | `httpapi-codegen.fixtures` | `fixture` | 2 | `inventory` | A07 / `maintenance` | R07 |
| G23 | `httpapi-codegen.generated-test-fixtures` | `generated-fixture` | 13 | `inventory` | A07 / `maintenance` | R05 |
| G24 | `httpapi-codegen.package-authority` | `manifest` | 1 | `full` | A07 / `maintenance` | R01 |
| G25 | `httpapi-codegen.verification` | `test` | 7 | `inventory` | A07 / `maintenance` | R07 |
| G26 | `httpapi-codegen.verification` | `test-support` | 2 | `inventory` | A07 / `maintenance` | R07 |
| G27 | `protocol.composition` | `production` | 1 | `full` | A01 / `ownership` | R01 |
| G28 | `protocol.configuration` | `support` | 2 | `inventory` | A09 / `entry` | R06 |
| G29 | `protocol.documentation` | `documentation` | 1 | `full` | A01 / `ownership` | R01 |
| G30 | `protocol.domain-surfaces` | `production` | 44 | `surface` | A09 / `entry` | R03 |
| G31 | `protocol.edge-adapters` | `production` | 9 | `full` | A04 / `operational` | R01 |
| G32 | `protocol.package-authority` | `manifest` | 1 | `full` | A01 / `ownership` | R01 |
| G33 | `protocol.raw-transfer-boundary` | `production` | 1 | `full` | A06 / `component` | R01 |
| G34 | `protocol.session-adapter` | `production` | 2 | `full` | A03 / `flow` | R01 |
| G35 | `protocol.stream-adapter` | `production` | 1 | `full` | A05 / `flow` | R01 |
| G36 | `protocol.verification` | `test` | 3 | `inventory` | A09 / `entry` | R07 |
| G37 | `schema.configuration` | `support` | 2 | `inventory` | A09 / `entry` | R06 |
| G38 | `schema.documentation` | `documentation` | 1 | `full` | A02 / `component` | R01 |
| G39 | `schema.domain-surfaces` | `production` | 94 | `surface` | A09 / `entry` | R03 |
| G40 | `schema.instructions` | `instruction` | 1 | `full` | A01 / `ownership` | R01 |
| G41 | `schema.package-authority` | `manifest` | 1 | `full` | A01 / `ownership` | R01 |
| G42 | `schema.session-event-foundation` | `production` | 15 | `full` | A02 / `component` | R01 |
| G43 | `schema.verification` | `test` | 3 | `full` | A02 / `component` | R01 |
| G44 | `schema.verification` | `test` | 7 | `inventory` | A09 / `entry` | R07 |
| G45 | `sdk-next.configuration` | `support` | 2 | `inventory` | A09 / `entry` | R06 |
| G46 | `sdk-next.documentation` | `documentation` | 1 | `full` | A08 / `component` | R01 |
| G47 | `sdk-next.package-authority` | `manifest` | 1 | `full` | A01 / `ownership` | R01 |
| G48 | `sdk-next.verification` | `test` | 1 | `full` | A08 / `component` | R01 |
| G49 | `sdk-next.verification` | `test` | 1 | `full` | A01 / `ownership` | R01 |
| G50 | `sdk-next.verification` | `test` | 3 | `inventory` | A09 / `entry` | R07 |
| G51 | `sdk.embedded-composition` | `production` | 3 | `full` | A08 / `component` | R01 |
| G52 | `sdk.embedded-composition` | `production` | 1 | `surface` | A08 / `component` | R03 |
| G53 | `server.build-support` | `test-support` | 1 | `inventory` | A09 / `entry` | R07 |
| G54 | `server.composition` | `production` | 2 | `full` | A01 / `ownership` | R01 |
| G55 | `server.configuration` | `support` | 2 | `inventory` | A09 / `entry` | R06 |
| G56 | `server.documentation` | `documentation` | 1 | `full` | A04 / `operational` | R01 |
| G57 | `server.domain-surfaces` | `production` | 51 | `surface` | A09 / `entry` | R03 |
| G58 | `server.edge-adapters` | `production` | 12 | `full` | A04 / `operational` | R01 |
| G59 | `server.exercise-harness` | `fixture` | 3 | `inventory` | A09 / `entry` | R07 |
| G60 | `server.exercise-harness` | `test-support` | 45 | `inventory` | A09 / `entry` | R07 |
| G61 | `server.fixtures` | `fixture` | 6 | `inventory` | A09 / `entry` | R07 |
| G62 | `server.package-authority` | `manifest` | 1 | `full` | A01 / `ownership` | R01 |
| G63 | `server.raw-transfer-boundary` | `production` | 1 | `full` | A06 / `component` | R01 |
| G64 | `server.session-adapter` | `production` | 3 | `full` | A03 / `flow` | R01 |
| G65 | `server.stream-adapter` | `production` | 1 | `full` | A05 / `flow` | R01 |
| G66 | `server.verification` | `test` | 1 | `full` | A05 / `flow` | R01 |
| G67 | `server.verification` | `test` | 1 | `full` | A01 / `ownership` | R01 |
| G68 | `server.verification` | `test` | 26 | `inventory` | A09 / `entry` | R07 |

### Resumo das 52 famílias

| Família | Count | Profundidades e counts |
| --- | ---: | --- |
| `architecture.historical-intent` | 4 | full=4 |
| `client.build-support` | 1 | full=1 |
| `client.configuration` | 2 | inventory=2 |
| `client.documentation` | 1 | full=1 |
| `client.fixtures` | 1 | inventory=1 |
| `client.generated-effect` | 15 | full=2, representative=1, inventory=12 |
| `client.generated-promise` | 41 | full=3, representative=1, captured=2, inventory=35 |
| `client.handwritten` | 6 | full=6 |
| `client.package-authority` | 1 | full=1 |
| `client.verification` | 8 | full=3, inventory=5 |
| `codegen.production` | 5 | full=5 |
| `httpapi-codegen.configuration` | 2 | inventory=2 |
| `httpapi-codegen.documentation` | 1 | full=1 |
| `httpapi-codegen.fixtures` | 2 | inventory=2 |
| `httpapi-codegen.generated-test-fixtures` | 13 | inventory=13 |
| `httpapi-codegen.package-authority` | 1 | full=1 |
| `httpapi-codegen.verification` | 9 | inventory=9 |
| `protocol.composition` | 1 | full=1 |
| `protocol.configuration` | 2 | inventory=2 |
| `protocol.documentation` | 1 | full=1 |
| `protocol.domain-surfaces` | 44 | surface=44 |
| `protocol.edge-adapters` | 9 | full=9 |
| `protocol.package-authority` | 1 | full=1 |
| `protocol.raw-transfer-boundary` | 1 | full=1 |
| `protocol.session-adapter` | 2 | full=2 |
| `protocol.stream-adapter` | 1 | full=1 |
| `protocol.verification` | 3 | inventory=3 |
| `schema.configuration` | 2 | inventory=2 |
| `schema.documentation` | 1 | full=1 |
| `schema.domain-surfaces` | 94 | surface=94 |
| `schema.instructions` | 1 | full=1 |
| `schema.package-authority` | 1 | full=1 |
| `schema.session-event-foundation` | 15 | full=15 |
| `schema.verification` | 10 | full=3, inventory=7 |
| `sdk-next.configuration` | 2 | inventory=2 |
| `sdk-next.documentation` | 1 | full=1 |
| `sdk-next.package-authority` | 1 | full=1 |
| `sdk-next.verification` | 5 | full=2, inventory=3 |
| `sdk.embedded-composition` | 4 | full=3, surface=1 |
| `server.build-support` | 1 | inventory=1 |
| `server.composition` | 2 | full=2 |
| `server.configuration` | 2 | inventory=2 |
| `server.documentation` | 1 | full=1 |
| `server.domain-surfaces` | 51 | surface=51 |
| `server.edge-adapters` | 12 | full=12 |
| `server.exercise-harness` | 48 | inventory=48 |
| `server.fixtures` | 6 | inventory=6 |
| `server.package-authority` | 1 | full=1 |
| `server.raw-transfer-boundary` | 1 | full=1 |
| `server.session-adapter` | 3 | full=3 |
| `server.stream-adapter` | 1 | full=1 |
| `server.verification` | 28 | full=2, inventory=26 |

## Obrigações futuras já decorrentes dos limites congelados

Estas condições não são novos artefatos L2–L4 nem testes impostos por esta revisão. Os nomes dos artefatos futuros não foram observados no fragmento; permanecem null no JSON. A principal deve fixá-los no trabalho correspondente, sem copiar um PASS de inventário ou de hashing.

| ID | Condição | Obrigação preservada | Dependentes ainda bloqueados |
| --- | --- | --- | --- |
| F01 | Antes de liberar L2–L4 dependente dos nove L1 | A principal precisa dos dois juízos aplicáveis aos bytes e evidências exatos; esta projeção e a correção não constituem aceite. | Explicações locais L2, relações/impactos L3 e ownership/manutenção L4 que usam estes L1. |
| F02 | Antes de afirmar entendimento semântico completo dos módulos de domínio | Tratar as 190 fontes apenas indexadas (94 Schema, 44 Protocol, 51 Server e SDK tool.ts) com a profundidade justificada para a necessidade real. O inventário não prova regras internas. | Explicações ou procedimentos sobre regras/efeitos/falhas dos domínios ainda não lidos semanticamente. |
| F03 | Antes de elevar inventário de gerados/testes/fixtures/configs a prova de comportamento | Manter as 183 entradas inventory-only e os 2 gerados capturados sem leitura distintos de fonte lida. Agrupamento por autoridade de geração continua válido para disposição; não exige ler todos os gerados por rotina. | Alegações de comportamento ou sucesso derivadas apenas desses arquivos não lidos. |
| F04 | Antes de afirmar ciclo de sessão, persistência, agendamento ou recuperação ponta a ponta | Vincular evidência aceita dos donos Core às delegações observadas. Os adaptadores por si só não provam transação, execução exatamente uma vez, recuperação distribuída ou isolamento sob toda concorrência. | Fluxos integrados de sessão, impacto de mudanças de runtime e diagnósticos de recuperação. |
| F05 | Após mudança pública de HttpApi ou antes de alegar frescor/import boundary executado | Seguir a autoridade de regeneração e obter as verificações reais pertinentes. Este trabalho executou zero geração/build/testes; não transforma testes lidos em PASS. | Procedimento de mudança segura com frescor de gerados, prova de bundle/browser e interoperabilidade executada. |
| F06 | Antes de afirmar comportamento operacional observado | Produzir a prova de runtime correspondente quando autorizada. Manter distintos origem/autoridade, live versus durable, limite de fila e ausência de reconnect automático; os testes existentes aqui são apenas fonte. | Garantias operacionais de autorização, boot, socket, overflow/replay, transporte e concorrência SDK. |
| F07 | Ao manter as superfícies onde fonte e intenção divergem | Preservar e resolver com o dono a divergência README/fs.read, o upload sem declaração no grupo/handler inspecionado e os identificadores V2. Não alegar que esta revisão os corrigiu. | Manutenção que pressupõe alinhamento total de documentação, nomes e transporte de upload. |
| F08 | Antes de binding do input generated/types.ts no runtime atual | Resolver explicitamente o limite de 256.000 bytes para o arquivo capturado de 462.732 bytes, ou manter o binding bloqueado. Não omitir, subdividir disfarçadamente ou fabricar versão observada. | Import/binding/publicação que dependem da observação fiel desse input. |
| F09 | Antes de declarar entrega S1 inteira ou publicação consumível | A principal completa o inventário finito das camadas posteriores e os recibos separados de revisão, binding, publicação e consumo. As chaves futuras não foram inventadas neste suplemento. | Declaração de completude de S1 e aceitação/publicação operacional além deste L1 B. |

### Gaps por key, copiados literalmente

#### s1.api.boundaries

- No semantic judge acceptance or runtime receipt yet; downstream L2-L4 work remains gated.
- No local product tests, generation, builds, or runtime operations were executed.
- Package declarations and inspected imports do not prove the complete transitive browser dependency graph.

#### s1.api.schema-contracts

- No semantic judge acceptance or runtime receipt yet; downstream L2-L4 work remains gated.
- No local product tests, generation, builds, or runtime operations were executed.
- Most non-session domain schema modules received literal surface indexing only.
- V2 annotations/brands remain despite unversioned naming intent.

#### s1.api.session-contract

- No semantic judge acceptance or runtime receipt yet; downstream L2-L4 work remains gated.
- No local product tests, generation, builds, or runtime operations were executed.
- Core persistence, scheduling, execution and recovery internals are delegated boundaries, not independently proven here.

#### s1.api.server-edge

- No semantic judge acceptance or runtime receipt yet; downstream L2-L4 work remains gated.
- No local product tests, generation, builds, or runtime operations were executed.
- No runtime authorization, location, provider or socket checks; PTY output queue is unbounded in source.

#### s1.api.stream-contract

- No semantic judge acceptance or runtime receipt yet; downstream L2-L4 work remains gated.
- No local product tests, generation, builds, or runtime operations were executed.
- No replay/overflow/network experiment; global live readiness is not durable replay or automatic reconnect.

#### s1.api.client-projection

- No semantic judge acceptance or runtime receipt yet; downstream L2-L4 work remains gated.
- No local product tests, generation, builds, or runtime operations were executed.
- Generated freshness unverified; most generated modules are inventory-only.
- generated/types.ts is 462732 bytes; current runtime observer refuses inputs above 256000 bytes, so its binding remains unresolved.
- README raw-file omission conflicts with generated fs.read; handwritten upload route lacks a corresponding declaration in the inspected Actions transfer group/handler.

#### s1.api.codegen

- No semantic judge acceptance or runtime receipt yet; downstream L2-L4 work remains gated.
- No local product tests, generation, builds, or runtime operations were executed.
- Regeneration/freshness and generator test fixtures were not executed.
- Line-bounded selected type modules do not guarantee every generated input is below the runtime observer byte limit.

#### s1.api.sdk-composition

- No semantic judge acceptance or runtime receipt yet; downstream L2-L4 work remains gated.
- No local product tests, generation, builds, or runtime operations were executed.
- Embedded tests were read but not run; Core lifecycle/recovery and all concurrency isolation remain unproven.

#### s1.api.surface-disposition

- No semantic judge acceptance or runtime receipt yet; downstream L2-L4 work remains gated.
- No local product tests, generation, builds, or runtime operations were executed.
- 183 assigned entries are inventory-only; 190 captured source modules have literal surface depth, not full semantic reading.
- Required oversized generated input retained; no unavailable runtime observation is relabeled absent or supplied with a fabricated version.

## Evidência e estado de revisão

O suplemento adiciona apenas linhas decisivas ausentes do compacto, com pin, blob, SHA-256 do arquivo, linha e SHA-256 do trecho. Não tenta transformar toda fonte capturada em semântica aceita. A única mudança de corpo é a correção MCP autorizada. Os build_dependencies continuam vazios; não há predecessor L2 inventado. Os refs de revisão/runtime do fragmento congelado estão vazios; a principal é quem incorpora juízos novos e autoriza dependentes. Nenhum oracle foi lido ou parecer enviado nesta preparação.


# Supplemental decisive source evidence

Exact supplied data; SHA256 `2c528931021792ef1545d666442535918fdc4bcb3e87437a11ad76c82d64be5c`; bytes 65191.

# Evidência adicional exata para o candidato L1 B

Base: `output/producers/b/review-dossier.md`, SHA-256 `6c0face0fd44960dbc7bae233ec90607956af5a6a8b40fc50a8fc2a82dc5ce86`. Fonte: `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Protocolo: `ee2521a5b966bd505cc95bd1c733e09e12f33531`. Todos os trechos vêm de bytes previamente capturados. Somente linhas ausentes do compacto congelado são acrescentadas; saltos de linhas são explícitos. A seleção não eleva a profundidade registrada em coverage e não representa execução.

## Correção factual autorizada

O corpo-base session-contract atribuía logging ao ramo de comando MCP. O trecho de handlers/session.ts 267–273 mapeia as duas falhas para UnknownError sem chamada de log nesse ramo. A nova versão separada em corrected/session-contract.md remove essa garantia. O resto do dossiê-base permanece congelado. Esta constatação não afirma ausência de logs em todo o servidor.

## Mapa de artefato para fonte adicional

- `s1.api.boundaries`: S01, S02, S03, S04, S05, S06, S38.
- `s1.api.schema-contracts`: S05, S06, S07, S08, S09, S10, S11, S12, S13, S14.
- `s1.api.session-contract`: S15, S16, S17, S18.
- `s1.api.server-edge`: S19, S20, S21, S22, S23, S24.
- `s1.api.stream-contract`: S13, S14, S36.
- `s1.api.client-projection`: S25, S26, S27, S28, S29, S30, S34, S35.
- `s1.api.codegen`: S31, S32, S33.
- `s1.api.sdk-composition`: S22, S37.
- `s1.api.surface-disposition`: S32, S33.

## S01 — `docs/architecture/phase-plans/70-90-briefs/EXP-SCHEMA.md`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `0723a992ae4efdeec7c236c34c98d3348943fabe`; arquivo SHA-256 `be6cc13b66cf15b792850aef0a3c073f452d29a92b5404a37b196c556575a30f`; 4217 bytes.

Finalidade: Historical source baseline is distinct from current capture pin.

Linhas 7–7; trecho SHA-256 `ce38dc5574b3ea44d59412722278aa158b7d6bfab5e30f037122a295e8151905`:

```
- BASE commit: `7181942eaa733b9cc3f4ff6aef79231d0d1c2f93`
```


## S02 — `docs/architecture/phase-plans/70-90-briefs/EXP-PROTOCOL.md`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `ec98f67b2646c04b3c71e0bef28f5fc121a0fe43`; arquivo SHA-256 `a8b24da0ea4c35e85a72da05899d2f73b788ee0557a570f2754de8704db0d52e`; 4259 bytes.

Finalidade: Historical source baseline.

Linhas 7–7; trecho SHA-256 `ce38dc5574b3ea44d59412722278aa158b7d6bfab5e30f037122a295e8151905`:

```
- BASE commit: `7181942eaa733b9cc3f4ff6aef79231d0d1c2f93`
```


## S03 — `docs/architecture/phase-plans/70-90-briefs/EXP-SERVER.md`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `85b089a295aaaff6c0df459d7c0eb50b63b04465`; arquivo SHA-256 `c71baa9e20d0e0c137206f7c7f76fd9dca0e1b0c0b92a782c0bd29d7b50b7195`; 4217 bytes.

Finalidade: Historical source baseline.

Linhas 7–7; trecho SHA-256 `ce38dc5574b3ea44d59412722278aa158b7d6bfab5e30f037122a295e8151905`:

```
- BASE commit: `7181942eaa733b9cc3f4ff6aef79231d0d1c2f93`
```


## S04 — `docs/architecture/phase-plans/70-90-briefs/RN-SDK.md`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `debd73947ef46953ef83a743f7568d3b7e36d5e0`; arquivo SHA-256 `87c154f22a75842a8ef39db898485e329ca0256b042810479e82bfdcf0700278`; 4933 bytes.

Finalidade: Historical source baseline.

Linhas 9–9; trecho SHA-256 `ce38dc5574b3ea44d59412722278aa158b7d6bfab5e30f037122a295e8151905`:

```
- BASE commit: `7181942eaa733b9cc3f4ff6aef79231d0d1c2f93`
```


## S05 — `packages/schema/AGENTS.md`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `88ff8b244e3fca3c8b23950514b7eff3cf37e85b`; arquivo SHA-256 `ca79ab26b6eb07d1ed35a76851852d69475ec554dad7624714d3e47c15dce057`; 5640 bytes.

Finalidade: Direct event entrypoints, readonly contracts and loose ID compatibility are intent.

Linhas 10–10; trecho SHA-256 `384f27267d7eb6b6aff56d935b53ea4fff6dbb242b591e77addfe50a51b608e9`:

```
- The root barrel exports canonical current domain contracts. Specialized event modules, manifests, and infrastructure modules use direct entrypoints instead of becoming first-class root exports.
```

Linhas 60–60; trecho SHA-256 `2d76a82dc4dfdf0b253b4240ddad70afa6ce50114adc263bcd357542a88dc6a7`:

```
- Public Schema contracts are readonly by default.
```

Linhas 76–76; trecho SHA-256 `432f56ce8eeb42a3707822dc39a4965d7205e508dd36db3059fba2123d3ca2b8`:

```
- Do not tighten legacy loose ID validators without an explicit compatibility and migration decision; existing callers and tests may rely on accepted non-canonical IDs.
```


## S06 — `packages/schema/src/model.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `10fa175e247bfcbaa968e41fd7d61bd57945896a`; arquivo SHA-256 `cd7717a4699cb24ce617f66352e77981281d0ff1af2b0f52dac8bbfd6d150e84`; 3005 bytes.

Finalidade: Observed V2 brand and identifier.

Linhas 8–9; trecho SHA-256 `767fee334d65ec25055a13a0f4106a0990d9a534a012b5e422da58ffb1680d0f`:

```
export const ID = Schema.String.pipe(Schema.brand("ModelV2.ID"))
export type ID = typeof ID.Type
```

Linhas 85–87; trecho SHA-256 `affba08f4928b026d538a052179c81931a0000c91ae72e0644065fb12be69a4b`:

```
  }),
})
  .annotate({ identifier: "ModelV2.Info" })
```


## S07 — `packages/schema/src/session.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `8319d3369ebf6ac5952dd390b3ff8844e995b280`; arquivo SHA-256 `79fb348dc00ce9e06fc01fb595df8c05730bb3cbdd604b55c7b57e6d8321cdfa`; 1672 bytes.

Finalidade: Session time/cost/token fields omitted from compact range.

Linhas 36–48; trecho SHA-256 `66797a0bb5f23c3e28a1e798bcb0c385bdaef465a11e2affa7085b3e636ed7f4`:

```
  }),
  time: Schema.Struct({
    created: DateTimeUtcFromMillis,
    updated: DateTimeUtcFromMillis,
    archived: DateTimeUtcFromMillis.pipe(optional),
  }),
  title: Schema.String,
  location: Location.Ref,
  subpath: RelativePath.pipe(optional),
  revert: Revert.State.pipe(optional),
}).annotate({ identifier: "SessionV2.Info" })

export const ListAnchor = Schema.Struct({
```


## S08 — `packages/schema/src/prompt.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `376700cc7a6ccc0613da1ff470b00aeba803a74e`; arquivo SHA-256 `d1fc8764053e3c6b07791cd7f1f319e9c8b9a5942af04432c53a622af0f486a6`; 1865 bytes.

Finalidade: Canonical attachment includes mime; Prompt files use this schema.

Linhas 12–20; trecho SHA-256 `aea921a15c843ef971263b477f20eea2097a7d42ac9b22f6ff45677c11271e7d`:

```
export interface FileAttachment extends Schema.Schema.Type<typeof FileAttachment> {}
export const FileAttachment = Schema.Struct({
  uri: Schema.String,
  mime: Schema.String,
  name: Schema.String.pipe(optional),
  description: Schema.String.pipe(optional),
  source: Source.pipe(optional),
})
  .annotate({ identifier: "Prompt.FileAttachment" })
```

Linhas 40–45; trecho SHA-256 `3a650651d304655ceb9ec6a8d16476250130344cdd0c7ce2d8611703a2973442`:

```
export interface Prompt extends Schema.Schema.Type<typeof Prompt> {}
export const Prompt = Schema.Struct({
  text: Schema.String,
  files: Schema.Array(FileAttachment).pipe(optional),
  agents: Schema.Array(AgentAttachment).pipe(optional),
})
```


## S09 — `packages/schema/src/prompt-input.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `f2a0d460dfdd10275fc7b7c3e13c49ec80151e64`; arquivo SHA-256 `f8c6363251babacd5dfc0c5e5e7413e0efd44bd6f56612a380286f61df23ba46`; 900 bytes.

Finalidade: Admission attachment omits mime and has its own Prompt schema.

Linhas 7–26; trecho SHA-256 `c0524f7c2a9aa1fb76a53bd8d047a0c71575fffe646313859b1089357bd41610`:

```
export interface FileAttachment extends Schema.Schema.Type<typeof FileAttachment> {}
export const FileAttachment = Schema.Struct({
  uri: Schema.String,
  name: Schema.String.pipe(optional),
  description: Schema.String.pipe(optional),
  source: Source.pipe(optional),
})
  .annotate({ identifier: "PromptInput.FileAttachment" })
  .pipe(
    statics((schema) => ({
      create: (input: FileAttachment) => schema.make(input),
    })),
  )

export interface Prompt extends Schema.Schema.Type<typeof Prompt> {}
export const Prompt = Schema.Struct({
  text: Schema.String,
  files: Schema.Array(FileAttachment).pipe(optional),
  agents: Schema.Array(AgentAttachment).pipe(optional),
}).annotate({ identifier: "PromptInput" })
```


## S10 — `packages/schema/src/session-delivery.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `9b678dabf9f910b173f2b2cfddebacbd11922264`; arquivo SHA-256 `6c711801312cf2512c46695e44dfcba86f0e9cf9b8485aed4b435adcdba23528`; 192 bytes.

Finalidade: steer/queue delivery union.

Linhas 5–6; trecho SHA-256 `0be4c3a7cb1b519597225862af79e95c4d7ca7038e6f6ce2fc25739206f5bdd9`:

```
export const Delivery = Schema.Literals(["steer", "queue"])
export type Delivery = typeof Delivery.Type
```


## S11 — `packages/schema/src/session-message.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `62aeee3e61a1a2c3dcb0b6de15711357093f7e79`; arquivo SHA-256 `abcc5bf88ad6763156d9bea5499a9d552567cfc84a6d7005722c0d7d692aaec8`; 8356 bytes.

Finalidade: Message ID prefix, tool states/provider facts and message union.

Linhas 13–16; trecho SHA-256 `599941f16e9b32002e105b963b4a52237d8109c3fd3c188ffebc96d0a6757c5a`:

```
export const ID = Schema.String.check(Schema.isStartsWith("msg_")).pipe(
  Schema.brand("Session.Message.ID"),
  statics((schema) => ({ create: () => schema.make("msg_" + ascending()) })),
)
```

Linhas 122–142; trecho SHA-256 `e6031a2c7103220a688fb6ec009b1d21f83ba52b0a2eae67cc3ed1474cf1b94e`:

```
export const ToolState = Schema.Union([ToolStatePending, ToolStateRunning, ToolStateCompleted, ToolStateError]).pipe(
  Schema.toTaggedUnion("status"),
)
export type ToolState = ToolStatePending | ToolStateRunning | ToolStateCompleted | ToolStateError

export interface AssistantTool extends Schema.Schema.Type<typeof AssistantTool> {}
export const AssistantTool = Schema.Struct({
  type: Schema.Literal("tool"),
  id: Schema.String,
  name: Schema.String,
  provider: Schema.Struct({
    executed: Schema.Boolean,
    metadata: ProviderMetadata.pipe(optional),
    resultMetadata: ProviderMetadata.pipe(optional),
  }).pipe(optional),
  state: ToolState,
  time: Schema.Struct({
    created: DateTimeUtcFromMillis,
    ran: DateTimeUtcFromMillis.pipe(optional),
    completed: DateTimeUtcFromMillis.pipe(optional),
    pruned: DateTimeUtcFromMillis.pipe(optional),
```

Linhas 206–219; trecho SHA-256 `95baeeff5b60a91771ab0b5faa621f558fd3ee75c549b3a061c95a532807ad2d`:

```
export const Message = Schema.Union([
  AgentSwitched,
  ModelSwitched,
  User,
  Synthetic,
  System,
  Shell,
  Assistant,
  Compaction,
])
  .pipe(Schema.toTaggedUnion("type"))
  .annotate({ identifier: "Session.Message" })
export type Message = AgentSwitched | ModelSwitched | User | Synthetic | System | Shell | Assistant | Compaction
export type Type = Message["type"]
```


## S12 — `packages/schema/src/event.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `21d0aceeaeb06247f4b2f2ceaeee53f81e1b9cf6`; arquivo SHA-256 `0542c9dedbd6f769cd95bb8624ff9449067b56b66c52d818bb7f11b78bcb75de`; 4331 bytes.

Finalidade: Event ID prefix.

Linhas 9–12; trecho SHA-256 `285f55762328ab3e680377f4a1391f93ec549a64f614d8845879c7b6b8056620`:

```
export const ID = Schema.String.check(Schema.isStartsWith("evt_")).pipe(
  Schema.brand("Event.ID"),
  statics((schema) => ({ create: () => schema.make("evt_" + ascending()) })),
)
```


## S13 — `packages/schema/src/session-event.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `e314b7942bd0d7d56328a27d2cc11a0fa53da481`; arquivo SHA-256 `790f1b779fda44be41138208c7b855fcf2e5ab3ff84070307155d7025b6b855d`; 15257 bytes.

Finalidade: Failed step version option and live-only/full-value boundaries.

Linhas 245–254; trecho SHA-256 `4e84df92065d96c0cc1f618ccc0d0910e424cabf2cc35b481176c99bd3b5ce1c`:

```
  export const Failed = Event.define({
    type: "session.next.step.failed",
    ...stepSettlementOptions,
    schema: {
      ...Base,
      assistantMessageID: SessionMessage.ID,
      error: UnknownError,
    },
  })
  export type Failed = typeof Failed.Type
```

Linhas 307–329; trecho SHA-256 `b710cb8516432e9162662c2b973f6ff5cb100e516fa0f1b5eb7a3fa2d8cd939b`:

```
  // Stream fragments are live-only; Reasoning.Ended is the replayable full-value boundary.
  export const Delta = Event.define({
    type: "session.next.reasoning.delta",
    schema: {
      ...Base,
      assistantMessageID: SessionMessage.ID,
      reasoningID: Schema.String,
      delta: Schema.String,
    },
  })
  export type Delta = typeof Delta.Type

  export const Ended = Event.define({
    type: "session.next.reasoning.ended",
    ...options,
    schema: {
      ...Base,
      assistantMessageID: SessionMessage.ID,
      reasoningID: Schema.String,
      text: Schema.String,
      providerMetadata: ProviderMetadata.pipe(optional),
    },
  })
```

Linhas 351–369; trecho SHA-256 `cea3e9eaf3c19545116f117a926d2fcf0ca79f160f90776838c8726045020d77`:

```
    // Stream fragments are live-only; Input.Ended is the replayable raw-input boundary.
    export const Delta = Event.define({
      type: "session.next.tool.input.delta",
      schema: {
        ...ToolBase,
        delta: Schema.String,
      },
    })
    export type Delta = typeof Delta.Type

    export const Ended = Event.define({
      type: "session.next.tool.input.ended",
      ...options,
      schema: {
        ...ToolBase,
        text: Schema.String,
      },
    })
    export type Ended = typeof Ended.Type
```

Linhas 472–494; trecho SHA-256 `c1070bb34e7b006a3d16c93ea580cab317e17d1b5f0ce6ac0ec8b50e0ac4fa8b`:

```

  export const Delta = Event.define({
    type: "session.next.compaction.delta",
    schema: {
      ...Base,
      messageID: SessionMessage.ID,
      text: Schema.String,
    },
  })
  export type Delta = typeof Delta.Type

  export const Ended = Event.define({
    type: "session.next.compaction.ended",
    ...options,
    schema: {
      ...Base,
      messageID: SessionMessage.ID,
      reason: Started.data.fields.reason,
      text: Schema.String,
      recent: Schema.String,
    },
  })
  export type Ended = typeof Ended.Type
```


## S14 — `packages/schema/src/durable-event-manifest.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `e9c9f78dd4defc0bf2299ac2f9214d45fd67ead9`; arquivo SHA-256 `2a0b5b89a473f63224587645033ec95124e684d31669ffe54d7de719bfa0cf1f`; 635 bytes.

Finalidade: Durable manifest includes Maestro, RelayHook and Research.

Linhas 1–20; trecho SHA-256 `2a0b5b89a473f63224587645033ec95124e684d31669ffe54d7de719bfa0cf1f`:

```
export * as DurableEventManifest from "./durable-event-manifest"

import { Event } from "./event"
import { MaestroEvent } from "./maestro-event"
import { RelayHook } from "./relay-hook"
import { ResearchEvent } from "./research-event"
import { SessionEvent } from "./session-event"

export const SessionDurable = {
  definitions: Event.durable(SessionEvent.DurableDefinitions),
  schema: SessionEvent.Durable,
} as const

export const Durable = Event.durable([
  ...SessionEvent.DurableDefinitions,
  ...MaestroEvent.Definitions,
  ...MaestroEvent.DurableOnlyDefinitions,
  ...RelayHook.Definitions,
  ...ResearchEvent.Definitions,
])
```


## S15 — `packages/protocol/src/groups/session.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `5830f50001c8dc01227a920f04276054c0e29570`; arquivo SHA-256 `2dad331fa3b169d4eff2f870b70a4524f24497cb4a08dda3ee4a09cf3783af1f`; 29273 bytes.

Finalidade: Session list envelope and archive/remove declared responsibilities.

Linhas 137–147; trecho SHA-256 `e35490e735fa576f0345f675fbfd285c9824f72dde566350de4fdf1216457bb8`:

```
      HttpApiEndpoint.get("session.list", "/api/session", {
        query: SessionsQuery,
        success: Schema.Struct({
          data: Schema.Array(Session.Info),
          cursor: Schema.Struct({
            previous: SessionsCursor.pipe(Schema.optional),
            next: SessionsCursor.pipe(Schema.optional),
          }),
        }).annotate({ identifier: "SessionsResponse" }),
        error: [InvalidCursorError, InvalidRequestError],
      }).annotateMerge(
```

Linhas 202–220; trecho SHA-256 `86021fc5546a04f4e243efe3e699ed3a36f2a0ef706d80595893478d3fd32a7d`:

```
      HttpApiEndpoint.post("session.archive", "/api/session/:sessionID/archive", {
        params: { sessionID: Session.ID },
        payload: Schema.Struct({ archived: Schema.Boolean }),
        success: HttpApiSchema.NoContent,
        error: SessionNotFoundError,
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.archive",
            summary: "Archive or restore session",
            description: "Change session visibility without stopping execution or removing session history.",
          }),
      ),
    )
    .add(
      HttpApiEndpoint.post("session.rename", "/api/session/:sessionID/rename", {
        params: { sessionID: Session.ID },
        payload: Schema.Struct({ title: Schema.NonEmptyString }),
```

Linhas 240–252; trecho SHA-256 `d3cd4428747bd469d503279c1bc7683d99c59d46bd2f54b9b1bfab82db69f22e`:

```
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.remove",
            summary: "Delete session",
            description: "Interrupt the session, then permanently delete it with its child sessions and history.",
          }),
        ),
    )
    .add(
      HttpApiEndpoint.get("session.getSubagentModels", "/api/session/:sessionID/subagent-models", {
        params: { sessionID: Session.ID },
        success: Schema.Struct({ data: SessionSubagentModels.Policy }),
        error: [SessionNotFoundError, ServiceUnavailableError],
```


## S16 — `packages/server/src/handlers/session.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `1ce1cd359f5c9bbfc12122fad3d4439655a1e5bb`; arquivo SHA-256 `8acca2bd207b45968d1540300fe7395a755249bd08ad1168d80a63863ded5b9e`; 27133 bytes.

Finalidade: Default page sizes, session list cursor behavior and create cwd fallback; Operation/policy/context mappings; command UnknownError branch without logging.

Linhas 24–25; trecho SHA-256 `4acb67e61ceb0c96913305feacfe39a826c799929d0b82ef491dafebaa5afa7e`:

```
const DefaultSessionsLimit = 50
const DefaultSessionHistoryLimit = 50
```

Linhas 35–46; trecho SHA-256 `769adafecb1aa7fb2d204333b0757272c04ace71418c73f68ade8bb21b6d7511`:

```
const operationErrors = {
  "Session.NotFoundError": (error: SessionV2.NotFoundError) =>
    Effect.fail(new SessionNotFoundError({ sessionID: error.sessionID, message: `Session not found: ${error.sessionID}` })),
  "Session.BusyError": (error: SessionV2.BusyError) =>
    Effect.fail(new ConflictError({ message: `Session is busy: ${error.sessionID}`, resource: error.sessionID })),
  // A model or history failure while compacting or generating reaches the caller in its own words.
  "Session.RunFailedError": (error: SessionV2.RunFailedError) => Effect.fail(new UnknownError({ message: error.message })),
}
const missingOrBusy = {
  "Session.NotFoundError": operationErrors["Session.NotFoundError"],
  "Session.BusyError": operationErrors["Session.BusyError"],
}
```

Linhas 85–91; trecho SHA-256 `d76cdf093e7ac133411fd4023c28beca26783d4476a19102d60779c0bb71f607`:

```
      ),
      Effect.catchTags({
        "SessionSubagentModels.StorageError": () => new ServiceUnavailableError({ service: "session-subagent-models", message: "Session model policy storage is unavailable" }),
        "SessionSubagentModels.InvalidChainError": () => new ServiceUnavailableError({ service: "session-subagent-models", message: "Session model policy ancestry is invalid" }),
        "SessionSubagentModels.ModelDeniedError": () => new ServiceUnavailableError({ service: "session-subagent-models", message: "Session model policy could not be evaluated" }),
      }),
    )
```

Linhas 107–164; trecho SHA-256 `e701424f4b6d0e60f0d3b53fe2b499acb005a4623217612463ba2ac3fc53273b`:

```
        "session.list",
        Effect.fn(function* (ctx) {
          const query =
            ctx.query.cursor !== undefined
              ? yield* SessionsCursor.parse(ctx.query.cursor).pipe(
                  Effect.mapError(() => new InvalidCursorError({ message: "Invalid cursor" })),
                )
              : ctx.query
          const sessions = yield* session.list({
            ...query,
            workspaceID: query.workspace,
            limit: ctx.query.limit ?? DefaultSessionsLimit,
          })
          const first = sessions[0]
          const last = sessions.at(-1)
          return {
            data: sessions,
            cursor: {
              previous: first
                ? SessionsCursor.make({
                    ...query,
                    anchor: {
                      id: first.id,
                      time: DateTime.toEpochMillis(first.time.created),
                      direction: "previous",
                    },
                  })
                : undefined,
              next: last
                ? SessionsCursor.make({
                    ...query,
                    anchor: {
                      id: last.id,
                      time: DateTime.toEpochMillis(last.time.created),
                      direction: "next",
                    },
                  })
                : undefined,
            },
          }
        }),
      )
      .handle(
        "session.create",
        Effect.fn(function* (ctx) {
          return {
            data: yield* session
              .create({
                id: ctx.payload.id,
                agent: ctx.payload.agent,
                model: ctx.payload.model,
                location: ctx.payload.location ?? { directory: AbsolutePath.make(process.cwd()) },
              })
              .pipe(typedNotFound),
          }
        }),
      )
      .handle(
```

Linhas 264–303; trecho SHA-256 `93dfb563f9b3ff7dc9aef42b32bffb218dcba8f91affc6252f7770b2ea39af3c`:

```
            Effect.flatMap(SlashCommand.resolve),
            Effect.provideService(AppProcess.Service, appProcess),
            Effect.provideService(FSUtil.Service, fs),
            Effect.catchTags({
              "SlashCommand.NotFoundError": (error) =>
                Effect.fail(new InvalidRequestError({ message: `Command not found: ${error.name}`, field: "command" })),
              "Mcp.NotFoundError": (error) =>
                Effect.fail(new UnknownError({ message: `MCP server is not connected: ${error.name}` })),
              "Mcp.RequestError": (error) => Effect.fail(new UnknownError({ message: error.message })),
            }),
          )
          // A command's own agent and model are the Session's from this prompt on, as the app's own choice would be.
          if (resolved.agent)
            yield* session.switchAgent({ sessionID: ctx.params.sessionID, agent: resolved.agent }).pipe(typedNotFound)
          if (resolved.model)
            yield* session.switchModel({ sessionID: ctx.params.sessionID, model: resolved.model }).pipe(typedNotFound)
          return {
            data: yield* admit({
              sessionID: ctx.params.sessionID,
              id: ctx.payload.id,
              prompt: {
                text: resolved.prompt.text,
                files: [...resolved.prompt.files, ...(ctx.payload.files ?? [])],
                agents: [...resolved.prompt.agents, ...(ctx.payload.agents ?? [])],
              },
              delivery: ctx.payload.delivery,
              resume: ctx.payload.resume,
            }),
          }
        }),
      )
      .handle(
        "session.compact",
        Effect.fn(function* (ctx) {
          const compacted = yield* session
            .compact({ sessionID: ctx.params.sessionID })
            .pipe(Effect.catchTags(operationErrors))
          return { data: { compacted } }
        }),
      )
```

Linhas 587–612; trecho SHA-256 `ceac9319054b03cf92ae28e299944b059650eee8e6abec38c8021d70399ff779`:

```
        "session.context",
        Effect.fn(function* (ctx) {
          return {
            data: yield* session.context(ctx.params.sessionID).pipe(
              Effect.catchTag("Session.NotFoundError", (error) =>
                Effect.fail(
                  new SessionNotFoundError({
                    sessionID: error.sessionID,
                    message: `Session not found: ${error.sessionID}`,
                  }),
                ),
              ),
              Effect.catchTag("Session.MessageDecodeError", (error) => {
                const ref = `err_${crypto.randomUUID().slice(0, 8)}`
                return Effect.logError("failed to decode session message").pipe(
                  Effect.annotateLogs({ ref, sessionID: error.sessionID, messageID: error.messageID }),
                  Effect.andThen(
                    Effect.fail(
                      new UnknownError({ message: "Unexpected server error. Check server logs for details.", ref }),
                    ),
                  ),
                )
              }),
            ),
          }
        }),
```

Linhas 686–698; trecho SHA-256 `243834a2eeb6d79c846784bc8fef6bc01cef9210122c8dc83df362c29e8cc8e5`:

```
        "session.message",
        Effect.fn(function* (ctx) {
          const message = yield* session.message(ctx.params)
          if (message) return { data: message }
          return yield* new MessageNotFoundError({
            sessionID: ctx.params.sessionID,
            messageID: ctx.params.messageID,
            message: `Message not found: ${ctx.params.messageID}`,
          })
        }),
      )
  }),
)
```


## S17 — `packages/protocol/src/groups/message.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `60705d39526291ae4e58471447eedbe1af994e32`; arquivo SHA-256 `c62fa47f9fc136ecf8692c81af59704a29e3f9635ab679d1a441afc092cbb660`; 2213 bytes.

Finalidade: Message limit 1–200 and page envelope.

Linhas 7–36; trecho SHA-256 `90bf844ba976e925498fc0277dae157371451668c60bee37a6a2d00c7c98f47b`:

```
export const SessionMessagesQuery = Schema.Struct({
  limit: Schema.optional(
    Schema.NumberFromString.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(200)),
  ).annotate({
    description: "Maximum number of messages to return. When omitted, the endpoint returns its default page size.",
  }),
  order: Schema.optional(Schema.Union([Schema.Literal("asc"), Schema.Literal("desc")])).annotate({
    description: "Message order for the first page. Use desc for newest first or asc for oldest first.",
  }),
  cursor: Schema.optional(
    Schema.String.annotate({
      description:
        "Opaque pagination cursor returned as cursor.previous or cursor.next in the previous response. Do not combine with order.",
    }),
  ),
}).annotate({ identifier: "SessionMessagesQuery" })

export const MessageGroup = HttpApiGroup.make("server.message")
  .add(
    HttpApiEndpoint.get("session.messages", "/api/session/:sessionID/message", {
      params: { sessionID: Session.ID },
      query: SessionMessagesQuery,
      success: Schema.Struct({
        data: Schema.Array(SessionMessage.Message),
        cursor: Schema.Struct({
          previous: Schema.String.pipe(Schema.optional),
          next: Schema.String.pipe(Schema.optional),
        }),
      }).annotate({ identifier: "SessionMessagesResponse" }),
      error: [InvalidCursorError, SessionNotFoundError, UnknownError],
```


## S18 — `packages/server/src/handlers/message.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `76f2a2583525f1a8e45be6f0121c4870d0ea9f7a`; arquivo SHA-256 `d94cf0944d4fe32aa66cda511d0d49da8ca2aa0135a19791433e334e0415e5cc`; 3210 bytes.

Finalidade: Default page size and opaque cursor codec.

Linhas 8–23; trecho SHA-256 `defe10fa58b401135c9f774e95baed9aef966107ec51241a1d4bb35c4cedd145`:

```
const DefaultMessagesLimit = 50

const Cursor = Schema.Struct({
  id: SessionMessage.ID,
  order: Schema.Union([Schema.Literal("asc"), Schema.Literal("desc")]),
  direction: Schema.Union([Schema.Literal("previous"), Schema.Literal("next")]),
})

const decodeCursor = Schema.decodeUnknownSync(Cursor)

const cursor = {
  encode(message: SessionMessage.Message, order: "asc" | "desc", direction: "previous" | "next") {
    return Buffer.from(JSON.stringify({ id: message.id, order, direction })).toString("base64url")
  },
  decode(input: string) {
    return decodeCursor(JSON.parse(Buffer.from(input, "base64url").toString("utf8")))
```


## S19 — `packages/protocol/src/errors.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `040460309fbd868f937b7511ddd378942c0c2ac9`; arquivo SHA-256 `a720613efbc90a62f91101e65199fab2570686ee5711cec235ec4fec2b1879d3`; 3003 bytes.

Finalidade: Remaining 404 and invalid-cursor schemas.

Linhas 46–54; trecho SHA-256 `80b6d3746c95cb8e767a9988f49dadfe0a2477bb1abdd201a796e118517831e6`:

```
export class ProviderNotFoundError extends Schema.TaggedErrorClass<ProviderNotFoundError>()(
  "ProviderNotFoundError",
  {
    providerID: Schema.String,
    message: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

```

Linhas 65–97; trecho SHA-256 `b944a2dfe1c830127e7cf45e847ee99364ad1850048c24185158473421fb25ed`:

```
  "MessageNotFoundError",
  {
    sessionID: Schema.String,
    messageID: Schema.String,
    message: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

export class InvalidCursorError extends Schema.TaggedErrorClass<InvalidCursorError>()(
  "InvalidCursorError",
  { message: Schema.String },
  { httpApiStatus: 400 },
) {}

export class PermissionNotFoundError extends Schema.TaggedErrorClass<PermissionNotFoundError>()(
  "PermissionNotFoundError",
  {
    requestID: Schema.String,
    message: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

export class QuestionNotFoundError extends Schema.TaggedErrorClass<QuestionNotFoundError>()(
  "QuestionNotFoundError",
  {
    requestID: Schema.String,
    message: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

```

Linhas 105–120; trecho SHA-256 `0d81c948090a4699a027cd8cea7c82a9f4f4acf177070e5a9d46c8322c0e7d3f`:

```
  "PtyNotFoundError",
  {
    ptyID: Schema.String,
    message: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

export class McpServerNotFoundError extends Schema.TaggedErrorClass<McpServerNotFoundError>()(
  "McpServerNotFoundError",
  {
    server: Schema.String,
    message: Schema.String,
  },
  { httpApiStatus: 404 },
) {}
```


## S20 — `packages/server/src/middleware/capability-authorization.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `ca7a6eaeef94c55cb8c4df36a7b7a89a6256b58d`; arquivo SHA-256 `437afc6342984a2cabf7cd72c01ea77c4422fb61761d1a24b2a8bf867f798c88`; 4035 bytes.

Finalidade: Cause preservation and canonical Basic decoding.

Linhas 49–60; trecho SHA-256 `530ac19c5666271e33c6450c12c2630aad1799be007f1568a74bf22e2dd453d5`:

```
        // Keep every defect, interrupt and failure annotation, including mixed lifecycle causes.
        Effect.catchCause((cause) =>
          Effect.failCause(
            Cause.fromReasons(
              cause.reasons.flatMap((reason) => {
                if (reason._tag !== "Fail") return [reason]
                return Cause.fail(
                  reason.error instanceof Capability.Failure ? capabilityError(reason.error) : reason.error,
                ).reasons.map((next) => next.annotate(Context.makeUnsafe(new Map(reason.annotations))))
              }),
            ),
          ),
```

Linhas 68–78; trecho SHA-256 `98d726712f6f0f0b2a76517214c7ee840cafdb1122fd1cc3fc12140da8830f85`:

```
  const match = /^Basic ([A-Za-z0-9+/]+={0,2})(?![\s\S])/i.exec(header)
  if (!match) return undefined
  const decoded = Encoding.decodeBase64String(match[1])
  if (Result.isFailure(decoded) || Encoding.encodeBase64(decoded.success) !== match[1]) return undefined
  const separator = decoded.success.indexOf(":")
  if (separator === -1) return undefined
  return {
    username: decoded.success.slice(0, separator),
    password: Redacted.make(decoded.success.slice(separator + 1)),
  }
}
```


## S21 — `packages/server/src/location.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `1881a570a893ec8c55aa436598db44ad19edde04`; arquivo SHA-256 `57032232ea6a37a046399f147479eef2ccdd21376a59c62de3fcfbfaae78953e`; 3966 bytes.

Finalidade: Cached location caveat.

Linhas 43–48; trecho SHA-256 `07d32bb610eab174f5e2e21948ba4b01541bed65f7161dcfdad3734a39f70759`:

```
/**
 * The Location's services, failing with a declared 400 when they cannot boot. A failed boot (most often a project whose
 * directory was removed) otherwise surfaces as an error no route declares, which the HttpApi answers as an empty 500 on
 * every route of that Location. Only booting is mapped: a Location already booted keeps serving from the map's cache,
 * so database-backed routes such as removing a session stay usable after its directory goes away.
 */
```


## S22 — `packages/server/src/principal.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `f854d83e8c4b760f9c56282a59af87e73a7fbf51`; arquivo SHA-256 `e0932d6e27e750a1664b3a9c20818610126c810d8b41ad8e3900a1c43dd3f260`; 829 bytes.

Finalidade: OS account principal, not one identity per Basic username.

Linhas 1–20; trecho SHA-256 `e0932d6e27e750a1664b3a9c20818610126c810d8b41ad8e3900a1c43dd3f260`:

```
export * as Principal from "./principal"

import os from "os"
import { Result } from "effect"
import type { HttpServerRequest } from "effect/unstable/http"

/**
 * Who a request acts for, recorded on owner actions (publish, hook install and lifecycle; run release later). The
 * server has no per-person accounts: its Basic credential is one shared service identity (the desktop sidecar always
 * signs in with the same fixed username), so that name says nothing about who acted. The person is the OS account
 * running the server, which is the signed-in user of the machine.
 */
export function of(_request: HttpServerRequest.HttpServerRequest) {
  return account()
}

export function account() {
  const user = Result.try(() => os.userInfo().username)
  return Result.isSuccess(user) && user.success ? user.success : "local"
}
```


## S23 — `packages/server/src/handlers/model.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `51ecfd876092dd1e2752f4ead4d40d99d34d6010`; arquivo SHA-256 `5bb4dd3dceaf99373c595b30753ea69322999bcd38bc55db36ce165325f5ee9b`; 1731 bytes.

Finalidade: Catalog availability, deduplication and preferred/default model.

Linhas 14–43; trecho SHA-256 `ce03015b7eb030f157757fa76509f64da1c7e05b63fea1b9c6b3c164e89b7c80`:

```
          const catalog = yield* Catalog.Service
          const additional = yield* CatalogAvailability.AdditionalProviders
          return yield* response(
            Effect.gen(function* () {
              const available = yield* catalog.model.available()
              const extra = new Set((yield* additional(catalog)).map((provider) => provider.id))
              if (extra.size === 0) return available
              return [
                ...available,
                ...(yield* catalog.model.all()).filter(
                  (model) =>
                    extra.has(model.providerID) &&
                    model.enabled &&
                    !available.some((item) => item.providerID === model.providerID && item.id === model.id),
                ),
              ]
            }),
          )
        }),
      )
      .handle(
        "model.default",
        Effect.fn(function* () {
          const catalog = yield* Catalog.Service
          const preferred = yield* CatalogAvailability.DefaultModel
          return yield* response(
            Effect.gen(function* () {
              return (yield* preferred(catalog)) ?? (yield* catalog.model.default()) ?? null
            }),
          )
```


## S24 — `packages/server/src/handlers/provider.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `407a5c5ce66f41da27a4f793cbe8ff3c9c9bbafd`; arquivo SHA-256 `9d0167b85aaebb4db6c802ea918c1ff38f47978c6877aadd788863201593714d`; 2475 bytes.

Finalidade: Provider list/sign-in adapter declarations.

Linhas 13–56; trecho SHA-256 `aefe20cd3e11cbd6369975a394ba57e7f2fde1d89855cbcdf575547f3ac27573`:

```
      .handle(
        "provider.list",
        Effect.fn(function* () {
          const catalog = yield* Catalog.Service
          const additional = yield* CatalogAvailability.AdditionalProviders
          return yield* response(Effect.gen(function* () {
            const available = yield* catalog.provider.available()
            const extra = yield* additional(catalog)
            return [...available, ...extra.filter((provider) => !available.some((item) => item.id === provider.id))]
          }))
        }),
      )
      .handle(
        "provider.claudeCode.account",
        Effect.fn(function* () {
          const account = yield* ClaudeCodeAccount.Service
          return yield* account.account
        }),
      )
      .handle(
        "provider.claudeCode.login",
        Effect.fn(function* () {
          const account = yield* ClaudeCodeAccount.Service
          return yield* account.startLogin.pipe(
            Effect.catchTag("ClaudeCodeAccount.LoginError", (error) =>
              Effect.fail(new ServiceUnavailableError({ message: error.message, service: "claude-code" })),
            ),
          )
        }),
      )
      .handle(
        "provider.claudeCode.loginCode",
        Effect.fn(function* (ctx) {
          const account = yield* ClaudeCodeAccount.Service
          return yield* account.sendCode(ctx.payload.code)
        }),
      )
      .handle(
        "provider.get",
        Effect.fn(function* (ctx) {
          const catalog = yield* Catalog.Service
          const provider = yield* catalog.provider.get(ctx.params.providerID)
          if (!provider)
            return yield* new ProviderNotFoundError({
```


## S25 — `packages/client/src/generated/client.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `93cab27e0b902d6e8fbd21d6aaec320a2b9fe09c`; arquivo SHA-256 `f032a64d8223ac1b584ba17cf39e7f8da9e0be05f88682425692304a3a8ba20b`; 146714 bytes.

Finalidade: Header precedence and binary files.read method identity.

Linhas 539–556; trecho SHA-256 `4cb197d044088598ffa2be90e4ca124f89aea7033448127a48c5365d902d68fb`:

```
}

export interface RequestOptions {
  readonly signal?: AbortSignal
  readonly headers?: HeadersInit
}

export function make(options: ClientOptions) {
  const fetch = options.fetch ?? globalThis.fetch

  const prepare = (descriptor: RequestDescriptor, requestOptions?: RequestOptions) => {
    const url = new URL(descriptor.path, options.baseUrl)
    for (const [key, value] of Object.entries(descriptor.query ?? {})) appendQuery(url.searchParams, key, value)
    const headers = new Headers(options.headers)
    for (const [key, value] of Object.entries(descriptor.headers ?? {})) {
      if (value !== undefined && value !== null) headers.set(key, String(value))
    }
    for (const [key, value] of new Headers(requestOptions?.headers)) headers.set(key, value)
```

Linhas 1548–1561; trecho SHA-256 `f2c64de57ae0b35880ae3806fbc0cfa2909b64f5cc026c0e72fa56a102885185`:

```
          requestOptions,
        ),
    },
    files: {
      read: (input: FilesReadInput, requestOptions?: RequestOptions) =>
        request<FilesReadOutput>(
          {
            method: "GET",
            path: `/api/fs/read`,
            query: { location: input["location"], path: input["path"] },
            successStatus: 200,
            declaredStatuses: [400, 401],
            empty: false,
            binary: true,
```


## S26 — `packages/client/src/generated-effect/client.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `97d52b0a17eece1a7ddf6a52904a88d047e2b51f`; arquivo SHA-256 `24114bfba58645693c8db03ffca4f04b3c6ecbb0d6a9d18f82de15addd1556f6`; 171208 bytes.

Finalidade: Actual generated adapter uses original ClientApi and validates headers.

Linhas 3410–3464; trecho SHA-256 `1124fa5bf5d87305d45327ae0e1c09f7980ba8f6db11b9cba55e17c6b90971a3`:

```
  meeting: adaptGroup48(raw["server.meeting"]),
  operator: adaptGroup49(raw["server.capability.operator"]),
  connections: adaptGroup50(raw["server.capability.connections"]),
  artifacts: adaptGroup51(raw["server.capability.artifacts"]),
  capabilitySchedules: adaptGroup52(raw["server.capability.schedules"]),
})

export const make = (options?: {
  readonly baseUrl?: URL | string
  readonly headers?: Readonly<Record<string, string>>
}) => {
  if (options?.headers === undefined) return HttpApiClient.make(ClientApi, options).pipe(Effect.map(adaptClient))
  // Snapshot and validate host configuration now, before this Effect can be executed or reused.
  const headers = snapshotHeaders(options.headers)
  if (Object.keys(headers).length === 0) return HttpApiClient.make(ClientApi, options).pipe(Effect.map(adaptClient))
  // Fetch must supply the multipart boundary; only explicit request headers may override it.
  const formHeaders = Object.fromEntries(Object.entries(headers).filter(([name]) => name !== "content-type"))
  return HttpApiClient.make(ClientApi, {
    baseUrl: options.baseUrl,
    transformClient: (client) =>
      HttpClient.mapRequest(client, (request) =>
        HttpClientRequest.setHeaders(request, {
          ...(request.body._tag === "FormData" ? formHeaders : headers),
          ...request.headers,
        }),
      ),
  }).pipe(Effect.map(adaptClient))
}

function snapshotHeaders(input: Readonly<Record<string, string>>) {
  if (
    typeof input !== "object" ||
    input === null ||
    (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null)
  ) {
    throw new TypeError("Invalid client headers")
  }
  const entries = Object.entries(Object.getOwnPropertyDescriptors(input)).flatMap(([name, descriptor]) => {
    if (
      !/^[!#$%&'*+.^_|~0-9A-Za-z\x60-]+$/.test(name) ||
      !("value" in descriptor) ||
      typeof descriptor.value !== "string" ||
      /[\r\n]/.test(descriptor.value)
    ) {
      throw new TypeError("Invalid client headers")
    }
    return descriptor.enumerable ? [[name, descriptor.value] as const] : []
  })
  try {
    return Object.freeze(Object.fromEntries(new Headers(Object.fromEntries(entries))))
  } catch (error) {
    if (error instanceof TypeError) throw new TypeError("Invalid client headers")
    throw error
  }
}
```


## S27 — `packages/client/src/wire.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `8ff88190163e1254d4c92ea5c70ef0f9c8fc8d04`; arquivo SHA-256 `0f4373c1e09abbaa92b6769a80c2a9e9de8a1193ed99b9c9e404263c61388fdf`; 190 bytes.

Finalidade: Encoded session-event projection.

Linhas 1–4; trecho SHA-256 `0f4373c1e09abbaa92b6769a80c2a9e9de8a1193ed99b9c9e404263c61388fdf`:

```
import type { SessionEvent } from "@orchestra/schema/session-event"
import type { Schema } from "effect"

export type SessionEventEncoded = Schema.Codec.Encoded<typeof SessionEvent.Durable>
```


## S28 — `packages/client/src/actions-transfer.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `0d8607699a560ae9fb671f8bc37bc9d1b473424e`; arquivo SHA-256 `3403fb575546d15a203a063ae9e8135dac6593276bf056e63a918129fb9bd47d`; 9473 bytes.

Finalidade: Streaming successful response ownership and stream support probe.

Linhas 15–62; trecho SHA-256 `bb5c86f7916cf6976eaa68b0660d6c44ce28f0d76b71d8a2f819b1815ce8b9a2`:

```
export function makeActionsTransfer(options: ClientOptions) {
  const request = async (prepared: ReturnType<typeof prepareTransfer>): Promise<Response> => {
    const fetch = prepared.fetch
    const response = await Promise.resolve()
      .then(() => fetch(prepared.url, prepared.init))
      .catch((cause: unknown) => {
        prepared.controller.abort()
        throw new ActionsTransferError("Transport", { cause })
      })
    if (!response.ok) return actionsTransferResponseError(response).finally(() => prepared.controller.abort())
    return response
  }

  return {
    download: async (
      input: { binding: Actions.BindingRef; target: Actions.TransferInput; location?: Location },
      requestOptions?: RequestOptions,
    ): Promise<Response> => {
      try {
        requireRecord(input, ["binding", "target", "location"], "download")
        const captured = {
          ...input,
          binding: input.binding && { ...input.binding },
          target: input.target && { ...input.target },
          location: input.location && { ...input.location },
        }
        requireTarget(captured.target)
        return request(
          prepareTransfer(
            options,
            captured.binding,
            captured.location,
            {
              kind: captured.target.kind,
              id: captured.target.id,
              runID: captured.target.runID,
              attempt: captured.target.attempt,
              path: captured.target.path,
            },
            undefined,
            requestOptions,
          ),
        )
      } catch (cause) {
        if (cause instanceof ActionsTransferError) throw cause
        throw new ActionsTransferError("Transport", { cause })
      }
    },
```

Linhas 107–121; trecho SHA-256 `e55337760519469f82cf8e51cd2bf70f4b1716c9ad749508d054f34f6d8bf02f`:

```
          if (captured.body.locked) invalid("Upload stream is locked")
          let duplexRead = false
          const probe: StreamingRequestInit = {
            method: "POST",
            body: captured.body,
            get duplex(): "half" {
              duplexRead = true
              return "half"
            },
          }
          const supported = await Promise.resolve()
            .then(() => new Request(prepared.url, probe))
            .catch((cause: unknown) => {
              throw new ActionsTransferError("Transport", { code: "UnsupportedStreaming", cause })
            })
```


## S29 — `packages/client/src/actions-transfer-error.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `314b2dc47f3e63182dec1324c1c31f3839dc12d9`; arquivo SHA-256 `bef765b9b85ec33b12317a84d6266d5713793768d3f4a63deba06d47c2a66477`; 5266 bytes.

Finalidade: Outcome retained and retry-after parser.

Linhas 4–34; trecho SHA-256 `3b785b5c210bcb68f26be823ae087084c87a5db9e3c025b67da3f0b3836ef9f3`:

```
export class ActionsTransferError extends ClientError {
  readonly code?: "UnsupportedStreaming"
  readonly status?: number
  readonly data?: Actions.ErrorData
  readonly kind?: Actions.ErrorKind
  // The frozen ErrorData has no outcome schema yet. Preserve the wire value without guessing its shape.
  readonly outcome?: unknown
  readonly retryAfter?: number
  readonly truncated: boolean

  constructor(
    reason: ClientErrorReason,
    details: {
      code?: "UnsupportedStreaming"
      cause?: unknown
      status?: number
      data?: Actions.ErrorData & { outcome?: unknown }
      retryAfter?: number
      truncated?: boolean
    } = {},
  ) {
    super(reason, { cause: details.cause })
    this.code = details.code
    this.status = details.status
    this.data = details.data
    this.kind = details.data?.kind
    this.outcome = details.data?.outcome
    this.retryAfter = details.data?.retryAfter ?? details.retryAfter
    this.truncated = details.truncated ?? false
    this.message = details.data?.message ?? details.code ?? reason
  }
```

Linhas 130–136; trecho SHA-256 `ad3bd0dffb2e62ff9b5468e43df46bfd301dd08c5eafe79a7ab9450ae4adb007`:

```

function retryAfter(value: string | null) {
  if (value === null) return undefined
  if (/^\d+(?:\.\d+)?$/.test(value)) return Number.isFinite(Number(value)) ? Number(value) : undefined
  const date = Date.parse(value)
  return Number.isFinite(date) ? Math.max(0, (date - Date.now()) / 1_000) : undefined
}
```


## S30 — `packages/server/src/handlers/actions-transfer.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `50b7434c5595f4868cd3bd2429ec39b6441cba1c`; arquivo SHA-256 `c385e884606f956b76aea7b2e4c9f6d892ab87976342dafce06428c84449bba3`; 2203 bytes.

Finalidade: Complete inspected group contains info/read handlers, not upload.

Linhas 1–35; trecho SHA-256 `34022a182e3721bb05ab6063f3b0c5c22e891fc3f0e37d2371b2b05319f87e54`:

```
import { Actions } from "@orchestra/core/actions"
import { TransferQuery } from "@orchestra/protocol/groups/actions-transfer"
import { BindingID } from "@orchestra/schema/actions"
import { Effect, Schema } from "effect"
import { HttpServerResponse } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { apiError, bindingRef, result } from "./actions-common"

export const ActionsTransferHandler = HttpApiBuilder.group(Api, "server.actionsTransfer", (handlers) => Effect.succeed(
  handlers
    .handle("actions.transfer.info", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.transferInfo(bindingRef(ctx), {
        kind: ctx.query.kind, id: ctx.query.id, runID: ctx.query.runID, attempt: ctx.query.attempt, path: ctx.query.path,
      })
    })))
    .handleRaw("actions.transfer.read", (ctx) => Effect.gen(function* () {
      const url = new URL(ctx.request.url, "http://localhost")
      const query = yield* Schema.decodeUnknownEffect(TransferQuery)(Object.fromEntries(url.searchParams)).pipe(
        Effect.mapError(() => apiError(new Actions.ActionsError({ kind: "invalid_input", message: "Invalid Actions transfer query" }))),
      )
      const id = yield* Schema.decodeUnknownEffect(BindingID)(decodeURIComponent(url.pathname.split("/").at(-1) ?? "")).pipe(
        Effect.mapError(() => apiError(new Actions.ActionsError({ kind: "invalid_input", message: "Invalid Actions transfer binding" }))),
      )
      const actions = yield* Actions.Service
      const target = { kind: query.kind, id: query.id, runID: query.runID, attempt: query.attempt, path: query.path }
      const binding = { id, revision: query.revision }
      const info = yield* actions.transferInfo(binding, target).pipe(Effect.mapError(apiError))
      return HttpServerResponse.stream(actions.transfer(binding, target), {
        contentType: info.contentType,
        headers: { "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(info.filename)}`,
          ...(info.size === undefined ? {} : { "content-length": String(info.size) }) },
      })
    })),
```


## S31 — `tooling/httpapi-codegen/src/index.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `0467e68001715795e0851cf5d8a8b3dad1d75126`; arquivo SHA-256 `8a0e0c82edbddb08097d285ce523a80f70e9d98b764073941fecdefd0390b069`; 59915 bytes.

Finalidade: Input mode, collision rejection, recursive-type refusal and manifest ownership read.

Linhas 160–171; trecho SHA-256 `92bb307bd954c887721a166bedbd4af6cddec785ca715c02c2841ca1f46b692e`:

```
          inputMode: inputs.length === 0 ? "none" : inputs.every((field) => field.optional) ? "optional" : "required",
          success: isStreamSchema(success.schema)
            ? "stream"
            : HttpApiSchema.isNoContent(success.schema.ast)
              ? "void"
              : "value",
          errors: [
            ...new Set([
              ...errorSchemas.flatMap((item) => {
                const identifier = SchemaAST.resolveIdentifier(item.schema.ast)
                return identifier === undefined ? [] : [identifier]
              }),
```

Linhas 178–211; trecho SHA-256 `5a4b8e5852a7af2699102cb1e5df7165e556fdadad06a66f27c61ee3bb2546be`:

```
  })

  const modules = new Set(["client", "client-error", "index", "request", "errors", "types"])
  const groups = Array.from(
    Map.groupBy(endpoints, (endpoint) => endpoint.group),
    ([identifier, endpoints], index) => {
      if (new Set(endpoints.map((endpoint) => endpoint.sourceGroup)).size > 1) {
        throw new GenerationError({ reason: `Client group name collision: ${identifier}` })
      }
      const base = /^[A-Za-z0-9_-]+$/.test(identifier) ? identifier : `group-${index}`
      const module = uniqueModule(base, index, modules)
      modules.add(module.toLowerCase())
      modules.add(`${module}-types`.toLowerCase())
      return { identifier, sourceIdentifier: endpoints[0].sourceGroup, module, endpoints }
    },
  )
  const publicNames = new Set<string>()
  for (const group of groups) {
    const endpointNames = new Set<string>()
    for (const endpoint of group.endpoints) {
      if (endpointNames.has(endpoint.operation.name)) {
        throw new GenerationError({
          reason: `Client endpoint name collision: ${group.identifier}.${endpoint.operation.name}`,
        })
      }
      endpointNames.add(endpoint.operation.name)
    }
    const names = group.endpoints[0]?.topLevel ? group.endpoints.map((item) => item.operation.name) : [group.identifier]
    for (const name of names) {
      if (publicNames.has(name)) throw new GenerationError({ reason: `Client name collision: ${name}` })
      publicNames.add(name)
    }
  }
  return {
```

Linhas 531–551; trecho SHA-256 `80609ad8cc1430abe53c3397911671fd58258d40e0ef6e0735c11785489d3204`:

```
function structuralType(schema: Schema.Top) {
  const document = SchemaRepresentation.toCodeDocument(SchemaRepresentation.fromASTs([schema.ast]))
  if (
    document.artifacts.some(
      (artifact) =>
        artifact._tag !== "Import" || artifact.importDeclaration !== 'import type * as Brand from "effect/Brand"',
    ) ||
    Object.keys(document.references.recursives).length > 0
  ) {
    throw new GenerationError({ reason: "Referenced Promise types are not implemented" })
  }
  const references = new Map(
    document.references.nonRecursives.map((reference) => [reference.$ref, reference.code.Type]),
  )
  const expand = (type: string, seen = new Set<string>()): string => {
    for (const [reference, value] of references) {
      const pattern = `(?<![A-Za-z0-9_$.'"])${reference.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9_$.'"])`
      if (!new RegExp(pattern).test(type)) continue
      if (seen.has(reference)) {
        throw new GenerationError({ reason: `Recursive Promise types are not implemented: ${reference}` })
      }
```

Linhas 707–713; trecho SHA-256 `7ba4dcceb0bb7f4c25b85d29216a848ce631654747de64ba588a5f61a88b60ae`:

```
    const manifest = join(directory, manifestName)
    const previous = (yield* fs.exists(manifest))
      ? yield* fs.readFileString(manifest).pipe(
          Effect.flatMap(Schema.decodeUnknownEffect(Manifest)),
          Effect.mapError(() => new GenerationError({ reason: `Invalid generated file manifest: ${manifest}` })),
        )
      : []
```


## S32 — `packages/client/src/generated/.httpapi-codegen.json`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `190f92c2c10e6b0126e10ef23b217ef33688dd68`; arquivo SHA-256 `8c3b0fc3a95aed8ba5a2efe2033addb2e753444a15bc4b308f5deb618096b243`; 1086 bytes.

Finalidade: Exact Promise generated output membership, 40 names.

Linhas 1–42; trecho SHA-256 `8c3b0fc3a95aed8ba5a2efe2033addb2e753444a15bc4b308f5deb618096b243`:

```
[
  "actionsBindings-types.ts",
  "actionsBindings.ts",
  "actionsJobs-types-part-1.ts",
  "actionsJobs-types-part-2.ts",
  "actionsJobs-types.ts",
  "actionsJobs.ts",
  "actionsOperations-types-part-1.ts",
  "actionsOperations-types-part-2.ts",
  "actionsOperations-types.ts",
  "actionsOperations.ts",
  "actionsPipelines-types.ts",
  "actionsPipelines.ts",
  "actionsResources-types-part-1.ts",
  "actionsResources-types-part-2.ts",
  "actionsResources-types.ts",
  "actionsResources.ts",
  "actionsRuns-types-part-1.ts",
  "actionsRuns-types-part-2.ts",
  "actionsRuns-types-part-3.ts",
  "actionsRuns-types-part-4.ts",
  "actionsRuns-types.ts",
  "actionsRuns.ts",
  "actionsSource-types.ts",
  "actionsSource.ts",
  "actionsTransfers-types.ts",
  "actionsTransfers.ts",
  "actionsWorkflows-types-part-1.ts",
  "actionsWorkflows-types-part-2.ts",
  "actionsWorkflows-types.ts",
  "actionsWorkflows.ts",
  "client-error.ts",
  "client.ts",
  "errors.ts",
  "index.ts",
  "request.ts",
  "research-types.ts",
  "research.ts",
  "schedules-types.ts",
  "schedules.ts",
  "types.ts"
]
```


## S33 — `packages/client/src/generated-effect/.httpapi-codegen.json`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `4caf4225fe4d24c569bcdc5b4c4310580cea4bbb`; arquivo SHA-256 `4e839ccacb669ba2392da1a5173c08c6636c0b64f86f8faa79b0051969bd7285`; 300 bytes.

Finalidade: Exact Effect generated output membership, 14 names.

Linhas 1–16; trecho SHA-256 `4e839ccacb669ba2392da1a5173c08c6636c0b64f86f8faa79b0051969bd7285`:

```
[
  "actionsBindings.ts",
  "actionsJobs.ts",
  "actionsOperations.ts",
  "actionsPipelines.ts",
  "actionsResources.ts",
  "actionsRuns.ts",
  "actionsSource.ts",
  "actionsTransfers.ts",
  "actionsWorkflows.ts",
  "client-error.ts",
  "client.ts",
  "index.ts",
  "research.ts",
  "schedules.ts"
]
```


## S34 — `packages/client/test/promise.test.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `a7afeff494a0f19c84eb53b90c716112b8a956f1`; arquivo SHA-256 `6327e27a858011cb7d10c752c589ff49fa6e5a3ee8e4a14ba7569fdc85b1b21f`; 14627 bytes.

Finalidade: Unexecuted intended wire timestamp assertion.

Linhas 101–115; trecho SHA-256 `824dfba3e2ecce2e5e6330b8d9c04d0a38f21edc533d401b142523da3c8c1b47`:

```
test("sessions.get returns the wire projection", async () => {
  const client = Orchestra.make({
    baseUrl: "http://localhost:3000",
    fetch: async (input) => {
      expect(typeof input === "string" ? input : input instanceof URL ? input.href : input.url).toBe(
        "http://localhost:3000/api/session/ses_test",
      )
      return Response.json(session)
    },
  })

  const result = await client.sessions.get({ sessionID: "ses_test" })

  expect(result.time.created).toBe(1_717_171_717_000)
})
```


## S35 — `packages/client/test/effect.test.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `84ec5ea971c9599163b7a8ac45576337bdf380a8`; arquivo SHA-256 `5c92d1972ecc58f1b6c918341af29a0f6240ffa61b14f1f6b9dd74c9a2c943ac`; 9925 bytes.

Finalidade: Unexecuted intended decoded timestamp assertion.

Linhas 6–16; trecho SHA-256 `2d471da6e7791e74e4e7128d8bb3d9132bdf53aa8d689198b5c604a7218feb50`:

```
test("sessions.get returns the decoded Effect projection", async () => {
  const httpClient = HttpClient.make((request) =>
    Effect.succeed(HttpClientResponse.fromWeb(request, Response.json(session))),
  )
  const result = await Effect.gen(function* () {
    const client = yield* Orchestra.make({ baseUrl: "http://localhost:3000" })
    return yield* client.sessions.get({ sessionID: Session.ID.make("ses_test") })
  }).pipe(Effect.provideService(HttpClient.HttpClient, httpClient), Effect.runPromise)

  expect(DateTime.toEpochMillis(result.time.created)).toBe(1_717_171_717_000)
})
```


## S36 — `packages/server/test/event-stream.test.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `fbff2eb0f6d4e4affd069c662da7c61c4ead7a2a`; arquivo SHA-256 `fb7b290eab795201302829f1e2b78a7a836b0eec42af50a03c96e3dd68681be6`; 3896 bytes.

Finalidade: Test stand-in scope and unexecuted burst/encoding assertions.

Linhas 8–16; trecho SHA-256 `2e01900552409e3105b8e8b3d4098a5bcb0ac97e543155403eb90cc43ff61ac4`:

```
// Only the event bus is a stand-in: it hands the stream's listener back so the test can publish while nothing reads.
function bus() {
  const listeners: Subscriber[] = []
  const service = {
    listen: (listener: Subscriber) =>
      Effect.sync(() => {
        listeners.push(listener)
        return Effect.void
      }),
```

Linhas 51–59; trecho SHA-256 `237d742db404e12ce0c8fabc9d28e7842a55faea8514d334025bb0dcfe238db8`:

```
          // The first pull installs the subscriber and delivers the connected event.
          let received = frames(yield* pull)
          // A slow renderer reads nothing while a model streams: the queue has to hold the whole burst.
          yield* events.publish(1000)
          while (received < 1001) received += frames(yield* pull)

          expect(received).toBe(1001)
        }),
      ),
```

Linhas 87–94; trecho SHA-256 `7691d0cca5fbd0fc06708463da43faa3c8f7883d986d09d3ceebfa5e7d055b10`:

```
          const received = yield* Effect.forEach(pulls, (pull) => frameOf(pull, id))

          expect(received[0]).toContain(id)
          expect(received[1]).toBe(received[0])
          expect(received[2]).toBe(received[0])
          expect(encoded.get(id)).toBe(1)
        }),
      ),
```


## S37 — `packages/sdk-next/test/embedded.test.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `6fe30ce4ee65de629cbb63dbba7de447a0a2464c`; arquivo SHA-256 `a32e565a4bdaa2154208128e035c805577684b7d233f9f58b2ffe3c2f93932da`; 10581 bytes.

Finalidade: Unexecuted admission/wake/durable/missing-session/isolation assertions.

Linhas 59–75; trecho SHA-256 `2d9e6b1f442182a32ff7729350b6648f117259f022c3b1e7aac00999218af066`:

```
      const admitted = yield* orchestra.sessions.prompt({
        sessionID,
        prompt: Prompt.make({ text: "Do not run" }),
        resume: false,
      })
      const context = yield* orchestra.sessions.context({ sessionID })
      const wake = yield* orchestra.sessions.prompt({
        sessionID,
        prompt: Prompt.make({ text: "Promote this input" }),
      })
      const prompted = yield* orchestra.sessions.events({ sessionID }).pipe(
        Stream.filter((event) => event.type === "session.next.prompted" && event.data.messageID === wake.id),
        Stream.runHead,
        Effect.timeout("10 seconds"),
        Effect.map(Option.getOrThrow),
      )
      const wakeContext = yield* orchestra.sessions.context({ sessionID })
```

Linhas 108–123; trecho SHA-256 `f98942bc14eb5edb8b46c3a5786eb0350d70ce72bcd9d896deb2c5b1502aaa4b`:

```
      expect(admitted.sessionID).toBe(sessionID)
      expect(prompted.type).toBe("session.next.prompted")
      expect(wakeContext).toContainEqual(expect.objectContaining({ id: wake.id, type: "user" }))
      expect(context.some((message) => message.type === "model-switched")).toBe(true)
      expect(Array.from(events)).toMatchObject([
        { type: "session.next.created", durable: { seq: 0 } },
        { type: "session.next.model.switched", durable: { seq: 1 } },
      ])
      expect(message).toEqual(modelMessage)
      expect(missing.map((error) => error._tag)).toEqual([
        "SessionNotFoundError",
        "SessionNotFoundError",
        "SessionNotFoundError",
      ])
      expect(missingMessage._tag).toBe("MessageNotFoundError")
    })
```

Linhas 166–166; trecho SHA-256 `3ad4ec71e0e93efc14f38645bab8350a691d438d8541c35577a63a8277cf13af`:

```
test("independent embedded hosts do not share live notifications", async () => {
```

Linhas 187–199; trecho SHA-256 `d5d3a712a94cab7fc622f0b085ada04436b463cb2caa77b9126b534e7b0c282c`:

```

      yield* first.events.subscribe().pipe(observe(firstReady, firstEvent), Effect.forkScoped)
      yield* second.events.subscribe().pipe(observe(secondReady, secondEvent), Effect.forkScoped)
      yield* Effect.all([firstReady.await, secondReady.await], { discard: true })
      yield* first.sessions.create({
        id: sessionID,
        location: Location.Ref.make({ directory: AbsolutePath.make(directory) }),
      })
      yield* first.sessions.switchAgent({ sessionID, agent: Agent.ID.make("reviewer") })

      yield* firstEvent.await.pipe(Effect.timeout("2 seconds"))
      expect(Option.isNone(yield* secondEvent.await.pipe(Effect.timeoutOption("100 millis")))).toBe(true)
    })
```


## S38 — `packages/server/test/client-contract-identity.test.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `6438c7f63dc24ec9406f56be0f451c0e9c49bf9c`; arquivo SHA-256 `122799d92aee38fdf9a64316bcf31861df53fcf9d484cdda1566f0c559a151b9`; 3077 bytes.

Finalidade: Unexecuted intended canonical identity and client/server generation checks.

Linhas 24–45; trecho SHA-256 `7df565cb46018cb7de8439d3610c5ead6870d6078757ef522a6ae79b62f1a307`:

```
test("Core and Server reuse the authoritative Schema and Protocol values", () => {
  expect(AgentV2.ID).toBe(Agent.ID)
  expect(CoreLocation.Ref).toBe(Location.Ref)
  expect(ModelV2.Ref).toBe(Model.Ref)
  expect(SessionV2.Info).toBe(Session.Info)
  expect(CoreSessionInput.Admitted).toBe(SessionInput.Admitted)
  expect(CoreSessionMessage.Message).toBe(SessionMessage.Message)
  expect(CorePrompt).toBe(Prompt)
  expect(Api.groups["server.session"].identifier).toBe("server.session")
  expect(Object.keys(ClientApi.groups)).toEqual(Object.keys(Api.groups))
  expect(Session.ID.create()).toStartWith("ses_")
  expect<string>(Project.ID.global).toBe("global")
  expect<string>(Provider.ID.anthropic).toBe("anthropic")
  expect(Workspace.ID.create()).toStartWith("wrk_")
})

test("client and Server contracts generate identically", () => {
  const server = compile(Api, { groupNames, endpointNames, omitEndpoints })
  const client = compile(ClientApi, { groupNames, endpointNames, omitEndpoints })

  expect(emitPromise(client)).toEqual(emitPromise(server))
})
```

