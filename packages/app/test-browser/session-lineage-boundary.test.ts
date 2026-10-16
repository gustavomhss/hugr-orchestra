import { expect, test } from "bun:test"
import { createComponent, createRenderEffect } from "solid-js"
import { createStore } from "solid-js/store"
import { render } from "solid-js/web"
import { SessionLineageBoundary } from "@/pages/session/session-lineage-boundary"

test("failed lineage resets on session/server identity; healthy navigation preserves its subtree", () => {
  const host = document.createElement("div")
  const [route, setRoute] = createStore({ server: "A", session: "missing" })
  const mounts: HTMLElement[] = []
  const dispose = render(
    () =>
      createComponent(SessionLineageBoundary, {
        identity: () => `${route.server}:${route.session}`,
        fallback: (error) => (error instanceof Error ? error.message : String(error)),
        get children() {
          const content = document.createElement("div")
          mounts.push(content)
          createRenderEffect(() => {
            if (route.session === "missing" && route.server === "A") throw new Error("Session not found")
            content.textContent = `${route.server}:${route.session}`
          })
          return content
        },
      }),
    host,
  )
  expect(host.textContent).toBe("Session not found")
  setRoute("session", "valid")
  expect(host.textContent).toBe("A:valid")
  const healthy = host.firstChild
  setRoute("session", "other")
  expect(host.textContent).toBe("A:other")
  expect(host.firstChild).toBe(healthy)
  expect(mounts).toHaveLength(2)
  setRoute("session", "missing")
  expect(host.textContent).toBe("Session not found")
  setRoute("server", "B")
  expect(host.textContent).toBe("B:missing")
  dispose()
})
