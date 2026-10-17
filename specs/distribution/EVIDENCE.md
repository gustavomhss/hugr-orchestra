# Distribution preparation evidence

Baseline: `615b2602ea`. Qualification versions: `1.18.27` and `1.18.28`, built separately from the same source snapshot. These are test builds, not release/publication records.

The original stack adopted `dev` at `6dbb3546fc`, then qualified its integration with `6a9b7c5e21` in [38475939037](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38475939037) and landed at `5c87f7826e`. Historical records below retain each linked snapshot's reach. Extension oracles and pending final qualification are recorded separately.

## Historical native Windows and AUR closure (completed)

[38494570524](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38494570524) passed all eight jobs at runtime snapshot `21de9ed50eb98b84f55085a8b4a2e35cd38b893f`, based on `5c87f7826e`. Windows and both AUR native checks passed; retained logs were independently checked for their named runtime tests, zero failures and nonce-bound actual omni controls. After integration with `dev` at `318fce61458e8201827fcc3a379053d56ccf03ef`, the complete bundle [38501502021](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38501502021) completed successfully at source `779dc29bd16dcc38c96ba8c194d6168bb6fd69a5`. It landed at `45133cd0d205e87556e991d7ecd231926a8da1c9`; source and landing share tree `90819934b66df0603bd2f0ea4a7feeff0409fa05`. Run conclusion/head SHA and both commit trees were verified through read-only GitHub API queries. The limitations below belong to that historical closure.

- **Windows x64:** two actual `windows-x64-baseline` builds, real npm registry install/update/exact downgrade, public `.cmd` launcher, PE executable/addon/supervisor checks, TS/Python parsers, independent exact installed-companion spawn, authenticated service/catalog and complete skill/reference bytes. Native PID, image and creation-time queries corroborate each daemon; the fixture adopts its Windows tree until authenticated stop, independent exit observation, tree stop and empty membership, then retires its lease. Native Job handle finalization is not observed by this fixture. Forced-reader/deadline controls prove the query broker closes its own PowerShell child.
- **AUR x64 / ARM64:** actual nonroot `makepkg`, final archive after tidy, native `pacman` v1 install/v2 update/original retained-v1 downgrade, public `/usr/bin/orchestra`, all runtime and skill-byte oracles above, wrong-download checksum refusal before extraction/install, retained-source/cache preservation and owned guest/host fixture teardown.
- The x64 guest uses official `archlinux:base` manifest `sha256:363129b67b2bc6c5a634f8fb4961a7e2eba213a2ec075d159127b1260290a722`. ARM64 uses third-party Menci ArchLinuxARM manifest `sha256:e677d448765dbaefc52293ae7d43680a760ef0653d941fcb778d3456a0a7206a`. Actual host and guest kernel CPUs are checked; neither lane uses QEMU.
- The ARM container uses `seccomp=unconfined` throughout its owned guest lifecycle. Separately, repository bootstrap encounters Landlock EPERM; only that observed bootstrap failure permits a recorded `pacman --disable-sandbox` retry inside the owned guest. Repository signatures remain enabled. Application install/update/downgrade uses ordinary `pacman -U`. This does not qualify seccomp or Landlock enforcement.
- The final-package oracle plants byte, executable/non-executable mode, missing/extra file, empty-directory, wrong-link, missing-metadata and wrong-recipe-hash defects; each is rejected and restored baseline reaccepted. `.BUILDINFO` records global makepkg.conf defaults, not recipe-local options; exact recipe provenance plus final archive hashes/modes establish preservation.
- Earlier runs [38484961389](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38484961389), [38487199630](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38487199630), [38488316964](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38488316964), [38490177704](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38490177704), [38491412686](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38491412686) and [38493459818](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38493459818) exposed real harness/platform failures. They are not green qualification records.

## Historical measured hosted checks

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

## Historical local static checks

After the fixture repair, `bun typecheck` passed from both `packages/cli` and `packages/core`; `bun run check:spawn-imports`, `GODFILE_BASE_REF=fork/dev bun run check:godfile` and `git diff --check` also passed. The size gate reported 332 warnings and zero errors. These are local static checks, not substitutes for the hosted runtime checks above.

After integrating `318fce6145`, both package typechecks and those static gates passed again, including `actionlint .github/workflows/distribution-bundle.yml`. The updated size gate reported 340 warnings and zero errors.

