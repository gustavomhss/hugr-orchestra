import { expect, test } from "bun:test"
import pinned from "../../src/backend-toolkit/packs/tsgolint"

test("tsgolint 7.0.2005 pins the registry tarballs and the tag licence", () => {
  expect(pinned.version).toBe("7.0.2005")
  expect(pinned.license).toBe("MIT")
  expect(pinned.upstream).toBe("oxc-project/tsgolint")
  const approved = {
    "darwin-arm64": {
      executable: "tsgolint",
      url: "https://registry.npmjs.org/@oxlint-tsgolint/darwin-arm64/-/darwin-arm64-7.0.2005.tgz",
      integrity: "sha256-UJQtED1Osmn3rm2wJphICyi866SZ0WK6yRHWEyq2Omg=",
    },
    "darwin-x64": {
      executable: "tsgolint",
      url: "https://registry.npmjs.org/@oxlint-tsgolint/darwin-x64/-/darwin-x64-7.0.2005.tgz",
      integrity: "sha256-WsmbkH1iWaXIvsniBaAAoCe2Ajvf0r6N1+xqkL1jEaA=",
    },
    "linux-arm64": {
      executable: "tsgolint",
      url: "https://registry.npmjs.org/@oxlint-tsgolint/linux-arm64/-/linux-arm64-7.0.2005.tgz",
      integrity: "sha256-URnH+7/pd1sKjmutT3HrSIo/U1iS5Gr3DeMS9puzaAo=",
    },
    "linux-x64": {
      executable: "tsgolint",
      url: "https://registry.npmjs.org/@oxlint-tsgolint/linux-x64/-/linux-x64-7.0.2005.tgz",
      integrity: "sha256-PNJXV08rPw3mmQTq0Qykk5cYTnDP9IHJBd0AzEqndVQ=",
    },
    "win32-x64": {
      executable: "tsgolint.exe",
      url: "https://registry.npmjs.org/@oxlint-tsgolint/win32-x64/-/win32-x64-7.0.2005.tgz",
      integrity: "sha256-3rr5AdOJGWY9iRVsx1BOcdxwJLA5fAnczQwhlV2HuxU=",
    },
  } as const
  expect(Object.keys(pinned.targets).sort()).toEqual(Object.keys(approved).sort())
  for (const [target, expected] of Object.entries(approved)) {
    const entry = pinned.targets[target as keyof typeof pinned.targets]
    expect(entry.executable).toBe(expected.executable)
    expect(entry.artifact.url).toBe(expected.url)
    expect(entry.artifact.integrity).toBe(expected.integrity)
    expect(entry.artifact.format).toBe("tar.gz")
    expect(entry.artifact.entries).toEqual([{ from: `package/${expected.executable}`, to: expected.executable, executable: true }])
  }
  expect(pinned.notices).toEqual([{
    url: "https://raw.githubusercontent.com/oxc-project/tsgolint/v7.0.2005/LICENSE",
    integrity: "sha256-whHMUzbS1H8hMirKNcgUlpneYh7cRHKUthcEjQWnRc4=",
    filename: "tsgolint-7.0.2005-license.txt",
  }])
  expect(pinned.floor).toEqual({
    "darwin-arm64": { macos: "12.0" },
    "darwin-x64": { macos: "12.0" },
    "linux-arm64": {},
    "linux-x64": {},
    "win32-x64": {},
  })
})
