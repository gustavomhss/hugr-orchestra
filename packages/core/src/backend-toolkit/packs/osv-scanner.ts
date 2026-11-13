import type { PinnedArtifact } from "../../pinned-artifact"
import type { Pack } from "../manifest"

// Release v2.7.1. The linux-x64 binary was downloaded and matched to the release sha256.
// The other targets use that same release's published sha256. Each asset is a bare executable.
// The licence is the Apache-2.0 text at tag v2.7.1.
const VERSION = "2.7.1"
const release = (asset: string) =>
  `https://github.com/google/osv-scanner/releases/download/v${VERSION}/${asset}`

const artifact = (asset: string, integrity: PinnedArtifact.Artifact["integrity"], executable = "osv-scanner") => ({
  artifact: {
    url: release(asset),
    integrity,
    format: "raw" as const,
    entries: [{ from: asset, to: executable, executable: true }],
  },
  executable,
})

export default {
  id: "osv-scanner",
  version: VERSION,
  license: "Apache-2.0",
  upstream: "google/osv-scanner",
  // Floors are not measured here. An empty floor does not claim a minimum OS.
  floor: {
    "darwin-arm64": {},
    "darwin-x64": {},
    "linux-arm64": {},
    "linux-x64": {},
    "win32-x64": {},
  },
  targets: {
    "darwin-arm64": artifact("osv-scanner_darwin_arm64", "sha256-siwCh3qBHI94lW6GQ++lVJMrc3j1kNE/jpfU6USKKfM="),
    "darwin-x64": artifact("osv-scanner_darwin_amd64", "sha256-uEINVIW6eSYmMV8b+aWiBG6XHTjup1v5CQw4hS28Oxs="),
    "linux-arm64": artifact("osv-scanner_linux_arm64", "sha256-mD0i+62XJFFOP8xqzIO1+mTF/6aw2fUQAo8iwbIj/4E="),
    "linux-x64": artifact("osv-scanner_linux_amd64", "sha256-+32rGai9m75cMYnwnUt+4YIMlVOiO6wgJkilbv0vbug="),
    "win32-x64": artifact("osv-scanner_windows_amd64.exe", "sha256-cSHc9CCu+7+Jp/AFDE0wlOB5/5Ov0zTfyW8WsC7IWAA=", "osv-scanner.exe"),
  },
  notices: [{
    url: "https://raw.githubusercontent.com/google/osv-scanner/v2.7.1/LICENSE",
    integrity: "sha256-z8d0m5b2O9McPEK1xHG/dWgUBT6EfBDz6wA0F7xSPTA=",
    filename: "osv-scanner-2.7.1-license.txt",
  }],
  fit: { role: "check", input: "a lockfile", skills: [] },
} as const satisfies Pack
