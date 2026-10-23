import { describe, expect, test } from "bun:test"
import { WALLPAPER_DIM_MAX, WALLPAPERS, clampWallpaperDim, wallpaperSrc } from "./catalog"

describe("wallpaper catalog", () => {
  test("ids are unique and resolve to a src", () => {
    const ids = WALLPAPERS.map((item) => item.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(wallpaperSrc(id)).toBeString()
  })

  test("unknown ids resolve to nothing", () => {
    expect(wallpaperSrc("no-such-photo")).toBeUndefined()
  })

  test("dim clamps persisted and malformed values", () => {
    expect(clampWallpaperDim(0.4)).toBe(0.4)
    expect(clampWallpaperDim(-1)).toBe(0)
    expect(clampWallpaperDim(5)).toBe(WALLPAPER_DIM_MAX)
    expect(clampWallpaperDim("0.2")).toBe(0.2)
    expect(clampWallpaperDim(Number.NaN)).toBe(0)
    expect(clampWallpaperDim("abc")).toBe(0)
    expect(clampWallpaperDim(undefined)).toBe(0)
  })
})
