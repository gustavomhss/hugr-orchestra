import type { PinnedArtifact } from "../../pinned-artifact"
import type { Pack } from "../manifest"

// Pins are the GitHub release assets' sha256 digests in SRI form; sqlc publishes no checksum file.
const VERSION = "1.31.1"

const target = (asset: string, integrity: PinnedArtifact.Artifact["integrity"], executable = "sqlc") => ({
  artifact: {
    url: `https://github.com/sqlc-dev/sqlc/releases/download/v${VERSION}/sqlc_${VERSION}_${asset}.tar.gz`,
    integrity,
    format: "tar.gz" as const,
    entries: [{ from: executable, to: executable, executable: true }],
  },
  executable,
})

export default {
  id: "sqlc",
  version: VERSION,
  license: "MIT",
  upstream: "sqlc-dev/sqlc",
  targets: {
    "darwin-arm64": target("darwin_arm64", "sha256-IWAhWMmesfK64Zemar+xlB0enlCyMSW7GTNJxrGsxx4="),
    "darwin-x64": target("darwin_amd64", "sha256-xa92dy43hdIWY6YmlwVrOD8HYpl5sb0luThy5z29UZs="),
    "linux-arm64": target("linux_arm64", "sha256-t8riR3QNDFGh5ldHnlstIeb+9Cj1lmgqAbxVv0q4oj0="),
    "linux-x64": target("linux_amd64", "sha256-SXrk/N+mTFsMMR/+TCvZkeQ5keguU2d5LteLwtyic1Q="),
    "win32-x64": target("windows_amd64", "sha256-QNE47BixzIDSvnMFkX/U3s7aTgwy14ul2Pqkv6O8D8A=", "sqlc.exe"),
  },
  fit: { role: "generator", input: "SQL query files and the schema DDL sqlc reads", skills: ["backend-data"] },
} as const satisfies Pack
