import type { QueryClient } from "@tanstack/solid-query"
import { createStore } from "solid-js/store"
import { createRoot } from "solid-js"
import { RelayError, type RelayDocument, type RelayKind } from "./client"
import { rememberDocument } from "./cache"
import { documentFields, flowFromDocument, type Flow } from "./graph"
import type { SaveState } from "./editor-head"
import type { RelaySource } from "./source"

// Keep only active editors and unsaved drafts. A full profile refuses another editor rather than evicting work.
export const DRAFT_LIMIT = 20
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
  }), null)
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
  const unlisten = () => {
    if (!listening) return
    window.removeEventListener("beforeunload", beforeUnload)
    listening = false
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
      return
    }
    const latest = await rememberDocument(source.queryClient(), source.key("documents"), result.document, () => !discarded)
    if (discarded || !latest) return
    if (!state.save.dirty) return replace(latest)
    setState("base", result.document)
    if (latest.versionId !== result.document.versionId) {
      // Edits made during this request were based on its version, not the newer remote graph.
      setState("save", { state: "conflict", dirty: true, error: "" })
      return
    }
    setState("save", "state", "saved")
    if (state.save.dirty) return drain()
    clean()
  }
  const flush = (): Promise<void> => {
    if (writing) return writing
    writing = drain().finally(() => { writing = undefined })
    return writing
  }
  const changed = () => {
    revision++
    if (!listening && typeof window !== "undefined") {
      window.addEventListener("beforeunload", beforeUnload)
      listening = true
    }
    setState("save", { dirty: true, state: state.save.state === "error" ? "saved" : state.save.state })
    clearTimeout(timer)
    timer = setTimeout(() => void flush(), 600)
  }
  const replace = (document: RelayDocument) => {
    setState({ base: document, flow: flowFromDocument(document, kind), name: document.name })
    setState("save", { state: "saved", dirty: false, error: "" })
    clean()
  }
  return {
    state,
    acquire() {
      owners++
    },
    release() {
      owners--
      clearTimeout(timer)
      // A failed write waits for explicit retry on return, not another unmount attempt.
      if (state.save.state !== "error") void flush()
      clean()
    },
    edit(flow: Flow) {
      setState("flow", flow)
      changed()
    },
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
