import { WORKFLOW_ENTRIES } from "./catalog"
import {
  chain,
  checkID,
  type Flow,
  type FlowNode,
  insertNode,
  nodeOf,
  readChecklist,
  START,
  uniqueID,
  uniqueName,
  updateNode,
  writeChecklist,
} from "./graph"
import { shiftRow, STEP_GAP } from "./insert"

// Copy, paste and duplicate for workflow steps. A copy is text on the clipboard, so it also pastes into another
// workflow; a paste makes new steps with their own ids, names and check ids, wired in after an anchor.

const KIND = "orchestra.relay.steps"
const LIMIT = 50
const KNOWN = new Set(WORKFLOW_ENTRIES.map((entry) => entry.type))

type Copied = { id: string; name: string; type: string; typeVersion?: number; parameters: Record<string, unknown> }

export function copySteps(flow: Flow, ids: string[]) {
  const steps = picked(flow, ids)
  if (!steps.length) return
  return JSON.stringify({
    kind: KIND,
    steps: steps.map((node) => ({
      id: node.id,
      name: node.name,
      type: node.type,
      ...(node.typeVersion === undefined ? {} : { typeVersion: node.typeVersion }),
      parameters: node.parameters,
    })),
  })
}

// Puts the copied steps one after another behind `anchor`. They join the anchor's phase when they land between two of
// its steps, like a step added from the panel. Nothing happens for text that is not copied steps.
export function pasteSteps(flow: Flow, text: string, anchor: { id: string; port: number } | undefined) {
  const steps = parse(text)
  if (flow.kind !== "workflow" || !steps || !anchor || !nodeOf(flow, anchor.id)) return
  return steps.reduce(
    (done, step) => {
      const before = nodeOf(done.flow, done.anchor.id)
      if (!before) return done
      const node: FlowNode = {
        id: uniqueID(done.flow, step.id),
        name: uniqueName(done.flow, step.name),
        type: step.type,
        x: before.x + STEP_GAP,
        y: before.y,
        parameters: step.parameters,
        ...(step.typeVersion === undefined ? {} : { typeVersion: step.typeVersion }),
      }
      const controls = readChecklist(node).controls
      // The checks come back one by one, each with an id that is free in the whole workflow.
      const inserted = insertNode(
        shiftRow(done.flow, before),
        controls.length ? { ...node, parameters: { ...node.parameters, checklist: "[]" } } : node,
        done.anchor,
      )
      const renumbered = controls.reduce((current, control) => {
        const target = nodeOf(current, node.id)
        if (!target) return current
        const added = { ...control, id: checkID(current, node.id) }
        const checklist = writeChecklist([...readChecklist(target).controls, added])
        return updateNode(current, node.id, { parameters: { ...target.parameters, checklist } })
      }, inserted)
      return { flow: renumbered, ids: [...done.ids, node.id], anchor: { id: node.id, port: 0 } }
    },
    { flow, ids: [] as string[], anchor },
  )
}

// A copy of the steps, right behind the last of them.
export function duplicateSteps(flow: Flow, ids: string[]) {
  const last = picked(flow, ids).at(-1)
  const text = copySteps(flow, ids)
  return last && text ? pasteSteps(flow, text, { id: last.id, port: 0 }) : undefined
}

// Copy and paste through the browser's clipboard events, so the keyboard shortcuts and the Edit menu both work and
// nothing needs permission. `active` says whether the canvas, and not a field or a dialog, is what the event is for;
// `paste` returns whether the text was steps it could place.
export function watchClipboard(handlers: {
  active: (event: Event) => boolean
  copy: () => string | undefined
  paste: (text: string) => boolean
}) {
  const copyOut = (event: ClipboardEvent) => {
    const text = handlers.active(event) && !window.getSelection()?.toString() ? handlers.copy() : undefined
    if (!text) return
    event.clipboardData?.setData("text/plain", text)
    event.preventDefault()
  }
  const pasteIn = (event: ClipboardEvent) => {
    const text = handlers.active(event) ? event.clipboardData?.getData("text/plain") : undefined
    if (text && handlers.paste(text)) event.preventDefault()
  }
  document.addEventListener("copy", copyOut)
  document.addEventListener("paste", pasteIn)
  return () => {
    document.removeEventListener("copy", copyOut)
    document.removeEventListener("paste", pasteIn)
  }
}

// The steps to copy, in the order they run; the ones outside the sequence follow. Start stays where it is.
function picked(flow: Flow, ids: string[]) {
  if (flow.kind !== "workflow") return []
  const order = chain(flow).map((node) => node.id)
  const rank = (id: string) => (order.includes(id) ? order.indexOf(id) : order.length)
  return flow.nodes
    .filter((node) => ids.includes(node.id) && node.type !== START && KNOWN.has(node.type))
    .toSorted((a, b) => rank(a.id) - rank(b.id))
}

function parse(text: string): Copied[] | undefined {
  const value: unknown = (() => {
    try {
      return JSON.parse(text)
    } catch {
      return undefined
    }
  })()
  if (!record(value) || value.kind !== KIND || !Array.isArray(value.steps) || value.steps.length > LIMIT) return
  const steps = value.steps.flatMap((item): Copied[] =>
    record(item) &&
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    item.name.trim() &&
    typeof item.type === "string" &&
    KNOWN.has(item.type) &&
    record(item.parameters)
      ? [
          {
            id: item.id,
            name: item.name,
            type: item.type,
            parameters: item.parameters,
            ...(typeof item.typeVersion === "number" ? { typeVersion: item.typeVersion } : {}),
          },
        ]
      : [],
  )
  return steps.length && steps.length === value.steps.length ? steps : undefined
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
