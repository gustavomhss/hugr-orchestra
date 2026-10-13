# Distribution landing stack

The owner requested small stacked GitHub PRs with one qualification run on the complete bundle. Composition baseline: `6dbb3546fc`; historical qualification snapshots remain in `EVIDENCE.md`.

| Order | Branch | Review scope |
| --- | --- | --- |
| 1 | `dist-harness` | Native runner selection and architecture-qualified dependency caches |
| 2 | `dist-skills` | Required skill admission, source precedence and canonical CLI embedding |
| 3 | `dist-skills-proof` | Compiled skill extraction, corruption and precedence tests |
| 4 | `dist-payload` | Immutable complete payload/archive producer and contract |
| 5 | `dist-npm` | npm producer, compatible launcher, real process control and macOS addon ID |
| 6 | `dist-payload-proof` | Payload closure/publication/archive tests |
| 7 | `dist-installer` | POSIX install/update/rollback consumer |
| 8 | `dist-install-proof` | Installer fixtures and integrity/lifecycle tests |
| 9 | `dist-npm-proof` | npm lifecycle tests and installed process probe |
| 10 | `dist-native-build` | Recipes, canonical native build oracle and pinned Homebrew core metadata |
| 11 | `dist-recipes-proof` | Real recipe executors and negative controls |
| 12 | `dist-native-proof` | Installed runtime/skill oracles and curl lifecycle |
| 13 | `dist-native-channels` | npm native lifecycle, native runner and isolated Homebrew process setup |
| 14 | `dist-brew-payload` | Real Homebrew checksum/install/upgrade/retained-keg rollback qualification |
| 15 | `dist-guide` | Usage, measured evidence and landing order |
| 16 | `distribution-bundle` | Native Homebrew entrypoint, bundle CI and execution-wiring controls |

Each PR targets the previous branch; the first targets `dev`. The final branch contains the complete delivery. Its `distribution-bundle` workflow runs static gates and seven package/host qualification rows, with native process controls and retained logs. Intermediate PRs do not trigger duplicate qualification runs. The bundle PR records the exact tested SHA and workflow URL.

Review each delta independently and land bottom-up. Preserve commit ancestry when merging this stack into `dev`, then retarget the next PR to `dev`; deleting a parent before retargeting is not part of the landing procedure. An ancestry-rewriting landing requires rebuilding descendants and qualifying the new bundle.

The preparation includes the newer baseline's bundled ripgrep alongside omni and tree-sitter. Native proofs capture and compare the entire built `bin/` tree, including those files. Public registry/tap publication and release signing remain separate release operations.
