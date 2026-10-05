import { plugin } from "bun"
import { describe, expect, test } from "bun:test"
import type { AppDockLinuxAPI, LinuxInstallResult, LinuxOpenResult, LinuxState } from "../../app-dock-linux"

// These tests exercise createEffect; the unit runner's SSR exports would skip it.
// Change module bindings in memory only; controller behavior stays unmodified.
const browser = {
  solid: Bun.resolveSync("solid-js/dist/solid.js", import.meta.dir),
  store: Bun.resolveSync("solid-js/store/dist/store.js", import.meta.dir),
}
const controller = Bun.resolveSync("./linux-menu", import.meta.dir)
await plugin({
  name: "linux-menu-browser-runtime",
  setup(build) {
    build.onLoad(
      {
        filter: new RegExp(
          `^(?:${[controller, browser.store].map((file) => file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})$`,
        ),
        namespace: "file",
      },
      async (args) => ({
        contents: (await Bun.file(args.path).text())
          .replaceAll('"solid-js"', JSON.stringify(browser.solid))
          .replaceAll("'solid-js'", JSON.stringify(browser.solid))
          .replaceAll('"solid-js/store"', JSON.stringify(browser.store)),
        loader: args.path.endsWith(".tsx") ? "tsx" : "js",
      }),
    )
  },
})

const { createRoot } = (await import(browser.solid)) as typeof import("solid-js")
const { createStore } = (await import(browser.store)) as typeof import("solid-js/store")
const { createLinuxMenuController } = (await import(controller)) as typeof import("./linux-menu")

const opened: LinuxOpenResult = {
  status: "opened",
  tab: { tabID: "linux-tab", generation: 1, url: "appdock://linux" },
}
const app = { id: "org.example.Editor.desktop", name: "محرر Editor" }

function setup(api: Partial<AppDockLinuxAPI>, open: () => Promise<LinuxOpenResult> = async () => opened) {
  return createRoot((dispose) => {
    const [scope, setScope] = createStore({ profile: "default", generation: 0, disabled: false })
    const menu = createLinuxMenuController({
      api,
      get profile() {
        return scope.profile
      },
      generation: () => scope.generation,
      get disabled() {
        return scope.disabled
      },
      open,
    })
    return { menu, setScope, dispose }
  })
}

