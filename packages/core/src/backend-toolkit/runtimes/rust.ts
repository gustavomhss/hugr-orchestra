import type { PinnedArtifact } from "../../pinned-artifact"
import type { Runtime } from "../manifest"

// Pins are the sha256 digests in SRI form, each from its static.rust-lang.org `.sha256` companion, which the downloaded
// darwin-x64 archive matched.
const RUST_VERSION = "1.99.0"

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

export default {
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
} satisfies Runtime
