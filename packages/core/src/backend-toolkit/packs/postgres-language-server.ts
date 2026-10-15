import type { PinnedArtifact } from "../../pinned-artifact"
import type { Pack } from "../manifest"

// Pins are the GitHub release assets' sha256 digests in SRI form. The release also ships the same CLI under its old
// name, `postgrestools`; the pack pins the current `postgres-language-server` assets.
const VERSION = "0.27.1"

const target = (
  triple: string,
  integrity: PinnedArtifact.Artifact["integrity"],
  executable = "postgres-language-server",
) => ({
  artifact: {
    url: `https://github.com/supabase-community/postgres-language-server/releases/download/${VERSION}/postgres-language-server_${triple}`,
    integrity,
    format: "raw" as const,
    entries: [{ from: `postgres-language-server_${triple}`, to: executable, executable: true }],
  },
  executable,
})

export default {
  id: "postgres-language-server",
  version: VERSION,
  license: "MIT",
  upstream: "supabase-community/postgres-language-server",
  targets: {
    "darwin-arm64": target("aarch64-apple-darwin", "sha256-z1NeF6iyqJOm2wwtoAK00u8GQZePc7+Sx22zK8oQpKo="),
    "darwin-x64": target("x86_64-apple-darwin", "sha256-fKYXB2USLUKe0J3UTDw3t6u9Rk4mJZrVxRt9p0HbXds="),
    "linux-arm64": target("aarch64-unknown-linux-gnu", "sha256-0SL97pLwISwbdZO3XFpFnzWJmrpu8kIDbrd8hwh1d78="),
    "linux-x64": target("x86_64-unknown-linux-gnu", "sha256-dJZILRH+1o7dkO8yvKy9U6/GcWzrCN0rhKXObOg1ZcU="),
    "win32-x64": target(
      "x86_64-pc-windows-msvc.exe",
      "sha256-4Fdj9qmGz29P1sQDn3u1YdxkgBc4S9tREZFStjzDuYw=",
      "postgres-language-server.exe",
    ),
  },
  fit: {
    role: "check",
    input: "the SQL the change wrote and a disposable PostgreSQL database holding the schema",
    skills: ["backend-data", "backend-check"],
  },
} as const satisfies Pack
