import { Actions } from "@orchestra/schema/actions"
import { decodeAction, type createActionsAPI } from "./api"
import type { ErrorState, Route, State } from "./contract"
import { canRequest } from "./request-policy"

type Handle = { signal: AbortSignal; current: () => boolean }
type Entry = { key: string; abort: AbortController; promise: Promise<void>; lifetime: boolean }

/** A chapter owns this registry. Read generations end on navigation; all work ends on disposal. */
export function createRequestOwner() {
  const entries = new Map<string, Entry>()
  let disposed = false
  return {
    get disposed() { return disposed },
    run(slot: string, key: string, work: (handle: Handle) => Promise<void>, fail: (error: unknown) => void, lifetime = false) {
      if (disposed) return Promise.resolve()
      const previous = entries.get(slot)
      if (previous?.key === key) return previous.promise
      previous?.abort.abort()
      const entry: Entry = { key, abort: new AbortController(), promise: Promise.resolve(), lifetime }
      const current = () => !disposed && !entry.abort.signal.aborted && entries.get(slot) === entry
      entries.set(slot, entry)
      entry.promise = Promise.resolve()
        .then(() => current() ? work({ signal: entry.abort.signal, current }) : undefined)
        .catch((error: unknown) => { if (current()) fail(error) })
        .finally(() => { if (entries.get(slot) === entry) entries.delete(slot) })
      return entry.promise
    },
    cancel(slot: string) {
      entries.get(slot)?.abort.abort()
      entries.delete(slot)
    },
    reset(except?: string) {
      entries.forEach((entry, slot) => {
        if (entry.lifetime || slot === except) return
        entry.abort.abort()
        entries.delete(slot)
      })
    },
    dispose() {
      if (disposed) return
      disposed = true
      entries.forEach((entry) => entry.abort.abort())
      entries.clear()
    },
  }
}

export const LOG_PREVIEW_BYTES = 64 * 1024

