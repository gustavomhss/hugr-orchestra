import { describe, expect, test } from "bun:test"
import { mockElectron } from "./electron-mock.fixture"

mockElectron()
const { permissionFor, systemAudioAvailable } = await import("./live-readiness")

describe("live readiness", () => {
  test("maps the macOS media status to a permission", () => {
    expect(permissionFor("granted")).toBe("granted")
    expect(permissionFor("denied")).toBe("denied")
    expect(permissionFor("restricted")).toBe("denied")
    expect(permissionFor("not-determined")).toBe("needed")
  })

  test("system audio needs macOS 14.2 (Darwin 23.2)", () => {
    expect(systemAudioAvailable("darwin", "23.2.0")).toBe(true)
    expect(systemAudioAvailable("darwin", "24.3.0")).toBe(true)
    expect(systemAudioAvailable("darwin", "23.1.0")).toBe(false)
    expect(systemAudioAvailable("darwin", "22.6.0")).toBe(false)
    expect(systemAudioAvailable("win32", "10.0.22631")).toBe(false)
  })
})
