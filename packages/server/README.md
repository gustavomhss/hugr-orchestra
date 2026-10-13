# `@orchestra/server`

This package adapts Orchestra's typed Protocol API to Effect HTTP. It depends on
Core services, shared Protocol/Schema contracts, and Relay authoring. Most route
handlers primarily adapt Core services and translate request context and
declared errors at the HTTP edge. Relay authoring also uses `@orchestra/relay`:
`src/relay-documents.ts` manages the project-scoped authoring store lifecycle
and the HTTP-facing authoring orchestration.

## API and request context

- `src/api.ts` builds `Api` with Protocol's `makeDefaultApi`, adding location and
  session-location middleware to the API contract.
- `src/handlers.ts` merges the endpoint groups in `src/handlers/`. Groups bind
  Core services and implement the declared Protocol operations.
- `src/auth.ts` reads server credentials and provides Basic authorization helpers.
  `src/middleware/authorization.ts` enforces the Protocol authorization contract
  when a password is configured; embedded routes use password-free config.
- `src/location.ts` resolves location from request query/headers (falling back to
  the process directory), provides Core location services, and wraps responses
  with location metadata. `src/middleware/session-location.ts` resolves a
  session's stored location for session-scoped operations.
- `src/middleware/schema-error.ts` maps Protocol schema rejection to the
  declared invalid-request error shape.

## Composition and ownership

`src/routes.ts` owns the HTTP layer assembly: application service nodes, API
handlers, auth, schema-error handling, and location middleware. It exports
`createRoutes(password?)`, `createEmbeddedRoutes()`, the default `routes` layer,
and `webHandler()` for Fetch-compatible hosting. The package export map exposes
these modules by name, for example `@orchestra/server/routes`.

Orchestra composes the API and handlers into its broader existing listener and
route tree. The CLI also uses `createRoutes()` for its standalone server, while
`sdk-next` uses `createEmbeddedRoutes()` for in-process requests. These are
coexisting compositions; this package does not retire Orchestra's listener.

## Verification locations

From this directory, `bun run typecheck` runs this package's `tsgo --noEmit`
check. The consuming packages have their own typechecks in `packages/orchestra`,
`packages/cli`, and `packages/sdk-next`.

HTTP contract coverage lives in `packages/orchestra/test/server/`, including
`httpapi-authorization.test.ts`, `httpapi-v2-location.test.ts`,
`httpapi-schema-error-body.test.ts`, and `httpapi-sdk.test.ts`. The broader
HTTP contract exerciser is `packages/orchestra/script/httpapi-exercise.ts`,
invoked by the `test:httpapi` script from `packages/orchestra`.
