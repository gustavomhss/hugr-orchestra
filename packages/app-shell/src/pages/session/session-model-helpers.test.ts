import { describe, expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { createStore } from "solid-js/store"
import { createLocal, type Saved } from "@/context/local"
import type { Platform } from "@/context/platform"
import { createPromptSession, createPromptState } from "@/context/prompt-state"
import { ServerScope } from "@/utils/server-scope"
import type { UserMessage } from "@/v2-wire"

import { resetSessionModel, restorePromptModel, syncPromptModel, syncSessionModel } from "./session-model-helpers"

const message = (input?: { agent?: string; model?: UserMessage["model"] }) =>
  ({
    id: "msg",
    sessionID: "session",
    role: "user",
    time: { created: 1 },
    agent: input?.agent ?? "build",
    model: input?.model ?? { providerID: "anthropic", modelID: "claude-sonnet-4" },
  }) as UserMessage

describe("syncSessionModel", () => {
  test("restores the last message through session state", () => {
    const calls: unknown[] = []

    syncSessionModel(
      {
        session: {
          restore(value) {
            calls.push(value)
          },
          reset() {},
        },
      },
      message({ model: { providerID: "anthropic", modelID: "claude-sonnet-4", variant: "high" } }),
    )

    expect(calls).toEqual([
      message({ model: { providerID: "anthropic", modelID: "claude-sonnet-4", variant: "high" } }),
    ])
  })
})

describe("resetSessionModel", () => {
  test("clears draft session state", () => {
    const calls: string[] = []

    resetSessionModel({
      session: {
        reset() {
          calls.push("reset")
        },
        restore() {},
      },
    })

    expect(calls).toEqual(["reset"])
  })
})

describe("persisted prompt model recovery", () => {
  const scope = { dir: "L3JlcG8", id: "session" }
  const removed = { providerID: "anthropic", modelID: "removed-model" }

  test.each([undefined, null, "", "default"])("round-trips an unavailable model with variant %p", async (variant) => {
    const values = new Map<string, string>()
    const platform: Platform = {
      platform: "desktop",
      openExternal() {},
      async openDirectoryPickerDialog() { return null },
      async restart() {},
      async notify() {},
      storage: () => ({
        getItem: (key) => values.get(key) ?? null,
        setItem(key, value) { values.set(key, value) },
        removeItem(key) { values.delete(key) },
      }),
    }
    const initial = createRoot((dispose) => ({
      dispose,
      prompt: createPromptSession(ServerScope.local, scope, { prompt: "pending response" }, platform),
    }))
    const selected = variant === undefined ? removed : { ...removed, variant }
    try {
      await initial.prompt.ready.promise
      initial.prompt.model.set(selected)
    } finally {
      initial.dispose()
    }

    const reopened = createRoot((dispose) => ({
      dispose,
      prompt: createPromptSession(ServerScope.local, scope, undefined, platform),
      local: localSelection(scope.id),
    }))
    try {
      await reopened.prompt.ready.promise
      const editor = reopened.prompt.capture()
      expect(editor.model.current()).toEqual(selected)
      expect(reopened.local.model.intent().model).toBeUndefined()
      expect(reopened.local.model.list()).toEqual([])
      expect(restorePromptModel(reopened.local, editor)).toBe(true)
      expect(reopened.local.model.intent()).toEqual({ model: removed, variant })
      const stored = editor.model.current()
      syncPromptModel(reopened.local, editor)
      expect(editor.model.current()).toBe(stored)

      editor.model.set(undefined)
      syncPromptModel(reopened.local, editor)
      expect(editor.model.current()?.variant).toBe(variant)
      expect(JSON.parse(Array.from(values.values())[0]!).model).toEqual(selected)
      expect(editor.current()[0]).toMatchObject({ content: "pending response" })
    } finally {
      reopened.dispose()
    }
  })

  test("keeps starter text and leaves an implicit model choice absent", () => {
    createRoot((dispose) => {
      try {
        const prompt = createPromptState({ prompt: "starter text" })
        const local = localSelection(scope.id)
        expect(restorePromptModel(local, prompt)).toBe(false)
        syncPromptModel(local, prompt)
        expect(prompt.model.current()).toBeUndefined()
        expect(prompt.current()[0]).toMatchObject({ content: "starter text" })
      } finally {
        dispose()
      }
    })
  })
})

function localSelection(sessionID: string) {
  type Deps = Parameters<typeof createLocal>[0]
  const [saved, setSaved] = createStore<Saved>({ session: {} })
  const sdk = { directory: "/repo", modelExecutionEpoch: () => 0 }
  const serverSDK = { scope: ServerScope.local, sessionManagement: {} }
  return createLocal({
    params: { id: sessionID },
    sdk: (() => sdk) as unknown as Deps["sdk"],
    sync: (() => ({ data: { agent: [], config: {} } })) as unknown as Deps["sync"],
    serverSDK: (() => serverSDK) as unknown as Deps["serverSDK"],
    providers: {
      all: () => new Map(),
      connected: () => [],
      default: () => ({}),
      defaultModel: () => undefined,
    } as unknown as Deps["providers"],
    models: {
      ready: Object.assign(() => false, { promise: undefined }),
      recent: { list: () => [] },
      variant: { get: () => undefined },
      list: () => [],
      find: () => undefined,
    } as unknown as Deps["models"],
    saved,
    setSaved,
    savedReady: () => true,
  })
}
