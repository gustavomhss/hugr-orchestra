import { expect, test } from "bun:test"
import { createComponent, createSignal } from "solid-js"
import { render } from "solid-js/web"
import { solidDom } from "./solid-dom"

const { AccountSourceList } = await import(solidDom("../src/orchestra/chapters/inbox/controls.tsx", import.meta.dir))
const { LanguageProvider } = await import(solidDom("../src/context/language.tsx", import.meta.dir))
const { PlatformProvider } = await import(solidDom("../src/context/platform.tsx", import.meta.dir))

test("Sources shows a Jira failure only after accounts resolves, then clears it when the refresh succeeds", async () => {
  const [status, setStatus] = createSignal<readonly { source: string; connected: boolean; state?: string }[]>([])
  const [loading, setLoading] = createSignal(true)
  const root = document.createElement("div")
  document.body.append(root)
  const dispose = render(
    () =>
      createComponent(PlatformProvider, {
        value: { platform: "web", openExternal() {}, async restart() {}, async notify() {} },
        get children() {
          return createComponent(LanguageProvider, {
            locale: "en",
            get children() {
              return createComponent(AccountSourceList, {
                status,
                loading,
                pressed: () => false,
                busy: false,
                choose: () => undefined,
              })
            },
          })
        },
      }),
    root,
  )
  expect(root.querySelector("[role=alert]")).toBeNull()
  expect(root.textContent).not.toContain("Not connected")

  setLoading(false)
  setStatus([{ source: "jira", connected: true, state: "failed" }])
  await Promise.resolve()
  expect(root.querySelector("[role=alert]")?.textContent).toBe("Saved, but the last refresh failed.")
  expect(root.textContent).not.toContain("Credential saved")

  setStatus([{ source: "jira", connected: true, state: "synced" }])
  await Promise.resolve()
  expect(root.querySelector("[role=alert]")).toBeNull()
  expect(root.textContent).toContain("Credential saved")

  dispose()
  root.remove()
})
