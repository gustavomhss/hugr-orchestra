# Local check artifact qualification — P0A

This records downloaded bytes and static binary metadata for shfmt 3.14.1 and cargo-machete 0.9.2. It does not enable a pack or qualify runtime execution. The [implementation plan in issue #1558](https://github.com/gustavomhss/hugr-orchestra/issues/1558) remains NO-GO for author fan-out.

Baseline: `66d258294b4e85c5fbc5b37ca3668c0f3687fc41`. [Machine-readable artifact matrix](local-check-artifacts.json) records all ten exact release URLs, publisher and measured hashes, SRI pins, archive members, executable hashes, architectures and measured static floors.

## Verified results

All ten local artifact SHA-256 values matched the selected release API digests. cargo-machete's five SHA-256 sidecars also matched (hex case normalized). Binary headers matched the five intended target architectures. No downloaded executable was run. No signature attestation was verified; a publisher digest match is not a signature check.

shfmt releases are raw binaries, not archives. cargo-machete uses tar.gz on every selected target, including Windows; its binary is inside a version/target directory. Extraction must use the exact member names in the matrix. The Windows archive's license text has CRLF and differs in byte hash from the tagged LF file; do not reuse one file's hash as another's.

| Tool | Target | Static floor / observed requirement |
| --- | --- | --- |
| shfmt | darwin-arm64 | macos 13.0 |
| shfmt | darwin-x64 | macos 13.0 |
| shfmt | linux-arm64 | No additional floor inferred by this scanner |
| shfmt | linux-x64 | No additional floor inferred by this scanner |
| shfmt | win32-x64 | windows 10.0 |
| cargo-machete | darwin-arm64 | macos 11.0 |
| cargo-machete | darwin-x64 | macos 10.12 |
| cargo-machete | linux-arm64 | glibc 2.39 |
| cargo-machete | linux-x64 | No additional floor inferred by this scanner |
| cargo-machete | win32-x64 | No additional floor inferred by this scanner; VCRUNTIME140.dll/UCRT imports |

The selected cargo-machete Linux x64 asset is the published musl variant, whose ELF metadata reports static linking. Linux ARM64 is the available GNU asset and imports glibc 2.39; it is not equivalent to the static x64 asset. macOS requirements come from load commands. Windows floor scanning is limited to known imports/header metadata; it does not prove that the required CRT DLLs exist. None of these static observations enables a target.

## Notice evidence and remaining work

For shfmt, `go version -m` read all five binaries without running them. Each reports Go 1.27.1 and the same five dependency modules. All five module h1 sums matched the downloaded module zip contents. The main module and five dependency module notice files, plus Go's license, were retained. A deliverable notice bundle and independent distribution review remain pending.

For cargo-machete, 75 registry packages from the tagged Cargo.lock matched their crate checksums; 144 named notice/copyright/author files were retained. This is a conservative source-lock inventory, not proof of the exact link closure on every target. All five binaries embed the same Rust source path marker; that commit's src/version says 1.94.1. Root Rust licenses and COPYRIGHT were retained, but the marker is not a signed build attestation and root licenses alone do not close compiler/std or bundled C notice delivery.

Remaining P0A work: deliver and qualify the appropriate notice bundles, bind host runtime prerequisites to readiness, and implement candidate manifests with these measured pins/floors only after their prerequisites are satisfied. Do not add these engines to ENGINES or the Lucy catalog on the strength of this report. P0B/P0C and adapter author dispatch remain held. Runtime tests belong on GitHub Actions; none ran locally or as part of this static inspection.

## Reproduction and retained evidence

Release metadata: [shfmt v3.14.1](https://github.com/mvdan/sh/releases/tag/v3.14.1), [cargo-machete v0.9.2](https://github.com/bnjbvr/cargo-machete/releases/tag/v0.9.2). Download the exact URLs in the matrix, calculate SHA-256, list tar members without extracting arbitrary paths, and inspect executable headers. The in-repo static scanner is packages/core/script/toolkit-floors.ts (`scan`); it reads bytes without launching the inspected programs. Go's `go version -m <file>` reads embedded build information.

The owned recovery directory retains release API responses, original downloads, extracted byte copies, floors.json, artifact hashes, Windows import listing and source notice inventories. Those downloads and source archives stay outside the repository. This report and the matrix are repository-only material and are not runtime integrations.
