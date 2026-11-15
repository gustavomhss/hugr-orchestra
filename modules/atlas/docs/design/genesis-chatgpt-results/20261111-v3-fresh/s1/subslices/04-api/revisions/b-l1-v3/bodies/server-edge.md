# L1: server errors, authorization, and location selection

Key: `s1.api.server-edge`. Source pin: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Error declarations and composition

`packages/protocol/src/errors.ts` declares tagged errors with HTTP annotations: invalid request/cursor 400; unauthorized 401; forbidden 403; conflict 409; service unavailable 503; unknown error 500; and domain-specific not-found errors at 404, including provider, session, message, permission, question, PTY, and MCP server. Optional details such as invalid-request kind/field, conflict resource, service name, and unknown-error reference remain part of their individual schemas.

Protocol's `makeDefaultApi` assembles groups and accepts middleware keys supplied by its caller. Server installs real location services. General authorization and schema-error middleware are applied at API composition; the source comments and placement explicitly put authentication before caller-selected location. Capability groups add capability authorization before location work. The API does not apply identical location selection to every group: global/project/config/trust/board and session-scoped routes have deliberately different composition.

The schema-error adapter defines `REASON_LIMIT = 1024`. For an oversized reason it retains `reason.slice(0, REASON_LIMIT)` and appends `... (N more chars)`, where N is `reason.length - REASON_LIMIT`; the limit therefore applies to the prefix as measured by JavaScript string length/slice. It logs and returns that prefix plus the omitted-character count in an `InvalidRequestError` with kind, so the complete summary may exceed 1,024 characters. A defect outside the typed error mapping is not proven to receive this treatment.

## Authentication paths

`ServerAuth` reads an optional server password and a username defaulting to `orchestra`. General authorization passes through when no nonempty password is configured. With a password, it validates Basic credentials. Query credentials are considered only for the explicitly recognized global event, session event, and PTY connect paths. Ordinary API calls use headers.

Two recognized ticket URL forms bypass the general Basic gate so their handlers can validate the ticket: PTY connect tickets and capability content tickets. The URL shape is not itself authorization. PTY ticket issuance requires the special ticket-request header, an allowed origin, and an existing PTY. Connection consumes a ticket bound to the PTY and location context, or fails; the raw upgrade handler owns that path. Capability content verifies its ticket, enters the minted request authority, and reauthorizes through artifact management so revocation still matters. An invalid ticket receives an unauthorized empty response; unavailable artifacts map separately.

Capability authorization has its own authority model. When Basic authentication is required it validates the configured operator credentials. Otherwise it requires a 43-character bearer token. Caller-supplied identity fields do not grant authority. The middleware validates the idempotency header shape, enters a request context with an authority and request ID, maps authentication-required/revoked failures to 401 and other capability refusals to 403, and preserves unrelated causes. This body describes adapter behavior, not a security audit of the full capability store or token implementation.

The server principal uses operating-system account identity with a local fallback; a Basic username does not create independent per-person accounts. SDK embedding explicitly supplies no Basic password, but still uses capability authority as described in the SDK body.

## Location and service boundary

General location selection reads `location[directory]`, otherwise uses current working directory, and reads workspace from the query or `x-orchestra-workspace`. Missing directories map to invalid request with `location_not_found`; typed failed boots map to `location_unavailable`; defects remain defects. Existing cached services can still be supplied. Session middleware instead loads the directory/workspace stored for the session and fails 404 when the session is absent.

Model and provider handlers obtain availability from the host catalog. The inspected model handler combines available catalog models with additional enabled models while avoiding duplicate IDs, and selects the preferred/default model or null. Provider account/sign-in endpoints are typed operations; their presence does not imply that a credential was obtained or an external request succeeded here.

## Evidence and explicit limits

Full reads cover Protocol `api.ts`, `errors.ts`, the three middleware tag modules, relevant PTY/capability declarations, Server `auth.ts`, `principal.ts`, `location.ts`, `routes.ts`, the four middleware implementations, and PTY/capability/model/provider handlers. Exact excerpts are in `review-evidence.md` and the source manifest binds the entire bytes.

No authentication request, origin check, provider operation, file read, socket upgrade, or runtime test was performed. The PTY handler explicitly uses an unbounded outgoing queue and retains a shutdown-tracking TODO; slow-reader memory growth is a real source-level limit, not a measured failure in this run. The original reading register recorded the other domain handlers as indexed only. B-v3 separately supplies full literal reads and a bounded domain purpose/contract/ownership disposition in `revisions/b-l1-v3/review-domain-disposition.md`; those source observations remain subject to independent judgment.
