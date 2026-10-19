# Backend toolkit measured host floors

Measured statically (F5.4, F5-D1) from the pinned artifacts: nothing below was executed. `packages/core/script/toolkit-floors.ts`
downloads each artifact, checks its pinned digest, unpacks it and reads every executable or shared object the install lays
down: ELF version needs (`GLIBC_x.y`), Mach-O `LC_BUILD_VERSION` / `LC_VERSION_MIN_MACOSX` per slice, PE headers and
imports. Cross-checked against `otool -l` (Mach-O) and `strings` (ELF) on samples. The values are recorded as `floor` on
each pack and runtime, and `target.ts` `below()` refuses a host under the maximum of an engine's own floor, its owned
dependencies' floors and its runtime's floor, as `unsupported-target:<engine>:glibc-below-<x>` (also
`macos-below-<major>`, `windows-below-<build>`), before any fetch. The global Node 22 floor (glibc 2.28, macOS 11, Windows 10,
AVX2) is unchanged and applies first.

Re-measure with `cd packages/core && bun script/toolkit-floors.ts [--engine <id>] [--runtime <id>] [--target <t>] [--check]`;
`script/toolkit-pack.ts bump <id> <version>` runs the check for the bumped pack. Measured against: Node 22.23.2,
Java Temurin 17.0.20.1+1, CPython 3.13.16 (python-build-standalone 20261003), Go 1.25.14, Rust 1.99.0.

## Highlights

- **Highest glibc: 2.34**, set by `ast-grep` (linux-x64), `squawk` and `postgres-language-server` (both Linux targets). A host
  on glibc 2.28 to 2.33 (RHEL 8 at 2.28, Debian 11 and Ubuntu 20.04 at 2.31) passes the Node floor but is now refused for
  those three engines only; RHEL 9 (2.34), Ubuntu 22.04 (2.35) and newer are unaffected. Next: Node 22 2.28 (`GLIBCXX_3.4.21`), kiota 2.27 (`GLIBCXX_3.4.22`), ast-grep linux-arm64 2.18,
  Python and Rust runtimes 2.17, JRE 2.17 (arm64) and 2.9 (x64).
- **Highest macOS: 12.0**, set by `sqlc`, `buf`, `kiota`, `controller-gen`, `kubeconform`, esbuild inside `orval`, and the Go
  toolchain (`ogen`, `gocqlx-schemagen`; Go 1.25 states it requires macOS 12 or later). macOS 11 hosts keep working for
  the other engines (Node, Python, JRE, Rust, `gitleaks`, `ast-grep`, `squawk`, `postgres-language-server`).
- **Windows: nothing above Windows 10.** No binary imports an API newer than Windows 10 RTM (the check looks for
  `SetThreadDescription` and the ConPTY calls, build 14393 and 17763); only the Temurin JRE stamps PE version 10.0. Go (1.21+) and Rust
  (`x86_64-pc-windows-msvc`) document Windows 10 as their minimum.
- **Static Go binaries** (`sqlc`, `buf`, `gitleaks`, `controller-gen`, `kubeconform`, esbuild, the Go toolchain) have no glibc
  floor on Linux. No Linux engine links musl; musl hosts stay refused by `detect`.
- **AVX2:** instruction use was not examined; the AVX2 floor remains the contract's claim.

## Source-built engines

