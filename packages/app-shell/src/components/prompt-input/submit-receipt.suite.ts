import { expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { isServer } from "solid-js/web"
import { createPromptState } from "@/context/prompt-state"
import { ServerConnection } from "@/context/server"
import { ServerScope } from "@/utils/server-scope"
import { pendingSnapshot, togglePending } from "../draft-subagent-models"
import { draftSessionKey } from "./draft-session"
import {
  commands, createPromptSubmit, createdSessions, optimistic, policyFixture, promoted, promptInputs,
  savedPolicies, sdkFor, sentCommands, sentShell, serverFor, setReactiveOwner, state, statusUpdates, submitInput,
} from "./submit-harness"

test.each(["prompt", "command", "shell"])("admitted %s promotes to its placement after a worktree change; a second Send posts nothing", async (pathway) => {
  state.selected = "main"
  commands.push({ name: "review" })
  const entered = Promise.withResolvers<void>()
  const gate = Promise.withResolvers<void>()
  state.sendHook = async () => { entered.resolve(); await gate.promise }
  const real = createPromptState({ prompt: pathway === "command" ? "/review changes" : "receipt-only turn" })
  const submit = createPromptSubmit({
    ...submitInput(), prompt: real, info: () => undefined, newSessionWorktree: () => state.selected,
    mode: () => pathway === "shell" ? "shell" : "normal",
  })
  const sending = submit.handleSubmit(new Event("submit"))
  await entered.promise
  state.selected = "/repo/worktree-b"
  gate.resolve()
  await sending
  expect(promoted).toEqual([{ directory: "/repo/main", sessionID: "session-1" }])
  expect(promptInputs.length + sentCommands.length + sentShell.length).toBe(1)
  if (pathway !== "shell") expect(statusUpdates.length).toBeGreaterThan(0)
  const insertions = optimistic.length
  const statuses = statusUpdates.slice()
  await submit.handleSubmit(new Event("submit"))
  expect(promptInputs.length + sentCommands.length + sentShell.length).toBe(1)
  expect(optimistic).toHaveLength(insertions)
  expect(statusUpdates).toEqual(statuses)
  expect(createdSessions).toEqual(["/repo/main"])
  expect(promoted).toHaveLength(1)
})

test.each(["prompt", "policy", "model"])("%s edit during a draft send still promotes and never posts the admitted prompt again", async (edit) => {
  const key = draftSessionKey(ServerScope.local, "/repo/main")
  const entered = Promise.withResolvers<void>()
  const gate = Promise.withResolvers<void>()
  state.sendHook = async () => { entered.resolve(); await gate.promise }
  const real = createPromptState({ prompt: "admitted turn" })
  const submit = createPromptSubmit({
    ...submitInput(), prompt: real, pendingKey: () => key,
    info: () => state.params.id ? { id: state.params.id } : undefined,
  })
  const sending = submit.handleSubmit(new Event("submit"))
  await entered.promise
  if (edit === "prompt") real.set([{ type: "text", content: "newer draft", start: 0, end: 11 }])
  if (edit === "policy") togglePending(key, "provider", "new-model", true)
  if (edit === "model") state.modelID = "newer-model"
  gate.resolve()
  await sending
  expect(createdSessions).toHaveLength(1)
  expect(promptInputs).toEqual([expect.objectContaining({ sessionID: "session-1", text: "admitted turn" })])
  expect(promoted).toEqual([{ directory: "/repo/main", sessionID: "session-1" }])
  expect(state.params.id).toBe("session-1")
  expect(pendingSnapshot(key).revision).toBe(0)
  if (edit === "policy") expect(savedPolicies.at(-1)).toMatchObject({
    sessionID: "session-1", policy: { mode: "allowlist", models: [expect.objectContaining({ id: "new-model" })] },
  })
  // Newer text waits unsent in the Session composer; any other edit leaves nothing to post.
  expect(real.current()[0]).toMatchObject({ content: edit === "prompt" ? "newer draft" : "" })
  state.sendHook = async () => {}
  await submit.handleSubmit(new Event("submit"))
  expect(createdSessions).toHaveLength(1)
  expect(promptInputs.map((input) => (input as { text: string }).text))
    .toEqual(edit === "prompt" ? ["admitted turn", "newer draft"] : ["admitted turn"])
})

// Server Solid snapshots createMemo. Positive control proves the context accessor sees this edit.
test.skipIf(isServer)("context edit during a draft send still promotes and keeps the new context unsent", async () => {
  expect(isServer).toBe(false)
  const entered = Promise.withResolvers<void>()
  const gate = Promise.withResolvers<void>()
  state.sendHook = async () => { entered.resolve(); await gate.promise }
  const real = createPromptState({ prompt: "admitted turn" })
  const submit = createPromptSubmit({ ...submitInput(), prompt: real, info: () => undefined })
  const sending = submit.handleSubmit(new Event("submit"))
  await entered.promise
  real.context.add({ type: "file", path: "/repo/main/new", comment: "newer context" })
  expect(real.context.items()).toEqual([expect.objectContaining({ path: "/repo/main/new", comment: "newer context" })])
  gate.resolve()
  await sending
  expect(promoted).toEqual([{ directory: "/repo/main", sessionID: "session-1" }])
  expect(promptInputs).toHaveLength(1)
  expect(real.current()[0]).toMatchObject({ content: "" })
  expect(real.context.items()).toEqual([expect.objectContaining({ path: "/repo/main/new", comment: "newer context" })])
  expect(createdSessions).toHaveLength(1)
})

test.each(["failed", "admitted"])("selection changed during %s request shares the source busy lock; a failed one stays separate", async (outcome) => {
  const entered = Promise.withResolvers<void>()
  const gate = Promise.withResolvers<void>()
  state.sendHook = async () => {
    entered.resolve()
    await gate.promise
    if (outcome === "failed") throw new Error("selection A send failed")
  }
  const real = createPromptState({ prompt: "placement-bound turn" })
  const contents = real.current()
  const submit = createPromptSubmit({
    ...submitInput(), prompt: real, info: () => undefined, newSessionWorktree: () => state.selected,
    onNewSessionWorktreeReset: () => { state.worktreeResets++ },
  })
  const sending = submit.handleSubmit(new Event("submit"))
  await entered.promise
  state.selected = "/repo/worktree-b"
  await submit.handleSubmit(new Event("submit"))
  const waiting = { sessions: createdSessions.slice(), dispatches: promptInputs.length }
  gate.resolve()
  await sending
  expect(waiting).toEqual({ sessions: ["/repo/worktree-a"], dispatches: 1 })
  expect(state.selected).toBe("/repo/worktree-b")
  if (outcome === "admitted") {
    // The admitted prompt hands the draft to its own placement even though the selection moved on.
    expect(promoted).toEqual([{ directory: "/repo/worktree-a", sessionID: "session-1" }])
    expect(state.worktreeResets).toBe(1)
    return
  }
  expect(real.current()).toBe(contents)
  expect(promoted).toEqual([])
  expect(state.worktreeResets).toBe(0)
  state.sendHook = async () => {}
  await submit.handleSubmit(new Event("submit"))
  expect(createdSessions).toEqual(["/repo/worktree-a", "/repo/worktree-b"])
  expect(promptInputs).toEqual([
    expect.objectContaining({ sessionID: "session-1" }), expect.objectContaining({ sessionID: "session-2" }),
  ])
  expect(promoted).toEqual([{ directory: "/repo/worktree-b", sessionID: "session-2" }])
  expect(state.worktreeResets).toBe(1)
})

test("returning to failed selection A reuses only A's retained Session and action", async () => {
  const real = createPromptState({ prompt: "retry chosen placement" })
  state.sendHook = async () => { throw new Error("placement send failed") }
  const submit = createPromptSubmit({ ...submitInput(), prompt: real, info: () => undefined, newSessionWorktree: () => state.selected })
  expect(await submit.handleSubmit(new Event("submit"))).toBe(false)
  state.selected = "/repo/worktree-b"
  expect(await submit.handleSubmit(new Event("submit"))).toBe(false)
  state.selected = "/repo/worktree-a"
  state.sendHook = async () => {}
  await submit.handleSubmit(new Event("submit"))
  expect(createdSessions).toEqual(["/repo/worktree-a", "/repo/worktree-b"])
  const requests = promptInputs as { id: string; sessionID: string }[]
  expect(requests.map((request) => request.sessionID)).toEqual(["session-1", "session-2", "session-1"])
  expect(requests[2]?.id).toBe(requests[0]?.id)
  expect(requests[1]?.id).not.toBe(requests[0]?.id)
  expect(promoted).toEqual([{ directory: "/repo/worktree-a", sessionID: "session-1" }])
})

test.skipIf(isServer).each(["create", "POST"])("owner disposal during %s preserves source; remount adopts created Session without repeating admitted POST", async (phase) => {
  expect(isServer).toBe(false)
  const entered = Promise.withResolvers<void>()
  const gate = Promise.withResolvers<void>()
  if (phase === "create") state.createSessionGate = gate.promise
  if (phase === "POST") state.sendHook = async () => { entered.resolve(); await gate.promise }
  const real = createPromptState({ prompt: "captured source" })
  const contents = real.current()
  const input = { ...submitInput(), prompt: real, info: () => undefined }
  const root = createRoot((dispose) => ({ dispose, submit: createPromptSubmit(input) }))
  const sending = root.submit.handleSubmit(new Event("submit"))
  await (phase === "create" ? state.createStarted.promise : entered.promise)
  root.dispose()
  gate.resolve()
  await sending
  expect(real.current()).toBe(contents)
  expect(promoted).toEqual([])
  expect(promptInputs).toHaveLength(phase === "POST" ? 1 : 0)
  state.sendHook = async () => {}
  const remount = createRoot((dispose) => ({ dispose, submit: createPromptSubmit(input) }))
  await remount.submit.handleSubmit(new Event("submit"))
  expect(createdSessions).toEqual(["/repo/main"])
  expect(promptInputs).toHaveLength(1)
  expect(promoted).toEqual([{ directory: "/repo/main", sessionID: "session-1" }])
  remount.dispose()
})

test.skipIf(isServer).each(["create", "POST"])("owner server ABA during %s expires attempt; explicit retry never repeats admitted POST", async (phase) => {
  expect(isServer).toBe(false)
  const source = { server: policyFixture.server, sdk: policyFixture.sdk }
  const foreign = serverFor(ServerScope.fromServerKey(ServerConnection.Key.make("receipt-foreign")))
  const other = { server: foreign, sdk: sdkFor("/foreign", foreign) }
  setReactiveOwner("read", () => () => source)
  const entered = Promise.withResolvers<void>()
  const gate = Promise.withResolvers<void>()
  if (phase === "create") state.createSessionGate = gate.promise
  if (phase === "POST") state.sendHook = async () => { entered.resolve(); await gate.promise }
  const root = createRoot((dispose) => {
    const real = createPromptState({ prompt: "ABA captured source" })
    return { dispose, real, submit: createPromptSubmit({ ...submitInput(), prompt: real, info: () => undefined }) }
  })
  const contents = root.real.current()
  const sending = root.submit.handleSubmit(new Event("submit"))
  await (phase === "create" ? state.createStarted.promise : entered.promise)
  setReactiveOwner("read", () => () => other)
  await Promise.resolve()
  setReactiveOwner("read", () => () => source)
  gate.resolve()
  await sending
  expect(root.real.current()).toBe(contents)
  expect(promoted).toEqual([])
  expect(promptInputs).toHaveLength(phase === "POST" ? 1 : 0)
  state.sendHook = async () => {}
  await root.submit.handleSubmit(new Event("submit"))
  expect(createdSessions).toEqual(["/repo/main"])
  expect(promptInputs).toHaveLength(1)
  expect(promoted).toEqual([{ directory: "/repo/main", sessionID: "session-1" }])
  root.dispose()
})

test("a completed workspace draft cannot adopt its promoted Session on the next new-session visit", async () => {
  const real = createPromptState({ prompt: "first workspace draft" })
  const input = { ...submitInput(), prompt: real, info: () => undefined }
  await createPromptSubmit(input).handleSubmit(new Event("submit"))
  expect(state.params.id).toBe("session-1")
  state.params.id = undefined
  state.sdkOverride = undefined
  policyFixture.sdk = sdkFor("/repo/main", policyFixture.server)
  real.set([{ type: "text", content: "next workspace draft", start: 0, end: 20 }])
  await createPromptSubmit(input).handleSubmit(new Event("submit"))
  expect(createdSessions).toEqual(["/repo/main", "/repo/main"])
  expect(promptInputs).toEqual([
    expect.objectContaining({ sessionID: "session-1", text: "first workspace draft" }),
    expect.objectContaining({ sessionID: "session-2", text: "next workspace draft" }),
  ])
  expect(String(state.params.id)).toBe("session-2")
})

test.each(["prompt", "command"])("%s rejoins policy ACK when optimistic store observers edit the final revision", async (pathway) => {
  const key = draftSessionKey(ServerScope.local, "/repo/main")
  commands.push({ name: "review" })
  const changed = { value: false }
  state.statusObserved = () => {
    if (changed.value) return
    changed.value = true
    togglePending(key, "provider", "last-boundary-model", true)
  }
  const real = createPromptState({ prompt: pathway === "command" ? "/review final boundary" : "final boundary" })
  state.sendHook = async () => {
    expect(policyFixture.server.sessionManagement.subagentModelsWriteVersion("session-1")).toBeGreaterThan(0)
  }
  await createPromptSubmit({ ...submitInput(), prompt: real, info: () => undefined, pendingKey: () => key }).handleSubmit(new Event("submit"))
  expect(changed.value).toBe(true)
  expect(promptInputs.length + sentCommands.length).toBe(1)
  expect(pendingSnapshot(key).revision).toBe(0)
})

test.each(["prompt", "command"])("%s never dispatches after an optimistic store observer changes owner", async (pathway) => {
  commands.push({ name: "review" })
  const foreign = serverFor(ServerScope.fromServerKey(ServerConnection.Key.make("final-observer-foreign")))
  state.statusObserved = () => {
    policyFixture.server = foreign
    policyFixture.sdk = sdkFor("/foreign", foreign)
  }
  const real = createPromptState({ prompt: pathway === "command" ? "/review final owner" : "final owner" })
  await createPromptSubmit({ ...submitInput(), prompt: real, info: () => undefined }).handleSubmit(new Event("submit"))
  expect(createdSessions).toHaveLength(1)
  expect(promptInputs).toEqual([])
  expect(sentCommands).toEqual([])
  expect(promoted).toEqual([])
})

test("abort during initial Session creation retains its late receipt without dispatch; deliberate retry adopts it", async () => {
  const gate = Promise.withResolvers<void>()
  state.createSessionGate = gate.promise
  const real = createPromptState({ prompt: "cancel initial creation" })
  const contents = real.current()
  const submit = createPromptSubmit({ ...submitInput(), prompt: real, info: () => undefined })
  const sending = submit.handleSubmit(new Event("submit"))
  await state.createStarted.promise
  await submit.abort()
  gate.resolve()
  await sending
  expect(promptInputs).toEqual([])
  expect(promoted).toEqual([])
  expect(real.current()).toBe(contents)
  await submit.handleSubmit(new Event("submit"))
  expect(createdSessions).toEqual(["/repo/main"])
  expect(promptInputs).toHaveLength(1)
  expect(promoted).toHaveLength(1)
})
