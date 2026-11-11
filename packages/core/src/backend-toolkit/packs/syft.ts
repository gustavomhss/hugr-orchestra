import type { PinnedArtifact } from "../../pinned-artifact"
import type { Pack } from "../manifest"

// Release v1.57.1. The lead matched the linux-x64 archive to the release sha256.
// Other targets use that release's published sha256. The binary is at the archive root.
// The licence is the Apache-2.0 text at tag v1.57.1.
const VERSION = "1.57.1"
const release = (asset: string) =>
  `https://github.com/anchore/syft/releases/download/v${VERSION}/${asset}`

const artifact = (
  asset: string,
  integrity: PinnedArtifact.Artifact["integrity"],
  format: PinnedArtifact.Artifact["format"],
  executable = "syft",
) => ({
  artifact: {
    url: release(asset),
    integrity,
    format,
    entries: [{ from: executable, to: executable, executable: true }],
  },
  executable,
})

export default {
  id: "syft",
  version: VERSION,
  license: "Apache-2.0",
  upstream: "anchore/syft",
  // Floors are not measured here. An empty floor does not claim a minimum OS.
  floor: {
    "darwin-arm64": {},
    "darwin-x64": {},
    "linux-arm64": {},
    "linux-x64": {},
    "win32-x64": {},
  },
  targets: {
    "darwin-arm64": artifact("syft_1.57.1_darwin_arm64.tar.gz", "sha256-4KdKXSaI0SVLThe3HwaKgyFeNiX4RiZb9mFMe6BvOpY=", "tar.gz"),
    "darwin-x64": artifact("syft_1.57.1_darwin_amd64.tar.gz", "sha256-I1V1jBFCmCpnswlgTF117/2+Y4pXx3GXnqj9GhZlarw=", "tar.gz"),
    "linux-arm64": artifact("syft_1.57.1_linux_arm64.tar.gz", "sha256-qj0+BzRPWQvM6NMQQ7dS2qdsilbCqjTO7uY8YWgVJYI=", "tar.gz"),
    "linux-x64": artifact("syft_1.57.1_linux_amd64.tar.gz", "sha256-v1JRnrV/Z11HwH1DITy23/ZEnz1tEUf/ZwHtkfRO7ww=", "tar.gz"),
    "win32-x64": artifact("syft_1.57.1_windows_amd64.zip", "sha256-OgH+hlB2u1SDUhlbd+iPpGSSd4YepFjv4WXDqBC23Mc=", "zip", "syft.exe"),
  },
  notices: [{
    url: "https://raw.githubusercontent.com/anchore/syft/v1.57.1/LICENSE",
    integrity: "sha256-xx0jnfkXJvxRnG63LTGOxlggYnIysveWIZ6H3PNdCrQ=",
    filename: "syft-1.57.1-license.txt",
  }],
  fit: { role: "check", input: "a lockfile", skills: [] },
} as const satisfies Pack