## Historical mutation controls

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

## Historical scope boundaries

- Case-alias filesystem checks execute on macOS and Windows. Linux's case-sensitive volume reports that specific test as blocked; other Linux checks execute normally.
- Windows skips Unix executable-bit/filename cases by name; native Windows x64 npm runtime closure is measured separately above. Windows ARM64 is not a declared target of this proof.
- The installed-companion peer independently exercises the shipped supervisor. It does not claim that the public CLI performed a model/tool turn through omni.
- Native AUR x64/ARM64 closure is measured above in pinned owned guests; public AUR publication remains a release operation.
- Public registries/taps, provider execution, musl runtime, signing/notarization and release publication are not established by these tests.
- Node addon compatibility is measured separately above; Deno addon compatibility is not established here.

## Extension: implemented oracles, qualification pending

Inspection baseline: `ba41a3015c9c359cec797d23bf6bb074b1a766b1`. The following paths implement acceptance oracles; their presence is not evidence that the current full bundle or provider/tool lifecycle has completed successfully. Historical Windows ARM64, musl, Deno, provider and AUR sandbox limits above are contextual, not current implementation claims.

| Extension | Implemented oracle sources (repository-relative) | Required final evidence |
| --- | --- | --- |
| Full native musl x64/ARM64 | `packages/cli/test/distribution-musl.test.ts`, `packages/cli/test/fixture/distribution-musl-guest.test.ts`, `packages/cli/test/fixture/distribution-musl/abi.ts` | Matching pinned Alpine guest, real curl/npm lifecycles, complete runtime/ABI controls, source/payload preservation and guest/host cleanup |
| Windows ARM64 and production Job closure | `packages/cli/test/distribution-windows.test.ts`, `packages/omni/crates/omni-supervisor/src/windows/tree.rs`, `packages/omni/crates/omni-supervisor/src/windows/tests/job_lifetime.rs`, `packages/core/test/distribution-bundle-gates.ts` | Native x64/ARM64 lifecycle plus real OS-handle closure before `Stopped`/`Release`; stop/natural/descendant/unknown and retained-handle mutation receipts |
| Official pinned Deno 2.9.7 | `script/distribution-deno.ts`, `packages/cli/test/fixture/distribution-native-deno.ts`, `packages/cli/test/fixture/distribution-native-proof.ts` | SHA-256-pinned official runtime on six GNU/Darwin/Windows CPU targets; exact installed companions, real child, identity and corruption/restoration controls; no official Deno musl qualification |
| Installed public CLI Session V2 provider/tool | `packages/cli/test/distribution-provider.test.ts`, `packages/cli/test/fixture/distribution-provider-proof.ts`, provider sourcegraph/process/capture/tool-result fixtures | Real inference and successful wire tool-result continuation at v1/v2/v1, compiler/binary and installed process provenance, durable history, fault/restoration and cleanup; qualified in [38820356885](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38820356885) |
| AUR enforcement x64/ARM64 | `packages/cli/test/distribution-aur.test.ts`, `packages/cli/test/fixture/distribution-aur/{bootstrap.sh,sandbox-profile.ts,sandbox-probe.c,sandbox-evidence.ts}` | Signed/trusted repository policy, `DownloadUser=alpm`, pinned Moby v28.0.4 default policy, `Seccomp=2`, `NoNewPrivs=1`, real Landlock allow/deny and pacman restriction receipts; no bypass |

The AUR fixture diagnoses the daemon's original filter first, then applies the upstream default policy without rule additions (canonical JSON has its own digest). Signed repository bootstrap and ordinary local `pacman -U` lifecycle are distinct; this is not local package-signing evidence.

### Final bundle declaration

Current `.github/workflows/distribution-bundle.yml` declares 13 qualification rows plus one static job. Run only the final composed bundle; retain exact source SHA/tree and all logs/receipts. The push trigger names only `distribution-bundle` (manual dispatch also exists), so intermediate stack/docs pushes do not duplicate qualification.

