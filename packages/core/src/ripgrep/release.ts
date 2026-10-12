import { readdirSync } from "fs"

/**
 * The pinned ripgrep release: one upstream archive per platform key. The runtime download (binary.ts), the Linux
 * sandbox runtime and every packaged build (bundle.ts) read these pins; nothing else may restate them. Only node
 * built-ins are imported, so build scripts and the desktop's main process can load it without the runtime.
 */
export namespace RipgrepRelease {
  export const VERSION = "15.1.0"
  export const LICENSE = "MIT OR Unlicense"
  export const REPOSITORY = "https://github.com/BurntSushi/ripgrep"

  // sha256 of each upstream release archive, keyed by `key()`, and of the rg executable inside it. Pinned 2026-10-12,
  // each archive matching upstream's .sha256 file; `bun run check:ripgrep-pins` re-checks both in CI. The CI action (.github/actions/ripgrep/action.yml) and the
  // Linux sandbox runtime (tool-safety-sandbox-runtime.ts) use the same pins; ripgrep-binary.test.ts guards the action.
  // Upstream ships no musl build for arm64 (the x64 Linux build is static musl, so it runs on glibc and musl alike),
  // and Bun ships no 32-bit Windows build, so neither has an entry.
  const PLATFORM = {
    "arm64-darwin": {
      platform: "aarch64-apple-darwin",
      extension: "tar.gz",
      sha256: "378e973289176ca0c6054054ee7f631a065874a352bf43f0fa60ef079b6ba715",
      executable: "4fdf1d8365af224bc70e3c1490d8461d859c37cc70e739a11e987af0215f3e94",
    },
    "arm64-linux": {
      platform: "aarch64-unknown-linux-gnu",
      extension: "tar.gz",
      sha256: "2b661c6ef508e902f388e9098d9c4c5aca72c87b55922d94abdba830b4dc885e",
      executable: "968cabe8efed72fd8fd482cb76b6084fcb695fc5293af7fb62296b02f487fb69",
    },
    "x64-darwin": {
      platform: "x86_64-apple-darwin",
      extension: "tar.gz",
      sha256: "64811cb24e77cac3057d6c40b63ac9becf9082eedd54ca411b475b755d334882",
      executable: "3bafa7e6ee51ba3ac4ed065883484a309be09b26ea6dad561ae4049bfe049c50",
    },
    "x64-linux": {
      platform: "x86_64-unknown-linux-musl",
      extension: "tar.gz",
      sha256: "1c9297be4a084eea7ecaedf93eb03d058d6faae29bbc57ecdaf5063921491599",
      executable: "ebeaf56f8a25e102e9419933423738b3a2a613a444fd749d695e15eba53f71f2",
    },
    "arm64-win32": {
      platform: "aarch64-pc-windows-msvc",
      extension: "zip",
      sha256: "00d931fb5237c9696ca49308818edb76d8eb6fc132761cb2a1bd616b2df02f8e",
      executable: "f7799d737b520e00b10dfa72def23904fe66fb03315636a7b78549845ee9609c",
    },
    "x64-win32": {
      platform: "x86_64-pc-windows-msvc",
      extension: "zip",
      sha256: "124510b94b6baa3380d051fdf4650eaa80a302c876d611e9dba0b2e18d87493a",
      executable: "decdd4992f3f1b9a5ef9898f1b40ab16886d579d6516b4efd3d5eaa19364e408",
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
