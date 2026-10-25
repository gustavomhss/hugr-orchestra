import { afterEach, expect, test } from "bun:test"
import { SessionID } from "@orchestra/schema/session-id"
import { cleanups, settle, account, target, binding, mount, button, field, submit, selectTarget } from "./integrations-screen.fixture"

afterEach(() => {
  cleanups
    .splice(0)
    .reverse()
    .forEach((cleanup) => cleanup())
  localStorage.clear()
})

test("provider select offers every key provider and lists sign-in providers as unavailable", async () => {
  await mount()
  button("Connect account").click()
  await settle()
  const select = field("provider") as HTMLSelectElement
  const options = [...select.options]
  expect(options.filter((option) => !option.disabled).map((option) => option.value)).toEqual([
    "slack", "discord", "cloudflare", "supabase", "neon", "linear", "stripe", "openai", "runway", "globalping",
  ])
  expect(options.filter((option) => option.disabled).map((option) => option.textContent)).toEqual([
    "Sentry", "Vercel", "Grafana", "Railway", "Netlify", "Prisma Postgres",
  ])
  expect(select.querySelector("optgroup")?.label).toBe("Needs browser sign-in, not available yet")
  expect(document.querySelector("#integrations-key-hint")?.textContent).toBe("Bot token (xoxb-…)")
  select.value = "stripe"
  select.dispatchEvent(new Event("change", { bubbles: true }))
  await settle()
  expect(document.querySelector("#integrations-key-hint")?.textContent).toBe("Restricted key (rk_live_… or rk_test_…)")
})

test("a connected account shows the verification its key reported", async () => {
  const view = await mount()
  button("Connect account").click()
  await settle()
  field("key").value = "verification-fixture-key"
  submit()
  await settle()
  const connected = Object.keys(view.model.state.verifications)
  expect(connected).toHaveLength(1)
  while (!view.model.state.connections.some((item) => item.connection.id === connected[0]) && view.model.state.after)
    await view.model.load(true)
  await settle()
  const card = [...view.host.querySelectorAll<HTMLElement>(".mx-card")].find((element) =>
    element.querySelector("code")?.textContent === connected[0],
  )
  expect(card?.querySelector(".mx-badge.good")?.textContent).toBe("Verified")
  const plain = [...view.host.querySelectorAll<HTMLElement>(".mx-card")].find((element) =>
    element.querySelector("code")?.textContent === account.connection.id,
  )
  expect(plain?.textContent).not.toContain("Verified")
})

test("binding dialog loads sessions newest first, binds the picked one and keeps a typed fallback", async () => {
  const picked = SessionID.create()
  const older = SessionID.create()
  const view = await mount({
    sessions: async () => [
      { id: older, title: "Older work", updated: 1 },
      { id: picked, title: "Newest work", updated: 2 },
    ],
  })
  view.host.querySelector<HTMLButtonElement>(".integrations-select")?.click()
  await settle()
  await selectTarget()
  button("Save binding").click()
  await settle()
  const select = field("sessionPick") as HTMLSelectElement
  expect([...select.options].map((option) => option.textContent)).toEqual(["", "Newest work", "Older work"])
  expect(document.querySelector("#integrations-actions-example")?.textContent).toBe(
    "For example: read, channel.send, channel.update",
  )
  select.value = picked
  field("actions").value = "slack.message.send"
  submit()
  await settle()
  expect(view.calls.find((call) => call.method === "bind")?.args.slice(0, 2)).toEqual([
    target.target,
    { sessionID: picked, actions: ["slack.message.send"] },
  ])
  button("Save binding").click()
  await settle()
  ;(field("sessionPick") as HTMLSelectElement).value = picked
  field("sessionID").value = binding.sessionID
  field("actions").value = "slack.message.send"
  submit()
  await settle()
  expect(view.calls.filter((call) => call.method === "bind").at(-1)?.args[1]).toEqual({
    sessionID: binding.sessionID,
    actions: ["slack.message.send"],
  })
})

test("a failed session list falls back to the typed session ID", async () => {
  const view = await mount({ sessions: async () => Promise.reject({ status: 503 }) })
  view.host.querySelector<HTMLButtonElement>(".integrations-select")?.click()
  await settle()
  await selectTarget()
  button("Save binding").click()
  await settle()
  expect(document.querySelector('[name="sessionPick"]')).toBeNull()
  expect(document.querySelector(".integrations-dialog")?.textContent).toContain(
    "Sessions could not be loaded. Enter a session ID instead.",
  )
  expect((field("sessionID") as HTMLInputElement).required).toBe(true)
})

test("binding with neither a picked nor a typed session stays open and says so", async () => {
  const view = await mount({ sessions: async () => [{ id: SessionID.create(), title: "Only work", updated: 1 }] })
  view.host.querySelector<HTMLButtonElement>(".integrations-select")?.click()
  await settle()
  await selectTarget()
  button("Save binding").click()
  await settle()
  field("actions").value = "slack.message.send"
  submit()
  await settle()
  expect(view.calls.some((call) => call.method === "bind")).toBe(false)
  expect(document.querySelector(".integrations-dialog [role=alert]")?.textContent).toBe(
    "Choose a session or enter a session ID.",
  )
  expect(field("sessionPick").getAttribute("aria-invalid")).toBe("true")
  field("sessionID").value = "x"
  field("sessionID").dispatchEvent(new Event("input", { bubbles: true }))
  await settle()
  expect(document.querySelector(".integrations-dialog [role=alert]")).toBeNull()
})
