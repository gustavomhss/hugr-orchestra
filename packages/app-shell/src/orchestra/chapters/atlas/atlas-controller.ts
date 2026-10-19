import { createStore } from "solid-js/store"
import { pathKey } from "@/utils/path-key"
import { isAtlasEmpty, type AtlasTransport } from "./atlas-api"
import type { AtlasInput, AtlasOutput, AtlasReview, AtlasSnapshot } from "./atlas-types"

export type AtlasOwner = { server: string; directory: string; transport: AtlasTransport }
export type AtlasWrite =
  | "promote"
  | "draft"
  | "emit"
  | "link"
  | "verify"
  | "hold"
  | "release"
  | "propose"
  | "decide"
  | "answer"
  | "memoryDecide"
  | "territory"
  | "delegate"
export type AtlasController = ReturnType<typeof createAtlasController>
type State = {
  key?: string
  snapshot?: AtlasSnapshot
  // D34: the review log, read with the snapshot; undefined while the store is empty.
  review?: AtlasReview
  // D5: the instance worktree has no .atlas/.
  empty: boolean
  // The server has no `atlas` routes.
  unavailable: boolean
  loading: boolean
  error?: string
  health?: AtlasOutput<"health">
  reasoning: Record<string, AtlasOutput<"reasoning">>
  own: Record<string, AtlasOutput<"own">>
  pending: AtlasWrite[]
}

// One selected owner (server + directory), like the Lean controller. D6: the snapshot is read on select, on
// refresh, and again after every write; reasoning, own briefings and health are read on demand and cached.
export function createAtlasController(describe: (error: unknown) => { message: string; unavailable?: boolean }) {
  const [state, setState] = createStore<State>({
    empty: false,
    unavailable: false,
    loading: false,
    reasoning: {},
    own: {},
    pending: [],
  })
  const requests = new Set<AbortController>()
  const life = { disposed: false, sequence: 0, accepted: 0 }
  let owner: AtlasOwner | undefined
  let read: AbortController | undefined

  const request = () => {
    const abort = new AbortController()
    requests.add(abort)
    return abort
  }
  const cancel = () => {
    requests.forEach((item) => item.abort())
    requests.clear()
  }
  const current = (active: AtlasOwner, abort: AbortController) =>
    !life.disposed && owner === active && !abort.signal.aborted
  const failure = (error: unknown) => {
    const result = describe(error)
    if (result.unavailable) {
      cancel()
      setState({
        snapshot: undefined,
        review: undefined,
        empty: false,
        unavailable: true,
        loading: false,
        pending: [],
        error: undefined,
      })
      return
    }
    setState("error", result.message)
  }
  // Runs one request against the selected owner; resolves undefined when it failed or was superseded.
  const run = async <T>(call: (transport: AtlasTransport, signal: AbortSignal) => Promise<T>, abort = request()) => {
    const active = owner
    if (!active || life.disposed || state.unavailable) return
    try {
      const value = await call(active.transport, abort.signal)
      if (current(active, abort)) return value
    } catch (error) {
      if (current(active, abort)) failure(error)
    } finally {
      requests.delete(abort)
    }
  }

  const refresh = async () => {
    if (!owner || life.disposed || state.unavailable) return
    read?.abort()
    const order = ++life.sequence
    setState({ loading: true, error: undefined })
    read = request()
    // D34: the review log is read beside the snapshot, under the same abort, so the two always match.
    const [data, review] = await Promise.all([
      run((transport, signal) => transport.snapshot(signal), read),
      run((transport, signal) => transport.review(signal), read),
    ])
    if (life.disposed) return
    // A newer refresh owns the loading flag until it finishes.
    if (order === life.sequence) setState("loading", false)
    if (data === undefined || order < life.accepted) return
    life.accepted = order
    if (isAtlasEmpty(data)) return setState({ snapshot: undefined, review: undefined, empty: true })
    setState({ snapshot: data, review: review === undefined || isAtlasEmpty(review) ? undefined : review, empty: false })
  }

  const reasoning = async (id: string) => {
    if (state.reasoning[id]) return state.reasoning[id]
    const data = await run((transport, signal) => transport.reasoning(id, signal))
    if (data !== undefined) setState("reasoning", id, data)
    return data
  }
  const own = async (scope: string) => {
    if (state.own[scope]) return state.own[scope]
    const data = await run((transport, signal) => transport.own(scope, signal))
    if (data !== undefined) setState("own", scope, data)
    return data
  }
  const health = async () => {
    const data = await run((transport, signal) => transport.health(signal))
    if (data !== undefined) setState("health", data)
    return data
  }

  // A write marks its kind pending, then rereads the snapshot and the review (D6, D34). `verify` saves nothing.
  const write = async <T>(kind: AtlasWrite, call: (transport: AtlasTransport, signal: AbortSignal) => Promise<T>) => {
    setState({ pending: [...state.pending, kind], error: undefined })
    const data = await run(call)
    if (life.disposed) return data
    setState("pending", state.pending.filter((item) => item !== kind))
    if (kind !== "verify") await refresh()
    return data
  }

  return {
    state,
    refresh,
    reasoning,
    own,
    health,
    promote: (input: AtlasInput<"promote">) => write("promote", (transport, signal) => transport.promote(input, signal)),
    draft: (input: AtlasInput<"draft">) => write("draft", (transport, signal) => transport.draft(input, signal)),
    emit: (input: AtlasInput<"emit">) => write("emit", (transport, signal) => transport.emit(input, signal)),
    link: (input: AtlasInput<"link">) => write("link", (transport, signal) => transport.link(input, signal)),
    verify: (input: AtlasInput<"verify">) => write("verify", (transport, signal) => transport.verify(input, signal)),
    hold: (input: AtlasInput<"hold">) => write("hold", (transport, signal) => transport.hold(input, signal)),
    release: (input: AtlasInput<"release">) => write("release", (transport, signal) => transport.release(input, signal)),
    propose: (input: AtlasInput<"propose">) => write("propose", (transport, signal) => transport.propose(input, signal)),
    decide: (input: AtlasInput<"decide">) => write("decide", (transport, signal) => transport.decide(input, signal)),
    answer: (input: AtlasInput<"answer">) => write("answer", (transport, signal) => transport.answer(input, signal)),
    memoryDecide: (input: AtlasInput<"memoryDecide">) =>
      write("memoryDecide", (transport, signal) => transport.memoryDecide(input, signal)),
    territory: (input: AtlasInput<"territory">) =>
      write("territory", (transport, signal) => transport.territory(input, signal)),
    delegate: (input: AtlasInput<"delegate">) =>
      write("delegate", (transport, signal) => transport.delegate(input, signal)),
    async select(next: AtlasOwner) {
      if (life.disposed) return
      cancel()
      owner = { ...next }
      life.accepted = 0
      setState({
        key: `${next.server}\0${pathKey(next.directory)}`,
        review: undefined,
        snapshot: undefined,
        empty: false,
        unavailable: false,
        loading: false,
        error: undefined,
        health: undefined,
        reasoning: {},
        own: {},
        pending: [],
      })
      await refresh()
    },
    dispose() {
      life.disposed = true
      owner = undefined
      cancel()
    },
  }
}
