# Q1 jvm-mobile source facts — 3

Source facts for five future tools, from the frozen jvm-mobile packet only. Not a live Orchestra integration, lane decision, noexec or offline certification, or redistribution approval. An unknown SDK or toolchain hash is not an installable binary.

## Stryker.NET 5.1.0

- Artifact: NuGet DotnetTool `dotnet-stryker` 5.1.0, commit `7052fa6c646a6bdfb143608e695d11542e2be815`, not a GitHub asset. Catalog SHA512 `KEvgkkxdQJb7X6zOM5zfkoRujo6ykZfl5DaAEbcOBkGMrK0hlsQuSVtCuSD0jBlkfdeYKAtArRsOraTi4h/lZw==` matched a prior nupkg (44823148 bytes, sha256 `3c28fd73556a35aac6bb616322e15c1a1fe07f9054b8c8208726c307de90fb16`). Package digest, not license digest; not rehashed here. No native bin. SDK hash unknown.
- License: Apache-2.0. Tag LICENSE sha256 `0d542e0c8804e39aa7f37eb00da5a762149dc682d7829451287e11b938e94594` (LF, 10174 bytes) matched an audit; cached rehash is that digest, not a new download. Nupkg LICENSE differs (CRLF, sha256 `eb3d7b5485466acbd81f2b496f595ab637d2792e268206b27d99e793bdb67549`). Catalog licenseExpression null. Notices uncaptured. Not redistribution approval.
- Use: Mutation-tests a .NET test project: `dotnet tool install -g dotnet-stryker`, then `dotnet stryker`. Framework also needs `--solution`. `init` writes `stryker-config.json`. Default runner vstest; mtp allowed.
- Output/exits: Default html and progress. HTML is `StrykerOutput/<local-timestamp>/reports/mutation-report.html`; JSON is `mutation-report.json` there. Writes `StrykerOutput/.gitignore` (`*`) if missing. Exits: 0 success, 1 other/parse error, 2 if score is under a non-default break. Docs say 1; code is 2. Default break is 0.
- Effects: Config `stryker-config.json`/yaml or `--config-file`; plugins can run code. Network: NuGet install, version check unless skipped, dashboard/Azure/S3 if set, unlisted feeds/tests. Children: vstest.console plus testhost; mtp `dotnet` plus assembly, loopback JSON-RPC, Microsoft.Testing.Platform.ServerMode.Client.Sources 2.5.2 nupkg sha256 `9370b592f7c27c07efb836219983bc28a4b80850ba951d36c1a0419b3b048dc4` (not Stryker digest); nuget.exe truncated. Writes output, reports, temp vstest, mutant files.
- Limits: Break-exit docs contradict code. Diagnostics and per-mutant copies not fully audited; absence unclaimed. Third-party bundling unqualified.

Sources: https://api.nuget.org/v3/catalog0/data/2026.11.10.19.42.44/dotnet-stryker.5.1.0.json https://api.nuget.org/v3-flatcontainer/dotnet-stryker/5.1.0/dotnet-stryker.5.1.0.nupkg https://raw.githubusercontent.com/stryker-mutator/stryker-net/dotnet-stryker@5.1.0/LICENSE

## PublicApiAnalyzers 5.6.0

- Artifact: NuGet `Microsoft.CodeAnalysis.PublicApiAnalyzers` 5.6.0, 951120 bytes, sha256 `d3ea70f5682d7538e628e8bfff90632649e7702d9e4ebf365c643ed82ee1e510`. Catalog SHA512 `UgVfpS/SFon+5QvF3Yjeg5yQjVg1FF92K9g3y1wIyLrBEFCfogMJ95/GlcvRXMHzyLeOovWOWS/9aBiinmy9AQ==` matches those bytes. Published 2026-07-02, Microsoft, commit `c0573ed0a7dc3e3b4d2e70da47f97cc51a35524f`. Highest stable. `.signature.p7s` present, unverified. Analyzer package, not a CLI.
- License: MIT. License.txt sha256 `ae48df11a335dc1a615f4f938b69cba73bcf4485c4f97af49b38efb0f216353b` is text, not the nupkg. NuGet MIT HTML sha256 `0ff20ddac3d7ee3c94cd6b60bef6537b4c4f6815063ab28228ab8ca563b1fe8e` does not match. Nupkg has no LICENSE. ThirdPartyNotices.txt sha256 `0eabe2880daf9bfb25ac160b1e779c5da95a88406dd06cdb570ec7edb5eabb76` includes Apache-2.0, so MIT does not qualify every notice.
- Use: Roslyn public-API check via PackageReference `Microsoft.CodeAnalysis.PublicApiAnalyzers`, not a command. Reads AdditionalFiles `PublicAPI.Shipped.txt`, `PublicAPI.Unshipped.txt`, and the InternalAPI pair. Targets include the PublicAPI files only if they already exist. Compiler loads the analyzer DLL.
- Output/exits: Compilation warnings, not a JSON/SARIF run. Packaged sarif is a catalog. Enabled: RS0016, RS0017, RS0022, RS0024–RS0027, RS0036, RS0037, RS0041, RS0048, RS0050. RS0051–RS0061 off. No own exit. Fail only if warnings are errors; props can exempt these ids.
- Effects: Config: API lists, `require_api_files`, `skip_namespaces`. True `require_api_files` with both files missing is silent bail, not a clean result. Network: restore only; no HTTP client in source; DLL not disassembled. Children: none inspected; DLL in-process; CodeFixes.dll not spawned. Writes: no File.Write seen; RS0016 fix can create both PublicAPI files.
- Limits: DLL not proved built from `c0573ed0`. Signature unverified. DLL runtime network unknown. Silent bail is not a guarantee.

