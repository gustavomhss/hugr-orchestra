import type { Pack } from "../manifest"

// Release v2.30.0. Each archive was downloaded and matched to its sha256.
// The binary is at the archive root. The licence is the Apache-2.0 text at tag v2.30.0.
const VERSION = "2.30.0"
const release = (asset: string) =>
  `https://github.com/securego/gosec/releases/download/v${VERSION}/${asset}`

const artifact = (asset: string, integrity: `sha256-${string}`, executable = "gosec") => ({
  artifact: {
    url: release(asset),
    integrity,
    format: "tar.gz" as const,
    entries: [{ from: executable, to: executable, executable: true }],
  },
  executable,
})

export default {
  id: "gosec",
  version: VERSION,
  license: "Apache-2.0",
  upstream: "securego/gosec",
  fit: { role: "check", input: "Go packages", skills: [] },
  targets: {
    "darwin-arm64": artifact("gosec_2.30.0_darwin_arm64.tar.gz", "sha256-ysjEgGc/wXl5hAK22G78Era88RwYvPN3/aAsxVhG3Zc="),
    "darwin-x64": artifact("gosec_2.30.0_darwin_amd64.tar.gz", "sha256-GxC0lpVHkfS1dEhyLwy5PA+kq6JOnShsBFnf3lk+CJg="),
    "linux-arm64": artifact("gosec_2.30.0_linux_arm64.tar.gz", "sha256-CGeZSSBFMHCl1qcT41khowWEc+XDv3d/3Votb5UxP9o="),
    "linux-x64": artifact("gosec_2.30.0_linux_amd64.tar.gz", "sha256-P8zixOgC/0FpIXh0YCp981Xpo3vLb/qjSwjz1fM2zfs="),
    "win32-x64": artifact("gosec_2.30.0_windows_amd64.tar.gz", "sha256-UDvf5hVVhPJJfvhVhGtmQGvOW1dM4anHp7sXGv8sqgI=", "gosec.exe"),
  },
  floor: {
    "darwin-arm64": {},
    "darwin-x64": {},
    "linux-arm64": {},
    "linux-x64": {},
    "win32-x64": {},
  },
  notices: [{
    url: "https://raw.githubusercontent.com/securego/gosec/v2.30.0/LICENSE.txt",
    integrity: "sha256-K+CoHzDStzyztRgrlpF1JFBCFYc1/MivEzkpISx3Lng=",
    filename: "gosec-2.30.0-license.txt",
  }],
} as const satisfies Pack