describe("Linux launcher controller (injected API)", () => {
  test("waits for the visible Linux workspace before launching an app", async () => {
    const calls: string[] = []
    const opening = Promise.withResolvers<LinuxOpenResult>()
    const state = setup(
      {
        appDockLinuxOpen: async () => opened,
        appDockLinuxList: async () => ({ phase: "ready", apps: [app] }),
        appDockLinuxLaunch: async (id) => {
          calls.push(`launch:${id}`)
          return { status: "launched" }
        },
      },
      () => {
        calls.push("open")
        return opening.promise
      },
    )
    await state.menu.refresh()
    const pending = state.menu.run({ type: "launch", appID: app.id })
    await state.menu.run({ type: "launch", appID: app.id })
    expect(calls).toEqual(["open"])
    expect(state.menu.store.busy).toBe("launch")
    opening.resolve(opened)
    await pending
    expect(calls).toEqual(["open", `launch:${app.id}`])
    expect(state.menu.store.apps).toEqual([app])
    expect(state.menu.store.busy).toBeUndefined()
    state.dispose()
  })

  test("failed open prevents launch and exposes the sanitized error code", async () => {
    const calls: string[] = []
    const state = setup(
      {
        appDockLinuxOpen: async () => opened,
        appDockLinuxLaunch: async () => {
          calls.push("launch")
          return { status: "launched" }
        },
      },
      async () => ({ status: "failed", code: "unavailable" }),
    )
    await state.menu.run({ type: "launch", appID: app.id })
    expect(calls).toEqual([])
    expect(state.menu.store.error).toBe("unavailable")
    state.dispose()
  })

  test("install uses the main-owned picker, refreshes apps, and handles cancellation", async () => {
    const picks: LinuxInstallResult[] = [{ status: "cancelled" }, { status: "installed", apps: [app] }]
    const lists: string[] = []
    const state = setup({
      appDockLinuxInstall: async () => picks.shift()!,
      appDockLinuxList: async () => {
        lists.push("list")
        return { phase: "ready", apps: picks.length ? [] : [app] }
      },
    })
    await state.menu.refresh()
    const before = lists.length
    await state.menu.run({ type: "install" })
    expect(state.menu.store.error).toBeUndefined()
    expect(lists.length).toBe(before)
    await state.menu.run({ type: "install" })
    expect(lists.length).toBe(before + 1)
    expect(state.menu.store.apps).toEqual([app])
    state.dispose()
  })

  test("profile generation change drops old list results and stops pending launch", async () => {
    const opening = Promise.withResolvers<LinuxOpenResult>()
    const oldList = Promise.withResolvers<LinuxState>()
    const calls: string[] = []
    const state = setup(
      {
        appDockLinuxOpen: async () => opened,
        appDockLinuxList: () => oldList.promise,
        appDockLinuxLaunch: async () => {
          calls.push("launch")
          return { status: "launched" }
        },
      },
      () => opening.promise,
    )
    const listing = state.menu.refresh()
    const pending = state.menu.run({ type: "launch", appID: app.id })
    state.setScope({ generation: 1, disabled: true })
    oldList.resolve({ phase: "ready", apps: [app] })
    opening.resolve(opened)
    await Promise.all([listing, pending])
    expect(calls).toEqual([])
    expect(state.menu.store.apps).toEqual([])
    state.setScope({ profile: "work", disabled: false })
    await state.menu.refresh()
    expect(state.menu.store.apps).toEqual([app])
    state.dispose()
  })

  test("disposed menu ignores late install completion", async () => {
    const install = Promise.withResolvers<LinuxInstallResult>()
    const state = setup({ appDockLinuxInstall: () => install.promise })
    const pending = state.menu.run({ type: "install" })
    state.dispose()
    install.resolve({ status: "installed", apps: [app] })
    await pending
    expect(state.menu.store.apps).toEqual([])
    expect(state.menu.store.error).toBeUndefined()
  })

  test("missing desktop capabilities never invoke open", async () => {
    const calls: string[] = []
    const state = setup({}, async () => {
      calls.push("open")
      return opened
    })
    await state.menu.run({ type: "open" })
    await state.menu.run({ type: "launch", appID: app.id })
    await state.menu.run({ type: "install" })
    expect(calls).toEqual([])
    expect(state.menu.store.busy).toBeUndefined()
    state.dispose()
  })

  test("web selection keeps install locked through the global app refresh", async () => {
    const install = Promise.withResolvers<LinuxInstallResult>()
    const refreshed = Promise.withResolvers<LinuxState>()
    const globalApps = [app, { id: "org.example.Viewer.desktop", name: "Viewer عارض" }]
    const response = { list: Promise.resolve<LinuxState>({ phase: "ready", apps: [] }) }
    const calls: string[] = []
    const state = setup(
      {
        appDockLinuxOpen: async () => opened,
        appDockLinuxInstall: () => {
          calls.push("install")
          return install.promise
        },
        appDockLinuxList: () => {
          calls.push("list")
          return response.list
        },
        appDockLinuxLaunch: async () => {
          calls.push("launch")
          return { status: "launched" }
        },
      },
      async () => {
        calls.push("open")
        return opened
      },
    )
    await state.menu.refresh()
    calls.length = 0
    const pending = state.menu.run({ type: "install" })
    state.setScope("generation", 1)
    expect(state.menu.store.busy).toBe("install")
    expect(state.menu.blocked()).toBe(true)
    await state.menu.run({ type: "install" })
    await state.menu.run({ type: "launch", appID: app.id })
    expect(calls).toEqual(["install", "list"])
    await state.menu.refresh()
    calls.length = 0
    response.list = refreshed.promise
    install.resolve({ status: "installed", apps: [app] })
    await Promise.resolve()
    expect(calls).toEqual(["list"])
    expect(state.menu.store.apps).toEqual([app])
    expect(state.menu.store.busy).toBe("install")
    expect(state.menu.store.loading).toBe(true)
    await state.menu.run({ type: "install" })
    await state.menu.run({ type: "launch", appID: app.id })
    expect(calls).toEqual(["list"])
    refreshed.resolve({ phase: "ready", apps: globalApps })
    await pending
    expect(state.menu.store.apps).toEqual(globalApps)
    expect(state.menu.store.busy).toBeUndefined()
    expect(state.menu.store.loading).toBe(false)
    expect(state.menu.blocked()).toBe(false)
    await state.menu.run({ type: "launch", appID: app.id })
    expect(calls).toEqual(["list", "open", "launch"])
    state.dispose()
  })

  test("profile switching preserves global install completion and rejects stale lists", async () => {
    const install = Promise.withResolvers<LinuxInstallResult>()
    const oldList = Promise.withResolvers<LinuxState>()
    const response = { list: Promise.resolve<LinuxState>({ phase: "ready", apps: [] }) }
    const installs: string[] = []
    const lists: string[] = []
    const globalApps = [app, { id: "org.example.Viewer.desktop", name: "Viewer عارض" }]
    const state = setup({
      appDockLinuxInstall: () => {
        installs.push("install")
        return install.promise
      },
      appDockLinuxList: () => {
        lists.push("list")
        return response.list
      },
    })
    await state.menu.refresh()
    const pending = state.menu.run({ type: "install" })
    response.list = oldList.promise
    const stale = state.menu.refresh()
    state.setScope({ profile: "work", generation: 1, disabled: true })
    expect(state.menu.store.busy).toBe("install")
    expect(state.menu.blocked()).toBe(true)
    response.list = Promise.resolve({ phase: "ready", apps: [] })
    state.setScope("disabled", false)
    await state.menu.refresh()
    await state.menu.run({ type: "install" })
    expect(installs).toEqual(["install"])
    oldList.resolve({ phase: "error", apps: [app], error: "unavailable" })
    await stale
    expect(state.menu.store.apps).toEqual([])
    expect(state.menu.store.error).toBeUndefined()
    lists.length = 0
    response.list = Promise.resolve({ phase: "ready", apps: globalApps })
    install.resolve({ status: "installed", apps: [app] })
    await pending
    expect(lists).toEqual(["list"])
    expect(state.menu.store.apps).toEqual(globalApps)
    expect(state.menu.store.busy).toBeUndefined()
    expect(state.menu.blocked()).toBe(false)
    state.dispose()
  })

  test.each(["web generation", "profile round-trip"] as const)("%s still cancels pending launch", async (change) => {
    const opening = Promise.withResolvers<LinuxOpenResult>()
    const launches: string[] = []
    const state = setup(
      {
        appDockLinuxOpen: async () => opened,
        appDockLinuxList: async () => ({ phase: "ready", apps: [] }),
        appDockLinuxLaunch: async () => {
          launches.push("launch")
          return { status: "launched" }
        },
      },
      () => opening.promise,
    )
    const pending = state.menu.run({ type: "launch", appID: app.id })
    expect(state.menu.store.busy).toBe("launch")
    if (change === "web generation") state.setScope("generation", 1)
    if (change === "profile round-trip") {
      state.setScope("profile", "work")
      state.setScope("profile", "default")
    }
    expect(state.menu.store.busy).toBeUndefined()
    expect(state.menu.blocked()).toBe(false)
    opening.resolve(opened)
    await pending
    expect(launches).toEqual([])
    expect(state.menu.store.error).toBeUndefined()
    state.dispose()
  })

  test("disposal during install refresh ignores late apps and cleanup writes", async () => {
    const refreshed = Promise.withResolvers<LinuxState>()
    const response = { list: Promise.resolve<LinuxState>({ phase: "ready", apps: [] }) }
    const lists: string[] = []
    const state = setup({
      appDockLinuxInstall: async () => ({ status: "installed", apps: [app] }),
      appDockLinuxList: () => {
        lists.push("list")
        return response.list
      },
    })
    await state.menu.refresh()
    lists.length = 0
    response.list = refreshed.promise
    const pending = state.menu.run({ type: "install" })
    await Promise.resolve()
    expect(state.menu.store.apps).toEqual([app])
    expect(state.menu.store.busy).toBe("install")
    expect(state.menu.store.loading).toBe(true)
    state.dispose()
    refreshed.resolve({ phase: "error", apps: [], error: "unavailable" })
    await pending
    state.setScope({ profile: "work", generation: 1 })
    expect(lists).toEqual(["list"])
    expect(state.menu.store.apps).toEqual([app])
    expect(state.menu.store.error).toBeUndefined()
    expect(state.menu.store.busy).toBe("install")
    expect(state.menu.store.loading).toBe(true)
  })
})

