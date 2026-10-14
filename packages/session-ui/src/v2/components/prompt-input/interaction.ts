import { createEffect, on, type Accessor } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { useFilteredList } from "@orchestra/ui/hooks"
import { createPromptInputV2Attachments, type PromptInputV2AttachmentConfig } from "./attachments"
import { createPromptInputV2Store, type PromptInputV2StoreInput } from "./store"
import type {
  PromptInputV2Attachment,
  PromptInputV2Comment,
  PromptInputV2History,
  PromptInputV2HistoryEntry,
  PromptInputV2Option,
  PromptInputV2PersistedState,
  PromptInputV2Suggestion,
} from "./types"
import {
  createPromptInputV2InteractionState,
  transitionPromptInputV2,
  type PromptInputV2InteractionCommand,
  type PromptInputV2InteractionEvent,
} from "./machine"

export type PromptInputV2SelectControl = {
  options: Accessor<PromptInputV2Option[]>
  current: Accessor<string>
  onSelect: (id: string) => void
  keybind?: Accessor<string[]>
}

export type PromptInputV2ViewConfig = {
  placeholder?: Accessor<string>
  add?: {
    onAttach: () => void
  }
  model?: PromptInputV2SelectControl
  variant?: PromptInputV2SelectControl
  submit: {
    stopping: Accessor<boolean>
    working?: Accessor<boolean>
    onSubmit: () => void
    onStop: () => void
  }
  shell?: {
    onOpen: () => void
    onClose: () => void
  }
  onKeyDown?: (event: KeyboardEvent) => void
  onPaste?: (event: ClipboardEvent) => void
  onDrop?: (event: DragEvent) => void
}

export function createPromptInputV2State() {
  return createStore(createPromptInputV2InteractionState())
}

