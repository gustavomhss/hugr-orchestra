# GraphQL resolvers

## Applicability

Named SDL fields and resolvers, with the executor and its HTTP profile supplied.

## Non-trigger

- A generic JSON endpoint, or a GraphQL client query alone.
- A request to find out why resolvers are slow: that is diagnosis.
- Subscriptions or incremental delivery without an explicitly supplied transport and specification version.

## Inputs

- The SDL with its nullability and scalar coercion; query and mutation semantics.
- The principal context and the field and resource rules; error `extensions` and masking.
- Pagination and complexity budgets, the existing batch-capable domain seam, and the cache invalidation obligations.
- The HTTP profile: status and media type for data with errors and for invalid documents.

## Steps

1. Bind resolvers without editing the public SDL. Keep the executor's parsing, validation and coercion.
2. Carry the authenticated request context into resource and field checks.
3. Batch eligible sibling loads per request and principal. Align results to the original keys, including missing entries, and clear affected cache entries after an assigned mutation.
4. Let the executor perform null propagation and `errors` paths. Keep successful siblings and the supplied HTTP profile.

## Tools and outputs

- Existing GraphQL execution and HTTP fixtures, plus data-access assertions.
- Output: resolvers, request-scoped loader wiring and mapped errors. Typed resolver codegen, if already selected, owns signatures, not authorization or batching.

## Limits and checks

- Loaders are request-scoped, never process-global tenant caches. A subscription needs its supplied per-execution cache lifetime, not unbounded memoization.
- A field failure yields `null` at the nullable position, sibling data and an error with its path. Do not turn resolver errors into a REST 503 or relax SDL nullability.
- An invalid document runs no resolver.
- Specification drafts disagree on HTTP status for partial data. Use the supplied profile; never resolve a conflict by redesign.
- Checks: repeated keys across sibling fields batch with ordered results; a second tenant with the same IDs never receives the first tenant's cached data.
- Batch key structure, row ordering and invalidation placement are yours. Missing nullability or disclosure policy, an incompatible HTTP profile or a missing domain capability is a `packet` blocker. Do not invent a blanket HTTP 200 rule or a query-budget policy.
