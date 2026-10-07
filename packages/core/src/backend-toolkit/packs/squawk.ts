import type { PinnedArtifact } from "../../pinned-artifact"
import type { Pack } from "../manifest"

// Pins are the GitHub release assets' sha256 digests in SRI form; squawk ships each target as one bare executable.
const VERSION = "2.67.0"

const target = (asset: string, integrity: PinnedArtifact.Artifact["integrity"], executable = "squawk") => ({
  artifact: {
    url: `https://github.com/sbdchd/squawk/releases/download/v${VERSION}/squawk-${asset}`,
    integrity,
    format: "raw" as const,
    entries: [{ from: `squawk-${asset}`, to: executable, executable: true }],
  },
  executable,
})

export default {
  id: "squawk",
  version: VERSION,
  license: "Apache-2.0",
  upstream: "sbdchd/squawk",
  targets: {
    "darwin-arm64": target("darwin-arm64", "sha256-e5gACNJYxhvQZcrG8AtvnG/dzSPsoiSTuoem0ZktTD4="),
    "darwin-x64": target("darwin-x64", "sha256-GaB1M0nnKOMZGrqd1ZPICxhjVBWZfW8JW5EV2yrygsc="),
    "linux-arm64": target("linux-arm64", "sha256-JcT5X4G827Cg3JCYIMIutlehI4FVi3J1vWn5jyU7m2Q="),
    "linux-x64": target("linux-x64", "sha256-A+/g5ma2O/M+JJNpPuCqnb7QfL3NIPeoKSJFwdqdeQo="),
    "win32-x64": target("windows-x64.exe", "sha256-1gBKh1opxNmyUfkm7s2MNT59ZESusZ+Zxkrfz5gZY8Q=", "squawk.exe"),
  },
  fit: {
    role: "check",
    input: "the PostgreSQL migration files the change wrote",
    skills: ["backend-data", "backend-check"],
  },
} as const satisfies Pack