export function createPromptInputV2Controller(input: {
  store: PromptInputV2StoreInput
  state?: ReturnType<typeof createPromptInputV2State>
  identity?: Accessor<unknown>
  history?: PromptInputV2History
  commands: Accessor<PromptInputV2Suggestion[]>
  context: Accessor<PromptInputV2Suggestion[]>
  searchContextFiles: (query: string) => PromptInputV2Suggestion[] | Promise<PromptInputV2Suggestion[]>
  openAttachment?: (attachment: PromptInputV2Attachment) => void
  openContext?: (key: string) => void
  onContextRemove?: (item: PromptInputV2Comment) => void
  onEditor?: (element: HTMLElement) => void
  onSuggestionSelect?: (item: PromptInputV2Suggestion) => (() => void) | void
  view: PromptInputV2ViewConfig
  attachments?: PromptInputV2AttachmentConfig
}) {
  let editor: HTMLElement | undefined
  let fileInput: HTMLInputElement | undefined
  const draft = createPromptInputV2Store(input.store)
  const [state, setState] = input.state ?? createPromptInputV2State()
  if (input.identity) {
    createEffect(on(input.identity, () => setState(reconcile(createPromptInputV2InteractionState())), { defer: true }))
  }
  function addPart(part: PromptInputV2PersistedState["prompt"][number]) {
    if (part.type === "image") return false
    if (part.type === "file" || part.type === "agent") {
      draft.addMention(part)
      return true
    }
    draft.addText(part.content)
    return true
  }
  const attachments = input.attachments
    ? createPromptInputV2Attachments({
        ...input.attachments,
        capture: () => ({
          current: () => draft.state.prompt,
          cursor: () => draft.state.cursor,
          set: draft.setPrompt,
        }),
        editor: () => editor,
        focusEditor: () => editor?.focus(),
        addPart,
        setDraggingType: (type) => dispatch({ type: type ? "drag.enter" : "drag.leave" }),
      })
    : undefined
  const attach = () => {
    if (!attachments) {
      input.view.add?.onAttach()
      return
    }
    attachments.pick(() => fileInput?.click())
  }
  const contextList = useFilteredList<PromptInputV2Suggestion>({
    items: async (query) => {
      const fixed = input.context().filter((item) => item.kind !== "file")
      const recent = input.context().filter((item) => item.kind === "file" && item.recent)
      if (!query.trim()) return [...fixed, ...recent]
      const seen = new Set(recent.map((item) => item.id))
      const files = (await input.searchContextFiles(query)).filter((item) => !seen.has(item.id))
      return [...fixed, ...recent, ...files]
    },
    key: (item) => item.id,
    filterKeys: ["label"],
    skipFilter: (item) => item.kind === "file" && !item.recent,
    groupBy: (item) => {
      if (item.kind === "reference") return "reference"
      if (item.kind === "agent") return "agent"
      if (item.kind === "resource") return "resource"
      if (item.recent) return "recent"
      return "file"
    },
    sortGroupsBy: (a, b) => {
      const order = ["reference", "agent", "resource", "recent", "file"]
      return order.indexOf(a.category) - order.indexOf(b.category)
    },
  })
  const commandList = useFilteredList<PromptInputV2Suggestion>({
    items: () => input.commands(),
    key: (item) => item.id,
    filterKeys: ["trigger", "title"],
  })
  const list = () => (state.popover.type === "context" ? contextList : commandList)
  const suggestions = () => list().flat()

  const execute = (command: PromptInputV2InteractionCommand) => {
    if (command.type === "draft.setText") {
      draft.setText(command.value)
      return
    }
    if (command.type === "mention.add") {
      if (command.item.mention) draft.addMention(command.item.mention)
      return
    }
    if (command.type === "popover.filter") {
      ;(command.popover === "command" ? commandList : contextList).onInput(command.query)
      return
    }
    if (command.type === "suggestion.select") {
      const item = suggestions().find((entry) => entry.id === command.id)
      if (item) dispatch({ type: "popover.select", item })
      return
    }
    if (command.type === "focus.editor") requestAnimationFrame(() => editor?.focus())
  }

  function dispatch(event: PromptInputV2InteractionEvent) {
    const mode = state.mode
    const result = transitionPromptInputV2(state, event, draft.state)
    const action = event.type === "popover.select" ? input.onSuggestionSelect?.(event.item) : undefined
    if (event.type === "popover.select") {
      if (!action || state.popover.type !== "command-menu") result.commands.forEach(execute)
      if (action && event.item.kind === "command" && state.popover.type !== "command-menu") {
        draft.setPrompt(
          draft.state.prompt.filter((part): part is PromptInputV2Attachment => part.type === "image"),
          0,
        )
      }
    }
    setState(reconcile(result.state))
    if (event.type !== "popover.select") result.commands.forEach(execute)
    if (mode !== result.state.mode) {
      if (result.state.mode === "shell") input.view.shell?.onOpen()
      if (result.state.mode === "normal") input.view.shell?.onClose()
    }
    if (event.type === "popover.select") {
      if (!action) return result.handled
      action()
    }
    return result.handled
  }

  const onKeyDown = (event: KeyboardEvent, composing = event.isComposing || event.keyCode === 229) => {
    const modified = event.altKey || event.ctrlKey || event.metaKey
    if (modified) {
      input.view.onKeyDown?.(event)
      if (event.defaultPrevented) return true
    }
    if (composing || event.isComposing || event.keyCode === 229) return false
    // Shift+Enter belongs to the editor, including populated and empty suggestion popovers.
    if (event.key === "Enter" && event.shiftKey && !modified) return false
    if (
      state.mode === "normal" &&
      (event.metaKey || event.ctrlKey) &&
      !event.altKey &&
      !event.shiftKey &&
      event.key.toLowerCase() === "u"
    ) {
      event.preventDefault()
      attach()
      return true
    }
    const handled = dispatch({
      type: "key.down",
      key: event.key,
      ctrl: event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey,
      composing,
      ids: suggestions().map((item) => item.id),
      empty: draft.state.prompt.every((part) => !("content" in part) || part.content.length === 0),
    })
    if (handled) event.preventDefault()
    if (handled && event.key !== "Enter" && event.key !== "Tab" && state.popover.type !== "closed") {
      const activeID = state.popover.activeID ?? ""
      requestAnimationFrame(() =>
        document.querySelector(`[data-suggestion-id="${CSS.escape(activeID)}"]`)?.scrollIntoView({ block: "nearest" }),
      )
    }
    if (handled) return true
    const stop =
      input.view.submit.working?.() &&
      ((event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "g") ||
        event.key === "Escape")
    if (stop) {
      event.preventDefault()
      input.view.submit.onStop()
      return true
    }
    if (
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      (event.key === "ArrowUp" || event.key === "ArrowDown") &&
      navigateHistory(event.key === "ArrowUp" ? "up" : "down")
    ) {
      event.preventDefault()
      return true
    }
    if (!modified) input.view.onKeyDown?.(event)
    return event.defaultPrevented
  }

  createEffect(() => {
    if (state.popover.type === "closed") return
    const ids = suggestions().map((item) => item.id)
    if (state.popover.activeID ? ids.includes(state.popover.activeID) : ids.length === 0) return
    dispatch({ type: "popover.results", ids })
  })

  const restoreFocus = (cursor = draft.state.cursor ?? promptLength(draft.state.prompt)) => {
    requestAnimationFrame(() => {
      editor?.focus()
      setEditorCursor(editor, cursor)
    })
  }

  const applyHistory = (entry: PromptInputV2HistoryEntry, position: "start" | "end") => {
    input.history?.restore?.(entry.metadata)
    const cursor = position === "start" ? 0 : promptLength(entry.prompt)
    draft.setPrompt(clonePrompt(entry.prompt), cursor)
    restoreFocus(cursor)
  }
  const navigateHistory = (direction: "up" | "down") => {
    if (!input.history || !editor) return false
    const selection = window.getSelection()
    if (!selection?.isCollapsed || !editor.contains(selection.anchorNode)) return false
    const text = draft.state.prompt.map((part) => ("content" in part ? part.content : "")).join("")
    if (!canNavigateHistory(direction, text, editorCursor(editor), state.historyIndex >= 0)) return false
    const entries = input.history.entries(state.mode)
    if (direction === "up") {
      if (entries.length === 0 || state.historyIndex >= entries.length - 1) return false
      if (state.historyIndex === -1) {
        setState("savedHistory", {
          prompt: clonePrompt(draft.state.prompt),
          metadata: input.history.capture?.(),
        })
      }
      const index = state.historyIndex + 1
      setState("historyIndex", index)
      applyHistory(entries[index]!, "start")
      return true
    }
    if (state.historyIndex < 0) return false
    if (state.historyIndex > 0) {
      const index = state.historyIndex - 1
      setState("historyIndex", index)
      applyHistory(entries[index]!, "end")
      return true
    }
    const saved = state.savedHistory ?? { prompt: [{ type: "text", content: "", start: 0, end: 0 }] }
    setState({ historyIndex: -1, savedHistory: undefined })
    applyHistory(saved, "end")
    return true
  }

  return {
    state,
    view: input.view,
    suggestions,
    dispatch,
    onKeyDown,
    value() {
      return draft.state.prompt.map((part) => ("content" in part ? part.content : "")).join("")
    },
    parts() {
      return draft.state.prompt
    },
    cursor() {
      return draft.state.cursor
    },
    addPart,
    contextItem(id: string) {
      return draft.state.context.items.find((item) => item.key === id)
    },
    comments() {
      return draft.state.context.items.filter((item) => !!item.comment?.trim())
    },
    attachments(): PromptInputV2Attachment[] {
      return draft.state.prompt.filter((part): part is PromptInputV2Attachment => part.type === "image")
    },
    toggleContext(id: string) {
      dispatch({ type: "context.active", id })
      input.openContext?.(id)
    },
    removeContext(id: string) {
      const item = draft.state.context.items.find((entry) => entry.key === id)
      if (item) input.onContextRemove?.(item)
      draft.removeContext(id)
      if (state.activeContextID === id) dispatch({ type: "context.active", id })
    },
    openAttachment(attachment: PromptInputV2Attachment) {
      input.openAttachment?.(attachment)
    },
    removeAttachment(id: string) {
      draft.removeAttachment(id)
    },
    canSubmit() {
      const persisted = draft.state
      if (persisted.prompt.some((part) => part.type === "image")) return true
      if (persisted.context.items.some((item) => !!item.comment?.trim())) return true
      return persisted.prompt.some((part) => "content" in part && !!part.content.trim())
    },
    setEditor(element: HTMLElement) {
      editor = element
      input.onEditor?.(element)
    },
    restoreFocus,
    onInput(value: string, prompt?: PromptInputV2PersistedState["prompt"], cursor?: number) {
      if (prompt) draft.setPrompt(prompt, cursor)
      dispatch({ type: "input.changed", value, persist: !prompt })
    },
    onCursor(cursor: number) {
      draft.setCursor(cursor)
    },
    openCommands() {
      dispatch({ type: "commands.open" })
    },
    openContext() {
      dispatch({ type: "context.open" })
    },
    openShell() {
      dispatch({ type: "mode.shell" })
    },
    closeShell() {
      dispatch({ type: "mode.normal" })
    },
    submit() {
      input.view.submit.onSubmit()
      dispatch({ type: "popover.close" })
    },
    stop() {
      input.view.submit.onStop()
    },
    addHistory(prompt: PromptInputV2PersistedState["prompt"], mode: "normal" | "shell") {
      input.history?.add(prompt, mode)
      setState({ historyIndex: -1, savedHistory: undefined })
    },
    resetHistory() {
      setState({ historyIndex: -1, savedHistory: undefined })
    },
    onPaste(event: ClipboardEvent) {
      const clipboard = event.clipboardData
      if (
        attachments &&
        (Array.from(clipboard?.items ?? []).some((item) => item.kind === "file") || !clipboard?.getData("text/plain"))
      ) {
        void attachments.handlePaste(event)
        return
      }
      input.view.onPaste?.(event)
      if (event.defaultPrevented) return
      const text = clipboard?.getData("text/plain")
      if (!text) return
      event.preventDefault()
      // Insert the clipboard's literal text; execCommand may fold CR or create line-box DOM.
      const target = event.currentTarget
      if (target instanceof HTMLElement && insertPromptEditorText(target, text, "insertFromPaste")) {
        draft.setCursor(promptEditorCursor(target))
      }
    },
    onDragEnter(event: DragEvent) {
      event.preventDefault()
      dispatch({ type: "drag.enter" })
    },
    onDragOver(event: DragEvent) {
      event.preventDefault()
    },
    onDragLeave() {
      dispatch({ type: "drag.leave" })
    },
    onDrop(event: DragEvent) {
      event.preventDefault()
      dispatch({ type: "drag.leave" })
      if (attachments) {
        event.stopPropagation()
        void attachments.handleDrop(event)
        return
      }
      input.view.onDrop?.(event)
    },
    attach,
    setFileInput(element: HTMLInputElement) {
      fileInput = element
    },
    addAttachments(files: File[]) {
      if (attachments) void attachments.addAttachments(files)
    },
    setQuery(value: string) {
      dispatch({ type: "popover.query", value })
    },
  }
}

