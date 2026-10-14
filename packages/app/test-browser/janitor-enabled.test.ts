import { expect, test } from "bun:test"
import { plugin } from "bun"
import { createRequire } from "node:module"
import { resolve } from "node:path"

// Set JANITOR_TEST_SOURCE to a checkout to compare old/new code without editing either.
const root = resolve(process.env.JANITOR_TEST_SOURCE ?? resolve(import.meta.dir, "../../.."))
const app = resolve(root, "packages/app")
const require = createRequire(Bun.resolveSync("vite-plugin-solid", app))
const babel = require("@babel/core") as { transformSync(source: string, options: { filename: string; presets: string[]; babelrc: boolean; configFile: boolean }): { code?: string | null } | null }
const solid = await import(Bun.resolveSync("solid-js", app))
const stores = await import(Bun.resolveSync("solid-js/store", app))

type Event = { report: string; source: string | null; notify: boolean }
type Stored = Omit<Event, "notify"> | null
const boundary = solid.createContext<{
  server: { key: string }
  platform: { platform: string; notify: (title: string, body?: string, click?: () => void) => Promise<void> }
  subscribe: (listener: (event: Event) => void) => () => void
}>()
const useBoundary = () => {
  const value = solid.useContext(boundary)
  if (!value) throw new Error("Missing Janitor test boundary")
  return value
}

const implementation = process.env.JANITOR_TEST_IMPLEMENTATION ?? app
const files = [resolve(implementation, "src/context/janitor.tsx"), resolve(app, "src/context/settings.tsx"), resolve(root, "packages/ui/src/context/helper.tsx")]
// Cached plain Settings retains real Platform bindings; substitute only fresh fixture file identities.
const suffix = "?janitor-fixture"
plugin({
  name: "janitor-provider-boundaries",
  setup(build) {
    build.module("janitor-test:boundary", () => ({
      exports: {
        useLanguage: () => ({ plural: (key: string, count: number) => `${key}:${count}` }),
        usePlatform: () => useBoundary().platform,
        useServer: () => useBoundary().server,
        onJanitorReport: (listener: (event: Event) => void) => useBoundary().subscribe(listener),
        // Storage boundary only: keep the production Settings store and all its memos/setters.
        persisted: (_key: string, state: unknown[]) => [...state, null, () => true],
      },
      loader: "object",
    }))
    build.onLoad({ filter: new RegExp(`^(?:${files.map((file) => (file + suffix).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})$`) }, async (args) => {
      const file = args.path.slice(0, args.path.length - suffix.length)
      return { contents: babel.transformSync((await Bun.file(file).text())
        .replaceAll("import.meta.env.VITE_ORCHESTRA_CHANNEL", '"test"')
        .replace(/from "([^"]+)"/g, (_match, specifier: string) => {
          if (["@/context/language", "@/context/platform", "@/context/server", "@/context/server-sync", "@/utils/persist"].includes(specifier))
            return 'from "janitor-test:boundary"'
          if (specifier === "@orchestra/ui/context") return `from ${JSON.stringify(files[2] + suffix)}`
          if (specifier.startsWith("@/")) return `from ${JSON.stringify(resolve(app, "src", specifier.slice(2) + ".ts"))}`
          return `from ${JSON.stringify(Bun.resolveSync(specifier, app))}`
        }), {
        filename: file,
        presets: [require.resolve("babel-preset-solid"), require.resolve("@babel/preset-typescript")],
        babelrc: false,
        configFile: false,
      })!.code!,
      loader: "js" }
    })
  },
})
// Only import boundaries are substituted; production provider logic is unchanged.
const janitor: typeof import("../src/context/janitor") = await import(files[0] + suffix)
const settings: typeof import("../src/context/settings") = await import(files[1] + suffix)

const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
}
const report = (summary: string) => JSON.stringify({
  createdAt: "2026-10-12T00:00:00Z",
  findings: [{ kind: "disk", severity: "attention", summary, evidence: "fixture evidence", suggestion: "fixture suggestion" }],
})

