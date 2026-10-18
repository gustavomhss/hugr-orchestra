import type { QueryClient } from "@tanstack/solid-query"
import { createStore, unwrap } from "solid-js/store"
import { createRoot } from "solid-js"
import { RelayError, type RelayDocument, type RelayKind } from "./client"
import { rememberDocument } from "./cache"
import { documentFields, flowFromDocument, type Flow } from "./graph"
import type { SaveState } from "./editor-head"
import type { RelaySource } from "./source"

// Keep only active editors and unsaved drafts. A full profile refuses another editor rather than evicting work.
export const DRAFT_LIMIT = 20
// Undo steps kept per draft. Edits closer together than BURST_MS share one step: a text field reports every keystroke.
export const HISTORY_LIMIT = 50
export const BURST_MS = 500
const servers = new WeakMap<QueryClient, Map<string, Map<string, Draft>>>()
type Draft = ReturnType<typeof makeDraft>
type Source = Pick<RelaySource, "client" | "queryClient" | "key" | "invalidate">

export function profileDrafts(source: Source) {
  return [...(servers.get(source.queryClient())?.get(JSON.stringify(source.key("documents")))?.values() ?? [])]
}

// Every delete entrypoint goes through the same lifetime boundary, after the server confirms deletion.
export async function deleteDocument(source: Source, id: string) {
  await source.client.remove(id).finally(() => source.invalidate("installs"))
  profileDrafts(source).find((draft) => draft.state.base.id === id)?.discard()
  await source.queryClient().cancelQueries({ queryKey: source.key("documents"), exact: true }, { revert: false })
  source.queryClient().setQueryData(source.key("documents"), (list: RelayDocument[] | undefined) =>
    list?.filter((document) => document.id !== id),
  )
}

export function openDraft(source: Source, initial: RelayDocument, kind: RelayKind) {
  const client = source.queryClient()
  const key = JSON.stringify(source.key("documents"))
  const profiles = servers.get(client) ?? new Map<string, Map<string, Draft>>()
  const drafts = profiles.get(key) ?? new Map<string, Draft>()
  const existing = drafts.get(initial.id)
  if (existing) {
    existing.acquire()
    return existing
  }
  if (drafts.size >= DRAFT_LIMIT) return
  servers.set(client, profiles)
  profiles.set(key, drafts)
  const draft = makeDraft(source, initial, kind, () => {
    if (drafts.get(initial.id) !== draft) return
    drafts.delete(initial.id)
    if (!drafts.size) profiles.delete(key)
  })
  drafts.set(initial.id, draft)
  draft.acquire()
  return draft
}

