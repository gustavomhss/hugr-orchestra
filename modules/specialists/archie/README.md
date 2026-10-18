# Archie specialist assets

Authored skills for the stable native seat ID `archie`: `archie-plan`, `archie-work-package` and their
complete reference trees. This is an asset module, not a separately published package.

Orchestra's `Seats.skillSource("archie")` resolves `skills/` here. Existing Bun/Node embedding and the
modern CLI producer use the same reader and retain relative names, exact UTF-8 bytes, cache digests,
frontmatter IDs and configured lookup precedence.

Keep documentation outside `skills/`; every companion enters the shipped payload. Native agent
configuration, dispatch authority and runtime lifetime remain owned by Orchestra/Core rather than
this data tree. Source attribution and authoring contracts remain with their existing references and
[specs/upstream-specialist](../../../specs/upstream-specialist).

From the repository root:

```sh
bun run test:ci orchestra test/maestro/seat-framework.test.ts test/maestro/seat-skills-build.test.ts
```

Orchestra owns the package-local typecheck. The paired-authoring harness pins the current authored
assets by full path, byte length and content hash; historical packets retain their original paths.
