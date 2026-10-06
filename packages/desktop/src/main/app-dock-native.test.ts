import { afterEach, expect, spyOn, test } from "bun:test"
import type { DockIdentity } from "./app-dock-native"
import { NativeDockProtocol } from "./app-dock-native-protocol"
import { NativeDockClient } from "./app-dock-native-client"
import { BoundaryClient, WireChannel, closeDocks, confirm, deferred, fixture, identity, occupancy, root, target, turn, wireFixture, workspaceFixture, workspaceIdentity, workspaceTarget } from "./app-dock-native.fixture"

afterEach(closeDocks)

test("reservation: last free unit admits one concurrent claimant and ordinary bind counts reservations", async () => {
  const f = fixture()
  const reservations = Array.from({ length: 31 }, () => f.dock.reserveClient())
  try {
    const claims = await Promise.allSettled([Promise.resolve().then(() => f.dock.reserveClient()), Promise.resolve().then(() => f.dock.reserveClient())])
    claims.forEach((claim) => { if (claim.status === "fulfilled") reservations.push(claim.value) })
    expect(claims.map((claim) => claim.status)).toEqual(["fulfilled", "rejected"])
    expect(claims[1]).toMatchObject({ status: "rejected", reason: { code: "capacity" } })
    await expect(f.dock.bind(identity(), target(), f.client, confirm)).rejects.toMatchObject({ code: "capacity" })
    expect(f.client.calls).toEqual([])
  } finally {
    reservations.forEach((reservation) => reservation.fail(new NativeDockProtocol.NativeError("cancelled", "No acquisition")))
    await Promise.allSettled(reservations.map((reservation) => reservation.completion))
  }
  await f.dock.bind(identity(), target(), f.client, confirm)
  expect(f.dock.has(identity())).toBe(true)
})

test("reservation: unknown acquisition failure stays accounted until actual adopted cleanup succeeds", async () => {
  const f = fixture()
  const failed = f.dock.reserveClient()
  const error = new Error("Acquisition cleanup is unknown")
  failed.fail(error)
  await expect(failed.completion).rejects.toBe(error)
  const others = Array.from({ length: 31 }, () => f.dock.reserveClient())
  try {
    expect(() => f.dock.reserveClient()).toThrow("Native client cleanup capacity exhausted")
  } finally {
    others.forEach((reservation) => reservation.fail(new NativeDockProtocol.NativeError("cancelled", "No acquisition")))
    await Promise.allSettled(others.map((reservation) => reservation.completion))
    failed.adopt(f.client)
    await f.dock.releaseUnused(f.client)
    failed.complete()
  }
  expect(f.client.closed).toBe(1)
  await expect(failed.completion).rejects.toBe(error)
  await expect(f.dock.reset()).resolves.toBeUndefined()
})

test("P1 cleanup: no-dispatch primary with unknown cleanup retains its reservation", async () => {
  const f = fixture()
  const failed = f.dock.reserveClient()
  const error = new NativeDockProtocol.NativeError("not-ready", "Acquisition failed", "not-dispatched", undefined,
    { code: "native-cleanup-failed", outcome: "unknown" })
  failed.fail(error)
  await expect(failed.completion).rejects.toBe(error)
  const others = Array.from({ length: 31 }, () => f.dock.reserveClient())
  try {
    expect(() => others.push(f.dock.reserveClient())).toThrow("Native client cleanup capacity exhausted")
  } finally {
    others.forEach((reservation) => reservation.fail(new NativeDockProtocol.NativeError("cancelled", "No acquisition")))
    await Promise.allSettled(others.map((reservation) => reservation.completion))
    await Promise.resolve().then(() => failed.adopt(f.client)).then(async () => {
      await f.dock.releaseUnused(f.client)
      failed.complete()
    }).catch(() => {})
  }
  expect(f.client.closed).toBe(1)
  await expect(failed.completion).rejects.toBe(error)
})

test("scope: legacy application identities and targets normalize without a scope-capable hello", async () => {
  const f = fixture()
  expect(f.dock.metadata(identity())).toEqual({ backend: "linux-atspi", scopeKind: "application", nativeReadiness: "unbound" })
  await f.dock.bind({ ...identity(), scopeKind: "application" }, target(), f.client, confirm)
  expect(f.client.calls[0].args.target).toEqual({ ...target(), scopeKind: "application" })
  expect(f.dock.has(identity())).toBe(true)
  expect(f.dock.metadata(identity())).toEqual({ backend: "linux-atspi", scopeKind: "application", nativeReadiness: "bound",
    helperEpoch: "helper", sessionID: "session" })
  await expect(f.dock.dispatch("read", identity(), {})).resolves.toMatchObject({ backend: "linux-atspi" })
  await f.dock.unbind(identity())
  expect(f.dock.metadata(identity())).toEqual({ backend: "linux-atspi", scopeKind: "application", nativeReadiness: "unbound" })
})

