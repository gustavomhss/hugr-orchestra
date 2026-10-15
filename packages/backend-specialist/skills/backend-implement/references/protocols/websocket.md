# WebSocket operations

## Applicability

An assigned WebSocket handler with a fixed handshake, subprotocol and per-operation completion semantics.

## Non-trigger

- A WebSocket dependency alone; it does not authorize a subscription protocol.
- A "realtime" requirement without a chosen transport, or a [server-sent events](sse.md) endpoint.

## Inputs

- The handshake version and subprotocol; credential and origin policy.
- The message schema, operation IDs, and the completion, error and close rules.
- Queue, message and connection budgets; heartbeats, if required.

## Steps

1. Validate the supplied authentication, origin and subprotocol before accepting, where policy requires it.
2. Authorize each operation that touches a resource.
3. Let the runtime handle masking, fragment assembly, control frames and the close handshake. Keep text and binary distinct and keep the application's request correlation.
4. Send the operation's success message only after the domain work succeeds; a supplied operation error ends that operation without it. Cancellation targets the request ID.
5. Respect backpressure and the queue cap. On disconnect or deadline, cancel timers, producers and subscriptions.

## Tools and outputs

- Existing WebSocket client fixtures.
- Output: the lifecycle handler and message adapter.

## Limits and checks

- A frame is not necessarily a complete message.
- Operation completion is separate from connection close. Never close a multiplexed connection to signal one operation's end.
- Never send the reserved close code `1006`.
- Checks: a fragmented message with an interleaved ping arrives intact; an operation's completion leaves a multiplexed socket open; a slow reader or a cancel stays within the supplied queue and cleanup bounds.
- Serializer, bounded queue and finalizer placement are yours. A missing completion or error policy, or a pre-accept denial the runtime cannot express, is a `packet` blocker.
