import { expect, test } from "bun:test"
import pinned from "../../src/backend-toolkit/packs/zizmor"

test("zizmor 1.32.0 has independently verified release artifact and license pins", () => {
  expect(pinned.version).toBe("1.32.0")
  expect(pinned.license).toBe("MIT")
  expect(pinned.upstream).toBe("zizmorcore/zizmor")
  expect(pinned.fit).toEqual({ role: "check", input: "GitHub Actions workflows", skills: [] })
  const sri = (hex: string): `sha256-${string}` => `sha256-${Buffer.from(hex, "hex").toString("base64")}`
  const approved = {
    "darwin-arm64": { executable: "zizmor", url: "https://github.com/zizmorcore/zizmor/releases/download/v1.32.0/zizmor-aarch64-apple-darwin.tar.gz", hex: "6efed18c4539a663fd3c851a2be9533fd8456c4e646d9416206da059154a0d3c", format: "tar.gz", entries: [{ from: "zizmor", to: "zizmor", executable: true }] },
    "darwin-x64": { executable: "zizmor", url: "https://github.com/zizmorcore/zizmor/releases/download/v1.32.0/zizmor-x86_64-apple-darwin.tar.gz", hex: "6983143c719ada6845a69cc4dd2bacc215f971662fecd8bbd2678388e5ce5969", format: "tar.gz", entries: [{ from: "zizmor", to: "zizmor", executable: true }] },
    "linux-arm64": { executable: "zizmor", url: "https://github.com/zizmorcore/zizmor/releases/download/v1.32.0/zizmor-aarch64-unknown-linux-gnu.tar.gz", hex: "cb152b207f815116d7fa1c1ee4614f61578803351395052908095e79adfd9fd0", format: "tar.gz", entries: [{ from: "zizmor", to: "zizmor", executable: true }] },
    "linux-x64": { executable: "zizmor", url: "https://github.com/zizmorcore/zizmor/releases/download/v1.32.0/zizmor-x86_64-unknown-linux-gnu.tar.gz", hex: "bb110cc765eca9cd7efb2e284a956be5974c60027b0970f16397d86208a9957b", format: "tar.gz", entries: [{ from: "zizmor", to: "zizmor", executable: true }] },
    "win32-x64": { executable: "zizmor.exe", url: "https://github.com/zizmorcore/zizmor/releases/download/v1.32.0/zizmor-x86_64-pc-windows-msvc.zip", hex: "d284a16e09d9df4ce2c000357e7b59bd531be093bea5718a1ce225b449b59d49", format: "zip", entries: [{ from: "zizmor.exe", to: "zizmor.exe", executable: true }] },
  } as const
  expect(Object.keys(pinned.targets).sort()).toEqual(Object.keys(approved).sort())
  for (const [target, expected] of Object.entries(approved)) {
    expect(pinned.targets[target as keyof typeof pinned.targets]).toEqual({
      executable: expected.executable,
      artifact: { url: expected.url, integrity: sri(expected.hex), format: expected.format, entries: [...expected.entries] },
    })
  }
  expect(pinned.notices).toEqual([{
    url: "https://raw.githubusercontent.com/zizmorcore/zizmor/21bd300700d43d9ba04b0c1fce72a89391ac80b4/LICENSE",
    integrity: "sha256-pv0b0Y2nzsgoRjnVsNNRuQk0MXvhufnqlKB3YhxvNa8=",
    filename: "zizmor-1.32.0-license.txt",
  }])
})

test("zizmor records static-header ABI floors, not runtime qualification", () => {
  expect(pinned.floor).toEqual({
    "darwin-arm64": { macos: "11.0" },
    "darwin-x64": { macos: "26.1" },
    "linux-arm64": { glibc: "2.34" },
    "linux-x64": { glibc: "2.34" },
    "win32-x64": {},
  })
})
