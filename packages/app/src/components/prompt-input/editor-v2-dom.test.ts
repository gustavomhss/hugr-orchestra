import { expect, test } from "bun:test"
import { parsePromptInputV2Editor, renderPromptInputV2Editor } from "@orchestra/session-ui/v2/prompt-input"
import type { PromptInputV2Prompt } from "@orchestra/session-ui/v2/prompt-input/types"
import { getCursorPosition, setCursorPosition } from "./editor-dom"

test("V2 renderer/parser preserve pill metadata and UTF-16 cursor boundaries", () => {
  const prompt: PromptInputV2Prompt = [
    { type: "text", content: "é\u200B\n", start: 0, end: 3 },
    {
      type: "file", path: "resource://doc", content: "@doc", start: 3, end: 7,
      mime: "text/plain", filename: "doc", url: "resource://doc",
      selection: { startLine: 1, startChar: 2, endLine: 3, endChar: 4 },
      source: { type: "resource", clientName: "docs", uri: "resource://doc", text: { value: "@doc", start: 3, end: 7 } },
    },
    { type: "text", content: "\n", start: 7, end: 8 },
    { type: "agent", name: "backend", content: "@Backend", start: 8, end: 16 },
    { type: "text", content: "\r\n😀\n", start: 16, end: 21 },
  ]
  const editor = document.createElement("div")
  editor.contentEditable = "true"
  document.body.appendChild(editor)
  renderPromptInputV2Editor(editor, prompt)
  editor.focus()
  Array.of(0, 1, 2, 3, 7, 8, 16, 17, 18, 20, 21).forEach((cursor) => {
    setCursorPosition(editor, cursor)
    renderPromptInputV2Editor(editor, parsePromptInputV2Editor(editor))
    expect(getCursorPosition(editor)).toBe(cursor)
    expect(parsePromptInputV2Editor(editor)).toEqual(prompt)
  })
  editor.firstChild!.textContent = "x" + editor.firstChild!.textContent
  const file = parsePromptInputV2Editor(editor).find((part) => part.type === "file")
  expect(file?.selection).toEqual({ startLine: 1, startChar: 2, endLine: 3, endChar: 4 })
  expect(file?.source?.text).toEqual({ value: "@doc", start: 4, end: 8 })
  expect(file?.url).toBe("resource://doc")
  expect(prompt[1]).toMatchObject({ start: 3, end: 7, source: { text: { start: 3, end: 7 } } })
  editor.remove()
})

test.each(["\n\n", "\u200B", "\né — 😀\r\n\u200B\n", "```owner-demand\n\n```\n"])(
  "V2 literal serializer keeps exact text: %j", (content) => {
    const editor = document.createElement("div")
    const prompt: PromptInputV2Prompt = [{ type: "text", content, start: 0, end: content.length }]
    renderPromptInputV2Editor(editor, prompt)
    expect(parsePromptInputV2Editor(editor)).toEqual(prompt)
  },
)
