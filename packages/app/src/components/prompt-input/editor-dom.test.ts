import { describe, expect, test } from "bun:test"
import {
  createCaretPlaceholder,
  createTextFragment,
  getCursorPosition,
  getNodeLength,
  getTextLength,
  setCursorPosition,
  setRangeEdge,
} from "./editor-dom"
import { materializePromptEditor, promptEditorPoint, readPromptEditor } from "@orchestra/session-ui/v2/prompt-input/interaction"
import { normalizePaste } from "./paste"

describe("prompt-input editor dom", () => {
  test("createTextFragment preserves newlines with consecutive br nodes", () => {
    const fragment = createTextFragment("foo\n\nbar")
    const container = document.createElement("div")
    container.appendChild(fragment)

    expect(container.childNodes.length).toBe(4)
    expect(container.childNodes[0]?.textContent).toBe("foo")
    expect((container.childNodes[1] as HTMLElement).tagName).toBe("BR")
    expect((container.childNodes[2] as HTMLElement).tagName).toBe("BR")
    expect(container.childNodes[3]?.textContent).toBe("bar")
  })

  test("createTextFragment keeps trailing newline as terminal break", () => {
    const fragment = createTextFragment("foo\n")
    const container = document.createElement("div")
    container.appendChild(fragment)

    expect(container.childNodes.length).toBe(2)
    expect(container.childNodes[0]?.textContent).toBe("foo")
    expect((container.childNodes[1] as HTMLElement).tagName).toBe("BR")
  })

  test("createTextFragment avoids break-node explosion for large multiline content", () => {
    const content = Array.from({ length: 220 }, () => "line").join("\n")
    const fragment = createTextFragment(content)
    const container = document.createElement("div")
    container.appendChild(fragment)

    expect(container.childNodes.length).toBe(1)
    expect(container.childNodes[0]?.nodeType).toBe(Node.TEXT_NODE)
    expect(container.textContent).toBe(content)
  })

  test("createTextFragment keeps terminal break in large multiline fallback", () => {
    const content = `${Array.from({ length: 220 }, () => "line").join("\n")}\n`
    const fragment = createTextFragment(content)
    const container = document.createElement("div")
    container.appendChild(fragment)

    expect(container.childNodes.length).toBe(2)
    expect(container.childNodes[0]?.textContent).toBe(content.slice(0, -1))
    expect((container.childNodes[1] as HTMLElement).tagName).toBe("BR")
  })

  test("length helpers count user zero-width chars and logical breaks", () => {
    const container = document.createElement("div")
    container.appendChild(document.createTextNode("ab\u200B"))
    container.appendChild(document.createElement("br"))
    container.appendChild(document.createTextNode("cd"))

    expect(getNodeLength(container.childNodes[0]!)).toBe(3)
    expect(getNodeLength(container.childNodes[1]!)).toBe(1)
    expect(getTextLength(container)).toBe(6)
  })

  test("setCursorPosition and getCursorPosition round-trip with pills and breaks", () => {
    const container = document.createElement("div")
    const pill = document.createElement("span")
    pill.dataset.type = "file"
    pill.textContent = "@file"
    container.appendChild(document.createTextNode("ab"))
    container.appendChild(pill)
    container.appendChild(document.createElement("br"))
    container.appendChild(document.createTextNode("cd"))
    document.body.appendChild(container)

    setCursorPosition(container, 2)
    expect(getCursorPosition(container)).toBe(2)

    setCursorPosition(container, 7)
    expect(getCursorPosition(container)).toBe(7)

    setCursorPosition(container, 8)
    expect(getCursorPosition(container)).toBe(8)

    container.remove()
  })

  test("setCursorPosition and getCursorPosition round-trip across blank lines", () => {
    const container = document.createElement("div")
    container.appendChild(document.createTextNode("a"))
    container.appendChild(document.createElement("br"))
    container.appendChild(document.createElement("br"))
    container.appendChild(document.createTextNode("b"))
    document.body.appendChild(container)

    setCursorPosition(container, 2)
    expect(getCursorPosition(container)).toBe(2)

    setCursorPosition(container, 3)
    expect(getCursorPosition(container)).toBe(3)

    container.remove()
  })

  // Chromium insertText/fill uses line DIVs; native Shift+Enter ends with a caret BR.
  test.each([
    ["a<div><br></div><div>b</div>", "a\n\nb"],
    ["<div>a</div><div><br></div><div>b</div>", "a\n\nb"],
    ["<div><br></div><div>a</div><div><br></div>", "\na\n"],
    ["<div><br></div><div><br></div><div><br></div>", "\n\n"],
    ["a<div>b</div>c", "a\nb\nc"],
    ["<div>a<div>b</div><div><br></div><div>c</div></div>d", "a\nb\n\nc\nd"],
    ["<p>a</p><p><br></p><p>b</p>", "a\n\nb"],
    ["a<br><br>", "a\n"],
    ["a<br>", "a"],
    ["<br><br>", "\n"],
    ["<br>", ""],
    ["a<br><br>b", "a\n\nb"],
    ["<div>a</div><br>b", "a\nb"],
    ["<div>a<span><br></span>b</div>", "a\nb"],
    ["<span>a<br></span>b", "a\nb"],
    ["<div>a<span><i><br></i></span>b</div>", "a\nb"],
    ["<div>a<span><br></span></div><div>b</div>", "a\nb"],
    ["```owner-demand<div>é — 😀\u200B</div><div><br></div><div>```</div><div><br></div>", "```owner-demand\né — 😀\u200B\n\n```\n"],
  ])("decodes browser line boxes: %s", (html, expected) => {
    const container = document.createElement("div")
    container.innerHTML = html
    document.body.appendChild(container)
    expect(readPromptEditor(container).segments.map((part) => part.content).join("")).toBe(expected)
    Array.from({ length: expected.length + 1 }, (_, cursor) => {
      setCursorPosition(container, cursor)
      expect(getCursorPosition(container)).toBe(cursor)
    })
    container.remove()
  })

  test.each(["\n\n", "\né\u200B😀\n\n", "a\r\nb\rc\n", "```x\n\n```\n", "row\n".repeat(220)])(
    "round-trips literal text, including terminal LF and CR: %j",
    (text) => {
      const container = document.createElement("div")
      container.appendChild(createTextFragment(normalizePaste(text)))
      container.appendChild(createCaretPlaceholder())
      expect(readPromptEditor(container).segments.map((part) => part.content).join("")).toBe(text)
      expect(getTextLength(container)).toBe(text.length)
    },
  )

  test("discards only the marked caret prefix, retaining typed text and user U+200B", () => {
    const container = document.createElement("div")
    container.appendChild(document.createTextNode("\u200B"))
    const caret = createCaretPlaceholder()
    caret.firstChild!.textContent += "typed\u200B"
    container.appendChild(caret)
    expect(readPromptEditor(container).segments.map((part) => part.content).join("")).toBe("\u200Btyped\u200B")
  })

  test("empty text nodes do not add line boundaries around blank DIVs", () => {
    const container = document.createElement("div")
    container.innerHTML = "<div><br></div><div>b</div>"
    container.insertBefore(document.createTextNode(""), container.lastChild)
    expect(readPromptEditor(container).segments.map((part) => part.content).join("")).toBe("\nb")
  })

  // DOM-only range splice: this fixture has no browser editing/undo engine. Hosted keyboard cases cover undo.
  test.each([
    { start: 1, end: 2, insert: "x", expected: "axb" },
    { start: 1, end: 1, insert: "\n", expected: "a\n\nb" },
  ])("materializes structural breaks before editing %j", ({ start, end, insert, expected }) => {
    const editor = document.createElement("div")
    editor.innerHTML = "<div>a</div><div>b</div>"
    const range = document.createRange()
    setRangeEdge(editor, range, "start", start)
    setRangeEdge(editor, range, "end", end)
    const prepared = materializePromptEditor(editor, range)
    expect([prepared.start, prepared.end]).toEqual([start, end])
    range.deleteContents()
    range.insertNode(document.createTextNode(insert))
    expect(readPromptEditor(editor).segments.map((part) => part.content).join("")).toBe(expected)
  })

  test("pill interiors choose nearest boundary, ties right, for points and ranges", () => {
    const editor = document.createElement("div")
    editor.innerHTML = 'a<span data-mention="agent" contenteditable="false">@backend</span>b'
    document.body.appendChild(editor)
    const pill = editor.children[0]!
    expect(promptEditorPoint(editor, pill.firstChild!, 1)).toBe(1)
    expect(promptEditorPoint(editor, pill.firstChild!, 4)).toBe(9)
    Array.of([2, 1], [5, 9], [8, 9]).forEach(([input, expected]) => {
      setCursorPosition(editor, input!)
      expect(getCursorPosition(editor)).toBe(expected!)
      expect(pill.contains(window.getSelection()!.getRangeAt(0).startContainer)).toBe(false)
    })
    editor.remove()
  })
})
