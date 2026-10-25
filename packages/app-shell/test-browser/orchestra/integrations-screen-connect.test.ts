import { afterEach, expect, test } from "bun:test"
import { SessionID } from "@orchestra/schema/session-id"
import { cleanups, settle, account, target, binding, other, otherTarget, receipt, mount, button, privateState, row, field, submit, waitFor, selectTarget } from "./integrations-screen.fixture"

afterEach(() => {
  cleanups
    .splice(0)
    .reverse()
    .forEach((cleanup) => cleanup())
  localStorage.clear()
})

test("connect clears DOM key before dispatch; unknown retry uses real controller snapshot and receipt", async () => {
  const view = await mount({ lost: true })
  const secret = 'fixture-"access"\\token'
  button("Connect account").click()
  await settle()
  const key = field("key")
  key.value = secret
  field("provider").value = "discord"
  field("label").value = "فريق Alpha"
  submit()
  expect(key.value).toBe("")
  await waitFor(() => view.model.state.failure === "unknown")
  expect(view.model.state.failure).toBe("unknown")
  expect(view.keyCalls).toEqual(["private-idempotency-key-1"])
  expect(view.connectEntries).toEqual([{ field: "", form: "" }])
  expect(document.body.textContent).not.toContain("fixture secret")
  privateState(view.model, secret)
  privateState(view.model, view.keyCalls[0])
  button("Retry same request").click()
  await waitFor(() => !view.model.state.busy)
  const requests = view.calls.filter((call) => call.method === "connect")
  expect(requests.length).toBe(2)
  expect(view.keyCalls).toEqual(["private-idempotency-key-1"])
  expect(view.connectEntries).toHaveLength(1)
  expect(requests.map((call) => call.args.slice(0, 2))).toEqual([
    [{ provider: "discord", key: secret, label: "فريق Alpha" }, "private-idempotency-key-1"],
    [{ provider: "discord", key: secret, label: "فريق Alpha" }, "private-idempotency-key-1"],
  ])
  expect(document.body.textContent).toContain("Original request receipt reused")
  button("Connect account", view.host).click()
  await settle()
  field("key").value = "independent-setup-fixture-key"
  field("label").value = "Independent setup"
  submit()
  await waitFor(() => view.model.state.failure === "unknown")
  const admissions = view.calls.filter((call) => call.method === "connect")
  expect(admissions).toHaveLength(3)
  expect(view.keyCalls).toEqual(["private-idempotency-key-1", "private-idempotency-key-2"])
  expect(view.connectEntries).toEqual([
    { field: "", form: "" },
    { field: "", form: "" },
  ])
  expect(admissions[2].args.slice(0, 2)).toEqual([
    { provider: "slack", key: "independent-setup-fixture-key", label: "Independent setup" },
    "private-idempotency-key-2",
  ])
  expect(admissions[2].args[1]).not.toBe(admissions[0].args[1])
  privateState(view.model, "independent-setup-fixture-key")
  privateState(view.model, view.keyCalls[1])
}, 20_000)

test("invalid resource and SessionID block controller writes; target resource never prefilled", async () => {
  const view = await mount()
  const select = view.host.querySelector<HTMLButtonElement>(".integrations-select")
  if (!select) throw new Error("Missing account")
  select.click()
  await settle()
  expect(view.model.state.connectionID).toBe(account.connection.id)
  expect(view.calls.some((call) => call.method === "targets")).toBe(true)
  button("Create target").click()
  await settle()
  expect(field("resource").value).toBe("")
  field("environment").value = "production"
  field("resource").value = "{not json"
  submit()
  await settle()
  expect(document.querySelector("[role=alert]")?.textContent).toContain("The resource is not valid JSON.")
  expect(view.model.state.resourceError).toBeDefined()
  expect(view.calls.some((call) => call.method === "createTarget")).toBe(false)
  field("environment").value = "production"
  field("resource").value = '{"channel":"explicit-42"}'
  submit()
  await settle()
  expect(view.calls.find((call) => call.method === "createTarget")?.args.slice(0, 2)).toEqual([
    account.connection,
    { environment: "production", resource: { channel: "explicit-42" } },
  ])
  await selectTarget()
  button("Replace target").click()
  await settle()
  expect(field("resource").value).toBe("")
  button("Cancel", document.querySelector(".integrations-dialog") ?? document).click()
  await settle()
  button("Save binding").click()
  await settle()
  field("sessionID").value = "invalid-session"
  field("actions").value = "slack.message.send"
  submit()
  await settle()
  expect(view.calls.some((call) => call.method === "bind")).toBe(false)
  field("sessionID").value = binding.sessionID
  field("actions").value = "slack.message.send\ndiscord.channel.read"
  submit()
  await settle()
  expect(view.calls.find((call) => call.method === "bind")?.args.slice(0, 2)).toEqual([target.target, binding])
})

