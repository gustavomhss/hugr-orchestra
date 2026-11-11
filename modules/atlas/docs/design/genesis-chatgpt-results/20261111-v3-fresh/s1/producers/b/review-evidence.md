# Exact pinned review evidence

This packet supplies actual source excerpts to tool-free judges. Every range below is extracted unchanged from the captured source; omitted ranges make no claim. All product source excerpts use commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`. The manifest contains the complete source bytes, Git blob identities, SHA-256 values, and byte lengths. Tests were not executed.

The nine bodies remain L1 and unjudged. Review their bounded claims and explicit gaps, rather than treating complete inventory as complete semantics.

## Artifact-to-evidence index

- `s1.api.boundaries`: E001, E002, E003, E004, E005, E006, E007, E008, E009, E010, E011, E012, E013, E014, E015, E016, E017, E018.
- `s1.api.schema-contracts`: E002, E003, E004, E019, E020, E021, E022, E023, E024, E025, E026, E027, E028, E029, E030, E031, E032, E033, E034, E035, E036, E037, E038, E039.
- `s1.api.session-contract`: E026, E040, E041, E042, E043, E044, E045, E046, E047, E048, E049, E050, E051.
- `s1.api.server-edge`: E010, E013, E014, E051, E052, E053, E054, E055, E056, E057, E058, E059, E060, E061, E062, E063, E064, E099.
- `s1.api.stream-contract`: E032, E033, E034, E035, E036, E037, E038, E039, E065, E066, E067, E068.
- `s1.api.client-projection`: E009, E015, E016, E031, E067, E068, E069, E070, E071, E072, E073, E074, E075, E076, E077, E078, E079, E080, E089, E090, E091.
- `s1.api.codegen`: E001, E009, E012, E081, E082, E083, E084, E085, E086, E087, E088, E089, E090, E091, E092, E093, E094, E095, E096.
- `s1.api.sdk-composition`: E011, E018, E062, E097, E098, E099.
- `s1.api.surface-disposition`: E095, E096.

## Population and fidelity evidence

Assigned Git blobs: 472. Exact captured sources: 291 (289 assigned plus 2 boundary authorities). Uncaptured assigned members: 183. All 252 assigned handwritten production modules are captured; the literal surface index has 253 modules including Core host. These are transport observations, not semantic acceptance.

Read register: `{"captured_full_source_read": 97, "captured_literal_surface_indexed": 190, "captured_not_semantically_read": 2, "captured_representative_sections_read": 2}`.

The generated source `packages/client/src/generated/types.ts` has 462,732 captured bytes and Git blob `fca4633666a639d550065312a13e48c6ce221d12`. This exceeds the shared protocol's stated current 256,000-byte runtime observer limit. No runtime version or receipt is claimed.

## E001 — `AGENTS.md`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `ef3b523b0c00aed722582b870c1919188edc4c4f`; source lines 1–3. Applies to: s1.api.boundaries, s1.api.codegen.

```text
- After changing the public Protocol or Server `HttpApi`, run `bun run generate` from `packages/client`. Do not edit `src/generated` or `src/generated-effect` directly.
- Keep runtime dependencies directed from Schema to Core and Protocol, then from Core and Protocol to Server. Client runtime code may depend on Schema and Protocol but never Core or Server; `sdk-next` composes Client, Core, and Server.
- The default branch in this repo is `dev`.
```

## E002 — `packages/schema/AGENTS.md`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `88ff8b244e3fca3c8b23950514b7eff3cf37e85b`; source lines 1–28. Applies to: s1.api.boundaries, s1.api.schema-contracts.

```text
# Schema Package Guide

`@orchestra/schema` owns browser-safe wire and storage contracts shared by protocol, server, core, and generated SDKs. Keep runtime behavior, service layers, side effects, and host-local implementation details in the domain package that owns them.

## Package Boundary

- Preserve the dependency direction: `@orchestra/schema <- @orchestra/protocol <- @orchestra/server`.
- Schema values should be serializable contract definitions, not service implementations or runtime registries.
- A domain may keep a minimal public wire contract here when SDK generation needs it, but do not move the broader runtime model into Schema just because an event is public. `plugin.added` is the current example: Schema may own the minimum browser-safe event payload, while plugin runtime behavior stays outside Schema.
- The root barrel exports canonical current domain contracts. Specialized event modules, manifests, and infrastructure modules use direct entrypoints instead of becoming first-class root exports.

## Naming

- Contracts are unversioned: use names like `Session`, `Permission`, `Question`, and identifiers like `Permission.Request`.
- Do not preserve `V2` as the permanent name for the replacement architecture. Remove `V2` from current namespaces, brands, and identifiers as the contracts are normalized.
- There is no legacy contract subtree. Old stored rows that need reading are decoded privately by the package that imports them (Core's legacy transcript decoder), never through Schema.
- `@orchestra/protocol` and `@orchestra/sdk-next` are current `/api/...` surfaces.

## Events

- Add an event to a public manifest only when a current client needs it.
- Preserve a single canonical event definition. Do not duplicate definitions for generation convenience.

## Module Shape

- Use one canonical exported value for each contract. Avoid bridge aliases such as `PluginID`, `PluginEvent`, `PtyInfo`, `PtyEvent`, and `SessionTodoInfo`.
- Prefer importing the schema module namespace and reading canonical members, for example `Plugin.ID` or `SessionTodo.Info`.
- Core may compose Schema contracts with runtime behavior into a deliberate domain facade, but the facade must re-export the exact canonical Schema value. Do not create a second schema identity.
```

## E003 — `packages/schema/AGENTS.md`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `88ff8b244e3fca3c8b23950514b7eff3cf37e85b`; source lines 39–60. Applies to: s1.api.boundaries, s1.api.schema-contracts.

```text
## Optional Fields And Defaults

- Use the package `optional(...)` helper for optional object properties, including nested structs and event payloads, so encoded objects omit `undefined` keys.
- Use raw `Schema.optional(...)` only when preserving `undefined` as an explicitly encoded property is intentional and documented.
- External convenience defaults are normally decode-only with `Schema.withDecodingDefault(...)`.
- Add constructor defaults only when the domain value itself requires construction-time normalization.

## Public Types

- Public `Schema.Struct` records use same-name interfaces:

  ```ts
  export interface Info extends Schema.Schema.Type<typeof Info> {}
  export const Info = Schema.Struct({ ... })
  ```

- Use type aliases for unions, scalars, arrays, branded scalar types, and event payload helper types.
- Closed documented string sets use `Schema.Literals(...)`. If arbitrary strings are valid, document the field as arbitrary rather than listing a closed set.

## Mutability

- Public Schema contracts are readonly by default.
```

## E004 — `packages/schema/AGENTS.md`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `88ff8b244e3fca3c8b23950514b7eff3cf37e85b`; source lines 71–76. Applies to: s1.api.boundaries, s1.api.schema-contracts.

```text
## IDs And Identifiers

- Current ID constructors expose `create()`.
- Directional constructors such as `ascending()` or `descending()` remain only where ordering semantics are part of the public contract or compatibility requires the old method.
- New generated ID schemas must validate exactly the prefix they emit, including the underscore.
- Do not tighten legacy loose ID validators without an explicit compatibility and migration decision; existing callers and tests may rely on accepted non-canonical IDs.
```

## E005 — `packages/schema/package.json`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `ecf66e31d4fe2d72b2e503a978cedaf09db0080f`; source lines 1–15. Applies to: s1.api.boundaries.

```json
{
  "$schema": "https://json.schemastore.org/package.json",
  "name": "@orchestra/schema",
  "private": true,
  "type": "module",
  "license": "MIT",
  "exports": {
    ".": "./src/index.ts",
    "./actions": "./src/actions.ts",
    "./actions/command": "./src/actions/command.ts",
    "./actions/identity": "./src/actions/identity.ts",
    "./actions/operation": "./src/actions/operation.ts",
    "./actions/resource": "./src/actions/resource.ts",
    "./actions/run": "./src/actions/run.ts",
    "./actions/workflow": "./src/actions/workflow.ts",
```

## E006 — `packages/schema/package.json`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `ecf66e31d4fe2d72b2e503a978cedaf09db0080f`; source lines 122–130. Applies to: s1.api.boundaries.

```json
  "dependencies": {
    "effect": "catalog:"
  },
  "devDependencies": {
    "@tsconfig/bun": "catalog:",
    "@types/bun": "catalog:",
    "@typescript/native-preview": "catalog:"
  }
}
```

## E007 — `packages/protocol/package.json`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `517e462e6c645c726c26b9027d03ee55d6bc2dfc`; source lines 1–15. Applies to: s1.api.boundaries.

```json
{
  "$schema": "https://json.schemastore.org/package.json",
  "name": "@orchestra/protocol",
  "private": true,
  "type": "module",
  "license": "MIT",
  "exports": {
    "./api": "./src/api.ts",
    "./errors": "./src/errors.ts",
    "./groups/actions-binding": "./src/groups/actions-binding.ts",
    "./groups/actions-common": "./src/groups/actions-common.ts",
    "./groups/actions-job": "./src/groups/actions-job.ts",
    "./groups/actions-operation": "./src/groups/actions-operation.ts",
    "./groups/actions-pipeline": "./src/groups/actions-pipeline.ts",
    "./groups/actions-resource": "./src/groups/actions-resource.ts",
```

## E008 — `packages/protocol/package.json`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `517e462e6c645c726c26b9027d03ee55d6bc2dfc`; source lines 69–78. Applies to: s1.api.boundaries.

```json
  "dependencies": {
    "@orchestra/schema": "workspace:*",
    "effect": "catalog:"
  },
  "devDependencies": {
    "@tsconfig/bun": "catalog:",
    "@types/bun": "catalog:",
    "@typescript/native-preview": "catalog:"
  }
}
```

## E009 — `packages/client/package.json`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `4cd0244e98ff18b5e65d3c2808196705095b6691`; source lines 1–38. Applies to: s1.api.boundaries, s1.api.client-projection, s1.api.codegen.

```json
{
  "$schema": "https://json.schemastore.org/package.json",
  "name": "@orchestra/client",
  "private": true,
  "type": "module",
  "license": "MIT",
  "exports": {
    ".": "./src/index.ts",
    "./effect": "./src/effect.ts",
    "./contract": "./src/contract.ts"
  },
  "scripts": {
    "generate": "bun run script/build.ts",
    "check:generated": "bun run generate && git diff --exit-code -- src/generated src/generated-effect",
    "test": "bun test --timeout 5000",
    "typecheck": "tsgo --noEmit"
  },
  "dependencies": {
    "@orchestra/schema": "workspace:*",
    "@orchestra/protocol": "workspace:*"
  },
  "peerDependencies": {
    "effect": "4.0.0-beta.83"
  },
  "peerDependenciesMeta": {
    "effect": {
      "optional": true
    }
  },
  "devDependencies": {
    "@effect/platform-node": "catalog:",
    "@orchestra/httpapi-codegen": "workspace:*",
    "@tsconfig/bun": "catalog:",
    "@types/bun": "catalog:",
    "@typescript/native-preview": "catalog:",
    "effect": "catalog:"
  }
}
```

## E010 — `packages/server/package.json`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `1e2d83907eaac06d0da1571ac7ceab9f528102b7`; source lines 36–55. Applies to: s1.api.boundaries, s1.api.server-edge.

```json
  "dependencies": {
    "@orchestra/core": "workspace:*",
    "@orchestra/llm": "workspace:*",
    "@orchestra/protocol": "workspace:*",
    "@orchestra/rag-studio": "workspace:*",
    "@orchestra/relay": "workspace:*",
    "@orchestra/schema": "workspace:*",
    "drizzle-orm": "catalog:",
    "effect": "catalog:"
  },
  "devDependencies": {
    "@effect/platform-node": "catalog:",
    "@orchestra/client": "workspace:*",
    "@orchestra/httpapi-codegen": "workspace:*",
    "@orchestra/plugin": "workspace:*",
    "@tsconfig/bun": "catalog:",
    "@types/bun": "catalog:",
    "@typescript/native-preview": "catalog:"
  }
}
```

## E011 — `packages/sdk-next/package.json`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `7b96125b9aa768181cc99c19028659e6d9e72da3`; source lines 1–27. Applies to: s1.api.boundaries, s1.api.sdk-composition.

```json
{
  "$schema": "https://json.schemastore.org/package.json",
  "name": "@orchestra/sdk-next",
  "private": true,
  "type": "module",
  "license": "MIT",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "bun test --timeout 5000",
    "typecheck": "tsgo --noEmit"
  },
  "dependencies": {
    "@orchestra/client": "workspace:*",
    "@orchestra/core": "workspace:*",
    "@orchestra/protocol": "workspace:*",
    "@orchestra/schema": "workspace:*",
    "@orchestra/server": "workspace:*",
    "effect": "catalog:"
  },
  "devDependencies": {
    "@tsconfig/bun": "catalog:",
    "@types/bun": "catalog:",
    "@typescript/native-preview": "catalog:"
  }
}
```

## E012 — `tooling/httpapi-codegen/package.json`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `72c383d240c98fbc21e463cb60b3b3533fbd7553`; source lines 1–22. Applies to: s1.api.boundaries, s1.api.codegen.

```json
{
  "$schema": "https://json.schemastore.org/package.json",
  "name": "@orchestra/httpapi-codegen",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "bun test --timeout 5000 --only-failures",
    "typecheck": "tsgo --noEmit"
  },
  "dependencies": {
    "effect": "catalog:",
    "prettier": "3.6.2"
  },
  "devDependencies": {
    "@tsconfig/bun": "catalog:",
    "@types/bun": "catalog:",
    "@typescript/native-preview": "catalog:"
  }
}
```

## E013 — `packages/protocol/src/api.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `40b5b5bd266b8a9bd3893f74d5429bf535dc01d7`; source lines 59–84. Applies to: s1.api.boundaries, s1.api.server-edge.

```typescript
// Protocol owns middleware placement, while Server injects concrete keys so Core service identities stay downstream.
const makeApiFromGroup = <
  const Group extends HttpApiGroup.Any,
  LocationId extends HttpApiMiddleware.AnyId,
  LocationService,
  SessionLocationId extends HttpApiMiddleware.AnyId,
  SessionLocationService,
>(
  eventGroup: Group,
  locationMiddleware: Context.Key<LocationId, LocationService>,
  sessionLocationMiddleware: Context.Key<SessionLocationId, SessionLocationService>,
) =>
  HttpApi.make("server")
    .add(HealthGroup)
    .add(LocationGroup.middleware(locationMiddleware))
    .add(AgentGroup.middleware(locationMiddleware))
    .add(makeSessionGroup(sessionLocationMiddleware))
    .add(makeResearchArtifactGroup(sessionLocationMiddleware))
    .add(MessageGroup.middleware(sessionLocationMiddleware))
    .add(ModelGroup.middleware(locationMiddleware))
    .add(ProviderGroup.middleware(locationMiddleware))
    .add(IntegrationGroup.middleware(locationMiddleware))
    .add(CredentialGroup.middleware(locationMiddleware))
    .add(makePermissionGroup(locationMiddleware, sessionLocationMiddleware))
    .add(makeFileSystemGroup(locationMiddleware))
    .add(VcsGroup.middleware(locationMiddleware))
```

## E014 — `packages/protocol/src/api.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `40b5b5bd266b8a9bd3893f74d5429bf535dc01d7`; source lines 90–157. Applies to: s1.api.boundaries, s1.api.server-edge.

```typescript
    .add(BehaviorGroup.middleware(locationMiddleware))
    .add(eventGroup)
    .add(PtyGroup.middleware(locationMiddleware))
    .add(makeQuestionGroup(locationMiddleware, sessionLocationMiddleware))
    .add(ReferenceGroup.middleware(locationMiddleware))
    .add(ProjectCopyGroup.middleware(locationMiddleware))
    .add(ProjectGroup)
    .add(LeanGroup.middleware(locationMiddleware))
    .add(RagStudioGroup.middleware(locationMiddleware))
    .add(AtlasGroup.middleware(locationMiddleware))
    .add(ConfigGroup)
    .add(TrustGroup)
    .add(BoardGroup)
    .add(RelayDocumentGroup.middleware(locationMiddleware))
    .add(RelayPublishGroup.middleware(locationMiddleware))
    .add(RelayHookGroup.middleware(locationMiddleware))
    .add(PullRequestGroup.middleware(locationMiddleware))
    .add(ScheduleGroup.middleware(locationMiddleware))
    .add(ActionsBindingGroup.middleware(locationMiddleware))
    .add(ActionsOperationGroup.middleware(locationMiddleware))
    .add(ActionsWorkflowGroup.middleware(locationMiddleware))
    .add(ActionsRunGroup.middleware(locationMiddleware))
    .add(ActionsJobGroup.middleware(locationMiddleware))
    .add(ActionsPipelineGroup.middleware(locationMiddleware))
    .add(ActionsResourceGroup.middleware(locationMiddleware))
    .add(ActionsSourceGroup.middleware(locationMiddleware))
    .add(ActionsTransferGroup.middleware(locationMiddleware))
    .add(RelayRunGroup.middleware(locationMiddleware))
    .add(InstallationGroup)
    .add(GuardrailGroup.middleware(locationMiddleware))
    .add(MeetingGroup.middleware(locationMiddleware))
    // Last-applied middleware runs first: authenticate before caller-selected Location construction.
    .add(makeCapabilityOperatorGroup(locationMiddleware))
    .add(makeCapabilityConnectionsGroup(locationMiddleware))
    .add(makeCapabilityArtifactsGroup(locationMiddleware))
    .add(makeCapabilitySchedulesGroup(locationMiddleware))
    .add(CapabilityContentGroup)
    .annotateMerge(
      OpenApi.annotations({
        title: "orchestra HttpApi",
        version: "0.0.1",
        description: "Experimental HttpApi surface for selected instance routes.",
      }),
    )
    .middleware(Authorization)
    .middleware(SchemaErrorMiddleware)

export const makeApi = <
  LocationId extends HttpApiMiddleware.AnyId,
  LocationService,
  SessionLocationId extends HttpApiMiddleware.AnyId,
  SessionLocationService,
>(options: {
  readonly definitions: ReadonlyArray<Definition>
  readonly locationMiddleware: Context.Key<LocationId, LocationService>
  readonly sessionLocationMiddleware: Context.Key<SessionLocationId, SessionLocationService>
}) =>
  makeApiFromGroup(makeEventGroup(options.definitions), options.locationMiddleware, options.sessionLocationMiddleware)

export const makeDefaultApi = <
  LocationId extends HttpApiMiddleware.AnyId,
  LocationService,
  SessionLocationId extends HttpApiMiddleware.AnyId,
  SessionLocationService,
>(options: {
  readonly locationMiddleware: Context.Key<LocationId, LocationService>
  readonly sessionLocationMiddleware: Context.Key<SessionLocationId, SessionLocationService>
}) => makeApiFromGroup(EventGroup, options.locationMiddleware, options.sessionLocationMiddleware)
```

