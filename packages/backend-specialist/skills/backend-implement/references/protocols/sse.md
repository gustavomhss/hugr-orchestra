# Server-sent events

## Applicability

An assigned event endpoint with fixed event framing and completion semantics.

## Non-trigger

- A "realtime" requirement without a chosen transport: that is design and belongs upstream.
- A gRPC stream or a [WebSocket](websocket.md) handler.

## Inputs

- The consumer: native EventSource or a fetch-based reader.
- Credential and origin policy, the event schema, the success terminal event and the error event.
- Cursor, ID and replay rules; queue, message and connection budgets; heartbeats, if required.

## Steps

1. Authorize before sending headers.
2. Emit UTF-8 `text/event-stream` events, each ended by a blank line. Preserve multiline `data`, event IDs and the supplied cursor rules.
3. Flush within the latency budget and respect backpressure and the queue cap.
4. Send the success terminal event only after the domain work succeeds. After headers, use the supplied in-band error event while the stream is writable; otherwise end it as incomplete under the supplied policy.
5. On disconnect or deadline, cancel timers, producers and subscriptions.

## Tools and outputs

- Existing streaming client fixtures.
- Output: the lifecycle handler and framing adapter.

## Limits and checks

- Event names and terminal events are contract facts, not standard behavior.
- EOF is not completion: a native EventSource reconnects after EOF. A later 204 can stop reconnection; it cannot replace a committed 200.
- A native EventSource cannot send arbitrary headers. If policy needs a custom authorization header, return a `packet` blocker; never move credentials into the URL.
- Checks: an event split across chunks dispatches once, after its blank line; a truncated event or bare EOF is not the terminal event; a slow reader or a cancel stays within the supplied queue and cleanup bounds. A buffered HTTP test cannot prove live disconnect timing.
- Serializer, bounded queue and finalizer placement are yours. A missing terminal or replay policy, or a proxy capability outside scope, is a `packet` blocker.
