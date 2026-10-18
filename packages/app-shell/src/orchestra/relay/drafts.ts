import type { QueryClient } from "@tanstack/solid-query"
import { createStore, unwrap } from "solid-js/store"
import { createComponent, createContext, createRoot, type JSX, useContext } from "solid-js"
import { usePlatform } from "@/context/platform"
import { record, writeFailure, type RelayDocument, type RelayKind } from "./client"
import { rememberDocument } from "./cache"
import { documentFields, flowFromDocument, type Flow } from "./graph"
import { copyDocument } from "./presets"
import type { SaveState } from "./editor-head"
import type { RelaySource } from "./source"

// Keep only active editors and unsaved drafts. A full profile refuses another editor rather than evicting work.
export const DRAFT_LIMIT = 20
// Undo steps kept per draft. Edits within BURST_MS of a burst's first edit share one step: a text field reports every
// keystroke, but a drag, a delete and an edit made in quick succession must not merge into one.
export const HISTORY_LIMIT = 50
export const BURST_MS = 500
// Drafts the server has not accepted outlive the page in localStorage, per server profile and document, until they are
// saved or discarded. The read is synchronous, so a draft a closed window or an earlier run left behind is back before
// an editor could open the server copy instead. The keys stay outside the `orchestra.` prefix that a full storage
// evicts first.
const LOCAL_PREFIX = "orchestra-relay-draft:"
const servers = new WeakMap<QueryClient, Map<string, Map<string, Draft>>>()
// Every draft in this page, for the unload, reconnect and focus handlers.
const all = new Set<Draft>()
const DraftContext = createContext<{ draft: Draft; go: (path: string, replace?: boolean) => void }>()
let watching = false
let unloading = false
type Draft = ReturnType<typeof makeDraft>
type Source = Pick<RelaySource, "client" | "queryClient" | "key" | "invalidate">
type Step = { flow: Flow; name: string; description: string }
type Retained = {
  key: string
  kind: RelayKind
  base: RelayDocument
  name: string
  // Entries kept before the description was editable have none; they restore the saved one.
  description?: string
  fields: ReturnType<typeof documentFields>
  save: SaveState
}

export function profileDrafts(source: Source) {
  return [...profile(source).drafts.values()]
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
  const current = profile(source)
  const existing = current.drafts.get(initial.id)
  if (existing) {
    existing.acquire()
    return existing
  }
  if (current.drafts.size >= DRAFT_LIMIT) return
  const draft = current.add(initial, kind)
  draft.acquire()
  return draft
}

/** The editor's draft for its save status, which resolves conflicts in place. */
export const useDraftScope = () => useContext(DraftContext)

// The editor wraps its page in this scope. The first one also asks the platform to wait for every draft before a
// desktop window closes or the app quits.
export function DraftScope(props: {
  draft: Draft
  go: (path: string, replace?: boolean) => void
  children: JSX.Element
}) {
  const platform = usePlatform()
  if (!unloading && platform.onBeforeUnload) {
    unloading = true
    platform.onBeforeUnload(settleAll)
  }
  return createComponent(DraftContext.Provider, {
    value: { draft: props.draft, go: props.go },
    get children() {
      return props.children
    },
  })
}

// One server profile's drafts. The first look in this page brings back the drafts an earlier page left unsaved.
function profile(source: Source) {
  const client = source.queryClient()
  const key = JSON.stringify(source.key("documents"))
  const profiles = servers.get(client) ?? new Map<string, Map<string, Draft>>()
  servers.set(client, profiles)
  const known = profiles.get(key)
  const drafts = known ?? new Map<string, Draft>()
  const add = (initial: RelayDocument, kind: RelayKind, restored?: Retained) => {
    const draft = makeDraft(source, key, initial, kind, () => {
      if (drafts.get(initial.id) !== draft) return
      drafts.delete(initial.id)
      all.delete(draft)
      if (!drafts.size && profiles.get(key) === drafts) profiles.delete(key)
    }, restored)
    drafts.set(initial.id, draft)
    all.add(draft)
    watch()
    return draft
  }
  if (!known) {
    profiles.set(key, drafts)
    readLocal(key)
      .slice(0, DRAFT_LIMIT)
      .forEach((item) => add(item.base, item.kind, item))
  }
  return { drafts, add }
}