test("rebind: invalid target and unsupported helper cannot touch the old workspace slot", async () => {
  const f = workspaceFixture(["application", "workspace"])
  await f.dock.bind(workspaceIdentity(), workspaceTarget(), f.client, confirm)
  const incompatible = new BoundaryClient()
  await expect(f.dock.rebindWorkspace(workspaceIdentity(), workspaceTarget(), incompatible, confirm)).rejects.toMatchObject({ code: "unsupported-scope" })
  await expect(f.dock.rebindWorkspace(workspaceIdentity(), { ...workspaceTarget(), processIdentities: [] }, f.client, confirm)).rejects.toMatchObject({ code: "ownership-unresolved" })
  await expect(f.dock.rebindWorkspace({ ...workspaceIdentity(), scopeKind: "application" }, { ...workspaceTarget(), scopeKind: "application" }, f.client, confirm)).rejects.toMatchObject({ code: "wrong-scope" })
  const invalid = { hello: f.client.hello, request: undefined, close: () => f.client.close() } as unknown as NativeDockProtocol.Client
  await expect(f.dock.rebindWorkspace(workspaceIdentity(), workspaceTarget(), invalid, confirm)).rejects.toMatchObject({ code: "protocol-error" })
  expect(f.client.calls.map((call) => call.op)).toEqual(["bind", "bind"])
  expect(incompatible.calls).toEqual([])
  expect(f.dock.has(workspaceIdentity())).toBe(true)
  expect(f.client.closed).toBe(0)
})

test("rebind: explicit workspace rebind changes profile/runtime at eight slots without weakening ordinary bind", async () => {
  const channel = new WireChannel()
  channel.scopeKinds = ["application", "workspace"]
  channel.appID = "workspace"
  channel.launchEpoch = "session"
  const f = await wireFixture({}, channel)
  const ids = Array.from({ length: 8 }, (_, index) => ({ ...workspaceIdentity(), tabID: `slot-${index}` }))
  const bindings = await Promise.all(ids.map((id) => f.dock.bind(id, workspaceTarget(), f.client, confirm)))
  const next = { ...ids[0]!, profileID: "other", runtimeID: "other", runtimeEpoch: "next" }
  const proof = { ...workspaceTarget(), runtime: { ...workspaceTarget().runtime, runtimeID: "other", runtimeEpoch: "next" } }
  await expect(f.dock.bind(next, proof, f.client, confirm)).rejects.toMatchObject({ code: "wrong-scope" })
  const binding = await f.dock.rebindWorkspace(next, proof, f.client, confirm)
  expect(binding.bindingID).not.toBe(bindings[0]!.bindingID)
  expect(f.dock.has(next)).toBe(true)
  expect(() => f.dock.has(ids[0]!)).toThrow("Native registration belongs to another scope")
  expect(occupancy(f.dock)).toEqual({ slots: 8, clients: 1, retiring: 0, cleanups: 0, controlClients: 0, maxControls: 0 })
  await expect(f.dock.bind({ ...next, tabID: "overflow" }, proof, f.client, confirm)).rejects.toMatchObject({ code: "capacity" })
  expect(channel.requests.filter((request) => request.op === "unbind").map((request) => request.bindingID)).toEqual([bindings[0]!.bindingID])
  expect(channel.terminating).toBe(0)
})

test("rebind: pending predecessor chains remain bounded and only the newest registration survives", async () => {
  const f = workspaceFixture(["application", "workspace"])
  await f.dock.bind(workspaceIdentity(), workspaceTarget(), f.client, confirm)
  const release = Promise.withResolvers<NativeDockProtocol.JSONValue>()
  const reply = f.client.reply!
  f.client.reply = (call, signal) => call.op === "unbind" ? release.promise : reply(call, signal)
  const work = Array.from({ length: 32 }, () => f.dock.rebindWorkspace(workspaceIdentity(), workspaceTarget(), f.client, confirm)
    .then((binding) => ({ binding }), (error: unknown) => ({ error })))
  try {
    await expect(f.dock.rebindWorkspace(workspaceIdentity(), workspaceTarget(), f.client, confirm)).rejects.toMatchObject({ code: "capacity" })
    expect(f.client.calls.filter((call) => call.op === "bind")).toHaveLength(2)
    release.resolve({ unbound: true })
    const settled = await Promise.all(work)
    expect(settled.slice(0, -1).every((result) => "error" in result && result.error instanceof NativeDockProtocol.NativeError && result.error.code === "cancelled")).toBe(true)
    expect(settled.at(-1)).toHaveProperty("binding")
    expect(f.dock.has(workspaceIdentity())).toBe(true)
    expect(f.client.closed).toBe(0)
  } finally {
    release.resolve({ unbound: true })
    await Promise.all(work)
  }
})

