import { expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { createGlobalEmitter } from "@solid-primitives/event-bus"
import { createServerNotificationState } from "../src/context/notification"
import { ServerConnection } from "../src/context/server"
import type { ServerEvent } from "../src/context/server-sdk"
import { ServerScope } from "../src/utils/server-scope"
import { sessionHref } from "../src/utils/session-route"

const settled = {
  "turn complete": { type: "session.step.ended", data: { sessionID: "ses_shared", finish: "stop" } },
  "step failure": { type: "session.step.failed", data: { sessionID: "ses_shared", error: { type: "unknown", message: "boom" } } },
} as const

for (const [name, current] of Object.entries(settled)) {
  test(`${name} click captures the originating server even after active server changes`, async () => {
    const origin = ServerConnection.Key.make("https://origin.test")
    const shown = Promise.withResolvers<(() => void) | undefined>()
    const navigated: string[] = []
    const emitter = createGlobalEmitter<Record<string, ServerEvent>>()
    const directory = "/same/directory"
    const selected = { server: origin }
    const dispose = createRoot((dispose) => {
      createServerNotificationState({
        sdk: { scope: ServerScope.fromServerKey(origin), server: { type: "http", http: { url: origin } }, event: { listen: emitter.listen } },
        sync: { ensureDirSyncContext: () => ({ session: { get: () => ({ title: "Origin session" }), sync: async () => undefined } }) },
        active: () => selected.server === origin, directory: () => directory, sessionID: () => undefined,
        platform: { platform: "web", openExternal() {}, restart: async () => {}, notify: async (_title, _detail, click) => { shown.resolve(click) } },
        settings: { sounds: { agentEnabled: () => false, errorsEnabled: () => false, agent: () => "", errors: () => "" }, notifications: { agent: () => true, errors: () => true } },
        language: { t: (key) => key }, navigate: (href) => navigated.push(href),
      })
      return dispose
    })
    try {
      emitter.emit(directory, { type: current.type, properties: current.data, current } as unknown as ServerEvent)
      const click = await shown.promise
      expect(click).toBeDefined()
      selected.server = ServerConnection.Key.make("https://other.test")
      click?.()
      expect(navigated).toEqual([sessionHref(origin, "ses_shared")])
    } finally { dispose() }
  })
}
