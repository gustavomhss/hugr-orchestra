import { describe, expect, test } from "bun:test"
import { atlasHref, parseAtlasRoute, withQuery } from "./atlas-route"

describe("atlas routes", () => {
  test("the chapter root and unknown views open the overview", () => {
    expect(parseAtlasRoute("/orchestra/atlas", "")).toEqual({ view: "overview", param: "", query: {} })
    expect(parseAtlasRoute("/orchestra/atlas/", "")).toEqual({ view: "overview", param: "", query: {} })
    expect(parseAtlasRoute("/orchestra/atlas/settings", "")).toEqual({ view: "overview", param: "", query: {} })
    expect(parseAtlasRoute("/orchestra/workflows", "")).toEqual({ view: "overview", param: "", query: {} })
  })

  test("views keep their query", () => {
    expect(parseAtlasRoute("/orchestra/atlas/explore", "?view=map&q=x")).toEqual({ view: "explore", param: "", query: { view: "map", q: "x" } })
  })

  test("a unit path parses whether its slashes are encoded or not", () => {
    expect(parseAtlasRoute("/orchestra/atlas/unit/packages%2Fknowledge", "").param).toBe("packages/knowledge")
    expect(parseAtlasRoute("/orchestra/atlas/unit/packages/knowledge", "").param).toBe("packages/knowledge")
  })

  test("memory keeps the whole rest and a broken escape stays as typed", () => {
    expect(parseAtlasRoute("/orchestra/atlas/memory/backend/task/T-LIVE-2/transcript", "")).toEqual({
      view: "memory",
      param: "backend/task/T-LIVE-2/transcript",
      query: {},
    })
    expect(parseAtlasRoute("/orchestra/atlas/fact/%E0%A4%A", "").param).toBe("%E0%A4%A")
  })

  test("hrefs encode the param, drop empty query values and parse back", () => {
    expect(atlasHref("unit", "packages/knowledge", { fact: "k1", why: undefined, q: "" })).toBe("/orchestra/atlas/unit/packages%2Fknowledge?fact=k1")
    expect(atlasHref("overview")).toBe("/orchestra/atlas/overview")
    expect(parseAtlasRoute(atlasHref("memory", "backend/task/T-1"), "")).toEqual({ view: "memory", param: "backend/task/T-1", query: {} })
  })

  test("withQuery changes keys on the current route", () => {
    const route = parseAtlasRoute("/orchestra/atlas/review", "?tab=mined&fact=k1")
    expect(withQuery(route, { fact: undefined })).toBe("/orchestra/atlas/review?tab=mined")
    expect(withQuery(route, { fact: "k2" })).toBe("/orchestra/atlas/review?tab=mined&fact=k2")
  })
})
