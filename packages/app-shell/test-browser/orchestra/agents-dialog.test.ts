import { afterEach, expect, test } from "bun:test"
import { createRequire } from "node:module"
import path from "node:path"
import { createComponent } from "solid-js"
import { createStore } from "solid-js/store"
import { render } from "solid-js/web"
import { Dialog } from "@kobalte/core/dialog"
import type { Agent, Provider } from "@/v2-wire"
import type { AgentFileInfo, AgentFileInput } from "@/v2-types"

import type { SubagentModelPolicy } from "@/components/subagent-model-rules"

// Compile the actual form and providers with Solid. Isolate the first-party graph from other tests' module mocks
// and React-compiled JSX, following relay-policy.test.ts.
const solid = createRequire(Bun.resolveSync("vite-plugin-solid", import.meta.dir))
Bun.plugin({
  name: "solid-agent-dialog",
  setup(build) {
    build.onLoad({ filter: /\.tsx?\?agents-dialog$/ }, async (args) => {
      const file = args.path.replace(/\?agents-dialog$/, "")
      const source = await Bun.file(file).text()
      const code = file.endsWith(".tsx")
        ? (
            await solid("@babel/core").transformAsync(source, {
              filename: file,
              presets: [[solid("babel-preset-solid"), { generate: "dom" }]],
              parserOpts: { plugins: ["jsx", "typescript"] },
              configFile: false,
              babelrc: false,
            })
          ).code
        : source
      const contents = code.replace(
        /(from\s+)(["'])([^"']+)\2/g,
        (match: string, lead: string, _quote: string, spec: string) => {
          const resolved = Bun.resolveSync(spec, path.dirname(file))
          return /\.tsx?$/.test(resolved) && !resolved.includes("node_modules")
            ? `${lead}${JSON.stringify(`${resolved}?agents-dialog`)}`
            : match
        },
      )
      return { contents, loader: "ts" }
    })
  },
})
const load = (specifier: string) => import(`${Bun.resolveSync(specifier, import.meta.dir)}?agents-dialog`)
const { AgentDialog }: typeof import("@/orchestra/chapters/agents-dialog") = await load(
  "@/orchestra/chapters/agents-dialog",
)
const { LanguageProvider }: typeof import("@/context/language") = await load("@/context/language")
const { PlatformProvider }: typeof import("@/context/platform") = await load("@/context/platform")
const { SubagentModelPicker }: typeof import("@/components/subagent-model-picker") = await load(
  "@/components/subagent-model-picker",
)
const { List }: typeof import("@orchestra/ui/list") = await load("@orchestra/ui/list")
const { pendingPolicy, clearPending }: typeof import("@/components/draft-subagent-models") = await load(
  "@/components/draft-subagent-models",
)

const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()))

const agent: Agent = {
  id: "backend",
  name: "Services / 后端",
  mode: "subagent",
  permission: [],
  options: {},
  description: "Backend role",
}
const file: AgentFileInfo = { path: "/profile/.orchestra/agent/backend.md", exists: true, revision: "r1" }

async function mount(
  input: {
    agent?: Agent
    agents?: Agent[]
    file?: AgentFileInfo
    fail?: boolean
    // Holds every write open until it resolves, to look at the dialog while a write is in flight.
    hold?: Promise<void>
    modelsStatus?: "pending" | "error" | "success"
  } = {},
) {
  const root = document.createElement("div")
  document.body.append(root)
  const reads: string[] = []
  const writes: { id: string; input: AgentFileInput }[] = []
  const closed: boolean[] = []
  const removed: string[] = []
  const dispose = render(
    () =>
      createComponent(PlatformProvider, {
        value: { platform: "web", openExternal() {}, restart: async () => {}, notify: async () => {} },
        get children() {
          return createComponent(LanguageProvider, {
            locale: "en",
            get children() {
              return createComponent(AgentDialog, {
                agent: input.agent,
                agents: input.agents ?? [agent],
                directory: "/profile",
                modelsStatus: input.modelsStatus,
                models: [
                  {
                    id: "openrouter",
                    name: "Router",
                    models: [
                      { value: "openrouter/team/model", label: "Tool model", unavailable: undefined },
                      { value: "openrouter/image", label: "Image model", unavailable: "incompatible" },
                    ],
                  },
                ],
                load: async (id) => {
                  reads.push(id)
                  return input.file ?? file
                },
                save: async (id, payload) => {
                  writes.push({ id, input: payload })
                  await input.hold
                  if (input.fail) throw new Error("write failed")
                },
                onRemoved: (removedAgent) => removed.push(removedAgent.id ?? removedAgent.name),
                onClose: () => closed.push(true),
              })
            },
          })
        },
      }),
    root,
  )
  cleanups.push(() => {
    dispose()
    root.remove()
  })
  await new Promise((resolve) => setTimeout(resolve, 0))
  return { root, reads, writes, closed, removed }
}

