import type { Pack } from "../manifest"

// Apache publishes no datafusion-cli binaries, only source, so the host builds the crate. Its `rust-version` is 1.94.0,
// which the Rust runtime satisfies. The pin is the crate's sha256 in SRI form, from the crates.io `checksum`, which its
// download matched.
const VERSION = "55.1.0"

// The default feature set. aws-lc-rs, ring, zstd and mimalloc still compile C, so the build host needs a C compiler and
// linker: the Xcode command line tools on macOS, cc on Linux.
export default {
  id: "datafusion-cli",
  version: VERSION,
  license: "Apache-2.0",
  upstream: "apache/datafusion",
  runtime: "rust",
  install: {
    kind: "source",
    artifact: {
      url: `https://static.crates.io/crates/datafusion-cli/datafusion-cli-${VERSION}.crate`,
      integrity: "sha256-/7mDOhAvAaJXmU3pZsc/v3RB2DRyB9hnbIIbcxjAPuY=",
      format: "tar.gz",
      // PinnedArtifact refuses `.` as a destination, so the crate root is lifted member by member; `examples` and
      // `tests` come along so every target path the manifest declares exists, and `README.md` because lib.rs includes it.
      entries: ["Cargo.toml", "Cargo.lock", "README.md", "src", "examples", "tests"].map((name) => ({
        from: `datafusion-cli-${VERSION}/${name}`,
        to: `src/${name}`,
      })),
    },
    build: "cargo",
    path: ".",
    binary: "datafusion-cli",
  },
  launch: [],
  // The msvc toolchain links only through Microsoft's `link.exe`, and the standalone gnu toolchain ships a linker but
  // no C compiler for the C dependencies.
  unsupported: { "win32-x64": "needs-msvc-linker" },
  fit: { role: "check", input: "the schema DDL and the SQL the change wrote", skills: ["backend-data", "backend-check"] },
} as const satisfies Pack
