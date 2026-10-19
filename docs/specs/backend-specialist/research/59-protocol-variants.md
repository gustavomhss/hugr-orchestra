# R59 — Cross-language protocol-specific backend skill variants

Research date: 2026-10-04. **Recommendation: six scope cards, shared contract/lifetime guidance, conditional framework references.** Protocol selects procedure; language selects implementation API.
Metadata worktree `/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/orchestra/backend-r59-protocol-variants`: `git rev-parse --show-toplevel HEAD` returned corresponding `/private/var/...` path and **`76015a9dcd5b0c77164a3f1bee49b0060a4d37f0`**. Source worktree HEAD matched.
Read frozen [variant plan][PLAN] and source leads [R29][L29], [R30][L30], [R45][L45]. Carry forward: generated types are not runtime validation; generated service boundaries are not business behavior; codecs do not own transport framing or domain policy.
Evidence: primary specifications, official documentation and tagged/pinned source inspected. **All selection/behavior checks below are proposed and unexecuted.** Package combinations and generated outputs were not exercised. This report is research, not an installed/exercised skill.

## Composition and supplied packet

- The backend specialist implements assigned behavior in named components. Discovery, diagnosis, transport choice, public API design, cross-owner decisions and independent review belong upstream. A repair receives known diagnosis; a feature needs no invented diagnostic prerequisite.
- Select from supplied operation, transport/direction, serialization, component language/runtime/framework/library versions and ownership facts. Repository-wide dependencies, filenames or words such as “stream” alone do not select a variant. Selection grants no authority; existing host enforces supplied scope.
- Packet supplies contract revision plus resolved imports, operation/field set, target paths and existing domain seams; success/status/header/media/error mappings; compatibility commitments; relevant fixtures and check obligations. Schema, SDL, `.proto`, byte grammar and public framing remain source of truth.
- Policy facts include authentication source and credential transport, tenant/resource/field authorization, disclosure/redaction rules, byte/message/part/depth/concurrency budgets, deadlines, cancellation and cleanup obligations. Retry/replay/deduplication and acknowledgment/commit boundaries are supplied where relevant; protocol does not decide them.
- Codegen facts identify chosen tool/runtime pins, schema and generated-root owners, replaceable outputs and permitted generation entrypoint. The backend specialist may derive flags, internal helpers, queries, adapters and test arrangement from these facts. Caller need not prewrite implementation or every command argument.
- Common workflow: read assigned contract/seam → bind existing validation/auth/domain interfaces → implement selected protocol boundary and cleanup → perform assigned existing checks → return patch plus contract-to-behavior evidence or precise blocker. Bounded correction of the backend specialist's own implementation remains local judgment.
- Tools named below describe later implementation: native Read/search, patch/diff, preprovisioned compiler/generator and existing protocol clients/check runners. Research used reads, source fetches, Git metadata and this document patch; no new harness/loader/router is proposed.

## Same domain operation, already-provided transports

**Comparison specimen, not an API proposal:** assume upstream supplies five existing bindings of `ReadOrderLines(orderID, snapshot)` returning ordered line IDs, quantities and product labels. Same fixed snapshot, tenant policy and data-access service; no transport selection or contract change. Supplied policy authenticates principal and authorizes order before exposure; product access is checked independently. Fixture contains repeated product IDs, allowing batching without requiring caller-written SQL.
Fixture fixes maximum 100 lines, 30-second deadline, 1 MiB decoded output and 16 pending stream items. Missing credentials map to HTTP `401` with challenge before HTTP execution/upgrade, or gRPC `UNAUTHENTICATED`. Order denial maps to REST/SSE `403` before headers, gRPC `PERMISSION_DENIED`, GraphQL field error at nullable `order`, or supplied WS operation `error` after upgrade. These mappings are specimen inputs, not universal defaults.