Sources: https://api.nuget.org/v3-flatcontainer/microsoft.codeanalysis.publicapianalyzers/5.6.0/microsoft.codeanalysis.publicapianalyzers.5.6.0.nupkg https://api.nuget.org/v3/catalog0/data/2026.07.02.21.12.45/microsoft.codeanalysis.publicapianalyzers.5.6.0.json https://raw.githubusercontent.com/dotnet/roslyn/c0573ed0a7dc3e3b4d2e70da47f97cc51a35524f/License.txt

## SwiftLint 0.65.1

- Artifact: `portable_swiftlint.zip` (universal macOS), uploader SimplyDanny, 2026-08-21T20:29:47Z, id 374641596. Publisher digest sha256 `c1e429b0599cf1b516f369a2d9ec04eaf0e436f3c12b637df8851fa52ff694d0` matches an independent hash of the download (11952647 bytes). Zip digest, not license digest. Members `swiftlint`, `LICENSE`. Signature unverified. Other assets not selected or hashed.
- License: MIT. Tag LICENSE sha256 `6a4395f3b744b8cd94b6c810bc705440a75f1929689b65d2f557ee3e9895632f` (1094 bytes) is the text digest, not the zip. Zip LICENSE member unhashed. Copyright 2025 The SwiftLint Contributors.
- Use: Prints Swift style and convention violations. `swiftlint` defaults to `lint`; paths default to cwd. `--strict` promotes warnings (off by default). `--config` selects `.swiftlint.yml`. `--disable-sourcekit` skips SourceKit rules.
- Output/exits: Default xcode lines on stdout unless `--output`. JSON: file, line, character, severity, type, rule_id, reason. SARIF 2.1.0 optional. `exit(2)` on serious violations; warnings do not unless strict. No literal `exit(0)`. Bad `pinnedVersion` is `exit(2)`. Unknown reporter and strict+lenient: fatal, numbers unread.
- Effects: Config `.swiftlint.yml` or `--config`. Regex rules match text, not code; Swift custom rules need a rebuild, not a plugin. Default lint is offline unless an update-check GET, an http(s) config URL, or `docs` (opens https://realm.github.io/SwiftLint/). Host list stays open. Children: fetched lint spawns none; SourceKit in-process; SourceKitten uninspected, so no-child unproved. `docs` spawns open, xdg-open, or cmd. Writes `--fix`, `--output`, optional baseline/cache/benchmark.
- Limits: Binary not executed; not runtime approval. Signature unverified. Fatal and invalid-usage numbers unknown. Default cache path unknown. Third-party bundling unqualified.

Sources: https://api.github.com/repos/realm/SwiftLint/releases/tags/0.65.1 https://github.com/realm/SwiftLint/releases/download/0.65.1/portable_swiftlint.zip https://raw.githubusercontent.com/realm/SwiftLint/0.65.1/LICENSE

## Periphery 3.8.0

- Artifact: `periphery-3.8.0.zip`, uploader ileitch, 2026-07-25T08:22:11Z. Publisher digest sha256 `07d4e286e31dd79164df39097e0b59f533c94badbe18158464a455ea88a166d7` matches an independent hash of the download (8773347 bytes). Zip digest, not license digest. Members `periphery`, `libIndexStore.dylib`, `LICENSE.md`. Inner binary unhashed. Signature unverified. Other zips not rehashed.
- License: MIT. LICENSE.md sha256 `b891b5a1bb198446c7b5eef37821cdc5cd3dd230bade59761b45b9b9a71149dc` (1050 bytes, Copyright 2019 Ian Leitch) is the text digest. Zip member matches that digest, not the zip hash. Binary notices uncaptured.
- Use: Scans for unused code: `periphery scan`. `--setup` is guided. Default format xcode. `--strict` off unless set. Args after `--` go to `swift build` or `xcodebuild`. Builds unless `--skip-build`.
- Output/exits: Unused-code text. Xcode default: `path:line:column: warning:` plus text, or `No unused code detected.` JSON is objects, not SARIF. Success returns, no `exit` call. Throws map to EXIT_SUCCESS, EX_USAGE, or EXIT_FAILURE (ArgumentParser 1.7.1). Strict findings are EXIT_FAILURE. Integers unexpanded.
- Effects: Config `.periphery.yml`/`.periphery.yaml` or `--config`; YAML is settings, not a plugin. Unless `--skip-build`, `/bin/bash -c` can run project build code and network. Network: xcode default GETs GitHub latest unless disabled; other formats skip; build hosts unlisted. Children: bash, xcodebuild, clean `rm -rf`, `bazel query`; `swift build` argv unread. Writes products/index; optional baseline/results; setup file only after yes if non-default.
- Limits: EXIT_* integers unknown. Swift-build argv unread. Inner binary hash unknown. Signature unverified. Binary not executed.

Sources: https://api.github.com/repos/peripheryapp/periphery/releases/tags/3.8.0 https://github.com/peripheryapp/periphery/releases/download/3.8.0/periphery-3.8.0.zip https://raw.githubusercontent.com/peripheryapp/periphery/3.8.0/LICENSE.md

## swift package diagnose-api-breaking-changes swift-6.4.2-RELEASE checkout scheme names swiftpm branch release/6.4.2; branch tip commit seen 8054c59f07a9c8cc8e67b3ec57870710c7154854. APIDiff.swift bytes identical at that tip and at last file commit 7f95f588ad40a748522e7be928daadc079a66c3c (sha256 bc432d7e199263b2e99085ce7dde8a5279c7367dab634d496423ea3309578a75). Exact tag gitlink not captured.

- Artifact: No separate binary. Unhashed ubuntu22.04 tarball: HEAD 200, 1123491416 bytes, Last-Modified Wed, 28 Oct 2026 15:58:07 GMT, ETag `CC599F694A2142D164313E74C940FDE2` (not a SHA256). Sig 819 bytes, unverified. Not an auto-install binary.
- License: Apache-2.0 plus Runtime Library Exception. Tag LICENSE.txt sha256 `770af8291f708538d8ff885a0bbc4e045cd700531741c4f99528d435c14d7f55` (11751 bytes) is text, not the toolchain. swift.org LICENSE.txt sha256 `167beb36f181bd163c93c6feb45c68e5f9462fe1af55b278f7bfd1df20e673a3` (11753 bytes) adds the exception; not the audit hash. Notices uncaptured.
- Use: `swift package diagnose-api-breaking-changes <treeish>` compares package API to a baseline. Flags `--breakage-allowlist-path`, `--products`, `--targets`, `--baseline-dir`, `--regenerate-baseline`. GlobalOptions unread. `experimental-api-diff` fails after a rename note.
- Output/exits: Text, not JSON/SARIF. `No breaking changes detected in <module>`, a count line, or a skip sentence if the module is absent. Baselines are `<module>.json`. Success returns; 0 not re-read. Native throws `ExitCode.failure` (integer unread). Swiftbuild breaks throw `ExitCode(1)`.
- Effects: Config Package.swift; allowlist is data; plugins can run code, one path unwired. Network: local checkout; fetch unread, no-network unclaimed. Children: `swift-api-digester` `-dump-sdk`/`-diagnose-sdk` (body unread) plus build. Writes apidiff JSON or `--baseline-dir`; swiftbuild `--regenerate-baseline` deletes the baseline directory first, not every path; diagnostics kept. Checkout removal not unconditional.
- Limits: Gitlink, toolchain SHA256, signature, GlobalOptions, and failure integer unknown. Release list API 403.

Sources: https://raw.githubusercontent.com/swiftlang/swift/swift-6.4.2-RELEASE/LICENSE.txt https://raw.githubusercontent.com/swiftlang/swift-package-manager/8054c59f07a9c8cc8e67b3ec57870710c7154854/Sources/Commands/PackageCommands/APIDiff.swift https://download.swift.org/swift-6.4.2-release/ubuntu2204/swift-6.4.2-RELEASE/swift-6.4.2-RELEASE-ubuntu22.04.tar.gz