## E015 — `packages/client/src/contract.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `1dccaeb657cc106b7a8cba93f5f5c34a8faf8680`; source lines 1–22. Applies to: s1.api.boundaries, s1.api.client-projection.

```typescript
import { makeDefaultApi } from "@orchestra/protocol/api"
import { InvalidRequestError, SessionNotFoundError } from "@orchestra/protocol/errors"
import { HttpApiMiddleware } from "effect/unstable/httpapi"

class LocationMiddleware extends HttpApiMiddleware.Service<LocationMiddleware>()(
  "@orchestra/client/LocationMiddleware",
  { error: InvalidRequestError },
) {}

class SessionLocationMiddleware extends HttpApiMiddleware.Service<SessionLocationMiddleware>()(
  "@orchestra/client/SessionLocationMiddleware",
  { error: [InvalidRequestError, SessionNotFoundError] },
) {}

export const ClientApi = makeDefaultApi({
  locationMiddleware: LocationMiddleware,
  sessionLocationMiddleware: SessionLocationMiddleware,
})

export const groupNames = {
  "server.health": "health",
  "server.installation": "installation",
```

## E016 — `packages/client/src/contract.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `1dccaeb657cc106b7a8cba93f5f5c34a8faf8680`; source lines 116–126. Applies to: s1.api.boundaries, s1.api.client-projection.

```typescript
} as const

// Raw transfers use the handwritten streaming adapter; JSON metadata/admission stay generated.
export const omitEndpoints = new Set([
  "pty.connect",
  "pty.connectToken",
  "actions.transfer.read",
  "actions.transfer.upload",
  "capability.artifact.content",
  "capability.content.read",
])
```

## E017 — `packages/server/src/api.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `e1ab621208cf063ff1ce846ded0205e9b8dae93e`; source lines 1–8. Applies to: s1.api.boundaries.

```typescript
import { makeDefaultApi } from "@orchestra/protocol/api"
import { LocationMiddleware } from "./location"
import { SessionLocationMiddleware } from "./middleware/session-location"

export const Api = makeDefaultApi({
  locationMiddleware: LocationMiddleware,
  sessionLocationMiddleware: SessionLocationMiddleware,
})
```

## E018 — `packages/core/src/host.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `a0fc5bc9a36e50315b0ddddf4de3566555711250`; source lines 26–63. Applies to: s1.api.boundaries, s1.api.sdk-composition.

```typescript
export interface Contribution {
  /** Stable module id ("maestro", "app-dock", ...). Duplicates are a composition error. */
  readonly id: string
  /** Node replacements for the root graph; AppNodeBuilder also applies them to every Location map it builds. */
  readonly replacements?: LayerNode.Replacements
  /** Extra global nodes owned by the module. They must not fail: the root's error type does not grow. */
  readonly nodes?: ReadonlyArray<Node.GlobalNode<unknown>>
  /** Extra Location-scoped nodes appended to `locationServices` in every Location map the root builds. */
  readonly locationNodes?: ReadonlyArray<Node.LocationNode<unknown, LocationError>>
  /** Context.Reference overrides (core/host/* references), provided to the API layer. */
  readonly references?: Layer.Layer<never, never, ReferenceServices>
}

// One coordinator per process: these stay owned by the composition root.
const reserved = [SessionExecution.node, SessionV2.node, LocationServiceMap.node, ScheduledTask.node, ScheduledTask.daemonNode]

/** Flatten contributions in order; synchronous because it only validates data. */
export function merge(contributions: ReadonlyArray<Contribution>) {
  const duplicate = repeated(contributions.map((item) => item.id))
  if (duplicate) throw new Error(`Host contribution id is not unique: ${duplicate}`)
  const replacements = contributions.flatMap((item) => item.replacements ?? [])
  const nodes = contributions.flatMap((item) => item.nodes ?? [])
  const locationNodes = contributions.flatMap((item) => item.locationNodes ?? [])
  const claimed = [...replacements.map(([source]) => source), ...nodes].find((node) => reserved.some((owned) => owned.name === node.name))
  if (claimed) throw new Error(`Host contribution may not own ${claimed.name}`)
  const node = repeated(nodes.map((item) => item.name))
  if (node) throw new Error(`Host contribution node is not unique: ${node}`)
  // A contributed Location node may not shadow a built-in one either; changing a built-in is a replacement.
  const builtIn = new Set(locationServices.dependencies.map((item) => item.name))
  const location = repeated(locationNodes.map((item) => item.name)) ?? locationNodes.find((item) => builtIn.has(item.name))?.name
  if (location) throw new Error(`Host contribution Location node is not unique: ${location}`)
  const [first, ...rest] = contributions.flatMap((item) => (item.references ? [item.references] : []))
  const references: Layer.Layer<never, never, ReferenceServices> = !first ? Layer.empty : rest.length === 0 ? first : Layer.mergeAll(first, ...rest)
  return { replacements, nodes, locationNodes, references }
}

function repeated(names: ReadonlyArray<string>) {
  return names.find((name, index) => names.indexOf(name) !== index)
```

## E019 — `packages/schema/src/schema.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `d19a39b9708cfcaeedc1d7c62503afbadfee5dd7`; source lines 1–30. Applies to: s1.api.schema-contracts.

```typescript
import { DateTime, Option, Schema, SchemaGetter } from "effect"

export const PositiveInt = Schema.Int.check(Schema.isGreaterThan(0))
export const NonNegativeInt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))

export const RelativePath = Schema.String.pipe(Schema.brand("RelativePath"))
export type RelativePath = typeof RelativePath.Type

export const AbsolutePath = Schema.String.pipe(Schema.brand("AbsolutePath"))
export type AbsolutePath = typeof AbsolutePath.Type

export const optional = <S extends Schema.Top>(schema: S) =>
  Schema.optionalKey(schema).pipe(
    Schema.decodeTo(Schema.optional(Schema.toType(schema)), {
      decode: SchemaGetter.passthrough({ strict: false }),
      encode: SchemaGetter.transformOptional(Option.filter((value) => value !== undefined)),
    }),
  )

export const statics =
  <S extends object, M extends Record<string, unknown>>(methods: (schema: S) => M) =>
  (schema: S): S & M =>
    Object.assign(schema, methods(schema))

export const DateTimeUtcFromMillis = Schema.Finite.pipe(
  Schema.decodeTo(Schema.DateTimeUtc, {
    decode: SchemaGetter.transform((value) => DateTime.makeUnsafe(value)),
    encode: SchemaGetter.transform((value) => DateTime.toEpochMillis(value)),
  }),
)
```

## E020 — `packages/schema/src/session-id.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `3603ebe703b7b350018626a74e794f94e33079a3`; source lines 1–15. Applies to: s1.api.schema-contracts.

```typescript
import { Schema } from "effect"
import { descending } from "./identifier"
import { statics } from "./schema"

export const SessionID = Schema.String.check(Schema.isStartsWith("ses")).pipe(
  Schema.brand("SessionID"),
  statics((schema) => {
    const create = () => schema.make("ses_" + descending())
    return {
      create,
      descending: (id?: string) => (id === undefined ? create() : schema.make(id)),
    }
  }),
)
export type SessionID = typeof SessionID.Type
```

## E021 — `packages/schema/src/session.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `8319d3369ebf6ac5952dd390b3ff8844e995b280`; source lines 20–53. Applies to: s1.api.schema-contracts.

```typescript
export const Info = Schema.Struct({
  id: ID,
  parentID: ID.pipe(optional),
  projectID: Project.ID,
  agent: Agent.ID.pipe(optional),
  model: Model.Ref.pipe(optional),
  subagentModels: SessionSubagentModels.Policy.pipe(optional),
  cost: Schema.Finite,
  tokens: Schema.Struct({
    input: Schema.Finite,
    output: Schema.Finite,
    reasoning: Schema.Finite,
    cache: Schema.Struct({
      read: Schema.Finite,
      write: Schema.Finite,
    }),
  }),
  time: Schema.Struct({
    created: DateTimeUtcFromMillis,
    updated: DateTimeUtcFromMillis,
    archived: DateTimeUtcFromMillis.pipe(optional),
  }),
  title: Schema.String,
  location: Location.Ref,
  subpath: RelativePath.pipe(optional),
  revert: Revert.State.pipe(optional),
}).annotate({ identifier: "SessionV2.Info" })

export const ListAnchor = Schema.Struct({
  id: ID,
  time: Schema.Finite,
  direction: Schema.Literals(["previous", "next"]),
}).annotate({ identifier: "Session.ListAnchor" })
export interface ListAnchor extends Schema.Schema.Type<typeof ListAnchor> {}
```

## E022 — `packages/schema/src/model.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `10fa175e247bfcbaa968e41fd7d61bd57945896a`; source lines 6–19. Applies to: s1.api.schema-contracts.

```typescript
import { statics } from "./schema"

export const ID = Schema.String.pipe(Schema.brand("ModelV2.ID"))
export type ID = typeof ID.Type

export const VariantID = Schema.String.pipe(Schema.brand("VariantID"))
export type VariantID = typeof VariantID.Type

export const Ref = Schema.Struct({
  id: ID,
  providerID: Provider.ID,
  variant: VariantID.pipe(optional),
}).annotate({ identifier: "Model.Ref" })
export interface Ref extends Schema.Schema.Type<typeof Ref> {}
```

## E023 — `packages/schema/src/model.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `10fa175e247bfcbaa968e41fd7d61bd57945896a`; source lines 81–89. Applies to: s1.api.schema-contracts.

```typescript
  limit: Schema.Struct({
    context: Schema.Int,
    input: Schema.Int.pipe(optional),
    output: Schema.Int,
  }),
})
  .annotate({ identifier: "ModelV2.Info" })
  .pipe(
    statics((schema) => ({
```

## E024 — `packages/schema/src/prompt.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `376700cc7a6ccc0613da1ff470b00aeba803a74e`; source lines 1–38. Applies to: s1.api.schema-contracts.

```typescript
import { Schema } from "effect"
import { optional } from "./schema"
import { statics } from "./schema"

export interface Source extends Schema.Schema.Type<typeof Source> {}
export const Source = Schema.Struct({
  start: Schema.Finite,
  end: Schema.Finite,
  text: Schema.String,
}).annotate({ identifier: "Prompt.Source" })

export interface FileAttachment extends Schema.Schema.Type<typeof FileAttachment> {}
export const FileAttachment = Schema.Struct({
  uri: Schema.String,
  mime: Schema.String,
  name: Schema.String.pipe(optional),
  description: Schema.String.pipe(optional),
  source: Source.pipe(optional),
})
  .annotate({ identifier: "Prompt.FileAttachment" })
  .pipe(
    statics((schema) => ({
      create: (input: FileAttachment) =>
        schema.make({
          uri: input.uri,
          mime: input.mime,
          name: input.name,
          description: input.description,
          source: input.source,
        }),
    })),
  )

export interface AgentAttachment extends Schema.Schema.Type<typeof AgentAttachment> {}
export const AgentAttachment = Schema.Struct({
  name: Schema.String,
  source: Source.pipe(optional),
}).annotate({ identifier: "Prompt.AgentAttachment" })
```

## E025 — `packages/schema/src/prompt-input.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `f2a0d460dfdd10275fc7b7c3e13c49ec80151e64`; source lines 1–26. Applies to: s1.api.schema-contracts.

```typescript
export * as PromptInput from "./prompt-input"

import { Schema } from "effect"
import { AgentAttachment, Source } from "./prompt"
import { optional, statics } from "./schema"

export interface FileAttachment extends Schema.Schema.Type<typeof FileAttachment> {}
export const FileAttachment = Schema.Struct({
  uri: Schema.String,
  name: Schema.String.pipe(optional),
  description: Schema.String.pipe(optional),
  source: Source.pipe(optional),
})
  .annotate({ identifier: "PromptInput.FileAttachment" })
  .pipe(
    statics((schema) => ({
      create: (input: FileAttachment) => schema.make(input),
    })),
  )

export interface Prompt extends Schema.Schema.Type<typeof Prompt> {}
export const Prompt = Schema.Struct({
  text: Schema.String,
  files: Schema.Array(FileAttachment).pipe(optional),
  agents: Schema.Array(AgentAttachment).pipe(optional),
}).annotate({ identifier: "PromptInput" })
```

## E026 — `packages/schema/src/session-input.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `b024750506e151e7f14f559f979e5c52d46e3833`; source lines 8–25. Applies to: s1.api.schema-contracts, s1.api.session-contract.

```typescript
import { SessionDelivery } from "./session-delivery"
import { SessionID } from "./session-id"
import { SessionMessage } from "./session-message"

export const Delivery = SessionDelivery.Delivery
export type Delivery = SessionDelivery.Delivery

export interface Admitted extends Schema.Schema.Type<typeof Admitted> {}
export const Admitted = Schema.Struct({
  admittedSeq: NonNegativeInt,
  id: SessionMessage.ID,
  sessionID: SessionID,
  prompt: Prompt,
  promptContext: PromptContext.Info.pipe(optional),
  delivery: Delivery,
  timeCreated: DateTimeUtcFromMillis,
  promotedSeq: NonNegativeInt.pipe(optional),
}).annotate({ identifier: "SessionInput.Admitted" })
```

## E027 — `packages/schema/src/session-message.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `62aeee3e61a1a2c3dcb0b6de15711357093f7e79`; source lines 13–17. Applies to: s1.api.schema-contracts.

```typescript
export const ID = Schema.String.check(Schema.isStartsWith("msg_")).pipe(
  Schema.brand("Session.Message.ID"),
  statics((schema) => ({ create: () => schema.make("msg_" + ascending()) })),
)
export type ID = typeof ID.Type
```

## E028 — `packages/schema/src/session-message.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `62aeee3e61a1a2c3dcb0b6de15711357093f7e79`; source lines 122–142. Applies to: s1.api.schema-contracts.

```typescript
export const ToolState = Schema.Union([ToolStatePending, ToolStateRunning, ToolStateCompleted, ToolStateError]).pipe(
  Schema.toTaggedUnion("status"),
)
export type ToolState = ToolStatePending | ToolStateRunning | ToolStateCompleted | ToolStateError

export interface AssistantTool extends Schema.Schema.Type<typeof AssistantTool> {}
export const AssistantTool = Schema.Struct({
  type: Schema.Literal("tool"),
  id: Schema.String,
  name: Schema.String,
  provider: Schema.Struct({
    executed: Schema.Boolean,
    metadata: ProviderMetadata.pipe(optional),
    resultMetadata: ProviderMetadata.pipe(optional),
  }).pipe(optional),
  state: ToolState,
  time: Schema.Struct({
    created: DateTimeUtcFromMillis,
    ran: DateTimeUtcFromMillis.pipe(optional),
    completed: DateTimeUtcFromMillis.pipe(optional),
    pruned: DateTimeUtcFromMillis.pipe(optional),
```

## E029 — `packages/schema/src/session-message.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `62aeee3e61a1a2c3dcb0b6de15711357093f7e79`; source lines 206–219. Applies to: s1.api.schema-contracts.

```typescript
export const Message = Schema.Union([
  AgentSwitched,
  ModelSwitched,
  User,
  Synthetic,
  System,
  Shell,
  Assistant,
  Compaction,
])
  .pipe(Schema.toTaggedUnion("type"))
  .annotate({ identifier: "Session.Message" })
export type Message = AgentSwitched | ModelSwitched | User | Synthetic | System | Shell | Assistant | Compaction
export type Type = Message["type"]
```

## E030 — `packages/schema/src/session-delivery.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `9b678dabf9f910b173f2b2cfddebacbd11922264`; source lines 1–6. Applies to: s1.api.schema-contracts.

```typescript
export * as SessionDelivery from "./session-delivery"

import { Schema } from "effect"

export const Delivery = Schema.Literals(["steer", "queue"])
export type Delivery = typeof Delivery.Type
```

## E031 — `packages/schema/src/location.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `c01ce36372a698a289b1591466d4b01b323543d9`; source lines 1–25. Applies to: s1.api.schema-contracts, s1.api.client-projection.

```typescript
export * as Location from "./location"

import { Schema } from "effect"
import { AbsolutePath, optional } from "./schema"
import { ProjectID } from "./project-id"
import { WorkspaceID } from "./workspace-id"

export interface Ref extends Schema.Schema.Type<typeof Ref> {}
export const Ref = Schema.Struct({
  directory: AbsolutePath,
  workspaceID: optional(WorkspaceID),
}).annotate({ identifier: "Location.Ref" })

export class Info extends Schema.Class<Info>("Location.Info")({
  directory: AbsolutePath,
  workspaceID: optional(WorkspaceID),
  project: Schema.Struct({
    id: ProjectID,
    directory: AbsolutePath,
  }),
}) {}

export function response<S extends Schema.Top>(data: S) {
  return Schema.Struct({ location: Info, data })
}
```