function makeDraft(
  source: Source,
  key: string,
  initial: RelayDocument,
  kind: RelayKind,
  remove: () => void,
  restored?: Retained,
) {
  // Draft reactivity must outlive the editor's Solid owner as well as its DOM.
  const [state, setState] = createRoot(() => createStore({
    base: initial,
    flow: flowFromDocument(restored?.fields ?? initial, kind),
    name: restored?.name ?? initial.name,
    description: restored?.description ?? initial.description,
    save: restored ? reopened(restored.save) : ({ state: "saved", dirty: false, error: "" } as SaveState),
    // Step counts only, so the editor can enable Undo and Redo; the snapshots stay out of the store.
    history: { undo: 0, redo: 0 },
  }), null)
  const past: Step[] = []
  const future: Step[] = []
  let burst = 0
  let owners = 0
  let discarded = false
  let revision = 0
  let reloading = false
  let writing: Promise<void> | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  // A save state replaces the reason of the one before it.
  const status = (next: SaveState) => setState("save", { reason: undefined, ...next })
  const clean = () => {
    if (state.save.dirty || state.save.state !== "saved") return
    dropLocal(key, initial.id)
    if (!owners) remove()
  }
  // A refusal or a lost connection keeps the local edits and says why.
  const failed = (error: unknown) => {
    const cause = writeFailure(error)
    status({
      state: cause === "conflict" ? "conflict" : "error",
      dirty: true,
      error: cause === "conflict" ? "" : message(error),
      reason: cause === "offline" || cause === "missing" ? cause : undefined,
    })
  }
  const drain = async (force: boolean): Promise<void> => {
    clearTimeout(timer)
    if (discarded || reloading || !state.save.dirty || state.save.state === "saving") return
    // A conflict waits for the user's choice, and a document deleted elsewhere cannot take a write at all.
    if ((state.save.state === "conflict" && !force) || state.save.reason === "missing") return
    status({ state: "saving", dirty: false, error: "" })
    try {
      const result = await source.client
        .save(
          state.base,
          { name: state.name, description: state.description, ...documentFields(state.flow) },
          { force },
        )
        .then(
          (document) => ({ document }),
          (error: unknown) => ({ error }),
        )
      if (discarded) return
      if ("error" in result) return failed(result.error)
      const latest = await rememberDocument(source.queryClient(), source.key("documents"), result.document, () => !discarded)
      if (discarded || !latest) return
      if (!state.save.dirty) return replace(latest, latest.versionId === result.document.versionId)
      setState("base", result.document)
      if (latest.versionId !== result.document.versionId) {
        // Edits made during this request were based on its version, not the newer remote graph.
        status({ state: "conflict", dirty: true, error: "" })
        return
      }
      setState("save", "state", "saved")
      if (state.save.dirty) return drain(false)
      clean()
    } finally {
      // Transport completion is earlier than accepting/rejecting the ACK and updating shared state.
      window.dispatchEvent(new CustomEvent("relay-draft-save-settled", { detail: { documentID: initial.id } }))
    }
  }
  const write = (force: boolean): Promise<void> => {
    if (writing) return writing
    writing = drain(force).finally(() => { writing = undefined })
    return writing
  }
  const flush = () => write(false)
  const changed = () => {
    revision++
    // An edit retries a failed write, except a write to a document that no longer exists.
    const retry = state.save.state === "error" && state.save.reason !== "missing"
    setState("save", retry ? { state: "saved", dirty: true, error: "", reason: undefined } : { dirty: true })
    clearTimeout(timer)
    timer = setTimeout(() => void flush(), 600)
  }
  // `ours` marks the echo of this draft's own save. Any other replacement is a graph someone else wrote, and undoing across it would revert them.
  const replace = (document: RelayDocument, ours = false) => {
    setState({
      base: document,
      flow: flowFromDocument(document, kind),
      name: document.name,
      description: document.description,
    })
    status({ state: "saved", dirty: false, error: "" })
    if (!ours) {
      past.length = 0
      future.length = 0
      burst = 0
      setState("history", { undo: 0, redo: 0 })
    }
    clean()
  }
  // The store merges a new flow into its current object in place, so a snapshot has to be a copy. The arrays inside are replaced, never mutated.
  const remember = (stack: Step[]) => {
    stack.push({ flow: { ...unwrap(state.flow) }, name: state.name, description: state.description })
    if (stack.length > HISTORY_LIMIT) stack.shift()
  }
  // Edits within BURST_MS of a burst's first edit share one undo step.
  const change = (apply: () => void) => {
    const now = Date.now()
    if (now - burst > BURST_MS) {
      remember(past)
      burst = now
    }
    future.length = 0
    apply()
    setState("history", { undo: past.length, redo: 0 })
    changed()
  }
  const travel = (from: Step[], to: Step[]) => {
    const target = from.pop()
    if (!target) return
    remember(to)
    burst = 0
    setState("flow", target.flow)
    setState("name", target.name)
    setState("description", target.description)
    setState("history", { undo: past.length, redo: future.length })
    changed()
  }
  const discard = () => {
    discarded = true
    clearTimeout(timer)
    status({ state: "saved", dirty: false, error: "" })
    dropLocal(key, initial.id)
    remove()
  }
  // A restored draft whose write was only pending (or offline) saves again on its own; anything else waits for the user.
  if (restored && state.save.state === "saved") timer = setTimeout(() => void flush(), 600)
  return {
    state,
    key,
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
    edit: (flow: Flow) => change(() => setState("flow", flow)),
    // The description field reports every keystroke like a canvas edit, so its typing shares undo steps the same way.
    describe: (description: string) => change(() => setState("description", description)),
    undo: () => travel(past, future),
    redo: () => travel(future, past),
    canUndo: () => state.history.undo > 0,
    canRedo: () => state.history.redo > 0,
    // A rename is a step of its own.
    rename(name: string) {
      remember(past)
      burst = 0
      future.length = 0
      setState("name", name)
      setState("history", { undo: past.length, redo: 0 })
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
          status({ state: "conflict", dirty: true, error: "" })
          return
        }
        replace(latest)
        return
      }
      reloading = false
      // A failed reload keeps the local edits and shows why. A document deleted elsewhere can only be copied or closed.
      const cause = writeFailure(result.error)
      const error = message(result.error)
      if (cause === "missing") return status({ state: "error", dirty: true, error, reason: "missing" })
      setState("save", { error, reason: cause === "offline" ? "offline" : undefined })
    },
    flush,
    // Keep mine: write the local flow over whatever the server holds now.
    overwrite: () => write(true),
    // Save mine as a copy: the local flow becomes a new document, and this draft's edits leave with it.
    async copy(name: string) {
      const created = await source.client.create(
        copyDocument({ ...state.base, description: state.description, ...documentFields(state.flow) }, name),
      )
      await rememberDocument(source.queryClient(), source.key("documents"), created)
      discard()
      source.invalidate("documents")
      return created
    },
    // The document is gone from the server: drop the local edits and the library row that still shows it.
    close() {
      discard()
      source.queryClient().setQueryData(source.key("documents"), (list: RelayDocument[] | undefined) =>
        list?.filter((document) => document.id !== initial.id),
      )
    },
    retained: (): Retained => ({
      key,
      kind,
      base: unwrap(state.base),
      name: state.name,
      description: state.description,
      fields: documentFields(state.flow),
      save: { ...unwrap(state.save) },
    }),
    active: () => !discarded,
    discard,
  }
}

