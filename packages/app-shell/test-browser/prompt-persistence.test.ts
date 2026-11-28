import { describe, expect, test } from "bun:test"
import type { AsyncStorage } from "@solid-primitives/storage"
import { createEffect, createRoot } from "solid-js"
import { createStore } from "solid-js/store"
import { createLocal, type Saved } from "@/context/local"
import type { Platform } from "@/context/platform"
import { createPromptReady, createPromptSession } from "@/context/prompt-state"
import { restorePromptModel, syncPromptModel } from "@/pages/session/session-model-helpers"
import { ServerScope } from "@/utils/server-scope"
import { createDraftStore } from "@/utils/draft-store"

let read: ((value: string | null) => void) | undefined

const storage: AsyncStorage = {
  getItem: () => new Promise((resolve) => (read = resolve)),
  setItem: async () => undefined,
  removeItem: async () => undefined,
  clear: async () => undefined,
  key: async () => null,
  getLength: async () => 0,
  length: Promise.resolve(0),
}

const platform: Platform = {
  platform: "web",
  openExternal: () => undefined,
  restart: async () => undefined,
  notify: async () => undefined,
  draftStore: {
    ...storage,
    putBlob: async () => {
      throw new Error("putBlob is not used by this test")
    },
  },
}

describe("prompt persistence", () => {
  test("waits for an async draft to hydrate before reporting ready", async () => {
    await new Promise<void>((resolve, reject) => {
      createRoot((dispose) => {
        const session = createPromptSession(ServerScope.local, { draftID: "draft-async" }, undefined, platform)
        const ready = createPromptReady(() => session)

        expect(ready()).toBe(false)
        expect(session.current()[0]).toMatchObject({ type: "text", content: "" })

        read?.(
          JSON.stringify({
            prompt: [{ type: "text", content: "persisted draft", start: 0, end: 15 }],
            cursor: 15,
            context: { items: [] },
          }),
        )

        createEffect(() => {
          if (!ready()) return
          try {
            expect(session.current()[0]).toMatchObject({ type: "text", content: "persisted draft" })
            dispose()
            resolve()
          } catch (error) {
            dispose()
            reject(error)
          }
        })
      })
    })
  })

  test.each([undefined, null, "", "default"] as const)("round-trips an unavailable model with variant %p", async (variant) => {
    const scope = { dir: "L3JlcG8", id: "session" }
    const removed = { providerID: "anthropic", modelID: "removed-model" }
    const selected = variant === undefined ? removed : { ...removed, variant }
    const values = new Map<string, string>()
    const desktop: Platform = {
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
      prompt: createPromptSession(ServerScope.local, scope, { prompt: "pending response" }, desktop),
    }))
    try {
      await initial.prompt.ready.promise
      initial.prompt.model.set(selected)
    } finally {
      initial.dispose()
    }

    const reopened = createRoot((dispose) => ({
      dispose,
      prompt: createPromptSession(ServerScope.local, scope, undefined, desktop),
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
})

test("moves legacy image data URLs into blobs and hydrates object URLs", async () => {
  const documents = new Map<string, string>()
  const blobs = new Map<string, Blob>()
  const store = createDraftStore({
    get: async (key) => documents.get(key) ?? null,
    set: async (key, value) => void documents.set(key, value),
    remove: async (key) => void documents.delete(key),
    putBlob: async (blob) => {
      const id = String(blob.size)
      blobs.set(id, blob)
      return id
    },
    getBlob: async (id) => blobs.get(id) ?? null,
  })

  await store.setItem("prompt", JSON.stringify({ prompt: [{ type: "image", dataUrl: "data:image/png;base64,YQ==" }] }))
  expect(documents.get("prompt")).not.toContain("dataUrl")
  const value = JSON.parse((await store.getItem("prompt"))!)
  expect(value.prompt[0].blob.id).toBe("1")
  expect(value.prompt[0].blob.url).toStartWith("blob:")
})

test("does not let delayed blob migration overwrite a newer draft", async () => {
  const documents = new Map<string, string>()
  const migration = Promise.withResolvers<void>()
  const store = createDraftStore({
    get: async () => null,
    set: async (key, value) => void documents.set(key, value),
    remove: async () => undefined,
    putBlob: async () => {
      await migration.promise
      return "blob"
    },
    getBlob: async () => null,
  })
  const older = store.setItem(
    "prompt",
    JSON.stringify({ prompt: [{ type: "image", dataUrl: "data:image/png;base64,YQ==" }] }),
  )
  await Bun.sleep(0)
  await store.setItem("prompt", JSON.stringify({ prompt: [{ type: "text", content: "latest" }] }))
  migration.resolve()
  await older

  expect(documents.get("prompt")).toContain("latest")
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