| Lane | Package | Native host | Final status |
| --- | --- | --- | --- |
| regression | cli | ubuntu-latest (GNU x64) | Passed in 38820356885 |
| regression | cli | windows-latest (x64) | Passed in 38820356885 |
| regression | cli | ubuntu-24.04-arm (GNU ARM64) | Passed in 38820356885 |
| regression | cli | windows-11-arm (ARM64) | Passed in 38820356885 |
| regression | core | ubuntu-latest (x64) | Passed in 38820356885 |
| regression | core | windows-latest (x64) | Passed in 38820356885 |
| regression | cli | macos-14 (ARM64) | Passed in 38820356885 |
| regression | cli | macos-15-intel (x64) | Passed in 38820356885 |
| aur | cli | ubuntu-latest → native Arch x64 guest | Passed in 38820356885 |
| aur | cli | ubuntu-24.04-arm → native ArchLinuxARM guest | Passed in 38820356885 |
| musl | cli | ubuntu-latest → native Alpine x64 guest | Passed in 38820356885 |
| musl | cli | ubuntu-24.04-arm → native Alpine ARM64 guest | Passed in 38820356885 |
| provider | cli | ubuntu-latest (x64) | Passed in 38820356885 |
| static | — | ubuntu-latest | Passed in 38820356885 |

Static declares CLI/Core/Script/Schema/Maestro Arsenal package typechecks, spawn-import and size gates, and diff whitespace checks. Windows rows additionally require native Rust Job receipts; GNU x64 CLI regression also declares source/Desktop/Schema/parser ABI and localized oracle proofs. All qualification rows require nonce-bound omni controls and retained logs. These are workflow obligations, not newly measured results.

Partial [38558321941](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38558321941), source `0baef01fe0b1d3ad36c2df3205c40223fb5190f5`, completed with conclusion `failure` (read-only `gh run view`). Its successful jobs do not establish the current 13-row bundle or a complete installed provider/tool proof; the green record is below.

## Final bundle qualification (green)

[38820356885](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38820356885) completed with conclusion `success` for all 14 jobs (13 qualification rows plus static) at source `ea43fd6764de113f7a796cf0fa5ba463be3f569d`, tree `b4f6c2363bca943f7e0bba37590aa5ab539cd2b7`, based on `dev` at `77e9abc8b01000cb8960cf36a521cd0cce5437bf`. Conclusion and head SHA were read through `gh run view`. An earlier green run, [38817052900](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38817052900) at `5bf4144ef4`, still had the polling race described below.

- **Polling race (fixed):** on `dev` at `77e9abc8b0`, run [38818447983](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38818447983) failed the provider lane. Its captured upstream turns show a single correct `bash` call and a `stop` continuation that returned the nonce, but the proof saw only one assistant message. The proof read the context first and the active set second. When the drain finished between those two installed-CLI `api` calls, a stale one-turn history was treated as terminal. The proof now reads the active set before taking the context snapshot.

- **Provider model:** OpenRouter `nvidia/nemotron-3-super-120b-a12b:free`, served upstream by Nvidia, with `temperature: 0` and `reasoning: { enabled: false }` in the model request body. Every captured request is checked for both fields. The oracle is unchanged: exactly one real native `bash` call, an opaque nonce absent from the first request, a continuation that carries the real tool result, fault/restoration controls at install, update and downgrade, and fail-closed handling without a credential. The credential lives only in the capture proxy; it is not written to config, projections or evidence.
- **Repetitions on `dev` at `ccb5b3d670`:** [38821414552](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38821414552), [38825029085](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38825029085) and [38826530221](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38826530221) each passed 14/14. In [38828147138](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38828147138), AUR x64 failed with `AUR_PACMAN_DOWNLOAD_LANDLOCK_NOT_ENFORCED`, even though both pacman download restrictions reported Landlock ABI 7. The guest log contained `error: failed retrieving file 'python-…' from fastly.mirror.pkgbuild.com : Recv failure: Connection reset by peer`; pacman retried on the next mirror and the bootstrap completed. The oracle treated any `error:` line as proof that Landlock was not enforced. It now ignores only that mirror-retrieval line. Landlock diagnostics, missing restriction lines and a failed bootstrap exit status still fail the lane.
- **Why this model:** a CI probe over the hosted free catalog found that `nemotron-3.5-lightning:free` and `nemotron-3-ultra-550b-a55b:free` return empty continuations. With reasoning enabled, `nemotron-3-super` sometimes emitted two identical `bash` calls in one turn and ignored `parallel_tool_calls: false`; run [38815153267](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38815153267) failed this way, and every other lane in that run passed. With reasoning disabled, the probe passed 13 of 13 call/continuation trials, fault results included.
- **Earlier `dev` failures at `297b88f58294`:** [38779654919](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38779654919), [38783566848](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38783566848) and [38786713107](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38786713107) failed the provider lane because the model gave no tool call. The other failures in those runs were a one-off macOS Intel `service start` failure, an upstream Deno HTTP 504 on musl x64 and a Windows ARM64 supervisor spawn timeout. None of them recurred in the two runs above. Deno remains pinned to `2.9.7`; the `2.9.6` strings are deliberate wrong-version controls.
- Versions `1.18.27`/`1.18.28` remain test builds. Public registry/tap/AUR publication, release signing/notarization and release creation remain separate owner-controlled operations.

