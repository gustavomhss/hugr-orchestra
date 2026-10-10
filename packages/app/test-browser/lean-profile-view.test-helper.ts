import { createComponent, createStore, render } from "./lean-project-metrics.test-helper"
import { LeanCoverage } from "@orchestra/schema/lean-coverage"
import type { LeanDashboard } from "@orchestra/schema/lean-dashboard"
import type { LeanViewProps } from "@/orchestra/chapters/lean-view-contract"

const { LeanProfileView } = await import("@/orchestra/chapters/lean-view")
const { PlatformProvider } = await import("@/context/platform")
const { LanguageProvider } = await import("@/context/language")
type MutableProps = { -readonly [K in keyof LeanViewProps]: LeanViewProps[K] }

export function info(profileID = "profile-one"): LeanDashboard.Info {
  return {
    scope: { profileID, projectID: "same-git-project", directory: `/repo/${profileID}` },
    engine: "typed-fixture-not-transport",
    enabled: true,
    coverage: "saved-profile-history",
    complete: true,
    savings: { bytesSaved: 1024, tokensSaved: -4, calls: 2, tokenCalls: 2 },
    items: LeanCoverage.items.map((item) => ({
      id: item.id,
      enabled: true,
      savings: { bytesSaved: 0, tokensSaved: 0, calls: 0, tokenCalls: 0 },
    })),
  }
}

export function history(data = info()): LeanDashboard.History {
  return {
    scope: data.scope,
    itemID: "cargo",
    complete: true,
    executions: [
      {
        sessionID: "session-one",
        messageID: "message-one",
        partID: "part-one",
        callID: "call-one",
        itemID: "cargo",
        command: "cargo test --workspace",
        commandTruncated: false,
        status: "completed",
        exit: 0,
        time: 1735689600000,
        bytesSaved: 1024,
        tokensSaved: -4,
      },
    ],
  }
}

export function mount(patch: Partial<LeanViewProps> = {}, locale: "en" | "br" = "en") {
  const [props, set] = createStore<MutableProps>({
    profileName: "Profile one",
    loading: false,
    data: info(),
    onUpdate() {},
    onHistory() {},
    onRefresh() {},
    ...patch,
  })
  const host = document.createElement("div")
  document.body.append(host)
  const dispose = render(
    () =>
      createComponent(PlatformProvider, {
        value: { platform: "web", openExternal() {}, async restart() {}, async notify() {} },
        get children() {
          return createComponent(LanguageProvider, {
            locale,
            get children() {
              return createComponent(LeanProfileView, props)
            },
          })
        },
      }),
    host,
  )
  return {
    props,
    host,
    set,
    close() {
      dispose()
      host.remove()
    },
    row: (id: LeanCoverage.ItemID) => host.querySelector<HTMLTableRowElement>(`[data-lean-item="${id}"]`)!,
    switch: (id: LeanCoverage.ItemID) =>
      host.querySelector<HTMLButtonElement>(`[data-lean-item="${id}"] [role="switch"]`)!,
    open: (id: LeanCoverage.ItemID) => host.querySelector<HTMLButtonElement>(`#lean-trigger-${id}`)!.click(),
  }
}
