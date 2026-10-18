# Maestro Arsenal

Maestro's existing tool catalog and host-authorized operations. Public package identity remains
`@orchestra/maestro-arsenal`; physical placement is `modules/maestro/arsenal`.

## Boundaries and consumers

- `@orchestra/maestro-arsenal` exports the registry, shared contracts, symbol extraction, preferences
  snapshot, host snapshot validation and process-runner binding. `./server` exposes the MCP adapter.
- Core and Orchestra bind native authority and host observations. This module does not own Session
  execution, Core data roots, model permissions or the Relay completion evaluator.
- State roots and project identity come from the caller. Keep existing state/cache keys when moving
  source directories; state must remain outside the source repository.
- Tree-sitter native grammars and the parser worker are runtime assets. Source/package-relative
  lookup and compiled-binary placement have distinct delivery contracts.

The canonical integration semantics, persistence limits and verification scope live in
[governance/HOST-BINDINGS.md](src/governance/HOST-BINDINGS.md). The current port contract is
[arsenal-port.md](../../../specs/hugr-maestro/arsenal-port.md). Source attribution remains in
`LICENSE`, `NOTICE` and the adaptation traces.

## Development

Run `bun typecheck` from this directory. The hosted selector remains stable from the repository root:

```sh
bun run test:ci maestro-arsenal test/registry.test.ts test/resource-authority.test.ts
```

Focused tests cover registry identity, lazy handlers, native authority and source-relative fixtures.
Native grammar builds, ARM delivery and compiled CLI/desktop qualification use their existing
repository lanes; a local source check does not qualify those artifacts.
