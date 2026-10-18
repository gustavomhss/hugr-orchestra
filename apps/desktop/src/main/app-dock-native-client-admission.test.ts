import { afterEach, describe, expect, test } from "bun:test"
import { getEventListeners } from "node:events"
import { NativeDockProtocol } from "./app-dock-native-protocol"
import { bind, closeClients, discover, failure, invalid, memory, read, until } from "./app-dock-native-client.fixture"

afterEach(closeClients)

describe("semantic admission and control races", () => {
  test("FIFO across bindings and synchronous terminals respect write backpressure", async () => {
    const { channel, client } = await memory()
    await bind(client, channel)
    await bind(client, channel, "b")
    const gate = Promise.withResolvers<void>()
    channel.onWrite = (request) => request.op === "read" && request.bindingID === "a" ? gate.promise : undefined
    const first = client.request(read())
    const original = channel.last
    const second = client.request(read("b"))
    const third = client.request(read())
    second.catch(() => {})
    third.catch(() => {})
    channel.ack(original, "first")
    expect(await first).toBe("first")
    expect(channel.writes.filter((request) => request.op === "read").length).toBe(1)
    gate.resolve()
    await until(() => channel.last.bindingID === "b")
    channel.ack(channel.last, "second")
    expect(await second).toBe("second")
    await until(() => channel.last.id !== original.id && channel.last.bindingID === "a")
    channel.ack(channel.last, "third")
    expect(await third).toBe("third")
    expect(channel.writes.filter((request) => request.op === "read").map((request) => request.bindingID)).toEqual(["a", "b", "a"])
    expect(channel.writes.map((request) => request.id)).toEqual(["golden:1", "golden:2", "golden:3", "golden:4", "golden:5"])
  })

  test("retains slot after abort and control ACK until original late terminal", async () => {
    const { channel, client } = await memory({ cancelGraceMs: 500 })
    await bind(client, channel)
    const abort = new AbortController()
    const sent = failure(client.request(read(), abort.signal))
    expect(getEventListeners(abort.signal, "abort").length).toBe(1)
    const original = channel.last
    const queued = client.request(read())
    queued.catch(() => {})
    abort.abort()
    expect(await sent).toMatchObject({ code: "cancelled", outcome: "unknown" })
    expect(getEventListeners(abort.signal, "abort").length).toBe(0)
    await until(() => channel.last.op === "cancel")
    const cancel = channel.last
    expect(cancel.args.requestID).toBe(original.id)
    channel.ack(cancel)
    await Bun.sleep(0)
    expect(channel.writes.filter((request) => request.op === "read").length).toBe(1)
    channel.ack(original, "late result")
    await until(() => channel.last.op === "read" && channel.last.id !== original.id)
    channel.ack(channel.last, "next result")
    expect(await queued).toBe("next result")
    expect(channel.writes.map((request) => request.sequence)).toEqual([1, 2, 3, 4])
    expect(channel.writes.map((request) => request.id)).toEqual(["golden:1", "golden:2", "golden:3", "golden:4"])
  })

  test("retains slot after timeout; original terminal before cancel serialization removes cancel", async () => {
    const { channel, client } = await memory({ cancelGraceMs: 200 })
    const gate = Promise.withResolvers<void>()
    channel.onWrite = () => gate.promise
    const sent = failure(client.request({ ...discover, timeoutMs: 10 }))
    const original = channel.last
    const queued = client.request(discover)
    expect(await sent).toMatchObject({ code: "timeout", outcome: "unknown" })
    expect(channel.writes.length).toBe(1)
    channel.ack(original, "late")
    gate.resolve()
    await until(() => channel.writes.length === 2)
    expect(channel.last.op).toBe("bind")
    expect(channel.last.sequence).toBe(2)
    channel.ack(channel.last, "new")
    expect(await queued).toBe("new")
    channel.onWrite = undefined
  })

  test("original terminal before sent control ACK cannot misroute ACK to new binding", async () => {
    const { channel, client } = await memory({ cancelGraceMs: 200 })
    const abort = new AbortController()
    const sent = failure(client.request(discover, abort.signal))
    const original = channel.last
    abort.abort()
    await sent
    await until(() => channel.last.op === "cancel")
    const control = channel.last
    const confirm = client.request({ op: "bind", args: { phase: "confirm" } })
    channel.ack(original, "old result")
    await until(() => channel.last.op === "bind" && channel.last.id !== original.id)
    const binding = channel.last
    channel.ack(control, "control only")
    channel.ack(binding, { bindingID: "new", bindingEpoch: "e2", appID: "app", launchEpoch: "launch" })
    expect(await confirm).toMatchObject({ bindingID: "new", bindingEpoch: "e2" })
    const next = client.request(read("new", "e2"))
    await until(() => channel.last.op === "read")
    channel.ack(channel.last, "new result")
    expect(await next).toBe("new result")
  })

  test("late successful cancelled confirm retires orphan guest binding before any queued operation", async () => {
    const { channel, client } = await memory({ cancelGraceMs: 200 })
    const reap = Promise.withResolvers<void>()
    channel.onTerminate = () => reap.promise
    const abort = new AbortController()
    const sent = failure(client.request({ op: "bind", args: { phase: "confirm" } }, abort.signal))
    const original = channel.last
    abort.abort()
    await sent
    await until(() => channel.last.op === "cancel")
    channel.ack(channel.last)
    const queued = failure(client.request(discover))
    channel.ack(original, { bindingID: "late", bindingEpoch: "e2", appID: "app", launchEpoch: "launch" })
    expect(await queued).toMatchObject({ code: "cancelled", outcome: "not-dispatched" })
    expect(await failure(client.request(read("late", "e2")))).toMatchObject({ code: "cancelled", outcome: "not-dispatched" })
    expect(channel.reaped).toBe(false)
    expect(channel.writes.length).toBe(2)
    reap.resolve()
    await client.close()
    expect(channel.reaped).toBe(true)
  })

  test("stuck cancellation retires; held reap never permits second provider operation", async () => {
    const { channel, client } = await memory({ cancelGraceMs: 30 })
    const reap = Promise.withResolvers<void>()
    channel.onTerminate = () => reap.promise
    channel.onWrite = (request) => { if (request.op === "cancel") channel.ack(request) }
    const sent = failure(client.request({ ...discover, timeoutMs: 10 }))
    const queued = failure(client.request(discover))
    const original = channel.last
    expect(await sent).toMatchObject({ code: "timeout", outcome: "unknown" })
    expect(await queued).toMatchObject({ code: "helper-unresponsive", outcome: "not-dispatched" })
    expect(channel.reaped).toBe(false)
    const closed = client.close()
    channel.ack(original, "too late")
    expect(channel.writes.map((request) => request.op)).toEqual(["bind", "cancel"])
    reap.resolve()
    await closed
    expect(channel.reaped).toBe(true)
    expect(channel.data.size + channel.exits.size).toBe(0)
  })

  test("dispatch revalidates binding after unbind control overtakes FIFO", async () => {
    const { channel, client } = await memory()
    await bind(client, channel)
    await bind(client, channel, "b")
    const first = client.request(read())
    const original = channel.last
    const stale = failure(client.request(read("b")))
    const unbind = client.request({ op: "unbind", args: {}, bindingID: "b", bindingEpoch: "e1" })
    await until(() => channel.last.op === "unbind")
    channel.ack(channel.last)
    await unbind
    channel.ack(original, "ok")
    await first
    await Bun.sleep(0)
    expect(channel.writes.filter((request) => request.op === "read").map((request) => request.bindingID)).toEqual(["a"])
    expect(await stale).toMatchObject({ code: "stale-binding", outcome: "not-dispatched" })
    await bind(client, channel, "b", "e2")
    expect(await failure(client.request(read("b", "e1")))).toMatchObject({ code: "stale-binding" })
    const current = client.request(read("b", "e2"))
    await until(() => channel.last.op === "read")
    channel.ack(channel.last, "new binding")
    expect(await current).toBe("new binding")
  })

  test("queued old epoch fails after earlier confirm replaces binding", async () => {
    const { channel, client } = await memory()
    await bind(client, channel)
    const first = client.request(read())
    const original = channel.last
    const confirm = client.request({ op: "bind", args: { phase: "confirm" } })
    const stale = failure(client.request(read()))
    channel.ack(original)
    await first
    await until(() => channel.last.op === "bind")
    channel.ack(channel.last, { bindingID: "a", bindingEpoch: "e2", appID: "app", launchEpoch: "launch" })
    await confirm
    expect(await stale).toMatchObject({ code: "stale-binding", outcome: "not-dispatched" })
    expect(channel.writes.length).toBe(3)
  })

  test("replayed original cannot resolve next request or next binding", async () => {
    const { channel, client } = await memory()
    await bind(client, channel)
    const first = client.request(read())
    const original = channel.last
    const next = failure(client.request({ op: "bind", args: { phase: "confirm" } }))
    channel.ack(original, "old")
    await first
    await until(() => channel.last.op === "bind")
    channel.ack(original, { bindingID: "a", bindingEpoch: "e2", appID: "app", launchEpoch: "launch" })
    expect(await next).toMatchObject({ code: "protocol-error", outcome: "unknown" })
    expect(await failure(client.request(read("a", "e2")))).toMatchObject({ code: "protocol-error", outcome: "not-dispatched" })
    expect(channel.writes.length).toBe(3)
  })

  test("abort before admission and queued abort/deadline consume no IDs or controls", async () => {
    const { channel, client } = await memory()
    const before = new AbortController()
    before.abort()
    expect(await failure(client.request(discover, before.signal))).toMatchObject({ code: "cancelled", outcome: "not-dispatched" })
    expect(channel.writes.length).toBe(0)
    const sent = client.request(discover)
    const original = channel.last
    const abort = new AbortController()
    const cancelled = failure(client.request(discover, abort.signal))
    const expired = failure(client.request({ ...discover, timeoutMs: 10 }))
    const next = client.request(discover)
    abort.abort()
    expect(await cancelled).toMatchObject({ code: "cancelled", outcome: "not-dispatched" })
    expect(await expired).toMatchObject({ code: "timeout", outcome: "not-dispatched" })
    expect(channel.writes.length).toBe(1)
    channel.ack(original)
    await sent
    await until(() => channel.writes.length === 2)
    channel.ack(channel.last, "next")
    expect(await next).toBe("next")
    expect(channel.writes.map((request) => request.id)).toEqual(["golden:1", "golden:2"])
  })

  test("abort inside synchronous write reserves correlation before cancel", async () => {
    const { channel, client } = await memory({ cancelGraceMs: 200 })
    const abort = new AbortController()
    channel.onWrite = (request) => {
      if (request.op === "bind") abort.abort()
      if (request.op === "cancel") channel.ack(request)
    }
    expect(await failure(client.request(discover, abort.signal))).toMatchObject({ code: "cancelled", outcome: "unknown" })
    await until(() => channel.writes.length === 2)
    expect(channel.last).toMatchObject({ op: "cancel", id: "golden:2", args: { requestID: "golden:1" } })
    channel.ack(channel.writes[0]!)
    channel.onWrite = undefined
  })

  test("abort after synchronous terminal removes listener and deadline", async () => {
    const { channel, client } = await memory({ timeoutMs: 10, cancelGraceMs: 20 })
    const abort = new AbortController()
    channel.onWrite = (request) => { if (request.op === "bind") channel.ack(request, "done") }
    expect(await client.request(discover, abort.signal)).toBe("done")
    expect(getEventListeners(abort.signal, "abort").length).toBe(0)
    abort.abort()
    await Bun.sleep(25)
    expect(channel.writes.length).toBe(1)
    expect(channel.terminations).toBe(0)
  })

  test("queued aborted unbind never invalidates binding or consumes sequence", async () => {
    const { channel, client } = await memory()
    await bind(client, channel)
    const gate = Promise.withResolvers<void>()
    channel.onWrite = () => gate.promise
    const first = client.request(read())
    const original = channel.last
    const abort = new AbortController()
    const unbind = failure(client.request({ op: "unbind", args: {}, bindingID: "a", bindingEpoch: "e1" }, abort.signal))
    abort.abort()
    expect(await unbind).toMatchObject({ code: "cancelled", outcome: "not-dispatched" })
    expect(getEventListeners(abort.signal, "abort").length).toBe(0)
    const next = client.request(read())
    channel.ack(original)
    await first
    gate.resolve()
    await until(() => channel.writes.length === 3)
    expect(channel.last).toMatchObject({ op: "read", sequence: 3, bindingEpoch: "e1" })
    channel.ack(channel.last)
    await next
    channel.onWrite = undefined
  })

  test("pending limit bounds semantics; separate control lane stays usable", async () => {
    const { channel, client } = await memory({ cancelGraceMs: 300 })
    const gate = Promise.withResolvers<void>()
    channel.onWrite = () => gate.promise
    const work = Array.from({ length: 32 }, () => failure(client.request(discover)))
    expect(await failure(client.request(discover))).toMatchObject({ code: "pending-limit", outcome: "not-dispatched" })
    const controls = Array.from({ length: 32 }, () => failure(client.request({ op: "cancel", args: { requestID: channel.writes[0]!.id } })))
    expect(await failure(client.request({ op: "cancel", args: { requestID: channel.writes[0]!.id } }))).toMatchObject({ code: "pending-limit", outcome: "not-dispatched" })
    channel.exit({ code: 1 })
    const errors = await Promise.all(work)
    expect(errors[0]!.outcome).toBe("unknown")
    expect(errors.slice(1).every((error) => error.outcome === "not-dispatched")).toBe(true)
    expect((await Promise.all(controls)).every((error) => error.outcome === "not-dispatched")).toBe(true)
    gate.resolve()
    expect(channel.writes.length).toBe(1)
  })

  test("queued arguments snapshot prevents caller scope mutation", async () => {
    const { channel, client } = await memory()
    const first = client.request(discover)
    const original = channel.last
    const call: NativeDockProtocol.Call = { op: "bind", args: { phase: "discover", marker: "original" } }
    const queued = client.request(call)
    call.args.marker = "changed"
    call.op = "shutdown"
    channel.ack(original)
    await first
    await until(() => channel.writes.length === 2)
    expect(channel.last).toMatchObject({ op: "bind", args: { marker: "original" } })
    channel.ack(channel.last)
    await queued
  })

  test("oversized admission, invalid scope and invalid deadlines never serialize", async () => {
    const { channel, client } = await memory()
    expect(await failure(client.request({ op: "bind", args: { phase: "discover", payload: "🧪".repeat(70000) } }))).toMatchObject({ code: "invalid-request", outcome: "not-dispatched" })
    expect(await failure(client.request(read()))).toMatchObject({ code: "stale-binding", outcome: "not-dispatched" })
    expect(await failure(client.request({ ...discover, bindingID: "foreign", bindingEpoch: "epoch" }))).toMatchObject({ code: "wrong-scope" })
    expect(await failure(client.request({ op: "cancel", args: { requestID: "foreign:1" } }))).toMatchObject({ code: "wrong-scope" })
    expect(await failure(client.request({ ...discover, timeoutMs: Number.NaN }))).toMatchObject({ code: "invalid-request" })
    expect(channel.writes.length).toBe(0)
    const bounded = client.request({ ...discover, timeoutMs: 10001 })
    expect(channel.last.timeoutMs).toBeLessThanOrEqual(10000)
    channel.ack(channel.last)
    await bounded
  })

  test("malformed confirm reply invalidates binding and queued semantics", async () => {
    const { channel, client } = await memory()
    const confirm = failure(client.request({ op: "bind", args: { phase: "confirm" } }))
    const queued = failure(client.request(discover))
    channel.ack(channel.last, { bindingID: "a", bindingEpoch: "e1" })
    expect(await confirm).toMatchObject({ code: "protocol-error", outcome: "unknown" })
    expect(await queued).toMatchObject({ code: "protocol-error", outcome: "not-dispatched" })
    expect(channel.writes.length).toBe(1)
  })

  test("remote protocol error preserves terminal evidence and retires queued work", async () => {
    const { channel, client } = await memory()
    const sent = failure(client.request(discover))
    const queued = failure(client.request(discover))
    channel.emit({ v: 1, id: channel.last.id, ok: false, error: { code: "protocol-error", message: "Invalid request", outcome: "not-dispatched", result: { dispatch: "rejected" } } })
    expect(await sent).toMatchObject({ code: "protocol-error", outcome: "not-dispatched", result: { dispatch: "rejected" } })
    expect(await queued).toMatchObject({ code: "protocol-error", outcome: "not-dispatched" })
    expect(channel.writes.length).toBe(1)
  })

  test("binding cache rejects helper overflow instead of growing without bound", async () => {
    const { channel, client } = await memory()
    for (const bindingID of Array.from({ length: 8 }, (_, index) => `b${index}`)) await bind(client, channel, bindingID)
    const overflow = failure(client.request({ op: "bind", args: { phase: "confirm" } }))
    await until(() => channel.writes.length === 9)
    channel.ack(channel.last, { bindingID: "b8", bindingEpoch: "e1", appID: "app", launchEpoch: "launch" })
    expect(await overflow).toMatchObject({ code: "protocol-error", outcome: "unknown" })
    expect(channel.terminations).toBe(1)
  })

  test("shutdown blocked by backpressure still has bounded deadline and reaps", async () => {
    const { channel, client } = await memory({ cancelGraceMs: 15 })
    const gate = Promise.withResolvers<void>()
    channel.onWrite = () => gate.promise
    const sent = failure(client.request(discover))
    const closed = client.close()
    expect(await sent).toMatchObject({ code: "client-closed", outcome: "unknown" })
    await closed
    gate.resolve()
    expect(channel.writes.map((request) => request.op)).toEqual(["bind"])
    expect(channel.reaped).toBe(true)
    expect(channel.data.size + channel.exits.size).toBe(0)
  })

  test("close shutdown overtakes queued semantics and waits for reaping", async () => {
    const { channel, client } = await memory({ cancelGraceMs: 200 })
    const reap = Promise.withResolvers<void>()
    channel.onTerminate = () => reap.promise
    const sent = failure(client.request(discover))
    const queued = failure(client.request(discover))
    const closed = client.close()
    expect(await sent).toMatchObject({ code: "client-closed", outcome: "unknown" })
    expect(await queued).toMatchObject({ code: "client-closed", outcome: "not-dispatched" })
    await until(() => channel.terminations === 1)
    expect(channel.reaped).toBe(false)
    expect(channel.writes.map((request) => request.op)).toEqual(["bind", "shutdown"])
    expect(client.close()).toBe(closed)
    reap.resolve()
    await closed
    expect(channel.reaped).toBe(true)
    expect(channel.data.size + channel.exits.size).toBe(0)
  })

  test("reentrant close from synchronous shutdown write shares teardown", async () => {
    const { channel, client } = await memory()
    channel.autoShutdown = false
    const nested: Promise<void>[] = []
    channel.onWrite = (request) => {
      if (request.op !== "shutdown") return
      nested.push(client.close())
      channel.ack(request)
    }
    const closed = client.close()
    expect(nested[0]).toBe(closed)
    await closed
    expect(channel.writes.map((request) => request.op)).toEqual(["shutdown"])
    expect(channel.terminations).toBe(1)
  })
})

