import { afterEach, expect, test } from "bun:test"
import { createRequire } from "node:module"
import { Capability } from "@orchestra/schema/capability"
import { SessionID } from "@orchestra/schema/session-id"
import { createComponent, render } from "solid-js/web"
import type { Api, Connection, Model, Receipt } from "../../src/orchestra/chapters/integrations-contract"

// Compile real components with Solid, not Bun's React JSX transform. Optional source override exercises
// the actual sibling author's controller before landing, without merging or substituting a fake Model.
const solid = createRequire(Bun.resolveSync("vite-plugin-solid", import.meta.dir))
Bun.plugin({
  name: "solid-integrations-screen",
  setup(build) {
    build.onLoad({ filter: /integrations-model\.ts$/ }, async (args) => ({
      // A sibling worktree has its own installation. Share this test's Solid runtime for reactivity.
      contents: (await Bun.file(args.path).text()).replace(
        /from "(solid-js(?:\/store)?)"/g,
        (_match, spec: string) => `from ${JSON.stringify(Bun.resolveSync(spec, import.meta.dir))}`,
      ),
      loader: "ts",
    }))
    build.onLoad({ filter: /\.tsx(?:\?integrations-solid)?$/ }, async (args) => {
      const file = args.path.replace(/\?integrations-solid$/, "")
      const result = await solid("@babel/core").transformAsync(await Bun.file(file).text(), {
        filename: file,
        presets: [[solid("babel-preset-solid"), { generate: "dom" }]],
        parserOpts: { plugins: ["jsx", "typescript"] },
        configFile: false,
        babelrc: false,
      })
      return { contents: result.code, loader: "ts" }
    })
  },
})
const { createIntegrationModel }: { createIntegrationModel: (api: Api, key?: () => string) => Model } = await import(
  process.env.INTEGRATIONS_MODEL_SOURCE ?? "../../src/orchestra/chapters/integrations-model"
)
const { IntegrationsScreen }: typeof import("../../src/orchestra/chapters/integrations-screen") = await import(
  "../../src/orchestra/chapters/integrations-screen"
)
const { LanguageProvider, useLanguage }: typeof import("../../src/context/language") = await import(
  "../../src/context/language"
)
const { PlatformProvider }: typeof import("../../src/context/platform") = await import("../../src/context/platform")

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups
    .splice(0)
    .reverse()
    .forEach((cleanup) => cleanup())
  localStorage.clear()
})
const settle = () => new Promise((resolve) => setTimeout(resolve, 30))
const account: Connection = {
  connection: { id: Capability.ConnectionID.create(), provider: "slack", generation: 0 },
  label: "فريق Alpha 42",
  state: "active",
  credential: "present",
}
const target = {
  target: {
    id: Capability.TargetID.create(),
    connectionID: account.connection.id,
    generation: 0,
    environment: "إنتاج prod-42",
  },
}
const binding = { sessionID: SessionID.create(), actions: ["slack.message.send", "discord.channel.read"] }
const receipt = (data: Receipt["data"], reused = false): Receipt => ({ requestID: "public-receipt", reused, data })

async function mount(
  options: {
    basic?: boolean
    direction?: "ltr" | "rtl"
    locale?: "en" | "ar"
    lost?: boolean
    hold?: Promise<void>
  } = {},
) {
  const calls: { method: string; args: unknown[] }[] = []
  const record = (method: string, args: unknown[]) => calls.push({ method, args })
  const api: Api = {
    list: async (...args) => {
      record("list", args)
      return { items: [account], after: account.connection.id, coverage: "live" }
    },
    targets: async (...args) => {
      record("targets", args)
      return { items: [target], after: "a".repeat(32), coverage: "live" }
    },
    bindings: async (...args) => {
      record("bindings", args)
      return { items: [binding], after: binding.sessionID, coverage: "current-actor" }
    },
    connect: async (...args) => {
      record("connect", args)
      await options.hold
      if (options.lost && calls.filter((call) => call.method === "connect").length === 1)
        throw new Error("fixture secret: never display")
      return receipt({ connection: account.connection, verification: "verified" }, !!options.lost)
    },
    createTarget: async (...args) => {
      record("createTarget", args)
      return receipt(target)
    },
    retargetTarget: async (...args) => {
      record("retargetTarget", args)
      return receipt(target)
    },
    bind: async (...args) => {
      record("bind", args)
      return receipt(null)
    },
    unbind: async (...args) => {
      record("unbind", args)
      return receipt(null)
    },
    removeTarget: async (...args) => {
      record("removeTarget", args)
      return receipt(null)
    },
    disconnect: async (...args) => {
      record("disconnect", args)
      return receipt(null)
    },
  }
  const model = createIntegrationModel(api, () => "private-idempotency-key")
  await model.load()
  const host = document.body.appendChild(document.createElement("div"))
  const tokens: string[] = []
  const dispose = render(
    () =>
      createComponent(PlatformProvider, {
        value: { platform: "web", openExternal: () => {}, restart: async () => {}, notify: async () => {} },
        get children() {
          return createComponent(LanguageProvider, {
            locale: options.locale ?? "en",
            get children() {
              useLanguage().setLocale(options.locale ?? "en")
              useLanguage().setDirection(options.direction ?? "ltr")
              return createComponent(IntegrationsScreen, {
                model,
                basic: options.basic ?? true,
                onAuthorize: (token) => tokens.push(token),
              })
            },
          })
        },
      }),
    host,
  )
  cleanups.push(() => {
    dispose()
    model.dispose()
    host.remove()
  })
  await settle()
  return { model, host, calls, tokens, dispose }
}