function submit(root: HTMLElement) {
  root.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
  return new Promise((resolve) => setTimeout(resolve, 0))
}

test("renamed agent loads and saves by stable id", async () => {
  const saved = await mount({ agent })
  expect(saved.reads).toEqual(["backend"])
  await submit(saved.root)
  expect(saved.writes).toEqual([{ id: "backend", input: { permission: {}, revision: "r1" } }])
  expect(saved.closed).toEqual([true])
})

test("renamed agent is removed by stable id", async () => {
  const removed = await mount({ agent })
  const button = [...removed.root.querySelectorAll("button")].find((item) => item.textContent === "Remove agent")!
  expect(button).toBeDefined()
  button.click()
  await submit(removed.root)
  expect(removed.writes[0]).toMatchObject({ id: "backend", input: { disable: true, revision: "r1" } })
})

test("the dialog cannot be dismissed while a write is in flight, and a finished remove is reported", async () => {
  const gate = Promise.withResolvers<void>()
  const form = await mount({ agent, hold: gate.promise })
  const button = [...form.root.querySelectorAll("button")].find((item) => item.textContent === "Remove agent")!
  button.click()
  await submit(form.root)
  const cancel = [...form.root.querySelectorAll("button")].find((item) => item.textContent === "Cancel")!
  expect(cancel.disabled).toBe(true)
  form.root.querySelector("dialog")!.dispatchEvent(new Event("cancel", { cancelable: true }))
  expect(form.closed).toEqual([])
  gate.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(form.closed).toEqual([true])
  expect(form.removed).toEqual(["backend"])
})

test("create rejects an occupied stable id even when its display name differs", async () => {
  const form = await mount()
  const name = form.root.querySelector<HTMLInputElement>('input[name="name"]')!
  name.value = "backend"
  name.dispatchEvent(new Event("input", { bubbles: true }))
  await submit(form.root)
  expect(form.writes).toEqual([])
  expect(form.root.querySelector('[role="alert"]')?.textContent).toBe("An agent with this name already exists.")
})

test("Maestro keeps its fixed name and mode and cannot be removed", async () => {
  const form = await mount({ agent: { ...agent, id: "maestro", name: "maestro", mode: "primary" } })
  expect(form.root.querySelector<HTMLInputElement>('input[name="name"]')?.readOnly).toBe(true)
  expect(form.root.querySelector<HTMLSelectElement>('select[name="mode"]')?.disabled).toBe(true)
  expect([...form.root.querySelectorAll("button")].some((item) => item.textContent === "Remove agent")).toBe(false)
  await submit(form.root)
  expect(form.writes[0]).toMatchObject({ id: "maestro", input: { mode: "primary" } })
})

test("inheritance is explicit; slash model choices survive a failed save and retry", async () => {
  const behavior = { agent: { ...agent, model: { providerID: "openrouter", modelID: "team/model" } }, fail: true }
  const form = await mount(behavior)
  const model = form.root.querySelector<HTMLSelectElement>('select[name="model"]')!
  expect(model.value).toBe("")
  expect(model.querySelector<HTMLOptionElement>('option[value="openrouter/image"]')?.disabled).toBe(true)
  model.value = "openrouter/team/model"
  model.dispatchEvent(new Event("change", { bubbles: true }))
  await submit(form.root)
  expect(form.writes[0]).toMatchObject({ id: "backend", input: { model: "openrouter/team/model" } })
  expect(form.closed).toEqual([])
  expect(model.value).toBe("openrouter/team/model")
  behavior.fail = false
  await submit(form.root)
  expect(form.writes[1]).toEqual(form.writes[0])
  expect(form.closed).toEqual([true])
})

