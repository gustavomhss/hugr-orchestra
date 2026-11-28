# Kubeconform P0B — five-distribution notice inventory contract

Status: **frozen for hosted qualification; test-only authorship authorized by the lead**. This contract authorizes preparation and review of the two new measurement files. Source publication and GitHub Actions dispatch remain lead-owned. No P0B execution or qualification is claimed. P0A1/P0A2 source, artifact bytes and measurement fixtures remain unchanged.

## 1. Bounded measurement

Run one dedicated Linux x64 hosted measurement that uses the real existing `BackendToolkit.prefetch(["kubeconform"], target)` for **darwin-arm64, darwin-x64, linux-arm64 and win32-x64**. Inspect their installed bytes and exact archive members with the already pinned Linux Go reader. Never invoke any of those four executables. Combine those four actual static observations with the exact retained Linux x64 observation from P0A2, preserving which run produced each fact.

The output is a five-distribution union of observed compiler versions, embedded module path/version metadata, distributed archive notices and pinned source-notice associations. It supplies evidence for a later decision about the engine-global `NativeEngine.notices` field. It does not install that field or close a runtime, analyzer, sandbox, redistribution or legal requirement.

This needs **two new test-only files**, without changing a delivered API or the measured P0A fixture:

- `packages/core/test/review-toolkit/kubeconform-p0b.test.ts` — one live Linux x64 measurement case.
- `packages/core/test/fixture/kubeconform-p0b.sources.json` — the reviewed five archive/header expectations, pinned reader, P0A2 reference and known source mappings.

The source inventory is `packages/core/test/fixture/kubeconform-p0b.sources.json`, derived from the reviewed scratch inventory without changing pins. Test-only authorship is authorized. Source publication and a new hosted run require the lead's review of both final files. Like P0A, this temporary Linux-asserting measurement must not be merged into the normal multihost Core suite.

## 2. Confirmed Go reader mechanism

The repository's Go reader is **1.25.14**, whose tag resolves to commit **`08118a942518cc18db507ec182acffe7364a92a3`**. The actual P0A2 reader executable hash is `9347e73e5188af1ef4c2046cbc9c985473f0155c187d4005ae44c21b300062eb`.

Two exact primary files establish the inspection mechanism:

- [`src/cmd/go/internal/version/version.go`](https://github.com/golang/go/blob/08118a942518cc18db507ec182acffe7364a92a3/src/cmd/go/internal/version/version.go): `scanFile` calls `buildinfo.ReadFile(file)`; the `-m -json` branch serializes that `BuildInfo`. The target path is read as data, not launched. The command handles an explicitly named file, so the fixture need not perform a directory scan.
- [`src/debug/buildinfo/buildinfo.go`](https://github.com/golang/go/blob/08118a942518cc18db507ec182acffe7364a92a3/src/debug/buildinfo/buildinfo.go): `ReadFile` opens the file and passes its reader to `Read`; `readRawBuildInfo` selects ELF, PE or Mach-O by header magic using `debug/elf`, `debug/pe` and `debug/macho`. This dispatch is not restricted to the reader host's OS/architecture.

Therefore a Linux Go reader can inspect all three required formats without executing the target. The existing P0A2 real read additionally proves that this Go 1.25.14 reader parsed the Go 1.26.3 Linux release's current build-info encoding. It does not, by itself, prove the other four files parse; P0B must observe each.

**Concrete limit:** the reader's fat Mach-O branch reads only `Arches[0]`. The minimal contract therefore requires the expected **thin, little-endian Mach-O 64-bit** file for each Darwin target. A fat image must retain an unsupported/mismatched-format observation and fail completeness; P0B may not claim to have inspected every slice. Supporting arbitrary fat images would require a separately reviewed slice inventory, not an implicit extension.

## 3. Exact repository and archive anchors

P0A2 measured source is `432c8415bb657c0041fd6b0fba084fa8e1d7a07d`, tree `cfa170b66306328dcf69f931514b6ade851007ac`. Its textual evidence is now retained by commit `3de68057c5b1da3697dfff4e0c165ae510753d9e`, tree `0074c33df44a10de178554b9c97d96f6138ee9f1`; that is the authorized measurement parent. During the source-planning read, dev was `7441df1347d98777259aa5b7e1f12ce46486ce85`, tree `8efd7f9d205ef552f7762f4fd0b3116c5ec87841`. The kubeconform pack, Go runtime pin and `NativeEngine` schema are byte-identical between the measured baseline and that dev. Their Git blobs are respectively `81fb16e67c3fbc464421945d548fd96ff80e3c57`, `75c6d31c2ee8e54f9e3cfedf5f30d5449a63a417` and `9a89f013980597a2a4b0d404f7213fab4ac74dbb`.

The exact [kubeconform pack](https://github.com/gustavomhss/hugr-orchestra/blob/7441df1347d98777259aa5b7e1f12ce46486ce85/packages/core/src/backend-toolkit/packs/kubeconform.ts) still selects version 0.8.0 and the five assets below. The [publisher release metadata](https://api.github.com/repos/yannh/kubeconform/releases/tags/v0.8.0) reports matching digests and sizes. These are **pins/publisher facts**, not new P0B download measurements.

| Target | Asset | Published bytes | SHA-256 |
| --- | --- | ---: | --- |
| darwin-arm64 | `kubeconform-darwin-arm64.tar.gz` | 7,276,844 | `f84f4dfbebf4a6b0b230385fa065a39ea35e02608c2b50d025dcf64775a69d67` |
| darwin-x64 | `kubeconform-darwin-amd64.tar.gz` | 7,762,426 | `71dbc87ac9f24099a62b93570e65aa06312ba6ac8aea63b7f86e9d999edf5a92` |
| linux-arm64 | `kubeconform-linux-arm64.tar.gz` | 6,901,136 | `1f53fc8e81258197a35e8603054162a5af1de8c5af13746c71ab680d9534ed87` |
| linux-x64, prior P0A2 | `kubeconform-linux-amd64.tar.gz` | 7,534,236 | `9bc2bffbf71f261128533edaf912153948b7ff238f9a531ae6d34466ec287883` |
| win32-x64 | `kubeconform-windows-amd64.zip` | 7,615,744 | `e3f56102bcf4f50b034a567e2482a1c5330799983ddd655952310211aef73d93` |

The root member is `kubeconform` for each tar archive and `kubeconform.exe` for Windows. **The other four executable hashes, sizes, compiler versions and dependency sets are unknown until measured.** Null input fields represent that absence; no Linux member digest is reused for a foreign program.

Required header identities are:

| Target | Header expectation |
| --- | --- |
| darwin-arm64 | Thin Mach-O 64-bit little-endian, magic `0xfeedfacf`, CPU type `0x0100000c`, executable file type 2 |
| darwin-x64 | Thin Mach-O 64-bit little-endian, magic `0xfeedfacf`, CPU type `0x01000007`, executable file type 2 |
| linux-arm64 | ELF64 little-endian, machine 183/AArch64 |
| linux-x64, prior P0A2 | Retained ELF64 observation, machine 62/x86-64 |
| win32-x64 | DOS `MZ`, bounded PE header offset, `PE\0\0`, machine `0x8664`, optional-header magic `0x20b` |

Use bounded direct header reads only for these fixed identity fields and reuse the existing pure `scan()` for format/floor facts. Do not invoke its CLI. Compare its observed `needs` with the unchanged pack's floor entry, retaining both. This is static metadata agreement, not a host compatibility test.

## 4. Real APIs and exact measurement sequence

The existing [prefetch implementation](https://github.com/gustavomhss/hugr-orchestra/blob/432c8415bb657c0041fd6b0fba084fa8e1d7a07d/packages/core/src/backend-toolkit/index.ts) already takes an explicit target. For the four foreign targets on a real Linux x64 host, it calls `request(..., host=false)`. The native-engine branch installs the exact target artifact and checks file/notice readiness; it creates no host shim and executes no target program. This avoids replacing `Target`, `Machine`, `Manifest`, extraction or process services.

The case uses the real `AppProcess` graph and `expectSpawn`, and provides only a test-owned `BackendToolkit.Root`. It proceeds sequentially:

1. Assert the actual measurement host is Linux x64. Retain current `GITHUB_SHA`, run/attempt, inventory SHA and exact reader pins. Do not call a historical inventory baseline the tested checkout.
2. Read the required P0A2 reference files from the retained documentation, verify their frozen hashes, and strictly decode the actual retained Linux build-info. The frozen input inventory records exact file hashes including `measurement.json` (`ad3de846…`), `build-info.json` (`86e5cf17…`) and `executable.json` (`c502d9b9…`). Preserve source `432c8415…`, snapshot `a82102da…`, run 46103282827 and artifact 15246202661 as **prior observation** identities.
3. Provision the already pinned **Linux** Go 1.25.14 reader once through `PinnedArtifact.install`, verify its previously measured executable digest, then run its real `version` probe. Use the actual reader path for every subsequent build-info call.
4. For each of the four targets, call real `BackendToolkit.prefetch(["kubeconform"], target)` under the fresh root. Require exactly the requested target's `ready` result, expected engine/version/path and a regular, nonsymlink, single-link installed file. Retain that actual prefetch state. Its `ready` value means cross-target bytes are prepared; it is not a foreign native execution verdict.
5. Read/hash the installed member and validate its bounded target header. Save only metadata, never the binary. Independently acquire the same pinned archive as a raw artifact through `PinnedArtifact.install`; require its actual digest and byte length to equal the frozen pin/publisher size.
6. List the actual archive members with bounded real `tar -tzf` or `unzip -Z1`. Require safe, unique relative names and exactly one selected executable member. Obtain that member's real bytes with `tar -xOf` or `unzip -p`; require equality of size and digest with the installed executable. Retain process metadata and the exact member list.
7. Collect every actual archive notice member matching the existing P0A notice-name policy, preserving exact paths, bytes, hashes and their native extraction outcomes. Do not assume every archive has the same `LICENSE` or a single notice.
8. Run **only the Linux reader command** with `version -m -json <foreign-file>`, retaining stdout, stderr and full outcome counters. Require exit 0, no failure/timeout/overflow/memory signal/truncation, exact retained-byte accounting, one strict BuildInfo object and the actual expected GOOS/GOARCH. Require CGO disabled for this bounded inventory model. Rehash the inspected executable after the read to bind the result to unchanged input bytes.
9. Write each target observation before moving on. Aggregate the four new records and the verified prior Linux record. Derive compiler/module target membership from those actual five records, not from the source lock or an assumed common build.
10. Resolve that observed union against the already pinned source inventories and real retained notice bodies; verify every reused body's hash/length. Write the final union report only after the checks below. Retain partial discovery/failure records on failure.

The installed foreign executable paths are never command names. No `-v`/`--version` probe, shell launcher, Wine, QEMU, container emulator or alternate interpreter executes them. The measurement's command helper should expose fixed reader/list/member operations rather than arbitrary target-command execution. The expected foreign `ready` states are observable outputs of the actual cross-prefetch API, not fixture-supplied results.

The reader environment is constructed explicitly, with `GOROOT` set to its prepared root and `GOENV=off`, `GOTOOLCHAIN=local`, `GOWORK=off`, `GOPROXY=off`, `GOSUMDB=off`, isolated home/cache/temp and no inherited Go flags. `ResearchProcess.run` already uses `extendEnv:false`. No `go build`, `go list`, module download or source-toolchain selection is needed.

## 5. Compiler/module/notice union and fail-closed limits

The only compiler source currently grounded by P0A2 is **go1.26.3**, commit `2dc996f71b0ebafb77e64433e58333e049488a3c`, with exact retained LICENSE/PATENTS bytes. The only candidate module mappings are the eight exact path/version entries and notices in the reviewed P0A source inventory. These are initial mapping inputs, **not predictions about the four unmeasured files**.

For every observed target:

- Retain complete raw BuildInfo, including compiler string, main module, dependencies, replacements, sums and settings. Do not drop an unfamiliar field to make parsing pass.
- Require the kubeconform main package/module identities and release version. If VCS metadata is present, compare it with pinned upstream commit `02374e583d700721f57300fae78e11acd27ee539`; retain missing metadata explicitly, without an attestation claim.
- A replacement module, unknown compiler, unknown dependency version, present-but-mismatched module Sum, wrong target/CGO setting or unsupported header blocks a complete union. Keep the actual observations and name the unresolved association.
- Missing binary module `Sum` remains missing. Source-lock checksums may identify candidate source inputs but must not be promoted into binary-provided checksums.
- Use only source bodies already pinned and retained, or new exact commit/content pins reviewed after discovery. Never restore the unauthenticated dynamic tag lookup that failed in P0A1, guess another Go compiler's notices, or fetch a model/observed-version URL without a reviewed pin.

If all five compiler/module sets are covered by the existing source pins, no new source-version discovery is necessary: verify and retain the P0A2 source/notice bytes with their new five-target associations. Actual archive-distributed notice bodies still come from each of the four newly read archives. If new versions appear, the first P0B output is an **incomplete discovery packet**; the lead reviews additional primary-source pins before any subsequent completion attempt. Do not relax assertions or label a partial union complete.

The union must retain per-target provenance for each compiler and module, and component/source path/commit/hash/target associations for every notice. Identical notice bytes may share storage, but distinct module/source origins must remain in the manifest. Derive membership from BuildInfo and archive observations; do not assert that every vendored source package was linked merely because it appears in `vendor/modules.txt`.

`NativeEngine.notices` is one optional array on the engine, outside `targets`. The installer applies that same array for every target and validates destinations against each target's layout and case-fold rules. A conservative verified union is therefore the right evidence input. Future notice filenames must be unique under those rules, and every body must keep its exact pinned identity. This contract neither changes that schema nor decides the final notice payload. The [existing notice adapter](https://github.com/gustavomhss/hugr-orchestra/blob/432c8415bb657c0041fd6b0fba084fa8e1d7a07d/packages/core/src/backend-toolkit/notice-sources.ts) can later translate reviewed raw/archive notice entries without concatenating or rewriting their text.

MPL-bearing HashiCorp notice files are retained as source facts. Five-target observation does not itself settle license obligations, compatibility, source offers, signature/attestation verification, or owner approval. Those remain explicit separate decisions/evidence.

## 6. Bounds, retained output and claim vocabulary

Reuse P0A's existing bounded execution: 30-second subprocess timeout, 256 MiB process-tree RSS cap, 4 KiB reader-version output, 256 KiB BuildInfo output, 64 KiB archive listing, 64 MiB executable-member output, 128 KiB per notice and a 600-second single test timeout. Reject stream incompleteness instead of parsing a retained suffix. Validate raw archive size against each exact frozen size. The existing provisioner retains its own acquisition bounds; do not change production downloader behavior in this measurement.

Retained output under `test-ci-evidence/kubeconform-p0b`:

- `provenance.json`, exact input inventory and the real reader version/process/hash record.
- `targets/<target>/`: actual prefetch state, archive/member list and notice inventory, installed/member/header identity, raw BuildInfo stdout/stderr and native reader/extractor outcomes.
- Verified prior-Linux reference records, clearly marked as P0A2 reuse.
- Required source/notice bodies and an origin index; exact bytes only, with no executables or archives in upload.
- `discovery.json` after all available target reads, including unresolved mappings, followed by `measurement.json` only when the five-target union is complete.

The final report should discriminate `origin:{kind:"this-run",workflowSHA,runID}` from `origin:{kind:"p0a2",source,snapshot,runID,artifactID}`. Each target carries its archive and executable identity plus the raw BuildInfo artifact hash. Union entries carry the target IDs that actually reported them. Avoid the ambiguous generic `baseline` field used by the original source inventory.

Always retain these claim limits: `foreignTargetsExecuted:false`, `nativeQualificationChanged:false`, `analysisQualified:false`, `productionNoticesInstalled:false`, `noticeDistributionClosed:false`, `signatureAttestationVerified:false`. P0A2's prior native Linux version observation remains attributable to P0A2; P0B does not erase it or relabel the new foreign reads as native runs.

## 7. Minimal fixture and CI delta

Keep `kubeconform-p0a.test.ts` and `kubeconform-p0a.sources.json` byte-identical. Do not import the P0A test module, which would register its test. The new fixture may import its source JSON and copy the small measurement helpers locally; it uses the already existing `prefetch`, `PinnedArtifact`, `ResearchProcess`, pure floor scanner, `testEffect` and Omni control APIs. There is no need to create a new production helper or parser library.

The focused request is Core, `packages/core`, with args `["./test/review-toolkit/kubeconform-p0b.test.ts", "--timeout", "600000"]`, runner `bun`, requested `env:{}`. Use the same focused Linux workflow mechanism as P0A: Core typecheck followed by the selected test, plus an `always()` Linux artifact upload for the new P0B evidence directory. Preserve workflow matrix/controls/native Omni gates; no skip-based multihost claim.

The lead has confirmed the retained-evidence parent `3de68057…`. Before publishing source, reviewers confirm the two new files, source hashes and request/workflow snapshot. After the hosted run, completion still requires reading logs and the actual uploaded bytes, checking source/snapshot equivalence, process counters, target identities, raw BuildInfo and the derived notice union. A type/download/process/format/mapping failure is not a completed measurement and must remain visible.

The lead authorized only these two new test-only files and this contract. No production or measured P0A edits, local tests/typecheck/runtime execution, foreign binary execution, refs or hosted dispatch are authorized to the author. The lead will publish the reviewed source and dispatch the Linux qualification lane. The later global notices installation, native analyzer/public-route qualification and any target runtime claim require their own concrete review and acceptance evidence.