export type PromptInputV2Interaction = ReturnType<typeof createPromptInputV2Controller>

function canNavigateHistory(direction: "up" | "down", text: string, cursor: number, inHistory: boolean) {
  const position = Math.max(0, Math.min(cursor, text.length))
  if (inHistory) return position === 0 || position === text.length
  if (direction === "up") return position === 0 && text.length === 0
  return position === text.length
}

function clonePrompt(prompt: PromptInputV2PersistedState["prompt"]): PromptInputV2PersistedState["prompt"] {
  return prompt.map((part) =>
    part.type === "file" ? { ...part, selection: part.selection ? { ...part.selection } : undefined } : { ...part },
  )
}

function promptLength(prompt: PromptInputV2PersistedState["prompt"]) {
  return prompt.reduce((length, part) => length + ("content" in part ? part.content.length : 0), 0)
}

function editorCursor(editor: HTMLElement) {
  return promptEditorCursor(editor)
}

function setEditorCursor(editor: HTMLElement | undefined, cursor: number) {
  if (!editor) return
  const range = document.createRange()
  promptEditorRangeEdge(editor, range, "start", cursor)
  range.collapse(true)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

export function insertPromptEditorText(editor: HTMLElement, text: string, inputType: string) {
  const selection = window.getSelection()
  if (!selection?.rangeCount) return false
  const range = selection.getRangeAt(0)
  if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) return false
  const doc = editor.ownerDocument
  if (typeof doc.execCommand !== "function") throw new Error(`PROMPT_EDITOR_NATIVE_EDITING_UNAVAILABLE:${inputType}`)
  const prepared = remapPromptEditorRange(editor, range)
  const terminal = prepared.end === readPromptEditor(editor).length
  selection.removeAllRanges()
  selection.addRange(range)
  // Native editing owns the undo transaction and input event. Never substitute synthetic input/undo.
  if (!doc.execCommand("insertHTML", false, promptEditorInsertionHTML(text, terminal))) {
    throw new Error(`PROMPT_EDITOR_NATIVE_EDITING_FAILED:${inputType}`)
  }
  const cursor = prepared.start + text.length
  if (terminal && text.endsWith("\n")) {
    restorePromptEditorCaret(editor, cursor)
    return true
  }
  setEditorCursor(editor, cursor)
  return true
}

