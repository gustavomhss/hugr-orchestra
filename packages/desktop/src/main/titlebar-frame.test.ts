import { describe, expect, test } from "bun:test"
import { requireTitlebarFrame, titlebarFramePosition } from "./titlebar-frame"

describe("native titlebar frame", () => {
  test("aligns measured inset toolbar at native zoom", () => {
    expect(titlebarFramePosition({ left: 13, top: 13, height: 45 }, 1)).toEqual({ x: 26, y: 28 })
    expect(titlebarFramePosition({ left: 12.8, top: 12.8, height: 45 }, 1.25)).toEqual({ x: 32, y: 36 })
    expect(titlebarFramePosition({ left: 13, top: 13, height: 45 }, 0.8)).toEqual({ x: 21, y: 20 })
  })
  test("resets default position when no frame exists", () => {
    expect(requireTitlebarFrame(undefined, { width: 1280, height: 800 }, 1.25)).toBeUndefined()
    expect(titlebarFramePosition(undefined, 1.25)).toEqual({ x: 14, y: 14 })
  })
  test("snapshots geometry and ignores renderer zoom or window identity", () => {
    const input = { left: 12.8, top: 12.8, height: 45, zoom: 50, windowID: "other" }
    const frame = requireTitlebarFrame(input, { width: 1280, height: 800 }, 1.25)
    input.left = 900
    expect(frame).toEqual({ left: 12.8, top: 12.8, height: 45 })
    expect(titlebarFramePosition(frame, 1.25)).toEqual({ x: 32, y: 36 })
  })
  test("rejects malformed, nonfinite and negative geometry", () => {
    const invalid = [
      null,
      [],
      "frame",
      {},
      { left: "13", top: 13, height: 45 },
      ...["left", "top", "height"].flatMap((key) =>
        [NaN, Infinity, -Infinity, -1].map((value) => ({ left: 13, top: 13, height: 45, [key]: value })),
      ),
      { left: 13, top: 13, height: 0 },
    ]
    invalid.forEach((frame) =>
      expect(() => requireTitlebarFrame(frame, { width: 1280, height: 800 }, 1.25)).toThrow("Invalid titlebar frame"),
    )
  })
  test("validates against the sender CSS viewport", () => {
    expect(requireTitlebarFrame({ left: 1023, top: 595, height: 45 }, { width: 1280, height: 800 }, 1.25)).toEqual({
      left: 1023,
      top: 595,
      height: 45,
    })
    const invalid = [
      { left: 1024, top: 13, height: 45 },
      { left: 13, top: 596, height: 45 },
      { left: 13, top: 640, height: 1 },
      { left: 13, top: 0, height: 641 },
    ]
    invalid.forEach((frame) =>
      expect(() => requireTitlebarFrame(frame, { width: 1280, height: 800 }, 1.25)).toThrow("Invalid titlebar frame"),
    )
    Array.of(0, -1, Infinity, NaN).forEach((zoom) =>
      expect(() => requireTitlebarFrame({ left: 13, top: 13, height: 45 }, { width: 1280, height: 800 }, zoom)).toThrow(
        "Invalid titlebar frame",
      ),
    )
  })
})
