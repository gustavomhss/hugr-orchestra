import { afterEach, expect, test } from "bun:test"
import type { Receipt } from "../../src/orchestra/chapters/integrations-contract"
import { cleanups, settle, account, target, binding, receipt, mount, button, privateState, row, field, submit, waitFor, selectTarget } from "./integrations-screen.fixture"

afterEach(() => {
  cleanups
    .splice(0)
    .reverse()
    .forEach((cleanup) => cleanup())
  localStorage.clear()
})

test("pagination and local destructive controls dispatch actual model methods", async () => {
  const view = await mount()
  button("Next page").click()
  await settle()
  expect(view.calls.filter((call) => call.method === "list")[1]?.args[0]).toBe(account.connection.id)
  const accountButton = view.host.querySelector<HTMLButtonElement>(".integrations-select")
  if (!accountButton) throw new Error("Missing account")
  accountButton.click()
  await settle()
  button("Next page", view.host.querySelector('[aria-labelledby="integrations-targets-title"]') ?? document).click()
  await settle()
  expect(view.calls.filter((call) => call.method === "targets")[1]?.args.slice(0, 2)).toEqual([
    account.connection.id,
    "1".padStart(32, "0"),
  ])
  await selectTarget()
  button("Next page", view.host.querySelector('[aria-labelledby="integrations-bindings-title"]') ?? document).click()
  await settle()
  expect(view.calls.filter((call) => call.method === "bindings")[1]?.args.slice(0, 2)).toEqual([
    target.target.id,
    binding.sessionID,
  ])
  button("Remove binding").click()
  await settle()
  submit()
  await settle()
  const unbinds = view.calls.filter((call) => call.method === "unbind")
  expect(unbinds).toHaveLength(1)
  expect(unbinds[0].args.slice(0, 2)).toEqual([target.target, binding.sessionID])
  button("Remove target").click()
  await settle()
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain("does not delete the provider resource")
  submit()
  await settle()
  const removals = view.calls.filter((call) => call.method === "removeTarget")
  expect(removals).toHaveLength(1)
  expect(removals[0].args[0]).toEqual(target.target)
  button("Disconnect account").click()
  await settle()
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain("does not revoke the provider token")
  submit()
  await settle()
  const disconnects = view.calls.filter((call) => call.method === "disconnect")
  expect(disconnects).toHaveLength(1)
  expect(disconnects[0].args[0]).toEqual(account.connection)
})

test("idle Close, Cancel and Escape preserve known receipt and clear only dialog fields", async () => {
  const view = await mount()
  button("Connect account").click()
  await settle()
  field("key").value = "idle-receipt-fixture-key"
  submit()
  await settle()
  const known = view.model.state.receipt
  expect(known).toBeDefined()
  expect(view.model.state.retryable).toBe(false)
  const before = view.calls.length
  for (const action of ["Close", "Cancel", "Escape"]) {
    const opener = button("Connect account", view.host)
    opener.focus()
    opener.click()
    await settle()
    const key = field("key")
    key.value = "discard-idle-draft"
    if (action === "Escape") {
      key.focus()
      key.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }))
    }
    if (action !== "Escape") button(action, key.closest("form") ?? document).click()
    await settle()
    expect(key.value).toBe("")
    expect(view.model.state.status).toBe("ready")
    expect(view.model.state.failure).toBeUndefined()
    expect(view.model.state.receipt).toEqual(known)
    expect(document.activeElement === opener).toBe(true)
  }
  expect(view.calls.length).toBe(before)
  expect(view.host.textContent).toContain("Request saved")
})

test("pending HTTP submit restores connected current-page heading while opener is disabled", async () => {
  const started = Promise.withResolvers<void>()
  const reply = Promise.withResolvers<Receipt>()
  const view = await mount({ http: { reply: reply.promise, started: started.resolve } })
  const opener = button("Connect account", view.host)
  opener.focus()
  opener.click()
  await settle()
  const key = field("key")
  key.value = "http-pending-fixture-key"
  submit()
  await started.promise
  await settle()
  expect(view.http?.requests).toEqual([{ method: "POST", path: "/api/capability/connections/connect" }])
  expect(view.model.state.busy).toBe(true)
  expect(opener.disabled).toBe(true)
  expect(key.value).toBe("")
  const heading = view.host.querySelector("#integrations-accounts-title")
  expect(heading?.isConnected).toBe(true)
  expect(heading?.getAttribute("tabindex")).toBe("-1")
  expect(document.activeElement === heading).toBe(true)
  reply.resolve(receipt({ connection: account.connection, verification: "verified" }))
  await waitFor(() => !view.model.state.busy)
  expect(view.model.state.busy).toBe(false)
  expect(view.model.state.receipt).toBeDefined()
  privateState(view.model, "http-pending-fixture-key")
})

