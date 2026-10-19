import { expect, test } from "bun:test"
import { AppDockNativeWorkspace } from "./app-dock-native-workspace"
import { rejection } from "./rejection.fixture"

type Runtime = Parameters<typeof AppDockNativeWorkspace.create>[0]
type Scope = Awaited<ReturnType<Runtime["workspaceScope"]>>
type Resource = Awaited<ReturnType<Runtime["native"]>>
type Preparation = ReturnType<typeof AppDockNativeWorkspace.create>
type Prepared = Awaited<ReturnType<Preparation>>

test("pre-aborted preparation performs neither a census nor helper acquisition", async () => {
  const f = fixture()
  expect(f.calls).toEqual([])
  f.controller.abort()

  expect(await rejection(f.prepare())).toMatchObject({
    name: "NativeError", backend: "linux-atspi", code: "cancelled", outcome: "not-dispatched",
  })
  expect(f.calls).toEqual([])
})

test("a failed initial census is ownership-unresolved and leaves no helper to acquire or clean up", async () => {
  const f = fixture()
  f.producer.workspaceScope = async () => { throw new Error("Private census producer failure") }

  expect(await rejection(f.prepare())).toMatchObject({
    name: "NativeError", backend: "linux-atspi", code: "ownership-unresolved", outcome: "not-dispatched",
    message: "Native workspace process evidence is unavailable", cleanup: undefined,
  })
  await Bun.sleep(0)
  expect(f.calls).toEqual(["census"])
})

test("cancellation while the initial census is pending prevents helper acquisition", async () => {
  const f = fixture()
  const census = Promise.withResolvers<Scope>()
  f.producer.workspaceScope = () => census.promise
  const preparing = f.prepare()
  expect(f.calls).toEqual(["census"])

  f.controller.abort()
  census.resolve(f.scope)
  expect(await rejection(preparing)).toMatchObject({ code: "cancelled", outcome: "not-dispatched" })
  expect(f.calls).toEqual(["census"])
})

test.each(["runtimeID", "runtimeEpoch"] as const)("captured placement %s mismatch prevents acquisition", async (field) => {
  const f = fixture()
  f.placement[field] = "stale-placement"

  expect(await rejection(f.prepare())).toMatchObject({ code: "wrong-scope", outcome: "not-dispatched" })
  expect(f.calls).toEqual(["census"])
})

test("workspace target snapshots the complete canonical census before acquiring the helper", async () => {
  const f = fixture()
  const captured = structuredClone(f.scope)
  f.producer.native = async () => {
    f.scope.processIdentities[0]!.startTicks += 1
    f.scope.processIdentities.pop()
    return f.resource
  }

  const prepared = await f.prepare()
  expect(prepared.client).toBe(f.client)
  expect(prepared.target).toStrictEqual({
    scopeKind: "workspace", appID: "workspace", launchEpoch: "session-1", ownershipRevision: 0,
    runtime: captured.runtime, processIdentities: captured.processIdentities,
  })
  expect(prepared.target.runtime).not.toBe(f.resource.runtime)
  expect(prepared.target.processIdentities).not.toBe(f.scope.processIdentities)
  expect(prepared.target.processIdentities[0]).not.toBe(f.scope.processIdentities[0])
  expect(f.calls).toEqual(["census", "acquire"])

  f.resource.runtime.runtimeEpoch = "later-epoch"
  expect(prepared.target.runtime).toStrictEqual(captured.runtime)
})

test("cancellation during native acquisition returns the owned client for caller cleanup", async () => {
  const f = fixture()
  const entered = Promise.withResolvers<void>()
  const acquired = Promise.withResolvers<Resource>()
  f.producer.native = () => {
    entered.resolve()
    return acquired.promise
  }
  const preparing = f.prepare()
  await entered.promise
  expect(f.calls).toEqual(["census", "acquire"])

  f.controller.abort()
  acquired.resolve(f.resource)
  const prepared = await preparing
  expect(prepared.client).toBe(f.client)
  expect(prepared.target.runtime).toStrictEqual(f.resource.runtime)
  expect(f.calls).toEqual(["census", "acquire"])

  await prepared.client.close()
  expect(f.calls).toEqual(["census", "acquire", "close"])
})

test.each(["runtimeID", "runtimeEpoch", "accessibilitySessionID"] as const)(
  "acquisition-time %s drift remains visible in the target and blocks confirmation before another census",
  async (field) => {
    const f = fixture()
    f.producer.native = async () => {
      f.resource.runtime[field] = "replacement-runtime"
      return f.resource
    }

    const prepared = await f.prepare()
    expect(prepared.client).toBe(f.client)
    expect(prepared.target.runtime).toStrictEqual(f.resource.runtime)
    expect(prepared.target.runtime[field]).not.toBe(f.scope.runtime[field])
    expect(prepared.target.launchEpoch).toBe(f.resource.runtime.accessibilitySessionID)
    expect(f.placement).toStrictEqual({ runtimeID: "runtime-1", runtimeEpoch: "epoch-1", ready: true })
    expect(f.calls).toEqual(["census", "acquire"])

    expect(await rejection(prepared.confirm(f.proposal))).toMatchObject({ code: "wrong-scope", outcome: "not-dispatched" })
    expect(f.calls).toEqual(["census", "acquire"])
    await prepared.client.close()
    expect(f.calls).toEqual(["census", "acquire", "close"])
  },
)

