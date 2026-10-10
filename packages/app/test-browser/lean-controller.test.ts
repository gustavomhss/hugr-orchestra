import { expect, test } from "bun:test"
import type { LeanDashboard } from "@orchestra/schema/lean-dashboard"
import { createLeanController, LeanResponseError } from "../src/orchestra/chapters/lean-controller"

const savings = { bytesSaved: 800, tokensSaved: 200, calls: 2, tokenCalls: 2 }
const info = (directory: string, enabled = true): LeanDashboard.Info => ({
  scope: { directory, projectID: "same-project", profileID: directory },
  engine: "test-engine", enabled, coverage: "saved-profile-history", complete: true, savings,
  items: [{ id: "cargo", enabled, savings }, { id: "pytest", enabled: true, savings }],
})
const detail = (directory: string, itemID: LeanDashboard.History["itemID"]): LeanDashboard.History => ({
  scope: info(directory).scope, itemID, complete: false,
  executions: [{ sessionID: "session", messageID: "message", partID: "part", callID: "call", itemID,
    command: "cargo test --package 'actual input'", commandTruncated: false, status: "error", exit: 1,
    time: 10, bytesSaved: null, tokensSaved: null }],
})
function fixture(directory = "/one") {
  const source = {
    data: info(directory),
    read: async (_signal?: AbortSignal) => source.data,
    update: async (_value: LeanDashboard.Update, _signal?: AbortSignal) => source.data,
    history: async (itemID: LeanDashboard.History["itemID"], _signal?: AbortSignal) => detail(directory, itemID),
  }
  const controller = createLeanController((error) => ({
    message: error instanceof Error ? error.message : "request failed", unavailable: error === "unsupported",
  }))
  return { source, controller, owner: { server: "server-a", directory, transport: source } }
}

test("same-project profile switch rejects late old read, write and history; server keys also partition owners", async () => {
  const f = fixture()
  const read = Promise.withResolvers<LeanDashboard.Info>()
  const write = Promise.withResolvers<LeanDashboard.Info>()
  const history = Promise.withResolvers<LeanDashboard.History>()
  const signals: AbortSignal[] = []
  await f.controller.select(f.owner)
  f.source.read = (signal) => { signals.push(signal!); return read.promise }
  f.source.update = (_value, signal) => { signals.push(signal!); return write.promise }
  f.source.history = (_item, signal) => { signals.push(signal!); return history.promise }
  const old = [f.controller.refresh(), f.controller.update({ enabled: false }), f.controller.history("cargo")]
  const next = fixture("/two")
  await f.controller.select(next.owner)
  expect(signals.every((signal) => signal.aborted)).toBe(true)
  expect(f.controller.state.data?.scope.projectID).toBe("same-project")
  read.resolve(info("/one", false)); write.resolve(info("/one", false)); history.resolve(detail("/one", "cargo"))
  await Promise.all(old)
  expect(f.controller.state.data).toEqual(info("/two"))
  expect(f.controller.state.error).toBeUndefined()
  expect(f.controller.state.history).toBeUndefined()
  expect(f.controller.state.pending.size).toBe(0)
  await f.controller.select({ ...next.owner, server: "server-b" })
  expect(f.controller.state.key).toBe("server-b\0/two")
  f.controller.dispose()
})

test("response scope guard covers GET, PATCH and history; pathKey accepts native trailing slash normalization", async () => {
  const f = fixture("C:\\repo\\")
  f.source.data = info("C:/repo")
  await f.controller.select(f.owner)
  expect(f.controller.state.data).toEqual(info("C:/repo"))
  f.source.data = info("/foreign")
  await f.controller.refresh()
  expect(f.controller.state.error).toBe(new LeanResponseError("scope").message)
  expect(f.controller.state.data).toEqual(info("C:/repo"))
  await f.controller.update({ itemID: "cargo", enabled: false })
  expect(f.controller.state.error).toBe("scope")
  expect(f.controller.state.data).toEqual(info("C:/repo"))
  f.source.history = async (itemID) => detail("/foreign", itemID)
  await f.controller.history("cargo")
  expect(f.controller.state.historyError).toBe("scope")
  expect(f.controller.state.history).toBeUndefined()
  f.controller.dispose()
})