| Provided binding | Success and completion | Supplied failure/partial-result behavior; wrong transfer |
| --- | --- | --- |
| REST `GET /orders/{id}/lines` | `200 application/json`, complete `{lines:[...]}` after bounded assembly. Empty list remains `200` per contract. | Label lookup failure before response commit → `503` plus supplied `Problem`. After byte transmission breaks, result is incomplete; cannot replace status. Do not emit GraphQL `{data,errors}` or change to NDJSON. |
| gRPC `ReadOrderLines(Request) returns (stream Line)` | Runtime sends typed ordered messages, then terminal `grpc-status: 0` trailers; HTTP status normally `200`. | Lookup failure after two items → `UNAVAILABLE` trailers; delivered prefix is not complete success. Missing trailers/reset is failure. HTTP `200` alone is not RPC success. |
| GraphQL `order(id:, snapshot:) { lines { id quantity product { label } } }` | Executor returns selected fields under `data`; supplied HTTP profile uses `200 application/graphql-response+json`. SDL fixes nullable `product` and non-null `Product.label`. | Label lookup failure → `product: null`, sibling data and `errors` with path; supplied profile retains `200`. Invalid document → supplied `400`, `errors`, absent `data`, no resolver execution. Do not turn each resolver error into REST `503` or relax SDL nullability. |
| SSE existing line-snapshot endpoint | `200 text/event-stream`; supplied `line` events, then `done` event with data and blank-line terminator. Existing client closes EventSource on `done`. | Post-header lookup failure → supplied `failed` event, no `done`; truncated connection is incomplete. EOF alone triggers native EventSource reconnection, not business success. Supplied resume cursor policy applies. |
| WebSocket existing `order-lines.v1` subprotocol | HTTP/1.1 upgrade `101`; supplied request-ID-bearing `line` messages, then operation `complete`; connection may stay open. | Supplied operation `error` terminates that request, without `complete`; socket close is separate. Cancellation targets request ID. Do not close multiplexed connection as substitute for operation completion. |

Protocol anchors: [HTTP][H], [gRPC wire][R], [GraphQL execution][G], [SSE][S], [WebSocket][W]. SSE/WS event names and terminal messages above are **application contract facts**, not built-in standards.
**Version trap:** inspected GraphQL-over-HTTP working draft at `e28746596c38a414015e0f61d7d3e92b8ce54912` recommends `294` for data+errors in Status Codes yet retains `200` in its execution-error example [GH]. Core GraphQL does not prescribe HTTP status. Specimen explicitly supplies its `200`/`400` profile; the backend specialist must not adopt draft changes or resolve conflicting profiles by redesign.

## P1 — REST JSON operation implementation

- **Trigger / non-trigger:** assigned JSON HTTP handler against fixed method/path and response contract. Exclude GraphQL carried in JSON, gRPC, SSE, multipart and signed raw-body ingress as ordinary JSON routes.
- **Packet additions:** OpenAPI/dialect if present, parameter serialization/coercion, absent-versus-null rules, request/response constraints, response variants, content negotiation, auth challenge and resource-denial mappings. Pagination/idempotency rules only when assigned.
- **Steps:** 1. Bind route and decode using specified media/parameter semantics; apply runtime validation and supplied authentication/resource checks. 2. Invoke domain operation with request cancellation. 3. Map each result to exact status, headers and response schema, including framework validation/error paths. 4. Bound serialization and finish response; HEAD/204 carry no content where applicable [H], [O].
- **Tools / output:** existing raw HTTP fixtures plus schema/contract checker and selected codegen entrypoint; handwritten handler/error adapter, generated artifacts only when authorized. Raw requests prevent generated-client validation from masking missing server validation.
- **Local judgment:** internal DTO mapping, validation wiring, domain-call arrangement and error-adapter placement. **Upstream blocker:** conflicting status/schema/auth decisions, unsupported dialect feature, missing owned contract reference or unauthorized regeneration requirement. Never silently omit operation or replace public envelope.

## P2 — gRPC typed streaming method

- **Trigger / non-trigger:** supplied gRPC method with declared server/client/bidirectional streaming. Unary method shares RPC status/codegen rules but does not select streaming lifecycle; `.proto` event payload alone selects codec work. Connect and gRPC-Web need their supplied protocol reference, not presumed native gRPC trailers.
- **Packet additions:** service/method descriptor, stream cardinality/direction, metadata and status/detail mappings, deadline propagation, compression and decoded-message limits, input half-close meaning, output termination and cancellation owner.
- **Steps:** 1. Implement generated method seam; use runtime message codec/framing, preserve field numbers/presence and method cardinality. 2. Authenticate metadata at call entry; enforce method/resource policy before emitting data/effects, including per-input-message resource checks where needed. 3. Produce/consume with bounded demand, propagate deadline/cancellation to owned child work and stop producers. 4. Finish with final RPC status; failure can follow valid output items [R], [RC].
- **Framing/completion:** gRPC messages have compression flag plus four-byte big-endian length; HTTP/2 DATA boundaries need not align. Runtime owns this framing. Client input half-close is not server response completion; transport cancellation does not imply rollback of already-committed effects.
- **Tools / output:** existing descriptor-aware RPC client/checks and selected `.proto` generation entrypoint; handwritten service, status mapping and cleanup, separately owned generated stubs. Compile success or an `UNIMPLEMENTED` default is not method completion [L30].
- **Local judgment:** stream combinator versus bounded channel, cancellation bridge, internal mapping and batching within limits. **Upstream blocker:** unspecified partial-result policy/status details, missing codegen/runtime compatibility facts or transport capability mismatch; never downgrade streaming or change schema.

