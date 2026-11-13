import type { Pack } from "../manifest"

// oxlint 1.91.0 peers oxlint-tsgolint >= 7.0.2005. The tag v7.0.2005 is that floor.
// Each npm tarball was downloaded and matched to the registry sha512. The archive member is the
// static binary. The LICENSE bytes match https://github.com/oxc-project/tsgolint/blob/v7.0.2005/LICENSE (MIT).
const release = (target: string) =>
  `https://registry.npmjs.org/@oxlint-tsgolint/${target}/-/${target}-7.0.2005.tgz`

const artifact = (target: string, integrity: `sha256-${string}`, executable = "tsgolint") => ({
  artifact: {
    url: release(target),
    integrity,
    format: "tar.gz" as const,
    entries: [{ from: `package/${executable}`, to: executable, executable: true }],
  },
  executable,
})

export default {
  id: "tsgolint",
  version: "7.0.2005",
  license: "MIT",
  upstream: "oxc-project/tsgolint",
  fit: { role: "check", input: "TypeScript sources", skills: [] },
  targets: {
    "darwin-arm64": artifact("darwin-arm64", "sha256-UJQtED1Osmn3rm2wJphICyi866SZ0WK6yRHWEyq2Omg="),
    "darwin-x64": artifact("darwin-x64", "sha256-WsmbkH1iWaXIvsniBaAAoCe2Ajvf0r6N1+xqkL1jEaA="),
    "linux-arm64": artifact("linux-arm64", "sha256-URnH+7/pd1sKjmutT3HrSIo/U1iS5Gr3DeMS9puzaAo="),
    "linux-x64": artifact("linux-x64", "sha256-PNJXV08rPw3mmQTq0Qykk5cYTnDP9IHJBd0AzEqndVQ="),
    "win32-x64": artifact("win32-x64", "sha256-3rr5AdOJGWY9iRVsx1BOcdxwJLA5fAnczQwhlV2HuxU=", "tsgolint.exe"),
  },
  // Darwin minos 12.0 was read from LC_BUILD_VERSION. Linux binaries are static ELF. No Windows floor was measured.
  floor: {
    "darwin-arm64": { macos: "12.0" },
    "darwin-x64": { macos: "12.0" },
    "linux-arm64": {},
    "linux-x64": {},
    "win32-x64": {},
  },
  notices: [{
    url: "https://raw.githubusercontent.com/oxc-project/tsgolint/v7.0.2005/LICENSE",
    integrity: "sha256-whHMUzbS1H8hMirKNcgUlpneYh7cRHKUthcEjQWnRc4=",
    filename: "tsgolint-7.0.2005-license.txt",
  }],
} as const satisfies Pack
