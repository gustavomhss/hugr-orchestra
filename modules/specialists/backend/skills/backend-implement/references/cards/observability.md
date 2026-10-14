# Observability signals

## Applicability

The packet assigns logs, metrics or traces with their signal contract: names, lifecycle and status meaning, attributes and redaction.

## Non-trigger

- Investigating an outage or a performance problem.
- Choosing what the system should measure.

## Inputs

- Signal names, and what each lifecycle point and status means.
- Bounded attributes and the redaction policy.
- The existing SDK and exporter version, and a capture fixture.

## Steps

1. Place emissions at the supplied operation boundaries.
2. Propagate the trace context into child work.
3. Set the prescribed error status explicitly, and end every span.
4. Emit completion signals when the work completes, not when the handler returns.

## Tools and outputs

- The existing telemetry SDK and capture tooling.
- Output: the instrumentation.

## Limits and checks

- Recording an error may not set the span's status; OpenTelemetry Go's `RecordError` does not. Set the prescribed status separately.
- A handler can end before its stream or its background work completes; a signal placed at handler end can report completion too early.
- Keep attributes within the supplied bounds and redaction rules.
- Checks capture success, failure and cancellation signals and compare their contents and lifetimes with the contract, and confirm the business outcome is unchanged.
- Emission and helper placement within the lifecycle are yours. A missing status or attribute policy, or a missing exporter fixture, is a `packet` blocker naming the observability owner.
