# L1: embedded SDK composition and operator transport

Key: `s1.api.sdk-composition`. Source pin: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Composition observed in source

SDK Next exposes a single public package entrypoint. `src/orchestra.ts` uses its caller's Effect scope and creates a shared layer memo map, supplies application tools, saved permission and account services, and composes Server routes with Core services. It creates an operator for the local principal with an instance placement scope and wildcard action allowance, then constructs the SDK transport around that authority. This call supplies no additional host contributions.

The embedded path calls `HttpRouter.toWebHandler` over `createEmbeddedRoutes`, acquires/releases the web handler, and invokes its disposer on release. It replaces `FetchHttpClient.Fetch` with the local transport's fetch implementation and uses `http://orchestra.local` as the client base URL. It returns the resulting client methods plus the tool registration interface.

This path does not create a TCP listener. It still executes real Core/Server services through a local HTTP request/response boundary, so “embedded” does not mean providers, tools, databases, or files cannot perform I/O. Server's embedded route construction deliberately disables Basic-password authentication. Capability operator authorization remains active.

## Authority refresh and explicit credentials

`src/operator-transport.ts` issues an SDK-origin credential, freezes the default Authorization header, and forwards requests to the local handler. It changes only a request whose Authorization value still exactly matches the initially issued default bearer. Explicit alternate credentials remain the caller's choice.

A one-permit semaphore serializes refresh. The transport authenticates the current credential; only a pure `CapabilityFailure` of `authentication_required` triggers renewal. Other failures propagate. After renewal it updates the matching request header before invoking the local handler. This is a narrow refresh path, not a promise to recover every revoked, forbidden, malformed, or failed request automatically.

The principal is based on operating-system account identity through the server helper, with a local fallback. Basic usernames do not imply independent local authorization accounts. Host merge rejects reserved service replacements and duplicate composition as described in the boundary artifact; this source supports deliberate reuse of server composition rather than an independently reimplemented session service.

## Evidence and intended checks

Full reads: SDK `src/index.ts`, `src/orchestra.ts`, `src/operator-transport.ts`, README, package manifest, embedded test, and import-boundary test; plus Server `routes.ts`, `principal.ts`, `auth.ts`, relevant authorization modules, and Core `host.ts`. Exact excerpts are in `review-evidence.md`.

The embedded tests contain intended checks for admit-only prompts, waking execution, durable event sequences, missing-session errors, and host instance isolation. Those tests were inspected, not executed. This packet does not assert test passage, real model execution, durable recovery, or host isolation under every concurrency pattern. The separate operator transport tests in the assigned population were inventoried but not read. L1 source support ends at the composition and branching shown above; lifecycle claims need accepted Core and runtime evidence.
