# gRPC method

## Applicability

A supplied gRPC method, unary or with declared server, client or bidirectional streaming. Streaming lifecycle steps apply only to a streaming method; status and codegen rules apply to both.

## Non-trigger

- A `.proto` message used as a broker or event payload: that is [codec](codec.md) work.
- Connect or gRPC-Web: they need their own supplied protocol facts, not presumed native gRPC trailers.

## Inputs

- The service and method descriptor, stream cardinality and direction.
- Metadata, status and error-detail mappings; deadline propagation; compression and decoded-message limits.
- What client half-close means, how output terminates, and who owns cancellation.
- The partial-result policy when a failure can follow valid output.

## Steps

1. Implement the generated method seam. Let the runtime own message framing; preserve field numbers, presence and method cardinality.
2. Authenticate metadata at call entry. Enforce method and resource policy before emitting data or effects, and per input message where resources vary.
3. Produce and consume with bounded demand. Propagate the deadline and cancellation to owned child work and stop producers.
4. Finish with the final RPC status. A failure status may follow valid output items.

## Tools and outputs

- An existing descriptor-aware RPC client and checks, and the selected `.proto` generation entrypoint.
- Output: the handwritten service, status mapping and cleanup. Generated stubs are separately owned.

## Limits and checks

- HTTP 200 alone is not RPC success. A delivered prefix followed by a non-OK status, missing trailers or a reset is a failure.
- Client half-close is not server completion. Transport cancellation does not roll back effects already committed.
- A clean compile or a default `UNIMPLEMENTED` method is not a finished method.
- Checks: messages plus OK trailers complete; the same prefix with a non-OK status cannot pass. Cancelling after the first item, and while production is blocked, releases owned work within the supplied bound.
- Stream combinator versus bounded channel, the cancellation bridge and internal batching are yours. An unspecified partial-result policy or status detail, or missing codegen or runtime compatibility facts, is a `packet` blocker; never downgrade streaming or change the schema.
