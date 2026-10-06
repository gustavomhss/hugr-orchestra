import type { PinnedArtifact } from "../../pinned-artifact"
import type { TargetId } from "../target"
import type { BackendToolkitManifest } from "../manifest"

// Milestone 5 frozen shapes, kept local until the manifest grows the `rust` runtime and the `source` install kind.
type RuntimeId = BackendToolkitManifest.RuntimeId | "go" | "rust"
type Runtime = Omit<BackendToolkitManifest.Runtime, "id"> & { readonly id: RuntimeId }
type HostedEngine = Omit<BackendToolkitManifest.HostedEngine, "id" | "runtime" | "install"> & {
  readonly id: BackendToolkitManifest.EngineId | "ogen" | "sqlx"
  readonly runtime: RuntimeId
  readonly install:
    | BackendToolkitManifest.HostedEngine["install"]
    | {
        readonly kind: "source"
        readonly artifact: PinnedArtifact.Artifact
        readonly build: "go" | "cargo"
        readonly path: string
        readonly binary: string
        readonly features?: ReadonlyArray<string>
      }
}

// Pins are the sha256 digests in SRI form: each toolchain's from its static.rust-lang.org `.sha256` companion, which
// the downloaded darwin-x64 archive matched; the crate's from the crates.io index `cksum`, which its download matched.
const RUST_VERSION = "1.99.0"
const SQLX_VERSION = "0.9.0"

// The standalone archive expects its `install.sh`; moving these component directories instead lays out the same
// sysroot. `rustc` finds `lib/rustlib/<triple>/lib` (from rust-std) relative to its own `bin`, and none of these
// destinations overlap. Cargo looks for `rustc` on PATH, so the build sets RUSTC to this runtime's `bin/rustc`.
const rust = (triple: string, integrity: PinnedArtifact.Artifact["integrity"]) => {
  const root = `rust-${RUST_VERSION}-${triple}`
  const exe = triple.includes("windows") ? ".exe" : ""
  return {
    artifact: {
      url: `https://static.rust-lang.org/dist/${root}.tar.gz`,
      integrity,
      format: "tar.gz" as const,
      entries: [
        { from: `${root}/rustc/bin`, to: "bin" },
        { from: `${root}/rustc/lib`, to: "lib" },
        { from: `${root}/cargo/bin/cargo${exe}`, to: `bin/cargo${exe}` },
        { from: `${root}/rust-std-${triple}/lib/rustlib/${triple}/lib`, to: `lib/rustlib/${triple}/lib` },
        ...["COPYRIGHT", "LICENSE-APACHE", "LICENSE-MIT"].map((name) => ({ from: `${root}/${name}`, to: name })),
      ],
    },
    executable: `bin/cargo${exe}`,
  }
}

export const RUST: Runtime = {
  id: "rust",
  version: RUST_VERSION,
  license: "MIT OR Apache-2.0",
  upstream: "rust-lang/rust",
  targets: {
    "darwin-arm64": rust("aarch64-apple-darwin", "sha256-8158Wyz2PmfAddMj5Na4dQEhkxHwl0SrJMrst2HJZkM="),
    "darwin-x64": rust("x86_64-apple-darwin", "sha256-WWdWEBv0PNM1+yR/XMnt4MFXJFUjuv8lpmaUaCSVz8s="),
    "linux-arm64": rust("aarch64-unknown-linux-gnu", "sha256-QiFOaT7ABzPipZHmfBOvmPrwKoKTQQip83r9JHs3bdA="),
    "linux-x64": rust("x86_64-unknown-linux-gnu", "sha256-3gWByp1zIpWmR0z70CRh2yfWms1QUKggZSOo1voVmds="),
    "win32-x64": rust("x86_64-pc-windows-msvc", "sha256-2MIRV+cNhsboYdV9nBkaefR7lAtPzUjClECy9KPIqlE="),
  },
}

// The feature set of research/delivery-toolkit.md: rustls instead of the default native-tls, so no system OpenSSL.
// ring (rustls) and the bundled SQLite still compile C, so the build host needs a C compiler and linker: the Xcode
// command line tools on macOS, cc on Linux.
export const SQLX: HostedEngine = {
  id: "sqlx",
  version: SQLX_VERSION,
  license: "MIT OR Apache-2.0",
  upstream: "transact-rs/sqlx",
  runtime: "rust",
  install: {
    kind: "source",
    artifact: {
      url: `https://static.crates.io/crates/sqlx-cli/sqlx-cli-${SQLX_VERSION}.crate`,
      integrity: "sha256-k+84V6SgtI/L9Ta3epEio1x2MWhvLM+8deYWM1dx6NA=",
      format: "tar.gz",
      // PinnedArtifact refuses `.` as a destination, so the crate root is lifted member by member; `tests` comes along
      // so every target path the manifest declares exists.
      entries: ["Cargo.toml", "Cargo.lock", "README.md", "LICENSE-APACHE", "LICENSE-MIT", "src", "tests"].map((name) => ({
        from: `sqlx-cli-${SQLX_VERSION}/${name}`,
        to: name,
      })),
    },
    build: "cargo",
    path: ".",
    binary: "sqlx",
    features: ["rustls", "postgres", "mysql", "sqlite", "sqlx-toml"],
  },
  launch: [],
}

/**
 * Targets where the engine cannot be built, with the reason. The msvc toolchain links only through Microsoft's
 * `link.exe`, and the standalone gnu toolchain ships a linker but no C compiler for ring and SQLite.
 */
export const SQLX_UNSUPPORTED: Readonly<Partial<Record<TargetId, string>>> = { "win32-x64": "needs-msvc-linker" }