function button(text: string, root: ParentNode = document) {
  const element = [...root.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent?.trim() === text,
  )
  if (!element) throw new Error(`Missing button: ${text}`)
  return element
}
function field(name: string) {
  const element = document.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[name="${name}"]`)
  if (!element) throw new Error(`Missing field: ${name}`)
  return element
}
function submit() {
  const form = document.querySelector<HTMLFormElement>(".integrations-dialog form")
  if (!form) throw new Error("Missing integrations form")
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
}
async function selectTarget() {
  button(`${target.target.environment}${target.target.id}`).click()
  await settle()
}

test("connect clears DOM key before dispatch; unknown retry uses real controller snapshot and receipt", async () => {
  const view = await mount({ lost: true })
  button("Connect account").click()
  await settle()
  const key = field("key")
  key.value = "fixture-access-token"
  field("provider").value = "discord"
  field("label").value = "فريق Alpha"
  submit()
  expect(key.value).toBe("")
  await settle()
  expect(view.model.state.failure).toBe("unknown")
  expect(document.body.textContent).not.toContain("fixture secret")
  expect(JSON.stringify(view.model.state)).not.toContain("fixture-access-token")
  button("Retry same request").click()
  await settle()
  const requests = view.calls.filter((call) => call.method === "connect")
  expect(requests.length).toBe(2)
  expect(requests.map((call) => call.args.slice(0, 2))).toEqual([
    [{ provider: "discord", key: "fixture-access-token", label: "فريق Alpha" }, "private-idempotency-key"],
    [{ provider: "discord", key: "fixture-access-token", label: "فريق Alpha" }, "private-idempotency-key"],
  ])
  expect(document.body.textContent).toContain("Original request receipt reused")
})

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
  expect(document.querySelector("[role=alert]")?.textContent).toContain("Check the selected account")
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
  const view = await mount({ basic: false })
  const bearer = field("bearer")
  bearer.value = "fixture-host-bearer"
  const form = bearer.closest("form")
  if (!form) throw new Error("Missing authorization form")
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
  expect(view.tokens).toEqual(["fixture-host-bearer"])
  expect(bearer.value).toBe("")
  expect(JSON.stringify(view.model.state)).not.toContain("fixture-host-bearer")
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
  pending.resolve()
  await settle()
  expect(view.model.state.receipt).toBeUndefined()
  expect(JSON.stringify(view.model.state)).not.toContain("cancel-pending-fixture-key")
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
  expect(view.calls.find((call) => call.method === "removeTarget")?.args[0]).toEqual(target.target)
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
  expect(next.calls.find((call) => call.method === "disconnect")?.args[0]).toEqual(account.connection)
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
      "Close dialog",
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
    "a".repeat(32),
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
  expect(view.calls.find((call) => call.method === "unbind")?.args.slice(0, 2)).toEqual([
    target.target,
    binding.sessionID,
  ])
  button("Remove target").click()
  await settle()
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain("does not delete the provider resource")
  submit()
  await settle()
  expect(view.calls.find((call) => call.method === "removeTarget")?.args[0]).toEqual(target.target)
  button("Disconnect account").click()
  await settle()
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain("does not revoke the provider token")
  submit()
  await settle()
  expect(view.calls.find((call) => call.method === "disconnect")?.args[0]).toEqual(account.connection)
})
