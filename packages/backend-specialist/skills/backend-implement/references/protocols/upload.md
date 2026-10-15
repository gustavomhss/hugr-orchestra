# Upload ingress

## Applicability

The packet names a multipart or raw file upload route.

## Non-trigger

- Ordinary JSON ingestion. A `POST` does not gain multipart parsing because it is a `POST`.
- A provider-signed body: see [webhook](webhook.md).

## Inputs

- The media and part schema, and who owns the destination.
- Total, per-file, per-field, count and time limits.
- The completion and publication policy, and what happens to partial storage on rejection or disconnect.
- The success acknowledgment and the malformed, oversize and storage error mappings.

## Steps

1. Authenticate and authorize the destination.
2. For multipart, parse the declared boundary and repeated fields with the existing parser, never by splitting strings. For a raw upload, stream the declared media body directly.
3. Enforce budgets on the bytes actually received, before unbounded buffering or spooling.
4. Publish only at the supplied completion boundary.
5. On rejection or disconnect, abort and clean up partial storage as the policy says.

## Tools and outputs

- Existing multipart or raw-byte fixtures and HTTP checks.
- Output: a bounded ingress adapter, the handler and cleanup.

## Limits and checks

- A filename is metadata, never an authorized path.
- A spill-to-disk threshold is not a rejection limit; enforce the supplied limits at the actual intake boundary.
- A received prefix is not a completed upload. Use 413 only where the contract specifies it.
- Checks: an upload crossing chunk boundaries completes with the exact bytes; an oversized or truncated upload cannot publish success and follows the cleanup policy.
- Streaming or spooling strategy, parser placement and temporary-resource cleanup are yours. A missing persistence boundary, or a change to host configuration outside the write paths, is a `packet` blocker.
