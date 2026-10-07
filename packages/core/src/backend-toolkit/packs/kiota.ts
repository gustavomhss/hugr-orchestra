import type { PinnedArtifact } from "../../pinned-artifact"
import type { Pack } from "../manifest"

// Pins are the GitHub release assets' sha256 digests in SRI form; kiota publishes no checksum file.
const VERSION = "1.35.0"

// The self-contained .NET single-file build reads appsettings.json beside it; the archive's debug symbols are left out.
const target = (asset: string, integrity: PinnedArtifact.Artifact["integrity"], executable = "kiota") => ({
  artifact: {
    url: `https://github.com/microsoft/kiota/releases/download/v${VERSION}/${asset}.zip`,
    integrity,
    format: "zip" as const,
    entries: [
      { from: executable, to: executable, executable: true },
      { from: "appsettings.json", to: "appsettings.json" },
    ],
  },
  executable,
})

export default {
  id: "kiota",
  version: VERSION,
  license: "MIT",
  upstream: "microsoft/kiota",
  env: { KIOTA_OFFLINE_ENABLED: "true", KIOTA_CLI_TELEMETRY_OPTOUT: "true" },
  targets: {
    "darwin-arm64": target("osx-arm64", "sha256-vVClZtvNK9EPTvSpGSdt0ZMgLc7ZkPtdFtg7aAMOIGM="),
    "darwin-x64": target("osx-x64", "sha256-Z/oN0qLXg7pStQThFbKvApeArvOJRhfjA8FAWoGdlFA="),
    "linux-arm64": target("linux-arm64", "sha256-xULvG3HCSRKgAr6H6rfL/v6jJLFOs1MWKktVuHnmklw="),
    "linux-x64": target("linux-x64", "sha256-jKBCaDZl9IzG3xy+b/LIUNGPdK0KEDWkButIbhkvULw="),
    "win32-x64": target("win-x64", "sha256-ZrVUe5SPe+ck+l4N3d69qPe2YldK5Y6507jFHGCcYnE=", "kiota.exe"),
  },
  fit: { role: "generator", input: "an OpenAPI description", skills: ["backend-api"] },
} as const satisfies Pack
