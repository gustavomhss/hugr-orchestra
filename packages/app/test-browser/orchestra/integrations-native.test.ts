import { afterEach, expect, test } from "bun:test"
import { assertPrivate, button, connect, field, idle, mountPage, select, startHost, submit, waitFor } from "./integrations-native.fixture"

// Desired main-path assertions stay live. At a1eee26ade, entry's tracked load disposes writes;
// separately, implicit-local ledger capture decodes wire Location.Ref instead of its Type.
// Diagnostic untrack/load + Schema.toType(targetSchema) probes reach all real HTTP/SQL assertions.
// Production fixes belong to the lead; this test-only branch intentionally exposes those regressions.

const cleanup: (() => void | Promise<void>)[] = []
afterEach(async () => { for (const dispose of cleanup.splice(0).reverse()) await dispose(); localStorage.clear() })

test("actual chapter entry connects two explicit accounts through generated Client, protected handler, verifier and SQL", async () => {
  const host = await startHost()
  cleanup.push(host.stop)
  const view = mountPage(host)
  cleanup.push(view.dispose)
  await idle(view.root)
  expect(view.root.textContent).toContain("No accounts are configured for this profile.")
  await connect(view.root, "slack", "native-slack-key", "فريق Alpha")
  await connect(view.root, "discord", "native-discord-key")
  const rows = await host.inspect()
  expect(rows.connections).toHaveLength(2)
  expect(rows.credentials).toHaveLength(2)
  expect(rows.receipts).toHaveLength(2)
  expect(rows.connections.map((item) => [item.provider, item.subject_id, item.label])).toEqual([
    ["slack", '["TNATIVE","UNATIVE","BNATIVE"]', "فريق Alpha"], ["discord", "123456789", "discord"],
  ])
  expect(rows.credentials.map((item) => item.value)).toEqual([{ type: "key", key: "native-slack-key" }, { type: "key", key: "native-discord-key" }])
  expect(rows.vendor).toEqual([
    { method: "POST", path: "/api/auth.test", authorization: "Bearer native-slack-key" },
    { method: "GET", path: "/api/v10/users/@me", authorization: "Bot native-discord-key" },
  ])
  expect(view.root.textContent).toContain("فريق Alpha")
  rows.connections.forEach((item) => expect(view.root.textContent).toContain(item.id))
  expect(view.root.querySelector('[name="bearer"]')).toBeNull()
  const posts = view.wire.calls.filter((call) => call.method === "POST")
  expect(posts.map((call) => JSON.parse(call.body))).toEqual([
    { provider: "slack", key: "native-slack-key", label: "فريق Alpha" }, { provider: "discord", key: "native-discord-key" },
  ])
  expect(posts.map((call) => new URL(call.url).pathname)).toEqual(Array(2).fill("/api/capability/connections/connect"))
  view.wire.calls.forEach((call) => {
    expect(call.headers.get("authorization")).toBe(`Basic ${Buffer.from("native:native:password").toString("base64")}`)
    expect(new URL(call.url).searchParams.get("location[directory]")).toBe(host.directory)
    expect(call.status).toBe(200)
  })
  assertPrivate(view.root, ["native-slack-key", "native-discord-key", "vendor-private", ...rows.credentials.map((item) => item.id), ...rows.connections.map((item) => item.scope_hash)], view.wire)
  await host.removeCredential()
  button("Refresh", view.root).click()
  await idle(view.root)
  expect(view.root.textContent).toContain("Credential missing")
  const page = JSON.parse(view.wire.calls.at(-1)!.response!)
  expect(page.items.map((item: { credential: string }) => item.credential)).toEqual(["missing", "present"])
  expect((await host.inspect()).connections[0].credential_id).toBeNull()
}, 90000)

