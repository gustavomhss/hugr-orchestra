import { expect, test } from "bun:test"
import pinned from "../../src/backend-toolkit/packs/actionlint"

test("actionlint 1.7.12 has the independently approved artifact and license pins", () => {
  expect(pinned.version).toBe("1.7.12")
  expect(pinned.license).toBe("MIT")
  expect(pinned.upstream).toBe("rhysd/actionlint")
  expect(pinned.fit).toEqual({ role: "check", input: "GitHub Actions workflows", skills: [] })
  const approved = {
    "darwin-arm64": { executable: "actionlint", url: "https://github.com/rhysd/actionlint/releases/download/v1.7.12/actionlint_1.7.12_darwin_arm64.tar.gz", integrity: "sha256-q6nO0t7o0n/syj3H/rGn+aUsrvoetG8ycepmtuDmlT8=", format: "tar.gz", entries: [{ from: "actionlint", to: "actionlint", executable: true }] },
    "darwin-x64": { executable: "actionlint", url: "https://github.com/rhysd/actionlint/releases/download/v1.7.12/actionlint_1.7.12_darwin_amd64.tar.gz", integrity: "sha256-W0TDvCJVEVybaeMO/A/s30mP22PF1Y4XCE/V8WMkxkQ=", format: "tar.gz", entries: [{ from: "actionlint", to: "actionlint", executable: true }] },
    "linux-arm64": { executable: "actionlint", url: "https://github.com/rhysd/actionlint/releases/download/v1.7.12/actionlint_1.7.12_linux_arm64.tar.gz", integrity: "sha256-Ml6XG2upv6UEZy4pvpPCSYHuscB1dtcw6ffIgFr/8MY=", format: "tar.gz", entries: [{ from: "actionlint", to: "actionlint", executable: true }] },
    "linux-x64": { executable: "actionlint", url: "https://github.com/rhysd/actionlint/releases/download/v1.7.12/actionlint_1.7.12_linux_amd64.tar.gz", integrity: "sha256-isqNuW8blHcPGw1ytt3cseu4EjyzcSUwsIzDh7NJo9g=", format: "tar.gz", entries: [{ from: "actionlint", to: "actionlint", executable: true }] },
    "win32-x64": { executable: "actionlint.exe", url: "https://github.com/rhysd/actionlint/releases/download/v1.7.12/actionlint_1.7.12_windows_amd64.zip", integrity: "sha256-bnJBtR5oF+pqBHaT2Ob+0TsxgZyaDdbFpybhWS0i9uk=", format: "zip", entries: [{ from: "actionlint.exe", to: "actionlint.exe", executable: true }] },
  } as const
  expect(Object.keys(pinned.targets).sort()).toEqual(Object.keys(approved).sort())
  for (const [target, expected] of Object.entries(approved)) {
    expect(pinned.targets[target as keyof typeof pinned.targets]).toEqual({
      executable: expected.executable,
      artifact: { url: expected.url, integrity: expected.integrity, format: expected.format, entries: [...expected.entries] },
    })
  }
  expect(pinned.notices).toEqual([{
    url: "https://raw.githubusercontent.com/rhysd/actionlint/914e7df21a07ef503a81201c76d2b11c789d3fca/LICENSE.txt",
    integrity: "sha256-A6JrBtIkOAoCvxAOBf/zst/HGxTU4vpoXsmWOodWPCI=",
    filename: "actionlint-1.7.12-license.txt",
  }])
})

test("actionlint records the measured static-header ABI floor", () => {
  expect(pinned.floor).toEqual({
    "darwin-arm64": { macos: "12.0" },
    "darwin-x64": { macos: "12.0" },
    "linux-arm64": {},
    "linux-x64": {},
    "win32-x64": {},
  })
})
