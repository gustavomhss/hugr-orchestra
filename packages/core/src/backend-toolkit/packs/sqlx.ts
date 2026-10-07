import type { Pack } from "../manifest"

// The pin is the crate's sha256 in SRI form, from the crates.io index `cksum`, which its download matched.
const VERSION = "0.9.0"

// The feature set of research/delivery-toolkit.md: rustls instead of the default native-tls, so no system OpenSSL.
// ring (rustls) and the bundled SQLite still compile C, so the build host needs a C compiler and linker: the Xcode
// command line tools on macOS, cc on Linux.
export default {
  id: "sqlx",
  version: VERSION,
  license: "MIT OR Apache-2.0",
  upstream: "transact-rs/sqlx",
  runtime: "rust",
  install: {
    kind: "source",
    artifact: {
      url: `https://static.crates.io/crates/sqlx-cli/sqlx-cli-${VERSION}.crate`,
      integrity: "sha256-k+84V6SgtI/L9Ta3epEio1x2MWhvLM+8deYWM1dx6NA=",
      format: "tar.gz",
      // PinnedArtifact refuses `.` as a destination, so the crate root is lifted member by member; `tests` comes along
      // so every target path the manifest declares exists.
      entries: ["Cargo.toml", "Cargo.lock", "README.md", "LICENSE-APACHE", "LICENSE-MIT", "src", "tests"].map(
        (name) => ({
          from: `sqlx-cli-${VERSION}/${name}`,
          to: `src/${name}`,
        }),
      ),
    },
    build: "cargo",
    path: ".",
    binary: "sqlx",
    features: ["rustls", "postgres", "mysql", "sqlite", "sqlx-toml"],
  },
  launch: [],
  // The msvc toolchain links only through Microsoft's `link.exe`, and the standalone gnu toolchain ships a linker but
  // no C compiler for ring and SQLite.
  unsupported: { "win32-x64": "needs-msvc-linker" },
  fit: { role: "generator", input: "a SQLx project's migrations and a disposable database", skills: ["backend-data"] },
} as const satisfies Pack
