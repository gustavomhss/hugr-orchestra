import { expect, test } from "bun:test"
import { BackendToolkitTarget, type Host } from "../src/backend-toolkit/target"

const host: Host = { platform: "darwin", arch: "x64", musl: false, rosetta: false, avx2: true, kernel: "25.1.0" }

test("the running host records a real macOS product version only on macOS", () => {
  expect(BackendToolkitTarget.current().macos).toEqual(process.platform === "darwin" ? expect.stringMatching(/^\d+(\.\d+){1,2}$/) : undefined)
})

test("macOS engine floors enforce the product version, not a guessed kernel minor", () => {
  expect(BackendToolkitTarget.below({ ...host, macos: "26.0" }, "darwin-x64", { macos: "26.1" })).toBe("macos-below-26.1")
  expect(BackendToolkitTarget.below({ ...host, macos: "26.1" }, "darwin-x64", { macos: "26.1" })).toBeUndefined()
  expect(BackendToolkitTarget.below({ ...host, macos: "26.2" }, "darwin-x64", { macos: "26.1" })).toBeUndefined()
  expect(BackendToolkitTarget.below({ ...host, macos: "26.1" }, "darwin-x64", { macos: "26.1.1" })).toBe("macos-below-26.1.1")
  expect(BackendToolkitTarget.below({ ...host, macos: "26.1.1" }, "darwin-x64", { macos: "26.1.1" })).toBeUndefined()
  expect(BackendToolkitTarget.below({ ...host, kernel: "21.4.0", macos: "12.3" }, "darwin-x64", { macos: "12.4" })).toBe("macos-below-12.4")
})

test("an unreadable macOS product version cannot qualify a same-major minor floor", () => {
  expect(BackendToolkitTarget.below(host, "darwin-x64", { macos: "26.1" })).toBe("macos-version-unavailable")
  expect(BackendToolkitTarget.below({ ...host, macos: "unreadable" }, "darwin-x64", { macos: "26.1" })).toBe("macos-version-unavailable")
  expect(BackendToolkitTarget.below(host, "darwin-x64", { macos: "26.0" })).toBeUndefined()
  expect(BackendToolkitTarget.below({ ...host, kernel: "24.6.0" }, "darwin-x64", { macos: "26.1" })).toBe("macos-below-26")
  expect(BackendToolkitTarget.below({ ...host, kernel: "26.0.0" }, "darwin-x64", { macos: "26.1" })).toBeUndefined()
  expect(BackendToolkitTarget.below({ ...host, platform: "linux" }, "darwin-x64", { macos: "26.1" })).toBeUndefined()
})