## E032 — `packages/schema/src/event.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `21d0aceeaeb06247f4b2f2ceaeee53f81e1b9cf6`; source lines 9–13. Applies to: s1.api.schema-contracts, s1.api.stream-contract.

```typescript
export const ID = Schema.String.check(Schema.isStartsWith("evt_")).pipe(
  Schema.brand("Event.ID"),
  statics((schema) => ({ create: () => schema.make("evt_" + ascending()) })),
)
export type ID = typeof ID.Type
```

## E033 — `packages/schema/src/event.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `21d0aceeaeb06247f4b2f2ceaeee53f81e1b9cf6`; source lines 42–112. Applies to: s1.api.schema-contracts, s1.api.stream-contract.

```typescript
export function define<
  const Type extends string,
  const Fields extends Readonly<Record<PropertyKey, Schema.Codec<unknown, unknown>>>,
>(input: {
  readonly type: Type
  readonly durable?: {
    readonly version: number
    readonly aggregate: string
  }
  readonly schema: Fields
  /** Optional shared OpenAPI component name for data repeated in event envelopes. */
  readonly dataIdentifier?: string
}) {
  const data = Schema.Struct(input.schema).pipe((schema) =>
    input.dataIdentifier ? schema.annotate({ identifier: input.dataIdentifier }) : schema,
  )
  return Schema.Struct({
    id: ID,
    metadata: optional(Schema.Record(Schema.String, Schema.Unknown)),
    type: Schema.Literal(input.type),
    durable: optional(Schema.Struct({ aggregateID: Schema.String, seq: Schema.Int, version: Schema.Int })),
    location: optional(Location.Ref),
    data,
  })
    .annotate({ identifier: input.type })
    .pipe(
      statics(() => ({
        type: input.type,
        ...(input.durable === undefined ? {} : { durable: input.durable }),
        data,
      })),
    ) satisfies Definition<Type, typeof data>
}

export function inventory<const Definitions extends ReadonlyArray<Definition>>(...definitions: Definitions) {
  return Object.freeze(definitions)
}

export function latest(definitions: ReadonlyArray<Definition>) {
  return readonlyMap(
    definitions.reduce((result, definition) => {
      const existing = result.get(definition.type)
      if (!existing) {
        result.set(definition.type, definition)
        return result
      }
      if (definition.durable && existing.durable && definition.durable.version !== existing.durable.version) {
        if (definition.durable.version > existing.durable.version) result.set(definition.type, definition)
        return result
      }
      if (definition !== existing) throw new Error(`Duplicate latest event definition for ${definition.type}`)
      return result
    }, new Map<string, Definition>()),
  )
}

export function versionedType(type: string, version: number) {
  return `${type}.${version}`
}

export function durable<const Definitions extends ReadonlyArray<Definition>>(definitions: Definitions) {
  return readonlyMap(
    definitions.reduce((result, definition) => {
      if (!definition.durable) return result
      const key = versionedType(definition.type, definition.durable.version)
      if (result.has(key)) throw new Error(`Duplicate durable event definition for ${key}`)
      result.set(key, definition)
      return result
    }, new Map<string, Definitions[number]>()),
  )
}
```

## E034 — `packages/schema/src/session-event.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `e314b7942bd0d7d56328a27d2cc11a0fa53da481`; source lines 42–56. Applies to: s1.api.schema-contracts, s1.api.stream-contract.

```typescript

const options = {
  durable: {
    aggregate: "sessionID",
    version: 1,
  },
} as const
const stepSettlementOptions = {
  durable: {
    aggregate: "sessionID",
    version: 2,
  },
} as const

export const UnknownError = SessionMessage.UnknownError
```

## E035 — `packages/schema/src/session-event.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `e314b7942bd0d7d56328a27d2cc11a0fa53da481`; source lines 219–251. Applies to: s1.api.schema-contracts, s1.api.stream-contract.

```typescript

  export const Ended = Event.define({
    type: "session.next.step.ended",
    ...stepSettlementOptions,
    schema: {
      ...Base,
      assistantMessageID: SessionMessage.ID,
      finish: Schema.String,
      cost: Schema.Finite,
      /** Absent in historical events: billing availability was not captured. */
      usageKnown: Schema.Boolean.pipe(optional),
      tokens: Schema.Struct({
        input: Schema.Finite,
        output: Schema.Finite,
        reasoning: Schema.Finite,
        cache: Schema.Struct({
          read: Schema.Finite,
          write: Schema.Finite,
        }),
      }).annotate({ identifier: "SessionStepTokens" }),
      snapshot: Schema.String.pipe(optional),
      files: Schema.Array(RelativePath).pipe(optional),
    },
  })
  export type Ended = typeof Ended.Type

  export const Failed = Event.define({
    type: "session.next.step.failed",
    ...stepSettlementOptions,
    schema: {
      ...Base,
      assistantMessageID: SessionMessage.ID,
      error: UnknownError,
```

## E036 — `packages/schema/src/session-event.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `e314b7942bd0d7d56328a27d2cc11a0fa53da481`; source lines 269–291. Applies to: s1.api.schema-contracts, s1.api.stream-contract.

```typescript
  // Stream fragments are live-only; Text.Ended is the replayable full-value boundary.
  export const Delta = Event.define({
    type: "session.next.text.delta",
    schema: {
      ...Base,
      assistantMessageID: SessionMessage.ID,
      textID: Schema.String,
      delta: Schema.String,
    },
  })
  export type Delta = typeof Delta.Type

  export const Ended = Event.define({
    type: "session.next.text.ended",
    ...options,
    schema: {
      ...Base,
      assistantMessageID: SessionMessage.ID,
      textID: Schema.String,
      text: Schema.String,
    },
  })
  export type Ended = typeof Ended.Type
```

## E037 — `packages/schema/src/session-event.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `e314b7942bd0d7d56328a27d2cc11a0fa53da481`; source lines 511–596. Applies to: s1.api.schema-contracts, s1.api.stream-contract.

```typescript
export const DurableDefinitions = Event.inventory(
  Created,
  Renamed,
  Deleted,
  AgentSwitched,
  ModelSwitched,
  SubagentModelsChanged,
  PermissionChanged,
  ArchiveChanged,
  Moved,
  Prompted,
  PromptAdmitted,
  ContextUpdated,
  Synthetic,
  Shell.Started,
  Shell.Ended,
  Step.Started,
  Step.Ended,
  Step.Failed,
  Text.Started,
  Text.Ended,
  Tool.Input.Started,
  Tool.Input.Ended,
  Tool.Called,
  Tool.Progress,
  Tool.Success,
  Tool.Failed,
  Reasoning.Started,
  Reasoning.Ended,
  Retried,
  Compaction.Started,
  Compaction.Ended,
  RevertEvent.Staged,
  RevertEvent.Cleared,
  RevertEvent.Committed,
)

export const Definitions = Event.inventory(
  Created,
  Renamed,
  Deleted,
  AgentSwitched,
  ModelSwitched,
  SubagentModelsChanged,
  PermissionChanged,
  ArchiveChanged,
  Moved,
  Prompted,
  PromptAdmitted,
  ContextUpdated,
  Synthetic,
  Shell.Started,
  Shell.Ended,
  Step.Started,
  Step.Ended,
  Step.Failed,
  Text.Started,
  Text.Delta,
  Text.Ended,
  Reasoning.Started,
  Reasoning.Delta,
  Reasoning.Ended,
  Tool.Input.Started,
  Tool.Input.Delta,
  Tool.Input.Ended,
  Tool.Called,
  Tool.Progress,
  Tool.Success,
  Tool.Failed,
  Retried,
  Compaction.Started,
  Compaction.Delta,
  Compaction.Ended,
  RevertEvent.Staged,
  RevertEvent.Cleared,
  RevertEvent.Committed,
)

export const Durable = Schema.Union(DurableDefinitions, { mode: "oneOf" })
  .pipe(Schema.toTaggedUnion("type"))
  .annotate({ identifier: "SessionDurableEvent" })
export type DurableEvent = typeof Durable.Type

export const All = Schema.Union(Definitions, { mode: "oneOf" }).pipe(Schema.toTaggedUnion("type"))
export type Event = typeof All.Type
export type Type = Event["type"]
```

## E038 — `packages/schema/src/event-manifest.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `12c988bd667a781e53928fc86cf2e1af99c185cc`; source lines 33–83. Applies to: s1.api.schema-contracts, s1.api.stream-contract.

```typescript
const coreDefinitions = Event.inventory(
  ...SessionEvent.Definitions,
  ...MaestroEvent.Definitions,
)

const foundationDefinitions = Event.inventory(
  ...ModelsDev.Event.Definitions,
  ...Integration.Event.Definitions,
  ...Catalog.Event.Definitions,
  ...coreDefinitions,
)

const featureDefinitions = Event.inventory(
  ...Board.Event.Definitions,
  ...FileSystem.Event.Definitions,
  ...Reference.Event.Definitions,
  ...Permission.Event.Definitions,
  ...Plugin.Event.Definitions,
  ...ProjectDirectories.Event.Definitions,
  ...FileSystemWatcher.Event.Definitions,
  ...Pty.Event.Definitions,
  ...Question.Event.Definitions,
  ...RelayHook.Definitions,
)

export const ServerDefinitions = Event.inventory(
  ...foundationDefinitions,
  ...featureDefinitions,
  ...SessionTodo.Event.Definitions,
  // The server's HEAD watcher announces a branch switch.
  ...VcsEvent.Definitions,
)

export const Definitions = Event.inventory(
  ...foundationDefinitions,
  ...InstallationEvent.Definitions,
  ...featureDefinitions,
  ...SessionTodo.Event.Definitions,
  ...LspEvent.Definitions,
  ...TuiEvent.Definitions,
  ...McpEvent.Definitions,
  ...Project.Event.Definitions,
  ...SessionStatusEvent.Definitions,
  ...SessionCompactionEvent.Definitions,
  ...VcsEvent.Definitions,
  ...WorkspaceEvent.Definitions,
  ...WorktreeEvent.Definitions,
  ...ServerEvent.Definitions,
)
export const Latest = Event.latest(Definitions)
export { Durable }
```

## E039 — `packages/schema/src/durable-event-manifest.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `e9c9f78dd4defc0bf2299ac2f9214d45fd67ead9`; source lines 1–20. Applies to: s1.api.schema-contracts, s1.api.stream-contract.

```typescript
export * as DurableEventManifest from "./durable-event-manifest"

import { Event } from "./event"
import { MaestroEvent } from "./maestro-event"
import { RelayHook } from "./relay-hook"
import { ResearchEvent } from "./research-event"
import { SessionEvent } from "./session-event"

export const SessionDurable = {
  definitions: Event.durable(SessionEvent.DurableDefinitions),
  schema: SessionEvent.Durable,
} as const

export const Durable = Event.durable([
  ...SessionEvent.DurableDefinitions,
  ...MaestroEvent.Definitions,
  ...MaestroEvent.DurableOnlyDefinitions,
  ...RelayHook.Definitions,
  ...ResearchEvent.Definitions,
])
```

## E040 — `packages/protocol/src/groups/session.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `5830f50001c8dc01227a920f04276054c0e29570`; source lines 99–113. Applies to: s1.api.session-contract.

```typescript
const SessionHistoryLimit = PositiveInt.check(Schema.isLessThanOrEqualTo(100))

export const SessionHistoryQuery = Schema.Struct({
  limit: Schema.NumberFromString.pipe(Schema.decodeTo(SessionHistoryLimit), Schema.optional),
  after: Schema.NumberFromString.pipe(Schema.decodeTo(NonNegativeInt), Schema.optional),
})

export const ProcessNode = Schema.Struct({
  pid: Schema.Int,
  parentPid: Schema.optional(Schema.Int),
  name: Schema.optional(Schema.String),
}).annotate({ identifier: "SessionProcessNode" })

export const SessionProcess = Schema.Struct({
  id: Schema.String,
```

## E041 — `packages/protocol/src/groups/session.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `5830f50001c8dc01227a920f04276054c0e29570`; source lines 137–191. Applies to: s1.api.session-contract.

```typescript
      HttpApiEndpoint.get("session.list", "/api/session", {
        query: SessionsQuery,
        success: Schema.Struct({
          data: Schema.Array(Session.Info),
          cursor: Schema.Struct({
            previous: SessionsCursor.pipe(Schema.optional),
            next: SessionsCursor.pipe(Schema.optional),
          }),
        }).annotate({ identifier: "SessionsResponse" }),
        error: [InvalidCursorError, InvalidRequestError],
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "v2.session.list",
          summary: "List sessions",
          description:
            "Retrieve sessions in the requested order. Items keep that order across pages; use cursor.next or cursor.previous to move through the ordered list.",
        }),
      ),
    )
    .add(
      HttpApiEndpoint.post("session.create", "/api/session", {
        payload: Schema.Struct({
          id: Session.ID.pipe(Schema.optional),
          agent: Agent.ID.pipe(Schema.optional),
          model: Model.Ref.pipe(Schema.optional),
          location: Location.Ref.pipe(Schema.optional),
        }),
        success: Schema.Struct({ data: Session.Info }),
        error: SessionNotFoundError,
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "v2.session.create",
          summary: "Create session",
          description: "Create a session at the requested location.",
        }),
      ),
    )
    .add(
      HttpApiEndpoint.get("session.active", "/api/session/active", {
        success: Schema.Struct({ data: Schema.Record(Session.ID, SessionActive) }),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "v2.session.active",
          summary: "List active sessions",
          description:
            "Retrieve foreground Session drains currently owned by this Orchestra process. Sessions absent from the result are inactive.",
        }),
      ),
    )
    .add(
      HttpApiEndpoint.get("session.get", "/api/session/:sessionID", {
        params: { sessionID: Session.ID },
        success: Schema.Struct({ data: Session.Info }),
        error: SessionNotFoundError,
      })
```

## E042 — `packages/protocol/src/groups/session.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `5830f50001c8dc01227a920f04276054c0e29570`; source lines 202–220. Applies to: s1.api.session-contract.

```typescript
      HttpApiEndpoint.post("session.archive", "/api/session/:sessionID/archive", {
        params: { sessionID: Session.ID },
        payload: Schema.Struct({ archived: Schema.Boolean }),
        success: HttpApiSchema.NoContent,
        error: SessionNotFoundError,
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.archive",
            summary: "Archive or restore session",
            description: "Change session visibility without stopping execution or removing session history.",
          }),
      ),
    )
    .add(
      HttpApiEndpoint.post("session.rename", "/api/session/:sessionID/rename", {
        params: { sessionID: Session.ID },
        payload: Schema.Struct({ title: Schema.NonEmptyString }),
```

## E043 — `packages/protocol/src/groups/session.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `5830f50001c8dc01227a920f04276054c0e29570`; source lines 333–353. Applies to: s1.api.session-contract.

```typescript
      HttpApiEndpoint.post("session.prompt", "/api/session/:sessionID/prompt", {
        params: { sessionID: Session.ID },
        payload: Schema.Struct({
          id: SessionMessage.ID.pipe(Schema.optional),
          prompt: PromptInput.Prompt,
          delivery: SessionInput.Delivery.pipe(Schema.optional),
          resume: Schema.Boolean.pipe(Schema.optional),
        }),
        success: Schema.Struct({ data: SessionInput.Admitted }),
        error: [ConflictError, SessionNotFoundError],
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.prompt",
            summary: "Send message",
            description: "Durably admit one session input and schedule agent-loop execution unless resume is false.",
          }),
        ),
    )
    .add(
```

## E044 — `packages/protocol/src/groups/session.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `5830f50001c8dc01227a920f04276054c0e29570`; source lines 617–681. Applies to: s1.api.session-contract.

```typescript
      HttpApiEndpoint.get("session.history", "/api/session/:sessionID/history", {
        params: { sessionID: Session.ID },
        query: SessionHistoryQuery,
        success: Schema.Struct({
          data: Schema.Array(SessionEvent.Durable),
          hasMore: Schema.Boolean,
        }).annotate({ identifier: "SessionHistory" }),
        error: SessionNotFoundError,
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.history",
            summary: "Get session history",
            description:
              "Read one finite page of public durable Session events after an exclusive aggregate sequence. Newly committed events may appear on later pages.",
          }),
        ),
    )
    .add(
      HttpApiEndpoint.get("session.events", "/api/session/:sessionID/event", {
        params: { sessionID: Session.ID },
        query: {
          after: Schema.NumberFromString.pipe(Schema.decodeTo(NonNegativeInt), Schema.optional),
        },
        success: HttpApiSchema.StreamSse({ data: SessionEvent.Durable }),
        error: SessionNotFoundError,
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.events",
            summary: "Subscribe to session events",
            description: "Replay durable events after an aggregate sequence, then continue with new durable events.",
          }),
        ),
    )
    .add(
      HttpApiEndpoint.post("session.interrupt", "/api/session/:sessionID/interrupt", {
        params: { sessionID: Session.ID },
        success: HttpApiSchema.NoContent,
        error: SessionNotFoundError,
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.interrupt",
            summary: "Interrupt session execution",
            description: "Interrupt active execution owned by this Orchestra process. Idle interruption is a no-op.",
          }),
        ),
    )
    .add(
      HttpApiEndpoint.get("session.message", "/api/session/:sessionID/message/:messageID", {
        params: { sessionID: Session.ID, messageID: SessionMessage.ID },
        success: Schema.Struct({ data: SessionMessage.Message }),
        error: [SessionNotFoundError, MessageNotFoundError],
      })
        .middleware(sessionLocationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.session.message",
            summary: "Get session message",
            description: "Retrieve one projected message owned by the Session.",
          }),
```

## E045 — `packages/server/src/handlers/session.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `1ce1cd359f5c9bbfc12122fad3d4439655a1e5bb`; source lines 45–87. Applies to: s1.api.session-contract.

