import type { BrowserWindow } from "electron"
import { expect, test } from "bun:test"
import { mockElectron } from "./electron-mock.fixture"

const captures: ((value: { display_id: string; thumbnail: { isEmpty(): boolean; toJPEG(): Buffer } }[] | PromiseLike<never>) => void)[] = []
mockElectron({
  screen: {
    getCursorScreenPoint: () => ({ x: 0, y: 0 }),
    getDisplayNearestPoint: () => ({ id: 1, size: { width: 1920, height: 1080 } }),
  },
  desktopCapturer: { getSources: () => new Promise((resolve) => captures.push(resolve)) },
})
const { encodeJpeg, captureFrame } = await import("./live-frame")
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


test.each([[0, 1], [1, 0]])("concurrent captures restore original opacity in completion order %j", async (first, last) => {
  const state = { opacity: 0.7 }
  const window = {
    isDestroyed: () => false,
    isVisible: () => true,
    getOpacity: () => state.opacity,
    setOpacity: (value: number) => { state.opacity = value },
  } as BrowserWindow
  const pending = [captureFrame([window]), captureFrame([window])]
  while (captures.length < 2) await Bun.sleep(5)
  const complete = captures.splice(0)
  const source = [{ display_id: "1", thumbnail: { isEmpty: () => false, toJPEG: () => Buffer.from("jpeg") } }]
  complete[first](source)
  await pending[first]
  const during = state.opacity
  complete[last](source)
  await pending[last]
  expect(during).toBe(0)
  expect(state.opacity).toBe(0.7)
})


test("a rejected overlapping capture releases only its own opacity hold", async () => {
  const state = { opacity: 0.5 }
  const window = {
    isDestroyed: () => false, isVisible: () => true,
    getOpacity: () => state.opacity, setOpacity: (value: number) => { state.opacity = value },
  } as BrowserWindow
  const pending = [captureFrame([window]), captureFrame([window])]
  const failed = pending[0].catch((error: unknown) => error)
  while (captures.length < 2) await Bun.sleep(5)
  const complete = captures.splice(0)
  complete[0](Promise.reject(new Error("capture rejected")))
  expect(await failed).toBeInstanceOf(Error)
  expect(state.opacity).toBe(0)
  complete[1]([{ display_id: "1", thumbnail: { isEmpty: () => false, toJPEG: () => Buffer.from("jpeg") } }])
  await pending[1]
  expect(state.opacity).toBe(0.5)
})
