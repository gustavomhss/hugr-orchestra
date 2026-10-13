# Core

`@orchestra/core` provides reusable platform and domain services used by the
application and server layers. It includes the canonical v2 Session admission,
storage, and local execution services; Location-scoped capabilities; provider,
tool, configuration, plugin, and platform adapters; and database migrations.

Runtime dependencies flow from Schema to Core and Protocol, then from Core and
Protocol to Server. Product-specific composition remains in its owning package;
legacy Orchestra continues to coexist with the V2 services.

## Package entrypoints

There is no bare `@orchestra/core` export. The package exports these explicit
subpaths:

- `@orchestra/core/effect/layer-node`
- `@orchestra/core/effect/app-node`
- `@orchestra/core/session/runner`
- `@orchestra/core/system-context`
- `@orchestra/core/backend-toolkit`

The package map also provides `@orchestra/core/*`, which resolves to matching
modules under `src/`. Check `packages/core/package.json` for the current map
before relying on a subpath. Namespace imports should use the names actually
exported by a module, such as `SessionExecution` or `SystemContext`.

## Sessions and Locations

`SessionV2.prompt(...)` admits a durable input before requesting execution.
Unless `resume: false` is supplied, it then schedules an advisory
`SessionExecution.wake(sessionID)`. Setting `resume: false` is admit-only: it
does not discard the input or request execution. The serialized runner later
promotes admitted inputs at safe provider-turn boundaries.

`SessionExecution` is process-global and keyed by Session ID. Its local
implementation looks up the Session and obtains services for the Session's
Location when a drain starts. `SessionRunner`, model resolution, tool
registry, permissions, and filesystem services are Location-scoped. Local
drains and coordination remain process-local.

## Service and data ownership

- `src/session/` owns v2 Session storage, event projection, durable input
  admission, history, context epochs, and the runner interfaces.
- `src/location.ts`, `src/location-services.ts`, and
  `src/location-service-map.ts` define Location identity and scoped services.
- `src/provider.ts`, `src/model.ts`, `src/tool/`, `src/config/`, and
  `src/plugin/` contain provider/model, tool, configuration, and plugin
  services and adapters.
- `src/effect/` and `src/*` platform adapters provide the application node,
  filesystem, process, and runtime building blocks.
- `src/database/` owns SQLite setup, generated schema, and ordered TypeScript
  migrations. `src/database/migration.gen.ts` registers migration modules;
  migration source files live in `src/database/migration/`.
- Bundled prompt and command text is kept beside its owner, including
  `src/agent/prompt/` and `src/plugin/command/`. Backend toolkit packs and
  generated entry skills live under `src/backend-toolkit/`.

`Global.Path` defines existing data, cache, config, state, temporary, log,
binary, and repository roots. Database path selection and migration history
are existing data contracts.

## Development

Run the package-local typecheck from `packages/core`:

```sh
bun typecheck
```

After changing the public Protocol or Server `HttpApi`, regenerate the client
from `packages/client` with `bun run generate`. Do not edit generated client
files directly.
