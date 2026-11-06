import { expect, test } from "bun:test"
import pinned from "../../src/backend-toolkit/packs/oxlint"

test("oxlint 1.91.0 pins the independently verified artifact and license bytes", () => {
  expect(pinned.version).toBe("1.91.0")
  expect(pinned.license).toBe("MIT")
  expect(pinned.upstream).toBe("oxc-project/oxc")
  expect(pinned.fit).toEqual({ role: "check", input: "JavaScript and TypeScript sources", skills: [] })
  const releaseSha256 = {
    "darwin-arm64": "d1f6037780a4d5e14a32d810083859ae691a5032f789381a5ff9b75f901f90e9",
    "darwin-x64": "b422a6a5ffe753b117d7348a80e722ca35183ceb1b6c98766f0de14747727a26",
    "linux-arm64": "30eb848b949b5b43e4b52257daffce0337ce9dca09f23e96d8641fe8b2eb7097",
    "linux-x64": "2b817b73957bd94d2a0d59cf719233b54d9847e90caf380bb89a5ba1ede88c6c",
    "win32-x64": "4efaa69fb5e453a587d9b4ba21d87a525a353362dfd787bccb3e6ed754f4e0e8",
  } as const
  const sri = (sha256: string): `sha256-${string}` => `sha256-${Buffer.from(sha256, "hex").toString("base64")}`
  const approved = {
    "darwin-arm64": { executable: "oxlint", url: "https://github.com/oxc-project/oxc/releases/download/oxlint_v1.91.0/oxlint-aarch64-apple-darwin.tar.gz", integrity: sri(releaseSha256["darwin-arm64"]), format: "tar.gz", entries: [{ from: "oxlint-aarch64-apple-darwin", to: "oxlint", executable: true }] },
    "darwin-x64": { executable: "oxlint", url: "https://github.com/oxc-project/oxc/releases/download/oxlint_v1.91.0/oxlint-x86_64-apple-darwin.tar.gz", integrity: sri(releaseSha256["darwin-x64"]), format: "tar.gz", entries: [{ from: "oxlint-x86_64-apple-darwin", to: "oxlint", executable: true }] },
    "linux-arm64": { executable: "oxlint", url: "https://github.com/oxc-project/oxc/releases/download/oxlint_v1.91.0/oxlint-aarch64-unknown-linux-musl.tar.gz", integrity: sri(releaseSha256["linux-arm64"]), format: "tar.gz", entries: [{ from: "oxlint-aarch64-unknown-linux-musl", to: "oxlint", executable: true }] },
    "linux-x64": { executable: "oxlint", url: "https://github.com/oxc-project/oxc/releases/download/oxlint_v1.91.0/oxlint-x86_64-unknown-linux-musl.tar.gz", integrity: sri(releaseSha256["linux-x64"]), format: "tar.gz", entries: [{ from: "oxlint-x86_64-unknown-linux-musl", to: "oxlint", executable: true }] },
    "win32-x64": { executable: "oxlint-x86_64-pc-windows-msvc.exe", url: "https://github.com/oxc-project/oxc/releases/download/oxlint_v1.91.0/oxlint-x86_64-pc-windows-msvc.zip", integrity: sri(releaseSha256["win32-x64"]), format: "zip", entries: [{ from: "oxlint-x86_64-pc-windows-msvc.exe", to: "oxlint-x86_64-pc-windows-msvc.exe", executable: true }] },
  } as const
  expect(Object.keys(pinned.targets).sort()).toEqual(Object.keys(approved).sort())
  for (const [target, expected] of Object.entries(approved)) {
    expect(pinned.targets[target as keyof typeof pinned.targets]).toEqual({
      executable: expected.executable,
      artifact: { url: expected.url, integrity: expected.integrity, format: expected.format, entries: [...expected.entries] },
    })
  }
  expect(sri("95ced5ecf1133fbf41d409b5555c86c344f83f3b019926057ddbc07cfdcc27b3")).toBe(pinned.notices[0].integrity)
  expect(pinned.notices).toEqual([{
    url: "https://raw.githubusercontent.com/oxc-project/oxc/f3fcdcc61b08e9880476279ba21a363967940fa4/LICENSE",
    integrity: "sha256-lc7V7PETP79B1Am1VVyGw0T4PzsBmSYFfdvAfP3MJ7M=",
    filename: "oxlint-1.91.0-license.txt",
  }])
})

test("oxlint records measured platform requirements without inventing Linux or Windows floors", () => {
  expect(pinned.floor).toEqual({
    "darwin-arm64": { macos: "11.0" },
    "darwin-x64": { macos: "10.12" },
    "linux-arm64": {},
    "linux-x64": {},
    "win32-x64": {},
  })
})