export function restorePromptEditorCaret(editor: HTMLElement, offset: number) {
  const decoded = readPromptEditor(editor)
  const caret = Array.from(editor.querySelectorAll<HTMLElement>("[data-prompt-caret]")).reverse().find((node) =>
    node.textContent === "\u200B" && decoded.positions.get(node)?.end === offset,
  )
  if (!caret?.firstChild || caret.firstChild.nodeType !== Node.TEXT_NODE) throw new Error("PROMPT_EDITOR_CARET_UNMAPPABLE")
  const range = editor.ownerDocument.createRange()
  range.setStart(caret.firstChild, 1)
  range.collapse(true)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

export function promptEditorInsertionHTML(text: string, terminal: boolean) {
  // HTML cannot represent NUL faithfully; reject this known unsupported input instead of normalizing it.
  if (text.includes("\u0000")) throw new Error("PROMPT_EDITOR_UNSUPPORTED_NUL")
  // Match the legacy renderer's 200-BR bound; references preserve literal CR and large multiline text.
  const large = text.split("\n").length > 201
  const escapes: Record<string, string> = {
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "\r": "&#13;",
    "\n": large ? "&#10;" : '<br data-prompt-break="">',
  }
  const escaped = text.replace(/[&<>"\r\n]/g, (char, offset: number) =>
    char === "\n" && offset === text.length - 1 ? '<br data-prompt-break="">' : escapes[char]!,
  )
  return escaped + (terminal && text.endsWith("\n")
    ? '<span data-prompt-caret="" contenteditable="true">&#8203;</span>'
    : "")
}

// Shared by both composers: DOM line boxes are not additional characters after a BR.
export function readPromptEditor(root: Node) {
  const segments: { node: Node; content: string }[] = []
  const positions = new Map<Node, { start: number; end: number; skip: number; offsets?: number[] }>()
  let length = 0
  const append = (node: Node, content: string) => {
    if (content) segments.push({ node, content })
    length += content.length
  }
  const block = (node: Node) => node instanceof HTMLElement && (node.tagName === "DIV" || node.tagName === "P")
  const markedBreak = (node: Node | undefined) => node instanceof HTMLElement && node.tagName === "BR" && node.hasAttribute("data-prompt-break")
  const empty = (node: Node) =>
    (node.nodeType === Node.TEXT_NODE && !node.textContent) ||
    (node instanceof HTMLElement && node.hasAttribute("data-prompt-caret") && node.textContent === "\u200B")
  const filler = (node: Node) => {
    if (!(node instanceof HTMLElement) || node.tagName !== "BR" || markedBreak(node)) return false
    let current: Node = node
    while (current.parentNode) {
      const parent = current.parentNode
      const siblings = Array.from(parent.childNodes)
      if (!siblings.slice(siblings.findIndex((sibling) => sibling === current) + 1).every(empty)) return false
      if (block(parent) || (parent === root && parent instanceof HTMLElement && parent.isContentEditable)) return true
      if (parent === root) return false
      current = parent
    }
    return false
  }
  const visit = (node: Node) => {
    const start = length
    const text = node.textContent ?? ""
    const skip =
      node.nodeType === Node.TEXT_NODE &&
      node.parentElement?.hasAttribute("data-prompt-caret") &&
      node === node.parentElement.firstChild &&
      text.startsWith("\u200B")
        ? 1
        : 0
    if (node.nodeType === Node.TEXT_NODE) append(node, text.slice(skip))
    if (
      node instanceof HTMLElement &&
      (node.dataset.type === "file" || node.dataset.type === "agent" || node.dataset.mention)
    ) {
      append(node, text)
      positions.set(node, { start, end: length, skip: 0, offsets: [start, length] })
      return
    }
    if (node instanceof HTMLElement && node.tagName === "BR") append(node, "\n")
    if (node.nodeType !== Node.TEXT_NODE && !(node instanceof HTMLElement && node.tagName === "BR")) {
      const children = Array.from(node.childNodes)
      const offsets = [length]
      let previous: Node | undefined
      let emptyBlock = false
      children.forEach((child, index) => {
        offsets[index] = length
        // Chromium's terminal, unmarked BR holds the caret; an empty DIV is already a line box.
        const isFiller = filler(child)
        const startsBreak =
          (child instanceof HTMLElement && child.tagName === "BR") ||
          (child.nodeType === Node.TEXT_NODE && (child.textContent ?? "").startsWith("\n"))
        if (
          !isFiller &&
          !empty(child) &&
          !startsBreak &&
          previous &&
          (block(previous) || block(child)) &&
          // An owned inserted LF and the following paragraph separator are distinct logical breaks.
          (emptyBlock || markedBreak(segments[segments.length - 1]?.node) || !segments[segments.length - 1]?.content.endsWith("\n"))
        ) {
          append(node, "\n")
        }
        const before = length
        if (isFiller) positions.set(child, { start: length, end: length, skip: 0 })
        if (!isFiller) visit(child)
        offsets[index + 1] = length
        if (block(child) || length > before) {
          previous = child
          emptyBlock = block(child) && length === before
        }
      })
      positions.set(node, { start, end: length, skip: 0, offsets })
      return
    }
    positions.set(node, { start, end: length, skip })
  }
  visit(root)
  return { segments, positions, length }
}

export function promptEditorCursor(editor: HTMLElement) {
  const selection = window.getSelection()
  if (!selection?.rangeCount || !editor.contains(selection.anchorNode)) return 0
  const range = selection.getRangeAt(0)
  return promptEditorPoint(editor, range.startContainer, range.startOffset)
}

export function promptEditorPoint(editor: HTMLElement, node: Node, offset: number) {
  const decoded = readPromptEditor(editor)
  const mention = (node instanceof HTMLElement ? node : node.parentElement)?.closest(
    '[data-mention], [data-type="file"], [data-type="agent"]',
  )
  if (mention && editor.contains(mention)) {
    const position = decoded.positions.get(mention)
    if (!position) throw new Error("PROMPT_EDITOR_POINT_UNMAPPABLE")
    const prefix = document.createRange()
    prefix.selectNodeContents(mention)
    prefix.setEnd(node, offset)
    return atomicPromptOffset(decoded, position.start + prefix.toString().length)
  }
  const position = decoded.positions.get(node)
  if (!position) throw new Error("PROMPT_EDITOR_POINT_UNMAPPABLE")
  return atomicPromptOffset(decoded, position.offsets
    ? position.offsets[offset] ?? position.end
    : position.start + Math.max(0, Math.min(position.end - position.start, offset - position.skip)))
}

// Nearest atomic boundary, with ties going right, for reads, ranges and every insertion.
function atomicPromptOffset(decoded: ReturnType<typeof readPromptEditor>, offset: number) {
  const target = Math.max(0, Math.min(decoded.length, offset))
  const mention = decoded.segments.find((segment) => {
    if (!isPromptMention(segment.node)) return false
    const position = decoded.positions.get(segment.node)!
    return target > position.start && target < position.end
  })
  if (!mention) return target
  const position = decoded.positions.get(mention.node)!
  return target - position.start < position.end - target ? position.start : position.end
}

function isPromptMention(node: Node): node is HTMLElement {
  return node instanceof HTMLElement && !!(node.dataset.mention || node.dataset.type === "file" || node.dataset.type === "agent")
}

function isPurePromptCaret(node: Node): node is HTMLElement {
  return node instanceof HTMLElement && node.hasAttribute("data-prompt-caret") && node.textContent === "\u200B"
}

export function remapPromptEditorRange(editor: HTMLElement, range: Range) {
  const start = promptEditorPoint(editor, range.startContainer, range.startOffset)
  const end = promptEditorPoint(editor, range.endContainer, range.endOffset)
  promptEditorRangeEdge(editor, range, "start", start)
  promptEditorRangeEdge(editor, range, "end", end)
  const decoded = readPromptEditor(editor)
  // Consume old zero-width caret markers in the native replacement transaction, never by manual DOM edits.
  Array.from(editor.querySelectorAll<HTMLElement>("[data-prompt-caret]")).forEach((node) => {
    if (isPurePromptCaret(node) && decoded.positions.get(node)?.end === end) range.setEndAfter(node)
  })
  return { range, start, end }
}

export function materializePromptEditor(editor: HTMLElement, range: Range) {
  const start = promptEditorPoint(editor, range.startContainer, range.startOffset)
  const end = promptEditorPoint(editor, range.endContainer, range.endOffset)
  if (!Array.from(editor.childNodes).every((node) =>
    node.nodeType === Node.TEXT_NODE || isPromptMention(node) ||
    (node instanceof HTMLElement && ((node.tagName === "BR" && node.hasAttribute("data-prompt-break")) ||
      (node.hasAttribute("data-prompt-caret") && node.textContent === "\u200B"))),
  )) {
    // Structural separators become real text. Move original pill nodes so their WeakMap metadata survives.
    editor.replaceChildren(...readPromptEditor(editor).segments.map((segment) =>
      isPromptMention(segment.node) ? segment.node : document.createTextNode(segment.content),
    ))
  }
  promptEditorRangeEdge(editor, range, "start", start)
  promptEditorRangeEdge(editor, range, "end", end)
  return { range, start, end }
}

export function promptEditorRangeEdge(editor: HTMLElement, range: Range, edge: "start" | "end", offset: number) {
  const decoded = readPromptEditor(editor)
  const target = atomicPromptOffset(decoded, offset)
  const set = (node: Node, index: number) => {
    if (edge === "start") range.setStart(node, index)
    if (edge === "end") range.setEnd(node, index)
  }
  const caret = Array.from(decoded.positions).find(([node, position]) => isPurePromptCaret(node) && position.start === target)
  if (caret) {
    if (edge === "start") range.setStartBefore(caret[0])
    if (edge === "end") range.setEndBefore(caret[0])
    return
  }
  for (const [node, position] of decoded.positions) {
    if (node.nodeType !== Node.TEXT_NODE || target < position.start || target > position.end) continue
    if (node.parentElement?.hasAttribute("data-prompt-caret") && node.parentElement.textContent === "\u200B") continue
    set(node, target - position.start + position.skip)
    return
  }
  for (const [node, position] of decoded.positions) {
    if (isPurePromptCaret(node)) continue
    if (
      node instanceof HTMLElement &&
      (node.dataset.type === "file" || node.dataset.type === "agent" || node.dataset.mention)
    ) continue
    const index = position.offsets?.indexOf(target) ?? -1
    if (index < 0) continue
    set(node, index)
    return
  }
  throw new Error("PROMPT_EDITOR_OFFSET_UNMAPPABLE")
}