test("host bearer stays out of Basic mode, clears on submit and disposal", async () => {
  const basic = await mount()
  expect(basic.host.querySelector('[name="bearer"]')).toBeNull()
  const authorized = await mount({ basic: false })
  expect(authorized.host.querySelector('[name="bearer"]')).toBeNull()
  const view = await mount({ basic: false, unauthorized: true })
  const bearer = field("bearer")
  bearer.value = "fixture-host-bearer"
  const form = bearer.closest("form")
  if (!form) throw new Error("Missing authorization form")
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
  expect(view.tokens).toEqual(["fixture-host-bearer"])
  expect(bearer.value).toBe("")
  privateState(view.model, "fixture-host-bearer")
  bearer.value = "cancel-fixture-bearer"
  button("Cancel", form).click()
  expect(bearer.value).toBe("")
  bearer.value = "discard-on-unmount"
  view.dispose()
  expect(bearer.value).toBe("")
})

test("invalid API key clears on failed validation; open key clears on unmount", async () => {
  const view = await mount()
  button("Connect account").click()
  await settle()
  const key = field("key")
  key.value = "k".repeat(4097)
  submit()
  await settle()
  expect(key.value).toBe("")
  expect(view.calls.some((call) => call.method === "connect")).toBe(false)
  expect(document.querySelector('[role="alert"]')?.textContent).toContain("Check the selected account")
  key.value = "unmount-fixture-key"
  view.dispose()
  expect(key.value).toBe("")
})

test("busy request exposes Cancel, clears key and aborts real controller request", async () => {
  const pending = Promise.withResolvers<void>()
  const view = await mount({ hold: pending.promise })
  button("Connect account").click()
  await settle()
  const key = field("key")
  key.value = "cancel-pending-fixture-key"
  submit()
  await settle()
  expect(key.value).toBe("")
  expect(view.model.state.busy).toBe(true)
  expect(button("Connect account").disabled).toBe(true)
  expect(view.host.textContent).toContain("Request in progress")
  button("Cancel").click()
  expect(view.model.state.busy).toBe(false)
  expect(view.calls.find((call) => call.method === "connect")?.args[2]).toMatchObject({ signal: { aborted: true } })
  button("Next page").click()
  await settle()
  row(other.connection.id).click()
  await settle()
  row(otherTarget.target.id).click()
  await settle()
  button("Create target").click()
  await settle()
  field("environment").value = "other-account-write"
  field("resource").value = '{"channel":"other-explicit"}'
  submit()
  await settle()
  expect(view.calls.find((call) => call.method === "createTarget")?.args[0]).toEqual(other.connection)
  expect(view.model.state.connectionID).toBe(other.connection.id)
  expect(view.model.state.targetID).toBe(otherTarget.target.id)
  button("Connect account").click()
  await settle()
  const draft = field("key")
  draft.value = "new-account-draft"
  field("label").value = "draft-after-new-writer"
  const dialog = document.querySelector('[role="dialog"]')
  const beforeAck = view.calls.length
  pending.resolve()
  await settle()
  expect(view.calls.length).toBe(beforeAck)
  expect(view.model.state.connectionID).toBe(other.connection.id)
  expect(view.model.state.targetID).toBe(otherTarget.target.id)
  expect(document.querySelector('[role="dialog"]') === dialog).toBe(true)
  expect(draft.value).toBe("new-account-draft")
  expect(field("label").value).toBe("draft-after-new-writer")
  privateState(view.model, "cancel-pending-fixture-key")
  privateState(view.model, "new-account-draft")
  button("Cancel", dialog ?? document).click()
  await settle()
  expect(draft.value).toBe("")
})

