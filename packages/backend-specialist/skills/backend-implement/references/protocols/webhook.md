# Signed webhook ingress

## Applicability

The packet names a provider-signed HTTP body to receive.

## Non-trigger

- An unsigned JSON `POST`. It does not gain signature verification because it is a `POST`.
- A multipart or raw file [upload](upload.md).

## Inputs

- The signature scheme and version, the exact signed byte boundary, how the signed content is composed from headers and body, the key source, the time tolerance and replay rules.
- Event and account authorization.
- Deduplication, commit and acknowledgment semantics.
- The ingress byte bound and the success, malformed, signature and oversize error mappings.

## Steps

1. Keep the original signed body at the boundary the provider specifies, and enforce the ingress bound.
2. Pass the unchanged bytes and the required headers or timestamp to the selected verifier before JSON parsing or any effect. Never trim, normalize newlines, parse and reserialize, or change the encoding.
3. Then decode, and apply the event and resource policy.
4. Apply the assigned deduplication, commit and acknowledgment semantics, and send the supplied acknowledgment.

## Tools and outputs

- Existing raw-byte and signature fixtures, and HTTP checks.
- Output: verifier integration, the handler and the acknowledgment mapping.

## Limits and checks

- A valid signature is not account or resource authorization, and not exactly-once delivery.
- The signing algorithm is provider-specific; use the selected provider's library reference, never a generic recipe.
- Checks: the original signed fixture is accepted; a whitespace-only rewrite of the same JSON with the original signature is rejected before effects; a replayed valid webhook follows the supplied deduplication and acknowledgment outcome.
- The verifier call and its placement are yours. A signed byte boundary that existing middleware already consumed, or missing key, tenant, replay or acknowledgment policy, is a `packet` blocker. Do not add a queue or a credential policy.
