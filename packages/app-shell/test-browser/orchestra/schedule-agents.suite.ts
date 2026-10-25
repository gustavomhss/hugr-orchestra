import { createRequire } from "node:module"
import { afterEach, expect, test } from "bun:test"
import { Agent } from "@orchestra/schema/agent"
import type { CapabilityScheduleManagement } from "@orchestra/schema/capability-schedule-management"
import { ScheduledTask } from "@orchestra/schema/scheduled-task"
import { SessionID } from "@orchestra/schema/session-id"
import { createComponent, render } from "solid-js/web"
import type { Api, Schedule } from "../../src/orchestra/chapters/schedule-agents-model"

// Compile real components with Solid, not Bun's React JSX transform.
const solid = createRequire(Bun.resolveSync("vite-plugin-solid", import.meta.dir))
Bun.plugin({
  name: "solid-schedule-agents",
  setup(build) {
    build.onLoad({ filter: /\.tsx$/ }, async (args) => {
      const result = await solid("@babel/core").transformAsync(await Bun.file(args.path).text(), {
        filename: args.path,
        presets: [[solid("babel-preset-solid"), { generate: "dom" }]],
        parserOpts: { plugins: ["jsx", "typescript"] },
        configFile: false,
        babelrc: false,
      })
      return { contents: result.code, loader: "ts" }
    })
  },
})
const { AgentSchedules }: typeof import("../../src/orchestra/chapters/schedule-agents") = await import(
  "../../src/orchestra/chapters/schedule-agents"
)
const { LanguageProvider }: typeof import("../../src/context/language") = await import("../../src/context/language")
const { PlatformProvider }: typeof import("../../src/context/platform") = await import("../../src/context/platform")

const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).reverse().forEach((cleanup) => cleanup()))
const settle = () => new Promise((resolve) => setTimeout(resolve, 30))

const owner = SessionID.make("ses_owner")
const schedule = (input: Partial<Schedule> = {}): Schedule => ({
  id: ScheduledTask.ID.make("tsk_nightly"),
  revision: 0,
  name: "Nightly audit",
  prompt: "Audit the dependency tree.",
  cadence: { kind: "cron", expression: "0 3 * * 1-5" },
  timezone: "UTC",
  catchUp: "latest",
  enabled: true,
  next: Date.UTC(2031, 0, 15, 3),
  runs: 4,
  skipped: 1,
  last: { outcome: "failed", time: Date.UTC(2031, 0, 14, 3), error: "provider unavailable" },
  ...input,
})

function mount() {
  const calls: string[] = []
  const opened: string[] = []
  // The view reloads the list after every mutation, so the fake keeps the server's copy.
  const items: CapabilityScheduleManagement.Item[] = [
    { schedule: schedule(), sessionID: owner, agentID: Agent.ID.make("reviewer") },
  ]
  const api: Api = {
    list: async () => (calls.push("list"), { items, coverage: "live" }),
    pause: async (id) => {
      calls.push(`pause ${id}`)
      items[0] = { ...items[0]!, schedule: schedule({ enabled: false, next: undefined }) }
      return items[0].schedule
    },
    resume: async (id) => (calls.push(`resume ${id}`), schedule()),
    run: async (id) => (calls.push(`run ${id}`), { id, sessionID: SessionID.make("ses_run"), reused: false }),
    remove: async (id) => (calls.push(`remove ${id}`), { id, removed: true }),
  }
  const host = document.body.appendChild(document.createElement("div"))
  const dispose = render(
    () =>
      createComponent(PlatformProvider, {
        value: { platform: "web", openExternal: () => {}, restart: async () => {}, notify: async () => {} },
        get children() {
          return createComponent(LanguageProvider, {
            locale: "en",
            get children() {
              return createComponent(AgentSchedules, { api, openSession: (sessionID) => opened.push(sessionID) })
            },
          })
        },
      }),
    host,
  )
  cleanups.push(() => {
    dispose()
    host.remove()
  })
  const button = (name: string) => {
    const found = [...host.querySelectorAll("button")].find((item) => item.textContent?.trim() === name)
    if (!found) throw new Error(`Missing button ${name}`)
    return found
  }
  return { host, calls, opened, button }
}

test("lists a capability schedule with its owner, cadence, history and controls", async () => {
  const view = mount()
  await settle()
  const card = view.host.querySelector("[data-slot='schedule-agent']")
  expect(view.host.querySelector("h3.mx-section")?.textContent).toBe("Created by agents")
  expect(card?.textContent).toContain("Nightly audit")
  expect(card?.textContent).toContain("Session ses_owner · reviewer")
  expect(card?.textContent).toContain("0 3 * * 1-5")
  expect(card?.textContent).toContain("provider unavailable")
  expect(card?.querySelector(".schedule-missed")).not.toBeNull()

  view.button("Session ses_owner · reviewer").click()
  expect(view.opened).toEqual(["ses_owner"])

  view.button("Pause").click()
  await settle()
  expect(view.calls).toContain("pause tsk_nightly")
  expect(view.button("Resume")).toBeDefined()

  view.button("Delete").click()
  expect(view.calls.some((call) => call.startsWith("remove"))).toBe(false)
  // Reloaded rows are new cards, so the confirm footer is looked up from the host.
  expect(view.host.querySelector(".schedule-agent-confirm")?.textContent).toContain("Delete")
  view.button("Cancel").click()
  expect(view.host.querySelector(".schedule-agent-confirm")).toBeNull()
})
