# `atlas territory`

Declare one territory — a named set of globs with its owner and criticality tier — in `TERRITORY-CATALOG.json`, the
committed catalog Orchestra's Maestro verifies before governed work. The file's version is a hash of its content, so
a hand edit makes every host read hold; this command is the way to change it. It writes through
`publishTerritoryCatalog`, which owns the territory's definition, validation and version.

This page describes the **CLI** command `atlas territory`. It is CLI-only (not an MCP tool). It is not
[`atlas territories`](./territories.md), the read-only off-atlas calibration ledger.

## Invocation

```
atlas territory <name> <glob...> --owner <seat> --tier <T0|T1|T2> [--project <id>]
```

- `<name>` — required. A territory with this name is REPLACED in place (declaration order is the overlap tie-break,
  so it keeps its position); a new name is appended.
- `<glob...>` — at least one glob, e.g. `packages/api/**`.
- `--owner <seat>` — required. The seat id that owns the territory.
- `--tier <T0|T1|T2>` — required. The criticality tier. It is human-ratified, so the command needs
  `ATLAS_RATIFY_TOKEN` to name a ratifier, and a `T0` territory needs `ATLAS_RATIFY_TOKEN=billy` (the same rule as a
  `T0` fact).
- `--project <id>` — required only when no catalog exists yet: the Orchestra project id the catalog is for. With a
  catalog present it must match the catalog's own project id, or be left out.

The catalog is `TERRITORY-CATALOG.json` at the repository root (the directory you run the command in), next to
`OWN-SNAPSHOT.json`. Commit it: Orchestra reads the committed file.

## Exit codes

| code | meaning                                                                                                     |
| ---- | ----------------------------------------------------------------------------------------------------------- |
| `0`  | the territory was declared or replaced and the catalog rewritten                                            |
| `1`  | a usage error: no glob, no `--owner`, or a `--tier` other than `T0`/`T1`/`T2`                               |
| `2`  | refused: no ratify token (or not `billy` for `T0`), no `--project` for a first catalog, a project mismatch, or a catalog on disk that does not verify |

## Authority

`atlas territory` binds `atlas-query` — it writes no knowledge, only the catalog file, like [`export`](./export.md)
writes a bundle file and never the store. It is not a `WRITE_PATHS` member.

## Related

- [`territories`](./territories.md) — the per-territory off-atlas MISS ledger (a read).
- [`own`](./own.md) — the briefing for a scope.
