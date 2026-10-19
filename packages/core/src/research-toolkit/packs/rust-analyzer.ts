import type { PinnedArtifact } from "../../pinned-artifact"
import type { ResearchPack } from "../index"

// Pins are the GitHub release assets' sha256 digests in SRI form; the darwin-arm64 and win32-x64 downloads hashed to the
// same values when pinning. The per-target VS Code packages are zips (the bare `.gz` binaries are no PinnedArtifact
// format) that carry the server at `extension/server/`. Releases are tagged by date; the version is the server's own,
// from the package's package.json. `rust-analyzer scip` loads the workspace through the host's `cargo metadata`; a host
// without cargo keeps the tree-sitter layer (code-index/extract.ts).
const RELEASE = "2026-09-28"
const VERSION = "0.3.3065"

const target = (asset: string, integrity: PinnedArtifact.Artifact["integrity"], executable = "rust-analyzer") => ({
  artifact: {
    url: `https://github.com/rust-lang/rust-analyzer/releases/download/${RELEASE}/rust-analyzer-${asset}.vsix`,
    integrity,
    format: "zip" as const,
    entries: [
      { from: `extension/server/${executable}`, to: executable, executable: true },
      { from: "extension/LICENSE.txt", to: "LICENSE.txt" },
    ],
  },
  executable,
})

export default {
  id: "rust-analyzer",
  version: VERSION,
  license: "MIT OR Apache-2.0",
  upstream: "rust-lang/rust-analyzer",
  targets: {
    "darwin-arm64": target("darwin-arm64", "sha256-dl+bmaJkLF7DE8eTOsELEIbi8unku9wPSRtONVoInIs="),
    "darwin-x64": target("darwin-x64", "sha256-Mfl7k7qWiWtr4n2Uu1Pz3shSQEOXkkODzKyb8elSgKw="),
    "linux-arm64": target("linux-arm64", "sha256-MyBdtpwnOct46Q1AEYVbZFNHPisYnxHgcbuSCwGYDZw="),
    "linux-x64": target("linux-x64", "sha256-6aU9TURNAmncTBysGQSPLgL7P4Ap9OqXIvZ+XOjD1UA="),
    "win32-x64": target("win32-x64", "sha256-MiOpRN4FBk0q2FI721bTnuRzG9e6qLYyJCI6xdJDMjs=", "rust-analyzer.exe"),
  },
  fit: { role: "indexer", languages: ["rust"] },
} as const satisfies ResearchPack