test("independent pending lanes confirm only HTTP snapshots and reconcile actual settings and earned savings", async () => {
  const f = fixture()
  await f.controller.select(f.owner)
  const cargo = Promise.withResolvers<LeanDashboard.Info>()
  const master = Promise.withResolvers<LeanDashboard.Info>()
  const sent: LeanDashboard.Update[] = []
  f.source.update = (value) => { sent.push(value); return value.itemID ? cargo.promise : master.promise }
  const writes = [f.controller.update({ itemID: "cargo", enabled: false }), f.controller.update({ enabled: false })]
  await f.controller.update({ itemID: "cargo", enabled: true })
  expect(sent).toEqual([{ itemID: "cargo", enabled: false }, { enabled: false }])
  expect([...f.controller.state.pending]).toEqual(["cargo", "profile"])
  expect(f.controller.state.data?.enabled).toBe(true)
  const confirmed = { ...info("/one", false), items: [{ id: "cargo" as const, enabled: false, savings }, info("/one").items[1]!] }
  f.source.data = confirmed
  master.resolve(confirmed)
  await writes[1]
  expect([...f.controller.state.pending]).toEqual(["cargo"])
  cargo.resolve(info("/one"))
  await writes[0]
  expect(f.controller.state.data).toEqual(confirmed)
  expect(f.controller.state.pending.size).toBe(0)
  f.controller.dispose()
})

test("history switches clear old commands; same-item failure keeps actual history; wrong item rejected", async () => {
  const f = fixture()
  await f.controller.select(f.owner)
  await f.controller.history("cargo")
  const actual = detail("/one", "cargo")
  expect(f.controller.state.history).toEqual(actual)
  f.source.history = async () => { throw new Error("history denied") }
  await f.controller.history("cargo")
  expect(f.controller.state.history).toEqual(actual)
  expect(f.controller.state.historyError).toBe("history denied")
  const late = Promise.withResolvers<LeanDashboard.History>()
  f.source.history = () => late.promise
  const pending = f.controller.history("cargo")
  f.source.history = async () => actual
  const changed = f.controller.history("pytest")
  expect(f.controller.state.history).toBeUndefined()
  await changed
  late.resolve(actual); await pending
  expect(f.controller.state.history).toBeUndefined()
  expect(f.controller.state.historyError).toBe("history")
  f.controller.dispose()
})

test("unsupported resets unknown and blocks writes; ordinary failures preserve data; disposal aborts late requests", async () => {
  const f = fixture()
  await f.controller.select(f.owner)
  f.source.update = async () => { throw new Error("write denied") }
  await f.controller.update({ enabled: false })
  expect(f.controller.state.data).toEqual(info("/one"))
  expect(f.controller.state.error).toBe("write denied")
  await f.controller.history("cargo")
  f.source.read = async () => { throw "unsupported" }
  await f.controller.refresh()
  expect(f.controller.state.data).toBeUndefined()
  expect(f.controller.state.history).toBeUndefined()
  let writes = 0
  f.source.update = async () => { writes++; return info("/one") }
  await f.controller.update({ enabled: true })
  expect(writes).toBe(0)
  f.source.read = async () => info("/one", false)
  await f.controller.refresh()
  expect(f.controller.state.data?.enabled).toBe(false)
  const late = Promise.withResolvers<LeanDashboard.Info>()
  let signal: AbortSignal | undefined
  f.source.read = (value) => { signal = value; return late.promise }
  const pending = f.controller.refresh()
  f.controller.dispose()
  expect(signal?.aborted).toBe(true)
  late.resolve(info("/one")); await pending
  expect(f.controller.state.data?.enabled).toBe(false)
})
