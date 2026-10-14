import { expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { isServer } from "solid-js/web"
import { createStore } from "solid-js/store"
import type { Platform } from "@/context/platform"
import type { FollowupDraft, FollowupSendInput } from "./submit"
import { createPromptState } from "@/context/prompt-state"
import { ServerScope } from "@/utils/server-scope"
import { createQueuedPromptSources, createQueuedPromptStore, queuedPromptPayload } from "./queued-prompt"
import {
  createFollowupSender, createPromptSubmit, followupInput, policyFixture, promptInputs, sentPrompts,
  state, submitInput, clientFor,
} from "./submit-harness"

test.skipIf(isServer).each(["same-owner", "server", "directory", "Session"])(
  "queued store JSON roundtrip and explicit reload Send: %s",
  async (change) => {
    state.params.id = "session-1"
    const queue: FollowupDraft[] = []
    const owner = { serverScopeKey: ServerScope.local, directory: "/repo/main" }
    const bytes = new Map<string, string>()
    const platform = { platform: "desktop", storage: () => ({
      getItem: async (key: string) => bytes.get(key) ?? null,
      setItem: async (key: string, value: string) => { bytes.set(key, value) },
      removeItem: async (key: string) => { bytes.delete(key) },
    }) } as unknown as Platform
    const first = createRoot((dispose) => ({ dispose, store: createQueuedPromptStore(owner, platform) }))
    await first.store[3].promise
    await createPromptSubmit({ ...submitInput(), shouldQueue: () => true, onQueue: (draft) => { queue.push(draft) } }).handleSubmit(new Event("submit"))
    first.store[1]("items", "session-1", [queuedPromptPayload(queue[0], "queued-item")])
    const json = [...bytes.values()][0]
    expect(typeof json).toBe("string")
    const saved = JSON.parse(json)
    expect(Object.keys(saved.items["session-1"][0].source).sort()).toEqual([
      "directory", "runtimeSourceToken", "serverScopeKey", "sessionID", "version",
    ])
    expect(json).not.toContain('"current"')
    expect(json).not.toContain('"api"')
    expect(json).not.toContain('"password"')
    first.dispose()
    const second = createRoot((dispose) => ({ dispose, store: createQueuedPromptStore(owner, platform) }))
    await second.store[3].promise
    const restored = second.store[0].items["session-1"]?.[0]
    if (!restored) throw new Error("Persisted queue missing")
    const input = followupInput(restored)
    input.deliberate = true
    input.currentSource = {
      serverScopeKey: change === "server" ? "foreign" as ServerScope : ServerScope.local,
      directory: change === "directory" ? "/other" : "/repo/main",
      sessionID: change === "Session" ? "other-session" : "session-1",
      protocol: policyFixture.server.protocol, management: policyFixture.server.sessionManagement, current: () => true,
    }
    const sendAfterReload = createFollowupSender(createQueuedPromptSources())
    expect(await sendAfterReload(input)).toBe(change === "same-owner")
    expect(promptInputs).toHaveLength(change === "same-owner" ? 1 : 0)
    expect(second.store[0].items["session-1"]?.[0].prompt).toEqual(restored.prompt)
    second.dispose()
  },
)

test("a live queued source keeps runtime A when the caller supplies runtime B", async () => {
  state.params.id = "session-1"
  const queue: FollowupDraft[] = []
  await createPromptSubmit({ ...submitInput(), shouldQueue: () => true, onQueue: (draft) => { queue.push(draft) } }).handleSubmit(new Event("submit"))
  const input = followupInput(queue[0])
  input.api = clientFor("/foreign").api.session as unknown as FollowupSendInput["api"]
  expect(await createFollowupSender()(input)).toBe(true)
  expect(sentPrompts).toEqual(["/repo/main"])
})

test.skipIf(isServer)("disposed or credentials-edited live sources cannot silently rebind", async () => {
  state.params.id = "session-1"
  const [credentials, setCredentials] = createStore({ password: "private-runtime-password" })
  Object.assign(policyFixture.server, { server: { http: credentials } })
  const queue: FollowupDraft[] = []
  const root = createRoot((dispose) => ({ dispose, submit: createPromptSubmit({
    ...submitInput(), prompt: createPromptState({ prompt: "keep queued" }), shouldQueue: () => true,
    onQueue: (draft) => { queue.push(draft) },
  }) }))
  await root.submit.handleSubmit(new Event("submit"))
  const json = JSON.stringify(queuedPromptPayload(queue[0], "queued-item"))
  expect(json).not.toContain("private-runtime-password")
  const input = followupInput(JSON.parse(json))
  input.deliberate = true
  input.currentSource = {
    serverScopeKey: ServerScope.local, directory: "/repo/main", sessionID: "session-1",
    protocol: policyFixture.server.protocol, management: policyFixture.server.sessionManagement, current: () => true,
  }
  setCredentials("password", "edited")
  setCredentials("password", "private-runtime-password")
  expect(await createFollowupSender()(input)).toBe(false)
  root.dispose()
  expect(await createFollowupSender()(input)).toBe(false)
  expect(promptInputs).toEqual([])
})

test("legacy serialized capability objects migrate without calling non-functions", async () => {
  state.params.id = "session-1"
  const draft: FollowupDraft = { sessionID: "session-1", sessionDirectory: "/repo/main", prompt: state.promptValue,
    context: [], agent: "backend", model: { providerID: "provider", modelID: "model" } }
  const old = { ...draft, source: { scope: ServerScope.local, current: "not callable", before: {}, api: { password: "old-secret" } } }
  const migrated = queuedPromptPayload(old as unknown as FollowupDraft, "legacy-item")
  expect(JSON.stringify(migrated)).not.toContain("old-secret")
  const input = followupInput(migrated)
  input.deliberate = true
  input.currentSource = { serverScopeKey: ServerScope.local, directory: "/repo/main", sessionID: "session-1",
    protocol: policyFixture.server.protocol, management: policyFixture.server.sessionManagement, current: () => true }
  expect(await createFollowupSender(createQueuedPromptSources())(input)).toBe(true)
  expect(promptInputs).toHaveLength(1)
})
