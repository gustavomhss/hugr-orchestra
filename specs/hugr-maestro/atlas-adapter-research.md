# Atlas Adapter Research

Status: current adapter implemented in the `maestro-grounding` worktree; landing pending. Original seam research below records the 2026-09-08 blocker. Current contract and operation: `grounding-boundary.md`.

## Verified Source

| Need                         | Source                                                                         | Result                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Canonical territory identity | `foundation/atlas/packages/contracts/src/territory.ts`                         | `Territory.name` is governance key; path/glob is not consumer scope identity                        |
| Single territory pack        | `foundation/atlas/packages/retrieval/src/pack.ts:105-115,224-231`              | `Packer.pack(Territory)` returns `BoundedPack` with axis hash, freshness, truncation, tail          |
| Shared-scope pack            | `foundation/atlas/packages/retrieval/src/pack.ts:234-245`                      | `Packer.mergedPack(Territory[])` enforces one shared `PACK_CAP` budget                              |
| Cap source                   | `foundation/atlas/packages/retrieval/src/pack.ts:50-65,130-134`                | `capFor('pack')` is current budget authority                                                        |
| Empty scope behavior         | `foundation/atlas/packages/retrieval/src/pack.ts:204-206,234-241`              | uncovered/malformed scope returns empty total pack; it is not `UN-SEEDED`                           |
| Package boundary             | root `package.json`; `foundation/atlas/package.json`; retrieval `package.json` | Atlas is nested independent workspace; no `@atlas/*` dependency/export exists in OpenCode workspace |

## Blocker

ACE requires a catalog address/version resolving `Territory.name` exactly once. Current measured retrieval starts only at
`Packer.pack(Territory)`: it has no project-scoped catalog interface. OpenCode cannot obtain canonical `Territory`
objects or version without either:

1. A frozen Atlas catalog read API exported through installed package/runtime boundary.
2. A versioned read-only Atlas service client with exact catalog response contract.

Direct relative import from `foundation/atlas`, copying `Territory` into OpenCode, path/glob lookup, or creating an
OpenCode catalog store would violate ACE and `atlas-foundation-seam-register.md`.

## Required Next Contract

Atlas owner must expose read-only `territoryCatalog(projectId)`:

```text
{ projectId, catalogVersion, territories: readonly Territory[] }
```

Required properties:

1. One `Territory.name` resolves once; duplicate names reject at source.
2. Catalog version is immutable address for one response.
3. Returned `Territory` objects are valid inputs to `Packer.pack` and `Packer.mergedPack`.
4. No write, shell, network, model, or ambient current-project inference.

After this contract exists as an installable/current Atlas seam, implement ACE-1 through ACE-9 in OpenCode adapter.
