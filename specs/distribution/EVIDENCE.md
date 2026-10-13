# Distribution preparation evidence

Baseline: `615b2602ea`. Qualification versions: `1.18.27` and `1.18.28`, built separately from the same source snapshot. These are test builds, not release/publication records.

Stack composition subsequently adopted `dev` at `6dbb3546fc`, including its bundled ripgrep and generic CLI test selector. The complete refreshed tree is qualified once by `distribution-bundle.yml`; its exact SHA and hosted result are recorded in the final bundle PR. The table below remains historical evidence for the linked snapshots, not a claim that those runs tested the newer baseline. See `STACK.md` for the review and landing order.

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
- Windows skips the Unix executable-bit/filename cases by name. Windows payload/wrapper publication is structurally tested; real Windows CLI runtime installation is not qualified here.
- The installed-companion peer independently exercises the shipped supervisor. It does not claim that the public CLI performed a model/tool turn through omni.
- AUR has generated recipe and executor checks only. Additional Arch sandbox infrastructure was removed from the active workstream; native AUR qualification is not claimed.
- Public registries/taps, provider execution, musl runtime, signing/notarization and release publication are not established by these tests.
- Node addon compatibility is measured separately above; Deno addon compatibility is not established here.