test.each(["", "desktop", null, 1])("scope: unknown kind %j rejects before discovery", async (value) => {
  const f = fixture()
  const invalid = value as unknown as NativeDockProtocol.ScopeKind
  await expect(f.dock.bind({ ...identity(), scopeKind: invalid }, target(), f.client, confirm)).rejects.toMatchObject({ code: "wrong-scope" })
  await expect(f.dock.bind(identity(), { ...target(), scopeKind: invalid }, f.client, confirm)).rejects.toMatchObject({ code: "wrong-scope" })
  expect(() => f.dock.metadata({ ...identity(), scopeKind: invalid })).toThrow(NativeDockProtocol.NativeError)
  expect(f.client.calls).toEqual([])
  await f.dock.bind(identity(), target(), f.client, confirm)
  expect(f.client.calls.map((call) => call.args.phase)).toEqual(["discover", "confirm"])
})

test.each([
  ["application", "workspace"], ["workspace", "application"], [undefined, "workspace"], ["workspace", undefined],
] as const)("scope: identity %s cannot bind target %s", async (identityKind, targetKind) => {
  const f = workspaceFixture(["application", "workspace"])
  await expect(f.dock.bind({ ...workspaceIdentity(), scopeKind: identityKind },
    { ...workspaceTarget(), scopeKind: targetKind }, f.client, confirm)).rejects.toMatchObject({ code: "wrong-scope", outcome: "not-dispatched" })
  expect(f.client.calls).toEqual([])
})

test.each(["application", "workspace"] as const)("scope: captured %s cannot flip kind with identical realm and ref", async (kind) => {
  const f = workspaceFixture(["application", "workspace"])
  const current = { ...workspaceIdentity(), scopeKind: kind }
  const proof = { ...workspaceTarget(), scopeKind: kind }
  await f.dock.bind(current, proof, f.client, confirm)
  await f.dock.dispatch("click", current, { ref: "n:current" })
  const foreign = { ...current, scopeKind: kind === "application" ? "workspace" as const : undefined }
  expect(() => f.dock.has(foreign)).toThrow("Native registration belongs to another scope")
  expect(() => f.dock.metadata(foreign)).toThrow("Native registration belongs to another scope")
  await expect(f.dock.dispatch("click", foreign, { ref: "n:current" })).rejects.toMatchObject({ code: "wrong-scope", outcome: "not-dispatched" })
  await expect(f.dock.unbind(foreign)).rejects.toMatchObject({ code: "wrong-scope" })
  await expect(f.dock.bind(foreign, { ...proof, scopeKind: foreign.scopeKind }, f.client, confirm)).rejects.toMatchObject({ code: "wrong-scope" })
  expect(f.client.calls.map((call) => call.op)).toEqual(["bind", "bind", "action"])
  expect(f.dock.has(current)).toBe(true)
})

test.each(["appID", "launchEpoch"] as const)("scope: workspace rejects matching but invalid %s markers", async (field) => {
  const f = workspaceFixture(["application", "workspace"])
  await expect(f.dock.bind({ ...workspaceIdentity(), [field]: "foreign" },
    { ...workspaceTarget(), [field]: "foreign" }, f.client, confirm)).rejects.toMatchObject({ code: "wrong-scope", outcome: "not-dispatched" })
  expect(f.client.calls).toEqual([])
})

test.each(["bootID", "pidNamespace", "mountNamespace"] as const)("scope: workspace rejects mixed %s before discovery", async (field) => {
  const f = workspaceFixture(["application", "workspace"])
  const proof = workspaceTarget()
  proof.processIdentities[1]![field] = "foreign"
  await expect(f.dock.bind(workspaceIdentity(), proof, f.client, confirm)).rejects.toMatchObject({ code: "wrong-scope", outcome: "not-dispatched" })
  expect(f.client.calls).toEqual([])
})

test.each([{ scopeKinds: undefined }, { scopeKinds: ["application"] as NativeDockProtocol.ScopeKind[] }])("scope: workspace feature gate rejects hello %j before discovery", async (hello) => {
  const f = workspaceFixture(hello.scopeKinds)
  await expect(f.dock.bind(workspaceIdentity(), workspaceTarget(), f.client, confirm)).rejects.toMatchObject({
    code: "unsupported-scope", outcome: "not-dispatched",
  })
  expect(f.client.calls).toEqual([])
  expect(f.dock.has(workspaceIdentity())).toBe(false)
  f.client.reply = undefined
  await f.dock.bind(identity(), target(), f.client, confirm)
  expect(f.client.calls.map((call) => call.args.phase)).toEqual(["discover", "confirm"])
})