## P3 — GraphQL resolver execution and request-scoped batching

- **Trigger / non-trigger:** named SDL fields/resolvers and supplied executor/HTTP profile. Generic JSON endpoint, GraphQL client query alone or performance diagnosis request does not select server resolver work. Subscriptions/incremental delivery additionally require explicitly supplied transport/proposal version.
- **Packet additions:** SDL/nullability, scalar coercion, query/mutation semantics, principal context, field/resource rules, error `extensions`/masking, pagination and complexity budgets, existing batch-capable domain seam and cache invalidation obligations.
- **Steps:** 1. Bind resolvers without editing public SDL; preserve executor parsing/validation/coercion. 2. Propagate authenticated request context into resource/field checks. 3. Batch eligible sibling loads per request/principal; align results to original keys including missing entries, maintain authorization context and clear affected cached entries after assigned mutation. 4. Let executor perform null propagation and `errors.path`; retain successful siblings and supplied HTTP profile [G], [D], [GH].
- **Lifetime:** loaders are not process-global tenant caches. A long-lived subscription needs its supplied per-execution/event cache lifetime, not unbounded connection memoization. Request cancellation must reach data work through selected runtime; ordinary GraphQL partial data is not an unfinished stream.
- **Tools / output:** existing GraphQL execution/HTTP fixtures and data-access assertions; resolvers, request-context loader wiring and mapped errors. Typed resolver codegen, if already selected, owns signatures rather than authorization or batching behavior.
- **Local judgment:** batch key structure, internal row ordering, async composition and invalidation placement. **Upstream blocker:** missing nullability/error disclosure policy, incompatible HTTP profile, absent required domain capability or unselected subscription transport. No blanket HTTP-200 rule or new query-budget policy.

## P4 — SSE or WebSocket operation lifetime

- **Trigger / non-trigger:** assigned event endpoint or WS handler with fixed framing/subprotocol and completion semantics. “Realtime” requirement without chosen transport is upstream design; WebSocket dependency alone does not authorize a subscription protocol.
- **Packet additions:** SSE native EventSource versus fetch consumer; WS handshake version/subprotocol; credential and origin policy; event/message schema, operation IDs, completion/error/close rules, cursor/replay behavior, queue/message/connection budgets and heartbeats if required.
- **SSE steps:** authorize before headers; emit UTF-8 `text/event-stream` events terminated by blank lines, preserving multiline `data`, IDs and supplied cursor rules. Flush within latency budget. After headers, use supplied in-band terminal/error behavior when writable; otherwise terminate as incomplete under supplied policy. Native EventSource reconnects after EOF; `204` can stop a subsequent connection, not replace committed `200` [S].
- **WS steps:** validate supplied authentication, origin and subprotocol before accepting where policy requires; authorize each resource-bearing operation. Runtime handles masking, fragmented-message assembly, control frames and close handshake. Preserve text/binary distinction and application correlation; a frame is not necessarily a complete message. Operation completion is separate from connection close [W].
- **Shared steps / tools / output:** respect backpressure and supplied queue cap, cancel timers/producers/subscriptions on disconnect or deadline; use existing streaming/WS client fixtures; deliver lifecycle handler and framing adapter. Send success terminal only on successful domain completion; never send reserved WS close code `1006`.
- **Local judgment:** serializer, bounded queue design and finalizer placement. **Upstream blocker:** missing terminal/replay policy, unmet proxy capability outside scope, or native EventSource paired with mandatory arbitrary authorization header; its constructor exposes URL/credentials, not custom headers. Do not move credentials into URL or replace transport locally.

## P5 — Bounded upload or raw-body webhook ingress