```typescript
  "Session.BusyError": operationErrors["Session.BusyError"],
}

export const SessionHandler = HttpApiBuilder.group(Api, "server.session", (handlers) =>
  Effect.gen(function* () {
    const session = yield* SessionV2.Service
    const subagentModels = yield* SessionSubagentModels.Service
    const appProcess = yield* AppProcess.Service
    const sessionProcess = yield* SessionProcess.Service
    const fs = yield* FSUtil.Service
    const moveSession = yield* MoveSession.Service
    const taskBackground = yield* TaskBackground.Service

    const admit = (input: Parameters<SessionV2.Interface["prompt"]>[0]) =>
      session.prompt(input).pipe(
        Effect.catchTag("Session.NotFoundError", (error) =>
          Effect.fail(
            new SessionNotFoundError({
              sessionID: error.sessionID,
              message: `Session not found: ${error.sessionID}`,
            }),
          ),
        ),
        Effect.catchTag("Session.PromptConflictError", (error) =>
          Effect.fail(
            new ConflictError({
              message: `Prompt message ID conflicts with an existing durable record: ${error.messageID}`,
              resource: error.messageID,
            }),
          ),
        ),
        // A hook refused the prompt before admission; nothing was recorded, and the hook's words say why.
        Effect.catchTag("Session.PromptBlockedError", (error) =>
          Effect.fail(new ConflictError({ message: error.detail, resource: error.sessionID })),
        ),
      )

    const policyResult = <A>(effect: Effect.Effect<A, SessionSubagentModels.Error>) => effect.pipe(
      Effect.catchTag("SessionSubagentModels.NotFoundError", (error) =>
        new SessionNotFoundError({ sessionID: error.sessionID, message: `Session not found: ${error.sessionID}` }),
      ),
      Effect.catchTags({
        "SessionSubagentModels.StorageError": () => new ServiceUnavailableError({ service: "session-subagent-models", message: "Session model policy storage is unavailable" }),
```

## E046 — `packages/server/src/handlers/session.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `1ce1cd359f5c9bbfc12122fad3d4439655a1e5bb`; source lines 107–178. Applies to: s1.api.session-contract.

```typescript
        "session.list",
        Effect.fn(function* (ctx) {
          const query =
            ctx.query.cursor !== undefined
              ? yield* SessionsCursor.parse(ctx.query.cursor).pipe(
                  Effect.mapError(() => new InvalidCursorError({ message: "Invalid cursor" })),
                )
              : ctx.query
          const sessions = yield* session.list({
            ...query,
            workspaceID: query.workspace,
            limit: ctx.query.limit ?? DefaultSessionsLimit,
          })
          const first = sessions[0]
          const last = sessions.at(-1)
          return {
            data: sessions,
            cursor: {
              previous: first
                ? SessionsCursor.make({
                    ...query,
                    anchor: {
                      id: first.id,
                      time: DateTime.toEpochMillis(first.time.created),
                      direction: "previous",
                    },
                  })
                : undefined,
              next: last
                ? SessionsCursor.make({
                    ...query,
                    anchor: {
                      id: last.id,
                      time: DateTime.toEpochMillis(last.time.created),
                      direction: "next",
                    },
                  })
                : undefined,
            },
          }
        }),
      )
      .handle(
        "session.create",
        Effect.fn(function* (ctx) {
          return {
            data: yield* session
              .create({
                id: ctx.payload.id,
                agent: ctx.payload.agent,
                model: ctx.payload.model,
                location: ctx.payload.location ?? { directory: AbsolutePath.make(process.cwd()) },
              })
              .pipe(typedNotFound),
          }
        }),
      )
      .handle(
        "session.active",
        Effect.fn(function* () {
          return {
            data: Object.fromEntries(
              Array.from(yield* session.active, (sessionID) => [sessionID, { type: "running" as const }]),
            ),
          }
        }),
      )
      .handle(
        "session.get",
        Effect.fn(function* (ctx) {
          return {
            data: yield* session.get(ctx.params.sessionID).pipe(
```

## E047 — `packages/server/src/handlers/session.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `1ce1cd359f5c9bbfc12122fad3d4439655a1e5bb`; source lines 247–263. Applies to: s1.api.session-contract.

```typescript
        "session.prompt",
        Effect.fn(function* (ctx) {
          return {
            data: yield* admit({
              sessionID: ctx.params.sessionID,
              id: ctx.payload.id,
              prompt: ctx.payload.prompt,
              delivery: ctx.payload.delivery,
              resume: ctx.payload.resume,
            }),
          }
        }),
      )
      .handle(
        "session.command",
        Effect.fn(function* (ctx) {
          const resolved = yield* SlashCommand.render(ctx.payload.command, ctx.payload.arguments ?? "").pipe(
```

## E048 — `packages/server/src/handlers/session.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `1ce1cd359f5c9bbfc12122fad3d4439655a1e5bb`; source lines 615–662. Applies to: s1.api.session-contract.

```typescript
        "session.history",
        Effect.fn(function* (ctx) {
          return yield* session
            .history({
              sessionID: ctx.params.sessionID,
              after: ctx.query.after,
              limit: ctx.query.limit ?? DefaultSessionHistoryLimit,
            })
            .pipe(
              Effect.map((page) => ({
                data: page.events,
                hasMore: page.hasMore,
              })),
              Effect.catchTag(
                "Session.NotFoundError",
                (error) =>
                  new SessionNotFoundError({
                    sessionID: error.sessionID,
                    message: `Session not found: ${error.sessionID}`,
                  }),
              ),
            )
        }),
      )
      .handle(
        "session.events",
        Effect.fn((ctx) =>
          Effect.succeed(
            session.events({ sessionID: ctx.params.sessionID, after: ctx.query.after }).pipe(Stream.orDie),
          ),
        ),
      )
      .handle(
        "session.interrupt",
        Effect.fn(function* (ctx) {
          yield* session.interrupt(ctx.params.sessionID)
          return HttpApiSchema.NoContent.make()
        }),
      )
      .handle(
        "session.processes",
        Effect.fn(function* (ctx) {
          yield* session.get(ctx.params.sessionID).pipe(typedNotFound)
          const items = yield* sessionProcess.list(ctx.params.sessionID, ctx.query.tail)
          return {
            data: items.map((item) => ({
              id: item.id,
              pid: item.pid,
```

## E049 — `packages/protocol/src/groups/message.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `60705d39526291ae4e58471447eedbe1af994e32`; source lines 1–51. Applies to: s1.api.session-contract.

```typescript
import { Session } from "@orchestra/schema/session"
import { SessionMessage } from "@orchestra/schema/session-message"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { InvalidCursorError, SessionNotFoundError, UnknownError } from "../errors"

export const SessionMessagesQuery = Schema.Struct({
  limit: Schema.optional(
    Schema.NumberFromString.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(200)),
  ).annotate({
    description: "Maximum number of messages to return. When omitted, the endpoint returns its default page size.",
  }),
  order: Schema.optional(Schema.Union([Schema.Literal("asc"), Schema.Literal("desc")])).annotate({
    description: "Message order for the first page. Use desc for newest first or asc for oldest first.",
  }),
  cursor: Schema.optional(
    Schema.String.annotate({
      description:
        "Opaque pagination cursor returned as cursor.previous or cursor.next in the previous response. Do not combine with order.",
    }),
  ),
}).annotate({ identifier: "SessionMessagesQuery" })

export const MessageGroup = HttpApiGroup.make("server.message")
  .add(
    HttpApiEndpoint.get("session.messages", "/api/session/:sessionID/message", {
      params: { sessionID: Session.ID },
      query: SessionMessagesQuery,
      success: Schema.Struct({
        data: Schema.Array(SessionMessage.Message),
        cursor: Schema.Struct({
          previous: Schema.String.pipe(Schema.optional),
          next: Schema.String.pipe(Schema.optional),
        }),
      }).annotate({ identifier: "SessionMessagesResponse" }),
      error: [InvalidCursorError, SessionNotFoundError, UnknownError],
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.session.messages",
        summary: "Get session messages",
        description:
          "Retrieve projected messages for a session. Items keep the requested order across pages; use cursor.next or cursor.previous to move through the ordered timeline.",
      }),
    ),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "messages",
      description: "Experimental message routes.",
    }),
  )
```

## E050 — `packages/server/src/handlers/message.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `76f2a2583525f1a8e45be6f0121c4870d0ea9f7a`; source lines 8–80. Applies to: s1.api.session-contract.

```typescript
const DefaultMessagesLimit = 50

const Cursor = Schema.Struct({
  id: SessionMessage.ID,
  order: Schema.Union([Schema.Literal("asc"), Schema.Literal("desc")]),
  direction: Schema.Union([Schema.Literal("previous"), Schema.Literal("next")]),
})

const decodeCursor = Schema.decodeUnknownSync(Cursor)

const cursor = {
  encode(message: SessionMessage.Message, order: "asc" | "desc", direction: "previous" | "next") {
    return Buffer.from(JSON.stringify({ id: message.id, order, direction })).toString("base64url")
  },
  decode(input: string) {
    return decodeCursor(JSON.parse(Buffer.from(input, "base64url").toString("utf8")))
  },
}

export const MessageHandler = HttpApiBuilder.group(Api, "server.message", (handlers) =>
  Effect.gen(function* () {
    const session = yield* SessionV2.Service

    return handlers.handle(
      "session.messages",
      Effect.fn(function* (ctx) {
        if (ctx.query.cursor && ctx.query.order !== undefined)
          return yield* new InvalidCursorError({ message: "Cursor cannot be combined with order" })
        const decoded = yield* Effect.try({
          try: () => (ctx.query.cursor ? cursor.decode(ctx.query.cursor) : undefined),
          catch: () => new InvalidCursorError({ message: "Invalid cursor" }),
        })
        const order = decoded?.order ?? ctx.query.order ?? "desc"
        const messages = yield* session
          .messages({
            sessionID: ctx.params.sessionID,
            limit: ctx.query.limit ?? DefaultMessagesLimit,
            order,
            cursor: decoded ? { id: decoded.id, direction: decoded.direction } : undefined,
          })
          .pipe(
            Effect.catchTag("Session.NotFoundError", (error) =>
              Effect.fail(
                new SessionNotFoundError({
                  sessionID: error.sessionID,
                  message: `Session not found: ${error.sessionID}`,
                }),
              ),
            ),
            Effect.catchTag("Session.MessageDecodeError", (error) => {
              const ref = `err_${crypto.randomUUID().slice(0, 8)}`
              return Effect.logError("failed to decode session message").pipe(
                Effect.annotateLogs({ ref, sessionID: error.sessionID, messageID: error.messageID }),
                Effect.andThen(
                  Effect.fail(
                    new UnknownError({ message: "Unexpected server error. Check server logs for details.", ref }),
                  ),
                ),
              )
            }),
          )
        const first = messages[0]
        const last = messages.at(-1)
        return {
          data: messages,
          cursor: {
            previous: first ? cursor.encode(first, order, "previous") : undefined,
            next: last ? cursor.encode(last, order, "next") : undefined,
          },
        }
      }),
    )
  }),
```

## E051 — `packages/server/src/middleware/session-location.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `86d49275ece013a3a1af6a75ed6a5e31d195781b`; source lines 15–62. Applies to: s1.api.session-contract, s1.api.server-edge.

```typescript
export class SessionLocationMiddleware extends HttpApiMiddleware.Service<
  SessionLocationMiddleware,
  { provides: LocationServices }
>()("@orchestra/HttpApiSessionLocation", {
  error: [InvalidRequestError, SessionNotFoundError],
}) {}

const decodeSessionID = Schema.decodeUnknownEffect(SessionV2.ID)

export const sessionLocationLayer = Layer.effect(
  SessionLocationMiddleware,
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    const locations = yield* LocationServiceMap.Service

    return SessionLocationMiddleware.of((effect) =>
      Effect.gen(function* () {
        const route = yield* HttpRouter.RouteContext
        const sessionID = yield* decodeSessionID(route.params.sessionID).pipe(
          Effect.mapError(
            () =>
              new InvalidRequestError({
                message: "Invalid session ID",
                field: "sessionID",
              }),
          ),
        )
        const row = yield* db
          .select({ directory: SessionTable.directory, workspaceID: SessionTable.workspace_id })
          .from(SessionTable)
          .where(eq(SessionTable.id, sessionID))
          .get()
          .pipe(Effect.orDie)
        if (!row)
          return yield* new SessionNotFoundError({
            sessionID,
            message: `Session not found: ${sessionID}`,
          })

        const location = Location.Ref.make({
          directory: AbsolutePath.make(row.directory),
          workspaceID: row.workspaceID ? WorkspaceV2.ID.make(row.workspaceID) : undefined,
        })
        return yield* effect.pipe(Effect.provide(bootLocation(locations.get(location), location)))
      }),
    )
  }),
)
```

## E052 — `packages/protocol/src/errors.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `040460309fbd868f937b7511ddd378942c0c2ac9`; source lines 1–120. Applies to: s1.api.server-edge.

```typescript
import { Schema } from "effect"

export class InvalidRequestError extends Schema.TaggedErrorClass<InvalidRequestError>()(
  "InvalidRequestError",
  {
    message: Schema.String,
    kind: Schema.optional(Schema.String),
    field: Schema.optional(Schema.String),
  },
  { httpApiStatus: 400 },
) {}

export class UnauthorizedError extends Schema.TaggedErrorClass<UnauthorizedError>()(
  "UnauthorizedError",
  { message: Schema.String },
  { httpApiStatus: 401 },
) {}

export class ConflictError extends Schema.TaggedErrorClass<ConflictError>()(
  "ConflictError",
  {
    message: Schema.String,
    resource: Schema.optional(Schema.String),
  },
  { httpApiStatus: 409 },
) {}

export class ServiceUnavailableError extends Schema.TaggedErrorClass<ServiceUnavailableError>()(
  "ServiceUnavailableError",
  {
    message: Schema.String,
    service: Schema.optional(Schema.String),
  },
  { httpApiStatus: 503 },
) {}

export class UnknownError extends Schema.TaggedErrorClass<UnknownError>()(
  "UnknownError",
  {
    message: Schema.String,
    ref: Schema.optional(Schema.String),
  },
  { httpApiStatus: 500 },
) {}

export class ProviderNotFoundError extends Schema.TaggedErrorClass<ProviderNotFoundError>()(
  "ProviderNotFoundError",
  {
    providerID: Schema.String,
    message: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

export class SessionNotFoundError extends Schema.TaggedErrorClass<SessionNotFoundError>()(
  "SessionNotFoundError",
  {
    sessionID: Schema.String,
    message: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

export class MessageNotFoundError extends Schema.TaggedErrorClass<MessageNotFoundError>()(
  "MessageNotFoundError",
  {
    sessionID: Schema.String,
    messageID: Schema.String,
    message: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

export class InvalidCursorError extends Schema.TaggedErrorClass<InvalidCursorError>()(
  "InvalidCursorError",
  { message: Schema.String },
  { httpApiStatus: 400 },
) {}

export class PermissionNotFoundError extends Schema.TaggedErrorClass<PermissionNotFoundError>()(
  "PermissionNotFoundError",
  {
    requestID: Schema.String,
    message: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

export class QuestionNotFoundError extends Schema.TaggedErrorClass<QuestionNotFoundError>()(
  "QuestionNotFoundError",
  {
    requestID: Schema.String,
    message: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

export class ForbiddenError extends Schema.TaggedErrorClass<ForbiddenError>()(
  "ForbiddenError",
  { message: Schema.String },
  { httpApiStatus: 403 },
) {}

export class PtyNotFoundError extends Schema.TaggedErrorClass<PtyNotFoundError>()(
  "PtyNotFoundError",
  {
    ptyID: Schema.String,
    message: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

export class McpServerNotFoundError extends Schema.TaggedErrorClass<McpServerNotFoundError>()(
  "McpServerNotFoundError",
  {
    server: Schema.String,
    message: Schema.String,
  },
  { httpApiStatus: 404 },
) {}
```

## E053 — `packages/server/src/auth.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `0569716157d6ae03d1343ba7d08ca697f1fbdb75`; source lines 6–49. Applies to: s1.api.server-edge.

```typescript
  password?: string
  username?: string
}

export type DecodedCredentials = {
  readonly username: string
  readonly password: Redacted.Redacted
}

export type Info = {
  readonly password: Option.Option<string>
  readonly username: string
}

export class Config extends Context.Service<Config, Info>()("@orchestra/ServerAuthConfig") {
  static configLayer(input: Info) {
    return Layer.succeed(this, this.of(input))
  }

  static get layer() {
    return Layer.effect(
      this,
      Effect.gen(function* () {
        return Config.of(
          yield* EffectConfig.all({
            password: EffectConfig.string("ORCHESTRA_SERVER_PASSWORD").pipe(EffectConfig.option),
            username: EffectConfig.string("ORCHESTRA_SERVER_USERNAME").pipe(EffectConfig.withDefault("orchestra")),
          }),
        )
      }),
    )
  }
}

export function required(config: Info) {
  return Option.isSome(config.password) && config.password.value !== ""
}

export function authorized(credentials: DecodedCredentials, config: Info) {
  return (
    Option.isSome(config.password) &&
    credentials.username === config.username &&
    Redacted.value(credentials.password) === config.password.value
  )
```

## E054 — `packages/server/src/middleware/authorization.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `d1624034dd309e5740a3d642357155f405f5839b`; source lines 10–13. Applies to: s1.api.server-edge.

```typescript
const AUTH_TOKEN_QUERY = "auth_token"
// EventSource and WebSocket cannot set an Authorization header, so only their routes read credentials
// from the query string. Everywhere else a URL credential would leak into logs and history for nothing.
const AUTH_TOKEN_QUERY_PATH = /^\/api\/(?:event|session\/[^/]+\/event|pty\/[^/]+\/connect)$/
```

## E055 — `packages/server/src/middleware/authorization.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `d1624034dd309e5740a3d642357155f405f5839b`; source lines 33–63. Applies to: s1.api.server-edge.

