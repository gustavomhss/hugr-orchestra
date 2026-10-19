import { describe, expect, test } from "bun:test"
import { richParts } from "./text"

describe("atlas rich copy", () => {
  test("plain text stays one part", () => {
    expect(richParts("Nothing changed")).toEqual([{ text: "Nothing changed" }])
    expect(richParts("")).toEqual([])
  })

  test("the five tags become parts, in order", () => {
    expect(richParts("Keep <code>.atlas/</code> out of git")).toEqual([
      { text: "Keep " },
      { tag: "code", text: ".atlas/" },
      { text: " out of git" },
    ])
    expect(richParts("<b>a</b><code>b</code>")).toEqual([
      { tag: "b", text: "a" },
      { tag: "code", text: "b" },
    ])
    expect(richParts("x <em>e</em> <mark>m</mark> <small>s</small>")).toEqual([
      { text: "x " },
      { tag: "em", text: "e" },
      { text: " " },
      { tag: "mark", text: "m" },
      { text: " " },
      { tag: "small", text: "s" },
    ])
  })

  test("other tags and broken pairs stay text", () => {
    expect(richParts("atlas node <address> and <i>x</i>")).toEqual([{ text: "atlas node <address> and <i>x</i>" }])
    expect(richParts("<code>a</b>")).toEqual([{ text: "<code>a</b>" }])
    expect(richParts('<img src=x onerror="alert(1)">')).toEqual([{ text: '<img src=x onerror="alert(1)">' }])
  })
})