test("an unavailable configured model is retained until inheritance is selected", async () => {
  const form = await mount({ agent, file: { ...file, model: "offline/team/model" } })
  const model = form.root.querySelector<HTMLSelectElement>('select[name="model"]')!
  expect(model.value).toBe("offline/team/model")
  expect(form.root.querySelector("#agents-model-issue")).not.toBeNull()
  model.value = ""
  model.dispatchEvent(new Event("change", { bubbles: true }))
  await submit(form.root)
  expect(form.writes[0].input.model).toBeUndefined()
})

test("file-loaded agents can select inheritance while model catalog is pending or failed", async () => {
  for (const modelsStatus of ["pending", "error"] as const) {
    const form = await mount({
      agent,
      modelsStatus,
      file: {
        ...file,
        model: "offline/team/model",
        permission: { bash: { "git *": "ask" } },
      },
    })
    const model = form.root.querySelector<HTMLSelectElement>('select[name="model"]')!
    expect(model.disabled).toBe(false)
    expect(model.querySelector<HTMLOptionElement>('option[value=""]')?.disabled).toBe(false)
    expect(model.querySelector<HTMLOptionElement>('option[value="openrouter/team/model"]')?.disabled).toBe(true)
    expect(form.root.textContent).toContain(
      modelsStatus === "pending" ? "Loading connected models…" : "Connected models could not be loaded. Try again.",
    )
    model.value = ""
    model.dispatchEvent(new Event("change", { bubbles: true }))
    await submit(form.root)
    expect(form.writes).toEqual([
      { id: "backend", input: { permission: { bash: { "git *": "ask" } }, revision: "r1" } },
    ])
    expect(form.closed).toEqual([true])
  }
})

const provider: Provider = {
  id: "router",
  name: "Router",
  source: "custom",
  env: [],
  options: {},
  models: Object.fromEntries(
    ["Alpha", "Beta", "Image"].map((name) => [
      name,
      {
        id: `team/${name}`,
        name,
        providerID: "router",
        api: { id: name, url: "", npm: "" },
        capabilities: {
          temperature: true,
          reasoning: false,
          attachment: false,
          toolcall: name !== "Image",
          interleaved: false,
          input: { text: true, audio: false, image: false, video: false, pdf: false },
          output: { text: true, audio: false, image: false, video: false, pdf: false },
        },
        cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
        limit: { context: 200_000, output: 16_000 },
        status: "active",
        options: {},
        headers: {},
        release_date: "2020-01-01",
      },
    ]),
  ),
}

async function picker(initial: SubagentModelPolicy = { mode: "inherit" }, pendingKey?: string) {
  const root = document.createElement("div")
  document.body.append(root)
  const writes: SubagentModelPolicy[] = []
  const [state, setState] = createStore({
    policy: initial,
    status: "success" as "pending" | "error" | "success",
    rulesReady: true,
    fail: false,
    providers: [provider] as Provider[],
  })
  const dispose = render(
    () =>
      createComponent(PlatformProvider, {
        value: { platform: "web", openExternal() {}, restart: async () => {}, notify: async () => {} },
        get children() {
          return createComponent(LanguageProvider, {
            locale: "en",
            get children() {
              return createComponent(Dialog, {
                open: true,
                modal: false,
                get children() {
                  return createComponent(SubagentModelPicker, {
                    sessionID: pendingKey ? undefined : "session",
                    directory: "/profile",
                    pendingKey,
                    supported: true,
                    get providers() {
                      return state.providers
                    },
                    get status() {
                      return state.status
                    },
                    get rulesReady() {
                      return state.rulesReady
                    },
                    policy: {
                      read: () => ({ policy: state.policy }),
                      // The server replaces the whole policy and the canonical read follows it.
                      write: async (policy) => {
                        writes.push(policy)
                        if (state.fail) throw new Error("offline")
                        setState("policy", policy)
                        return policy
                      },
                    },
                    onRetry: () => setState("status", "success"),
                  })
                },
              })
            },
          })
        },
      }),
    root,
  )
  cleanups.push(() => {
    dispose()
    root.remove()
  })
  await new Promise((resolve) => setTimeout(resolve, 0))
  return { root, state, setState, writes }
}

