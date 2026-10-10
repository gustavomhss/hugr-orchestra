import { afterEach, expect, test } from "bun:test"
import { createRequire } from "node:module"
import { Capability } from "@orchestra/schema/capability"
import { SessionID } from "@orchestra/schema/session-id"
import { createComponent, render } from "solid-js/web"
import type {
  Api,
  Binding,
  Connection,
  Model,
  Receipt,
  Target,
} from "../../src/orchestra/chapters/integrations-contract"
import { createPendingSetup } from "./integrations-screen-http.fixture"

// Compile real components with Solid, not Bun's React JSX transform. Model imports use actual local source.
const solid = createRequire(Bun.resolveSync("vite-plugin-solid", import.meta.dir))
Bun.plugin({
  name: "solid-integrations-screen",
  setup(build) {
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
const { createIntegrationModel } = await import("../../src/orchestra/chapters/integrations-model")
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
const other: Connection = {
  ...account,
  connection: { ...account.connection, id: Capability.ConnectionID.create(), provider: "discord" },
  label: "Other account",
}
const nextTarget: Target = {
  target: { ...target.target, id: Capability.TargetID.create(), environment: "Next environment" },
}
const otherTarget: Target = {
  target: {
    ...target.target,
    id: Capability.TargetID.create(),
    connectionID: other.connection.id,
    environment: "Other environment",
  },
}
const nextBinding: Binding = { ...binding, sessionID: SessionID.make(`${binding.sessionID}z`) }
const receipt = (data: Receipt["data"], reused = false): Receipt => ({ requestID: "public-receipt", reused, data })

async function mount(
  options: {
    basic?: boolean
    direction?: "ltr" | "rtl"
    locale?: "en" | "ar"
    lost?: boolean
    hold?: Promise<void>
    http?: { reply: Promise<Receipt>; started: () => void }
    failList?: () => boolean
    failGet?: () => boolean
  } = {},
) {
  const calls: { method: string; args: unknown[] }[] = []
  const record = (method: string, args: unknown[]) => calls.push({ method, args })
  const accounts = new Map<Capability.ConnectionID, Connection>(
    [account, other].map((row) => [row.connection.id, structuredClone(row)]),
  )
  const targets = new Map<Capability.TargetID, Target>(
    [target, nextTarget, otherTarget].map((row) => [row.target.id, structuredClone(row)]),
  )
  const bindings = new Map<Capability.TargetID, Binding[]>([
    [target.target.id, structuredClone([binding, nextBinding])],
  ])
  const setupReceipts = new Map<string, Receipt>()
  const http = options.http && createPendingSetup(options.http.reply, options.http.started)
  if (http) cleanups.push(http.stop)
  const api: Api = {
    get: async (...args) => {
      record("get", args)
      if (options.failGet?.()) throw { status: 503 }
      const row = accounts.get(args[0])
      if (!row) throw { status: 404 }
      return structuredClone(row)
    },
    getTarget: async (...args) => {
      record("getTarget", args)
      const row = targets.get(args[0])
      if (!row) throw { status: 404 }
      return structuredClone(row)
    },
    list: async (...args) => {
      record("list", args)
      if (options.failList?.()) throw { status: 503 }
      const rows = [...accounts.values()]
        .filter((row) => !args[0] || row.connection.id > args[0])
        .sort((a, b) => a.connection.id.localeCompare(b.connection.id))
      return {
        items: structuredClone(rows.slice(0, 1)),
        ...(rows.length > 1 ? { after: rows[0].connection.id } : {}),
        coverage: "live",
      }
    },
    targets: async (...args) => {
      record("targets", args)
      const rows = [...targets.values()]
        .filter((row) => row.target.connectionID === args[0])
        .sort((a, b) => a.target.id.localeCompare(b.target.id))
      const offset = Number(args[1] ?? 0)
      return {
        items: structuredClone(rows.slice(offset, offset + 1)),
        ...(rows.length > offset + 1 ? { after: String(offset + 1).padStart(32, "0") } : {}),
        coverage: "live",
      }
    },
    bindings: async (...args) => {
      record("bindings", args)
      const rows = (bindings.get(args[0]) ?? [])
        .filter((row) => !args[1] || row.sessionID > args[1])
        .sort((a, b) => a.sessionID.localeCompare(b.sessionID))
      return {
        items: structuredClone(rows.slice(0, 1)),
        ...(rows.length > 1 ? { after: rows[0].sessionID } : {}),
        coverage: "current-actor",
      }
    },
    connect: async (...args) => {
      record("connect", args)
      if (http) return http.connect(args[0], args[1], args[2])
      await options.hold
      const previous = setupReceipts.get(args[1])
      if (previous) return structuredClone({ ...previous, reused: true })
      const row: Connection = {
        connection: { id: Capability.ConnectionID.create(), provider: args[0].provider, generation: 0 },
        ...(args[0].label !== undefined ? { label: args[0].label } : {}),
        state: "active",
        credential: "present",
      }
      accounts.set(row.connection.id, row)
      const saved = receipt({ connection: row.connection, verification: "verified" })
      setupReceipts.set(args[1], saved)
      if (options.lost) throw new Error("fixture secret: never display")
      return structuredClone(saved)
    },
    createTarget: async (...args) => {
      record("createTarget", args)
      const row = {
        target: {
          id: Capability.TargetID.create(),
          connectionID: args[0].id,
          generation: 0,
          environment: args[1].environment,
        },
      }
      targets.set(row.target.id, row)
      return receipt(row)
    },
    retargetTarget: async (...args) => {
      record("retargetTarget", args)
      const row = { target: { ...args[0], generation: args[0].generation + 1, environment: args[1].environment } }
      targets.set(row.target.id, row)
      return receipt(row)
    },
    bind: async (...args) => {
      record("bind", args)
      bindings.set(args[0].id, [{ sessionID: args[1].sessionID, actions: [...args[1].actions] }])
      return receipt(null)
    },
    unbind: async (...args) => {
      record("unbind", args)
      bindings.set(
        args[0].id,
        (bindings.get(args[0].id) ?? []).filter((row) => row.sessionID !== args[1]),
      )
      return receipt(null)
    },
    removeTarget: async (...args) => {
      record("removeTarget", args)
      targets.delete(args[0].id)
      bindings.delete(args[0].id)
      return receipt(null)
    },
    disconnect: async (...args) => {
      record("disconnect", args)
      const row = accounts.get(args[0].id)
      if (!row) throw { status: 404 }
      accounts.set(args[0].id, {
        ...row,
        connection: { ...row.connection, generation: row.connection.generation + 1 },
        state: "disconnected",
      })
      Array.from(targets.values())
        .filter((item) => item.target.connectionID === args[0].id)
        .forEach((item) => {
          targets.delete(item.target.id)
          bindings.delete(item.target.id)
        })
      return receipt(null)
    },
  }
  const keyCalls: string[] = []
  const model = createIntegrationModel(api, () => {
    const key = `private-idempotency-key-${keyCalls.length + 1}`
    keyCalls.push(key)
    return key
  })
  const connectEntries: { field: string; form: FormDataEntryValue | null }[] = []
  const connect = model.connect
  // Observe the real synchronous admission boundary, then call through on the same Model instance.
  Object.defineProperty(model, "connect", {
    value: (input: Parameters<Model["connect"]>[0]) => {
      const password = document.querySelector<HTMLInputElement>(".integrations-dialog input[name='key']")
      if (!password?.form) throw new Error("Missing password form at Model.connect entry")
      const snapshot = { field: password.value, form: new FormData(password.form).get("key") }
      connectEntries.push(snapshot)
      const result = connect(input)
      expect(snapshot).toEqual({ field: "", form: "" })
      return result
    },
  })
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
                onAuthorize: (token) => {
                  const bearer = host.querySelector<HTMLInputElement>("input[name='bearer']")
                  if (!bearer?.form) throw new Error("Missing bearer form at onAuthorize entry")
                  const snapshot = { field: bearer.value, form: new FormData(bearer.form).get("bearer") }
                  tokens.push(token)
                  expect(snapshot).toEqual({ field: "", form: "" })
                },
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
  return { model, host, calls, tokens, dispose, http, keyCalls, connectEntries }
}

function button(text: string, root: ParentNode = document) {
  const element = [...root.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent?.trim() === text,
  )
  if (!element) throw new Error(`Missing button: ${text}`)
  return element
}
function privateState(model: Model, secret: string) {
  const strings = (value: unknown): string[] =>
    typeof value === "string"
      ? [value]
      : value && typeof value === "object"
        ? Object.values(value).flatMap(strings)
        : []
  // Positive control also covers escaped tokens: inspect decoded leaves, never serialized JSON spelling.
  expect(strings({ nested: { secret } })).toContain(secret)
  expect(strings(model.state).some((value) => value === secret || (secret.length >= 8 && value.includes(secret)))).toBe(
    false,
  )
  expect(model.state).not.toHaveProperty("key")
  expect(model.state).not.toHaveProperty("bearer")
  expect(model.state).not.toHaveProperty("idempotencyKey")
}
function row(id: string, root: ParentNode = document) {
  const element = [...root.querySelectorAll<HTMLButtonElement>(".integrations-select")].find(
    (element) => element.querySelector("code")?.textContent === id,
  )
  if (!element) throw new Error(`Missing row: ${id}`)
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
async function waitFor(condition: () => boolean) {
  const deadline = Date.now() + 3_000
  while (!condition() && Date.now() < deadline) await Bun.sleep(10)
  expect(condition()).toBe(true)
}
async function selectTarget() {
  button(`${target.target.environment}${target.target.id}`).click()
  await settle()
}

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
