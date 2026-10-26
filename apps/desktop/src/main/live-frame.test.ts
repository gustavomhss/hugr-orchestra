import { expect, test } from "bun:test"
import { mockElectron } from "./electron-mock.fixture"

mockElectron()
const { encodeJpeg } = await import("./live-frame")
const { senseStatus } = await import("./live-permissions")

test("frame JPEG falls in quality until it fits the budget", () => {
  const asked: number[] = []
  const image = { toJPEG: (quality: number) => (asked.push(quality), Buffer.alloc(quality > 55 ? 400 * 1024 : 1000)) }
  expect(encodeJpeg(image).length).toBe(1000)
  expect(asked).toEqual([85, 75, 65, 55])
})

test("frame JPEG keeps the lowest quality when nothing fits", () => {
  expect(encodeJpeg({ toJPEG: () => Buffer.alloc(500 * 1024) }).length).toBe(500 * 1024)
})

test("macOS media status maps to the overlay's sense status", () => {
  expect(["granted", "denied", "restricted", "not-determined", "unknown"].map(senseStatus)).toEqual([
    "granted",
    "denied",
    "denied",
    "on-request",
    "on-request",
  ])
})
