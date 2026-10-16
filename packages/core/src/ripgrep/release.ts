import { readdirSync } from "fs"

/**
 * The pinned ripgrep release: one upstream archive per platform key. The runtime download (binary.ts), the Linux
 * sandbox runtime and every packaged build (bundle.ts) read these pins; nothing else may restate them. Only node
 * built-ins are imported, so build scripts and the desktop's main process can load it without the runtime.
 */
export namespace RipgrepRelease {
  export const VERSION = "15.2.0"
  export const LICENSE = "MIT OR Unlicense"
  export const REPOSITORY = "https://github.com/BurntSushi/ripgrep"

  // sha256 of each upstream release archive, keyed by `key()`, and of the rg executable inside it. Pinned 2026-10-14:
  // archives fetched and matched to upstream's .sha256 files, executables independently extracted and hashed.
  // `bun run check:ripgrep-pins` re-checks archive checksums and the latest version in CI; bundle.ts checks both digests.
  // ripgrep-binary.test.ts guards the CI action's pins; the Linux sandbox runtime reads this table too.
  // arm64 Linux has separate glibc and musl builds; x64's static musl build serves both. Bun has no 32-bit Windows build.
  const PLATFORM = {
    "arm64-darwin": {
      platform: "aarch64-apple-darwin",
      extension: "tar.gz",
      sha256: "3750b2e93f37e0c692657da574d7019a101c0084da05a790c83fd335bad973e4",
      executable: "a326a1fb48074202e9ad41e4cd1e389eeea372c8c6f7d7e80da81176d5d9430e",
    },
    "arm64-linux": {
      platform: "aarch64-unknown-linux-gnu",
      extension: "tar.gz",
      sha256: "a740b91c82eaf9914cfedd353572f2791cbe0162c84101ee0951058f4dcbc90d",
      executable: "e36d0eb52e70696bdf1781392722e05a21bb91d3b7b762ef5ec20e5df2ec687b",
    },
    "arm64-linux-musl": {
      platform: "aarch64-unknown-linux-musl",
      extension: "tar.gz",
      sha256: "800b1e7206afe799dfb5a6901f23147cfaabe0e52210538100f61e86e1740915",
      executable: "c14cdb389f34e504d69e386cfc67d5c5d9a730a990de03ca6910b2a15e30386a",
    },
    "x64-darwin": {
      platform: "x86_64-apple-darwin",
      extension: "tar.gz",
      sha256: "af7825fcc69a2afc7a7aea55fc9af90e26421d8f20fe59df32e233c0b8a231c1",
      executable: "0c9a0066db0d26b640777db88045b0ccdd58509a746700e43e1c4ff8707a5ed0",
    },
    "x64-linux": {
      platform: "x86_64-unknown-linux-musl",
      extension: "tar.gz",
      sha256: "33e15bcf1624b25cdd2a55813a47a2f95dbe126268203e76aa6a585d1e7b149c",
      executable: "e62198eb19b136b88c330af83647b5a962cb99b6b1f066758568f12de1974849",
    },
    "arm64-win32": {
      platform: "aarch64-pc-windows-msvc",
      extension: "zip",
      sha256: "e4abca10c3a64ebea742667dd7009449d49403db5460dd6873e389fa2945360f",
      executable: "d33a29a9ef03c9f4c03be9e8d88498e6e2d2e566d64cdbdef97f9afc8f13120c",
    },
    "x64-win32": {
      platform: "x86_64-pc-windows-msvc",
      extension: "zip",
      sha256: "71b2fef860abe467217a538ff31de02f5258807c0129f771846f87bd029aafc5",
      executable: "14231169855ec5205cf5a1b6f1db358ff4aed4247c86b69ce8aae647c77f6680",
    },
  } as const

  /** One downloadable archive: where it is, its digest, and the directory inside it that holds the executable. */
  export type Archive = {
    readonly url: string
    readonly sha256: string
    /** sha256 of the unsigned rg executable inside the archive. */
    readonly executable?: string
    readonly extension: "tar.gz" | "zip"
    readonly root: string
  }

  /** A platform's key, with `-musl` on a musl Linux other than x64, whose static build runs everywhere. */
  export const key = (input = { arch: process.arch as string, platform: process.platform as string, musl: musl() }) =>
    input.platform === "linux" && input.musl && input.arch !== "x64"
      ? `${input.arch}-linux-musl`
      : `${input.arch}-${input.platform}`

  /** Every platform key with a pinned archive. */
  export const keys = () => Object.keys(PLATFORM)

  export const archive = (platform = key()): Archive | undefined => {
    const config = PLATFORM[platform as keyof typeof PLATFORM]
    if (!config) return undefined
    const root = `ripgrep-${VERSION}-${config.platform}`
    return {
      url: `https://github.com/BurntSushi/ripgrep/releases/download/${VERSION}/${root}.${config.extension}`,
      sha256: config.sha256,
      executable: config.executable,
      extension: config.extension,
      root,
    }
  }

  /** The executable's name inside an archive for a Node platform. */
  export const executable = (platform: string = process.platform) => (platform === "win32" ? "rg.exe" : "rg")

  // musl's dynamic loader is /lib/ld-musl-<arch>.so.1; glibc systems have none.
  function musl() {
    if (process.platform !== "linux") return false
    try {
      return readdirSync("/lib").some((name) => name.startsWith("ld-musl-"))
    } catch {
      return false
    }
  }
}