```typescript
function credentialFromRequest(request: HttpServerRequest.HttpServerRequest) {
  const url = new URL(request.url, "http://localhost")
  const token = AUTH_TOKEN_QUERY_PATH.test(url.pathname) ? url.searchParams.get(AUTH_TOKEN_QUERY) : null
  if (token) return decodeCredential(token)
  const match = /^Basic\s+(.+)$/i.exec(request.headers.authorization ?? "")
  if (match) return decodeCredential(match[1])
  return Effect.succeed(emptyCredential())
}

export const authorizationLayer = Layer.effect(
  Authorization,
  Effect.gen(function* () {
    const config = yield* ServerAuth.Config
    if (!ServerAuth.required(config)) return Authorization.of((effect) => effect)
    return Authorization.of((effect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        // Browsers cannot set headers on WebSocket upgrades, so a ticketed PTY connect skips
        // credential checks here; the connect handler consumes and validates the ticket.
        const url = new URL(request.url, "http://localhost")
        if (hasPtyConnectTicketURL(url)) return yield* effect
        // Media elements cannot send headers either; the content handler verifies the HMAC ticket.
        if (hasCapabilityContentTicketURL(url)) return yield* effect
        const credential = yield* credentialFromRequest(request)
        if (ServerAuth.authorized(credential, config)) return yield* effect
        yield* HttpEffect.appendPreResponseHandler((_request, response) =>
          Effect.succeed(HttpServerResponse.setHeader(response, "www-authenticate", WWW_AUTHENTICATE)),
        )
        return yield* new UnauthorizedError({ message: "Authentication required" })
      }),
    )
```

## E056 — `packages/server/src/middleware/capability-authorization.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `ca7a6eaeef94c55cb8c4df36a7b7a89a6256b58d`; source lines 17–85. Applies to: s1.api.server-edge.

```typescript
export const capabilityAuthorizationLayer = Layer.effect(
  CapabilityAuthorization,
  Effect.gen(function* () {
    const config = yield* ServerAuth.Config
    const operator = yield* ServerOperator.Service

    return CapabilityAuthorization.of((effect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const authority = yield* Effect.gen(function* () {
          if (ServerAuth.required(config)) {
            const credential = decodeBasic(request.headers.authorization ?? "")
            if (!credential || !ServerAuth.authorized(credential, config)) {
              return yield* new UnauthorizedError({ message: "Authentication required" })
            }
            return operator.configured
          }

          const bearer = /^Bearer ([A-Za-z0-9_-]{43})(?![\s\S])/.exec(request.headers.authorization ?? "")
          if (!bearer) return yield* new UnauthorizedError({ message: "Authentication required" })
          return yield* operator.authenticate(bearer[1])
        })

        const idempotencyKey = request.headers["idempotency-key"]
        if (idempotencyKey !== undefined && !/^[A-Za-z0-9_-]{1,128}(?![\s\S])/.test(idempotencyKey)) {
          return yield* new ForbiddenError({ message: "Request denied" })
        }

        // Only Core's private request frame carries authority. Caller-supplied IDs are not grants.
        return yield* operator.withRequest(authority, { requestID: randomUUID(), idempotencyKey },
          Effect.provideService(effect, RequestAuthority, authority))
      }).pipe(
        // Keep every defect, interrupt and failure annotation, including mixed lifecycle causes.
        Effect.catchCause((cause) =>
          Effect.failCause(
            Cause.fromReasons(
              cause.reasons.flatMap((reason) => {
                if (reason._tag !== "Fail") return [reason]
                return Cause.fail(
                  reason.error instanceof Capability.Failure ? capabilityError(reason.error) : reason.error,
                ).reasons.map((next) => next.annotate(Context.makeUnsafe(new Map(reason.annotations))))
              }),
            ),
          ),
        ),
      ),
    )
  }),
)

function decodeBasic(header: string) {
  const match = /^Basic ([A-Za-z0-9+/]+={0,2})(?![\s\S])/i.exec(header)
  if (!match) return undefined
  const decoded = Encoding.decodeBase64String(match[1])
  if (Result.isFailure(decoded) || Encoding.encodeBase64(decoded.success) !== match[1]) return undefined
  const separator = decoded.success.indexOf(":")
  if (separator === -1) return undefined
  return {
    username: decoded.success.slice(0, separator),
    password: Redacted.make(decoded.success.slice(separator + 1)),
  }
}

export function capabilityError(error: Capability.Failure) {
  if (error.code === "authentication_required" || error.code === "authentication_revoked") {
    return new UnauthorizedError({ message: "Authentication required" })
  }
  return new ForbiddenError({ message: "Request denied" })
}
```

## E057 — `packages/server/src/middleware/schema-error.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `d39702b74b11b1ee8e0072903bf1f9f19310da33`; source lines 1–20. Applies to: s1.api.server-edge.

```typescript
import { Effect } from "effect"
import { HttpApiMiddleware } from "effect/unstable/httpapi"
import { InvalidRequestError } from "@orchestra/protocol/errors"
import { SchemaErrorMiddleware } from "@orchestra/protocol/middleware/schema-error"
export { SchemaErrorMiddleware } from "@orchestra/protocol/middleware/schema-error"

const REASON_LIMIT = 1024

function truncateReason(reason: string) {
  if (reason.length <= REASON_LIMIT) return reason
  return reason.slice(0, REASON_LIMIT) + `... (${reason.length - REASON_LIMIT} more chars)`
}

export const schemaErrorLayer = HttpApiMiddleware.layerSchemaErrorTransform(SchemaErrorMiddleware, (error) => {
  const reason = truncateReason(error.cause.message)
  return Effect.logWarning("schema rejection").pipe(
    Effect.annotateLogs({ kind: error.kind, reason }),
    Effect.andThen(Effect.fail(new InvalidRequestError({ message: reason, kind: error.kind }))),
  )
})
```

## E058 — `packages/server/src/location.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `1881a570a893ec8c55aa436598db44ad19edde04`; source lines 33–94. Applies to: s1.api.server-edge.

```typescript
export function ref(request: HttpServerRequest.HttpServerRequest) {
  const query = new URL(request.url, "http://localhost").searchParams
  const workspaceID = query.get("location[workspace]") || request.headers["x-orchestra-workspace"]
  const directory = query.get("location[directory]") || process.cwd()
  return Location.Ref.make({
    directory: AbsolutePath.make(directory),
    workspaceID: workspaceID ? WorkspaceV2.ID.make(workspaceID) : undefined,
  })
}

/**
 * The Location's services, failing with a declared 400 when they cannot boot. A failed boot (most often a project whose
 * directory was removed) otherwise surfaces as an error no route declares, which the HttpApi answers as an empty 500 on
 * every route of that Location. Only booting is mapped: a Location already booted keeps serving from the map's cache,
 * so database-backed routes such as removing a session stay usable after its directory goes away.
 */
export function bootLocation<E, R>(services: Layer.Layer<LocationServices, E, R>, location: Location.Ref) {
  return services.pipe(Layer.catchCause((cause) => Layer.effectContext(bootFailure(cause, location))))
}

function bootFailure<E>(
  cause: Cause.Cause<E>,
  location: Location.Ref,
): Effect.Effect<Context.Context<LocationServices>, E | InvalidRequestError> {
  return Effect.gen(function* () {
    yield* Effect.logError("location services failed to boot", {
      directory: location.directory,
      cause: Cause.pretty(cause),
    })
    const missing = yield* Effect.promise(() =>
      stat(location.directory).then(
        (info) => !info.isDirectory(),
        (error: NodeJS.ErrnoException) => error.code === "ENOENT" || error.code === "ENOTDIR",
      ),
    )
    if (missing)
      return yield* new InvalidRequestError({
        message: `Directory not found: ${location.directory}`,
        kind: "location_not_found",
        field: "location.directory",
      })
    // A defect is a bug, not a bad request: it stays a 500, now logged above.
    if (!Cause.hasFails(cause)) return yield* Effect.failCause(cause)
    return yield* new InvalidRequestError({
      message: `Location could not start: ${location.directory}`,
      kind: "location_unavailable",
      field: "location.directory",
    })
  })
}

export const layer = Layer.effect(
  LocationMiddleware,
  Effect.gen(function* () {
    const locations = yield* LocationServiceMap.Service
    return LocationMiddleware.of((effect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const location = ref(request)
        return yield* effect.pipe(Effect.provide(bootLocation(locations.get(location), location)))
      }),
    )
```

## E059 — `packages/server/src/handlers/pty.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `8510e41f51ddc8738229a529fdbc9382324ff94e`; source lines 116–160. Applies to: s1.api.server-edge.

```typescript
        "pty.connectToken",
        Effect.fn(function* (ctx) {
          const request = yield* HttpServerRequest.HttpServerRequest
          // The custom header forces a CORS preflight, so cross-origin browser pages cannot
          // mint tickets without passing the server's origin policy.
          if (
            request.headers[PTY_CONNECT_TOKEN_HEADER] !== PTY_CONNECT_TOKEN_HEADER_VALUE ||
            !isAllowedRequestOrigin(request.headers.origin, request.headers.host, cors)
          )
            return yield* new ForbiddenError({ message: "Invalid PTY connect token request" })
          const pty = yield* Pty.Service
          yield* pty.get(ctx.params.ptyID).pipe(
            Effect.catchTag(
              "Pty.NotFoundError",
              () =>
                new PtyNotFoundError({
                  ptyID: ctx.params.ptyID,
                  message: `PTY session not found: ${ctx.params.ptyID}`,
                }),
            ),
          )
          return yield* response(tickets.issue({ ptyID: ctx.params.ptyID, ...(yield* ticketScope) }))
        }),
      )
      .handleRaw(
        "pty.connect",
        Effect.fn("PtyHandler.connect")(function* (ctx) {
          const pty = yield* Pty.Service
          const exists = yield* pty.get(ctx.params.ptyID).pipe(
            Effect.as(true),
            Effect.catchTag("Pty.NotFoundError", () => Effect.succeed(false)),
          )
          if (!exists) return HttpServerResponse.empty({ status: 404 })

          const url = new URL(ctx.request.url, "http://localhost")
          const ticket = url.searchParams.get(PTY_CONNECT_TICKET_QUERY)
          if (ticket) {
            const valid = isAllowedRequestOrigin(ctx.request.headers.origin, ctx.request.headers.host, cors)
              ? yield* tickets.consume({ ticket, ptyID: ctx.params.ptyID, ...(yield* ticketScope) })
              : false
            if (!valid) return HttpServerResponse.empty({ status: 403 })
          }
          const parsedCursor = url.searchParams.get("cursor")
          const cursorNumber = parsedCursor === null ? undefined : Number(parsedCursor)
          const cursor =
```

## E060 — `packages/server/src/handlers/pty.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `8510e41f51ddc8738229a529fdbc9382324ff94e`; source lines 175–183. Applies to: s1.api.server-edge.

```typescript

          // Outbound frames flow through one queue drained by a single writer so replay, live
          // output, and the close frame keep their order.
          // TODO: Integrate graceful-shutdown socket tracking before clients migrate to this route.
          const outbox = yield* Queue.unbounded<string | Uint8Array | Socket.CloseEvent>()
          const attachment = yield* pty
            .attach(ctx.params.ptyID, {
              cursor,
              onData: (chunk) => Queue.offerUnsafe(outbox, chunk),
```

## E061 — `packages/server/src/handlers/capability-artifacts.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `f7f3110dbfa6af4e9ad992b560fcfa63ccc2ba9d`; source lines 58–84. Applies to: s1.api.server-edge.

```typescript
    const management = yield* CapabilityArtifactManagement.make({ operators }).pipe(
      Effect.provideService(Database.Service, database),
    )
    return handlers.handleRaw("capability.content.read", ({ params, headers }) => {
      const claim = tickets.verify(params.ticket)
      // Expired and unknown tickets are indistinguishable: an empty 401.
      if (claim === undefined) return Effect.succeed(HttpServerResponse.empty({ status: 401 }))
      // Re-run the content read under the minting authority; Core rejects it once revoked or expired.
      return operators.withRequest(claim.authority, { requestID: randomUUID() },
        management.content(claim.sessionID, claim.ref)).pipe(
        Effect.map((content) => contentResponse(content.artifact, content.data, headers.range)),
        Effect.catchIf((error): error is Capability.Failure => error instanceof Capability.Failure,
          () => Effect.succeed(HttpServerResponse.empty({ status: 401 }))),
        // The minting authority could read it, so unavailable now means the artifact or its reference is gone.
        Effect.catchIf((error): error is CapabilityArtifacts.Failure =>
          error instanceof CapabilityArtifacts.Failure && error.code === "artifact_unavailable",
          () => Effect.succeed(HttpServerResponse.empty({ status: 404 }))),
        artifactResponse)
    })
  }),
)

/** Single `bytes=` ranges only; multi-range or malformed headers fall back to the full verified body (RFC 9110 14.2). */
export function contentResponse(artifact: Readonly<{ hash: string; mime: string }>, data: Uint8Array, range: string | undefined) {
  const size = data.byteLength
  const headers = {
    "content-disposition": "attachment",
```

## E062 — `packages/server/src/principal.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `f854d83e8c4b760f9c56282a59af87e73a7fbf51`; source lines 1–20. Applies to: s1.api.server-edge, s1.api.sdk-composition.

```typescript
export * as Principal from "./principal"

import os from "os"
import { Result } from "effect"
import type { HttpServerRequest } from "effect/unstable/http"

/**
 * Who a request acts for, recorded on owner actions (publish, hook install and lifecycle; run release later). The
 * server has no per-person accounts: its Basic credential is one shared service identity (the desktop sidecar always
 * signs in with the same fixed username), so that name says nothing about who acted. The person is the OS account
 * running the server, which is the signed-in user of the machine.
 */
export function of(_request: HttpServerRequest.HttpServerRequest) {
  return account()
}

export function account() {
  const user = Result.try(() => os.userInfo().username)
  return Result.isSuccess(user) && user.success ? user.success : "local"
}
```

## E063 — `packages/server/src/handlers/model.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `51ecfd876092dd1e2752f4ead4d40d99d34d6010`; source lines 8–47. Applies to: s1.api.server-edge.

```typescript
export const ModelHandler = HttpApiBuilder.group(Api, "server.model", (handlers) =>
  Effect.gen(function* () {
    return handlers
      .handle(
        "model.list",
        Effect.fn(function* () {
          const catalog = yield* Catalog.Service
          const additional = yield* CatalogAvailability.AdditionalProviders
          return yield* response(
            Effect.gen(function* () {
              const available = yield* catalog.model.available()
              const extra = new Set((yield* additional(catalog)).map((provider) => provider.id))
              if (extra.size === 0) return available
              return [
                ...available,
                ...(yield* catalog.model.all()).filter(
                  (model) =>
                    extra.has(model.providerID) &&
                    model.enabled &&
                    !available.some((item) => item.providerID === model.providerID && item.id === model.id),
                ),
              ]
            }),
          )
        }),
      )
      .handle(
        "model.default",
        Effect.fn(function* () {
          const catalog = yield* Catalog.Service
          const preferred = yield* CatalogAvailability.DefaultModel
          return yield* response(
            Effect.gen(function* () {
              return (yield* preferred(catalog)) ?? (yield* catalog.model.default()) ?? null
            }),
          )
        }),
      )
  }),
)
```

## E064 — `packages/server/src/handlers/provider.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `407a5c5ce66f41da27a4f793cbe8ff3c9c9bbafd`; source lines 10–61. Applies to: s1.api.server-edge.

```typescript
export const ProviderHandler = HttpApiBuilder.group(Api, "server.provider", (handlers) =>
  Effect.gen(function* () {
    return handlers
      .handle(
        "provider.list",
        Effect.fn(function* () {
          const catalog = yield* Catalog.Service
          const additional = yield* CatalogAvailability.AdditionalProviders
          return yield* response(Effect.gen(function* () {
            const available = yield* catalog.provider.available()
            const extra = yield* additional(catalog)
            return [...available, ...extra.filter((provider) => !available.some((item) => item.id === provider.id))]
          }))
        }),
      )
      .handle(
        "provider.claudeCode.account",
        Effect.fn(function* () {
          const account = yield* ClaudeCodeAccount.Service
          return yield* account.account
        }),
      )
      .handle(
        "provider.claudeCode.login",
        Effect.fn(function* () {
          const account = yield* ClaudeCodeAccount.Service
          return yield* account.startLogin.pipe(
            Effect.catchTag("ClaudeCodeAccount.LoginError", (error) =>
              Effect.fail(new ServiceUnavailableError({ message: error.message, service: "claude-code" })),
            ),
          )
        }),
      )
      .handle(
        "provider.claudeCode.loginCode",
        Effect.fn(function* (ctx) {
          const account = yield* ClaudeCodeAccount.Service
          return yield* account.sendCode(ctx.payload.code)
        }),
      )
      .handle(
        "provider.get",
        Effect.fn(function* (ctx) {
          const catalog = yield* Catalog.Service
          const provider = yield* catalog.provider.get(ctx.params.providerID)
          if (!provider)
            return yield* new ProviderNotFoundError({
              providerID: ctx.params.providerID,
              message: `Provider not found: ${ctx.params.providerID}`,
            })
          return yield* response(Effect.succeed(provider))
        }),
```

## E065 — `packages/protocol/src/groups/event.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `fd237077e949ffd4d7453e1c1e09b6d3a833b380`; source lines 1–31. Applies to: s1.api.stream-contract.

```typescript
import { Event } from "@orchestra/schema/event"
import { EventManifest } from "@orchestra/schema/event-manifest"
import { Location } from "@orchestra/schema/location"
import type { Definition } from "@orchestra/schema/event"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi"

const fields = {
  id: Event.ID,
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  durable: Schema.optional(Schema.Struct({ aggregateID: Schema.String, seq: Schema.Int, version: Schema.Int })),
  location: Schema.optional(Location.Ref),
}

const schema = <const Definitions extends ReadonlyArray<Definition>>(definitions: Definitions) =>
  Schema.Union([
    ...definitions,
    ...(definitions.some((definition) => definition.type === "server.connected")
      ? []
      : [
          Schema.Struct({
            ...fields,
            type: Schema.Literal("server.connected"),
            data: Schema.Struct({}),
          }).annotate({ identifier: "V2Event.server.connected" }),
        ]),
  ]).annotate({ identifier: "V2Event" })

const make = <const Definitions extends ReadonlyArray<Definition>>(definitions: Definitions) => {
  const EventSchema = schema(definitions)
  return {
```

