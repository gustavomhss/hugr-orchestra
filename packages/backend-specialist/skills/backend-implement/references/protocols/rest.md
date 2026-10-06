# REST JSON operation

## Applicability

An assigned JSON HTTP handler against a fixed method, path and response contract.

## Non-trigger

- GraphQL carried in JSON, gRPC, server-sent events, multipart uploads and signed raw-body webhooks. Each has its own reference, even when it arrives as a JSON `POST`.
- Pagination or idempotency behavior the packet does not assign.

## Inputs

- The OpenAPI document and dialect, if present.
- Parameter serialization and coercion, absent-versus-null rules, request and response constraints, response variants and content negotiation.
- The authentication challenge and resource-denial mappings.
- Pagination and idempotency rules, only when assigned.

## Steps

1. Bind the route and decode with the specified media and parameter semantics. Apply runtime validation and the supplied authentication and resource checks.
2. Call the domain operation with the request's cancellation.
3. Map each result to the exact status, headers and response schema, including the framework's own validation and error paths.
4. Bound serialization and finish the response. HEAD and 204 responses carry no content.

## Tools and outputs

- Existing raw HTTP fixtures, the contract checker and the selected codegen entrypoint.
- Output: the handwritten handler and error adapter, plus generated artifacts only when the packet authorizes regeneration.

## Limits and checks

- Use the values the validator produced, not the raw input it read.
- A failure after bytes were sent leaves the response incomplete; it cannot replace the status. Do not emit GraphQL `{data, errors}` or switch the body to NDJSON.
- Checks use raw requests: a valid call returns the exact status, headers and body, and a structurally typed but out-of-bounds payload is rejected before any domain effect. A generated client that rejects locally proves nothing about the server.
- Conflicting status, schema or auth decisions, an unsupported dialect feature, a missing contract reference or an unauthorized regeneration is a `packet` blocker. Never silently omit an operation or replace the public envelope.