function makeDraft(source: Source, initial: RelayDocument, kind: RelayKind, remove: () => void) {
  // Draft reactivity must outlive the editor's Solid owner as well as its DOM.
  const [state, setState] = createRoot(() => createStore({
    base: initial,
    flow: flowFromDocument(initial, kind),
    name: initial.name,
    save: { state: "saved", dirty: false, error: "" } as SaveState,
    // Step counts only, so the editor can enable Undo and Redo; the snapshots stay out of the store.
    history: { undo: 0, redo: 0 },
  }), null)
  const past: Flow[] = []
  const future: Flow[] = []
  let lastEdit = 0
  let owners = 0
  let discarded = false
  let listening = false
  let revision = 0
  let reloading = false
  let writing: Promise<void> | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const beforeUnload = (event: BeforeUnloadEvent) => {
    event.preventDefault()
    event.returnValue = ""
  }
  const listen = () => {
    if (listening || typeof window === "undefined") return
    window.addEventListener("beforeunload", beforeUnload)
    listening = true
  }
  const unlisten = () => {
    if (!listening) return
    window.removeEventListener("beforeunload", beforeUnload)
    listening = false
  }
  // A failed or conflicted draft nobody is editing stays in memory for the library banner, but must not block leaving the page.
  const abandoned = () => {
    if (!owners && (state.save.state === "error" || state.save.state === "conflict")) unlisten()
  }
  const clean = () => {
    if (state.save.dirty || state.save.state !== "saved") return
    unlisten()
    if (!owners) remove()
  }
  const drain = async (): Promise<void> => {
    clearTimeout(timer)
    if (discarded || reloading || !state.save.dirty || state.save.state === "saving" || state.save.state === "conflict") return
    setState("save", { state: "saving", dirty: false, error: "" })
    try {
      const result = await source.client.save(state.base, { name: state.name, ...documentFields(state.flow) }).then(
        (document) => ({ document }),
        (error: unknown) => ({ error }),
      )
      if (discarded) return
      if ("error" in result) {
        setState("save", {
          state: result.error instanceof RelayError && result.error.status === 409 ? "conflict" : "error",
          dirty: true,
          error: result.error instanceof Error ? result.error.message : String(result.error),
        })
        abandoned()
        return
      }
      const latest = await rememberDocument(source.queryClient(), source.key("documents"), result.document, () => !discarded)
      if (discarded || !latest) return
      if (!state.save.dirty) return replace(latest, latest.versionId === result.document.versionId)
      setState("base", result.document)
      if (latest.versionId !== result.document.versionId) {
        // Edits made during this request were based on its version, not the newer remote graph.
        setState("save", { state: "conflict", dirty: true, error: "" })
        abandoned()
        return
      }
      setState("save", "state", "saved")
      if (state.save.dirty) return drain()
      clean()
    } finally {
      // Transport completion is earlier than accepting/rejecting the ACK and updating shared state.
      window.dispatchEvent(new CustomEvent("relay-draft-save-settled", { detail: { documentID: initial.id } }))
    }
  }
  const flush = (): Promise<void> => {
    if (writing) return writing
    writing = drain().finally(() => { writing = undefined })
    return writing
  }
  const changed = () => {
    revision++
    listen()
    setState("save", { dirty: true, state: state.save.state === "error" ? "saved" : state.save.state })
    clearTimeout(timer)
    timer = setTimeout(() => void flush(), 600)
  }
  // `ours` marks the echo of this draft's own save. Any other replacement is a graph someone else wrote, and undoing across it would revert them.
  const replace = (document: RelayDocument, ours = false) => {
    setState({ base: document, flow: flowFromDocument(document, kind), name: document.name })
    setState("save", { state: "saved", dirty: false, error: "" })
    if (!ours) {
      past.length = 0
      future.length = 0
      lastEdit = 0
      setState("history", { undo: 0, redo: 0 })
    }
    clean()
  }
  // The store merges a new flow into its current object in place, so a snapshot has to be a copy. The arrays inside are replaced, never mutated.
  const remember = (stack: Flow[]) => {
    stack.push({ ...unwrap(state.flow) })
    if (stack.length > HISTORY_LIMIT) stack.shift()
  }
  const travel = (from: Flow[], to: Flow[]) => {
    const target = from.pop()
    if (!target) return
    remember(to)
    lastEdit = 0
    setState("flow", target)
    setState("history", { undo: past.length, redo: future.length })
    changed()
  }
  return {
    state,
    acquire() {
      owners++
      if (state.save.dirty) listen()
    },
    release() {
      owners--
      clearTimeout(timer)
      // A failed write waits for explicit retry on return, not another unmount attempt.
      if (state.save.state !== "error") void flush()
      abandoned()
      clean()
    },
    edit(flow: Flow) {
      const now = Date.now()
      if (now - lastEdit > BURST_MS) remember(past)
      lastEdit = now
      future.length = 0
      setState("flow", flow)
      setState("history", { undo: past.length, redo: 0 })
      changed()
    },
    undo: () => travel(past, future),
    redo: () => travel(future, past),
    canUndo: () => state.history.undo > 0,
    canRedo: () => state.history.redo > 0,
    rename(name: string) {
      setState("name", name)
      changed()
    },
    sync(document: RelayDocument) {
      if (state.save.dirty || state.save.state !== "saved") return
      if (document.versionCounter < state.base.versionCounter) return
      if (document.versionId !== state.base.versionId) return replace(document)
      setState("base", document)
    },
    async reload() {
      if (reloading || discarded) return
      reloading = true
      clearTimeout(timer)
      const started = revision
      const result = await source.client.document(initial.id).then(
        (document) => ({ document }), (error: unknown) => ({ error }),
      )
      if (discarded) return
      if ("document" in result) {
        const latest = await rememberDocument(source.queryClient(), source.key("documents"), result.document, () => !discarded)
        reloading = false
        if (discarded || !latest) return
        if (revision !== started) {
          setState("save", { state: "conflict", dirty: true, error: "" })
          return
        }
        replace(latest)
        return
      }
      reloading = false
      setState("save", "error", result.error instanceof Error ? result.error.message : String(result.error))
    },
    flush,
    active: () => !discarded,
    discard() {
      discarded = true
      clearTimeout(timer)
      unlisten()
      setState("save", { state: "saved", dirty: false, error: "" })
      remove()
    },
  }
}
