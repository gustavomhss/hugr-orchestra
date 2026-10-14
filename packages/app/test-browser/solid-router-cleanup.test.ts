import { expect, test } from "bun:test"
import { MetaProvider, Title } from "@solidjs/meta"
import { MemoryRouter, Route, createMemoryHistory, useParams } from "@solidjs/router"
import { createMemo, onCleanup } from "solid-js"
import { createComponent, render } from "solid-js/web"

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
    button.dataset.route = `/${params.id}`
    track(button.dataset.route, "repository")
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
