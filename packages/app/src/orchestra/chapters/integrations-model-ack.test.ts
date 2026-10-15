import { expect, test } from "bun:test"
import { CapabilityManagement } from "@orchestra/schema/capability-management"
import { CapabilitySetup } from "@orchestra/schema/capability-setup"
import { binding, connection, fixture, json, reads, target } from "./integrations-model.fixture"

test.each(["id", "parent", "generation", "environment"] as const)("retarget ACK wrong %s stays unknown and never poisons next bind/remove refs", async (field) => {
  let posted = false
  const wrong = CapabilityManagement.Target.make({ target: { ...target().target, generation: 1, environment: "next",
    ...(field === "id" ? { id: target(2).target.id } : {}),
    ...(field === "parent" ? { connectionID: connection(2).connection.id } : {}),
    ...(field === "generation" ? { generation: 2 } : {}),
    ...(field === "environment" ? { environment: "other" } : {}),
  } })
  const f = fixture((request) => {
    if (request.method === "GET") return posted ? json({ _tag: "ForbiddenError", message: "unavailable" }, 403) : reads(request)
    posted = true
    return json({ requestID: "ack", reused: false, data: new URL(request.url).pathname.endsWith("/retarget") ? wrong : null })
  })
  await f.model.load(); await f.model.select(connection()); await f.model.selectTarget(target())
  const before = f.requests.length
  const input = { environment: "next", resource: { room: "original" } }
  const pending = f.model.retargetTarget(input)
  input.environment = "edited"
  input.resource.room = "edited"
  await pending
  expect(f.model.state.failure).toBe("unknown")
  expect(f.model.state.receipt).toBeUndefined()
  expect(f.model.state.targetID).toBe(target().target.id)
  expect(f.model.state.targets).toEqual([target()])
  await f.model.retry()
  expect(f.model.state.failure).toBe("unknown")
  expect(f.requests.slice(before).every((row) => row.method === "POST")).toBe(true)
  await f.model.bind({ sessionID: binding().sessionID, actions: ["send"] })
  expect(f.model.state.failure).toBe("authorization")
  expect(f.model.state.receipt?.requestID).toBe("ack")
  await f.model.removeTarget()
  const posts = f.requests.filter((row) => row.method === "POST")
  expect(posts.map((row) => row.key)).toEqual(["private-intent-1", "private-intent-1", "private-intent-2", "private-intent-3"])
  expect(posts.map((row) => row.body)).toEqual([
    { target: target().target, input: { environment: "next", resource: { room: "original" } } },
    { target: target().target, input: { environment: "next", resource: { room: "original" } } },
    { target: target().target, input: { sessionID: binding().sessionID, actions: ["send"] } },
    { target: target().target },
  ])
})

test.each(["parent", "generation", "environment"] as const)("create target ACK wrong %s rejected before failed refresh can disguise it", async (field) => {
  let posted = false
  const wrong = CapabilityManagement.Target.make({ target: { ...target(2).target, environment: "next",
    ...(field === "parent" ? { connectionID: connection(2).connection.id } : {}),
    ...(field === "generation" ? { generation: 1 } : {}),
    ...(field === "environment" ? { environment: "other" } : {}),
  } })
  const f = fixture((request) => {
    if (request.method === "GET") return posted ? json({ _tag: "ForbiddenError", message: "unavailable" }, 403) : reads(request)
    posted = true
    return json({ requestID: "ack", reused: false, data: wrong })
  })
  await f.model.load(); await f.model.select(connection())
  const before = f.requests.length
  await f.model.createTarget({ environment: "next", resource: {} })
  expect(f.model.state.failure).toBe("unknown")
  expect(f.model.state.receipt).toBeUndefined()
  expect(f.model.state.connectionID).toBe(connection().connection.id)
  expect(f.requests.slice(before).every((row) => row.method === "POST")).toBe(true)
})

test.each(["provider", "generation"] as const)("connect ACK wrong %s rejected before failed refresh can disguise it", async (field) => {
  const wrong = CapabilitySetup.Result.make({ connection: { ...connection().connection,
    ...(field === "provider" ? { provider: "discord" } : { generation: 1 }),
  }, verification: "verified" })
  const f = fixture((request) => request.method === "POST" ? json({ requestID: "ack", reused: false, data: wrong })
    : json({ _tag: "ForbiddenError", message: "unavailable" }, 403))
  await f.model.connect({ provider: "slack", key: "private-secret" })
  expect(f.model.state.failure).toBe("unknown")
  expect(f.model.state.receipt).toBeUndefined()
  expect(f.requests).toHaveLength(1)
})