test("old submit close cannot steal focus from newer profile dialog", async () => {
  const started = Promise.withResolvers<void>()
  const reply = Promise.withResolvers<Receipt>()
  const first = await mount({ http: { reply: reply.promise, started: started.resolve } })
  const second = await mount()
  button("Connect account", first.host).click()
  await settle()
  field("key").value = "older-scope-fixture-key"
  submit()
  button("Connect account", second.host).click()
  const current = field("key")
  current.value = "newer-scope-fixture-draft"
  current.focus()
  await started.promise
  await settle()
  // The new dialog's own autofocus may choose Close; focus must remain within its owner.
  expect(current.closest("form")?.contains(document.activeElement)).toBe(true)
  expect(first.model.state.busy).toBe(true)
  current.focus()
  first.dispose()
  reply.resolve(receipt({ connection: account.connection, verification: "verified" }))
  await settle()
  expect(document.activeElement === current).toBe(true)
  expect(current.value).toBe("newer-scope-fixture-draft")
  expect(second.model.state.failure).toBeUndefined()
  button("Cancel", current.closest("form") ?? document).click()
  await settle()
  expect(current.value).toBe("")
})

test("initial read recovery follows readRetryable and retries GET without mutation retry", async () => {
  const failure = { active: true }
  const view = await mount({ failList: () => failure.active })
  expect(view.model.state.readRetryable).toBe(true)
  expect(view.model.state.retryable).toBe(false)
  expect(view.host.textContent).not.toContain("Retry same request")
  const alert = view.host.querySelector('[role="alert"]')
  expect(alert).not.toBeNull()
  failure.active = false
  button("Refresh", alert ?? view.host).click()
  await settle()
  expect(view.calls.map((call) => call.method)).toEqual(["list", "list"])
  expect(view.model.state.status).toBe("ready")
  expect(view.model.state.failure).toBeUndefined()
  expect(view.model.state.readRetryable).toBe(false)
})

test("known ACK plus failed direct read preserves receipt and recovers GET without POST", async () => {
  const failure = { active: true }
  const view = await mount({ failGet: () => failure.active })
  row(account.connection.id, view.host).click()
  await settle()
  await selectTarget()
  button("Save binding", view.host).click()
  await settle()
  field("sessionID").value = binding.sessionID
  field("actions").value = "slack.message.edit"
  submit()
  await settle()
  const known = view.model.state.receipt
  expect(known).toBeDefined()
  expect(view.model.state.readRetryable).toBe(true)
  expect(view.model.state.retryable).toBe(false)
  expect(view.host.textContent).toContain("Request saved")
  expect(view.host.textContent).not.toContain("Retry same request")
  const alert = view.host.querySelector('[role="alert"]')
  expect(alert).not.toBeNull()
  failure.active = false
  button("Refresh", alert ?? view.host).click()
  await settle()
  expect(view.calls.filter((call) => call.method === "bind")).toHaveLength(1)
  expect(view.calls.filter((call) => call.method === "get")).toHaveLength(2)
  expect(view.model.state.failure).toBeUndefined()
  expect(view.model.state.receipt).toEqual(known)
  expect(view.model.state.connectionID).toBe(account.connection.id)
  expect(view.model.state.targetID).toBe(target.target.id)
  expect(view.host.textContent).toContain("Request saved")
})

test("binding Session-ID row keeps DOM identity, live actions and dismissal focus after refetch", async () => {
  const view = await mount()
  row(account.connection.id, view.host).click()
  await settle()
  await selectTarget()
  const item = view.host.querySelector('[aria-labelledby="integrations-bindings-title"] li.mx-card')
  const opener = item?.querySelector<HTMLButtonElement>("button")
  if (!item || !opener) throw new Error("Missing binding row")
  button("Save binding", view.host).click()
  await settle()
  field("sessionID").value = binding.sessionID
  field("actions").value = "slack.message.edit"
  submit()
  await settle()
  const current = view.host.querySelector('[aria-labelledby="integrations-bindings-title"] li.mx-card')
  expect(current === item).toBe(true)
  expect(current?.querySelector("button") === opener).toBe(true)
  expect(current?.textContent).toContain("slack.message.edit")
  expect(current?.textContent).not.toContain("slack.message.send")
  expect(view.calls.some((call) => call.method === "getTarget")).toBe(true)
  opener.focus()
  opener.click()
  await settle()
  button("Cancel", document.querySelector(".integrations-dialog") ?? document).click()
  await settle()
  expect(document.activeElement === opener).toBe(true)
  expect(opener.disabled).toBe(false)
  expect(opener.isConnected).toBe(true)
  expect(view.model.state.failure).toBeUndefined()
})
