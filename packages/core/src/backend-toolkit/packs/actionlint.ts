import type { Pack } from "../manifest"

const RELEASE = "https://github.com/rhysd/actionlint/releases/download/v1.7.12"
const artifact = (asset: string, integrity: `sha256-${string}`, executable = "actionlint") => ({
  artifact: {
    url: `${RELEASE}/${asset}`,
    integrity,
    format: asset.endsWith(".zip") ? ("zip" as const) : ("tar.gz" as const),
    entries: [{ from: executable, to: executable, executable: true }],
  },
  executable,
})

export default {
  id: "actionlint",
  version: "1.7.12",
  license: "MIT",
  upstream: "rhysd/actionlint",
  fit: { role: "check", input: "GitHub Actions workflows", skills: [] },
  targets: {
    "darwin-arm64": artifact("actionlint_1.7.12_darwin_arm64.tar.gz", "sha256-q6nO0t7o0n/syj3H/rGn+aUsrvoetG8ycepmtuDmlT8="),
    "darwin-x64": artifact("actionlint_1.7.12_darwin_amd64.tar.gz", "sha256-W0TDvCJVEVybaeMO/A/s30mP22PF1Y4XCE/V8WMkxkQ="),
    "linux-arm64": artifact("actionlint_1.7.12_linux_arm64.tar.gz", "sha256-Ml6XG2upv6UEZy4pvpPCSYHuscB1dtcw6ffIgFr/8MY="),
    "linux-x64": artifact("actionlint_1.7.12_linux_amd64.tar.gz", "sha256-isqNuW8blHcPGw1ytt3cseu4EjyzcSUwsIzDh7NJo9g="),
    "win32-x64": artifact("actionlint_1.7.12_windows_amd64.zip", "sha256-bnJBtR5oF+pqBHaT2Ob+0TsxgZyaDdbFpybhWS0i9uk=", "actionlint.exe"),
  },
  floor: {
    "darwin-arm64": { macos: "12.0" },
    "darwin-x64": { macos: "12.0" },
    "linux-arm64": {},
    "linux-x64": {},
    "win32-x64": {},
  },
  notices: [{
    url: "https://raw.githubusercontent.com/rhysd/actionlint/914e7df21a07ef503a81201c76d2b11c789d3fca/LICENSE.txt",
    integrity: "sha256-A6JrBtIkOAoCvxAOBf/zst/HGxTU4vpoXsmWOodWPCI=",
    filename: "actionlint-1.7.12-license.txt",
  }],
} as const satisfies Pack