test("subagent row clicks, ArrowDown/Enter and accessible switches toggle each target once", async () => {
  const view = await picker()
  const row = (name: string) => view.root.querySelector<HTMLButtonElement>(`button[data-key="router:team/${name}"]`)!
  const switches = () => [...view.root.querySelectorAll<HTMLInputElement>('[data-slot="switch-input"]')]
  expect(switches()).toHaveLength(3)
  expect(switches().every((input) => !input.closest("button"))).toBe(true)
  row("Alpha").click()
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(view.writes).toHaveLength(1)
  expect(view.writes[0]).toEqual({ mode: "allowlist", models: [{ providerID: "router", id: "team/Alpha" }] })
  expect(switches()[0].checked).toBe(true)

  const search = view.root.querySelector<HTMLInputElement>('input[type="text"]')!
  search.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }))
  search.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }))
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(view.writes).toHaveLength(2)
  expect(view.writes[1]).toEqual({
    mode: "allowlist",
    models: [{ providerID: "router", id: "team/Alpha" }, { providerID: "router", id: "team/Beta" }],
  })
  expect(switches()[1].checked).toBe(true)

  switches()[1].click()
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(view.writes).toHaveLength(3)
  expect(view.writes[2]).toEqual({ mode: "allowlist", models: [{ providerID: "router", id: "team/Alpha" }] })
  expect(switches()[1].checked).toBe(false)
  expect(switches()[2].disabled).toBe(true)
  row("Image").click()
  expect(view.writes).toHaveLength(3)
})

test("picker distinguishes loading, error, loaded-empty and explicitly denied models", async () => {
  const view = await picker({ mode: "allowlist", models: [] })
  expect(view.root.querySelector('[data-status="inherited"]')).toBeNull()
  expect(view.root.querySelector('[data-status="none-allowed"]')).not.toBeNull()
  view.setState("status", "pending")
  expect(view.root.textContent).toContain("Loading connected models…")
  expect(view.root.querySelector('[data-component="list"]')).toBeNull()
  view.setState("status", "error")
  expect(view.root.querySelector('[role="alert"]')?.textContent).toContain("Connected models could not be loaded.")
  expect(view.root.textContent).not.toContain("No connected models are available")
  view.setState({ status: "success", providers: [] })
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(view.root.textContent).toContain("No connected models are available in this profile.")
  expect(view.root.querySelector('[data-status="inherited"]')).toBeNull()
  view.setState({ rulesReady: false, policy: { mode: "inherit" } })
  expect(view.root.querySelector('[data-status="inherited"]')).toBeNull()
})

test("Enter on a focused model row targets that row rather than the previous active item", async () => {
  const view = await picker()
  const row = view.root.querySelector<HTMLButtonElement>('button[data-key="router:team/Beta"]')!
  row.focus()
  row.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }))
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(view.writes).toHaveLength(1)
  expect(view.writes[0]).toEqual({ mode: "allowlist", models: [{ providerID: "router", id: "team/Beta" }] })
})

test("row ArrowDown Space moves DOM focus and invokes only the highlighted model", async () => {
  const view = await picker()
  const first = view.root.querySelector<HTMLButtonElement>('button[data-key="router:team/Alpha"]')!
  const next = view.root.querySelector<HTMLButtonElement>('button[data-key="router:team/Beta"]')!
  first.focus()
  first.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }))
  await Promise.resolve()
  expect(document.activeElement).toBe(next)
  next.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }))
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(view.writes).toHaveLength(1)
  expect(view.writes[0]).toEqual({ mode: "allowlist", models: [{ providerID: "router", id: "team/Beta" }] })
})

test("model windows are bounded for 5000 choices and reject detached row activation", async () => {
  const view = await picker()
  view.setState("providers", [
    {
      ...provider,
      models: Object.fromEntries(
        Array.from({ length: 5000 }, (_, index) => [
          String(index),
          {
            ...provider.models.Alpha,
            id: `team/model-${index}`,
            name: `Model ${index}`,
          },
        ]),
      ),
    },
  ])
  await new Promise((resolve) => setTimeout(resolve, 0))
  const grid = view.root.querySelector<HTMLElement>('[role="grid"]')!
  expect(grid.getAttribute("aria-rowcount")).toBe("5001")
  expect(grid.querySelectorAll('[data-slot="list-row"]').length).toBeGreaterThan(0)
  expect(grid.querySelectorAll('[data-slot="list-row"]').length).toBeLessThanOrEqual(100)
  const stale = view.root.querySelector<HTMLButtonElement>('button[data-key="router:team/model-10"]')!
  expect(stale).not.toBeNull()
  grid.scrollTop = 200_000
  grid.dispatchEvent(new Event("scroll"))
  expect(stale.isConnected).toBe(false)
  stale.click()
  stale.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }))
  expect(view.writes).toEqual([])
  expect(grid.querySelectorAll('[data-slot="list-row"]').length).toBeLessThanOrEqual(100)
})

