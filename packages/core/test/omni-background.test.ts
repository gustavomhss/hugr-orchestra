import { describe, expect, test } from "bun:test"
import { BackgroundJob } from "@orchestra/core/background-job"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import type { Child } from "@orchestra/core/omni"
import { OmniBackground } from "@orchestra/core/omni-background"
import { Effect, Exit, Layer, Scope } from "effect"
import { it } from "./lib/effect"

const jobsLayer = LayerNode.compile(BackgroundJob.node)

/** A tree of `pids` that stays alive until stop() or end(); records how often it was stopped. */
function fake(pids = [4101, 4102]) {
  const state = { alive: true, stops: 0 }
  const child = {
    pid: pids[0],
    processes: async () => (state.alive ? pids.map((pid) => ({ pid, parentPid: null, name: "fake" })) : []),
    stop: async () => {
      state.stops++
      state.alive = false
      return { exitCode: null, signal: "SIGTERM", reason: "killed", success: false }
    },
  } as unknown as Child
  return { child, state, end: () => (state.alive = false) }
}

const registry = Effect.map(BackgroundJob.Service, (jobs) => ({
  jobs,
  processes: OmniBackground.make(jobs, { pollMs: 10 }),
}))

/** Polls until `check` holds; a bound on a state change, never a latency assertion. */
const until = (check: () => boolean) =>
  Effect.gen(function* () {
    for (let i = 0; i < 500 && !check(); i++) yield* Effect.sleep(10)
    expect(check()).toBe(true)
  })

describe("OmniBackground.Ring", () => {
  test("keeps the last limit bytes across chunk boundaries and counts every byte written", () => {
    const ring = new OmniBackground.Ring(8)
    ring.write("abc")
    ring.write("defg")
    expect(ring.text()).toBe("abcdefg")
    ring.write("hij")
    expect(ring.text()).toBe("cdefghij")
    ring.write(new Uint8Array(0))
    ring.write("0123456789XY")
    expect(ring.text()).toBe("456789XY")
    expect(ring.text(3)).toBe("9XY")
    expect(ring.written).toBe(22)
    expect(ring.held).toBe(8)
  })

  test("the default limit is 1 MiB", () => {
    const ring = new OmniBackground.Ring()
    ring.write("x".repeat(OmniBackground.RING_BYTES))
    ring.write("tail")
    const text = ring.text()
    expect(Buffer.byteLength(text)).toBe(OmniBackground.RING_BYTES)
    expect(text.endsWith("xtail")).toBe(true)
    expect(ring.held).toBe(OmniBackground.RING_BYTES)
  })

  test("a cut never starts inside a UTF-8 character, and written bytes are copied", () => {
    const ring = new OmniBackground.Ring(4)
    ring.write("aé€") // 1 + 2 + 3 bytes: the last 4 start inside é
    expect(ring.text()).toBe("€")
    const buffer = new TextEncoder().encode("ok")
    const copy = new OmniBackground.Ring(4)
    copy.write(buffer)
    buffer.set([0x78, 0x78])
    expect(copy.text()).toBe("ok")
  })

  test("sink() is one ring per child", () => {
    const { child } = fake()
    expect(OmniBackground.sink(child)).toBe(OmniBackground.sink(child))
    expect(OmniBackground.sink(fake().child)).not.toBe(OmniBackground.sink(child))
  })
})

