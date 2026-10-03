import { expect, test } from "bun:test"
import { currentRoute } from "./layout-route"

test("parses Orchestra chapter routes without a server", () => {
  expect(currentRoute("/orchestra/mcp", "")).toEqual({ type: "chapter", chapter: "mcp" })
  expect(currentRoute("/orchestra/mcp/", "")).toEqual({ type: "chapter", chapter: "mcp" })
})

test("keeps non-chapter shapes on their existing routes", () => {
  expect(currentRoute("/orchestra/mcp/extra", "")).toEqual({ type: "home" })
  expect(currentRoute("/", "")).toEqual({ type: "home" })
  expect(currentRoute("/new-session", "?draftId=d1")).toEqual({ type: "draft", draftID: "d1" })
})
