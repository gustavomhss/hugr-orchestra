import { promptEditorCursor, promptEditorRangeEdge, readPromptEditor } from "@orchestra/session-ui/v2/prompt-input/interaction"

const MAX_BREAKS = 200

export function createCaretPlaceholder() {
  const span = document.createElement("span")
  span.setAttribute("data-prompt-caret", "")
  span.textContent = "\u200B"
  return span
}

function createBreak() {
  const br = document.createElement("br")
  br.setAttribute("data-prompt-break", "")
  return br
}

export function createTextFragment(content: string): DocumentFragment {
  const fragment = document.createDocumentFragment()
  let breaks = 0
  for (const char of content) {
    if (char !== "\n") continue
    breaks += 1
    if (breaks > MAX_BREAKS) {
      const tail = content.endsWith("\n")
      const text = tail ? content.slice(0, -1) : content
      if (text) fragment.appendChild(document.createTextNode(text))
      if (tail) fragment.appendChild(createBreak())
      return fragment
    }
  }

  const segments = content.split("\n")
  segments.forEach((segment, index) => {
    if (segment) {
      fragment.appendChild(document.createTextNode(segment))
    }
    if (index < segments.length - 1) {
      fragment.appendChild(createBreak())
    }
  })
  return fragment
}

export function getNodeLength(node: Node): number {
  return readPromptEditor(node).length
}

export function getTextLength(node: Node): number {
  return readPromptEditor(node).length
}

export function getCursorPosition(parent: HTMLElement): number {
  return promptEditorCursor(parent)
}

export function setCursorPosition(parent: HTMLElement, position: number) {
  const range = document.createRange()
  promptEditorRangeEdge(parent, range, "start", position)
  range.collapse(true)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

export function setRangeEdge(parent: HTMLElement, range: Range, edge: "start" | "end", offset: number) {
  promptEditorRangeEdge(parent, range, edge, offset)
}
