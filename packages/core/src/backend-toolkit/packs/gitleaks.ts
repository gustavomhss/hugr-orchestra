import type { PinnedArtifact } from "../../pinned-artifact"
import type { Pack } from "../manifest"

// Pins are the GitHub release assets' sha256 digests in SRI form; gitleaks' checksums.txt agreed with them when pinning.
const VERSION = "8.30.1"

const target = (asset: string, integrity: PinnedArtifact.Artifact["integrity"], executable = "gitleaks") => ({
  artifact: {
    url: `https://github.com/gitleaks/gitleaks/releases/download/v${VERSION}/gitleaks_${VERSION}_${asset}`,
    integrity,
    format: asset.endsWith(".zip") ? ("zip" as const) : ("tar.gz" as const),
    entries: [
      { from: executable, to: executable, executable: true },
      { from: "LICENSE", to: "LICENSE" },
    ],
  },
  executable,
})

// The host-side Memory scanner: it serves no entry skill and has no recipe.
export default {
  id: "gitleaks",
  version: VERSION,
  license: "MIT",
  upstream: "gitleaks/gitleaks",
  targets: {
    "darwin-arm64": target("darwin_arm64.tar.gz", "sha256-tAqwrlXFBZY+Nl8nGo04Ru+8FwqhfyYH8T32EKmutqU="),
    "darwin-x64": target("darwin_x64.tar.gz", "sha256-3+EBpNsiVfyFEgrH89JeQ0LDwgz3SfLCChgIGvGVJwk="),
    "linux-arm64": target("linux_arm64.tar.gz", "sha256-5KSH7nzNfTp/fsCGV2EKo2BmN9q5JCELOu5iVw+0sIA="),
    "linux-x64": target("linux_x64.tar.gz", "sha256-VR9vyD6kV9YqDZgjfLrRBa+NVXADBR9B8+fKez8kcOs="),
    "win32-x64": target("windows_x64.zip", "sha256-0pFE3v86aKqTztM93fhLf9wmBwrdSqD0UTCUyDMq/E4=", "gitleaks.exe"),
  },
  fit: { role: "check", input: "Memory text before it is stored", skills: [] },
} as const satisfies Pack
