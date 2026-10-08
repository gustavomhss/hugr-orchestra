# Capability assets

Data-only F08 source-package bootstrap. Public entrypoints are `@orchestra/capability-assets/catalog`
(`CapabilityAssetCatalog.all`) and `@orchestra/capability-assets/sources` (`CapabilityAssetSources`).
The closed catalog follows `specs/orchestra-capabilities/ASSET-MAP.md`: A01–A12 skills,
A13–A24 provider packs, A25–A32 native sources. Names are planned canonical surfaces, not registered tools.

`source-qualified` means pinned source provenance has been inspected. Destination paths are package-relative,
reserved adaptation destinations; their bodies/scripts/manifests have not been copied. `skillName` and `bodyName`
declare the same future renamed frontmatter/body identity. Additional upstreams retain dual-source attribution.
Provider endpoint/auth/filter presets are declarations, never connection, approval or operation receipts.
No file integrity is claimed for uncopied content. The source manifest lists pending evidence.

Later source-import WPs must enumerate companion files explicitly, preserve notices, record actual digests and
modifications, and qualify their owning operations. Native implementation, dependency installation and ready-state
qualification belong to their owning WPs. Shared `document_read`/`sheet_*` surfaces retain distinct adapters.
Seat packaging uses `seat-skill-content.ts`, `seat-skill-root.ts` and `script/seat-skills.ts`; adoption must use
that current framework with seat-scoped names and its UTF-8 companion contract.

Lead integration: install/register this workspace in the root lockfile and add consuming workspace dependencies.
Run `bun typecheck` here; tests use `bun run test:ci capability-assets test/catalog.test.ts` from the root.