test("discover then required runtime confirmation precede binding and every action", async () => {
  const f = fixture()
  await expect(f.dock.dispatch("click", identity(), { ref: "n:opaque" })).rejects.toMatchObject({ code: "ownership-unresolved" })
  const approval = deferred<NativeDockProtocol.Handle[]>()
  const proposals: NativeDockProtocol.Proposal[] = []
  const bound = f.dock.bind(identity(), target(), f.client, async (proposal) => {
    proposals.push(proposal)
    return approval.promise
  })
  await turn()
  expect(proposals).toEqual([{ status: "proposal", proposalID: "proposal-1", roots: [{ ...root(), name: "Window", role: 23 }] }])
  expect(f.dock.has(identity())).toBe(true)
  expect(f.dock.metadata(identity())).toMatchObject({ backend: "linux-atspi", nativeReadiness: "binding" })
  await expect(f.dock.dispatch("read", identity(), {})).rejects.toMatchObject({ code: "ownership-unresolved" })
  expect(f.client.calls).toEqual([{ op: "bind", args: { phase: "discover", identity: {
    senderID: 1, tabID: "native", generation: 1, profileID: "profile",
  }, target: { ...target(), scopeKind: "application" } } }])
  approval.resolve([root()])
  const binding = await bound
  expect(f.client.calls[1]).toEqual({ op: "bind", args: { phase: "confirm", proposalID: "proposal-1", roots: [root()], ownershipRevision: 1 } })
  expect(binding.bindingID).toBe("binding-proposal-1")
  expect(Object.isFrozen(binding)).toBe(true)
  expect(f.dock.metadata(identity())).toEqual({ backend: "linux-atspi", scopeKind: "application", nativeReadiness: "bound", helperEpoch: "helper", sessionID: "session" })
  expect(f.dock.metadata(identity())).not.toHaveProperty("installed")
})

test("every captured scope field rejects mismatching identity without fallback", async () => {
  const f = fixture()
  await f.dock.bind(identity(), target(), f.client, confirm)
  const changes: Partial<DockIdentity>[] = [{ generation: 2 }, { profileID: "foreign" }, { runtimeID: "foreign" },
    { runtimeEpoch: "foreign" }, { appID: "foreign" }, { launchEpoch: "foreign" }, { ownershipRevision: 2 }, { accessibilitySessionID: "foreign" }]
  for (const change of changes) {
    const foreign = { ...identity(), ...change }
    expect(() => f.dock.has(foreign)).toThrow(NativeDockProtocol.NativeError)
    expect(() => f.dock.has(foreign)).toThrow("Native registration belongs to another scope")
    expect(() => f.dock.metadata(foreign)).toThrow("Native registration belongs to another scope")
    await expect(f.dock.dispatch("read", foreign, {})).rejects.toMatchObject({ code: "wrong-scope" })
    await expect(f.dock.unbind(foreign)).rejects.toMatchObject({ code: "wrong-scope" })
    expect(f.dock.has(identity())).toBe(true)
  }
  expect(f.dock.has({ ...identity(), senderID: 2 })).toBe(false)
  expect(f.dock.has({ ...identity(), tabID: "browser" })).toBe(false)
  expect(f.client.calls.length).toBe(2)
  f.client.hello = { ...f.client.hello, helperEpoch: "restarted" }
  expect(() => f.dock.has(identity())).toThrow("Native registration belongs to another scope")
  await expect(f.dock.dispatch("read", identity(), {})).rejects.toMatchObject({ code: "wrong-scope" })
  await f.dock.closeTab(1, "native")
})

test("target runtime/app/launch/revision/session and helper session are checked before discovery", async () => {
  const f = fixture()
  const foreign: NativeDockProtocol.Target[] = [
    { ...target(), appID: "foreign" }, { ...target(), launchEpoch: "foreign" }, { ...target(), ownershipRevision: 2 },
    { ...target(), runtime: { ...target().runtime, runtimeID: "foreign" } },
    { ...target(), runtime: { ...target().runtime, runtimeEpoch: "foreign" } },
    { ...target(), runtime: { ...target().runtime, accessibilitySessionID: "foreign" } },
  ]
  for (const proof of foreign) await expect(f.dock.bind(identity(), proof, f.client, confirm)).rejects.toMatchObject({ code: "wrong-scope" })
  f.client.hello = { ...f.client.hello, sessionID: "foreign" }
  await expect(f.dock.bind(identity(), target(), f.client, confirm)).rejects.toMatchObject({ code: "wrong-scope" })
  expect(f.client.calls).toEqual([])
})

