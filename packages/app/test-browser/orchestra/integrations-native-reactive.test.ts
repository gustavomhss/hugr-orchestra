import { afterEach, expect, test } from "bun:test"
import { assertPrivate, button, connect, field, idle, mountPage, startHost, submit, waitFor } from "./integrations-native.fixture"

const cleanup: (() => void | Promise<void>)[] = []
afterEach(async () => { for (const dispose of cleanup.splice(0).reverse()) await dispose(); localStorage.clear() })

test("same chapter component changes reactive URL A to B; bearer clears before B Client and stale form events fail", async () => {
  const a = await startHost("bearer")
  cleanup.push(a.stop)
  const b = await startHost("bearer")
  cleanup.push(b.stop)
  const view = mountPage(a)
  cleanup.push(view.dispose)
  await idle(view.root)
  field("bearer").value = a.bearer
  submit(".integrations-auth")
  await idle(view.root)
  await connect(view.root, "slack", "reactive-A-private-key", "Visible only A")
  expect(view.root.textContent).toContain("Visible only A")
  const oldForm = view.root.querySelector<HTMLFormElement>(".integrations-auth")
  if (!oldForm) throw new Error("Missing A authorization form")
  const oldInput = field("bearer")
  oldInput.value = a.bearer
  const gate = Promise.withResolvers<void>()
  cleanup.push(gate.resolve)
  view.wire.controls.holdNextGet = gate.promise
  const reads = view.wire.calls.length
  button("Refresh", view.root).click()
  await waitFor(() => view.wire.calls.length > reads && !!view.wire.calls.at(-1)?.response?.includes("Visible only A"))
  const pendingRead = view.wire.calls.at(-1)
  expect(pendingRead?.signal?.aborted).toBe(false)
  const before = view.wire.calls.length
  const root = view.root
  view.change(b) // One render/owner, reactive props only. No fixture remount or substitute controller.
  await idle(view.root)
  expect(view.root).toBe(root)
  expect(oldForm.isConnected).toBe(false)
  expect(oldInput.value).toBe("")
  expect(pendingRead?.signal?.aborted).toBe(true)
  expect(view.root.textContent).not.toContain("Visible only A")
  expect(view.root.textContent).toContain("Host authorization is required")
  expect(view.wire.calls.slice(before).map((call) => [new URL(call.url).origin, call.headers.has("authorization"), call.status])).toEqual([[b.url, false, 401]])
  const currentForm = view.root.querySelector(".integrations-auth")
  oldInput.value = a.bearer
  const late = new Event("submit", { bubbles: true, cancelable: true })
  oldForm.dispatchEvent(late)
  expect(late.defaultPrevented).toBe(true) // Actual retained DOM listener executes, even after its page owner changes.
  gate.resolve() // Actual A rows arrive late despite abort; B's live component must remain fenced.
  await Bun.sleep(30)
  expect(view.root.querySelector(".integrations-auth")).toBe(currentForm)
  expect(view.wire.calls).toHaveLength(before + 1)
  field("bearer").value = b.bearer
  submit(".integrations-auth")
  await idle(view.root)
  await connect(view.root, "discord", "reactive-B-private-key", "Visible only B")
  expect(view.root.textContent).toContain("Visible only B")
  expect(view.root.textContent).not.toContain("Visible only A")
  expect((await a.inspect()).connections).toHaveLength(1)
  expect((await b.inspect()).connections).toHaveLength(1)
  view.wire.calls.slice(before + 1).forEach((call) => {
    expect(new URL(call.url).origin).toBe(b.url)
    expect(call.headers.get("authorization")).toBe(`Bearer ${b.bearer}`)
    expect(call.headers.get("authorization")).not.toContain(a.bearer)
    expect(call.body).not.toContain("reactive-A-private-key")
  })
  assertPrivate(view.root, [a.bearer, b.bearer, "reactive-A-private-key", "reactive-B-private-key"], view.wire)
}, 180000)