## E066 — `packages/server/src/handlers/event.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `d644f36bdd6aa93cd538f560dab63337c2436022`; source lines 1–64. Applies to: s1.api.stream-contract.

```typescript
import { EventV2 } from "@orchestra/core/event"
import { OrchestraEvent } from "@orchestra/protocol/groups/event"
import { Effect, Schema, Stream } from "effect"
import { HttpServerResponse } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import * as Sse from "effect/unstable/encoding/Sse"
import { Api } from "../api"

export const encodeEvent = (data: unknown) => JSON.stringify(Schema.encodeUnknownSync(OrchestraEvent)(data))

// The bus hands every subscriber the same payload object, so the encoded JSON is memoized on it: N open streams pay
// one schema encode and one stringify per event instead of N. The entry dies with the payload.
export const eventFrames = (encode: (data: unknown) => string = encodeEvent) => {
  const frames = new WeakMap<object, string>()
  return (data: object): Sse.Event => {
    const cached = frames.get(data)
    const json = cached ?? encode(data)
    if (cached === undefined) frames.set(data, json)
    return { _tag: "Event", event: "message", id: undefined, data: json }
  }
}

// The renderer reads this stream on its main thread. On a loaded machine it can fall seconds behind while a model
// streams token deltas, and a subscriber that overflows is cut and must resync everything. The capacity is large
// enough to ride out such a stall; an event is a few hundred bytes, so a full queue is still small.
export const subscriberCapacity = 4096

export const eventStream = (events: EventV2.Interface, frame = eventFrames()) => {
  const connected = {
    id: EventV2.ID.create(),
    type: "server.connected",
    data: {},
  }
  const output = Stream.unwrap(
    Effect.gen(function* () {
      // Acquiring the bounded stream installs its listener before readiness is observable.
      const live = yield* EventV2.allBounded(events, subscriberCapacity)
      return Stream.make(connected).pipe(Stream.concat(live))
    }),
  ).pipe(Stream.map(frame), Stream.pipeThroughChannel(Sse.encode()))
  // A comment frame keeps idle connections open and tells the client the server is alive.
  const heartbeat = Stream.tick("15 seconds").pipe(Stream.map(() => ": heartbeat\n\n"))
  return output.pipe(Stream.merge(heartbeat, { haltStrategy: "left" }), Stream.encodeText)
}

export const EventHandler = HttpApiBuilder.group(Api, "server.event", (handlers) =>
  Effect.gen(function* () {
    const events = yield* EventV2.Service
    // One memo for the whole server, so every subscriber reuses the first one's encode.
    const frame = eventFrames()
    return handlers.handleRaw("event.subscribe", () =>
      Effect.succeed(
        HttpServerResponse.stream(eventStream(events, frame), {
          contentType: "text/event-stream",
          headers: {
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "X-Content-Type-Options": "nosniff",
          },
        }),
      ),
    )
  }),
)
```

## E067 — `packages/client/src/generated/client.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `93cab27e0b902d6e8fbd21d6aaec320a2b9fe09c`; source lines 535–666. Applies to: s1.api.stream-contract, s1.api.client-projection.

```typescript
export interface ClientOptions {
  readonly baseUrl: string
  readonly fetch?: typeof globalThis.fetch
  readonly headers?: HeadersInit
}

export interface RequestOptions {
  readonly signal?: AbortSignal
  readonly headers?: HeadersInit
}

export function make(options: ClientOptions) {
  const fetch = options.fetch ?? globalThis.fetch

  const prepare = (descriptor: RequestDescriptor, requestOptions?: RequestOptions) => {
    const url = new URL(descriptor.path, options.baseUrl)
    for (const [key, value] of Object.entries(descriptor.query ?? {})) appendQuery(url.searchParams, key, value)
    const headers = new Headers(options.headers)
    for (const [key, value] of Object.entries(descriptor.headers ?? {})) {
      if (value !== undefined && value !== null) headers.set(key, String(value))
    }
    for (const [key, value] of new Headers(requestOptions?.headers)) headers.set(key, value)
    if (descriptor.body !== undefined && !headers.has("content-type")) headers.set("content-type", "application/json")
    return {
      url,
      init: {
        method: descriptor.method,
        signal: requestOptions?.signal,
        headers,
        body: descriptor.body === undefined ? undefined : JSON.stringify(descriptor.body),
      } satisfies RequestInit,
    }
  }

  const execute = async (descriptor: RequestDescriptor, requestOptions?: RequestOptions) => {
    try {
      const prepared = prepare(descriptor, requestOptions)
      return await fetch(prepared.url, prepared.init)
    } catch (cause) {
      throw new ClientError("Transport", { cause })
    }
  }

  const responseError = async (response: Response, descriptor: RequestDescriptor): Promise<never> => {
    if (descriptor.declaredStatuses.includes(response.status)) throw await json(response)
    try {
      await response.body?.cancel()
    } catch {}
    throw new ClientError("UnexpectedStatus", { cause: { status: response.status } })
  }

  const request = async <A>(descriptor: RequestDescriptor, requestOptions?: RequestOptions): Promise<A> => {
    const response = await execute(descriptor, requestOptions)
    if (response.status !== descriptor.successStatus) return responseError(response, descriptor)
    if (descriptor.empty) {
      try {
        await response.body?.cancel()
      } catch {}
      return undefined as A
    }
    if (descriptor.binary) {
      return new Uint8Array(await response.arrayBuffer()) as A
    }
    return (await json(response)) as A
  }

  const sse = <A>(descriptor: RequestDescriptor, requestOptions?: RequestOptions): AsyncIterable<A> => ({
    async *[Symbol.asyncIterator]() {
      const response = await execute(descriptor, requestOptions)
      if (response.status !== descriptor.successStatus) await responseError(response, descriptor)
      if (!isContentType(response, "text/event-stream")) {
        try {
          await response.body?.cancel()
        } catch {}
        throw new ClientError("UnsupportedContentType")
      }
      if (response.body === null) throw new ClientError("MalformedResponse")
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      try {
        while (true) {
          let next
          try {
            next = await reader.read()
          } catch (cause) {
            throw new ClientError("Transport", { cause })
          }
          buffer += decoder.decode(next.value, { stream: !next.done })
          if (buffer.length > 1_048_576) throw new ClientError("MalformedResponse")
          const trailingCarriageReturn = !next.done && buffer.endsWith("\r")
          if (trailingCarriageReturn) buffer = buffer.slice(0, -1)
          buffer = buffer.replaceAll("\r\n", "\n").replaceAll("\r", "\n")
          if (trailingCarriageReturn) buffer += "\r"
          if (next.done && buffer !== "") buffer += "\n\n"
          let boundary = buffer.indexOf("\n\n")
          while (boundary >= 0) {
            const block = buffer.slice(0, boundary)
            buffer = buffer.slice(boundary + 2)
            const data = block
              .split("\n")
              .flatMap((line) => (line.startsWith("data:") ? [line.slice(5).trimStart()] : []))
              .join("\n")
            if (data !== "") {
              try {
                yield JSON.parse(data) as A
              } catch (cause) {
                throw new ClientError("MalformedResponse", { cause })
              }
            }
            boundary = buffer.indexOf("\n\n")
          }
          if (next.done) return
        }
      } finally {
        try {
          await reader.cancel()
        } catch {}
        reader.releaseLock()
      }
    },
  })

  return {
    health: {
      get: (requestOptions?: RequestOptions) =>
        request<HealthGetOutput>(
          { method: "GET", path: `/api/health`, successStatus: 200, declaredStatuses: [401, 400], empty: false },
          requestOptions,
        ),
    },
    location: {
```

## E068 — `packages/client/src/generated/client.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `93cab27e0b902d6e8fbd21d6aaec320a2b9fe09c`; source lines 4072–4108. Applies to: s1.api.stream-contract, s1.api.client-projection.

```typescript
function appendQuery(params: URLSearchParams, key: string, value: unknown): void {
  if (value === undefined || value === null) return
  if (Array.isArray(value)) {
    for (const item of value) appendQuery(params, key, item)
    return
  }
  if (typeof value === "object") {
    for (const [child, item] of Object.entries(value)) appendQuery(params, `${key}[${child}]`, item)
    return
  }
  params.append(key, String(value))
}

async function json(response: Response): Promise<unknown> {
  if (!isContentType(response, "application/json") && !response.headers.get("content-type")?.includes("+json")) {
    try {
      await response.body?.cancel()
    } catch {}
    throw new ClientError("UnsupportedContentType")
  }
  let text: string
  try {
    text = await response.text()
  } catch (cause) {
    throw new ClientError("Transport", { cause })
  }
  if (text === "") throw new ClientError("MalformedResponse")
  try {
    return JSON.parse(text)
  } catch (cause) {
    throw new ClientError("MalformedResponse", { cause })
  }
}

function isContentType(response: Response, expected: string) {
  return response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() === expected
}
```

## E069 — `packages/client/README.md`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `6b5cf80aff0f077666ffcadbf177671a3bc4032f`; source lines 11–15. Applies to: s1.api.client-projection.

```text
## Entry points

- `@orchestra/client`: Promise client over `fetch`, with no Effect runtime dependency.
- `@orchestra/client/effect`: Effect client over an environment-provided `HttpClient`; safe to bundle for the browser. It re-exports canonical Schema types such as `Session.ID`, `Location.Ref` and `Prompt`.
- `@orchestra/client/contract`: the client-local API projection (`src/contract.ts`) that the generator compiles.
```

## E070 — `packages/client/README.md`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `6b5cf80aff0f077666ffcadbf177671a3bc4032f`; source lines 27–36. Applies to: s1.api.client-projection.

```text
## Generation

`script/build.ts` compiles `ClientApi` from `src/contract.ts`, which composes Protocol with client-local middleware tags, group and method names, and an omission set. Raw file reads and PTY WebSocket operations are omitted; their transports are separate. Tests compare the projection with Server's concrete API.

`src/generated` and `src/generated-effect` are generator output. After changing the public Protocol or Server `HttpApi`, run from this directory:

```sh
bun run generate
bun run check:generated   # fails if committed output drifted
```
```

## E071 — `packages/client/src/generated/client.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `93cab27e0b902d6e8fbd21d6aaec320a2b9fe09c`; source lines 1548–1572. Applies to: s1.api.client-projection.

```typescript
          requestOptions,
        ),
    },
    files: {
      read: (input: FilesReadInput, requestOptions?: RequestOptions) =>
        request<FilesReadOutput>(
          {
            method: "GET",
            path: `/api/fs/read`,
            query: { location: input["location"], path: input["path"] },
            successStatus: 200,
            declaredStatuses: [400, 401],
            empty: false,
            binary: true,
          },
          requestOptions,
        ),
      list: (input?: FilesListInput, requestOptions?: RequestOptions) =>
        request<FilesListOutput>(
          {
            method: "GET",
            path: `/api/fs/list`,
            query: { location: input?.["location"], path: input?.["path"] },
            successStatus: 200,
            declaredStatuses: [401, 400],
```

## E072 — `packages/protocol/src/groups/fs.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `5702e0dc78bba10bedd25bb171cbf3edec70928a`; source lines 1–48. Applies to: s1.api.client-projection.

```typescript
import { FileSystem } from "@orchestra/schema/filesystem"
import { Location } from "@orchestra/schema/location"
import { PositiveInt, RelativePath } from "@orchestra/schema/schema"
import { type Context, Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiMiddleware, HttpApiSchema, OpenApi } from "effect/unstable/httpapi"
import { InvalidRequestError } from "../errors"
import { LocationQuery, locationQueryOpenApi } from "./location"

const ListQuery = Schema.Struct({
  ...LocationQuery.fields,
  path: RelativePath.pipe(Schema.optional),
})

const FindQuery = Schema.Struct({
  ...LocationQuery.fields,
  query: FileSystem.FindInput.fields.query,
  type: FileSystem.FindInput.fields.type,
  limit: Schema.NumberFromString.pipe(Schema.decodeTo(PositiveInt), Schema.optional),
})

// Listing is served from the filesystem alone, so browsing folders never starts a Location's services; reading and
// searching run in the Location.
export const makeFileSystemGroup = <I extends HttpApiMiddleware.AnyId, S>(locationMiddleware: Context.Key<I, S>) =>
  HttpApiGroup.make("server.fs")
  .add(
    HttpApiEndpoint.get("fs.read", "/api/fs/read", {
      query: Schema.Struct({
        ...LocationQuery.fields,
        path: RelativePath,
      }),
      success: Schema.Uint8Array.pipe(HttpApiSchema.asUint8Array()),
      error: InvalidRequestError,
    })
      .middleware(locationMiddleware)
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.fs.read",
          summary: "Read file",
          description: "Serve one file relative to the requested location.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.get("fs.list", "/api/fs/list", {
      query: ListQuery,
      success: Location.response(Schema.Array(FileSystem.Entry)),
    })
```

## E073 — `packages/client/src/wire.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `8ff88190163e1254d4c92ea5c70ef0f9c8fc8d04`; source lines 1–4. Applies to: s1.api.client-projection.

```typescript
import type { SessionEvent } from "@orchestra/schema/session-event"
import type { Schema } from "effect"

export type SessionEventEncoded = Schema.Codec.Encoded<typeof SessionEvent.Durable>
```

## E074 — `packages/client/src/generated-effect/client-error.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `b8731eec8a26bd7bb8a76d16c67666e6db5af3d1`; source lines 1–12. Applies to: s1.api.client-projection.

```typescript
import { Schema } from "effect"
import { Sse } from "effect/unstable/encoding"
import { HttpClientError } from "effect/unstable/http"

export class ClientError extends Schema.TaggedErrorClass<ClientError>()("ClientError", {
  cause: Schema.Defect(),
}) {}

export const mapClientError = <E>(error: E) =>
  HttpClientError.isHttpClientError(error) || Schema.isSchemaError(error) || Sse.Retry.is(error)
    ? new ClientError({ cause: error })
    : error
```

## E075 — `packages/client/src/actions-transfer.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `0d8607699a560ae9fb671f8bc37bc9d1b473424e`; source lines 58–70. Applies to: s1.api.client-projection.

```typescript
      } catch (cause) {
        if (cause instanceof ActionsTransferError) throw cause
        throw new ActionsTransferError("Transport", { cause })
      }
    },
    /**
     * Stream uploads require a fetch implementation supporting request streams (duplex: "half").
     * Browsers may require HTTPS/HTTP2 and may not expose a reply until upload completes.
     * A failed capability probe has code "UnsupportedStreaming". A caller-owned Blob skips the
     * probe; no stream-to-Blob fallback occurs. Constructor detection is not a browser runtime proof.
     */
    upload: async (
      input: {
```

## E076 — `packages/client/src/actions-transfer.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `0d8607699a560ae9fb671f8bc37bc9d1b473424e`; source lines 104–130. Applies to: s1.api.client-projection.

```typescript
          requestOptions,
        )
        if (captured.body instanceof ReadableStream) {
          if (captured.body.locked) invalid("Upload stream is locked")
          let duplexRead = false
          const probe: StreamingRequestInit = {
            method: "POST",
            body: captured.body,
            get duplex(): "half" {
              duplexRead = true
              return "half"
            },
          }
          const supported = await Promise.resolve()
            .then(() => new Request(prepared.url, probe))
            .catch((cause: unknown) => {
              throw new ActionsTransferError("Transport", { code: "UnsupportedStreaming", cause })
            })
          // Browsers must read duplex and must not coerce a stream to text. Bun's constructor
          // need not read duplex here; Bun's streaming fetch is covered by the real HTTP fixture.
          if (supported.headers.has("content-type") || (!duplexRead && typeof Reflect.get(globalThis, "Bun") === "undefined"))
            throw new ActionsTransferError("Transport", {
              code: "UnsupportedStreaming",
              cause: new Error("fetch request streaming is unavailable; supply a Blob"),
            })
        }
        return request(prepared)
```

## E077 — `packages/client/src/actions-transfer.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `0d8607699a560ae9fb671f8bc37bc9d1b473424e`; source lines 143–176. Applies to: s1.api.client-projection.

```typescript
  query: Record<string, string | number | undefined>,
  body: ReadableStream<Uint8Array> | Blob | undefined,
  requestOptions?: RequestOptions,
) {
  requireBinding(binding)
  requireLocation(location)
  const fetch = options.fetch ?? globalThis.fetch
  const url = new URL(
    `/api/actions/transfer/${encodeURIComponent(binding.id)}${body === undefined ? "" : "/upload"}`,
    options.baseUrl,
  )
  if (url.protocol !== "http:" && url.protocol !== "https:") invalid("baseUrl must use HTTP or HTTPS")
  url.searchParams.set("revision", String(binding.revision))
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined) url.searchParams.set(key, String(value))
  })
  if (location?.directory !== undefined) url.searchParams.set("location[directory]", location.directory)
  if (location?.workspace !== undefined) url.searchParams.set("location[workspace]", location.workspace)
  const headers = new Headers(options.headers)
  new Headers(requestOptions?.headers).forEach((value, key) => headers.set(key, value))
  // Native multipart framing and its boundary belong to the server, never this adapter.
  if (body !== undefined) headers.set("content-type", "application/octet-stream")
  const controller = new AbortController()
  const signal = requestOptions?.signal
  const init: StreamingRequestInit = {
    method: body === undefined ? "GET" : "POST",
    headers,
    body,
    signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
    // A provider/signed redirect must not receive the configured Orchestra credentials.
    redirect: "manual",
    ...(body instanceof ReadableStream ? { duplex: "half" } : {}),
  }
  return { fetch, url, init, controller }
```

