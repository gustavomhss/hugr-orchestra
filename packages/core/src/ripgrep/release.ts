/**
 * The pinned ripgrep release: one upstream archive per platform, keyed `${arch}-${platform}` as Node names them. The
 * runtime download (binary.ts) and every packaged build (bundle.ts) read these pins; nothing else may restate them.
 * No imports, so build scripts can load it without the runtime.
 */
export namespace RipgrepRelease {
  export const VERSION = "15.1.0"
  export const LICENSE = "MIT OR Unlicense"
  export const REPOSITORY = "https://github.com/BurntSushi/ripgrep"

  // sha256 of each upstream release archive. Pinned 2026-10-12: each matched upstream's .sha256 file, and the two
  // Linux archives match the sha512 pins in tool-safety-sandbox-runtime.ts.
  const PLATFORM = {
    "arm64-darwin": {
      platform: "aarch64-apple-darwin",
      extension: "tar.gz",
      sha256: "378e973289176ca0c6054054ee7f631a065874a352bf43f0fa60ef079b6ba715",
    },
    "arm64-linux": {
      platform: "aarch64-unknown-linux-gnu",
      extension: "tar.gz",
      sha256: "2b661c6ef508e902f388e9098d9c4c5aca72c87b55922d94abdba830b4dc885e",
    },
    "x64-darwin": {
      platform: "x86_64-apple-darwin",
      extension: "tar.gz",
      sha256: "64811cb24e77cac3057d6c40b63ac9becf9082eedd54ca411b475b755d334882",
    },
    "x64-linux": {
      platform: "x86_64-unknown-linux-musl",
      extension: "tar.gz",
      sha256: "1c9297be4a084eea7ecaedf93eb03d058d6faae29bbc57ecdaf5063921491599",
    },
    "arm64-win32": {
      platform: "aarch64-pc-windows-msvc",
      extension: "zip",
      sha256: "00d931fb5237c9696ca49308818edb76d8eb6fc132761cb2a1bd616b2df02f8e",
    },
    "ia32-win32": {
      platform: "i686-pc-windows-msvc",
      extension: "zip",
      sha256: "725be85a1e8f92878a548f40ee4f6df64bc93b809586462b3c6d884e1de1e83a",
    },
    "x64-win32": {
      platform: "x86_64-pc-windows-msvc",
      extension: "zip",
      sha256: "124510b94b6baa3380d051fdf4650eaa80a302c876d611e9dba0b2e18d87493a",
    },
  } as const

  /** One downloadable archive: where it is, its digest, and the directory inside it that holds the executable. */
  export type Archive = {
    readonly url: string
    readonly sha256: string
    readonly extension: "tar.gz" | "zip"
    readonly root: string
  }

  export const archive = (key = `${process.arch}-${process.platform}`): Archive | undefined => {
    const config = PLATFORM[key as keyof typeof PLATFORM]
    if (!config) return undefined
    const root = `ripgrep-${VERSION}-${config.platform}`
    return {
      url: `https://github.com/BurntSushi/ripgrep/releases/download/${VERSION}/${root}.${config.extension}`,
      sha256: config.sha256,
      extension: config.extension,
      root,
    }
  }

  export const executable = (platform: string = process.platform) => (platform === "win32" ? "rg.exe" : "rg")
}
