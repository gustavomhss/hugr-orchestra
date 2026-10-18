import { expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { createPromptState } from "@/context/prompt-state"
import { ServerScope } from "@/utils/server-scope"
import { Worktree } from "@/utils/worktree"
import { clearPending, pendingPolicy, pendingSnapshot, togglePending } from "../draft-subagent-models"
import { draftSessionKey } from "./draft-session"
import {
  behaviors, commands, createPromptSubmit, createdSessions, enabledAutoAccept, optimistic, optimisticRemovals,
  policyWrites, promoted, promotedDrafts, promptInputs, removedSessions, sentCommands, sentShell, state, storedSessions,
  submitInput, policyFixture, sdkFor,
} from "./submit-harness"

// Restores the retained-admission proofs from dev 792ed6cc7c against the shared isolated harness.
test.each(["prompt", "command", "shell"])("fresh %s dispatch survives promotion unmount, but only after receipt", async (pathway) => {
  state.search.draftId = "draft-1"
  const key = draftSessionKey(ServerScope.local, "/repo/main", "draft-1")
  togglePending(key, "provider", "model", true)
  commands.push({ name: "review" })
  const entered = Promise.withResolvers<void>()
  const gate = Promise.withResolvers<void>()
  state.sendHook = async () => { entered.resolve(); await gate.promise }
  const root = createRoot((dispose) => {
    const real = createPromptState({ prompt: pathway === "command" ? "/review changes" : "first turn" })
    real.context.add({ type: "file", path: "/repo/main/file", comment: "retain until admission" })
    return { dispose, real, submit: createPromptSubmit({
      ...submitInput(), prompt: real, info: () => undefined, pendingKey: () => key,
      autoAccept: () => true, mode: () => pathway === "shell" ? "shell" : "normal",
      onNewSessionWorktreeReset: () => { state.worktreeResets++ },
    }) }
  })
  const contents = root.real.current()
  const context = root.real.context.items()
  state.promoteDraftHook = root.dispose
  const sending = root.submit.handleSubmit(new Event("submit"))
  // Early handoff disposes the owner before dispatch; settlement must fail this proof without a timeout.
  await Promise.race([entered.promise, sending])
  const waiting = {
    promotions: promotedDrafts.slice(), prompt: root.real.current(), context: root.real.context.items(),
    resets: state.worktreeResets, policy: pendingPolicy(key), autoAccept: enabledAutoAccept.slice(),
  }
  await root.submit.handleSubmit(new Event("submit"))
  const dispatches = promptInputs.length + sentCommands.length + sentShell.length
  gate.resolve()
  await sending
  expect(waiting.promotions).toEqual([])
  expect(waiting.prompt).toBe(contents)
  expect(waiting.context).toBe(context)
  expect(waiting.resets).toBe(0)
  expect(waiting.policy.mode).toBe("allowlist")
  expect(waiting.autoAccept).toHaveLength(1)
  expect(createdSessions).toHaveLength(1)
  expect(dispatches).toBe(1)
  expect(promotedDrafts).toHaveLength(1)
  expect(state.worktreeResets).toBe(1)
  expect(pendingSnapshot(key).revision).toBe(0)
  await root.submit.handleSubmit(new Event("submit"))
  expect(promptInputs.length + sentCommands.length + sentShell.length).toBe(1)
})

test("route navigation waits for the prompt receipt without a draft tab", async () => {
  const entered = Promise.withResolvers<void>()
  const gate = Promise.withResolvers<void>()
  state.sendHook = async () => { entered.resolve(); await gate.promise }
  const real = createPromptState({ prompt: "route only after admission" })
  const contents = real.current()
  const submit = createPromptSubmit({ ...submitInput(), prompt: real, info: () => undefined })
  const sending = submit.handleSubmit(new Event("submit"))
  await entered.promise
  const waiting = { id: state.params.id, promotions: promoted.slice(), prompt: real.current() }
  gate.resolve()
  await sending
  expect(waiting).toEqual({ id: undefined, promotions: [], prompt: contents })
  expect(waiting.prompt).toBe(contents)
  expect(state.params.id).toBe("session-1")
  expect(promoted).toEqual([{ directory: "/repo/main", sessionID: "session-1" }])
  expect(promptInputs).toHaveLength(1)
})

test.each(["prompt", "command", "shell"])("failed fresh %s keeps its full payload, context and selections for exact retry", async (pathway) => {
  state.search.draftId = "draft-1"
  const key = draftSessionKey(ServerScope.local, "/repo/main", "draft-1")
  commands.push({ name: "review" })
  togglePending(key, "provider", "model", true)
  const real = createPromptState({ prompt: pathway === "command" ? "/review changes" : "retry turn" })
  real.context.add({ type: "file", path: "/repo/main/file", comment: "retain context" })
  const contents = real.current()
  const context = real.context.items()
  state.sendHook = async () => { throw new Error("admission failed") }
  const submit = createPromptSubmit({
    ...submitInput(), prompt: real, info: () => undefined, pendingKey: () => key,
    newSessionWorktree: () => "/repo/worktree-a", mode: () => pathway === "shell" ? "shell" : "normal",
    onNewSessionWorktreeReset: () => { state.worktreeResets++ },
  })
  expect(await submit.handleSubmit(new Event("submit"))).toBe(false)
  expect(real.current()).toBe(contents)
  expect(real.context.items()).toBe(context)
  expect(pendingPolicy(key).mode).toBe("allowlist")
  expect(promotedDrafts).toEqual([])
  expect(state.worktreeResets).toBe(0)
  const first = JSON.stringify([...promptInputs, ...sentCommands, ...sentShell][0])
  expect(first).toBeDefined()
  state.sendHook = async () => {}
  await submit.handleSubmit(new Event("submit"))
  expect(createdSessions).toEqual(["/repo/worktree-a"])
  expect([...promptInputs, ...sentCommands, ...sentShell].map((input) => JSON.stringify(input))).toEqual([first, first])
  expect(promotedDrafts).toHaveLength(1)
  expect(state.worktreeResets).toBe(1)
})

test.each(["v1", "v2"])("failed first send on %s deletes the Session the server confirms empty and keeps the draft", async (protocol) => {
  state.protocol = protocol
  state.search.draftId = "draft-1"
  const key = draftSessionKey(ServerScope.local, "/repo/main", "draft-1")
  togglePending(key, "provider", "model", true)
  const real = createPromptState({ prompt: "first turn" })
  const contents = real.current()
  state.messageCount = 0
  state.sendHook = async () => { throw new Error("admission failed") }
  const submit = createPromptSubmit({ ...submitInput(), prompt: real, info: () => undefined, pendingKey: () => key })
  expect(await submit.handleSubmit(new Event("submit"))).toBe(false)
  expect(removedSessions).toEqual(["session-1"])
  expect(storedSessions["/repo/main"]?.map((session) => session.id)).toEqual([])
  expect(real.current()).toBe(contents)
  expect(pendingPolicy(key).mode).toBe("allowlist")
  expect(promotedDrafts).toEqual([])
  state.sendHook = async () => {}
  await submit.handleSubmit(new Event("submit"))
  expect(createdSessions).toEqual(["/repo/main", "/repo/main"])
  expect(promptInputs.at(-1)).toMatchObject({ sessionID: "session-2", text: "first turn" })
  expect(promotedDrafts).toEqual([{ draftID: "draft-1", server: "project-server", sessionId: "session-2" }])
})

test.each([
  { name: "the server cannot be read", messageCount: undefined, removeFailure: false, removed: [] },
  { name: "the delete fails", messageCount: 0, removeFailure: true, removed: ["session-1"] },
])("failed first send keeps the Session as Empty session when $name, and the retry sends to it", async (probe) => {
  state.messageCount = probe.messageCount
  state.removeFailure = probe.removeFailure
  const real = createPromptState({ prompt: "first turn" })
  state.sendHook = async () => { throw new Error("admission failed") }
  const submit = createPromptSubmit({ ...submitInput(), prompt: real, info: () => undefined })
  expect(await submit.handleSubmit(new Event("submit"))).toBe(false)
  expect(removedSessions).toEqual(probe.removed)
  expect(storedSessions["/repo/main"]).toEqual([expect.objectContaining({ id: "session-1", title: "orchestra.chat.send.emptySession" })])
  state.removeFailure = false
  state.sendHook = async () => {}
  await submit.handleSubmit(new Event("submit"))
  expect(createdSessions).toEqual(["/repo/main"])
  expect(promptInputs.at(-1)).toMatchObject({ sessionID: "session-1", text: "first turn" })
  expect(storedSessions["/repo/main"]?.[0]).toMatchObject({ id: "session-1", title: "New session 1" })
})

test("failed first send leaves a Session that already holds a message alone", async () => {
  state.messageCount = 1
  const submit = createPromptSubmit({ ...submitInput(), prompt: createPromptState({ prompt: "first turn" }), info: () => undefined })
  state.sendHook = async () => { throw new Error("response lost") }
  expect(await submit.handleSubmit(new Event("submit"))).toBe(false)
  expect(removedSessions).toEqual([])
  expect(storedSessions["/repo/main"]).toEqual([expect.objectContaining({ id: "session-1", title: "New session 1" })])
})

test("failed exact retry reuses wire preparation, attachment bytes, optimistic part IDs and system", async () => {
  const real = createPromptState()
  real.set([
    { type: "text", content: "retry ", start: 0, end: 6 },
    { type: "file", path: "file.ts", content: "@file.ts", start: 6, end: 14 },
    { type: "agent", name: "backend", content: "@backend", start: 14, end: 22 },
    { type: "file", path: "capture.png", filename: "capture.png", mime: "image/png", url: "data:image/png;base64,aGk=", content: "", start: 22, end: 22 },
  ])
  real.context.add({ type: "file", path: "context.ts", comment: "check @other.ts", commentOrigin: "review" })
  behaviors.system = "first prepared system"
  state.sendHook = async () => { throw new Error("prepared request failed") }
  const submit = createPromptSubmit({ ...submitInput(), prompt: real, info: () => undefined })
  expect(await submit.handleSubmit(new Event("submit"))).toBe(false)
  const first = promptInputs[0] as { id: string; legacyParts: { id: string }[]; system?: string; files: { uri: string }[]; agents: unknown[] }
  const serialized = JSON.stringify(first)
  expect(first.legacyParts).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: "text" }),
    expect.objectContaining({ type: "file" }),
    expect.objectContaining({ type: "agent" }),
  ]))
  expect(first.files).toContainEqual(expect.objectContaining({ uri: "data:image/png;base64,aGk=" }))
  expect(first.agents).toContainEqual(expect.objectContaining({ name: "backend" }))
  expect(optimistic[0]?.parts.map((part) => part.id)).toEqual(first.legacyParts.map((part) => part.id))
  expect(optimisticRemovals).toContainEqual(expect.objectContaining({ messageID: first.id }))
  behaviors.system = "later profile system"
  state.sendHook = async () => {}
  await submit.handleSubmit(new Event("submit"))
  expect(promptInputs).toHaveLength(2)
  expect(JSON.stringify(promptInputs[1])).toBe(serialized)
  expect(first.system).toBe("first prepared system")
  expect(optimistic).toHaveLength(2)
  expect(optimistic[1]?.message.id).toBe(first.id)
  expect(optimistic[1]?.parts).toEqual(optimistic[0]?.parts)
  expect(optimistic[1]?.parts.every((part) => part.messageID === first.id)).toBe(true)
  expect(createdSessions).toHaveLength(1)
})