/** Decode incrementally; reaching the bound cancels upstream without reading another chunk. */
export async function previewResponse(response: Response, signal: AbortSignal) {
  if (!response.body) throw new Error("transfer_failed")
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const abort = () => { void reader.cancel().catch(() => undefined) }
  signal.addEventListener("abort", abort, { once: true })
  let bytes = 0
  let text = ""
  try {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError")
    while (bytes < LOG_PREVIEW_BYTES) {
      const chunk = await reader.read()
      if (signal.aborted) throw new DOMException("Aborted", "AbortError")
      if (chunk.done) return { text: text + decoder.decode(), truncated: false }
      const take = Math.min(chunk.value.byteLength, LOG_PREVIEW_BYTES - bytes)
      text += decoder.decode(chunk.value.subarray(0, take), { stream: true })
      bytes += take
    }
    await reader.cancel().catch(() => undefined)
    return { text: text + decoder.decode(), truncated: true }
  } finally {
    signal.removeEventListener("abort", abort)
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

/** Caller saves raw bytes; this bridge owns cancellation even when a fetch adapter ignores abort. */
export async function saveResponse(response: Response, signal: AbortSignal, save: (response: Response) => Promise<void>) {
  if (!response.body) throw new Error("transfer_failed")
  const reader = response.body.getReader()
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined
  const abort = () => {
    controller?.error(new DOMException("Aborted", "AbortError"))
    void reader.cancel().catch(() => undefined)
  }
  const body = new ReadableStream<Uint8Array>({
    start(value) { controller = value },
    async pull(value) {
      const chunk = await reader.read()
      if (signal.aborted) return
      if (chunk.done) { value.close(); return }
      value.enqueue(chunk.value)
    },
    cancel() { return reader.cancel() },
  }, { highWaterMark: 0 })
  signal.addEventListener("abort", abort, { once: true })
  try {
    if (signal.aborted) { abort(); throw new DOMException("Aborted", "AbortError") }
    await save(new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers }))
    // The save's outcome is authoritative: a late abort cannot undo its physical commit.
  } finally {
    signal.removeEventListener("abort", abort)
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

export const SOURCE_DRAFT_BYTES = 1024 * 1024
export function sourceProposalPath(provider: Actions.ProviderKind, path: string) {
  if (!path || path.length > 2048 || !path.isWellFormed() || path.startsWith("/") || /[\\\x00-\x1f\x7f]/.test(path)
    || path.split("/").some((part) => !part || part === "." || part === "..")) return false
  return provider === "github" ? !/[%{}:]/.test(path) && path.startsWith(".github/workflows/")
    && /^[^/]+\.ya?ml$/i.test(path.slice(".github/workflows/".length))
    : !/[:@?*{}$]/.test(path)
}

export function sourceIdentity(source: Actions.Source) {
  return JSON.stringify([source.bindingID, source.path, source.ref, source.commit, source.version])
}

export function sourceDiscardBlocked(state: State) {
  return state.submitting || state.commandError?.kind === "outcome_unknown"
    || state.operation?.state === "sending" || state.operation?.state === "outcome_unknown"
    || state.operation?.result?.unattributed === true
}

export function immutableSource(state: State, source?: { ref: string; commit?: string }) {
  return Boolean(state.route.runID || state.route.view === "run" || state.route.view === "job"
    || [state.route.ref, source?.ref].some((ref) => ref && (/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(ref) || ref === source?.commit)))
}

/** Source.editable is not permission evidence. Only current branch drafts can request edits. */
export function canEditSource(state: State, source?: Actions.Source) {
  const baseline = source ?? (state.source.status === "idle" ? state.draftBase : undefined)
  return !!baseline && baseline.bindingID === state.binding?.id && !immutableSource(state, baseline)
    && (!state.route.ref || state.route.ref === baseline.ref)
    && (source ? !state.route.path || state.route.path === source.path : state.route.view === "source" && !!state.route.path)
    && canRequest(state, "source.write")
}

/** One observed native baseline and one local draft; new files never fabricate a native Source. */
export function createSourceDraft(input: {
  api: ReturnType<typeof createActionsAPI>; owner: ReturnType<typeof createRequestOwner>
  state: () => State; update: (patch: Partial<State>) => void; error: (cause: unknown) => ErrorState
}) {
  let base: Actions.Source | undefined
  let created: { path: string; ref: string } | undefined
  let generation = 0
  const dirty = () => !!created || (!!base && input.state().draft !== base.text)
  const fail = (kind: string) => { input.update({ commandError: input.error(kind) }); return false }
  return {
    dirty,
    get base() { return base },
    get created() { return created },
    leave(route?: Route) {
      if (!dirty() || (route && JSON.stringify(route) === JSON.stringify(input.state().route))) return true
      return fail("source_dirty")
    },
    install(source: Actions.Source) {
      if (input.owner.disposed) return false
      if (created) return fail("source_conflict")
      if (base && sourceIdentity(base) !== sourceIdentity(source) && dirty()) {
        input.update({ source: { status: "error", value: base, error: input.error("source_conflict") } })
        return fail("source_conflict")
      }
      const changed = !base || sourceIdentity(base) !== sourceIdentity(source)
      base = source
      if (changed) { generation++; input.owner.cancel("draft-base"); input.owner.cancel("validate") }
      input.update({ source: { status: "ready", value: source }, draftBase: undefined,
        ...(changed ? { draft: source.text, diagnostics: [], graph: { status: "idle" } } : {}) })
      return true
    },
    edit(text: string) {
      if (input.owner.disposed || input.state().submitting) return
      if (!canEditSource(input.state(), created ? undefined : base)) { fail("capability_unavailable"); return }
      if (text.length > SOURCE_DRAFT_BYTES || new TextEncoder().encode(text).length > SOURCE_DRAFT_BYTES) { fail("metadata_truncated"); return }
      generation++
      input.owner.cancel("validate")
      input.owner.cancel("draft-base")
      input.update({ draft: text, diagnostics: [], graph: { status: "idle" }, commandError: undefined })
    },
    async create(path: string, ref: string | undefined, text: string) {
      if (input.owner.disposed) return
      if (dirty()) { fail("source_dirty"); return }
      if (!canRequest(input.state(), "source.write") || immutableSource(input.state(), ref ? { ref } : undefined)) { fail("capability_unavailable"); return }
      const binding = input.state().binding
      if (!binding) { fail("binding_missing"); return }
      if (!sourceProposalPath(binding.provider.kind, path) || (ref !== undefined && (!ref || ref.length > 2048))) { fail("invalid_input"); return }
      if (!text.isWellFormed() || text.length > SOURCE_DRAFT_BYTES || new TextEncoder().encode(text).length > SOURCE_DRAFT_BYTES) { fail("metadata_truncated"); return }
      const scope = { bindingID: binding.id, revision: binding.revision }
      const route = JSON.stringify(input.state().route)
      const dialog = JSON.stringify(input.state().dialog)
      const version = ++generation
      const current = () => version === generation && input.state().binding?.id === scope.bindingID
        && input.state().binding?.revision === scope.revision && JSON.stringify(input.state().route) === route
        && JSON.stringify(input.state().dialog) === dialog
      input.update({ commandError: undefined })
      await input.owner.run("draft-base", JSON.stringify([scope, route, version, path, ref]), async (handle) => {
        if (!current()) return
        const observed = await input.api.sourceBase(scope, ref, handle.signal)
        if (!handle.current() || !current()) return
        const baseline = decodeAction(Actions.SourceBase, observed)
        if (baseline.bindingID !== scope.bindingID || (ref !== undefined && baseline.ref !== ref)
          || baseline.ref.length > 2048 || immutableSource(input.state(), baseline)) { fail("source_conflict"); return }
        if (!canRequest(input.state(), "source.write")) { fail("capability_unavailable"); return }
        base = undefined
        created = { path, ref: baseline.ref }
        generation++
        input.owner.reset("draft-base")
        input.update({ route: { view: "source", path, ref: baseline.ref }, source: { status: "idle" }, draftBase: baseline,
          draft: text, diagnostics: [], dialog: undefined, graph: { status: "idle" }, commandError: undefined, commandOutput: undefined })
      }, (cause) => { if (current()) input.update({ commandError: input.error(cause) }) })
    },
    cancelCreate() { input.owner.cancel("draft-base") },
    abandon() { if (input.owner.disposed || sourceDiscardBlocked(input.state())) return
      created = undefined; generation++; input.owner.cancel("draft-base"); input.owner.cancel("validate");
      input.update({ draft: base?.text ?? "", draftBase: undefined, graph: { status: "idle" }, diagnostics: [], commandError: undefined }) },
    validate() {
      if (input.owner.disposed) return Promise.resolve()
      const source = base && decodeAction(Actions.Source, base)
      const baseline = created && input.state().draftBase ? decodeAction(Actions.SourceBase, input.state().draftBase) : undefined
      const path = created?.path
      const binding = input.state().binding
      if (!binding || (created ? !baseline || baseline.bindingID !== binding.id || created.ref !== baseline.ref
        || input.state().route.path !== path || input.state().route.ref !== baseline.ref : !source || source.bindingID !== binding.id)) {
        fail("source_unresolved")
        return Promise.resolve()
      }
      const draft = input.state().draft
      const version = generation
      const scope = { bindingID: binding.id, revision: binding.revision }
      const route = JSON.stringify(input.state().route)
      const current = () => version === generation && input.state().binding?.id === scope.bindingID
        && input.state().binding?.revision === scope.revision && JSON.stringify(input.state().route) === route
      input.update({ graph: { status: "loading" }, diagnostics: [], commandError: undefined })
      return input.owner.run("validate", JSON.stringify([scope, baseline ?? (source && sourceIdentity(source)), path, version]), async (handle) => {
        if (!current()) return
        const graph = baseline && path ? await input.api.validateDraft(scope, baseline, path, draft, handle.signal)
          : source ? await input.api.validateSource(scope, source, draft, handle.signal) : undefined
        if (!graph || !handle.current() || !current()) return
        if (graph.source.text !== draft || (baseline ? graph.source.bindingID !== baseline.bindingID || graph.source.ref !== baseline.ref
          || graph.source.commit !== baseline.commit || graph.source.path !== path || !graph.source.version.startsWith("draft:") || graph.source.version.length <= 6
          : !source || sourceIdentity(graph.source) !== sourceIdentity(source))) {
          input.update({ graph: { status: "error", error: input.error("source_conflict") } })
          fail("source_conflict")
          return
        }
        input.update({ graph: { status: "ready", value: graph }, diagnostics: [...graph.diagnostics, ...(graph.source.diagnostics ?? [])]
          .slice(0, 32).map((item) => item.slice(0, 256)) })
      }, (cause) => { if (current()) input.update({ graph: { status: "error", error: input.error(cause) }, commandError: input.error(cause) }) })
    },
    published(source: Actions.Source) {
      if (input.owner.disposed) return
      input.owner.cancel("validate")
      input.owner.cancel("draft-base")
      created = undefined
      base = undefined
      generation++
      base = source
      input.update({ route: { ...input.state().route, view: "source", path: source.path, ref: source.ref },
        source: { status: "ready", value: source }, draftBase: undefined, draft: source.text, diagnostics: [], graph: { status: "idle" } })
    },
    reset() { base = undefined; created = undefined; generation++; input.owner.cancel("draft-base"); input.owner.cancel("validate"); input.update({ draftBase: undefined }) },
  }
}