test("confirmation rechecks an equal census and returns every proposed root with only owner and path", async () => {
  const f = fixture()
  const prepared = await f.prepare()
  f.producer.workspaceScope = async () => structuredClone(f.scope)
  f.proposal.roots.forEach((root) => {
    Object.defineProperties(root, Object.fromEntries(["name", "role", "pid", "title", "windowID"].map((field) => [field, {
      get: () => { throw new Error(`Root authorization must not infer ownership from ${field}`) },
    }])))
  })

  const roots = await prepared.confirm(f.proposal)
  expect(roots).toStrictEqual([
    { owner: ":1.900", path: "/org/a11y/atspi/accessible/root" },
    { owner: ":1.900", path: "/org/a11y/atspi/accessible/panel" },
    { owner: ":1.901", path: "/org/a11y/atspi/accessible/root" },
  ])
  roots.forEach((root, index) => expect(root).not.toBe(f.proposal.roots[index]))
  expect(f.calls).toEqual(["census", "acquire", "census"])
})

const changes: Array<[string, (scope: Scope) => void]> = [
  ["runtime ID", (scope) => { scope.runtime.runtimeID = "replacement-runtime" }],
  ["runtime epoch", (scope) => { scope.runtime.runtimeEpoch = "replacement-epoch" }],
  ["accessibility session", (scope) => { scope.runtime.accessibilitySessionID = "replacement-session" }],
  ["second process PID", (scope) => { scope.processIdentities[1]!.pid += 1 }],
  ["second process start time with the same PID", (scope) => { scope.processIdentities[1]!.startTicks += 1 }],
  ["boot ID", (scope) => { scope.processIdentities.forEach((process) => { process.bootID = "replacement-boot" }) }],
  ["PID namespace", (scope) => { scope.processIdentities.forEach((process) => { process.pidNamespace = "pid:[99]" }) }],
  ["mount namespace", (scope) => { scope.processIdentities.forEach((process) => { process.mountNamespace = "mnt:[99]" }) }],
  ["added process", (scope) => { scope.processIdentities.push({ ...scope.processIdentities[1]!, pid: 88, startTicks: 999 }) }],
  ["removed process", (scope) => { scope.processIdentities.pop() }],
]

test.each(changes)("confirmation rejects census drift in %s", async (_name, change) => {
  const f = fixture()
  const prepared = await f.prepare()
  const fresh = structuredClone(f.scope)
  change(fresh)
  f.producer.workspaceScope = async () => fresh

  expect(await rejection(prepared.confirm(f.proposal))).toMatchObject({ code: "wrong-scope", outcome: "not-dispatched" })
  expect(f.calls).toEqual(["census", "acquire", "census"])
})

test("pre-aborted confirmation does not take another census", async () => {
  const f = fixture()
  const prepared = await f.prepare()
  f.controller.abort()

  expect(await rejection(prepared.confirm(f.proposal))).toMatchObject({ code: "cancelled", outcome: "not-dispatched" })
  expect(f.calls).toEqual(["census", "acquire"])
})

test("cancellation during the confirmation census rejects otherwise matching roots", async () => {
  const f = fixture()
  const prepared = await f.prepare()
  const census = Promise.withResolvers<Scope>()
  f.producer.workspaceScope = () => census.promise
  const confirming = prepared.confirm(f.proposal)
  expect(f.calls).toEqual(["census", "acquire", "census"])

  f.controller.abort()
  census.resolve(structuredClone(f.scope))
  expect(await rejection(confirming)).toMatchObject({ code: "cancelled", outcome: "not-dispatched" })
  expect(f.calls).toEqual(["census", "acquire", "census"])
})

function fixture() {
  const scope: Scope = {
    runtime: { runtimeID: "runtime-1", runtimeEpoch: "epoch-1", accessibilitySessionID: "session-1" },
    processIdentities: [
      { pid: 42, startTicks: 123, bootID: "boot", pidNamespace: "pid:[1]", mountNamespace: "mnt:[2]" },
      { pid: 77, startTicks: 789, bootID: "boot", pidNamespace: "pid:[1]", mountNamespace: "mnt:[2]" },
    ],
  }
  const calls: string[] = []
  const client: Prepared["client"] = {
    get hello(): Prepared["client"]["hello"] { throw new Error("Preparation must not inspect the helper hello") },
    request: async () => {
      calls.push("request")
      throw new Error("Preparation must not dispatch helper discovery")
    },
    close: async () => { calls.push("close") },
  }
  // This external producer fixture models only the ownership handoff. It does not exercise NativeClient, RPC cleanup, or Gio.
  const resource = { runtime: { ...scope.runtime }, client } as unknown as Resource
  const producer = {
    workspaceScope: async () => scope,
    native: async () => resource,
  }
  const runtime: Runtime = {
    workspaceScope: () => { calls.push("census"); return producer.workspaceScope() },
    native: () => { calls.push("acquire"); return producer.native() },
  }
  const identity: Parameters<Preparation>[0] = { senderID: 1, tabID: "linux-workspace", generation: 2, profileID: "profile" }
  const placement = { runtimeID: "runtime-1", runtimeEpoch: "epoch-1", ready: true }
  const controller = new AbortController()
  const prepare = AppDockNativeWorkspace.create(runtime)
  const proposal: Parameters<Prepared["confirm"]>[0] = {
    status: "proposal", proposalID: "workspace-query",
    roots: [
      { owner: ":1.900", path: "/org/a11y/atspi/accessible/root", name: "Shared title", role: 75 },
      { owner: ":1.900", path: "/org/a11y/atspi/accessible/panel", name: "Shared title", role: 1 },
      { owner: ":1.901", path: "/org/a11y/atspi/accessible/root", name: "", role: 0 },
    ],
  }
  return { scope, calls, client, resource, producer, placement, controller, proposal,
    prepare: () => prepare(identity, placement, controller.signal) }
}