test("missing/empty process proof or confirmation cannot bind, even with matching title and PID", async () => {
  const f = fixture()
  await expect(f.dock.bind(identity(), target(), f.client, undefined as unknown as NativeDockProtocol.Confirm)).rejects.toMatchObject({ code: "ownership-unresolved" })
  await expect(f.dock.bind(identity(), { ...target(), processIdentities: [] }, f.client, confirm)).rejects.toMatchObject({ code: "ownership-unresolved" })
  await expect(f.dock.bind(identity(), { ...target(), processIdentities: [{ pid: 42 } as NativeDockProtocol.ProcessIdentity] }, f.client, confirm)).rejects.toMatchObject({ code: "ownership-unresolved" })
  expect(f.client.calls).toEqual([])
  await expect(f.dock.bind(identity(), target(), f.client, async () => [])).rejects.toMatchObject({ code: "ownership-unresolved" })
  expect(f.dock.has(identity())).toBe(false)
  expect(f.client.calls.map((call) => call.args.phase)).toEqual(["discover"])
})

test("confirmation must be a nonempty subset of proposed and runtime-owned roots", async () => {
  const f = fixture()
  await expect(f.dock.bind(identity(), target(), f.client, async () => [{ ...root(), owner: ":1.99" }])).rejects.toMatchObject({ code: "wrong-scope" })
  const second = new BoundaryClient()
  const third = new BoundaryClient()
  await expect(f.dock.bind(identity(), { ...target(), roots: [{ ...root(), path: "/foreign" }] }, second, confirm)).rejects.toMatchObject({ code: "wrong-scope" })
  await expect(f.dock.bind(identity(), target(), third, async () => [root(), root()])).rejects.toMatchObject({ code: "ownership-unresolved" })
  expect([f.client, second, third].every((client) => client.closed === 1 && client.calls.every((call) => call.args.phase === "discover"))).toBe(true)
})

test("malformed, non-concrete and duplicate proposals never reach runtime confirmation", async () => {
  const f = fixture()
  const invalid: NativeDockProtocol.JSONValue[] = [null, {}, { status: "proposal", proposalID: "", roots: [] },
    { status: "proposal", proposalID: "proposal", roots: [{ ...root(), name: "Window", role: 75 }] },
    { status: "proposal", proposalID: "proposal", roots: [{ ...root(), owner: "well.known", name: "Window", role: 23 }] },
    { status: "proposal", proposalID: "proposal", roots: [{ ...root(), path: "/org/a11y/atspi/accessible/root", name: "Window", role: 23 }] },
    { status: "proposal", proposalID: "proposal", roots: [{ ...root(), name: "Window", role: 23 }, { ...root(), name: "Window", role: 23 }] },
  ]
  const confirmed: NativeDockProtocol.Proposal[] = []
  for (const reply of invalid) {
    const client = new BoundaryClient()
    client.reply = async () => reply
    await expect(f.dock.bind(identity(), target(), client, async (proposal) => {
      confirmed.push(proposal)
      return [root()]
    })).rejects.toMatchObject({ code: "protocol-error" })
    expect(client.closed).toBe(1)
  }
  expect(confirmed).toEqual([])
  expect(f.dock.has(identity())).toBe(false)
})

test("duplicate pending registrations reject and capacity is eight sender/tab slots", async () => {
  const f = fixture()
  const approval = deferred<NativeDockProtocol.Handle[]>()
  const pending = f.dock.bind(identity(), target(), f.client, () => approval.promise)
  await expect(f.dock.bind(identity(), target(), f.client, confirm)).rejects.toMatchObject({ code: "duplicate-bind" })
  await expect(f.dock.bind({ ...identity(), generation: 2 }, target(), f.client, confirm)).rejects.toMatchObject({ code: "wrong-scope" })
  approval.resolve([root()])
  await pending
  await Promise.all(Array.from({ length: 7 }, (_, index) => f.dock.bind({ ...identity(), tabID: `native-${index}` }, target(), f.client, confirm)))
  await expect(f.dock.bind({ ...identity(), tabID: "ninth" }, target(), f.client, confirm)).rejects.toMatchObject({ code: "capacity" })
  await f.dock.unbind(identity())
  await f.dock.bind({ ...identity(), tabID: "replacement" }, target(), f.client, confirm)
  expect(f.client.closed).toBe(0)
})

