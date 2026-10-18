# Distribution landing stacks

## Original preparation stack (landed)

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

Each PR targeted the previous branch; the first targeted `dev`. The final branch contained the complete delivery. Its historical `distribution-bundle` workflow ran static gates and seven package/host qualification rows, with native process controls and retained logs. Intermediate PRs did not trigger duplicate qualification runs. The bundle PR recorded the exact tested SHA and workflow URL.

Review each delta independently and land bottom-up. Preserve commit ancestry when merging this stack into `dev`, then retarget the next PR to `dev`; deleting a parent before retargeting is not part of the landing procedure. An ancestry-rewriting landing requires rebuilding descendants and qualifying the new bundle.

The preparation includes the newer baseline's bundled ripgrep alongside omni and tree-sitter. Native proofs capture and compare the entire built `bin/` tree, including those files. Public registry/tap publication and release signing remain separate release operations.

## Historical native Windows and AUR closure stack (landed)

Composition baseline: `318fce61458e8201827fcc3a379053d56ccf03ef`. Fresh complete-bundle CI [38501502021](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38501502021) qualified source `779dc29bd16dcc38c96ba8c194d6168bb6fd69a5`. Closure completed on `dev` at `45133cd0d205e87556e991d7ecd231926a8da1c9`, with exact source/landing tree `90819934b66df0603bd2f0ea4a7feeff0409fa05`; see `EVIDENCE.md` for historical reach.

| Order | Branch | Review scope |
| --- | --- | --- |
| 1 | `native-portability` | Native Windows build/environment/argv handling, npm shebang, installed companion resolution and owned process queries |
| 2 | `native-windows-proof` | Public Windows npm install/update/exact downgrade, parsers, skills and adopted service ownership |
| 3 | `aur-inventory` | Final-package inventory and mutation controls, trusted HTTPS, guest bootstrap and ownership repair |
| 4 | `aur-guest-proof` | Nonroot makepkg and native pacman install/update/downgrade inside the owned guest |
| 5 | `distribution-bundle` | Native host/guest orchestration, cleanup receipts, exact workflow coverage and measured documentation |

The historical stack procedure bounded each delta to 400 changed lines, targeted the first PR at `dev` and each successor at its predecessor, and reserved qualification for `distribution-bundle`. It required bottom-up ancestry-preserving landing, successor retargeting and final-tree comparison before branch deletion. The recorded final landing tree matched the qualified bundle tree.

## Extension overview (composition forthcoming)

Current `dev` composition baseline: `e87fd95799cba0220abf5c86b203bc8d82b29732`. Documentation inspection baseline: `ba41a3015c9c359cec797d23bf6bb074b1a766b1`. The extension covers full native musl x64/ARM64 runtime, Windows ARM64 and production Job closure, official pinned Deno 2.9.7 on six GNU/Darwin/Windows targets (no official musl target), installed public CLI Session V2 provider/tool execution, and AUR signed-repository/seccomp/NNP/Landlock enforcement without bypass.

The lead will compose the exact branch/PR partition separately; no extension stack rows are asserted here. Implemented oracles and the declared 13 qualification rows plus static job are mapped in `EVIDENCE.md`; final qualification is pending. Intermediate pushes do not run the bundle. Run one complete qualification after final composition, record its exact tested SHA/tree and retained evidence, and require landing-tree equality before declaring closure. Partial CI `38558321941` is non-green and does not discharge this obligation. Test versions `1.18.27`/`1.18.28` do not establish publication.
