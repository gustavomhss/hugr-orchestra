# Closure wave 2

Baseline: `696018ded7740e9725447475c044f50aa160c074`. This is an integration checkpoint, not the final producer/dependency freeze. The owner requests parallel closure without debt or silent deferrals; focused work-package checks remain the cadence.

## Frozen ownership and contracts

| Work package | Isolated branch | Write ownership | Contract |
|---|---|---|---|
| Private OAuth files | `closure-private` | New Core private-file helper/oracle, Core `auth/siwc-host.ts` and its tests, Orchestra Auth store and three OAuth/Auth tests | POSIX mode `0600`; Windows native protected DACL grants the current owner and privileged SYSTEM/Administrators only. Apply protection before publishing temporary files; actual OS oracle replaces meaningless Windows POSIX-mode assertions. No skipped Windows persistence/concurrency tests. |
| Owned CLI schema | `closure-schema-fix` | New `packages/cli/script/schema.ts`, focused schema test and optional CLI schema helper | Emit JSON Schema from authoritative Core `Config.Info`; legacy Orchestra generator retains `ConfigV1.Info`. Do not replace the unrelated Core database schema snapshot. |
| Artifact producer | `closure-producer` | CLI export script/helper/target contract and focused tests; CLI builder only if needed for shared target declarations | Export regular raw owned binaries into a schema-1 directory consumed by `ORCHESTRA_CLI_PREBUILT_DIR`, with target-specific filenames, captured version and SHA-256. Preserve source outputs; reject malformed/conflicting/overlapping inputs; no registry/compiler fallback. Native execution/build proof remains a distinct matching-runner check. |
| Nix derivations | peer `nix-closure` | `nix/**` only | Measured Nix-local Bun `1.3.14` and Electron `42.3.3` derivations; preserve shared `flake.lock` and Intel Darwin support. No guessed hashes or version-check bypass. |
| Integration | `runtime-closure` | Shared manifests/lockfile/generators, evidence, native workflow orchestration | Reconcile published seat/capability baseline, review each whole diff and measured controls, then publish the clean producer revision. |

These execution slices are disjoint. Root/package manifests, lockfile, Nix files, public generated outputs, roster/seats and shared lifecycle files are not author-agent write sites. Merge order: private files, schema, producer; shared generators and final native/Nix capture follow integrated inputs. No work package opens a PR; the milestone has one final PR.

## Evidence already requiring repair

- Combined Core [37781640526](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37781640526): Linux passed; Windows failed host-ID POSIX-mode assertion (`Expected: 384`, `Received: 438`).
- Combined Orchestra [37781639208](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37781639208): Linux passed; Windows failed five OAuth/Auth POSIX-mode assertions. Relay HTTP/OpenAPI/SDK checks passed on both.
- Combined Client [37781639701](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37781639701): 17 tests passed per OS.
- Combined generators produced no diff at this baseline. Core, Orchestra, Server, App, Desktop, SDK and Client typechecks passed; one overloaded Orchestra invocation timed out before a successful retry.

The Windows failures do not establish a safe DACL. The private-file work must prove the native protection and keep the actual persistence/refresh/CAS cases executing.

## Handoff to Nix

- Proposed final CLI output: wrapped CLI in `bin/orchestra`, plus unwrapped raw CLI resources and schema-1 manifest in `share/orchestra/cli`; `share/orchestra/schema.json` comes from the new CLI generator. The peer's derivation owns installation paths after the exporter interface is verified.
- Desktop consumes `${orchestra}/share/orchestra/cli` via `ORCHESTRA_CLI_PREBUILT_DIR`, then stages/signs and rehashes. Windows builds require both Linux guest architectures in addition to their native executable.
- Node-modules/source filesets must include CLI, Core, Schema, Protocol, Server and build tooling needed by the owned CLI, generated Client/SDK surfaces, migration artifacts and native resources actually consumed by packaging. The Nix peer derives exact dependencies from source and real builds, not this prose list alone.
- Relay lead alone integrates W6 Task/Session/arsenal-completion changes; the upstream-seat lead alone owns roster/seats. Their approval-envelope/nominal contracts remain separate from this build wave.
- OAuth consent/entitlements/owned Copilot/xAI registration require the owner's account/model choices. No waiver closes them.

## Current work-package evidence

- Private-file candidate `e5d7c3872a08bef3a1bfd51fbc03ea948cc9fd91` has independent approval. Actual Node ESM conformance catches the old Windows `Bun.spawn` dependency: [37829883828](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37829883828) failed with `ReferenceError: Bun is not defined`. Restored Core [37831431679](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37831431679) passed 11 tests per OS; Orchestra [37833174395](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37833174395) passed 21 per OS. Publication-order/native-error controls remain active.
- CLI schema candidate `3c5ba7ff104d20265ba53ccea49560edb6bf6085` has independent approval. Both the generator and live Config oracle run under isolated subprocess roots. The accidental parent-import control [37819183643](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37819183643) failed on both OSes; restored [37820091895](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37820091895) passed one test per OS. A directory-state snapshot detects filesystem changes, not every possible cached import.
- Producer candidate `7cfd6533ab3ac545b1259045d5591fa79f8d64c1` is **not cleared for integration**. Existing output replacement now refuses conflicts and exact retries are idempotent, but native Darwin aliases, musl symbol availability and requested ancestor-pinning guarantees remain unresolved. Linux/Windows source fixtures do not close those native-platform items.
- Owner update: ChatGPT OAuth is already connected; DigitalOcean is not. Preserve the connected account. A08 still requires redacted ownership/name/entitlement evidence; do not assume a connected credential alone proves it.
- Session hygiene removed eight clean, already-integrated worktrees and one aborted checkout, preserving their local/remote branches and the active integrator. Current author worktrees remain until their results are integrated or resumable decisions are recorded.