test("page target create/retarget, persisted current actor binding, delete and local disconnect use real SQL", async () => {
  const host = await startHost()
  cleanup.push(host.stop)
  const view = mountPage(host)
  cleanup.push(view.dispose)
  await idle(view.root)
  await connect(view.root, "slack", "lifecycle-private-key", "Lifecycle")
  const account = (await host.inspect()).connections[0]
  expect(account).toBeDefined()
  await select(account.id, view.root)
  button("Create target", view.root).click()
  await waitFor(() => !!document.querySelector(".integrations-dialog"))
  field("environment").value = "production"
  field("resource").value = '{"channel":"private-channel-42"}'
  submit()
  await idle(view.root)
  const initial = (await host.inspect()).targets[0]
  expect(initial).toMatchObject({ connection_id: account.id, generation: 0, environment: "production", resource: { channel: "private-channel-42" } })
  await select(initial.id, view.root)
  button("Replace target", view.root).click()
  await waitFor(() => !!document.querySelector(".integrations-dialog"))
  expect(field("resource").value).toBe("")
  expect(field("environment").value).toBe("")
  field("environment").value = "staging"
  field("resource").value = '{"channel":"replacement-private-7"}'
  submit()
  await idle(view.root)
  expect((await host.inspect()).targets[0]).toMatchObject({ id: initial.id, generation: 1, environment: "staging", resource: { channel: "replacement-private-7" } })
  expect(view.root.textContent).toContain("staging")
  button("Save binding", view.root).click()
  await waitFor(() => !!document.querySelector(".integrations-dialog"))
  field("sessionID").value = host.sessionID
  field("actions").value = "slack.message.send\nslack.message.edit"
  submit()
  await idle(view.root)
  expect((await host.inspect()).bindings).toMatchObject([{ target_id: initial.id, session_id: host.sessionID, agent_id: "native-actor", actions: ["slack.message.edit", "slack.message.send"] }])
  expect(view.root.textContent).toContain(host.sessionID)
  await host.changeActor()
  await select(initial.id, view.root)
  expect(view.root.textContent).toContain("No current-actor bindings")
  expect((await host.inspect()).bindings).toHaveLength(1) // Historical actor remains durable, not publicly current.
  button("Save binding", view.root).click()
  await waitFor(() => !!document.querySelector(".integrations-dialog"))
  field("sessionID").value = host.sessionID
  field("actions").value = "slack.message.send"
  submit()
  await idle(view.root)
  expect((await host.inspect()).bindings.map((item) => item.agent_id).sort()).toEqual(["changed-actor", "native-actor"])
  button("Remove binding", view.root).click()
  await waitFor(() => !!document.querySelector(".integrations-dialog"))
  submit()
  await idle(view.root)
  expect((await host.inspect()).bindings.map((item) => item.agent_id)).toEqual(["native-actor"])
  button("Remove target", view.root).click()
  await waitFor(() => !!document.querySelector(".integrations-dialog"))
  expect(document.querySelector(".integrations-dialog")?.textContent).toContain("does not delete the provider resource")
  submit()
  await idle(view.root)
  expect((await host.inspect()).targets).toEqual([])
  expect((await host.inspect()).bindings).toEqual([])
  button("Disconnect account", view.root).click()
  await waitFor(() => !!document.querySelector(".integrations-dialog"))
  expect(document.querySelector(".integrations-dialog")?.textContent).toContain("does not revoke the provider token")
  submit()
  await idle(view.root)
  const final = await host.inspect()
  expect(final.connections[0]).toMatchObject({ state: "disconnected", generation: 1 })
  expect(final.vendor).toHaveLength(1)
  expect(view.root.textContent).toContain("Disconnected locally")
  assertPrivate(view.root, ["lifecycle-private-key", "private-channel-42", "replacement-private-7", account.credential_id!], view.wire)
  expect(view.wire.calls.filter((call) => call.method === "POST").map((call) => new URL(call.url).pathname)).toEqual([
    "/api/capability/connections/connect", "/api/capability/targets", "/api/capability/targets/retarget",
    "/api/capability/bindings", "/api/capability/bindings", "/api/capability/bindings/remove",
    "/api/capability/targets/remove", "/api/capability/connections/disconnect",
  ])
}, 90000)

test("lost accepted HTTP response retries exact historical intent with no extra vendor verification", async () => {
  const host = await startHost()
  cleanup.push(host.stop)
  const view = mountPage(host)
  cleanup.push(view.dispose)
  await idle(view.root)
  view.wire.controls.loseNextPost = true
  await connect(view.root, "slack", "lost-private-key", "Lost response")
  expect(view.root.textContent).toContain("The response was lost")
  const saved = await host.inspect()
  expect(saved.connections).toHaveLength(1)
  expect(saved.receipts).toHaveLength(1)
  expect(saved.vendor).toHaveLength(1)
  await host.expire()
  button("Retry same request", view.root).click()
  await idle(view.root)
  expect(view.root.textContent).toContain("Original request receipt reused")
  const posts = view.wire.calls.filter((call) => call.method === "POST")
  expect(posts).toHaveLength(2)
  expect(posts[1].body).toBe(posts[0].body)
  expect(posts[1].headers.get("idempotency-key")).toBe(posts[0].headers.get("idempotency-key"))
  expect(JSON.parse(posts[1].response!)).toEqual({ ...JSON.parse(posts[0].response!), reused: true })
  expect(await host.inspect()).toEqual(saved)
  assertPrivate(view.root, ["lost-private-key", posts[0].headers.get("idempotency-key")!], view.wire)
}, 90000)

test("failed read after ACK retries only GET, never POST or vendor verification", async () => {
  const host = await startHost()
  cleanup.push(host.stop)
  const view = mountPage(host)
  cleanup.push(view.dispose)
  await idle(view.root)
  view.wire.controls.failNextGet = true
  await connect(view.root, "discord", "read-retry-private-key", "Read retry")
  expect(view.root.textContent).toContain("Request saved")
  expect(view.root.textContent).toContain("The request could not be completed")
  expect(view.root.textContent).not.toContain("Retry same request")
  const before = view.wire.calls.length
  button("Refresh", view.root.querySelector('[role="alert"]')!).click()
  await idle(view.root)
  expect(view.wire.calls.slice(before).map((call) => call.method)).toEqual(["GET"])
  expect(view.wire.calls.filter((call) => call.method === "POST")).toHaveLength(1)
  expect((await host.inspect()).vendor).toHaveLength(1)
  expect(view.root.querySelector('[role="alert"]')).toBeNull()
  expect(view.root.textContent).toContain("Read retry")
  assertPrivate(view.root, ["read-retry-private-key", "fixture-private-read-error"], view.wire)
}, 90000)

test("actual page sanitizes malformed/expired vendor credentials without persisting failed setup", async () => {
  const host = await startHost()
  cleanup.push(host.stop)
  const view = mountPage(host)
  cleanup.push(view.dispose)
  await idle(view.root)
  for (const key of ["malformed-page-private-key", "expired-page-private-key"]) {
    await connect(view.root, "slack", key)
    expect(view.root.textContent).toContain("Host authorization is required")
    expect(view.root.textContent).not.toContain("Request saved")
    assertPrivate(view.root, [key, "token_expired", "vendor-private"], view.wire)
  }
  const rows = await host.inspect()
  expect(rows.vendor).toHaveLength(2)
  expect(rows.connections).toEqual([])
  expect(rows.credentials).toEqual([])
  expect(rows.receipts).toEqual([])
}, 90000)