test.each(["prompt", "policy", "model", "variant", "agent"])("editing %s after failed dispatch creates a new action in the retained worktree Session", async (edit) => {
  const key = draftSessionKey(ServerScope.local, "/repo/main")
  togglePending(key, "provider", "first-model", true)
  const real = createPromptState({ prompt: "first action" })
  state.sendHook = async () => { throw new Error("ambiguous admission") }
  const submit = createPromptSubmit({ ...submitInput(), prompt: real, info: () => undefined, pendingKey: () => key })
  expect(await submit.handleSubmit(new Event("submit"))).toBe(false)
  const first = promptInputs[0] as { id: string; legacyParts: { id: string }[] }
  expect(first.id).toStartWith("msg_")
  if (edit === "prompt") real.set([{ type: "text", content: "edited action", start: 0, end: 13 }])
  if (edit === "policy") { clearPending(key); togglePending(key, "provider", "first-model", true) }
  if (edit === "model") state.modelID = "edited-model"
  if (edit === "variant") state.variant = "high"
  if (edit === "agent") state.agentID = "frontend"
  const revision = pendingSnapshot(key).revision
  state.sendHook = async () => { expect(pendingSnapshot(key).revision).toBe(revision) }
  await submit.handleSubmit(new Event("submit"))
  expect(createdSessions).toEqual(["/repo/main"])
  expect(promptInputs).toHaveLength(2)
  const second = promptInputs[1] as typeof first
  expect(second.id).not.toBe(first.id)
  expect(second.legacyParts.map((part) => part.id)).not.toEqual(first.legacyParts.map((part) => part.id))
  expect(optimistic[1]?.message.id).toBe(second.id)
  expect(optimistic[1]?.parts.map((part) => part.id)).toEqual(second.legacyParts.map((part) => part.id))
  if (edit === "prompt") expect(second).toMatchObject({ text: "edited action" })
  if (edit === "model") expect(second).toMatchObject({ model: { modelID: "edited-model" } })
  if (edit === "variant") expect(second).toMatchObject({ variant: "high" })
  if (edit === "agent") expect(second).toMatchObject({ agent: "frontend" })
})

