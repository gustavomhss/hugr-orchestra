# HTTP, event and queue journeys

Read when an input crosses transport, publication or asynchronous consumption. Do not flatten these edges into a synchronous call graph. Use [transactions](data-transactions.md), [retry](retry-idempotency.md) and [lifecycle](lifecycle.md) only for the relevant subquestion.

## HTTP

Trace route registration, method/path matching, decoding, authorization, domain operation and response mapping. Read the actual schema and error adapters, including framework validation defaults. Generated types are not server validation. RFC 9110 defines HTTP semantics; application completion and retry policy still come from the applicable product contract/version.

Distinguish request acceptance, durable admission, model/job execution and visible result. A 200/202 can describe one stage without proving downstream completion. Follow a handle or status lookup to its owner. For streams, inspect headers/commit point, framing, terminal/error signal and disconnect handling: an open connection or initial response is not complete delivery. Once bytes commit, later errors may need an in-band terminal rather than a changed status.

Capture an observed request with relevant inputs/status/body and version when supplied. Source inspection supports possible mappings, not which branch production took. Do not fetch live endpoints beyond the mission's permitted observational effects.

## Events

Find the producer, exact event identity/version, payload, aggregate/namespace and publication boundary. Then find consumer/projector registration, decode/filter and state effect. Record two witnessed edges: producer-to-event and event-to-consumer. A matching name alone is not subscription identity or bootstrap activation.

Separate local notification, durable event commit, projection, advisory wake and explicit execution. A no-op/alternate consumer can change the journey. Determine whether failure after commit can leave a pending projection or external publication, and who owns recovery. If activation is not observed, describe the statically selected path and remaining selector evidence.

## Queues

Trace enqueue/admission, payload identity/version, routing, reservation/visibility, attempt, handler effect, acknowledgment and redelivery policy. Inspect deduplication scope, lease expiry, retry/dead-letter limits and consumer readiness when material. Enqueued, delivered, processed and acknowledged are different observations.

Ask what happens when a worker crashes before effect, after effect but before acknowledgment, or while visibility expires. Identify identity preserved across redelivery and which system owns the external effect. An advertised exactly-once property needs its actual scope and conditions; do not extend local deduplication to an unprotected destination.

## Observe and delimit

Use read/grep/glob and configured semantics for source witnesses. Use supplied/admitted logs or traces for actual executions; correlation IDs connect observations but missing spans may reflect sampling, retention or propagation. OpenTelemetry context propagation explains sender/receiver association, not counterfactual causality.

Record contract/version, ownership, edge type, support and unobserved activation. If a cross-process consumer or destination is unavailable, preserve that gap rather than inventing the final step. Permission denial/verification hold is a verbatim blocker, not permission to inspect via another route.

Write the journey around the question: “what becomes durable before returning?”, “who can repeat the effect?”, or “where is completion decided?” Stop when the relevant boundary and exception are explained; whole-system topology is unnecessary.