test("Linux tab menu ref focuses the first enabled menuitem in DOM order", async () => {
  const {
    createSourceFile,
    forEachChild,
    isArrowFunction,
    isFunctionDeclaration,
    isJsxAttribute,
    isJsxExpression,
    ScriptKind,
    ScriptTarget,
  } = await import("typescript")
  // The menu is private. Execute its actual ref callback without exporting or copying UI code.
  const source = createSourceFile(
    "apps-panel-tab-menu.tsx",
    await Bun.file(`${process.env.APP_DOCK_REVIEW_UI_SOURCE ?? import.meta.dir}/apps-panel-tab-menu.tsx`).text(),
    ScriptTarget.Latest,
    true,
    ScriptKind.TSX,
  )
  const menu = source.statements.find(
    (node) => isFunctionDeclaration(node) && node.name?.text === "TabMenu" && !!node.body,
  )
  if (!menu) throw new Error("TabMenu function not found")
  const refs: string[] = []
  const visit = (node: import("typescript").Node) => {
    if (
      isJsxAttribute(node) &&
      node.name.getText(source) === "ref" &&
      node.initializer &&
      isJsxExpression(node.initializer) &&
      node.initializer.expression &&
      isArrowFunction(node.initializer.expression)
    ) {
      refs.push(node.initializer.expression.getText(source))
    }
    forEachChild(node, visit)
  }
  visit(menu)
  expect(refs).toHaveLength(1)
  const fixture = document.createElement("div")
  const invoker = document.createElement("button")
  const element = document.createElement("div")
  element.setAttribute("role", "menu")
  const items = [true, false, true, false].map((disabled) => {
    const item = document.createElement("button")
    item.setAttribute("role", "menuitem")
    item.disabled = disabled
    return item
  })
  element.append(...items)
  fixture.append(invoker, element)
  document.body.append(fixture)
  const mounted: HTMLDivElement[] = []
  const ref = new Function(
    "props",
    `let menu;\n${new Bun.Transpiler({ loader: "ts" }).transformSync(`const ref = ${refs[0]!}`)}\nreturn ref;`,
  )({
    setElement: (element: HTMLDivElement) => mounted.push(element),
  }) as (element: HTMLDivElement) => void
  try {
    invoker.focus()
    expect(document.activeElement === invoker).toBe(true)
    ref(element)
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    expect(mounted).toEqual([element])
    expect(items.findIndex((item) => item === document.activeElement)).toBe(1)
  } finally {
    fixture.remove()
  }
})
