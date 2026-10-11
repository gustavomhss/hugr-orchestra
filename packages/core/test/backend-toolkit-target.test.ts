import { describe, expect, test } from "bun:test"
import { BackendToolkitTarget } from "../src/backend-toolkit/target"

describe("backend toolkit target detection", () => {
  const host = { musl: false, rosetta: false, avx2: true, kernel: "24.3.0", glibc: "2.35" }
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

  // Floors are Node 22's lower bounds: macOS 11 (Darwin 20), glibc 2.28, Windows 10; x64 claims AVX2 (F5.1, F5.3).
  test.each([
    ["linux", "x64", { ...host, avx2: false }, { unsupported: "cpu-baseline" }],
    ["darwin", "x64", { ...host, avx2: false }, { unsupported: "cpu-baseline" }],
    ["win32", "x64", { ...host, avx2: false, kernel: "10.0.19045" }, { unsupported: "cpu-baseline" }],
    ["darwin", "x64", { ...host, avx2: false, rosetta: true }, { target: "darwin-arm64" }],
    ["linux", "arm64", { ...host, avx2: false }, { target: "linux-arm64" }],
    ["darwin", "arm64", { ...host, avx2: false, kernel: "20.6.0" }, { target: "darwin-arm64" }],
    ["darwin", "arm64", { ...host, kernel: "19.6.0" }, { unsupported: "macos-below-11" }],
    ["darwin", "x64", { ...host, kernel: "19.6.0" }, { unsupported: "macos-below-11" }],
    ["linux", "x64", { ...host, glibc: "2.28" }, { target: "linux-x64" }],
    ["linux", "arm64", { ...host, glibc: "2.27" }, { unsupported: "glibc-below-2.28" }],
    ["linux", "x64", { ...host, glibc: "2.9" }, { unsupported: "glibc-below-2.28" }],
    ["linux", "x64", { ...host, glibc: "3.0" }, { target: "linux-x64" }],
    ["linux", "x64", { ...host, glibc: undefined }, { target: "linux-x64" }],
    ["win32", "x64", { ...host, kernel: "10.0.19045" }, { target: "win32-x64" }],
    ["win32", "x64", { ...host, kernel: "6.3.9600" }, { unsupported: "windows-below-10" }],
  ] as const)("floors: %s %s %o", (platform, arch, flags, expected) => {
    expect(BackendToolkitTarget.detect({ platform, arch, ...flags })).toEqual(expected)
  })

  test("the running host resolves to a target or a reason", () => {
    const result = BackendToolkitTarget.detect()
    expect("target" in result ? BackendToolkitTarget.TARGETS.includes(result.target) : result.unsupported.length > 0).toBe(true)
  })
})
