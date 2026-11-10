import type { Pack } from "../manifest"

const RELEASE = "https://github.com/oxc-project/oxc/releases/download/oxlint_v1.91.0"
const artifact = (asset: string, integrity: `sha256-${string}`, executable = "oxlint") => ({
  artifact: {
    url: `${RELEASE}/${asset}`,
    integrity,
    format: asset.endsWith(".zip") ? ("zip" as const) : ("tar.gz" as const),
    entries: [{ from: asset.endsWith(".zip") ? executable : asset.slice(0, -".tar.gz".length), to: executable, executable: true }],
  },
  executable,
})

export default {
  id: "oxlint",
  version: "1.91.0",
  license: "MIT",
  upstream: "oxc-project/oxc",
  fit: { role: "check", input: "JavaScript and TypeScript sources", skills: [] },
  targets: {
    "darwin-arm64": artifact("oxlint-aarch64-apple-darwin.tar.gz", "sha256-0fYDd4Ck1eFKMtgQCDhZrmkaUDL3iTgaX/m3X5AfkOk="),
    "darwin-x64": artifact("oxlint-x86_64-apple-darwin.tar.gz", "sha256-tCKmpf/nU7EX1zSKgOciyjUYPOsbbJh2bw3hR0dyeiY="),
    "linux-arm64": artifact("oxlint-aarch64-unknown-linux-musl.tar.gz", "sha256-MOuEi5SbW0PktSJX2v/OAzfOncoJ8j6W2GQf6LLrcJc="),
    "linux-x64": artifact("oxlint-x86_64-unknown-linux-musl.tar.gz", "sha256-K4F7c5V72U0qDVnPcZIztU2YR+kMrzgLuJpboe3ojGw="),
    "win32-x64": artifact("oxlint-x86_64-pc-windows-msvc.zip", "sha256-Tvqmn7XkU6WH2bS6Idh6Ulo1M2Lf14e8yz5u11T04Og=", "oxlint-x86_64-pc-windows-msvc.exe"),
  },
  floor: {
    "darwin-arm64": { macos: "11.0" },
    "darwin-x64": { macos: "10.12" },
    "linux-arm64": {},
    "linux-x64": {},
    "win32-x64": {},
  },
  notices: [{
    url: "https://raw.githubusercontent.com/oxc-project/oxc/f3fcdcc61b08e9880476279ba21a363967940fa4/LICENSE",
    integrity: "sha256-lc7V7PETP79B1Am1VVyGw0T4PzsBmSYFfdvAfP3MJ7M=",
    filename: "oxlint-1.91.0-license.txt",
  }],
} as const satisfies Pack
