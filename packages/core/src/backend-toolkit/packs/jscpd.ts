import type { Pack } from "../manifest"

// Release v5.4.3. Archive root is the binary plus LICENSE (npm-rust-publish.yml at that tag).
// The entry is only the binary. The notice is the MIT text at tag v5.4.3. Not an ENGINES entry.
const VERSION = "5.4.3"
const release = (asset: string) => `https://github.com/kucherenko/jscpd/releases/download/v${VERSION}/${asset}`

const artifact = (asset: string, integrity: `sha256-${string}`, executable = "jscpd") => ({
  artifact: {
    url: release(asset),
    integrity,
    format: "tar.gz" as const,
    entries: [{ from: executable, to: executable, executable: true }],
  },
  executable,
})

export default {
  id: "jscpd",
  version: VERSION,
  license: "MIT",
  upstream: "kucherenko/jscpd",
  fit: { role: "check", input: "source files", skills: [] },
  // Floors are not measured. An empty floor does not claim a minimum OS.
  floor: {
    "darwin-arm64": {},
    "darwin-x64": {},
    "linux-arm64": {},
    "linux-x64": {},
    "win32-x64": {},
  },
  targets: {
    "darwin-arm64": artifact("jscpd-darwin-arm64.tar.gz", "sha256-4RnExTiBGK00inmcR4WJ960PpwfAt8gZ1v68lPb5hSI="),
    "darwin-x64": artifact("jscpd-darwin-x64.tar.gz", "sha256-fluBoLMPHSYb+c2NjnK+Q/DOVaVKk3TxEREjuyk2I2I="),
    "linux-arm64": artifact("jscpd-linux-arm64-gnu.tar.gz", "sha256-IhpiolSrTMQvJuB2lDynns0xGuQWRqdqCOS3kO2MX74="),
    "linux-x64": artifact("jscpd-linux-x64-gnu.tar.gz", "sha256-oZ1xkzGyGgR6dTf5glZtq89tbl9RWBw7gNnEIJecySw="),
    "win32-x64": artifact("jscpd-windows-x64-msvc.tar.gz", "sha256-HpQW0XnFTLrx+IVMdksrx3ShoVhQBDFgt+WOY5SP+50=", "jscpd.exe"),
  },
  notices: [{
    url: "https://raw.githubusercontent.com/kucherenko/jscpd/v5.4.3/LICENSE",
    integrity: "sha256-Xm4BgrBca5odKhINx4hxcmezDkqhxSZYkSzplBijPOc=",
    filename: "jscpd-5.4.3-license.txt",
  }],
} as const satisfies Pack