## E078 — `packages/client/src/actions-transfer-error.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `314b2dc47f3e63182dec1324c1c31f3839dc12d9`; source lines 4–73. Applies to: s1.api.client-projection.

```typescript
export class ActionsTransferError extends ClientError {
  readonly code?: "UnsupportedStreaming"
  readonly status?: number
  readonly data?: Actions.ErrorData
  readonly kind?: Actions.ErrorKind
  // The frozen ErrorData has no outcome schema yet. Preserve the wire value without guessing its shape.
  readonly outcome?: unknown
  readonly retryAfter?: number
  readonly truncated: boolean

  constructor(
    reason: ClientErrorReason,
    details: {
      code?: "UnsupportedStreaming"
      cause?: unknown
      status?: number
      data?: Actions.ErrorData & { outcome?: unknown }
      retryAfter?: number
      truncated?: boolean
    } = {},
  ) {
    super(reason, { cause: details.cause })
    this.code = details.code
    this.status = details.status
    this.data = details.data
    this.kind = details.data?.kind
    this.outcome = details.data?.outcome
    this.retryAfter = details.data?.retryAfter ?? details.retryAfter
    this.truncated = details.truncated ?? false
    this.message = details.data?.message ?? details.code ?? reason
  }
}

/** Error bodies only: at most 16 KiB retained, with a five-second read deadline. */
export async function actionsTransferResponseError(response: Response): Promise<never> {
  const details = { status: response.status, retryAfter: retryAfter(response.headers.get("retry-after")) }
  const captured = await capture(response).catch((cause: unknown) => {
    throw new ActionsTransferError("Transport", { ...details, cause })
  })
  if (captured.truncated) throw new ActionsTransferError("MalformedResponse", { ...details, truncated: true })
  if (!/^application\/(?:json|[\w.+-]+\+json)(?:\s*;|$)/i.test(response.headers.get("content-type") ?? ""))
    throw new ActionsTransferError("UnexpectedStatus", details)
  const data = parse(captured.bytes)
  if (!isErrorData(data)) throw new ActionsTransferError("MalformedResponse", details)
  throw new ActionsTransferError("UnexpectedStatus", { ...details, data })
}

async function capture(response: Response) {
  const bytes = new Uint8Array(16_384)
  if (!response.body) return { bytes: bytes.subarray(0, 0), truncated: false }
  const reader = response.body.getReader()
  let length = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Actions error response read timed out")), 5_000)
  })
  try {
    while (true) {
      const next = await Promise.race([reader.read(), deadline])
      if (next.done) return { bytes: bytes.subarray(0, length), truncated: false }
      if (next.value.byteLength > bytes.length - length) return { bytes: bytes.subarray(0, length), truncated: true }
      bytes.set(next.value, length)
      length += next.value.byteLength
    }
  } finally {
    clearTimeout(timer)
    // Do not let a broken peer extend the capture deadline through cancellation.
    void reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
```

## E079 — `packages/protocol/src/groups/actions-transfer.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `e39a1a8900b6808f0a80be14af702b14c3dc3c44`; source lines 1–17. Applies to: s1.api.client-projection.

```typescript
import { Actions } from "@orchestra/schema/actions"
import { Location } from "@orchestra/schema/location"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi"
import { ActionsApiError, BindingParams, BindingQuery, OptionalAttempt } from "./actions-common"
import { locationQueryOpenApi } from "./location"

export const TransferQuery = Schema.Struct({ ...BindingQuery.fields, ...Actions.TransferInput.fields, attempt: OptionalAttempt })

export const ActionsTransferGroup = HttpApiGroup.make("server.actionsTransfer")
  .add(HttpApiEndpoint.get("actions.transfer.info", "/api/actions/transfer/:bindingID/info", {
    params: BindingParams, query: TransferQuery, success: Location.response(Actions.TransferInfo), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.get("actions.transfer.read", "/api/actions/transfer/:bindingID", {
    params: BindingParams, query: TransferQuery,
    success: Schema.Uint8Array.pipe(HttpApiSchema.asUint8Array()), error: ActionsApiError,
  }).annotateMerge(locationQueryOpenApi))
```

## E080 — `packages/server/src/handlers/actions-transfer.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `50b7434c5595f4868cd3bd2429ec39b6441cba1c`; source lines 1–35. Applies to: s1.api.client-projection.

```typescript
import { Actions } from "@orchestra/core/actions"
import { TransferQuery } from "@orchestra/protocol/groups/actions-transfer"
import { BindingID } from "@orchestra/schema/actions"
import { Effect, Schema } from "effect"
import { HttpServerResponse } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { apiError, bindingRef, result } from "./actions-common"

export const ActionsTransferHandler = HttpApiBuilder.group(Api, "server.actionsTransfer", (handlers) => Effect.succeed(
  handlers
    .handle("actions.transfer.info", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.transferInfo(bindingRef(ctx), {
        kind: ctx.query.kind, id: ctx.query.id, runID: ctx.query.runID, attempt: ctx.query.attempt, path: ctx.query.path,
      })
    })))
    .handleRaw("actions.transfer.read", (ctx) => Effect.gen(function* () {
      const url = new URL(ctx.request.url, "http://localhost")
      const query = yield* Schema.decodeUnknownEffect(TransferQuery)(Object.fromEntries(url.searchParams)).pipe(
        Effect.mapError(() => apiError(new Actions.ActionsError({ kind: "invalid_input", message: "Invalid Actions transfer query" }))),
      )
      const id = yield* Schema.decodeUnknownEffect(BindingID)(decodeURIComponent(url.pathname.split("/").at(-1) ?? "")).pipe(
        Effect.mapError(() => apiError(new Actions.ActionsError({ kind: "invalid_input", message: "Invalid Actions transfer binding" }))),
      )
      const actions = yield* Actions.Service
      const target = { kind: query.kind, id: query.id, runID: query.runID, attempt: query.attempt, path: query.path }
      const binding = { id, revision: query.revision }
      const info = yield* actions.transferInfo(binding, target).pipe(Effect.mapError(apiError))
      return HttpServerResponse.stream(actions.transfer(binding, target), {
        contentType: info.contentType,
        headers: { "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(info.filename)}`,
          ...(info.size === undefined ? {} : { "content-length": String(info.size) }) },
      })
    })),
```

## E081 — `packages/client/script/build.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `99ae2184b9c13f6175d7ba8e3025068bee07ee4f`; source lines 1–48. Applies to: s1.api.codegen.

```typescript
import { NodeFileSystem } from "@effect/platform-node"
import { compile, emitEffectImported, emitPromise, write } from "@orchestra/httpapi-codegen"
import { ClientApi, endpointNames, groupNames, omitEndpoints } from "../src/contract"
import { Effect } from "effect"
import { fileURLToPath } from "url"

const contract = compile(ClientApi, { groupNames, endpointNames, omitEndpoints })
const splitGroups = new Set([
  "research",
  "schedules",
  "actionsBindings",
  "actionsOperations",
  "actionsWorkflows",
  "actionsRuns",
  "actionsJobs",
  "actionsPipelines",
  "actionsResources",
  "actionsTransfers",
  "actionsSource",
])

await Effect.runPromise(
  Effect.all(
    [
      write(
        emitPromise(contract, {
          splitGroups,
          outputTypes: {
            "sessions.events": {
              name: "SessionEventEncoded",
              import: 'import type { SessionEventEncoded } from "../wire"',
            },
            "events.subscribe": {
              name: "OrchestraEventEncoded",
              import: 'import type { OrchestraEventEncoded } from "@orchestra/protocol/groups/event"',
            },
          },
        }),
        fileURLToPath(new URL("../src/generated", import.meta.url)),
      ),
      write(
        emitEffectImported(contract, { module: "../contract", api: "ClientApi" }, { splitGroups }),
        fileURLToPath(new URL("../src/generated-effect", import.meta.url)),
      ),
    ],
    { concurrency: 2, discard: true },
  ).pipe(Effect.provide(NodeFileSystem.layer)),
)
```

## E082 — `tooling/httpapi-codegen/src/index.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `0467e68001715795e0851cf5d8a8b3dad1d75126`; source lines 75–123. Applies to: s1.api.codegen.

```typescript
export function compile<Id extends string, Groups extends HttpApiGroup.Any>(
  api: HttpApi.HttpApi<Id, Groups>,
  options?: {
    readonly groupNames?: Readonly<Record<string, string>>
    readonly endpointNames?: Readonly<Record<string, string>>
    readonly omitEndpoints?: ReadonlySet<string>
  },
): Contract {
  const endpoints: Array<Endpoint> = []
  const portable = new Map<SchemaAST.AST, boolean>()

  HttpApi.reflect(api, {
    onGroup() {},
    onEndpoint({ endpoint, errors, group, middleware }) {
      if (options?.omitEndpoints?.has(endpoint.name)) return
      const groupName = options?.groupNames?.[group.identifier] ?? group.identifier
      const name = `${groupName}.${endpoint.name}`
      const required = Array.from(middleware).find((item) => item.requiredForClient)
      if (required !== undefined) {
        throw new GenerationError({ reason: `Client middleware requires adapter: ${required.key}` })
      }

      const successSchemas = Array.from(endpoint.success)
      if (successSchemas.length === 0) successSchemas.push(HttpApiSchema.NoContent)
      if (successSchemas.length > 1) throw new GenerationError({ reason: `Multiple success schemas: ${name}` })

      const params = normalizeTransport(endpoint.params, "params", endpoint, name)
      const query = normalizeTransport(endpoint.query, "query", endpoint, name)
      const headers = normalizeTransport(endpoint.headers, "headers", endpoint, name)
      const sourcePayloads = Array.from(endpoint.payload.values()).flatMap(({ schemas }) => schemas)
      if (sourcePayloads.length > 1) {
        throw new GenerationError({ reason: `Multiple payload schemas: ${name}` })
      }
      const payloads = sourcePayloads.map((schema) => normalizeTransport(schema, "payload", endpoint, name)!)
      const success = normalizeTransport(successSchemas[0], "success", endpoint, name)!
      const errorSchemas = Array.from(errors).flatMap(([status, schemas]) =>
        schemas.map((schema) => ({ status, ...normalizeTransport(schema, "error", endpoint, name)! })),
      )
      const inputs = [
        ...inputFields(params?.schema, "params", name),
        ...inputFields(query?.schema, "query", name),
        ...inputFields(headers?.schema, "headers", name),
        ...payloads.flatMap((item) => inputFields(item.schema, "payload", name)),
      ]
      const names = new Set<string>()
      for (const field of inputs) {
        if (names.has(field.name)) throw new GenerationError({ reason: `Input field collision: ${field.name}` })
        names.add(field.name)
      }
```

## E083 — `tooling/httpapi-codegen/src/index.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `0467e68001715795e0851cf5d8a8b3dad1d75126`; source lines 140–164. Applies to: s1.api.codegen.

```typescript

      endpoints.push({
        group: groupName,
        sourceGroup: group.identifier,
        topLevel: group.topLevel,
        endpoint,
        params: params?.schema,
        query: query?.schema,
        headers: headers?.schema,
        payloads: payloads.map((item) => item.schema),
        input: inputs,
        unwrapData: isDataEnvelope(success.schema),
        binary: resolveHttpApiEncoding(success.schema.ast)?._tag === "Uint8Array",
        successes: [success.schema],
        errors: errorSchemas.map((item) => ({ status: item.status, schema: item.schema })),
        effectPortable,
        operation: {
          group: groupName,
          name: options?.endpointNames?.[endpoint.name] ?? clientEndpointName(endpoint.name),
          input: inputs.map(({ name, source }) => ({ name, source })),
          inputMode: inputs.length === 0 ? "none" : inputs.every((field) => field.optional) ? "optional" : "required",
          success: isStreamSchema(success.schema)
            ? "stream"
            : HttpApiSchema.isNoContent(success.schema.ast)
              ? "void"
```

## E084 — `tooling/httpapi-codegen/src/index.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `0467e68001715795e0851cf5d8a8b3dad1d75126`; source lines 178–219. Applies to: s1.api.codegen.

```typescript
  })

  const modules = new Set(["client", "client-error", "index", "request", "errors", "types"])
  const groups = Array.from(
    Map.groupBy(endpoints, (endpoint) => endpoint.group),
    ([identifier, endpoints], index) => {
      if (new Set(endpoints.map((endpoint) => endpoint.sourceGroup)).size > 1) {
        throw new GenerationError({ reason: `Client group name collision: ${identifier}` })
      }
      const base = /^[A-Za-z0-9_-]+$/.test(identifier) ? identifier : `group-${index}`
      const module = uniqueModule(base, index, modules)
      modules.add(module.toLowerCase())
      modules.add(`${module}-types`.toLowerCase())
      return { identifier, sourceIdentifier: endpoints[0].sourceGroup, module, endpoints }
    },
  )
  const publicNames = new Set<string>()
  for (const group of groups) {
    const endpointNames = new Set<string>()
    for (const endpoint of group.endpoints) {
      if (endpointNames.has(endpoint.operation.name)) {
        throw new GenerationError({
          reason: `Client endpoint name collision: ${group.identifier}.${endpoint.operation.name}`,
        })
      }
      endpointNames.add(endpoint.operation.name)
    }
    const names = group.endpoints[0]?.topLevel ? group.endpoints.map((item) => item.operation.name) : [group.identifier]
    for (const name of names) {
      if (publicNames.has(name)) throw new GenerationError({ reason: `Client name collision: ${name}` })
      publicNames.add(name)
    }
  }
  return {
    groups,
  }
}

export function emitEffect(contract: Contract): Output {
  const endpoint = contract.groups.flatMap((group) => group.endpoints).find((endpoint) => !endpoint.effectPortable)
  if (endpoint !== undefined) {
    throw new GenerationError({
```

## E085 — `tooling/httpapi-codegen/src/index.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `0467e68001715795e0851cf5d8a8b3dad1d75126`; source lines 318–354. Applies to: s1.api.codegen.

```typescript
function assertPromiseEndpoint(endpoint: Endpoint) {
  const name = `${endpoint.group}.${endpoint.endpoint.name}`
  const payload = endpoint.payloads[0]
  const payloadEncoding = payload === undefined ? undefined : resolveHttpApiEncoding(payload.ast)
  if (
    payload !== undefined &&
    (payloadEncoding?._tag ?? (HttpMethod.hasBody(endpoint.endpoint.method) ? "Json" : "FormUrlEncoded")) !== "Json"
  ) {
    throw new GenerationError({ reason: `Unsupported Promise payload encoding: ${name}` })
  }
  const success = endpoint.successes[0]
  const successEncoding = resolveHttpApiEncoding(success.ast)?._tag ?? "Json"
  if (isStreamSchema(success)) {
    if (
      success._tag !== "StreamSse" ||
      success.sseMode !== "data" ||
      !SchemaAST.isNever(Schema.toType(success.error).ast)
    ) {
      throw new GenerationError({ reason: `Unsupported Promise stream: ${name}` })
    }
  } else if (
    !HttpApiSchema.isNoContent(success.ast) &&
    successEncoding !== "Json" &&
    successEncoding !== "Uint8Array"
  ) {
    throw new GenerationError({ reason: `Unsupported Promise success encoding: ${name}` })
  }
  if (successEncoding === "Uint8Array") endpoint.binary = true
  for (const error of endpoint.errors) {
    if (declaredErrorFields(error.schema) === undefined) {
      throw new GenerationError({ reason: `Promise error must have a literal discriminator: ${name}` })
    }
    if ((resolveHttpApiEncoding(error.schema.ast)?._tag ?? "Json") !== "Json") {
      throw new GenerationError({ reason: `Unsupported Promise error encoding: ${name}` })
    }
  }
}
```

## E086 — `tooling/httpapi-codegen/src/index.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `0467e68001715795e0851cf5d8a8b3dad1d75126`; source lines 687–745. Applies to: s1.api.codegen.

```typescript
export function write(
  output: Output,
  directory: string,
): Effect.Effect<void, GenerationError | PlatformError.PlatformError, FileSystem.FileSystem> {
  return Effect.gen(function* () {
    const files = yield* Effect.tryPromise({
      try: () => formatFiles(output.files),
      catch: (error) => (error instanceof GenerationError ? error : new GenerationError({ reason: String(error) })),
    })
    const paths = new Set<string>()
    const normalizedPaths = new Set<string>()
    for (const file of files) {
      if (!isSafeOutputPath(file.path)) yield* new GenerationError({ reason: `Unsafe output path: ${file.path}` })
      const path = file.path.toLowerCase()
      if (normalizedPaths.has(path)) yield* new GenerationError({ reason: `Duplicate output path: ${file.path}` })
      normalizedPaths.add(path)
      paths.add(file.path)
    }
    const fs = yield* FileSystem.FileSystem
    yield* fs.makeDirectory(directory, { recursive: true })
    const manifest = join(directory, manifestName)
    const previous = (yield* fs.exists(manifest))
      ? yield* fs.readFileString(manifest).pipe(
          Effect.flatMap(Schema.decodeUnknownEffect(Manifest)),
          Effect.mapError(() => new GenerationError({ reason: `Invalid generated file manifest: ${manifest}` })),
        )
      : []
    if (previous.some((path) => !isSafeOutputPath(path))) {
      yield* new GenerationError({ reason: `Invalid generated file manifest: ${manifest}` })
    }
    yield* Effect.forEach(
      previous.filter((path) => !paths.has(path)),
      (path) => fs.remove(join(directory, path), { force: true }),
      { concurrency: 8, discard: true },
    )
    yield* Effect.forEach(
      files,
      (file) =>
        fs.exists(join(directory, file.path)).pipe(
          Effect.flatMap((exists) => (exists ? fs.stat(join(directory, file.path)) : Effect.succeed(undefined))),
          Effect.flatMap((info) =>
            info?.type === "SymbolicLink"
              ? new GenerationError({ reason: `Unsafe output path: ${file.path}` })
              : Effect.void,
          ),
        ),
      { concurrency: 8, discard: true },
    )
    yield* Effect.forEach(files, (file) => fs.writeFileString(join(directory, file.path), file.content), {
      concurrency: 8,
      discard: true,
    })
    yield* fs.writeFileString(manifest, JSON.stringify(files.map((file) => file.path).sort(), null, 2) + "\n")
  })
}

function isSafeOutputPath(path: string) {
  return path !== manifestName && !isAbsolute(path) && path !== "." && path !== ".." && !/[\\/]/.test(path)
}
```

