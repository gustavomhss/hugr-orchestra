import { describe, expect, test } from "bun:test"
import { BackendToolkitTarget } from "../src/backend-toolkit/target"

describe("backend toolkit target detection", () => {
  const host = { musl: false, rosetta: false }
  test.each([
    ["darwin", "arm64", host, { target: "darwin-arm64" }],
    ["darwin", "x64", host, { target: "darwin-x64" }],
    ["darwin", "x64", { ...host, rosetta: true }, { target: "darwin-arm64" }],
    ["linux", "arm64", host, { target: "linux-arm64" }],
    ["linux", "x64", host, { target: "linux-x64" }],
    ["linux", "x64", { ...host, musl: true }, { unsupported: "libc-musl" }],
    ["linux", "arm64", { ...host, musl: true }, { unsupported: "libc-musl" }],
    ["win32", "x64", host, { target: "win32-x64" }],
    ["win32", "arm64", host, { unsupported: "cpu-arm64-windows" }],
    ["freebsd", "x64", host, { unsupported: "platform-freebsd-x64" }],
    ["linux", "ia32", host, { unsupported: "platform-linux-ia32" }],
  ] as const)("%s %s %o", (platform, arch, flags, expected) => {
    expect(BackendToolkitTarget.detect({ platform, arch, ...flags })).toEqual(expected)
  })

  test("the running host resolves to a target or a reason", () => {
    const result = BackendToolkitTarget.detect()
    expect("target" in result ? BackendToolkitTarget.TARGETS.includes(result.target) : result.unsupported.length > 0).toBe(true)
  })
})
