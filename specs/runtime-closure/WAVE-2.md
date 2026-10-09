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
- Producer scope checkpoint `e39fc023a3` records the owner's explicit **“Build controlado (Recommended)”** decision in `PRODUCER-BOUNDARY.md`. Stable build-owned namespaces and cooperating publishers are supported; hostile same-UID mutation is excluded. Both actual POSIX interleavings remain executable limitation witnesses, not false security guarantees. Independent review approved this declared scope exception; matching-host execution remains required before integration.
- Owner update: ChatGPT OAuth is already connected; DigitalOcean is not. Preserve the connected account. A08 still requires redacted ownership/name/entitlement evidence; do not assume a connected credential alone proves it.
- Session hygiene removed eight clean, already-integrated worktrees and one aborted checkout, preserving their local/remote branches and the active integrator. Current author worktrees remain until their results are integrated or resumable decisions are recorded.

## Resumed parallel closure

- Relay checkpoint `937cf2b1de` is integrated in published runtime checkpoint `ccf4e62bf5`. Tool-registry composition preserves both external SDK admission and registry-backed seat support. Supported SDK and Client generators produced no additional working-tree diff beyond the composed output.
- Exact nullable OpenAPI/SDK evidence [37868767689](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37868767689) covers the peer's unchanged nullable transition envelopes; the combined SDK also retains OAuth `metadata`. The owner explicitly answered **“Autorizar 16601 LOC”** for its three additional generated lines beyond the peer's approved 16598. Client's existing 6646-LOC authorization remains unchanged.
- Native harness run [37872385330](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37872385330), source `4b0fcf043d`, exposed Bun 1.3.14's optional `--config` argument: the path must use `--config=PATH`. A spaced path can become the executed entrypoint, so successful job statuses from that invocation do not establish native test execution. Workflow and exporter-subprocess argv are being corrected together; the unchanged native selectors will run in one new batch.
- W6 exact write ownership was acknowledged to the Relay integrator. Archie confirmed `PlanSource` upstream/provenance ownership; binding Plan/Task changes must wait for its frozen versioned attribution contract before changing upstream enums or provenance. Peer ACKs are not human authority or permission waivers.
- The human-generated SDK ceiling correction passed the actual godfile guard after its 16601-versus-16598 failure. Combined Core, Schema, Orchestra, Client and SDK package typechecks passed. Existing provider/auth/native-independent suites were not repeated.
- Corrected harness source `5513f97398` ran real named tests in [37873704892](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37873704892). Required native closure remains blocked: Darwin's metadata gate incorrectly requires an undocumented `Mounted` field; Linux reaches normal publication/export assertions before a borrowed-libc-memory ownership crash. The gate and ownership fixes are separate from the authorized namespace boundary. Successful individual assertions before the crash are not a completed lane.

## Producer matching-host completion

Producer/native candidate `374da1e154acc7d5df4c7d84bd69fd0aa1b8d494` repairs both measured failures. Linux directory names use a non-owning `toArrayBuffer` view of libc-owned `dirent` memory, decoded synchronously before the next `readdir`/`closedir`. Darwin admission uses the live nonempty `MountPoint` rather than an undocumented `Mounted` field; exact root equality, APFS qualification and SDK checks remain required. Independent reviews approved each narrow correction.

[37875718504](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37875718504) completed all six actual hosted lanes: 28 tests each on Darwin Intel/ARM, 27 each on native musl x64/ARM and glibc-with-foreign-musl x64/ARM. The lead verified named admission, actual exporter-subprocess and retained POSIX limitation tests executed in every lane. The earlier spaced-config job statuses are not reused as evidence.

This closes the producer's native exporter/ABI handoff checks. It does not certify full compiled CLI/Desktop products, Windows/WSL guest transport, final SDK authority matrix, Nix dependency hashes/builds or operational OAuth consent. Those acceptance items remain explicit.

## Prepared SDK runtime matrix

The new focused matrix uses one real loopback-registry `Npm.install` with canonical and alias bridges, ordinary dependency fetch/execution controls and zero SDK registry requests. Prepared workers check all seven public exports under Bun, a Node ESM bundle, compiled Bun and real OpenTUI. Runtime exports require nonempty exact key sets and object identity through external ESM and supported `require`; integration is explicitly runtime-empty, with public type fields checked by package typecheck. Unknown/deep imports reject; accepted Bun `.js` retries and `package.json` exceptions may expose only owned modules/metadata.

[37876355764](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37876355764) reproduced a real Node admission failure on both OSes: Bun-only `import.meta.dir` was undefined. Candidate `22addae2df` uses the existing `fileURLToPath(import.meta.url)` to obtain a portable module directory, preserving optional physical-host authority and foreign-footprint checks. Independent review approved the one-line correction and the matrix.

[37877015907](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37877015907) passed the one matrix test with 40 parent assertions on each of Linux and Windows. Each run includes a counted real Bun registration mutation: external identity comparison rejects a fresh registered `tool` function while expected bundled objects remain unchanged. The mutation is not a separate rerun or a changed oracle. Normal workers cover canonical/alias ESM and `require`; the registration control specifically calibrates the Bun comparison, not every runtime independently.

Combined Core and Orchestra package typechecks passed, including the integration public-type field references. The earlier resolver and production-footprint suites were not rerun. Final exact-head milestone CI and full product/operational proofs remain separate acceptance items.