test("pendingKey isolates drafts with the same directory and inheritance clears only that key", async () => {
  const first = "server-A/profile/draft-A"
  const second = "server-B/profile/draft-B"
  clearPending(first)
  clearPending(second)
  const a = await picker(undefined, first)
  const b = await picker(undefined, second)
  a.root.querySelector<HTMLButtonElement>('button[data-key="router:team/Alpha"]')!.click()
  expect(pendingPolicy(first)).toEqual({ mode: "allowlist", models: [{ providerID: "router", id: "team/Alpha" }] })
  expect(pendingPolicy(second)).toEqual({ mode: "inherit" })
  expect(b.root.querySelector<HTMLInputElement>('[data-slot="switch-input"]')?.checked).toBe(false)
  ;[...a.root.querySelectorAll("button")].find((button) => button.textContent === "Inherit")!.click()
  expect(pendingPolicy(first)).toEqual({ mode: "inherit" })
  clearPending(first)
  clearPending(second)
})

test("List clear search restores actual rows, notifies controlled filter and restores keyboard selection", async () => {
  const root = document.createElement("div")
  document.body.append(root)
  const filters: string[] = []
  const selections: string[] = []
  const [state, setState] = createStore({ filter: "" })
  const dispose = render(
    () =>
      createComponent(List<string>, {
        items: ["Alpha", "Beta"],
        key: (item) => item,
        search: true,
        get filter() {
          return state.filter
        },
        onFilter: (value) => {
          filters.push(value)
          setState("filter", value)
        },
        onSelect: (item) => {
          if (item) selections.push(item)
        },
        children: (item) => item,
      }),
    root,
  )
  cleanups.push(() => {
    dispose()
    root.remove()
  })
  await new Promise((resolve) => setTimeout(resolve, 0))
  const input = root.querySelector<HTMLInputElement>('input[type="text"]')!
  input.value = "Beta"
  input.dispatchEvent(new Event("input", { bubbles: true }))
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(root.querySelectorAll('[data-slot="list-item"]')).toHaveLength(1)
  expect(root.querySelector('[data-slot="list-item"]')?.textContent).toBe("Beta")
  root.querySelector<HTMLButtonElement>('button[aria-label="Clear filter"]')!.click()
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(filters).toEqual(["Beta", ""])
  expect(input.value).toBe("")
  expect(document.activeElement).toBe(input)
  expect(root.querySelectorAll('[data-slot="list-item"]')).toHaveLength(2)
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }))
  expect(selections).toEqual(["Alpha"])
})

test("List reveals an initially selected last row when its catalog arrives, without resetting search or scroll", async () => {
  const root = document.createElement("div")
  document.body.append(root)
  const catalog = Promise.withResolvers<string[]>()
  const [state, setState] = createStore({ current: "model-4999", filter: "" })
  const dispose = render(
    () =>
      createComponent(List<string>, {
        items: () => catalog.promise,
        key: (item) => item,
        search: true,
        virtual: { rowHeight: 40, height: 360 },
        get current() {
          return state.current
        },
        get filter() {
          return state.filter
        },
        children: (item) => item,
      }),
    root,
  )
  cleanups.push(() => {
    dispose()
    root.remove()
  })
  const grid = root.querySelector<HTMLElement>('[role="grid"]')!
  expect(grid.scrollTop).toBe(0)
  catalog.resolve(Array.from({ length: 5000 }, (_, index) => `model-${index}`))
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(grid.scrollTop).toBeGreaterThan(190_000)
  expect(root.querySelector('[data-key="model-4999"][data-active="true"]')).not.toBeNull()

  grid.scrollTop = 400
  grid.dispatchEvent(new Event("scroll"))
  expect(grid.scrollTop).toBe(400)
  setState("current", "missing-model")
  expect(grid.scrollTop).toBe(400)
  setState({ filter: "model-1", current: "model-4999" })
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(grid.scrollTop).toBe(0)
  setState("filter", "")
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(grid.scrollTop).toBe(0)
})
