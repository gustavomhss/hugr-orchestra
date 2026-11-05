---
name: omni-adoption-maintenance
description: Guides Core adoption of hugr-omni process spawning, loader and test controls. Use when changing packages/core/src/omni.ts, ChildProcessSpawner/Process integration, omni flags or allowlist adoption; native-engine implementation has a separate owner.
---

# Omni adoption maintenance

## Ownership map

| Surface | Owner | Boundary |
| --- | --- | --- |
| Core loader and helpers | `packages/core/src/omni.ts` | Only Core bridge importing `hugr-omni`; lazy load and binary pair location. |
| Effect process bridge | `ChildProcessSpawner` / `Process` callers | Adoption into Core; consult actual implementation/callers. |
| Exceptions | `script/spawn-allowlist.json` | Source of truth for sites still outside omni. |
| Native engine | `native/omni` | Addon/supervisor implementation, build and platform guarantees. |
| Desktop/Linux adapters | Their owning packages | Separate adoption surfaces; not implied by Core adoption. |

The loader dynamically imports only on demand. `configure()` must precede first `load()`; when requested, missing addon/supervisor fails loudly rather than silently falling back. Location candidates and pairing rules are in `Omni.locate`. Do not assume a process environment mutation under Bun reaches native code; the loader documents the process-start environment constraint. The flag parser accepts `1` and `strict` as enabled modes; `0`/unset are legacy/off, and invalid spellings do not mean enabled.

The test positive control is evidence of actual use, not a claim that a code path is covered merely because the flag is set. In strict mode delegation fails the control. Keep that test meaning distinct from engine implementation readiness or packaged binary availability.

## Safe changes

- Route Core integration through `packages/core/src/omni.ts`; do not import `hugr-omni` elsewhere in Core.
- Check addon and supervisor together, including injected/explicit paths, before changing packaging assumptions.
- Update `script/spawn-allowlist.json` only when the specific exception changes; use `bun run check:spawn-imports` guidance in the repo rules rather than inventing allowlist entries.
- Distinguish core adoption from desktop main, app/Linux dock, MCP, and native engine work; hand off to their named owners rather than expanding this scope.
- Existing witnesses: `packages/core/test/omni-loader.test.ts` (flag, location, positive-control helpers) and `packages/core/test/effect/omni-spawner-output.test.ts` (Effect output behavior). These are source pointers, not test-run claims.
- For native behavior, consult `native/omni/docs/orchestra-integration.md` and its current code/guarantees; a plan document alone does not prove implementation readiness.

## Source trail

- `packages/core/src/omni.ts` — lazy loader, path selection, control counters and environment helper.
- `packages/core/src/flag/flag.ts` — runtime flag parser/reader.
- `script/spawn-allowlist.json` — declared exceptions.
- `native/omni/docs/orchestra-integration.md` — integration decisions and boundaries; verify current implementation before relying on plan statements.
- `packages/core/test/omni-loader.test.ts`, `packages/core/test/effect/omni-spawner-output.test.ts` — relevant named witnesses.
