import { readdirSync } from "fs"

/**
 * The pinned ripgrep release: one upstream archive per platform key. The runtime download (binary.ts), the Linux
 * sandbox runtime and every packaged build (bundle.ts) read these pins; nothing else may restate them. Only node
 * built-ins are imported, so build scripts and the desktop's main process can load it without the runtime.
 */
export namespace RipgrepRelease {
  export const VERSION = "16.0.0"
  export const LICENSE = "MIT OR Unlicense"
  export const REPOSITORY = "https://github.com/BurntSushi/ripgrep"

  // sha256 of each upstream release archive, keyed by `key()`, and of the rg executable inside it. Pinned 2026-11-28:
  // archives matched to upstream release metadata, executables independently extracted and hashed.
  // `bun run check:ripgrep-pins` re-checks archive checksums and the latest version in CI; bundle.ts checks both digests.
  // ripgrep-binary.test.ts guards the CI action's pins; the Linux sandbox runtime reads this table too.
  // arm64 Linux has separate glibc and musl builds; x64's static musl build serves both. Bun has no 32-bit Windows build.
  const PLATFORM = {
    "arm64-darwin": {
      platform: "aarch64-apple-darwin",
      extension: "tar.gz",
      sha256: "5a145656d5067144001bfce6648767fd3254599aa736f1ffdb7fb907760b8ca1",
      executable: "de3a7aa933fb5f2ddfcbf6043b4276fe59d0df08bc91d9003e64050e834e4b24",
    },
    "arm64-linux": {
      platform: "aarch64-unknown-linux-gnu",
      extension: "tar.gz",
      sha256: "0b0bddcfaf42be1f3c56bf929d70defd1a2d96f2577aecbd7029a3734ddb4740",
      executable: "f27e3e91d65cb9c31bbc607444a9d315ad5657ac4f2794991832d5d1f9e8b2f7",
    },
    "arm64-linux-musl": {
      platform: "aarch64-unknown-linux-musl",
      extension: "tar.gz",
      sha256: "374f1886be881e8e8683d7107278f7af1b6017fda75eb97de71f5783f42b0110",
      executable: "f2d163ba909715818890c754b4faef6cff0d67025b503577a4700f8177b8dc12",
    },
    "x64-darwin": {
      platform: "x86_64-apple-darwin",
      extension: "tar.gz",
      sha256: "aa9183b0e0bfac03c5818895ad18b75001c402d230063898abfe5a58cd413caa",
      executable: "dabb6baa856f1c84690d87485618f536d13412fab097057390cce46988832cb4",
    },
    "x64-linux": {
      platform: "x86_64-unknown-linux-musl",
      extension: "tar.gz",
      sha256: "54268ab4643c00a290a29b0086066d64b3f56236dd805ec64629a86f9bd29fd0",
      executable: "a60f4ad2206cb0234c077d9789231fd8a0f9895ff2e2dbbb3d2c944dc14b2613",
    },
    "arm64-win32": {
      platform: "aarch64-pc-windows-msvc",
      extension: "zip",
      sha256: "3302ede09745d33ca2b287bf3c6434c54cb35c3b408a7d3a265939961add5a1a",
      executable: "ce4647f65e8b7470eff4915df928d4a1760b5f6ed0a35e24d3b1e28b5db61eb9",
    },
    "x64-win32": {
      platform: "x86_64-pc-windows-msvc",
      extension: "zip",
      sha256: "f418ae83e63046a94a7b5f3a44bf3a169f66e689164856ecee02547131c73931",
      executable: "a140ac0ec5346e6aa59e13bdb09f001237632bafcede54c13b885e08efcecf64",
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