test("same host reactive profile change discards bearer and private pending exact-retry intent", async () => {
  const host = await startHost("bearer")
  cleanup.push(host.stop)
  const view = mountPage(host)
  cleanup.push(view.dispose)
  await idle(view.root)
  field("bearer").value = host.bearer
  submit(".integrations-auth")
  await idle(view.root)
  view.wire.controls.loseNextPost = true
  await connect(view.root, "slack", "profile-A-private-key", "Saved A lost ACK")
  expect(view.root.textContent).toContain("Retry same request")
  const pending = view.wire.calls.find((call) => call.method === "POST")
  expect(pending?.status).toBe(200)
  expect((await host.inspect()).connections).toHaveLength(1)
  const oldForm = view.root.querySelector<HTMLFormElement>(".integrations-auth")
  if (!oldForm) throw new Error("Missing profile A authorization form")
  const oldInput = field("bearer")
  oldInput.value = host.bearer
  const before = view.wire.calls.length
  view.change({ ...host, directory: `${host.directory}/profile-b` })
  await idle(view.root)
  expect(oldInput.value).toBe("")
  expect(view.root.textContent).not.toContain("Retry same request")
  expect(view.root.textContent).not.toContain("Request saved")
  expect(view.wire.calls.slice(before).map((call) => [new URL(call.url).searchParams.get("location[directory]"), call.headers.has("authorization")])).toEqual([[`${host.directory}/profile-b`, false]])
  oldInput.value = host.bearer
  const late = new Event("submit", { bubbles: true, cancelable: true })
  oldForm.dispatchEvent(late)
  expect(late.defaultPrevented).toBe(true)
  await Bun.sleep(30)
  expect(view.wire.calls).toHaveLength(before + 1)
  field("bearer").value = host.bearer
  submit(".integrations-auth")
  await idle(view.root)
  expect(view.root.textContent).toContain("No accounts are configured")
  await connect(view.root, "slack", "profile-B-private-key", "Independent B")
  const rows = await host.inspect()
  expect(rows.connections.map((row) => [row.label, row.directory])).toEqual([
    ["Saved A lost ACK", host.directory], ["Independent B", `${host.directory}/profile-b`],
  ])
  expect(rows.vendor).toHaveLength(2)
  const posts = view.wire.calls.filter((call) => call.method === "POST")
  expect(posts).toHaveLength(2)
  expect(posts[1].headers.get("idempotency-key")).not.toBe(posts[0].headers.get("idempotency-key"))
  expect(posts[1].body).not.toContain("profile-A-private-key")
}, 180000)

test("reactive username/password snapshots replace Basic authority within same component", async () => {
  const host = await startHost()
  cleanup.push(host.stop)
  const view = mountPage(host)
  cleanup.push(view.dispose)
  await idle(view.root)
  expect(view.wire.calls.at(-1)?.status).toBe(200)
  view.change({ ...host, username: "wrong-native-user" })
  await idle(view.root)
  expect(view.wire.calls.at(-1)?.status).toBe(401)
  expect(view.wire.calls.at(-1)?.headers.get("authorization")).toBe(`Basic ${Buffer.from("wrong-native-user:native:password").toString("base64")}`)
  view.change({ ...host, password: "wrong-native-password" })
  await idle(view.root)
  expect(view.wire.calls.at(-1)?.status).toBe(401)
  expect(view.wire.calls.at(-1)?.headers.get("authorization")).toBe(`Basic ${Buffer.from("native:wrong-native-password").toString("base64")}`)
  view.change(host)
  await idle(view.root)
  expect(view.wire.calls.at(-1)?.status).toBe(200)
  expect(view.wire.calls.at(-1)?.headers.get("authorization")).toBe(`Basic ${Buffer.from("native:native:password").toString("base64")}`)
  expect(view.root.querySelector('[name="bearer"]')).toBeNull()
}, 90000)

