import { expect, test } from "bun:test"

// Earlier browser fixtures change Solid's process-wide scheduler. Keep this real router/Meta graph in its own runtime.
const suffix = "?router-cleanup"
const runtime = Object.fromEntries(
  ["solid-js", "solid-js/store", "solid-js/web", "@solidjs/router", "@solidjs/meta"]
    .map((name) => [name, Bun.resolveSync(name, import.meta.dir) + suffix] as const),
)
Bun.plugin({
  name: "router-cleanup-runtime",
  setup(build) {
    build.onLoad({ filter: /\.js\?router-cleanup$/ }, async (args) => ({
      loader: "js",
      contents: (await Bun.file(args.path.slice(0, -suffix.length)).text())
        .replace(/\bfrom\s*(["'])(solid-js(?:\/(?:web|store))?)\1/g, (_match, _quote, name: string) =>
          `from ${JSON.stringify(runtime[name])}`),
    }))
  },
})
const { MetaProvider, Title }: typeof import("@solidjs/meta") = await import(runtime["@solidjs/meta"])
const { MemoryRouter, Route, createMemoryHistory, useParams }: typeof import("@solidjs/router") = await import(runtime["@solidjs/router"])
const { createEffect, createMemo, onCleanup }: typeof import("solid-js") = await import(runtime["solid-js"])
const { createComponent, render }: typeof import("solid-js/web") = await import(runtime["solid-js/web"])

test("route cleanup cannot invalidate an owner list being disposed", async () => {
  const host = document.createElement("div")
  document.body.append(host)
  const history = createMemoryHistory()
  const disposed = { home: 0, repository: 0 }
  const owners: { route: string; disposals: number }[] = []
  const track = (route: string, page: keyof typeof disposed) => {
    const owner = { route, disposals: 0 }
    owners.push(owner)
    onCleanup(() => { owner.disposals++; disposed[page]++ })
  }
  const snapshot = () => ({ location: history.get(), html: host.innerHTML, title: document.title, disposed: { ...disposed } })
  const committed = async (location: string, label: string) => {
    const read = () => {
      const button = host.querySelector<HTMLButtonElement>(`button[data-route="${location}"]`)
      return history.get() === location && button?.textContent === label ? button : undefined
    }
    const queued = snapshot()
    const deadline = Date.now() + 5_000
    while (!read() && Date.now() < deadline) await Bun.sleep(10)
    expect(read(), JSON.stringify({ queued, current: snapshot() })).toBeDefined()
    console.log("router committed route", JSON.stringify({ queued, current: snapshot() }))
    return read()!
  }

  const RepoPage = () => {
    const params = useParams<{ id?: string }>()
    const title = createMemo(() => params.id ?? "")
    const button = document.createElement("button")
    createEffect(() => { button.dataset.route = `/${params.id}` })
    track(`/${params.id ?? "pending"}`, "repository")
    button.textContent = "Back"
    button.addEventListener("click", () => history.set({ value: "/", scroll: false, replace: false }))
    return [
      createComponent(Title, {
        get children() {
          return title()
        },
      }),
      button,
    ]
  }

  const HomePage = () => {
    const button = document.createElement("button")
    button.dataset.route = "/"
    track("/", "home")
    button.textContent = "Go"
    button.addEventListener("click", () => history.set({ value: "/project", scroll: false, replace: false }))
    return button
  }

  const App = () =>
    createComponent(MetaProvider, {
      get children() {
        return createComponent(MemoryRouter, {
          history,
          get children() {
            return [
              createComponent(Route, { path: "/", component: HomePage }),
              createComponent(Route, { path: "/:id", component: RepoPage }),
            ]
          },
        })
      },
    })

  const dispose = render(() => createComponent(App, {}), host)
  try {
    const go = await committed("/", "Go")
    expect(go.textContent).toBe("Go")
    go.click()
    const back = await committed("/project", "Back")
    expect(back.textContent).toBe("Back")
    expect(document.title).toBe("project")
    expect(disposed).toEqual({ home: 1, repository: 0 })
    back.click()
    await committed("/", "Go")
    expect(host.querySelector("button")?.textContent).toBe("Go")
    expect(disposed).toEqual({ home: 1, repository: 1 })
  } finally {
    try {
      dispose()
    } finally {
      host.remove()
      console.log("router disposed owners", JSON.stringify({ owners, attached: host.isConnected }))
    }
  }
  expect(owners.length).toBeGreaterThanOrEqual(3)
  expect(owners.map((owner) => owner.disposals)).toEqual(owners.map(() => 1))
})
