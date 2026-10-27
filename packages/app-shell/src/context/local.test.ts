import { describe, expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { createStore } from "solid-js/store"
import { createLocal, type Saved } from "./local"

type Deps = Parameters<typeof createLocal>[0]

const native = (name: string, id?: string) => ({ name, mode: "primary", native: true, ...(id ? { id } : {}) })
const roster = [native("build"), native("plan"), native("maestro")]

type Setup = {
  params?: { id?: string }
  agents?: typeof roster
  sessions?: Saved["session"]
}

// Runs the real Local init against fakes for the route, roster and saved state of one test.
function withLocal<T>(setup: Setup, read: (local: ReturnType<typeof createLocal>) => T) {
  return createRoot((dispose) => {
    const [saved, setSaved] = createStore<Saved>({ session: setup.sessions ?? {} })
    const agents = setup.agents ?? roster
    const local = createLocal({
      params: setup.params ?? {},
      sdk: (() => ({ directory: "/repo" })) as unknown as Deps["sdk"],
      sync: (() => ({ data: { agent: agents, config: {} } })) as unknown as Deps["sync"],
      serverSDK: (() => ({ scope: "local" })) as unknown as Deps["serverSDK"],
      providers: {
        all: () => new Map(),
        connected: () => [],
        default: () => ({}),
        defaultModel: () => undefined,
      } as unknown as Deps["providers"],
      models: { recent: { list: () => [] }, find: () => undefined } as unknown as Deps["models"],
      saved,
      setSaved,
      savedReady: () => true,
    })
    const result = read(local)
    dispose()
    return result
  })
}

const currentAgent = (setup: Setup = {}) => withLocal(setup, (local) => local.agent.current()?.name)

describe("Local agent", () => {
  test("a follow-up in a Maestro session stays on maestro", () => {
    expect(currentAgent({ params: { id: "ses_maestro" }, sessions: { ses_maestro: { agent: "maestro" } } })).toBe(
      "maestro",
    )
  })

  test("new sessions and drafts start on maestro", () => {
    expect(currentAgent()).toBe("maestro")
  })

  test("a session saved on another agent continues on maestro", () => {
    expect(currentAgent({ params: { id: "ses_plan" }, sessions: { ses_plan: { agent: "plan" } } })).toBe("maestro")
  })

  test("build is not a fallback when the server lists no maestro", () => {
    const agents = roster.filter((agent) => agent.name !== "maestro")

    expect(currentAgent({ params: { id: "ses_maestro" }, agents })).toBeUndefined()
  })

  test("a renamed maestro is still found and sent by its stable id", () => {
    const agents = [native("build"), native("plan"), native("Conductor", "maestro")]

    const key = withLocal({ agents }, (local) => ({
      label: local.agent.current()?.name,
      key: local.agent.key(),
    }))
    expect(key).toEqual({ label: "Conductor", key: "maestro" })
  })
})