`ogen`, `gocqlx-schemagen` (Go) and `sqlx`, `kopium`, `datafusion-cli` (Rust) are built by the host from pinned source, so the binary
never leaves the machine that built it: its glibc symbols come from the build host's own libc, and its macOS target is the
toolchain default. The floor that matters is the toolchain's, recorded on the `go` and `rust` runtimes. Measured on this
Mac (darwin-x64) by building a hello program with the pinned toolchains: Go 1.25.14 output `minos 12.0`; Rust 1.99.0 output
`minos 10.12` (x86_64; Rust documents aarch64-apple-darwin as 11.0+). Documented minimums: Go 1.25 macOS 12 ([Go 1.25
release notes](https://go.dev/doc/go1.25)), Go 1.21+ Windows 10 ([Go 1.20 release notes](https://go.dev/doc/go1.20));
Rust [platform support](https://doc.rust-lang.org/rustc/platform-support.html): Linux glibc 2.17+, macOS 11.0+ arm64 / 10.12+ x86_64, Windows 10+.
The Rust Windows packs are `needs-msvc-linker` and unsupported there. Linux built binaries were not built here (no Linux host on
this machine); the argument above is why they carry no floor of their own.

## Runtimes

| Pack | darwin-arm64 | darwin-x64 | linux-arm64 | linux-x64 | win32-x64 |
|---|---|---|---|---|---|
| node | macOS 11.0 | macOS 11.0 | glibc 2.28 | glibc 2.28 | none |
| java | macOS 11.0 | macOS 11.0 | glibc 2.17 | glibc 2.9 | Windows 10.0 |
| python | macOS 11.0 | macOS 10.15 | glibc 2.17 | glibc 2.17 | none |
| go | macOS 12.0 | macOS 12.0 | static | static | none |
| rust | macOS 11.0 | macOS 11.0 | glibc 2.17 | glibc 2.17 | none |

Notes: `rust` darwin-x64 11.0 comes from the arm64 slice of `librustc-stable_rt.rtsan.dylib`, which the install lays down; its
executables need 10.12. `java` win32 10.0 comes from the bundled Universal CRT forwarder DLLs (PE version 10.0). `python`
darwin-x64 10.15 is below the Node floor. Go's install also holds foreign ELF, Mach-O and PE samples under `testdata` and race
objects (`.syso`); the tool ignores both, and on each target the binaries of the other operating systems (pip's Windows
launchers) too.

## Downloaded binaries

| Pack | darwin-arm64 | darwin-x64 | linux-arm64 | linux-x64 | win32-x64 |
|---|---|---|---|---|---|
| ast-grep | macOS 11.0 | macOS 10.12 | glibc 2.18 | glibc 2.34 | none |
| sqlc | macOS 12.0 | macOS 12.0 | static | static | none |
| buf | macOS 12.0 | macOS 12.0 | static | static | none |
| gitleaks | macOS 11.0 | macOS 11.0 | static | static | none |
| kiota | macOS 12.0 | macOS 12.0 | glibc 2.27 | glibc 2.27 | none |
| controller-gen | macOS 12.0 | macOS 12.0 | static | static | none |
| kubeconform | macOS 12.0 | macOS 12.0 | static | static | none |
| squawk | macOS 11.0 | macOS 10.12 | glibc 2.34 | glibc 2.34 | none |
| postgres-language-server | macOS 11.0 | macOS 10.12 | glibc 2.34 | glibc 2.34 | none |

`none` is a dynamic binary with no version need above the base libc; `static` has no dynamic section.

## Hosted engines

- `orval`: the install adds esbuild's per-target binary (`@esbuild/<os>-<cpu>`): macOS 12.0 on both Darwin targets, static on Linux, none on Windows.
  Its other 100 packages are JavaScript (a full `npm ci --ignore-scripts` of the lock found no other native file).
- `datamodel-codegen`: the compiled wheels (black, markupsafe, pydantic-core, pytokens, pyyaml) per target.
  macOS 11.0 on darwin-arm64, macOS 10.13 on darwin-x64 (wheel tags `macosx_10_13_x86_64`),
  glibc 2.17 on linux-arm64, glibc 2.14 on linux-x64, none on Windows.
  All sit under the Node floor, so they refuse nothing today.
- `protoc-gen-es`, `kysely-codegen`, `modelina` (npm), `sqlglot` (pure wheel) and `openapi-generator` (jar): no native file of their own; they inherit the runtime's floor (Node, Python, Temurin 17).

## What this does not cover

- Static reading only. A dynamic dependency on another shared library (libicu for kiota, libstdc++ versions beyond `GLIBCXX`)
  is recorded here, not enforced: kiota needs `GLIBCXX_3.4.22` and Node `GLIBCXX_3.4.21` from the host's libstdc++.
- macOS floors compare the major version only (macOS N is Darwin N+9); every recorded floor that matters (11 and up) is a `.0` release.
- Linux musl, Windows on ARM and 32-bit targets stay refused by `detect`.
- Source-built engines were not built on Linux or Windows here; the toolchains' documented minimums and the runtime measurements stand in.
- The owner accepted these floors on 2026-10-11 (F5-D1).
