import type { Pack } from "../manifest"

// The pin is the crate's sha256 in SRI form, from the crates.io index `cksum`, which its download matched.
const VERSION = "0.24.1"

// Built from the crate: upstream's release binaries are `.tar.xz`, which PinnedArtifact does not unpack, and cover no
// Windows target. `cli` is the crate's only default feature and gates the binary. kube's rustls pulls in ring, which
// compiles C, so the build host needs a C compiler and linker: the Xcode command line tools on macOS, cc on Linux.
export default {
  id: "kopium",
  version: VERSION,
  license: "Apache-2.0",
  upstream: "kube-rs/kopium",
  runtime: "rust",
  install: {
    kind: "source",
    artifact: {
      url: `https://static.crates.io/crates/kopium/kopium-${VERSION}.crate`,
      integrity: "sha256-Fcw6D/0oHqbjZpbJotOmp6nm6hzw01tdq1TAIdreb8k=",
      format: "tar.gz",
      // PinnedArtifact refuses `.` as a destination, so the crate root is lifted member by member; `tests` comes along
      // so every target path the manifest declares exists.
      entries: ["Cargo.toml", "Cargo.lock", "README.md", "LICENSE", "src", "tests"].map((name) => ({
        from: `kopium-${VERSION}/${name}`,
        to: `src/${name}`,
      })),
    },
    build: "cargo",
    path: ".",
    binary: "kopium",
    features: ["cli"],
  },
  launch: [],
  // The msvc toolchain links only through Microsoft's `link.exe`, which the Rust runtime does not ship.
  unsupported: { "win32-x64": "needs-msvc-linker" },
  fit: { role: "generator", input: "a CustomResourceDefinition file the packet supplies", skills: ["backend-api"] },
} as const satisfies Pack