- **Trigger / non-trigger:** assignment names multipart/raw file upload or provider-signed HTTP body. Ordinary JSON ingestion does not gain signature verification or multipart parsing merely because it is POST. Load only applicable ingress branch.
- **Packet additions:** media/part schema and destination ownership; total/per-file/field/count/time limits, completion/publication policy; or signature scheme/version, exact signed byte boundary, header composition, key source, time tolerance/replay rules, event/account authorization, dedupe and acknowledgment semantics.
- **Upload steps:** authenticate and authorize destination; for multipart, parse declared boundary and repeated fields with existing parser, not string splitting; for raw upload, stream declared media body directly. Enforce actual received-byte budgets before unbounded buffering/spooling; filename is metadata, never an authorized path. Publish only at supplied completion boundary; abort/cleanup partial storage on rejection/disconnect according to policy [M].
- **Webhook steps:** preserve original signed body at provider-specified content-decoding boundary; enforce ingress bound; pass unchanged bytes plus required headers/timestamp to selected verifier **before JSON parsing or effects**. No trim, newline normalization, parse/reserialize or encoding substitution. Then decode and apply event/resource policy plus assigned dedupe/commit/ack semantics [ST].
- **Response / tools / output:** exact supplied success acknowledgment/body and malformed/signature/oversize/storage error mapping, including `413` only where specified; a received prefix is not completed upload. Existing multipart/raw-byte/signature fixtures and HTTP checks; bounded ingress adapter, verifier integration, handler and cleanup. Valid signature alone is not account/resource authorization or exactly-once delivery.
- **Local judgment:** bounded streaming/spooling, parser placement, verifier SDK call and temporary-resource cleanup. **Upstream blocker:** signed-byte boundary unavailable after existing middleware, missing key/tenant/replay/ack policy, unspecified persistence boundary, or required host change outside allowlist. No new queue or credential policy.

## P6 — Supplied binary grammar/codec integration

- **Trigger / non-trigger:** assigned parser/serializer integration for exact supplied grammar/schema, imports and selected codec. Exclude reverse engineering, sample-based schema inference and choosing Protobuf/FlatBuffers as replacement for fixed external layout.
- **Packet additions:** endian/bit/length/version rules, envelope and packing, record boundary/trailing-byte policy, checksum/semantic rules, byte/count/depth/decompression budgets, target read/write capability, parser/buffer lifetime, independent golden bytes and existing error/status/ack adapter.
- **Steps:** 1. Assemble bounded frame with cancellation and distinguish “need more input” from terminal truncation. 2. Invoke selected generated parser/verifier with supported buffer ownership; force required lazy validations before effects. 3. Apply semantic/resource policy and exact-consumption rule. 4. Map malformed/unsupported input to supplied error, never success/default values. For writing, use selected builder/writer and emit only completed valid frame [K], [KR].
- **Tools / output:** preprovisioned grammar compiler, existing byte-fixture/check runner and diff; generated parser/accessors plus handwritten framing/domain adapter. Compiler owns layout; the backend specialist owns integration. Regeneration requires owned output root; public grammar remains fixed.
- **Local judgment:** bounded input adapter, buffer lifetime, error classification and semantic-check placement. **Upstream blocker:** absent grammar/import, ambiguous framing, unsupported target writer or missing policy. A structural parser is neither network authentication nor domain validation; consume supplied trust/auth context.
- **Concrete source specimen:** R45/Kaitai `user_types.ksy` is `u4` little-endian length plus body. Golden `02 00 00 00 68 69` means length 2/body `hi`; short body is truncation; extra `00` requires caller's exact-consumption check. A bare length field supplies no application quota [K], [KR].

## Conditional framework/library references — not separate Cartesian skills

