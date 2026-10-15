# Fastify

## Applicability

A component whose routes are registered on Fastify `5.6.1` (Node.js 20 or later; the tuple runs Node.js `22.18.0`). A Fastify 4 component uses the delta section below. Read [JavaScript and TypeScript](../../languages/js-ts.md) first: parsing, await and transaction rules there apply unchanged.

## Non-trigger

- Upgrading Fastify 4 to 5, or moving routes to another framework.
- Changing the global Ajv options, the schema compiler, the type provider or the plugin tree unless the packet assigns it.
- Wrapping a plugin in `fastify-plugin` only to reach a hook, decorator or schema that encapsulation hides.

## Inputs

- The plugin that owns the route, its prefix, and the hooks and decorators it inherits.
- The shared schemas (`$id` and `$ref`) visible in that scope, and the error handler.
- The body, params, querystring and response contracts, including how unknown fields and wrong types must fail.

## Steps

1. Register the route inside the named plugin. `register` creates a child context: hooks, decorators and schemas added there are invisible to siblings and the parent.
2. Give full JSON Schemas for `body`, `params`, `querystring` and `response`: `type`, `properties` and `required`. Fastify 5 rejects the shorthand that lists properties only.
3. Know the default validator. Fastify's Ajv coerces types (`"42"` becomes `42`, `42` becomes `"42"`) and, with `additionalProperties: false`, removes unknown keys instead of rejecting them. When the contract forbids coercion or extra keys, reject the raw body in a route `preValidation` hook before schema validation, then normalize it there (trim, project). Never change global Ajv options for one route.
4. Authenticate in `onRequest` or `preHandler` hooks registered in the route's scope, before the handler reads the principal. Allocate per-request state in a hook (`request.user = ...` after `decorateRequest("user", null)`); Fastify 5 refuses an object or array as a request decorator default.
5. Write async handlers that `return` the DTO, or `return reply.code(201).send(dto)`. Never call `reply.send` and also return a different value.
6. Throw or return errors to the scope's `setErrorHandler`; map them to the contract's envelope there.
7. A plugin function is either `async (instance, opts)` or `(instance, opts, done)`, never both.

### Fastify 4 delta

- Inspected at Fastify `4.29.1`. Its long-term support ended on 2025-06-30; never upgrade it inside a change.
- Fastify 4 accepts the property-only schema shorthand. Write the full object form anyway: it keeps `required` explicit and still works after an upgrade.
- Encapsulation, hooks, the Ajv defaults and the reply rules above are the same.

## Tools and outputs

- `fastify.register`, route options (`schema`, `preValidation`, `preHandler`), `addSchema`, `decorateRequest`, `setErrorHandler`, `reply.code`, `reply.send`.
- Tests build the real plugin graph and use `await app.inject({ method, url, payload })`, then `await app.close()`. Socket behavior (aborts, backpressure, timeouts) needs `await app.listen({ port: 0 })`.
- Outputs: handwritten plugins, routes, schemas and tests.

## Limits and checks

- A response schema compiles a serializer, not a validator: it drops undeclared fields and coerces values, so a wrong DTO can still serialize. Validate the DTO with the project's strict checker before `send`.
- JSON Schema `maxLength` counts Unicode code points, JavaScript `.length` counts UTF-16 units; when the contract defines length in one of them, check that one in code.
- `reply.send(stream)` skips serialization and `preSerialization`; validate streamed records yourself and stop the producer when the request is aborted.
- Checks through `inject`: the success status and exact keys, a coercible wrong type and an unknown field rejected as the contract says, auth failure before the handler, a sibling-scope route that does not see the new hook, and the mapped error envelope.