## E087 — `tooling/httpapi-codegen/src/index.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `0467e68001715795e0851cf5d8a8b3dad1d75126`; source lines 757–778. Applies to: s1.api.codegen.

```typescript
function inputFields(schema: Schema.Top | undefined, source: InputField["source"], operation: string) {
  if (schema === undefined) return []
  const ast = Schema.toType(schema).ast
  if (!SchemaAST.isObjects(ast) || ast.indexSignatures.length > 0) {
    throw new GenerationError({ reason: `Input schema must be a struct: ${operation}.${source}` })
  }
  return ast.propertySignatures.map((field) => {
    if (typeof field.name !== "string") {
      throw new GenerationError({ reason: `Input field must have a string name: ${operation}.${source}` })
    }
    return {
      name: field.name,
      source,
      optional: SchemaAST.isOptional(field.type),
    }
  })
}

function responseSchemas(schema: Schema.Top, path: string): Array<readonly [string, Schema.Top]> {
  if (HttpApiSchema.isNoContent(schema.ast)) return []
  if (!isStreamSchema(schema)) return [[path, schema]]
  if (schema._tag === "StreamUint8Array") return []
```

## E088 — `tooling/httpapi-codegen/src/index.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `0467e68001715795e0851cf5d8a8b3dad1d75126`; source lines 946–955. Applies to: s1.api.codegen.

```typescript
function isDataEnvelope(schema: Schema.Top) {
  if (isStreamSchema(schema) || HttpApiSchema.isNoContent(schema.ast)) return false
  const ast = Schema.toType(schema).ast
  return (
    SchemaAST.isObjects(ast) &&
    ast.indexSignatures.length === 0 &&
    ast.propertySignatures.length === 1 &&
    ast.propertySignatures[0]?.name === "data"
  )
}
```

## E089 — `tooling/httpapi-codegen/src/imported-effect.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `6434e356b20197746aa9f0bbd5727ab80dcdd831`; source lines 35–42. Applies to: s1.api.codegen, s1.api.client-projection.

```typescript
        .join("; ")
      const argument =
        item.operation.inputMode === "none"
          ? ""
          : `input${item.operation.inputMode === "optional" ? "?" : ""}: ${prefix}Input`
      const rawCall = `raw[${JSON.stringify(item.endpoint.name)}]({ ${request} })`
      const mapped = `${rawCall}.pipe(Effect.mapError(mapClientError)${item.unwrapData ? ", Effect.map((value) => value.data)" : ""})`
      return `${item.operation.inputMode === "none" ? "" : `type ${prefix}Request = Parameters<${rawGroup}[${JSON.stringify(item.endpoint.name)}]>[0]\ntype ${prefix}Input = { ${input} }\n`}const ${prefix} = (raw: ${rawGroup}) => (${argument}) => ${item.operation.success === "stream" ? `Stream.unwrap(${rawCall}.pipe(Effect.mapError(mapClientError), Effect.map((stream) => stream.pipe(Stream.mapError(mapClientError)))))` : mapped}`
```

## E090 — `tooling/httpapi-codegen/src/imported-effect.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `6434e356b20197746aa9f0bbd5727ab80dcdd831`; source lines 51–64. Applies to: s1.api.codegen, s1.api.client-projection.

```typescript
  const imported = "api" in options
  const projection = imported
    ? undefined
    : "group" in options
      ? { imports: [options.group], source: `const Api = HttpApi.make("generated").add(${options.group})\n\n` }
      : renderImportedProjection(groups, options.endpoints)
  const api = imported ? options.api : "Api"
  const imports =
    projection === undefined
      ? `import { ${api} } from ${JSON.stringify(options.module)}`
      : `import { HttpApi, HttpApiClient${"endpoints" in options ? ", HttpApiGroup" : ""} } from "effect/unstable/httpapi"\nimport { ${projection.imports.join(", ")} } from ${JSON.stringify(options.module)}`
  const httpApiImport = projection === undefined ? 'import { HttpApiClient } from "effect/unstable/httpapi"\n' : ""
  const usesStream = groups.some((group) => group.endpoints.some((item) => item.operation.success === "stream"))
  const mapper = `const mapClientError = <E>(error: E) => HttpClientError.isHttpClientError(error) || Schema.isSchemaError(error) || Sse.Retry.is(error) ? new ClientError({ cause: error }) : error`
```

## E091 — `tooling/httpapi-codegen/src/effect-headers.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `e2e2c1da3504df7c8080aa2a9efe31d00816f92c`; source lines 1–34. Applies to: s1.api.codegen, s1.api.client-projection.

```typescript
export function renderEffectMake(api: string) {
  return `export const make = (options?: { readonly baseUrl?: URL | string; readonly headers?: Readonly<Record<string, string>> }) => {
  if (options?.headers === undefined) return HttpApiClient.make(${api}, options).pipe(Effect.map(adaptClient))
  // Snapshot and validate host configuration now, before this Effect can be executed or reused.
  const headers = snapshotHeaders(options.headers)
  if (Object.keys(headers).length === 0) return HttpApiClient.make(${api}, options).pipe(Effect.map(adaptClient))
  // Fetch must supply the multipart boundary; only explicit request headers may override it.
  const formHeaders = Object.fromEntries(Object.entries(headers).filter(([name]) => name !== "content-type"))
  return HttpApiClient.make(${api}, {
    baseUrl: options.baseUrl,
    transformClient: (client) => HttpClient.mapRequest(client, (request) =>
      HttpClientRequest.setHeaders(request, { ...(request.body._tag === "FormData" ? formHeaders : headers), ...request.headers })),
  }).pipe(Effect.map(adaptClient))
}

function snapshotHeaders(input: Readonly<Record<string, string>>) {
  if (typeof input !== "object" || input === null ||
    (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null)) {
    throw new TypeError("Invalid client headers")
  }
  const entries = Object.entries(Object.getOwnPropertyDescriptors(input)).flatMap(([name, descriptor]) => {
    if (!/^[!#$%&'*+.^_|~0-9A-Za-z\\x60-]+$/.test(name) || !("value" in descriptor) ||
      typeof descriptor.value !== "string" || /[\\r\\n]/.test(descriptor.value)) {
      throw new TypeError("Invalid client headers")
    }
    return descriptor.enumerable ? [[name, descriptor.value] as const] : []
  })
  try {
    return Object.freeze(Object.fromEntries(new Headers(Object.fromEntries(entries))))
  } catch (error) {
    if (error instanceof TypeError) throw new TypeError("Invalid client headers")
    throw error
  }
}`
```

## E092 — `tooling/httpapi-codegen/src/layout.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `b14d3a3f669e096c4e72d1fd2ad65ed8c483826f`; source lines 93–113. Applies to: s1.api.codegen.

```typescript
export async function formatFile(file: Output["files"][number]) {
  const formatted = await format(file.content, {
    filepath: file.path,
    parser: "typescript",
    semi: false,
    printWidth: 120,
  })
  if (!file.boundedTypes || physicalLines(formatted) <= 400) return [{ path: file.path, content: formatted }]
  const ast: unknown = Reflect.apply(parsers.typescript.parse, undefined, [formatted, {}])
  if (!isNode(ast) || !Array.isArray(ast.body)) {
    throw new GenerationError({ reason: `Invalid bounded type layout: ${file.path}` })
  }
  const statements = ast.body.filter(isNode)
  const imports = statements.filter((node) => node.type === "ImportDeclaration")
  const declarations = statements.filter((node) => node.type !== "ImportDeclaration")
  if (
    !declarations.length ||
    declarations.some((node) => !isNode(node.declaration) || node.declaration.type !== "TSTypeAliasDeclaration")
  ) {
    throw new GenerationError({ reason: `Bounded type layout requires exported aliases: ${file.path}` })
  }
```

## E093 — `tooling/httpapi-codegen/src/layout.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `b14d3a3f669e096c4e72d1fd2ad65ed8c483826f`; source lines 146–161. Applies to: s1.api.codegen.

```typescript
  // One provisional owner per declaration conservatively includes every possible cross-part import.
  const provisional = new Map(names.map((name, index) => [name, `${stem}-part-${index + 1}`]))
  const parts: Array<Array<Record<string, unknown>>> = [[]]
  for (const node of declarations) {
    const current = parts[parts.length - 1]
    const candidate = await print(render([...current, node], provisional))
    if (physicalLines(candidate) <= 350) {
      current.push(node)
      continue
    }
    const single = await print(render([node], provisional))
    if (physicalLines(single) > 400) {
      throw new GenerationError({
        reason: `Promise declaration exceeds 400 lines: ${file.path}:${declarationName(node)}`,
      })
    }
```

## E094 — `tooling/httpapi-codegen/src/layout.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `b14d3a3f669e096c4e72d1fd2ad65ed8c483826f`; source lines 180–190. Applies to: s1.api.codegen.

```typescript
      parts
        .map(
          (nodes, index) =>
            `export type { ${nodes.map(declarationName).join(", ")} } from "./${stem}-part-${index + 1}"`,
        )
        .join("\n"),
    ),
  })
  const oversized = files.find((part) => physicalLines(part.content) > 400)
  if (oversized) throw new GenerationError({ reason: `Promise type layout exceeds 400 lines: ${oversized.path}` })
  return files
```

## E095 — `packages/client/src/generated/.httpapi-codegen.json`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `190f92c2c10e6b0126e10ef23b217ef33688dd68`; source lines 1–42. Applies to: s1.api.codegen, s1.api.surface-disposition.

```json
[
  "actionsBindings-types.ts",
  "actionsBindings.ts",
  "actionsJobs-types-part-1.ts",
  "actionsJobs-types-part-2.ts",
  "actionsJobs-types.ts",
  "actionsJobs.ts",
  "actionsOperations-types-part-1.ts",
  "actionsOperations-types-part-2.ts",
  "actionsOperations-types.ts",
  "actionsOperations.ts",
  "actionsPipelines-types.ts",
  "actionsPipelines.ts",
  "actionsResources-types-part-1.ts",
  "actionsResources-types-part-2.ts",
  "actionsResources-types.ts",
  "actionsResources.ts",
  "actionsRuns-types-part-1.ts",
  "actionsRuns-types-part-2.ts",
  "actionsRuns-types-part-3.ts",
  "actionsRuns-types-part-4.ts",
  "actionsRuns-types.ts",
  "actionsRuns.ts",
  "actionsSource-types.ts",
  "actionsSource.ts",
  "actionsTransfers-types.ts",
  "actionsTransfers.ts",
  "actionsWorkflows-types-part-1.ts",
  "actionsWorkflows-types-part-2.ts",
  "actionsWorkflows-types.ts",
  "actionsWorkflows.ts",
  "client-error.ts",
  "client.ts",
  "errors.ts",
  "index.ts",
  "request.ts",
  "research-types.ts",
  "research.ts",
  "schedules-types.ts",
  "schedules.ts",
  "types.ts"
]
```

## E096 — `packages/client/src/generated-effect/.httpapi-codegen.json`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `4caf4225fe4d24c569bcdc5b4c4310580cea4bbb`; source lines 1–16. Applies to: s1.api.codegen, s1.api.surface-disposition.

```json
[
  "actionsBindings.ts",
  "actionsJobs.ts",
  "actionsOperations.ts",
  "actionsPipelines.ts",
  "actionsResources.ts",
  "actionsRuns.ts",
  "actionsSource.ts",
  "actionsTransfers.ts",
  "actionsWorkflows.ts",
  "client-error.ts",
  "client.ts",
  "index.ts",
  "research.ts",
  "schedules.ts"
]
```

## E097 — `packages/sdk-next/src/orchestra.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `0a8009ba9ac8d51b0a0c27363786176479dc8532`; source lines 1–59. Applies to: s1.api.sdk-composition.

```typescript
import { Orchestra } from "@orchestra/client/effect"
import { ClaudeCodeAccount } from "@orchestra/core/claude-code-account"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { PermissionSaved } from "@orchestra/core/permission/saved"
import { ApplicationTools } from "@orchestra/core/tool/application-tools"
import { createEmbeddedRoutes } from "@orchestra/server/routes"
import { Principal } from "@orchestra/server/principal"
import { CapabilityOperator } from "@orchestra/core/capability/operator/index"
import { Context, Effect, Layer, Scope } from "effect"
import { FetchHttpClient, HttpRouter, HttpServer } from "effect/unstable/http"
import { makeOperatorTransport } from "./operator-transport"

export const create = Effect.fn("Orchestra.create")(function* () {
  const scope = yield* Scope.Scope
  const memoMap = yield* Layer.makeMemoMap
  const context = yield* Layer.buildWithMemoMap(
    AppNodeBuilder.build(LayerNode.group([ApplicationTools.node, PermissionSaved.node, ClaudeCodeAccount.node])),
    memoMap,
    scope,
  )
  const tools = Context.get(context, ApplicationTools.Service)
  const permissions = Context.get(context, PermissionSaved.Service)
  const account = Context.get(context, ClaudeCodeAccount.Service)
  const operator = yield* CapabilityOperator.make({ principal: Principal.account(),
    scope: { placements: "instance", actions: ["*"] } }).pipe(Effect.orDie)
  const web = yield* Effect.acquireRelease(
    Effect.sync(() =>
      HttpRouter.toWebHandler(
        createEmbeddedRoutes({ operator }).pipe(
          HttpRouter.provideRequest(
            Layer.mergeAll(
              Layer.succeed(PermissionSaved.Service, permissions),
              Layer.succeed(ClaudeCodeAccount.Service, account),
            ),
          ),
          Layer.provide(HttpServer.layerServices),
        ),
        { disableLogger: true, memoMap },
      ),
    ),
    (web) => Effect.promise(web.dispose),
  )
  const transport = yield* makeOperatorTransport(web.handler, operator).pipe(Effect.orDie)
  const client = yield* Orchestra.make({ baseUrl: "http://orchestra.local", headers: transport.headers }).pipe(
    Effect.provide(FetchHttpClient.layer),
    Effect.provideService(FetchHttpClient.Fetch, transport.fetch),
  )
  return {
    ...client,
    tools: { register: tools.register },
  }
})

export type Interface = Effect.Success<ReturnType<typeof create>>

export class Service extends Context.Service<Service, Interface>()("@orchestra/sdk-next/Orchestra") {}

export const layer = Layer.effect(Service, create())
```

## E098 — `packages/sdk-next/src/operator-transport.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `ef67f666b8ef7a94c270058903d1f8ecf34abbf0`; source lines 1–28. Applies to: s1.api.sdk-composition.

```typescript
import type { CapabilityOperatorContract } from "@orchestra/core/capability/operator/contract"
import { Effect, Exit, Semaphore } from "effect"

/** Owning host transport: bearer renewal never delegates authority to request bodies or foreign headers. */
export const makeOperatorTransport = Effect.fn("Orchestra.makeOperatorTransport")(function* (
  handler: (request: Request) => Promise<Response>, operator: CapabilityOperatorContract.Interface,
) {
  const first = yield* operator.issue({ origin: "sdk" })
  const current = { credential: first }
  const renewal = Semaphore.makeUnsafe(1)
  const fetch = Object.assign((input: RequestInfo | URL, init?: RequestInit) => Effect.runPromise(Effect.gen(function* () {
    const request = new Request(input, init)
    // Preserve explicit per-request credentials. Only our captured default is eligible for host renewal.
    if (request.headers.get("authorization") !== `Bearer ${first.bearer}`) return yield* Effect.promise(() => handler(request))
    const credential = yield* renewal.withPermit(Effect.gen(function* () {
      const authenticated = yield* operator.authenticate(current.credential.bearer).pipe(Effect.exit)
      if (Exit.isSuccess(authenticated)) return current.credential
      if (!authenticated.cause.reasons.length || !authenticated.cause.reasons.every((reason) => reason._tag === "Fail" &&
        reason.error._tag === "Capability.Failure" && reason.error.code === "authentication_required"))
        return yield* Effect.failCause(authenticated.cause)
      current.credential = yield* operator.issue({ origin: "sdk" })
      return current.credential
    }))
    request.headers.set("authorization", `Bearer ${credential.bearer}`)
    return yield* Effect.promise(() => handler(request))
  })), { preconnect: () => undefined }) satisfies typeof globalThis.fetch
  return { fetch, headers: Object.freeze({ Authorization: `Bearer ${first.bearer}` }) }
})
```

## E099 — `packages/server/src/routes.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `75b0f9753e4c879767ef186f5003519e2b681025`; source lines 89–112. Applies to: s1.api.sdk-composition, s1.api.server-edge.

```typescript
  /** Replaces the capability operator; tests and sdk-next embed their own. */
  readonly operator?: CapabilityOperatorContract.Interface
  /** Replaces the capability setup verifier; tests avoid vendor calls with it. */
  readonly verifier?: CapabilityConnectionSetupContract.Verifier
}

export function createRoutes(options: Options = {}) {
  return makeRoutes(
    options.password
      ? ServerAuth.Config.configLayer({ username: "orchestra", password: Option.some(options.password) })
      : ServerAuth.Config.layer,
    options,
  )
}

export function createEmbeddedRoutes(options: Pick<Options, "host" | "operator" | "verifier"> = {}) {
  return makeRoutes(ServerAuth.Config.configLayer({ username: "orchestra", password: Option.none() }), options)
}

function makeRoutes<AuthError, AuthServices>(
  auth: Layer.Layer<ServerAuth.Config, AuthError, AuthServices>,
  options: Omit<Options, "password">,
) {
  const merged = Host.merge(options.host ?? [])
```

