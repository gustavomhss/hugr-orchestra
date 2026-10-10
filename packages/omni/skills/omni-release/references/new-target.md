# Adding a build target

A target is a platform package (`hugr-omni-<id>`) that holds the addon (`hugr-omni.node`) and the supervisor next to
it, and installs only on its own `os`, `cpu` and `libc`. The design is [ADR-0004](../../../docs/adr/0004-packaging.md).
The current eight targets and their build commands are in [the npm packaging notes](../../../bindings/node/npm/README.md).
The integration plan's WP8a (linux-musl x64 and arm64, win32-arm64) is the worked example: musl builds inside
`rust:1-alpine` and is proven under `node:22-alpine`
([the integration plan](../../../docs/orchestra-integration.md)).

## Steps

1. **Decide the id and the triples.** The id is `<os>-<cpu>[-<abi>]`, in npm's `process.platform` and
   `process.arch` names (`linux-arm64-musl`, `win32-arm64-msvc`). The addon triple and the supervisor triple can
   differ. On Linux the supervisor is always the static musl build (ADR-0005 decision 1), and a glibc addon is
   built at the glibc 2.17 floor with zig.
2. **Wire the id in the three places that list targets**, in one change:
   - `bindings/node/index.js`, the runtime map from `process.platform` and `process.arch` (and libc on Linux) to
     the package id;
   - `bindings/node/npm/pack.mjs`, the target table (`os`, `cpu`, `libc`, the addon and supervisor triples, the
     library file name);
   - `bindings/node/npm/verify.mjs`, the ids it expects to find installed.
3. **Add the optional dependency** to `bindings/node/package.json`, at the current version.
4. **Add a matrix row to the release workflow** (`release.yml`, or the Orchestra artifacts workflow). It runs on a
   runner of that OS and CPU: no cross-compiled package ships unproven. The row builds, packs, and runs `verify.mjs`
   with node, bun and deno.
5. **Static linking where it matters.** A musl addon is a `cdylib` built with `-crt-static`. A Windows build uses a
   static CRT (`+crt-static`), and `verify.mjs` checks that no `VCRUNTIME` DLL is needed (integration plan, H5).
6. **GUARANTEES.** Add the target to the per-OS columns, or state that it inherits an existing column, and why.
   A target with no CI evidence promises nothing (INV-09).
7. **Docs.** Add the row to the target table in the npm packaging notes, and update the README's platform list.

## Proof before merge

- The release workflow is green for the new row: build, pack, and a clean install with npm, Bun and Deno, with the
  quickstart running as written.
- `pack.mjs` checks the binary format and CPU of both files, and that the Linux supervisor is static.
- The contract suite has run on that platform at least once (a runner of that OS and CPU), or the gap is declared.

## Publishing

A new platform package is published before `hugr-omni` like the others, with the owner's yes (see the SKILL.md
publish step). Deno fails on a missing optional dependency, so never publish a `hugr-omni` whose
`optionalDependencies` names a target that is not on the registry yet.