const pending = (draft: Draft) => draft.state.save.dirty || draft.state.save.state !== "saved"

// The desktop asks before it closes a window or quits, and waits a few seconds: save what can be saved and keep the
// rest locally. The first copy is kept before the writes, in case the wait runs out.
async function settleAll() {
  keepLocal()
  await Promise.all([...all].filter(pending).map((draft) => draft.flush()))
  keepLocal()
}

// Registered once, when this page has its first draft.
function watch() {
  if (watching || typeof window === "undefined") return
  watching = true
  window.addEventListener("beforeunload", (event) => {
    if (![...all].some(pending)) return
    event.preventDefault()
    event.returnValue = ""
  })
  // A desktop window cannot hold its unload (see will-prevent-unload in the desktop main process), so whatever is not
  // saved yet is written down as the page goes.
  window.addEventListener("pagehide", keepLocal)
  // A write that failed because the server could not be reached is tried again once it may be back.
  const retry = () =>
    all.forEach((draft) => {
      if (draft.state.save.state === "error" && draft.state.save.reason === "offline") void draft.flush()
    })
  window.addEventListener("online", retry)
  window.addEventListener("focus", retry)
}

// A restored conflict, missing document or refusal waits for the user; a pending or offline write is tried again.
function reopened(save: SaveState): SaveState {
  if (save.state === "conflict" || (save.state === "error" && save.reason !== "offline")) return { ...save, dirty: true }
  return { state: "saved", dirty: true, error: "" }
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

// One entry per draft, so windows that keep their drafts at the same quit never overwrite each other.
// localStorage throws where storage is blocked or full; drafts then live in memory only, as before.
function keepLocal() {
  ;[...all].filter(pending).forEach((draft) => {
    try {
      localStorage.setItem(localKey(draft.key, draft.state.base.id), JSON.stringify(draft.retained()))
    } catch (error) {
      console.warn("A Relay draft could not be kept in local storage", error)
    }
  })
}

function dropLocal(key: string, id: string) {
  try {
    localStorage.removeItem(localKey(key, id))
  } catch {}
}

function readLocal(key: string) {
  const values = (() => {
    try {
      return Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
        .filter((name): name is string => !!name?.startsWith(LOCAL_PREFIX))
        .map((name) => localStorage.getItem(name))
    } catch {
      return []
    }
  })()
  return values.map(parse).filter(retained).filter((item) => item.key === key)
}

function localKey(key: string, id: string) {
  return LOCAL_PREFIX + JSON.stringify([key, id])
}

function parse(raw: string | null) {
  if (!raw) return
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return
  }
}

// Entries come from an earlier run, maybe of another version: anything unexpected is skipped.
function retained(value: unknown): value is Retained {
  if (!record(value) || !record(value.base) || !record(value.fields) || !record(value.save)) return false
  if (value.kind !== "workflow" && value.kind !== "hook") return false
  return (
    typeof value.key === "string" &&
    typeof value.name === "string" &&
    (value.description === undefined || typeof value.description === "string") &&
    typeof value.base.id === "string" &&
    Array.isArray(value.fields.nodes)
  )
}