test("caller identity/target and callback proposal mutations cannot change captured proof", async () => {
  const f = fixture()
  const caller = identity()
  const proof = { ...target(), roots: [root()] }
  Object.assign(proof.runtime, { extra: { callerReference: true } })
  Object.assign(proof.processIdentities[0], { extra: { callerReference: true } })
  const approval = deferred<NativeDockProtocol.Handle[]>()
  const bound = f.dock.bind(caller, proof, f.client, async (proposal) => {
    proposal.roots[0].owner = ":1.999"
    return approval.promise
  })
  caller.generation = 999
  caller.runtimeEpoch = "changed"
  proof.runtime.runtimeEpoch = "changed"
  proof.processIdentities[0].startTicks = 999
  proof.roots[0].owner = ":1.999"
  await turn()
  expect(f.client.calls[0].args.target).toEqual({ ...target(), scopeKind: "application", roots: [root()] })
  expect(Object.isFrozen(f.client.calls[0].args.target)).toBe(true)
  expect(Object.isFrozen((f.client.calls[0].args.target as NativeDockProtocol.Target).runtime)).toBe(true)
  expect(Object.isFrozen((f.client.calls[0].args.target as NativeDockProtocol.Target).processIdentities[0])).toBe(true)
  approval.resolve([root()])
  await bound
  expect(f.dock.has(identity())).toBe(true)
  expect(() => f.dock.has(caller)).toThrow("Native registration belongs to another scope")
})

test("cancelled real-client confirmation cannot resurrect route or unbind replacement registration", async () => {
  const f = await wireFixture()
  f.channel.holdConfirmation = true
  f.channel.holdReap = true
  const old = f.dock.bind(identity(), target(), f.client, confirm).then(() => null, (error: unknown) => error)
  const replacementChannel = new WireChannel()
  const replacementClient = await NativeDockClient.create(replacementChannel)
  try {
    await turn()
    const request = f.channel.requests.at(-1)!
    expect(request).toMatchObject({ op: "bind", args: { phase: "confirm" } })
    const removal = f.dock.unbind(identity())
    expect(f.dock.has(identity())).toBe(false)
    const replacement = { ...identity(), generation: 2 }
    const fresh = await f.dock.bind(replacement, target(), replacementClient, confirm)
    await f.channel.terminationStarted.promise
    f.channel.send(request.id, { bindingID: "retired-binding", bindingEpoch: "retired-epoch", appID: "app", launchEpoch: "launch" })
    f.channel.reap.resolve()
    await removal
    expect(await old).toMatchObject({ code: "cancelled" })
    expect(f.dock.has(replacement)).toBe(true)
    await f.dock.dispatch("read", replacement, {})
    expect(replacementChannel.requests.at(-1)?.bindingID).toBe(fresh.bindingID)
    expect(replacementChannel.requests.some((request) => request.op === "unbind")).toBe(false)
  } finally {
    f.channel.reap.resolve()
    await old
    await f.dock.close()
    await replacementClient.close()
  }
})

test("malformed binding or binding for another app/launch never becomes routable", async () => {
  const f = fixture()
  const invalid: NativeDockProtocol.JSONValue[] = [{}, { bindingID: "incomplete", bindingEpoch: "epoch" },
    { bindingID: "foreign", bindingEpoch: "epoch", appID: "foreign", launchEpoch: "launch" },
    { bindingID: "foreign", bindingEpoch: "epoch", appID: "app", launchEpoch: "foreign" }]
  const clients = invalid.map(() => new BoundaryClient())
  for (const [index, reply] of invalid.entries()) {
    const client = clients[index]
    client.reply = async (call) => call.op === "bind" && call.args.phase === "confirm" ? reply : client.defaultReply(call)
    await expect(f.dock.bind(identity(), target(), client, confirm)).rejects.toBeInstanceOf(NativeDockProtocol.NativeError)
    expect(f.dock.has(identity())).toBe(false)
    expect(client.closed).toBe(1)
  }
  expect(clients.flatMap((client) => client.calls).filter((call) => call.op === "unbind").length).toBe(3)
})

