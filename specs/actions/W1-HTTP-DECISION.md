# GitLab credential-safe HTTP seam

Cold review demonstrated that glab 1.118.0's API client can forward PRIVATE-TOKEN
and JOB-TOKEN on redirects. A scoped CONNECT proxy closed ordinary redirects, but
the CLI's mutable per-host proxy configuration can bypass the proxy after preflight.
TLS-verification bypass settings are another independent failure. More preflight
checks cannot close either boundary.

Lead decision: GitLab API calls use a scoped supported HTTP transport with explicit
TLS verification, canonical bound origin and manual redirect handling. The existing
CLI remains the sign-in/account configuration source. Pure local `glab config get`
resolves access/job token and configured private CA/mTLS references; credential
values live only in the request's memory. Never log, return, persist, fingerprint or
copy credential-bearing configuration. This is an ephemeral HTTP authentication
implementation, not another credential store or extracted token in binding state.

No glab API/auth-status network call is used as a credential helper. A changed
configured proxy cannot affect this HTTP client's destination. Reject invalid TLS
certificates even if inherited/configured skip-verification flags are set; preserve
explicit private CA/mTLS settings without enabling insecure TLS. Unknown/expired
sign-in is a named error, never an empty result.

The request captures credentials and uses the same snapshot for native identity
validation and the operation. Native `/user` identity must match the binding actor
before mutation. Resolver obtains project/account identity from one credential
snapshot. Metadata remains bounded and schema-decoded; non-sensitive safe errors
carry truthful send disposition. Owner interruption/deadline closes HTTP resources
independently of stream consumption. Raw bodies remain streamed, including multipart
Secure File uploads, with no complete-file buffering.

Authenticated redirects are not automatically followed. W3 resolves supported signed
artifact redirects explicitly and performs a separate credential-free HTTPS transfer.
No provider or Orchestra auth is attached to the signed destination. HTTPS origin,
range/filename/expiry and cancellation remain explicit parts of transfer handling.

Conformance must exercise real pinned CLI configuration reads plus real TLS/HTTP
fixtures: credential snapshot, configured-proxy swap, invalid certificates despite
skip flags, cross-origin redirects receiving no auth, metadata bounds, multipart
streaming, held-consumer deadline and cleanup. No native-provider/browser/Node
qualification is inferred from Bun-only fixture evidence.
