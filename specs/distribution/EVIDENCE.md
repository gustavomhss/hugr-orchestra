# Distribution preparation evidence

Baseline: `615b2602ea`. Qualification versions: `1.18.27` and `1.18.28`, built separately from the same source snapshot. These are test builds, not release/publication records.

The original stack adopted `dev` at `6dbb3546fc`, then qualified its integration with `6a9b7c5e21` in [38475939037](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38475939037) and landed at `5c87f7826e`. The historical table below retains each linked snapshot's reach. Native Windows and AUR closure follows in the next section.

## Native Windows and AUR closure

[38494570524](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38494570524) passed all eight jobs at runtime snapshot `21de9ed50eb98b84f55085a8b4a2e35cd38b893f`, based on `5c87f7826e`. Windows and both AUR qualification rows passed; retained logs were independently checked for their named runtime tests, zero failures and nonce-bound actual omni controls. The subsequent integration with `dev` at `318fce61458e8201827fcc3a379053d56ccf03ef` requires its own full-bundle qualification before landing; that run and the exact landing tree are recorded on the bundle PR.

- **Windows x64:** two actual `windows-x64-baseline` builds, real npm registry install/update/exact downgrade, public `.cmd` launcher, PE executable/addon/supervisor checks, TS/Python parsers, independent exact installed-companion spawn, authenticated service/catalog and complete skill/reference bytes. Native PID, image and creation-time queries corroborate each daemon; the fixture adopts its Windows tree until authenticated stop, independent exit observation, tree stop and empty membership, then retires its lease. Native Job handle finalization is not observed by this fixture. Forced-reader/deadline controls prove the query broker closes its own PowerShell child.
- **AUR x64 / ARM64:** actual nonroot `makepkg`, final archive after tidy, native `pacman` v1 install/v2 update/original retained-v1 downgrade, public `/usr/bin/orchestra`, all runtime and skill-byte oracles above, wrong-download checksum refusal before extraction/install, retained-source/cache preservation and owned guest/host fixture teardown.
- The x64 guest uses official `archlinux:base` manifest `sha256:363129b67b2bc6c5a634f8fb4961a7e2eba213a2ec075d159127b1260290a722`. ARM64 uses third-party Menci ArchLinuxARM manifest `sha256:e677d448765dbaefc52293ae7d43680a760ef0653d941fcb778d3456a0a7206a`. Actual host and guest kernel CPUs are checked; neither lane uses QEMU.
- The ARM container uses `seccomp=unconfined` throughout its owned guest lifecycle. Separately, repository bootstrap encounters Landlock EPERM; only that observed bootstrap failure permits a recorded `pacman --disable-sandbox` retry inside the owned guest. Repository signatures remain enabled. Application install/update/downgrade uses ordinary `pacman -U`. This does not qualify seccomp or Landlock enforcement.
- The final-package oracle plants byte, executable/non-executable mode, missing/extra file, empty-directory, wrong-link, missing-metadata and wrong-recipe-hash defects; each is rejected and restored baseline reaccepted. `.BUILDINFO` records global makepkg.conf defaults, not recipe-local options; exact recipe provenance plus final archive hashes/modes establish preservation.
- Earlier runs [38484961389](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38484961389), [38487199630](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38487199630), [38488316964](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38488316964), [38490177704](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38490177704), [38491412686](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38491412686) and [38493459818](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38493459818) exposed real harness/platform failures. They are not green qualification records.

## Measured hosted checks