test("read/click/action/type carry only captured binding and explicit native arguments", async () => {
  const f = fixture()
  const binding = await f.dock.bind(identity(), target(), f.client, confirm)
  const scope = { bindingID: binding.bindingID, bindingEpoch: binding.bindingEpoch }
  await f.dock.dispatch("read", identity(), { budget: 4, maxText: 20, rootRef: "n:root", cursor: "opaque-cursor", textOffset: 2 })
  expect(f.client.calls.at(-1)).toEqual({ op: "read", args: { budget: 4, maxText: 20, rootRef: "n:root", cursor: "opaque-cursor", textOffset: 2 }, ...scope })
  await f.dock.dispatch("click", identity(), { ref: "n:button" })
  expect(f.client.calls.at(-1)).toEqual({ op: "action", args: { ref: "n:button" }, ...scope })
  await f.dock.dispatch("action", identity(), { ref: "n:button", actionID: "opaque-action" })
  expect(f.client.calls.at(-1)).toEqual({ op: "action", args: { ref: "n:button", actionID: "opaque-action" }, ...scope })
  for (const text of ["café 🧪 漢字 é", ""]) {
    await f.dock.dispatch("type", identity(), { ref: "n:input", text })
    expect(f.client.calls.at(-1)).toEqual({ op: "type", args: { ref: "n:input", text, mode: "editable" }, ...scope })
  }
  await f.dock.dispatch("type", identity(), { ref: "n:input", text: "", mode: "keyboard" })
  expect(f.client.calls.at(-1)).toEqual({ op: "type", args: { ref: "n:input", text: "", mode: "keyboard" }, ...scope })
  await f.dock.dispatch("keyboard", identity(), { ref: "n:window", keys: "ctrl+comma", type: "keyDown" })
  expect(f.client.calls.at(-1)).toEqual({ op: "key", args: { ref: "n:window", keys: "ctrl+comma" }, ...scope })
  await f.dock.dispatch("type", identity(), { ref: "n:input", text: "x", mode: "keyboard", focused: true, world: "linux" })
  expect(f.client.calls.at(-1)).toEqual({ op: "type", args: { ref: "n:input", text: "x", mode: "keyboard", focused: true }, ...scope })
  for (const kind of ["hover", "contextMenu"]) {
    await f.dock.dispatch("pointer", identity(), { ref: "n:row", kind, x: 5 })
    expect(f.client.calls.at(-1)).toEqual({ op: "pointer", args: { ref: "n:row", kind }, ...scope })
  }
})

test("pointer and focused typing refuse malformed arguments before client work", async () => {
  const f = fixture()
  await f.dock.bind(identity(), target(), f.client, confirm)
  const before = f.client.calls.length
  for (const kind of [undefined, "click", "doubleClick", 3])
    await expect(f.dock.dispatch("pointer", identity(), { ref: "n:row", kind })).rejects.toMatchObject({ code: "invalid-argument" })
  await expect(f.dock.dispatch("pointer", identity(), { ref: 7, kind: "hover" })).rejects.toMatchObject({ code: "wrong-scope" })
  for (const args of [{ focused: true }, { focused: true, mode: "editable" }, { focused: "yes", mode: "keyboard" }, { focused: false, mode: "keyboard" }])
    await expect(f.dock.dispatch("type", identity(), { ref: "n:input", text: "x", ...args })).rejects.toMatchObject({ code: "invalid-argument" })
  expect(f.client.calls.length).toBe(before)
})

test("numeric native refs, invalid args and browser-only operations fail before client work", async () => {
  const f = fixture()
  await f.dock.bind(identity(), target(), f.client, confirm)
  for (const op of ["click", "action", "type"]) await expect(f.dock.dispatch(op, identity(), { ref: 7, text: "text", actionID: "action" })).rejects.toMatchObject({ code: "wrong-scope" })
  for (const op of ["list", "activate", "close", "navigate", "go", "open", "clickAt", "screenshot", "scroll", "evaluate", "storage", "network", "hover", "drag"])
    await expect(f.dock.dispatch(op, identity(), {})).rejects.toMatchObject({ code: "unsupported-operation" })
  for (const args of [{ budget: 501 }, { maxText: -1 }, { rootRef: 7 }, { cursor: "" }, { textOffset: -1 }])
    await expect(f.dock.dispatch("read", identity(), args)).rejects.toMatchObject({ code: "invalid-argument" })
  await expect(f.dock.dispatch("action", identity(), { ref: "n:button" })).rejects.toMatchObject({ code: "invalid-argument" })
  await expect(f.dock.dispatch("keyboard", identity(), {})).rejects.toMatchObject({ code: "wrong-scope" })
  for (const keys of [undefined, "", "x".repeat(65), 7])
    await expect(f.dock.dispatch("keyboard", identity(), { ref: "n:window", keys })).rejects.toMatchObject({ code: "invalid-argument" })
  await expect(f.dock.dispatch("type", identity(), { ref: "n:input", text: "", mode: "fallback" })).rejects.toMatchObject({ code: "invalid-argument" })
  expect(f.client.calls.length).toBe(2)
})

test("native provider error code/outcome/result survive with no retry", async () => {
  const f = fixture()
  await f.dock.bind(identity(), target(), f.client, confirm)
  const error = new NativeDockProtocol.NativeError("provider-rejected", "Provider declined", "unknown", { method: "action", dispatch: "rejected", postcondition: "unverified" })
  f.client.reply = async (call) => { if (call.op === "action") throw error; return f.client.defaultReply(call) }
  await expect(f.dock.dispatch("click", identity(), { ref: "n:button" })).rejects.toBe(error)
  expect(f.client.calls.filter((call) => call.op === "action").length).toBe(1)
})

