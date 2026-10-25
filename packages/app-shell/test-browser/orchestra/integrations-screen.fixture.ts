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
  SessionOption,
  Target,
} from "../../src/orchestra/chapters/integrations-contract"
import { DOMFormData } from "../../happydom"
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

export const cleanups: (() => void)[] = []
export const settle = () => new Promise((resolve) => setTimeout(resolve, 30))
export const account: Connection = {
  connection: { id: Capability.ConnectionID.create(), provider: "slack", generation: 0 },
  label: "فريق Alpha 42",
  state: "active",
  credential: "present",
}
export const target = {
  target: {
    id: Capability.TargetID.create(),
    connectionID: account.connection.id,
    generation: 0,
    environment: "إنتاج prod-42",
  },
}
export const binding = { sessionID: SessionID.create(), actions: ["slack.message.send", "discord.channel.read"] }
export const other: Connection = {
  ...account,
  connection: { ...account.connection, id: Capability.ConnectionID.create(), provider: "discord" },
  label: "Other account",
}
export const nextTarget: Target = {
  target: { ...target.target, id: Capability.TargetID.create(), environment: "Next environment" },
}
export const otherTarget: Target = {
  target: {
    ...target.target,
    id: Capability.TargetID.create(),
    connectionID: other.connection.id,
    environment: "Other environment",
  },
}
export const nextBinding: Binding = { ...binding, sessionID: SessionID.make(`${binding.sessionID}z`) }
export const receipt = (data: Receipt["data"], reused = false): Receipt => ({ requestID: "public-receipt", reused, data })

export async function mount(
  options: {
    basic?: boolean
    direction?: "ltr" | "rtl"
    locale?: "en" | "ar"
    lost?: boolean
    hold?: Promise<void>
    http?: { reply: Promise<Receipt>; started: () => void }
    failList?: () => boolean
    failGet?: () => boolean
    unauthorized?: boolean
    sessions?: () => Promise<readonly SessionOption[]>
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
      if (options.unauthorized) throw { status: 401 }
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
    sessions: options.sessions ?? (async () => []),
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
  // The preload restores Bun's FormData for HTTP; the screen serializes DOM forms, which only Happy DOM's reads.
  const native = globalThis.FormData
  globalThis.FormData = DOMFormData as unknown as typeof FormData
  cleanups.push(() => {
    globalThis.FormData = native
  })
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

export function button(text: string, root: ParentNode = document) {
  const element = [...root.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent?.trim() === text,
  )
  if (!element) throw new Error(`Missing button: ${text}`)
  return element
}
export function privateState(model: Model, secret: string) {
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
export function row(id: string, root: ParentNode = document) {
  const element = [...root.querySelectorAll<HTMLButtonElement>(".integrations-select")].find(
    (element) => element.querySelector("code")?.textContent === id,
  )
  if (!element) throw new Error(`Missing row: ${id}`)
  return element
}
export function field(name: string) {
  const element = document.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[name="${name}"]`)
  if (!element) throw new Error(`Missing field: ${name}`)
  return element
}
export function submit() {
  const form = document.querySelector<HTMLFormElement>(".integrations-dialog form")
  if (!form) throw new Error("Missing integrations form")
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
}
export async function waitFor(condition: () => boolean) {
  const deadline = Date.now() + 3_000
  while (!condition() && Date.now() < deadline) await Bun.sleep(10)
  expect(condition()).toBe(true)
}
export async function selectTarget() {
  button(`${target.target.environment}${target.target.id}`).click()
  await settle()
}
