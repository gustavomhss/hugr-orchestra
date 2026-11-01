import { describe, expect, test } from "bun:test"
import { createGrace } from "./grace"

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

describe("createGrace", () => {
  test("releases a dropped key once the window passes", async () => {
    const released: string[] = []
    const grace = createGrace(20, (key) => released.push(key))

    grace.drop("/repo")
    expect(released).toEqual([])
    await wait(80)

    expect(released).toEqual(["/repo"])
  })

  test("holding the key inside the window cancels the release", async () => {
    const released: string[] = []
    const grace = createGrace(30, (key) => released.push(key))

    grace.drop("/repo")
    grace.hold("/repo")
    await wait(100)

    expect(released).toEqual([])
  })

  test("a repeated drop restarts the window", async () => {
    const released: string[] = []
    const grace = createGrace(60, (key) => released.push(key))

    grace.drop("/repo")
    await wait(35)
    grace.drop("/repo")
    await wait(35)
    expect(released).toEqual([])
    await wait(100)

    expect(released).toEqual(["/repo"])
  })

  test("clear cancels every pending release", async () => {
    const released: string[] = []
    const grace = createGrace(20, (key) => released.push(key))

    grace.drop("/a")
    grace.drop("/b")
    grace.clear()
    await wait(80)

    expect(released).toEqual([])
  })
})