describe("OmniBackground registry", () => {
  it.live("lists an adopted tree with its processes and the output written to its sink, then stops it", () =>
    Effect.gen(function* () {
      const { jobs, processes } = yield* registry
      const tree = fake()
      OmniBackground.sink(tree.child).write("before adoption\n")
      yield* processes.register(tree.child, { sessionID: "ses_a", title: "npm run dev" })
      OmniBackground.sink(tree.child).write("after adoption\n")

      const [listed, ...rest] = yield* processes.list("ses_a")
      expect(rest).toEqual([])
      expect(listed).toMatchObject({
        pid: 4101,
        title: "npm run dev",
        output: "before adoption\nafter adoption\n",
        written: 31,
        processes: [
          { pid: 4101, parentPid: null, name: "fake" },
          { pid: 4102, parentPid: null, name: "fake" },
        ],
      })
      expect(yield* processes.list("ses_other")).toEqual([])
      expect((yield* processes.list("ses_a", 6))[0].output).toBe("ption\n")

      // The job is a BackgroundJob of type "process" whose session key is not the one Esc cancels (R2-5).
      const job = yield* jobs.get(listed.id)
      expect(job).toMatchObject({ type: "process", status: "running", metadata: { sessionID: "ses_a", pid: 4101 } })
      expect(job?.metadata?.sessionId).toBeUndefined()

      expect(yield* processes.stop("ses_other", listed.id)).toBe(false)
      expect(tree.state.stops).toBe(0)
      expect(yield* processes.stop("ses_a", listed.id)).toBe(true)
      yield* until(() => tree.state.stops === 1)
      expect(yield* processes.list("ses_a")).toEqual([])
      expect((yield* jobs.get(listed.id))?.status).toBe("cancelled")
      expect(yield* processes.stop("ses_a", listed.id)).toBe(false)
    }).pipe(Effect.provide(jobsLayer)),
  )

  it.live("stopSession stops that session's trees and no other", () =>
    Effect.gen(function* () {
      const { processes } = yield* registry
      const [first, second, other] = [fake([1]), fake([2]), fake([3])]
      yield* processes.register(first.child, { sessionID: "ses_a", title: "one" })
      yield* processes.register(second.child, { sessionID: "ses_a", title: "two" })
      yield* processes.register(other.child, { sessionID: "ses_b", title: "three" })
      expect((yield* processes.list("ses_a")).map((item) => item.title).toSorted()).toEqual(["one", "two"])

      yield* processes.stopSession("ses_a")
      yield* until(() => first.state.stops === 1 && second.state.stops === 1)
      expect(yield* processes.list("ses_a")).toEqual([])
      expect(other.state.stops).toBe(0)
      expect((yield* processes.list("ses_b")).map((item) => item.title)).toEqual(["three"])
    }).pipe(Effect.provide(jobsLayer)),
  )

  it.live("a tree that ends by itself completes its job and leaves the list", () =>
    Effect.gen(function* () {
      const { jobs, processes } = yield* registry
      const tree = fake()
      yield* processes.register(tree.child, { sessionID: "ses_a", title: "short" })
      const [listed] = yield* processes.list("ses_a")
      tree.end()
      yield* until(() => tree.state.stops === 1)
      expect((yield* jobs.wait({ id: listed.id, timeout: 5000 })).info?.status).toBe("completed")
      expect(yield* processes.list("ses_a")).toEqual([])
    }).pipe(Effect.provide(jobsLayer)),
  )

  it.live("a tree that is already gone is stopped and never becomes a job", () =>
    Effect.gen(function* () {
      const { jobs, processes } = yield* registry
      const tree = fake()
      tree.end()
      yield* processes.register(tree.child, { sessionID: "ses_a", title: "gone" })
      expect(tree.state.stops).toBe(1)
      expect(yield* jobs.list()).toEqual([])
    }).pipe(Effect.provide(jobsLayer)),
  )

  it.live("closing the jobs' scope (instance or server disposal) stops every adopted tree", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make()
      const context = yield* Layer.buildWithScope(jobsLayer, scope)
      const tree = fake()
      yield* Effect.gen(function* () {
        const { processes } = yield* registry
        yield* processes.register(tree.child, { sessionID: "ses_a", title: "dev" })
      }).pipe(Effect.provideContext(context))
      expect(tree.state.stops).toBe(0)
      yield* Scope.close(scope, Exit.void)
      yield* until(() => tree.state.stops === 1)
    }),
  )
})
