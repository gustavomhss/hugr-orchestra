import { Capability } from "@orchestra/schema/capability"
import { CapabilityArtifactManagement } from "@orchestra/schema/capability-artifact-management"
import { CapabilityManagement } from "@orchestra/schema/capability-management"
import { SessionID } from "@orchestra/schema/session-id"
import { Option, Schema } from "effect"
import { getOwner, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import type { Part } from "@/v2-wire"

export type Artifact = CapabilityArtifactManagement.Artifact
export type ArtifactRef = Capability.ArtifactRef
export type ArtifactsReceipt = typeof CapabilityManagement.Receipt.Type
export type ArtifactsOptions = Readonly<{ signal?: AbortSignal }>
export type ArtifactsApi = Readonly<{
  list: (after?: string, options?: ArtifactsOptions) => Promise<CapabilityArtifactManagement.ArtifactPage>
  get: (ref: ArtifactRef, options?: ArtifactsOptions) => Promise<Artifact>
  share: (ref: ArtifactRef, targetSessionID: SessionID, key: string, options?: ArtifactsOptions) => Promise<ArtifactsReceipt>
  pin: (ref: ArtifactRef, pinned: boolean, key: string, options?: ArtifactsOptions) => Promise<ArtifactsReceipt>
  remove: (ref: ArtifactRef, key: string, options?: ArtifactsOptions) => Promise<ArtifactsReceipt>
  content: (ref: ArtifactRef) => string
}>
/**
 * `conflict`: the server refused the write, for example removing a pinned reference or reusing a key for another request.
 * `unknown`: the write may have committed; a retry resends it with the same key.
 */
export type ArtifactsFailure = "authorization" | "conflict" | "invalid" | "request" | "unknown"
export type ArtifactsAction = "pin" | "unpin" | "remove" | "share"
/** One per request. A share sends one request per target Session, so it reports one outcome per target. */
export type ArtifactsOutcome = Readonly<{ targetSessionID?: SessionID; receipt?: ArtifactsReceipt; failure?: ArtifactsFailure }>
export type ArtifactsState = Readonly<{
  status: "loading" | "ready" | "error"
  artifacts: readonly Artifact[]
  after?: string
  selected?: ArtifactRef
  failure?: ArtifactsFailure
  busy: boolean
  action?: ArtifactsAction
  outcomes: readonly ArtifactsOutcome[]
  retryable: boolean
}>
export type ArtifactPreview = "image" | "video" | "pdf" | "sheet" | "download"
export type ArtifactSelection = Readonly<{ artifact: Artifact; preview: ArtifactPreview; note?: "not-verified"; url: string }>
export type ArtifactsModel = Readonly<{
  state: ArtifactsState
  /** The panel toggle exists only once the Session has an artifact. */
  visible: () => boolean
  selection: () => ArtifactSelection | undefined
  load: (more?: boolean) => Promise<void>
  select: (ref: ArtifactRef) => Promise<void>
  pin: (ref: ArtifactRef, pinned: boolean) => Promise<void>
  remove: (ref: ArtifactRef) => Promise<void>
  share: (ref: ArtifactRef, targets: readonly SessionID[]) => Promise<void>
  retry: () => Promise<void>
  cancel: () => void
  dispose: () => void
}>

type Step = { key: string; targetSessionID?: SessionID; receipt?: ArtifactsReceipt
  send: (key: string, signal: AbortSignal) => Promise<unknown>; verify: (data: unknown) => boolean }

export function createArtifactsModel(api: ArtifactsApi, requestKey: () => string = () => crypto.randomUUID()): ArtifactsModel {
  const [state, set] = createStore<{ -readonly [K in keyof ArtifactsState]: ArtifactsState[K] }>({
    status: "loading", artifacts: [], busy: false, outcomes: [], retryable: false,
  })
  let disposed = false
  let generation = 0
  let reading: AbortController | undefined
  let writing: AbortController | undefined
  // Idempotency keys never enter the store. A retry resends only unsettled requests, each with its original key.
  let operation: { steps: Step[]; apply: () => void } | undefined

  const read = async <T>(run: (signal: AbortSignal) => Promise<T>, apply: (value: T) => void) => {
    if (disposed) return
    reading?.abort()
    const version = ++generation
    const controller = new AbortController()
    reading = controller
    set({ status: "loading", failure: undefined })
    const result = await Promise.resolve().then(() => run(controller.signal))
      .then((value) => ({ ok: true as const, value }), (error: unknown) => ({ ok: false as const, error }))
    if (disposed || version !== generation) return
    reading = undefined
    if (!result.ok) {
      set({ status: "error", failure: failure(result.error, false) })
      return
    }
    apply(result.value)
    set({ status: "ready" })
  }
  const load = (more = false) => {
    if (more && !state.after) return Promise.resolve()
    const after = more ? state.after : undefined
    return read(async (signal) => {
      const page = decode(CapabilityArtifactManagement.ArtifactPage, await api.list(after, { signal }))
      if (page.items.length > 32 || (page.after !== undefined && page.after === after)) throw "invalid"
      return page
    }, (page) => set({ artifacts: orderArtifacts(more ? merge(state.artifacts, page.items) : page.items), after: page.after }))
  }
  const select = async (input: ArtifactRef) => {
    if (disposed) return
    const ref = decode(Capability.ArtifactRef, { ...input })
    set({ selected: ref })
    if (state.artifacts.some((row) => same(row.artifact, ref))) return
    // A transcript chip may name an artifact beyond the loaded pages.
    await read(async (signal) => {
      const artifact = decode(CapabilityArtifactManagement.Artifact, await api.get(ref, { signal }))
      if (!same(artifact.artifact, ref)) throw "invalid"
      return artifact
    }, (artifact) => set({ artifacts: orderArtifacts(merge(state.artifacts, [artifact])) }))
  }
  const retry = async () => {
    if (disposed || state.busy || !operation) return
    const intent = operation
    const controller = new AbortController()
    writing = controller
    set({ busy: true, outcomes: [], retryable: false })
    const outcomes = await Promise.all(intent.steps.map((step) => Promise.resolve(step.receipt ?? Promise.resolve()
      .then(() => step.send(step.key, controller.signal)).then((reply) => {
        const receipt = decode(CapabilityManagement.Receipt, reply)
        if (!step.verify(receipt.data)) throw "invalid"
        step.receipt = receipt
        return receipt
      })).then((receipt): ArtifactsOutcome => ({ targetSessionID: step.targetSessionID, receipt }),
      (error: unknown): ArtifactsOutcome => ({ targetSessionID: step.targetSessionID, failure: failure(error, true) }))))
    if (disposed || writing !== controller || operation !== intent) return
    writing = undefined
    const settled = intent.steps.every((step) => step.receipt)
    // Only a request whose outcome is unknown may be resent; refused requests close the intent.
    const retryable = outcomes.some((outcome) => outcome.failure === "unknown" || outcome.failure === "request")
    if (!retryable) operation = undefined
    if (settled) intent.apply()
    set({ busy: false, outcomes, retryable: !settled && retryable })
  }
  const mutate = (action: ArtifactsAction, input: ArtifactRef, steps: readonly Omit<Step, "key">[], apply: () => void) => {
    if (disposed || state.busy || !steps.length) return Promise.resolve()
    try {
      operation = { apply, steps: steps.map((step) => ({ ...step, key: decode(Schema.NonEmptyString, requestKey()) })) }
    } catch {
      operation = undefined
      set({ action, outcomes: [{ failure: "invalid" }], retryable: false })
      return Promise.resolve()
    }
    set({ action, outcomes: [], retryable: false })
    return retry()
  }
  const cancel = () => {
    if (disposed) return
    writing?.abort()
    writing = undefined
    operation = undefined
    set({ busy: false, retryable: false })
  }
  const dispose = () => {
    if (disposed) return
    disposed = true
    reading?.abort()
    writing?.abort()
    reading = undefined
    writing = undefined
    operation = undefined
    set({ status: "loading", artifacts: [], after: undefined, selected: undefined, failure: undefined, busy: false,
      action: undefined, outcomes: [], retryable: false })
  }
  if (getOwner()) onCleanup(dispose)
  return {
    state,
    visible: () => state.artifacts.length > 0,
    selection: () => {
      const ref = state.selected
      const artifact = ref && state.artifacts.find((row) => same(row.artifact, ref))
      if (!artifact) return undefined
      return { artifact, preview: previewKind(artifact.mime), note: verificationNote(artifact.verification),
        url: api.content(artifact.artifact) }
    },
    load,
    select,
    retry,
    cancel,
    dispose,
    pin: (input, pinned) => {
      const ref = decode(Capability.ArtifactRef, { ...input })
      return mutate(pinned ? "pin" : "unpin", ref, [{
        send: (key, signal) => api.pin(ref, pinned, key, { signal }),
        verify: (data) => Option.exists(Schema.decodeUnknownOption(PinData)(data),
          (value) => same(value.artifact, ref) && value.pinned === pinned),
      }], () => set({ artifacts: orderArtifacts(state.artifacts.map((row) => same(row.artifact, ref) ? { ...row, pinned } : row)) }))
    },
    remove: (input) => {
      const ref = decode(Capability.ArtifactRef, { ...input })
      return mutate("remove", ref, [{
        send: (key, signal) => api.remove(ref, key, { signal }),
        verify: (data) => Option.exists(Schema.decodeUnknownOption(RemoveData)(data), (value) => same(value.artifact, ref)),
      }], () => set({ artifacts: state.artifacts.filter((row) => !same(row.artifact, ref)),
        selected: state.selected && same(state.selected, ref) ? undefined : state.selected }))
    },
    share: (input, targets) => {
      const ref = decode(Capability.ArtifactRef, { ...input })
      return mutate("share", ref, [...new Set(targets)].map((target) => decode(SessionID, target)).map((targetSessionID) => ({
        targetSessionID,
        send: (key, signal) => api.share(ref, targetSessionID, key, { signal }),
        verify: (data) => Option.exists(Schema.decodeUnknownOption(ShareData)(data),
          (value) => same(value.artifact, ref) && value.targetSessionID === targetSessionID),
      })), () => {})
    },
  }
}

/** Pinned first, then newest first. Ties fall back to identity so the order never depends on page arrival. */
export function orderArtifacts(items: readonly Artifact[]) {
  return items.toSorted((a, b) => Number(b.pinned) - Number(a.pinned) || b.timeCreated - a.timeCreated
    || b.artifact.id.localeCompare(a.artifact.id) || b.artifact.revision - a.artifact.revision)
}

const images = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"])
const sheets = new Set(["text/csv", "text/tab-separated-values",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.oasis.opendocument.spreadsheet"])

/** How the panel previews a mime. Anything it cannot render inline is offered as a download only. */
export function previewKind(mime: string): ArtifactPreview {
  const type = mime.split(";")[0].trim().toLowerCase()
  if (images.has(type)) return "image"
  if (type.startsWith("video/")) return "video"
  if (type === "application/pdf") return "pdf"
  if (sheets.has(type)) return "sheet"
  return "download"
}

/** `verified` shows no badge; anything weaker shows a quiet note. */
export function verificationNote(verification: Capability.Verification) {
  return verification === "verified" ? undefined : "not-verified" as const
}

/** The artifacts a completed tool part reports, in order and without duplicates. Each is a chip target for `select`. */
export function artifactChips(part: Part): readonly ArtifactRef[] {
  if (part.type !== "tool" || part.state.status !== "completed") return []
  const output = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(part.state.output)
  const refs = [...(Option.isSome(output) ? collect(output.value, 0) : []), ...collect(part.state.metadata, 0)]
  return [...new Map(refs.map((ref) => [`${ref.id}:${ref.revision}`, ref])).values()]
}

// Capability results nest under different tool outputs, so look a few levels down for `artifactRefs`.
function collect(value: unknown, depth: number): ArtifactRef[] {
  if (depth > 4 || !value || typeof value !== "object") return []
  if (Array.isArray(value)) return value.flatMap((item) => collect(item, depth + 1))
  return Object.entries(value).flatMap(([key, item]) => key === "artifactRefs" && Array.isArray(item)
    ? item.flatMap((ref) => Option.toArray(Schema.decodeUnknownOption(Capability.ArtifactRef, { onExcessProperty: "error" })(ref)))
    : collect(item, depth + 1))
}

const PinData = Schema.Struct({ artifact: Capability.ArtifactRef, pinned: Schema.Boolean })
const RemoveData = Schema.Struct({ artifact: Capability.ArtifactRef, removed: Schema.Literal(true) })
const ShareData = Schema.Struct({ artifact: Capability.ArtifactRef, targetSessionID: SessionID })

function same(left: ArtifactRef, right: ArtifactRef) {
  return left.id === right.id && left.revision === right.revision
}

function merge(previous: readonly Artifact[], incoming: readonly Artifact[]) {
  return [...new Map([...previous, ...incoming].map((row) => [`${row.artifact.id}:${row.artifact.revision}`, row])).values()]
}

function decode<S extends Schema.Decoder<unknown>>(schema: S, input: unknown): S["Type"] {
  const value = Schema.decodeUnknownOption(schema, { onExcessProperty: "error" })(input)
  if (Option.isNone(value)) throw "invalid"
  return value.value
}

function failure(error: unknown, mutation: boolean): ArtifactsFailure {
  // A malformed reply to a write cannot prove the write did not commit.
  if (error === "invalid") return mutation ? "unknown" : "invalid"
  if (!error || typeof error !== "object") return mutation ? "unknown" : "request"
  const cause = "cause" in error ? error.cause : undefined
  const status = "status" in error ? error.status : cause && typeof cause === "object" && "status" in cause ? cause.status : undefined
  const tag = "_tag" in error ? error._tag : undefined
  if (status === 401 || status === 403 || tag === "UnauthorizedError" || tag === "ForbiddenError") return "authorization"
  if (status === 409 || tag === "ConflictError") return mutation ? "conflict" : "request"
  if (status === 400 || status === 422 || tag === "InvalidRequestError") return "invalid"
  if (typeof status === "number" || typeof tag === "string") return "request"
  return mutation ? "unknown" : "request"
}
