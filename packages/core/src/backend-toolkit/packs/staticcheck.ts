import type { Pack } from "../manifest"

// Release 2026.2.2. Each archive was downloaded and matched to its sha256.
// The binary is at staticcheck/staticcheck. The licence is the MIT text at tag 2026.2.2.
const VERSION = "2026.2.2"
const release = (asset: string) =>
  `https://github.com/dominikh/go-tools/releases/download/${VERSION}/${asset}`

const artifact = (asset: string, integrity: `sha256-${string}`, executable = "staticcheck") => ({
  artifact: {
    url: release(asset),
    integrity,
    format: "tar.gz" as const,
    entries: [{ from: `staticcheck/${executable}`, to: executable, executable: true }],
  },
  executable,
})

export default {
  id: "staticcheck",
  version: VERSION,
  license: "MIT",
  upstream: "dominikh/go-tools",
  fit: { role: "check", input: "Go packages", skills: [] },
  targets: {
    "darwin-arm64": artifact("staticcheck_darwin_arm64.tar.gz", "sha256-wFS/f1YfVmgXXTHsh3D2EEuJzLQfDwtM6S1CPDQ2VBc="),
    "darwin-x64": artifact("staticcheck_darwin_amd64.tar.gz", "sha256-QAzkjWBpQyxjLMMuLlTWMAD2A3QTAkMQ/cIMkw8d+DY="),
    "linux-arm64": artifact("staticcheck_linux_arm64.tar.gz", "sha256-zL2q+Bw36yRqYGP4Ee47ieAv8ELLBozRynOnN34vcEU="),
    "linux-x64": artifact("staticcheck_linux_amd64.tar.gz", "sha256-FMCB4PDQW1pNTFP9PTV9Slr50gUBRl/vyQJO6CjTqlw="),
    "win32-x64": artifact("staticcheck_windows_amd64.tar.gz", "sha256-X0+UkbQTAeap1N5vdUK9Lvwb+vOefMUoAtTbnkpU5nc=", "staticcheck.exe"),
  },
  // Floors are not measured here. An empty floor does not claim a minimum OS.
  floor: {
    "darwin-arm64": {},
    "darwin-x64": {},
    "linux-arm64": {},
    "linux-x64": {},
    "win32-x64": {},
  },
  notices: [{
    url: "https://raw.githubusercontent.com/dominikh/go-tools/2026.2.2/LICENSE",
    integrity: "sha256-8iF4DsptFtydzinORs0InOHKEXiZizHrvMif+CLGBys=",
    filename: "staticcheck-2026.2.2-license.txt",
  }],
} as const satisfies Pack