| Component facts supplied | Narrow instruction/reference and exact inspected boundary |
| --- | --- |
| Go + ogen **1.24.0**, source `0d865e7e568f1b36e5e6788e39aa5cd14e02999f` | Implement generated handler seam; adapt framework errors to supplied public envelope. Default handler emits `error_message`, not arbitrary contract `Problem.message` [OG]. Pin generator/runtime recipe from R29; do not infer complete validation from types. |
| Rust + tonic **0.14.6** | Tagged stream example uses `Stream<Item = Result<Message, Status>>`; producer exits on failed channel send [T]. Cancellation while awaiting domain I/O still needs explicit bridge; sample capacity is not application policy. Use supplied tonic/prost/build pins from R30, not copied stubs as finished business code. |
| JS/TS + DataLoader **2.2.3** | Instantiate with authenticated request context; batch array length/order must match keys; clear affected cache after mutation [D]. These lifecycle/order obligations transfer to other languages; JS event-loop scheduling details do not. |
| JVM + Spring MVC **6.2.11** SSE | `SseEmitter.event().name(...).id(...).data(...)` formats events [SS]. Register timeout/error/completion cleanup; `completeWithError` cannot change committed status [SE]. MVC callbacks are not WebFlux subscription APIs. |
| Python + Starlette **0.47.3** WS | `accept(subprotocol=...)`, receive/send text versus bytes and `WebSocketDisconnect` are distinct seams. Custom pre-accept HTTP denial requires server's `websocket.http.response` extension [SW]. Source-generated `1006` disconnect exception is not permission to transmit that code. |
| Python + Starlette **0.47.3** ingress | `Request.stream()` is one-shot absent cached body; `.body()` aggregates it [SR]. `MultiPartParser.max_part_size` check covers non-file parts in this version; `spool_max_size` controls spill threshold, not upload rejection [SP]. Supply total/file limits at actual intake boundary. |
| Stripe webhook + stripe-node **18.5.0** | `constructEvent(rawBody, signatureHeader, secret, ...)` verifies before JSON parse; HMAC content is timestamp + `.` + original UTF-8 payload [ST]. This is Stripe-specific composition, not universal webhook algorithm. Preserve supplied tolerance/key/account policy. |
| Kaitai compiler/runtime **0.11** | Read-write support documented for Java/Python; `--read-write` implies no automatic read, so call `_read()` explicitly. Set lengths/links, `_check()` each modified object (not recursive), then `_write()` with proper stream size [K], [KR]. Other targets do not inherit writer capability. |

## Proposed selection and behavior checks — UNEXECUTED

Each row names selection positive/negative and behavioral witness/counterexample. Use existing assigned fixtures and actual implementation paths later; zero selected cases, skipped checks or missing peer/tool mean unresolved evidence, not a pass. Counterexamples must fail for named reason rather than merely crash.

| Card | Selection + / − | Behavior + / − |
| --- | --- | --- |
| P1 | Fixed JSON REST route selects; GraphQL POST with same JSON media does not. | Valid raw HTTP call → exact status/header/body; structurally typed but bounds-invalid raw payload → prescribed rejection before domain effects. Generated client rejecting locally is insufficient. |
| P2 | `.proto` server-streaming method selects; `.proto` broker payload does not. | Messages plus OK trailers complete; same prefix plus non-OK/missing trailers cannot pass success. Cancel after first item and during blocked production → owned work releases within supplied bound, not background continuation. |
| P3 | Assigned nested resolver with batch seam selects; client-only query does not. | Repeated keys across sibling fields batch with ordered results and fresh per-request principal context; second tenant with identical IDs cannot receive first tenant cache. Field failure yields expected null bubbling/path/siblings; invalid document invokes no resolver. |
| P4 | Supplied SSE/WS contract selects its branch; gRPC stream or unexplained “realtime” does not. | Chunk-split SSE event dispatches once after blank line; truncated event/EOF is not `done`. Fragmented WS message with interleaved ping preserves message; operation `complete` leaves multiplexed socket open. Slow reader/cancel stays within supplied queues and cleanup bound. |
| P5 | Signed provider webhook or multipart upload selects correct branch; unsigned JSON POST does not. | Original signed fixture accepted; whitespace-only JSON rewrite with original signature rejected before effects. Upload crossing chunk boundaries completes with exact bytes; oversized/truncated upload cannot publish success and follows cleanup policy. Replayed valid webhook follows supplied dedupe/ack outcome. |
| P6 | Supplied `.ksy` and target selects; unexplained binary sample does not. | Independent `02 00 00 00 68 69` golden decodes; short body, hostile declared length and forbidden trailing byte reject at specified boundary. Structurally valid but semantically forbidden body fails domain rule. Round trip alone is insufficient evidence. |

Cross-language selection pair: equivalent authorized gRPC streaming assignments in Go and Rust both select P2, with different runtime references; a Rust REST assignment selects P1. Mixed assignment composes P5 ingress + P6 payload only when both facts are supplied. Missing policy returns exact owner question, not transport discovery or speculative design.

## Extraction recommendation

