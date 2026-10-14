import { expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { createStore } from "solid-js/store"
import { parsePromptInputV2Editor, renderPromptInputV2Editor } from "@orchestra/session-ui/v2/prompt-input"
import type { PromptInputV2PersistedState, PromptInputV2Prompt } from "@orchestra/session-ui/v2/prompt-input/types"
import { createPromptInputV2Controller, createPromptInputV2State, materializePromptEditor, promptEditorInsertionHTML } from "@orchestra/session-ui/v2/prompt-input/interaction"
import { getCursorPosition, setCursorPosition } from "./editor-dom"

test("V2 renderer/parser preserve pill metadata and UTF-16 cursor boundaries", () => {
  const prompt = [
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
  ] satisfies PromptInputV2Prompt
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
  const pill = editor.querySelector('[data-mention="file"]')!
  const wrapper = document.createElement("div")
  wrapper.append(...Array.from(editor.childNodes))
  editor.replaceChildren(wrapper)
  const range = document.createRange()
  range.setStart(pill.firstChild!, 1)
  range.collapse(true)
  expect(materializePromptEditor(editor, range).start).toBe(3)
  expect(editor.querySelector('[data-mention="file"]')).toBe(pill)
  expect(pill.contains(range.startContainer)).toBe(false)
  expect(parsePromptInputV2Editor(editor)).toEqual(prompt)
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
    const prompt = [{ type: "text", content, start: 0, end: content.length }] satisfies PromptInputV2Prompt
    renderPromptInputV2Editor(editor, prompt)
    expect(parsePromptInputV2Editor(editor)).toEqual(prompt)
  },
)

test("DOM-only literal HTML preserves Shift+Enter bytes; native undo requires hosted browser", () => {
  const editor = document.createElement("div")
  editor.contentEditable = "true"
  // Run 38571250935, V2 shift-enter trace, after@call@446: actual DOM before the final two keypresses.
  editor.append(...["lead", "\n", "\n", "é — 😀\u200B", ""].map((text) => document.createTextNode(text)))
  document.body.appendChild(editor)
  editor.focus()
  setCursorPosition(editor, 13)
  const fragment = document.createElement("template")
  fragment.innerHTML = promptEditorInsertionHTML("\n\n", true)
  editor.append(fragment.content)
  setCursorPosition(editor, 15)
  const content = "lead\n\né — 😀\u200B\n\n"
  expect(parsePromptInputV2Editor(editor)).toEqual([{ type: "text", content, start: 0, end: 15 }])
  expect(getCursorPosition(editor)).toBe(15)
  expect(editor.querySelector("[data-prompt-caret]")?.textContent).toBe("\u200B")
  editor.remove()
})

test.each(['<>&"\r\n\u200B\n', "row\r\n".repeat(220)])("DOM-only insertion HTML keeps literal text %j", (content) => {
  const editor = document.createElement("div")
  editor.innerHTML = promptEditorInsertionHTML(content, true)
  expect(parsePromptInputV2Editor(editor)).toEqual([{ type: "text", content, start: 0, end: content.length }])
})

test("custom modified Enter handling runs before controller suggestion dispatch", () => {
  createRoot((dispose) => {
    const state = createPromptInputV2State()
    state[1]("popover", { type: "command-inline", query: "", activeID: "cmd" })
    const calls = { key: 0 }
    const controller = createPromptInputV2Controller({
      state,
      store: createStore<PromptInputV2PersistedState>({ prompt: [{ type: "text", content: "keep", start: 0, end: 4 }], cursor: 4, context: { items: [] } }),
      commands: () => [{ id: "cmd", kind: "command", label: "/cmd" }], context: () => [], searchContextFiles: () => [],
      view: {
        submit: { stopping: () => false, onSubmit: () => { throw new Error("UNEXPECTED_SUBMIT") }, onStop: () => { throw new Error("UNEXPECTED_STOP") } },
        onKeyDown: (event) => { calls.key += 1; event.preventDefault() },
      },
    })
    const event = new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, ctrlKey: true, cancelable: true })
    expect(controller.onKeyDown(event)).toBe(true)
    expect(calls.key).toBe(1)
    expect(controller.value()).toBe("keep")
    dispose()
  })
})