test("actual authorization callback rejects owner disposed during DOM FormData capture", async () => {
  const a = await startHost("bearer")
  cleanup.push(a.stop)
  const b = await startHost("bearer")
  cleanup.push(b.stop)
  const view = mountPage(a)
  cleanup.push(view.dispose)
  await idle(view.root)
  const form = view.root.querySelector<HTMLFormElement>(".integrations-auth")
  if (!form) throw new Error("Missing actual authorization form")
  const input = field("bearer")
  const captured = { token: a.bearer, switched: false }
  // Cross the synchronous admission boundary using a DOM field only. The real form listener
  // calls the actual old onAuthorize after its owner is disposed; no callback/model is replaced.
  Object.defineProperty(input, "value", { configurable: true,
    get() {
      const token = captured.token
      if (!captured.switched) { captured.switched = true; view.change(b) }
      return token
    },
    set(value: string) { captured.token = value },
  })
  const before = view.wire.calls.length
  const event = new Event("submit", { bubbles: true, cancelable: true })
  form.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(true)
  expect(captured.switched).toBe(true) // Positive control: FormData traversed our actual old DOM field.
  await idle(view.root)
  expect(form.isConnected).toBe(false)
  expect(view.wire.calls.slice(before).map((call) => [new URL(call.url).origin, call.headers.has("authorization"), call.status])).toEqual([[b.url, false, 401]])
  expect(field("bearer").value).toBe("")
  field("bearer").value = b.bearer
  submit(".integrations-auth")
  await idle(view.root)
  expect(view.wire.calls.at(-1)?.headers.get("authorization")).toBe(`Bearer ${b.bearer}`)
  expect(view.wire.calls.at(-1)?.status).toBe(200)
}, 180000)

test("actual entry retains controller/screen across busy HTTP ACK and GET retryRead", async () => {
  const host = await startHost()
  cleanup.push(host.stop)
  const view = mountPage(host)
  cleanup.push(view.dispose)
  await idle(view.root)
  const screen = view.root.querySelector('[data-mx-page="orchestra-integrations"]')
  const opener = button("Connect account", view.root)
  const gate = Promise.withResolvers<void>()
  cleanup.push(gate.resolve)
  view.wire.controls.holdNextPost = gate.promise
  opener.click()
  await waitFor(() => !!document.querySelector(".integrations-dialog"))
  field("key").value = "stable-controller-private-key"
  field("label").value = "Stable controller"
  submit()
  await waitFor(() => view.wire.calls.at(-1)?.method === "POST" && view.wire.calls.at(-1)?.status === 200)
  expect((await host.inspect()).receipts).toHaveLength(1)
  expect(view.root.querySelector('[data-mx-page="orchestra-integrations"]')).toBe(screen)
  expect(button("Connect account", view.root)).toBe(opener)
  expect(opener.disabled).toBe(true)
  view.wire.controls.failNextGet = true
  gate.resolve()
  await idle(view.root)
  expect(view.root.textContent).toContain("Request saved")
  expect(view.root.textContent).not.toContain("Retry same request")
  expect(view.root.querySelector('[data-mx-page="orchestra-integrations"]')).toBe(screen)
  const before = view.wire.calls.length
  const alert = view.root.querySelector('[role="alert"]')
  if (!alert) throw new Error("Missing real read-recovery alert")
  button("Refresh", alert).click()
  await idle(view.root)
  expect(view.wire.calls.slice(before).map((call) => call.method)).toEqual(["GET"])
  expect(view.wire.calls.filter((call) => call.method === "POST")).toHaveLength(1)
  expect((await host.inspect()).vendor).toHaveLength(1)
  expect(view.root.textContent).toContain("Stable controller")
  expect(view.root.querySelector('[data-mx-page="orchestra-integrations"]')).toBe(screen)
  expect(button("Connect account", view.root)).toBe(opener)
}, 90000)
