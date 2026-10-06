# HTTP boundary fixtures

## Applicability

Assigned tests where the application calls an external HTTP service and the case needs a deterministic response: retries, headers, parsing, pagination or a prescribed failure.

## Non-trigger

- Proving the provider itself conforms; a mock cannot.
- Recording new interactions the packet does not assign.

## Inputs

- The application's base-URL injection.
- The request matchers and the responses for each case.
- The expected request counts and sequence.
- Supplied recordings, when they exist.

## Steps

1. Start the fixture server, or use the existing one, and confirm each mapping registered.
2. Point the application at it through the supplied injection.
3. Call the application's real API and assert the assigned domain result.
4. Verify the request count and sequence, and assert that no request went unmatched.
5. Reset only the mappings, scenario state and journal you own, and stop the server after application workers exit.

## Tools and outputs

- The existing HTTP mock fixture. Keep an existing tool rather than adding another.
- Output: mapping files, the cases and their observed results.

## Limits and checks

- The boundary is real on the application side, through its HTTP client, serialization and socket, and substituted on the provider side.
- Fixed fixtures do not cover provider drift, real quotas, provider-side authorization or unspecified TLS behavior.
- Keep the request journal on, so that an expected 404 cannot pass on an unmatched-request 404.
- Shared scenario counters and journals need a per-test instance or assigned serialization.
- Recordings become reviewed mappings with frozen values and redacted credentials, replayed offline. Tighten matching where the contract needs exact fields or order. Never re-record to make a failing test pass.
