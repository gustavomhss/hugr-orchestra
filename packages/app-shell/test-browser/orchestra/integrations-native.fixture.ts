import { expect, mock } from "bun:test"
import { isolatedSolid } from "./integrations-solid.fixture"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createComponent, render } from "solid-js/web"
import { createStore } from "solid-js/store"
import type { ChapterPageProps } from "../../src/orchestra/chapter-route"
import { DOMFormData } from "../../happydom"
import type { SessionID } from "@orchestra/schema/session-id"
import type { CapabilityConnectionTable, CapabilityBindingTable, CapabilityTargetTable, CapabilityRequestTable } from "@orchestra/core/capability/sql"
import type { CredentialTable } from "@orchestra/core/credential/sql"

export const load = isolatedSolid("integrations-native")
// The page only reads Global for the profile eyebrow; with no known project it falls back to the directory name.
mock.module(`${Bun.resolveSync("../../src/context/global", import.meta.dir)}?integrations-native`, () => ({
  useGlobal: () => ({ ensureServerCtx: () => ({ projects: { list: () => [] } }) }),
}))
const { default: IntegrationsPage }: typeof import("../../src/orchestra/chapters/integrations") = await load(
  "../../src/orchestra/chapters/integrations",
)
const { LanguageProvider, useLanguage }: typeof import("../../src/context/language") = await load(
  "../../src/context/language",
)
const { PlatformProvider }: typeof import("../../src/context/platform") = await load("../../src/context/platform")

type Snapshot = {
  connections: (typeof CapabilityConnectionTable.$inferSelect)[]
  credentials: (typeof CredentialTable.$inferSelect)[]
  targets: (typeof CapabilityTargetTable.$inferSelect)[]
  bindings: (typeof CapabilityBindingTable.$inferSelect)[]
  receipts: (typeof CapabilityRequestTable.$inferSelect)[]
  vendor: { method: string; path: string; authorization: string | null }[]
}
export type Host = { url: string; directory: string; sessionID: SessionID; bearer: string; username?: string; password?: string }
export async function startHost(mode: "basic" | "bearer" = "basic") {
  const directory = await mkdtemp(join(tmpdir(), "integrations-native-"))
  await mkdir(join(directory, "profile-b"))
  const child = Bun.spawn([process.execPath, "--conditions=browser", join(import.meta.dir, "integrations-native-server.fixture.ts"), mode], {
    cwd: join(import.meta.dir, "../.."), stdin: "pipe", stdout: "pipe", stderr: "pipe",
    env: { ...process.env, ORCHESTRA_TEST_HOME: directory, ORCHESTRA_DB: join(directory, "proof.sqlite"),
      XDG_DATA_HOME: join(directory, "data"), XDG_CONFIG_HOME: join(directory, "config"),
      XDG_CACHE_HOME: join(directory, "cache"), XDG_STATE_HOME: join(directory, "state"),
      ORCHESTRA_DISABLE_PROJECT_CONFIG: "1",
      ORCHESTRA_DISABLE_MODELS_FETCH: "1", ORCHESTRA_TEST_CHANNEL: "test", TMPDIR: directory },
  })
  const stderr = new Response(child.stderr).text()
  const reader = child.stdout.getReader()
  const output = { text: "" }
  const host = await Promise.race([
    (async () => {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) throw new Error(`Native fixture exited: ${await stderr}`)
        output.text += new TextDecoder().decode(chunk.value)
        const line = output.text.split("\n").find((line) => line.startsWith('{"url":'))
        if (line) return JSON.parse(line) as Host
      }
    })(),
    Bun.sleep(60000).then(() => { throw new Error(`Native fixture timeout: ${output.text}`) }),
  ]).catch(async (error) => {
    child.stdin.end(); child.kill(); await child.exited; await rm(directory, { recursive: true, force: true }); throw new Error(`${error}\n${await stderr}`)
  })
  const control = async (path: string) => {
    const response = await Bun.fetch(`${host.url}/__fixture/${path}`, { method: "POST" })
    if (!response.ok) throw new Error(`Fixture control ${path} failed: ${response.status} ${await response.text()}`)
  }
  return { ...host,
    inspect: async () => (await Bun.fetch(`${host.url}/__fixture/inspect`)).json() as Promise<Snapshot>,
    changeActor: () => control("actor"),
    expire: () => control("expire"),
    removeCredential: () => control("credential"),
    stop: async () => { child.stdin.end(); child.kill(); await child.exited; await reader.cancel(); await stderr; await rm(directory, { recursive: true, force: true }) },
  }
}

