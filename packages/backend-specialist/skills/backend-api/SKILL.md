---
name: backend-api
description: "API boundary obligations for an assigned backend change: an endpoint, handler, RPC method, resolver, event stream, upload or webhook route, binary codec or external client built against a supplied contract. Load with backend-implement when the packet changes a request, response or wire boundary. Not for choosing a transport, designing a public API or diagnosing a broken endpoint."
---

# Backend API boundary

This skill adds API boundary obligations to `backend-implement`, which you load first. It sits under your system prompt and never widens it. The packet decides scope, design, write paths and checks; where this skill and the packet disagree, follow the packet.

## When this applies

- Applies: an assigned endpoint, handler, RPC method, resolver, event stream, upload or webhook route, binary codec or external client whose contract the packet supplies.
- Does not apply: an internal calculation behind an unchanged boundary, an ordinary handler that keeps its existing serialization, or a client-only query. A dependency, a file name or the word "stream" does not select this skill.
- Not yours: choosing a transport for a "realtime" need, designing or changing the public contract, resolving conflicting status or error profiles, or finding out why an endpoint fails. Return a `packet` blocker that names the contract owner.

## Inputs beyond the common packet

- The contract revision and its source of truth: OpenAPI, SDL, `.proto`, byte grammar or framing, with the operations and fields in scope.
- Success, status, header, media and error mappings, including the public error envelope.
- The authentication source and credential transport, tenant, resource and field authorization rules, and disclosure or redaction rules.
- Budgets for bytes, messages, parts, depth and concurrency; deadlines; cancellation and cleanup obligations.
- Retry, replay, deduplication and acknowledgment rules, only where the operation needs them. The protocol does not decide them.
- Codegen facts: the selected tool and runtime versions, the owners of the schema and the generated root, which outputs may be regenerated, and the permitted generation entrypoint.

A missing item the change depends on is a `packet` blocker. You do not need prewritten handler code or every command argument.

## Select the protocol reference

Read only the reference whose facts the packet supplies:

- [REST JSON operation](../backend-implement/references/protocols/rest.md)
- [gRPC method](../backend-implement/references/protocols/grpc.md)
- [GraphQL resolvers](../backend-implement/references/protocols/graphql.md)
- [Server-sent events](../backend-implement/references/protocols/sse.md)
- [WebSocket operations](../backend-implement/references/protocols/websocket.md)
- [Upload ingress](../backend-implement/references/protocols/upload.md)
- [Signed webhook ingress](../backend-implement/references/protocols/webhook.md)
- [Supplied binary grammar or codec](../backend-implement/references/protocols/codec.md)
- [Application authorization](../backend-implement/references/cards/app-auth.md), when the packet assigns implementing allow and deny rules. Preserving existing auth unchanged does not load it.

A mixed assignment, such as an ingress route carrying a binary payload, composes two references only when the packet supplies both sets of facts. Framework, library and version details live in the references your stack selects; a protocol reference never selects a framework. Stream body and producer lifetimes are in `backend-concurrency`.

Stack references: [Go](../backend-implement/references/languages/go.md), [Python](../backend-implement/references/languages/python.md), [JavaScript/TypeScript](../backend-implement/references/languages/js-ts.md), [Ruby](../backend-implement/references/languages/ruby.md), [PHP](../backend-implement/references/languages/php.md). Read only the packet's language.

## Common procedure

1. Read the assigned contract and seam. The schema, SDL, `.proto` or grammar is the source of truth; edit it only when the packet assigns a contract change.
2. Bind the existing validation, authentication and domain interfaces. Decode with the specified media and parameter semantics, and apply runtime validation and the supplied resource checks before protected work or effects.
3. Call the domain operation with the request's cancellation.
4. Map every result to the exact status, headers, body or terminal signal, including the framework's own validation and error paths.
5. Respect the response commit point. Once headers or bytes are sent, the status cannot change; use the in-band terminal or error behavior the contract defines.
6. Stop owned work and release resources on completion, error, disconnect and deadline.

## Generated code

- Regenerate only when the actual generator inputs change, through the permitted entrypoint, into the owned output root. Never hand-edit generated output; if it lies outside the write paths, return a `packet` blocker.
- Generated types are not runtime validation. A generated service seam is not business behavior, and a stub or a clean compile is not a completed endpoint.
- A codec does not own transport framing or domain policy.

## Your choices and the caller's

Yours: DTO mapping, validation wiring, domain-call arrangement, error-adapter placement, internal helpers, bounded buffering and the arrangement of assigned test cases.

Not yours: the transport, the public contract, status or error semantics the contract leaves open, consumer decisions, unsupported generator constructs, and credential, tenant or replay policy. Never silently omit an operation, replace the public envelope, downgrade streaming, relax nullability or move credentials into a URL. Each is a `packet` blocker that names the contract owner.

## Checks

- Run the packet's checks. Assigned boundary cases go through the real server path with raw requests: a generated client that validates locally can mask missing server validation.
- An HTTP 200 is not universal completion. gRPC needs its terminal status, GraphQL carries `data` and `errors`, and a stream needs its terminal event.
- Report only what you ran; a passing local check is not production evidence. Return the result as `backend-implement` describes.