## Provider lane opt-in (2026-10-17)

The provider row left the default bundle. `distribution-bundle` [38940991556](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38940991556) on `dev` at `c9fbde402d` failed only that row: OpenRouter answered `HTTP 401` with `API key expired.`. Nothing in the code had changed. The lane depends on the owner's key and on a third party's free-tier quota and latency (see the timeout above), so a red run says nothing about the repository's own state.

- `workflow_dispatch` has a boolean `provider` input, default `false`. The provider row moved from the `qualification` matrix into its own `provider` job with `if: ${{ inputs.provider }}`. That job reuses the qualification job's name, environment and steps through YAML anchors, so push runs and dispatches without the input run 12 qualification rows plus static. `packages/core/test/distribution-bundle-workflow.test.ts` pins the input, the job condition, the row placement and the job's equality with `qualification`. A missing or always-true condition, a default of `true`, a changed step or environment, or the provider row back in the default matrix all fail it. A matrix `exclude` was tried first: run [39074449158](https://github.com/gustavomhss/hugr-orchestra/actions/runs/39074449158) failed to create the qualification job, because an include-only matrix has no base axis for `exclude` to match.
- With `-f provider=true` the row runs as before: the same oracle, the same `BUNDLE_PROVIDER_CREDENTIAL_MISSING` fail-closed step and the same `OPENROUTER_API_KEY` wiring. The owner runs it before each release.
- Anonymous OpenCode Zen models were not usable as a credential-free replacement: every chat request (10 free models, 5 trials each) returned `HTTP 403 FreeTierError`, because that free tier is restricted to the OpenCode client.

## Release workflow (dry runs, nothing published)

The published npm names are `@hugr/cli` and `@hugr/cli-<target>`; the `@orchestra` npm scope belongs to another organisation, and the workspace package keeps its internal name. With the rename, `distribution-bundle` [38835713945](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38835713945) passed 14/14 at `0521b7f094`. On its first attempt the provider lane timed out on hosted free-tier latency (about 80 s per control; 8 of 9 controls passed), and the job passed when re-run.

`.github/workflows/release-cli.yml` builds `linux-x64-baseline`, `linux-arm64`, `darwin-arm64`, `darwin-x64-baseline`, `windows-x64-baseline` and `windows-arm64` on matching native runners, checks `--version`, and assembles the archives, `SHA256SUMS`, `install.sh`, the npm tarballs, the Homebrew formula and the AUR `PKGBUILD`. Its `.SRCINFO` comes from real `makepkg`. The 1.19.0 dry run [38838520843](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38838520843) passed, but a smoke install of its npm output failed with `spawn … bin/orchestra EACCES`: artifact upload drops Unix modes. The workflow now packs npm tarballs inside the assemble job, installs the packed wrapper and Linux x64 package, and requires `orchestra --version`. Dry run [38839346500](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38839346500) passed with that gate. Publication still needs the owner's `release` environment secrets (`NPM_TOKEN`, `HOMEBREW_TAP_TOKEN`, `AUR_SSH_PRIVATE_KEY`), the `gustavomhss/homebrew-tap` repository and the AUR `orchestra-bin` package. musl targets now come from `packages/cli/distribution/musl-release.sh`, which runs in the same pinned `rust:1-alpine` guests as the musl lane: pinned musl Bun, omni and musl parsers built in the guest. The packed `@hugr/cli-linux-x64-baseline-musl` also runs `orchestra --version` in `node:22-alpine`. Dry run [38841879037](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38841879037) passed with all eight targets. Code signing is not part of this release flow.
