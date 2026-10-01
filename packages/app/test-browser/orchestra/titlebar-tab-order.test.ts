import { expect, test } from "bun:test"
import { createComponent, createRoot, startTransition, Suspense } from "solid-js"
import { nextTabAfterClose, pushClosedTab, type ClosedTab } from "../../src/context/closed-tabs"
import type { SessionTab } from "../../src/context/tabs"
import type { ServerConnection } from "../../src/context/server"
import { closeProfileTab } from "../../src/components/titlebar-tab-order"

test("active close overrides the native hidden successor and preserves native closed history", async () => {
  await createRoot(async (dispose) => {
    createComponent(Suspense, { children: undefined })
    const server = "remote" as ServerConnection.Key
    const first: SessionTab = { type: "session", server, sessionId: "A1" }
    const hidden: SessionTab = { type: "session", server, sessionId: "B1" }
    const last: SessionTab = { type: "session", server, sessionId: "A2" }
    const all = [first, hidden, last]
    const closed: ClosedTab[] = []
    const routes: string[] = []
    try {
      await closeProfileTab({
        visible: [first, last],
        current: first,
        tab: first,
        tabs: {
          store: all,
          closeTab: (index) => {
            void startTransition(() => {
              closed.push(...pushClosedTab([], all[index], index))
              const next = nextTabAfterClose(all, index, true)
              routes.push(next?.type === "session" ? next.sessionId : "/")
            })
          },
          select: (tab) => routes.push(tab.sessionId),
        },
        home: () => routes.push("/"),
      })
      expect(closed).toEqual([{ tab: first, index: 0 }])
      expect(routes).toEqual(["B1", "A2"])
    } finally {
      dispose()
    }
  })
})
