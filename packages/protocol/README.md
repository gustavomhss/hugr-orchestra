# @orchestra/protocol

The public Effect `HttpApi` contract for selected Orchestra instance routes under `/api`. This package declares route schemas, errors, middleware requirements, and API composition; it does not implement route handlers.

## Public imports

Import from the package subpaths:

```ts
import { makeApi, makeDefaultApi } from "@orchestra/protocol/api"
import { InvalidRequestError } from "@orchestra/protocol/errors"
import { MessageGroup } from "@orchestra/protocol/groups/message"
```

The export map is wildcard-only (`"./*"`), so there is no bare `@orchestra/protocol` root export.

## Consumers and dependencies

- Depends on `@orchestra/schema` for shared event definitions and on `effect` for `HttpApi`, schemas, and middleware contracts.
- `@orchestra/server` builds the API and implements its handlers. It supplies concrete Location and Session Location middleware services.
- `@orchestra/client` consumes the same contract to generate typed client code.
- Keep runtime dependencies flowing from Schema to Core and Protocol, then from Core and Protocol to Server. Client runtime code may depend on Schema and Protocol, never Core or Server.

## Route ownership

`src/api.ts` composes the public `server` API. Protocol owns the route contract, API composition, and middleware placement; Server owns handler behavior and supplies concrete Location and Session Location middleware. The hosted OpenAPI contract test is `apps/orchestra/test/server/httpapi-public-openapi.test.ts`. The current groups are:

- Health and Location; Agent and Session; Research Artifact and Message.
- Model, Provider, Integration, and Credential; Permission.
- File System, Command, Skill, and Behavior; Event.
- Pty, Question, Reference, and Project Copy.
- Relay Document, Relay Publish, and Relay Hook; Pull Request and Schedule.

Most groups require Location middleware. Session, Message, Research Artifact, and parts of Permission and Question use Session Location middleware. Authorization and schema-error middleware apply to the composed API. Server provides their runtime layers. Event definitions can be supplied to `makeApi`; `makeDefaultApi` uses the default event group.

## Changing the public contract

After changing the public Protocol or Server `HttpApi`, regenerate client outputs from `packages/client`:

```sh
bun run generate
```

Do not hand-edit `packages/client/src/generated` or `packages/client/src/generated-effect`; change the contract or generator inputs and regenerate instead.

## Checks

From this package directory, run its declared typecheck:

```sh
bun typecheck
```

The repository typecheck workflow runs:

```sh
bun turbo typecheck --concurrency=1
```