test("policy changed at a retry's worktree boundary rebinds wire and optimistic IDs together", async () => {
  const directory = "/repo/retained-preparation-fence"
  policyFixture.sdk = sdkFor(directory, policyFixture.server)
  const key = draftSessionKey(ServerScope.local, directory)
  togglePending(key, "provider", "first-model", true)
  const real = createPromptState({ prompt: "prepared turn at final fence" })
  state.sendHook = async () => { throw new Error("first prepared send failed") }
  const submit = createPromptSubmit({ ...submitInput(), prompt: real, info: () => undefined, pendingKey: () => key })
  expect(await submit.handleSubmit(new Event("submit"))).toBe(false)
  const first = promptInputs[0] as { id: string; legacyParts: { id: string }[] }
  Worktree.pending(ServerScope.local, directory)
  expect(Worktree.get(ServerScope.local, directory)).toEqual({ status: "pending" })
  const entered = Promise.withResolvers<void>()
  state.statusObserved = (args) => {
    if (args[0] === "session_status" && Worktree.get(ServerScope.local, directory)?.status === "pending") entered.resolve()
  }
  const retry = submit.handleSubmit(new Event("submit"))
  await Promise.race([entered.promise, retry])
  togglePending(key, "provider", "second-model", true)
  const latest = pendingSnapshot(key)
  state.sendHook = async () => { expect(pendingSnapshot(key).revision).toBe(latest.revision) }
  Worktree.ready(ServerScope.local, directory)
  await retry
  expect(promptInputs).toHaveLength(2)
  const second = promptInputs[1] as typeof first
  expect(second.id).not.toBe(first.id)
  expect(second.legacyParts.map((part) => part.id)).not.toEqual(first.legacyParts.map((part) => part.id))
  expect(optimistic[1]?.message.id).toBe(second.id)
  expect(optimistic[1]?.parts.map((part) => part.id)).toEqual(second.legacyParts.map((part) => part.id))
  expect(optimistic[1]?.parts.every((part) => part.messageID === second.id)).toBe(true)
  expect(policyWrites.at(-1)?.policy).toEqual(latest.policy)
  expect(createdSessions).toEqual([directory])
  expect(pendingSnapshot(key).revision).toBe(0)
})

test("policy edit during request preparation gets latest ACK before actual dispatch", async () => {
  const key = draftSessionKey(ServerScope.local, "/repo/main")
  togglePending(key, "provider", "model", true)
  const entered = Promise.withResolvers<void>()
  const gate = Promise.withResolvers<void>()
  state.behaviorHook = async () => { entered.resolve(); await gate.promise }
  const submit = createPromptSubmit({ ...submitInput(), prompt: createPromptState({ prompt: "latest policy" }), info: () => undefined, pendingKey: () => key })
  const sending = submit.handleSubmit(new Event("submit"))
  await entered.promise
  clearPending(key)
  state.sendHook = async () => { expect(policyWrites.at(-1)?.policy).toEqual({ mode: "inherit" }) }
  gate.resolve()
  await sending
  expect(policyWrites.map((write) => write.policy.mode)).toEqual(["allowlist", "inherit"])
  expect(promptInputs).toHaveLength(1)
})