test("pre-aborted request never reaches client and pending dispatch capacity is bounded", async () => {
  const f = fixture()
  await f.dock.bind(identity(), target(), f.client, confirm)
  const abort = new AbortController()
  abort.abort()
  await expect(f.dock.dispatch("click", identity(), { ref: "n:button" }, abort.signal)).rejects.toMatchObject({ code: "cancelled", outcome: "not-dispatched" })
  expect(f.client.calls).toHaveLength(2)
  f.client.reply = async (call) => call.op === "read" ? new Promise(() => {}) : f.client.defaultReply(call)
  const work = Array.from({ length: 32 }, () => f.dock.dispatch("read", identity(), {}).then(() => null, (error: NativeDockProtocol.NativeError) => error))
  await expect(f.dock.dispatch("read", identity(), {})).rejects.toMatchObject({ code: "capacity" })
  await turn()
  expect(f.client.calls.filter((call) => call.op === "read")).toHaveLength(32)
  await f.dock.unbind(identity())
  const failures = await Promise.all(work)
  expect(failures.every((error) => error?.code === "cancelled" && error.outcome === "unknown")).toBe(true)
})

test("wait is bounded cancellable delay, not application proof, and releases abort listeners", async () => {
  const f = fixture()
  await f.dock.bind(identity(), target(), f.client, confirm)
  const abort = new AbortController()
  const add = spyOn(abort.signal, "addEventListener")
  const remove = spyOn(abort.signal, "removeEventListener")
  await expect(f.dock.dispatch("wait", identity(), { milliseconds: 0 }, abort.signal)).resolves.toEqual({ backend: "linux-atspi", milliseconds: 0, readiness: "delay-only", postcondition: "unverified" })
  expect(add.mock.calls.length).toBe(1)
  expect(remove.mock.calls.length).toBe(1)
  const waiting = f.dock.dispatch("wait", identity(), { milliseconds: 10000 }, abort.signal)
  abort.abort()
  await expect(waiting).rejects.toMatchObject({ code: "cancelled", outcome: "not-dispatched" })
  await expect(f.dock.dispatch("wait", identity(), { milliseconds: 10001 })).rejects.toMatchObject({ code: "invalid-argument" })
  expect(f.client.calls.length).toBe(2)
  expect(remove.mock.calls.length).toBe(2)
  add.mockRestore()
  remove.mockRestore()
})

test("unbind removes route immediately, cancels tied work, sends captured guest control and preserves shared client", async () => {
  const f = fixture()
  const binding = await f.dock.bind(identity(), target(), f.client, confirm)
  const other = { ...identity(), tabID: "other" }
  await f.dock.bind(other, target(), f.client, confirm)
  const release = deferred<NativeDockProtocol.JSONValue>()
  f.client.reply = async (call) => call.op === "action" ? new Promise(() => {})
    : call.op === "unbind" && call.bindingID === binding.bindingID ? release.promise : f.client.defaultReply(call)
  const work = f.dock.dispatch("click", identity(), { ref: "n:button" })
  await turn()
  const signal = f.client.signals.at(-1)
  const unbound = f.dock.unbind(identity())
  expect(f.dock.has(identity())).toBe(false)
  expect(signal?.aborted).toBe(true)
  await expect(work).rejects.toMatchObject({ code: "cancelled", outcome: "unknown" })
  await turn()
  expect(f.client.calls.at(-1)).toEqual({ op: "unbind", args: {}, bindingID: binding.bindingID, bindingEpoch: binding.bindingEpoch })
  expect(f.client.closed).toBe(0)
  await f.dock.dispatch("read", other, {})
  release.resolve({ ok: true })
  await unbound
})

test("closeTab targets stored sender/tab; close cancels all work and closes each unique client once", async () => {
  const f = fixture()
  const second = new BoundaryClient()
  const one = await f.dock.bind(identity(), target(), f.client, confirm)
  const other = { ...identity(), tabID: "other" }
  await f.dock.bind(other, target(), f.client, confirm)
  const third = { ...identity(), senderID: 2 }
  await f.dock.bind(third, target(), second, confirm)
  f.client.hello = { ...f.client.hello, helperEpoch: "stale" }
  await f.dock.closeTab(1, "native")
  expect(f.client.calls.at(-1)?.bindingID).toBe(one.bindingID)
  expect(f.dock.has(identity())).toBe(false)
  f.client.hello = { ...f.client.hello, helperEpoch: "helper" }
  const waiting = f.dock.dispatch("wait", other, { milliseconds: 10000 })
  const closed = f.dock.close()
  expect(f.dock.has(other)).toBe(false)
  expect(f.dock.has(third)).toBe(false)
  await expect(waiting).rejects.toMatchObject({ code: "cancelled" })
  await closed
  await f.dock.close()
  expect(f.client.closed).toBe(1)
  expect(second.closed).toBe(1)
  await expect(f.dock.bind(identity(), target(), f.client, confirm)).rejects.toMatchObject({ code: "closed" })
})
