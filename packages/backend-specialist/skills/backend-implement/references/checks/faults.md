# Prescribed transport faults

## Applicability

The packet prescribes a transport fault, such as a downstream blackhole, added latency or a dropped response, with its direction, timing and expected outcome.

## Non-trigger

- A fault the packet does not prescribe.
- Faults outside a TCP proxy's reach: DNS failure, UDP loss, disk faults, a database crash or an HTTP error status. Those need their own supplied mechanism.

## Inputs

- The exact fault type, direction and attributes.
- The upstream endpoint, with its authentication and TLS requirements.
- The expected error, retry count or observable effect, and the recovery behavior when required.

## Steps

1. Wait for the proxy's control API, create the owned proxy to the upstream, and point the application at it before pools open.
2. Make one healthy call through the proxy as a baseline.
3. Install the prescribed fault and wait for the control API to confirm it. Never guess activation with sleeps.
4. Run the named case and assert the assigned error, retry count or effect.
5. In teardown, remove the named fault, check recovery with a fresh connection when required, close application clients, then delete the owned proxy.

## Tools and outputs

- The existing TCP fault proxy fixture.
- Output: the fault fixture, the cases, and their observed results.

## Limits and checks

- Different faults are not interchangeable: a blackhole that holds the connection open differs from added latency or a reset.
- A downstream timeout can hide a write that already committed. Assert the assigned idempotency or persisted outcome independently.
- A lost-response case must prove the fault came after acceptance or commit; failing before the outbound call does not exercise an uncertain success.
- Do not assert exact wall-clock durations. A global reset of a shared proxy affects every test; delete only what you own.
- A fault hook that was never reached is incomplete evidence, never a pass.
