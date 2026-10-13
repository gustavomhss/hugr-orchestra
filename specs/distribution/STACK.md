# Distribution landing stack

The owner requested small stacked GitHub PRs with one qualification run on the complete bundle. Composition baseline: `6dbb3546fc`; historical qualification snapshots remain in `EVIDENCE.md`.

| Order | Branch | Review scope |
| --- | --- | --- |
| 1 | `dist-harness` | Native runner selection and architecture-qualified dependency caches |
| 2 | `dist-bundle-plan` | Single bundle workflow and emitted-command conformance harness |
| 3 | `dist-skills` | Required skill admission, source precedence and canonical CLI embedding |
| 4 | `dist-skills-proof` | Compiled skill extraction and precedence tests |
| 5 | `dist-skills-corruption` | Reference corruption/preservation and actual bundle execution proofs |
| 6 | `dist-payload` | Immutable complete payload/archive producer and contract |
| 7 | `dist-npm` | Complete npm producer and installed process probe |
| 8 | `dist-launcher` | Compatible-only CPU/libc selection, real process control and macOS addon ID |
| 9 | `dist-payload-proof` | Payload closure/publication/archive tests and independent fixture |
| 10 | `dist-payload-integrity` | Corrupted retries, native grammar bindings and concurrent publication |
| 11 | `dist-installer` | POSIX install/update/rollback consumer and owned permission cleanup |
| 12 | `dist-install-fixture` | Independent installer filesystem and archive fixtures |
| 13 | `dist-install-proof` | Installer integrity/lifecycle tests |
| 14 | `dist-guide` | Failed-admission preservation, usage, measured evidence and landing order |
| 15 | `dist-npm-proof` | Real npm registry lifecycle tests |
| 16 | `dist-recipes` | Recipes, filename-prefixed AUR sources and existing-path negative controls |
| 17 | `dist-recipes-proof` | Real recipe executors and preservation flags |
| 18 | `dist-native-build` | Canonical native build oracle and pinned Homebrew core metadata |
| 19 | `dist-native-proof` | Installed runtime/skill oracles and immediate curl refusal preservation |
| 20 | `dist-native-channels` | npm native lifecycle, native runner and isolated Homebrew process setup |
| 21 | `dist-brew-payload` | Homebrew checksum/install/upgrade, exact activation and retained-keg rollback |
| 22 | `distribution-bundle` | Native Homebrew entrypoint, generic suite ledger and bundle wiring guard |

Each PR targets the previous branch; the first targets `dev`. The final branch contains the complete delivery. Its `distribution-bundle` workflow runs static gates and seven package/host qualification rows, with native process controls and retained logs. Intermediate PRs do not trigger duplicate qualification runs. The bundle PR records the exact tested SHA and workflow URL.

Review each delta independently and land bottom-up. Preserve commit ancestry when merging this stack into `dev`, then retarget the next PR to `dev`; deleting a parent before retargeting is not part of the landing procedure. An ancestry-rewriting landing requires rebuilding descendants and qualifying the new bundle.

The preparation includes the newer baseline's bundled ripgrep alongside omni and tree-sitter. Native proofs capture and compare the entire built `bin/` tree, including those files. Public registry/tap publication and release signing remain separate release operations.
