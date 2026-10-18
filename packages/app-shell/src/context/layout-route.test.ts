import { expect, test } from "bun:test"
import { currentRoute } from "./layout-route"

test("parses Orchestra chapter routes without a server", () => {
  expect(currentRoute("/orchestra/mcp", "")).toEqual({ type: "chapter", chapter: "mcp" })
  expect(currentRoute("/orchestra/mcp/", "")).toEqual({ type: "chapter", chapter: "mcp" })
})

test("keeps views inside a chapter on that chapter", () => {
  expect(currentRoute("/orchestra/workflows/doc-1/executions/run-9", "")).toEqual({
    type: "chapter",
    chapter: "workflows",
  })
  expect(currentRoute("/orchestra/hooks/new", "")).toEqual({ type: "chapter", chapter: "hooks" })
})

test("keeps non-chapter shapes on their existing routes", () => {
  expect(currentRoute("/orchestra", "")).toEqual({ type: "home" })
  expect(currentRoute("/", "")).toEqual({ type: "home" })
  expect(currentRoute("/new-session", "?draftId=d1")).toEqual({ type: "draft", draftID: "d1" })
})
