import type { PinnedArtifact } from "../../pinned-artifact"
import type { HostedEngine, Runtime } from "../manifest"

// placeholder: replaced by tk-rust. Every digest below is fake (all zero bytes) and fails verification by design.
const FAKE = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" as const
const RUST_VERSION = "1.94.0"
const SQLX_VERSION = "0.9.0"

// placeholder: replaced by tk-rust. The standalone installer is laid out by extraction alone, without its install.sh:
// rustc's bin/ and lib/ form the sysroot, cargo joins bin/, and the target's std moves under lib/rustlib/<triple>/lib.
// The host builds with RUSTC set to the rustc beside cargo.
const rust = (triple: string, integrity: PinnedArtifact.Artifact["integrity"]) => {
  const windows = triple.includes("windows")
  const root = `rust-${RUST_VERSION}-${triple}`
  return {
    artifact: {
      url: `https://static.rust-lang.org/dist/${root}.tar.gz`,
      integrity,
      format: "tar.gz" as const,
      entries: [
        { from: `${root}/rustc/bin`, to: "bin" },
        { from: `${root}/rustc/lib`, to: "lib" },
        { from: `${root}/cargo/bin/${windows ? "cargo.exe" : "cargo"}`, to: `bin/${windows ? "cargo.exe" : "cargo"}`, executable: true },
        { from: `${root}/rust-std-${triple}/lib/rustlib/${triple}/lib`, to: `lib/rustlib/${triple}/lib` },
      ],
    },
    executable: windows ? "bin/cargo.exe" : "bin/cargo",
  }
}

export const RUST: Runtime = {
  id: "rust",
  version: RUST_VERSION,
  license: "MIT OR Apache-2.0",
  upstream: "rust-lang/rust",
  targets: {
    "darwin-arm64": rust("aarch64-apple-darwin", FAKE),
    "darwin-x64": rust("x86_64-apple-darwin", FAKE),
    "linux-arm64": rust("aarch64-unknown-linux-gnu", FAKE),
    "linux-x64": rust("x86_64-unknown-linux-gnu", FAKE),
    "win32-x64": rust("x86_64-pc-windows-msvc", FAKE),
  },
}

// placeholder: replaced by tk-rust.
export const SQLX: HostedEngine = {
  id: "sqlx",
  version: SQLX_VERSION,
  license: "MIT OR Apache-2.0",
  upstream: "launchbadge/sqlx",
  runtime: "rust",
  install: {
    kind: "source",
    artifact: {
      url: `https://static.crates.io/crates/sqlx-cli/sqlx-cli-${SQLX_VERSION}.crate`,
      integrity: FAKE,
      format: "tar.gz",
      entries: [{ from: `sqlx-cli-${SQLX_VERSION}`, to: "src" }],
    },
    build: "cargo",
    path: ".",
    binary: "sqlx",
    features: ["rustls", "postgres"],
  },
  launch: [],
  unsupported: { "win32-x64": "needs-msvc-linker" },
}