- Shared scope guidance: fixed contract, supplied authorization/resource policies, codegen ownership, response commit point, cancellation/cleanup and evidence handoff. Keep source/schema compatibility, wire validation and business behavior as distinct claims.
- Protocol cards P1–P6 carry actual procedural differences. SSE/WS and upload/webhook keep compact branch references. Runtime rules supply context/cancellation/task-lifetime APIs; conditional references supply framework hooks and version traps. No language × protocol × framework catalog.
- Author shared guidance and REST/gRPC/GraphQL cards first, then selected streaming/ingress/grammar recipes. Native skill metadata may describe applicability; report does not implement automatic composition, permission enforcement or routing. Research status only; authored/installed/exercised require later evidence.

## Primary sources and local leads

[PLAN]: /Users/gustavoschneiter/Documents/HuGR/_worktrees/backend-plugin/specs/backend-specialist/research/skill-variants-plan.md
[L29]: /Users/gustavoschneiter/Documents/HuGR/_worktrees/backend-plugin/specs/backend-specialist/research/29-http-codegen.md
[L30]: /Users/gustavoschneiter/Documents/HuGR/_worktrees/backend-plugin/specs/backend-specialist/research/30-rpc-contracts.md
[L45]: /Users/gustavoschneiter/Documents/HuGR/_worktrees/backend-plugin/specs/backend-specialist/research/45-binary-codecs.md
[H]: https://www.rfc-editor.org/rfc/rfc9110.html#section-15
[O]: https://spec.openapis.org/oas/v3.1.1.html#responses-object
[R]: https://github.com/grpc/grpc/blob/v1.75.1/doc/PROTOCOL-HTTP2.md
[RC]: https://github.com/grpc/grpc.io/blob/4f733b4438ecfacd807c943c9f757a7a55044156/content/en/docs/guides/cancellation.md
[G]: https://spec.graphql.org/September2025/#sec-Handling-Execution-Errors
[GH]: https://github.com/graphql/graphql-over-http/blob/e28746596c38a414015e0f61d7d3e92b8ce54912/spec/GraphQLOverHTTP.md
[S]: https://www.w3.org/TR/2015/REC-eventsource-20150203/
[W]: https://www.rfc-editor.org/rfc/rfc6455#section-5
[M]: https://www.rfc-editor.org/rfc/rfc7578#section-4
[OG]: https://github.com/ogen-go/ogen/blob/0d865e7e568f1b36e5e6788e39aa5cd14e02999f/ogenerrors/handler.go
[T]: https://github.com/grpc/grpc-rust/blob/tonic-v0.14.6/examples/src/streaming/server.rs
[D]: https://github.com/graphql/dataloader/blob/v2.2.3/README.md
[SS]: https://github.com/spring-projects/spring-framework/blob/v6.2.11/spring-webmvc/src/main/java/org/springframework/web/servlet/mvc/method/annotation/SseEmitter.java
[SE]: https://github.com/spring-projects/spring-framework/blob/v6.2.11/spring-webmvc/src/main/java/org/springframework/web/servlet/mvc/method/annotation/ResponseBodyEmitter.java
[SW]: https://github.com/encode/starlette/blob/0.47.3/starlette/websockets.py
[SR]: https://github.com/encode/starlette/blob/0.47.3/starlette/requests.py
[SP]: https://github.com/encode/starlette/blob/0.47.3/starlette/formparsers.py
[ST]: https://github.com/stripe/stripe-node/blob/v18.5.0/src/Webhooks.ts
[K]: https://doc.kaitai.io/serialization.html
[KR]: https://github.com/kaitai-io/kaitai_struct_python_runtime/blob/v0.11/kaitaistruct.py

Version boundaries: RFC 9110 (June 2022), OpenAPI 3.1.1, gRPC wire document at v1.75.1, GraphQL September 2025 plus separately pinned HTTP draft, RFC 6455 version-13 HTTP/1.1 handshake (December 2011), RFC 7578 (July 2015). SSE immutable 2015 REC cited only for named framing/EOF/reconnect/constructor rules; those also inspected in [WHATWG §9.2](https://html.spec.whatwg.org/multipage/server-sent-events.html), page updated 2026-10-03. No full equivalence between historical and living processing models claimed. Kaitai guide is live, inspected 2026-10-04, explicitly v0.11+; runtime observations pinned to 0.11. Framework examples are exact inspected releases, not latest-version or cross-target compatibility claims.