test("Janitor opt-in owns subscriptions, duplicate reports, disable races and server isolation", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(window, "api")
  const requests: PromiseWithResolvers<Stored>[] = []
  const listeners: { active: boolean; receive: (event: Event) => void }[] = []
  const notifications: { click?: () => void }[] = []
  const subscribe = (receive: (event: Event) => void) => {
    const listener = { active: true, receive }
    listeners.push(listener)
    return () => { listener.active = false }
  }
  // Janitor has no injected desktop bridge. Restore the exact window descriptor even on failure.
  Object.defineProperty(window, "api", { configurable: true, value: { janitor: {
    getReport() {
      const request = Promise.withResolvers<Stored>()
      requests.push(request)
      return request.promise
    },
    onReport: subscribe,
    dismiss: async () => {},
    snooze: async () => {},
  } } })
  const state = { dispose: () => {}, current: undefined as ReturnType<typeof janitor.useJanitor> | undefined,
    preferences: undefined as ReturnType<typeof settings.useSettings> | undefined }
  const [server, setServer] = stores.createStore({ key: "server-a" })
  try {
    solid.createRoot((dispose) => {
      state.dispose = dispose
      solid.createComponent(boundary.Provider, {
        value: { server, subscribe, platform: { platform: "desktop", notify: async (_title, _body, click) => { notifications.push({ click }) } } },
        get children() {
          return solid.createComponent(settings.SettingsProvider, {
            get children() {
              state.preferences = settings.useSettings()
              return solid.createComponent(janitor.JanitorProvider, {
                enabled: () => state.preferences!.general.janitorEnabled(),
                get children() { state.current = janitor.useJanitor(); return null },
              })
            },
          })
        },
      })
    })
    await flush()
    const current = state.current!
    const preferences = state.preferences!
    expect(preferences.general.janitorEnabled()).toBe(false)
    expect(requests).toHaveLength(0)
    expect(listeners).toHaveLength(0)
    expect(notifications).toHaveLength(0)

    preferences.general.setJanitorEnabled(true)
    await flush()
    expect(requests).toHaveLength(1)
    expect(listeners).toHaveLength(1)
    requests[0]!.resolve(null)
    await flush()
    listeners[0]!.receive({ report: report("First"), source: server.key, notify: true })
    expect(current.store.report?.findings[0]?.summary).toBe("First")
    expect(notifications).toHaveLength(1)
    current.expand()
    listeners[0]!.receive({ report: report("First"), source: server.key, notify: true })
    expect(current.store.expanded).toBe(true)
    expect(notifications).toHaveLength(1)
    listeners[0]!.receive({ report: report("Changed"), source: server.key, notify: true })
    await flush()
    expect(current.store.report?.findings[0]?.summary).toBe("Changed")
    expect(current.store.expanded).toBe(false)
    expect(requests).toHaveLength(1)
    expect(listeners).toHaveLength(1)
    expect(notifications).toHaveLength(2)

    current.expand()
    preferences.general.setJanitorEnabled(false)
    await flush()
    expect(listeners[0]!.active).toBe(false)
    listeners[0]!.receive({ report: report("Disabled callback"), source: server.key, notify: true })
    notifications[1]!.click?.()
    expect(current.store.report).toBeNull()
    expect(current.store.expanded).toBe(false)
    expect(notifications).toHaveLength(2)

    preferences.general.setJanitorEnabled(true)
    await flush()
    expect(requests).toHaveLength(2)
    expect(listeners).toHaveLength(2)
    requests[1]!.resolve({ report: report("Suppressed stored report"), source: server.key })
    await flush()
    expect(current.store.report?.findings[0]?.summary).toBe("Suppressed stored report")
    expect(current.store.expanded).toBe(false)
    expect(notifications).toHaveLength(2)

    // Disable while the next stored-report fetch is still in flight.
    preferences.general.setJanitorEnabled(false)
    preferences.general.setJanitorEnabled(true)
    await flush()
    expect(requests).toHaveLength(3)
    preferences.general.setJanitorEnabled(false)
    requests[2]!.resolve({ report: report("Late disabled fetch"), source: server.key })
    await flush()
    expect(current.store.report).toBeNull()
    expect(current.store.expanded).toBe(false)
    expect(listeners[2]!.active).toBe(false)

    preferences.general.setJanitorEnabled(true)
    await flush()
    listeners[3]!.receive({ report: report("Old server"), source: "server-a", notify: true })
    current.expand()
    setServer("key", "server-b")
    await flush()
    expect(current.store.report).toBeNull()
    expect(current.store.expanded).toBe(false)
    expect(listeners[3]!.active).toBe(false)
    expect(requests).toHaveLength(5)
    requests[4]!.resolve({ report: report("New server"), source: "server-b" })
    await flush()
    requests[3]!.resolve({ report: report("Late old server"), source: "server-a" })
    listeners[3]!.receive({ report: report("Old server callback"), source: "server-a", notify: true })
    notifications[2]!.click?.()
    await flush()
    expect(current.store.report?.findings[0]?.summary).toBe("New server")
    expect(current.store.source).toBe("server-b")
    expect(current.store.expanded).toBe(false)
    expect(notifications).toHaveLength(3)
    expect(listeners.filter((listener) => listener.active)).toHaveLength(1)
    // Positive control: a current notification must work before stale clicks can be credited as guarded.
    listeners[4]!.receive({ report: report("Current clickable report"), source: "server-b", notify: true })
    notifications[3]!.click?.()
    expect(current.store.expanded).toBe(true)
    state.dispose()
    expect(listeners.filter((listener) => listener.active)).toHaveLength(0)
  } finally {
    state.dispose()
    if (descriptor) Object.defineProperty(window, "api", descriptor)
    if (!descriptor) Reflect.deleteProperty(window, "api")
  }
})