test("remove and disconnect each dispatch selected local ref", async () => {
  const view = await mount()
  const accountButton = view.host.querySelector<HTMLButtonElement>(".integrations-select")
  if (!accountButton) throw new Error("Missing account")
  accountButton.click()
  await settle()
  await selectTarget()
  button("Remove target").click()
  await settle()
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(target.target.id)
  submit()
  await settle()
  const removals = view.calls.filter((call) => call.method === "removeTarget")
  expect(removals).toHaveLength(1)
  expect(removals[0].args[0]).toEqual(target.target)
  view.dispose()
  const next = await mount()
  const selected = next.host.querySelector<HTMLButtonElement>(".integrations-select")
  if (!selected) throw new Error("Missing account")
  selected.click()
  await settle()
  button("Disconnect account").click()
  await settle()
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(account.connection.id)
  submit()
  await settle()
  const disconnects = next.calls.filter((call) => call.method === "disconnect")
  expect(disconnects).toHaveLength(1)
  expect(disconnects[0].args[0]).toEqual(account.connection)
})

test("Arabic locale keeps dialog direction and code isolation", async () => {
  const view = await mount({ locale: "ar", direction: "rtl" })
  expect(document.documentElement.lang).toBe("ar")
  expect(document.documentElement.dir).toBe("rtl")
  expect(view.host.querySelector('bdi[dir="ltr"] code')?.textContent).toBe(account.connection.id)
  button("Connect account").click()
  await settle()
  expect(field("key").getAttribute("dir")).toBe("ltr")
  expect(field("label").getAttribute("dir")).toBe("auto")
  expect(document.querySelector('[role="dialog"]')?.getAttribute("aria-labelledby")).toBeTruthy()
})

test("replacement sends only explicit new environment and resource", async () => {
  const view = await mount()
  const accountButton = view.host.querySelector<HTMLButtonElement>(".integrations-select")
  if (!accountButton) throw new Error("Missing account")
  accountButton.click()
  await settle()
  await selectTarget()
  const selected = row(target.target.id)
  button("Replace target").click()
  await settle()
  expect(field("environment").value).toBe("")
  expect(field("resource").value).toBe("")
  field("environment").value = "staging"
  field("resource").value = '{"channel":"replacement-7"}'
  submit()
  await settle()
  expect(view.calls.find((call) => call.method === "retargetTarget")?.args.slice(0, 2)).toEqual([
    target.target,
    { environment: "staging", resource: { channel: "replacement-7" } },
  ])
  expect(view.calls.find((call) => call.method === "get")?.args[0]).toBe(account.connection.id)
  expect(view.calls.find((call) => call.method === "getTarget")?.args[0]).toBe(target.target.id)
  expect(row(target.target.id) === selected).toBe(true)
  expect(row(target.target.id).textContent).toContain("staging")
  expect(row(target.target.id).getAttribute("aria-pressed")).toBe("true")
  expect(view.model.state.targets.find((item) => item.target.id === target.target.id)?.target.generation).toBe(1)
  expect(view.host.textContent).toContain("These are live pages, not a snapshot")
  expect(view.host.textContent).toContain("current stored actor")
})

for (const direction of ["ltr", "rtl"] as const) {
  test(`semantic focus, Escape cleanup and mixed text isolation in ${direction}`, async () => {
    const view = await mount({ direction })
    expect(document.documentElement.dir).toBe(direction)
    const select = view.host.querySelector<HTMLButtonElement>(".integrations-select")
    expect(select?.querySelector("bdi:not([dir])")?.textContent).toBe("slack")
    expect(select?.querySelectorAll("bdi")[1]?.textContent).toBe(account.label)
    expect(select?.querySelector('bdi[dir="ltr"] code')?.textContent).toBe(account.connection.id)
    const opener = button("Connect account")
    opener.focus()
    opener.click()
    await settle()
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')
    expect(dialog).not.toBeNull()
    const controls = [...(dialog?.querySelectorAll<HTMLElement>("button, select, input") ?? [])]
    expect(controls.map((element) => element.getAttribute("name") ?? element.textContent?.trim())).toEqual([
      "Close",
      "provider",
      "key",
      "label",
      "Cancel",
      "Save",
    ])
    expect(dialog?.contains(document.activeElement)).toBe(true)
    // Happy DOM has no browser Tab navigation/layout; assert DOM order, autofocus and Escape restoration.
    field("key").value = "cancelled-fixture-key"
    const key = field("key")
    key.focus()
    key.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }))
    await settle()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(key.value).toBe("")
    expect(document.activeElement).toBe(opener)
    expect(view.calls.some((call) => call.method === "connect")).toBe(false)
  })
}