| Scope | Evidence | Reach |
| --- | --- | --- |
| Required compiled skill admission and user precedence | [38293497000](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38293497000) | Core tests on Linux and Windows; full entry/reference bytes, immutable version/content cache, corruption refusal, user overrides |
| Native curl/npm: Linux x64 baseline | [38303390416](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38303390416) | Two real builds, install/update/rollback, parsers, installed companion peer, authenticated service/catalog and full extracted skill trees |
| Native curl/npm: Linux ARM64 | [38311593841](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38311593841) | Same lifecycle on actual `ubuntu-24.04-arm`, after architecture cache repair |
| Native curl/npm: Darwin ARM64 after dylib-ID change | [38393989805](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38393989805) | Both native curl/npm tests passed; the separate Homebrew test failed, so the overall run was not green |
| Native curl/npm: Darwin Intel after dylib-ID change | [38393989459](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38393989459) | Both native curl/npm tests passed; the separate Homebrew host setup test failed, so the overall run was not green |
| Homebrew Darwin ARM64 | [38439041045](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38439041045), earlier [38401555165](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38401555165) | Real private-prefix install/upgrade/retained-keg public-link rollback; wrong-download hash refusal preserved old activation and complete kegs; final pinned-core snapshot `6b2dfb8c1d2cea2c6f661cb47a8bc013c006c15f` |
| Homebrew Darwin Intel | [38438308840](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38438308840) | Same complete native lifecycle, including both checksum-negative controls, old-version runtime after refused upgrade, and retained-keg rollback; snapshot `ece63b3c2243a3cd137dd9211fc51b9ca0208816` |
| Payload publication/archive and npm wrapper structure | [38395841321](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38395841321) | Linux, macOS and Windows native filesystem proofs; Windows uses PE fixtures, not a real Windows CLI |
| Consumers and recipes | [38400732253](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38400732253) | Real npm lifecycle with synthetic payload, POSIX installer integrity/lifecycle, actual Ruby/Bash recipe executors, compatible launcher selection |
| ARM64 selector/report correspondence | [38305589459](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38305589459) | Linux/Windows request and report tests; closed selector maps native ARM64 to the exact host |
| Architecture-qualified dependency caches | [38311595186](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38311595186) | Actual cache-key shell emitter and restore/save paths on Linux/Windows; old OS-only emitter is an explicit collision control |
| macOS Node addon compatibility | [38395817972](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38395817972) | Node loads the rebuilt `@rpath` addon and executes a child |

Homebrew qualification pins upstream revision `1220a4af7bdf66e2b5c2c970cf1191606972e009`, which includes checksum-prefetch/retry repairs. This does not qualify older Homebrew implementations. The fixture prefix lives outside macOS system temporary directories so current Homebrew's sandbox can protect its own state.

The final native Homebrew fixtures also preload an official blob-filtered sparse `homebrew/core` checkout at `3e60bfb7e813eaedb3ffc19532998cd9bd2fd750`: the real `pkgconf` formula, its alias and root JSON metadata. Before installation, they verify the revision, remote and exact committed formula bytes, then execute the upstream macOS SDK-mismatch lookup against the empty private Cellar. This repairs the external full-core-clone timeout observed in [38422821535](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38422821535); it does not replace the formula, patch Homebrew, enable API substitution or disable the upgrade/checksum controls.

## Local static checks

After the fixture repair, `bun typecheck` passed from both `packages/cli` and `packages/core`; `bun run check:spawn-imports`, `GODFILE_BASE_REF=fork/dev bun run check:godfile` and `git diff --check` also passed. The size gate reported 332 warnings and zero errors. These are local static checks, not substitutes for the hosted runtime checks above.

After integrating `318fce6145`, both package typechecks and those static gates passed again, including `actionlint .github/workflows/distribution-bundle.yml`. The updated size gate reported 340 warnings and zero errors.

## Mutation controls

| Removed behavior | Measured RED evidence |
| --- | --- |
| Native header admission, npm-special path refusal, compatible-only launcher selection, explicit recipe payload copy | [38293860186](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38293860186): named assertions failed in each affected test family |
| Complete extracted skill tree verification | [38293860609](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38293860609): corruption and required compiled Config boot assertions failed on Linux/Windows |
| Production CLI skill embedding define | [38304681335](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38304681335): real installed curl CLI returned an empty skill catalog; the nonempty catalog oracle failed |
| ARM64 CPU assertion and architecture cache identity | [38402265824](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38402265824): named CPU-assertion and cache-collision failures |
| Architecture-qualified restore prefix alone | [38402621180](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38402621180): expected architecture-specific prefix, received old OS-only prefix |
| Archive-parent physical identity overlap check | [38403114518](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38403114518): a real case alias allowed archive publication inside the payload; the filesystem oracle failed |
| Homebrew `preserve_rpath` | [38404413148](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38404413148): Homebrew changed the real addon ID and SHA-256; complete payload verification failed |

Mutation worktrees were restored after snapshot capture. These deliberately failing runs are calibration evidence, not release candidates.

## Scope boundaries

- Case-alias filesystem checks execute on macOS and Windows. Linux's case-sensitive volume reports that specific test as blocked; other Linux checks execute normally.
- Windows skips Unix executable-bit/filename cases by name; native Windows x64 npm runtime closure is measured separately above. Windows ARM64 is not a declared target of this proof.
- The installed-companion peer independently exercises the shipped supervisor. It does not claim that the public CLI performed a model/tool turn through omni.
- Native AUR x64/ARM64 closure is measured above in pinned owned guests; public AUR publication remains a release operation.
- Public registries/taps, provider execution, musl runtime, signing/notarization and release publication are not established by these tests.
- Node addon compatibility is measured separately above; Deno addon compatibility is not established here.