export function transport() {
  const calls: { url: string; method: string; headers: Headers; body: string; signal?: AbortSignal | null; status?: number;
    response?: string; delivered?: boolean }[] = []
  const controls = { loseNextPost: false, failNextGet: false, holdNextGet: undefined as Promise<void> | undefined,
    holdNextPost: undefined as Promise<void> | undefined }
  const fetch = Object.assign(async (input: Parameters<typeof globalThis.fetch>[0], init?: Parameters<typeof globalThis.fetch>[1]) => {
    const url = typeof input === "string" || input instanceof URL ? String(input) : input.url
    if (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) throw new Error(`Non-loopback transport: ${url}`)
    const request = { url, method: init?.method ?? "GET", headers: new Headers(init?.headers),
      body: String(init?.body ?? ""), signal: init?.signal, status: undefined as number | undefined, response: undefined as string | undefined,
      delivered: false }
    calls.push(request)
    if (controls.failNextGet && request.method === "GET") {
      controls.failNextGet = false
      request.status = 503
      request.response = JSON.stringify({ message: "fixture-private-read-error" })
      request.delivered = true
      return new Response(request.response, { status: 503 })
    }
    const hold = request.method === "GET" ? controls.holdNextGet : controls.holdNextPost
    if (hold && request.method === "GET") controls.holdNextGet = undefined
    if (hold && request.method === "POST") controls.holdNextPost = undefined
    const response = await Bun.fetch(url, { ...init, headers: Object.fromEntries(request.headers) })
    request.status = response.status
    request.response = await response.clone().text()
    // Actual HTTP accepted/committed, then transport loses response before generated client receives it.
    if (request.method === "POST" && controls.loseNextPost) {
      controls.loseNextPost = false
      throw new TypeError("fixture-private-response-loss")
    }
    // Deliberately deliver late even after abort; model's owner fence must hold too.
    if (hold) await hold
    request.delivered = true // Positive signal for absence checks: the held response reached the client.
    return response
  }, { preconnect: Bun.fetch.preconnect })
  return { calls, controls, fetch }
}

// The preload restores Bun's FormData for HTTP; the page serializes DOM forms, which only Happy DOM's reads.
const nativeFormData = globalThis.FormData

export function mountPage(host: Host, wire = transport(), direction: "ltr" | "rtl" = "ltr") {
  globalThis.FormData = DOMFormData as unknown as typeof FormData
  const root = document.body.appendChild(document.createElement("div"))
  const mounts = { count: 0 } // Component instantiations; reactive prop changes must not add one.
  const [props, setProps] = createStore<ChapterPageProps>({ directory: host.directory,
    server: { type: "http", http: { url: host.url, username: host.username ?? "native", password: host.password } } })
  const dispose = render(() => createComponent(PlatformProvider, {
    value: { platform: "web", fetch: wire.fetch, openExternal: (url) => { window.open(url, "_blank", "noopener,noreferrer") },
      restart: async () => { window.location.reload() }, notify: async () => {} },
    get children() { return createComponent(LanguageProvider, { locale: "en", get children() {
      useLanguage().setLocale("en")
      useLanguage().setDirection(direction)
      return createComponent((page: ChapterPageProps) => { mounts.count++; return IntegrationsPage(page) }, props)
    } }) },
  }), root)
  return { root, wire, mounts: () => mounts.count, dispose: () => { dispose(); root.remove(); globalThis.FormData = nativeFormData },
    change: (next: Host) => setProps({ directory: next.directory,
      server: { type: "http", http: { url: next.url, username: next.username ?? "native", password: next.password } } }) }
}
export async function waitFor(condition: () => boolean) {
  const deadline = Date.now() + 5000
  while (!condition() && Date.now() < deadline) await Bun.sleep(10)
  expect(condition()).toBe(true)
}
export function button(text: string, root: ParentNode = document) {
  const value = [...root.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.trim() === text)
  if (!value) throw new Error(`Missing button: ${text}`)
  return value
}
export function field(name: string) {
  const value = document.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`[name="${name}"]`)
  if (!value) throw new Error(`Missing field: ${name}`)
  return value
}
export function submit(selector = ".integrations-dialog form") {
  const form = document.querySelector<HTMLFormElement>(selector)
  if (!form) throw new Error(`Missing form: ${selector}`)
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
}
export async function idle(root: ParentNode) {
  await waitFor(() => !root.querySelector('[aria-busy="true"]') && !root.textContent?.includes("Loading integrations…"))
}
export async function connect(root: ParentNode, provider: "slack" | "discord", key: string, label?: string) {
  button("Connect account", root).click()
  await waitFor(() => !!document.querySelector(".integrations-dialog"))
  field("provider").value = provider
  field("key").value = key
  if (label !== undefined) field("label").value = label
  const password = field("key")
  submit()
  expect(password.value).toBe("")
  await waitFor(() => !document.querySelector(".integrations-dialog"))
  await idle(root)
}
export async function select(id: string, root: ParentNode) {
  const value = [...root.querySelectorAll<HTMLButtonElement>(".integrations-select")].find((item) => item.querySelector("code")?.textContent === id)
  if (!value) throw new Error(`Missing selection: ${id}`)
  value.click()
  await idle(root)
}
export function assertPrivate(root: ParentNode, values: readonly string[], wire: ReturnType<typeof transport>) {
  const publicText = [root.textContent, document.querySelector(".integrations-dialog")?.textContent,
    Array.from({ length: localStorage.length }, (_, index) => localStorage.getItem(localStorage.key(index)!)).join(""),
    ...wire.calls.map((call) => call.response ?? "")].join("\n")
  // Positive controls: the scan covers rendered page text and at least one recorded wire response.
  expect(root.textContent?.trim()).toBeTruthy()
  expect(wire.calls.some((call) => !!call.response)).toBe(true)
  values.forEach((value) => expect(publicText).not.toContain(value))
}
