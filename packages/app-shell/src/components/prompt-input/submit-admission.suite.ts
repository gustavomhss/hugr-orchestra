import { describe, expect, test } from "bun:test"
import { clearPending, pendingPolicy, togglePending } from "../draft-subagent-models"
import { createRoot } from "solid-js"
import { isServer } from "solid-js/web"
import { ServerScope } from "@/utils/server-scope"
import { ServerConnection } from "@/context/server"
import { draftSessionKey } from "./draft-session"
import { createPromptState } from "@/context/prompt-state"
import {
  createPromptSubmit,
  createdSessions,
  enabledAutoAccept,
  optimisticSeeded,
  promoted,
  promotedAgents,
  promotedDrafts,
  prompt,
  promptInputs,
  worktreeCreateInputs,
  sentShell,
  sessionCreateInputs,
  state,
  storedSessions,
  submitInput,
  syncedDirectories,
  policyFixture, serverFor, sdkFor, setReactiveOwner, interrupts, statusWrites,
} from "./submit-harness"

const deferred = () => Promise.withResolvers<void>()

test("abort cancels an admitted draft before its ACK without a session route", async () => {
  const key = "abort-admitted-draft"
  togglePending(key, "provider", "model", true)
  const gate = deferred()
  state.rulesGate = gate.promise
  const real = createPromptState({ prompt: "retain cancelled draft" })
  const contents = real.current()
  const submit = createPromptSubmit({ ...submitInput(), prompt: real, info: () => undefined, pendingKey: () => key })
  const sending = submit.handleSubmit(new Event("submit"))
  await state.rulesStarted.promise
  expect(state.params.id).toBeUndefined()
  await submit.abort()
  expect(interrupts).toEqual(["session-1"])
  gate.resolve()
  await sending
  expect(promoted).toEqual([])
  expect(promptInputs).toEqual([])
  expect(real.current()).toBe(contents)
  expect(pendingPolicy(key).mode).toBe("allowlist")
  clearPending(key)
})

test("a successful interrupt reads the active state back so Stop clears a stale spinner", async () => {
  const submit = createPromptSubmit({ ...submitInput(), prompt: createPromptState({ prompt: "first" }), info: () => undefined })
  state.params.id = "ses-stale"
  state.active = {}
  await submit.abort()
  expect(interrupts).toEqual(["ses-stale"])
  expect(statusWrites).toEqual([{ sessionID: "ses-stale", type: "idle" }])

  statusWrites.length = 0
  state.active = { "ses-stale": { type: "running" } }
  await submit.abort()
  expect(statusWrites).toEqual([{ sessionID: "ses-stale", type: "busy" }])
})

test("abort after a route change interrupts only the current Session", async () => {
  const key = "abort-foreign-route"
  togglePending(key, "provider", "model", true)
  const gate = deferred()
  state.rulesGate = gate.promise
  const submit = createPromptSubmit({ ...submitInput(), prompt: createPromptState({ prompt: "first" }), info: () => undefined, pendingKey: () => key })
  const sending = submit.handleSubmit(new Event("submit"))
  await state.rulesStarted.promise
  state.params.id = "other-session"
  await submit.abort()
  expect(interrupts).toEqual(["other-session"])
  gate.resolve()
  await sending
  expect(promoted).toEqual([])
  expect(promptInputs).toEqual([])
  clearPending(key)
})

test("abort callback navigation cannot retarget captured draft cancellation", async () => {
  const selection = { key: "abort-callback-owner" }
  const key = selection.key
  togglePending(key, "provider", "model", true)
  const gate = deferred()
  state.rulesGate = gate.promise
  const submit = createPromptSubmit({
    ...submitInput(), prompt: createPromptState({ prompt: "cancel original" }), info: () => undefined,
    pendingKey: () => selection.key,
    onAbort: () => { selection.key = "foreign-draft"; state.params.id = "foreign-session" },
  })
  const sending = submit.handleSubmit(new Event("submit"))
  await state.rulesStarted.promise
  await submit.abort()
  expect(interrupts).toEqual(["session-1"])
  gate.resolve()
  await sending
  expect(promoted).toEqual([])
  expect(promptInputs).toEqual([])
  clearPending(key)
})

test.skipIf(isServer)("pre-route abort still cancels its captured draft after owner ABA", async () => {
  const key = "abort-draft-aba"
  const original = { server: policyFixture.server, sdk: policyFixture.sdk }
  const foreign = serverFor(ServerScope.fromServerKey(ServerConnection.Key.make("foreign")))
  setReactiveOwner("read", () => () => original)
  togglePending(key, "provider", "model", true)
  const gate = deferred()
  state.rulesGate = gate.promise
  const root = createRoot((dispose) => ({ dispose, submit: createPromptSubmit({
    ...submitInput(), prompt: createPromptState({ prompt: "cancel old attempt" }), info: () => undefined, pendingKey: () => key,
  }) }))
  const sending = root.submit.handleSubmit(new Event("submit"))
  await state.rulesStarted.promise
  setReactiveOwner("read", () => () => ({ server: foreign, sdk: sdkFor("/other", foreign) }))
  setReactiveOwner("read", () => () => original)
  await root.submit.abort()
  expect(interrupts).toEqual(["session-1"])
  gate.resolve()
  await sending
  expect(promoted).toEqual([])
  expect(promptInputs).toEqual([])
  root.dispose()
  clearPending(key)
})

// Complete frozen e6c39ff72d cases, bound to the shared submission harness.
test.skipIf(isServer)("reactive owner ABA during ACK permanently expires attempt; deliberate retry adopts same Session", async () => {
  expect(isServer).toBe(false)
  const key = draftSessionKey(ServerScope.local, "/repo/main")
  const source = { server: policyFixture.server, sdk: policyFixture.sdk }
  const otherServer = serverFor(ServerScope.fromServerKey(ServerConnection.Key.make("server-b")))
  const other = { server: otherServer, sdk: sdkFor("/repo/main", otherServer) }
  setReactiveOwner("read", () => () => source)
  const entered = deferred()
  const gate = deferred()
  togglePending(key, "provider", "model", true)
  state.policyWrite = async () => { entered.resolve(); await gate.promise }
  const root = createRoot((dispose) => {
    const real = createPromptState({ prompt: "source draft" })
    real.context.add({ type: "file", path: "/repo/main/file", comment: "retain context" })
    return { dispose, real, submit: createPromptSubmit({ ...submitInput(), prompt: real, info: () => undefined, pendingKey: () => key }) }
  })
  const contents = root.real.current()
  const context = root.real.context.items()
  const sending = root.submit.handleSubmit(new Event("submit"))
  await entered.promise
  setReactiveOwner("read", () => () => other)
  await Promise.resolve()
  setReactiveOwner("read", () => () => source)
  gate.resolve()
  await sending
  expect(root.real.current()).toBe(contents)
  expect(root.real.context.items()).toBe(context)
  expect(pendingPolicy(key).mode).toBe("allowlist")
  expect(createdSessions).toHaveLength(1)
  expect(promoted).toEqual([])
  expect(promptInputs).toEqual([])
  state.policyWrite = async () => {}
  await root.submit.handleSubmit(new Event("submit"))
  expect(createdSessions).toHaveLength(1)
  expect(promoted).toHaveLength(1)
  expect(promptInputs).toHaveLength(1)
  root.dispose()
})

test.skipIf(isServer)("reactive owner disposal during ACK expires attempt without consuming draft", async () => {
  expect(isServer).toBe(false)
  const key = draftSessionKey(ServerScope.local, "/repo/main")
  const entered = deferred()
  const gate = deferred()
  togglePending(key, "provider", "model", true)
  state.policyWrite = async () => { entered.resolve(); await gate.promise }
  const root = createRoot((dispose) => {
    const real = createPromptState({ prompt: "retained on disposal" })
    return { dispose, real, submit: createPromptSubmit({ ...submitInput(), prompt: real, info: () => undefined, pendingKey: () => key }) }
  })
  const contents = root.real.current()
  const sending = root.submit.handleSubmit(new Event("submit"))
  await entered.promise
  root.dispose()
  gate.resolve()
  await sending
  expect(root.real.current()).toBe(contents)
  expect(pendingPolicy(key).mode).toBe("allowlist")
  expect(promoted).toEqual([])
  expect(promptInputs).toEqual([])
})

test("failed policy ACK retains draft/context/worktree/session; retry adopts same admission", async () => {
  const key = draftSessionKey(ServerScope.local, "/repo/main")
  const real = createPromptState({ prompt: "ls" })
  real.context.add({ type: "file", path: "/repo/main/file", comment: "keep me" })
  const contents = real.current()
  const context = real.context.items()
  togglePending(key, "provider", "model", true)
  const failure = new Error("policy write failed")
  state.policyWrite = async () => { throw failure }
  const submit = createPromptSubmit({
    ...submitInput(), prompt: real, info: () => undefined, mode: () => "shell", pendingKey: () => key,
    newSessionWorktree: () => "create", onNewSessionWorktreeReset: () => { state.worktreeResets++ },
  })
  expect(await submit.handleSubmit(new Event("submit"))).toBe(false)
  expect(real.current()).toBe(contents)
  expect(real.context.items()).toBe(context)
  expect(pendingPolicy(key)).toEqual({ mode: "allowlist", models: [{ providerID: "provider", id: "model" }] })
  expect(createdSessions).toEqual(["/repo/main-workspaces/new"])
  expect(promoted).toEqual([])
  expect(sentShell).toEqual([])
  expect(state.worktreeResets).toBe(0)
  state.policyWrite = async () => {}
  await submit.handleSubmit(new Event("submit"))
  expect(createdSessions).toEqual(["/repo/main-workspaces/new"])
  expect(sentShell).toHaveLength(1)
  expect(sentShell[0]?.sessionID).toBe("session-1")
  expect(promoted).toEqual([{ directory: "/repo/main-workspaces/new", sessionID: "session-1" }])
  expect(state.worktreeResets).toBe(1)
  expect(pendingPolicy(key)).toEqual({ mode: "inherit" })
})

test("double-click while ACK waits admits one Session and one prompt", async () => {
  const key = draftSessionKey(ServerScope.local, "/repo/main")
  const entered = deferred()
  const gate = deferred()
  togglePending(key, "provider", "model", true)
  state.policyWrite = async () => { entered.resolve(); await gate.promise }
  const real = createPromptState({ prompt: "send once" })
  const submit = createPromptSubmit({ ...submitInput(), prompt: real, info: () => undefined, pendingKey: () => key })
  const first = submit.handleSubmit(new Event("submit"))
  await entered.promise
  await submit.handleSubmit(new Event("submit"))
  expect(createdSessions).toHaveLength(1)
  expect(promptInputs).toEqual([])
  gate.resolve()
  await first
  expect(createdSessions).toHaveLength(1)
  expect(promptInputs).toHaveLength(1)
})

test("owner switch during ACK keeps source draft and admitted Session for retry", async () => {
  const key = draftSessionKey(ServerScope.local, "/repo/main")
  const source = policyFixture.server
  const entered = deferred()
  const gate = deferred()
  togglePending(key, "provider", "model", true)
  state.policyWrite = async () => { entered.resolve(); await gate.promise }
  const real = createPromptState({ prompt: "source draft" })
  const contents = real.current()
  const submit = createPromptSubmit({ ...submitInput(), prompt: real, info: () => undefined, pendingKey: () => key })
  const sending = submit.handleSubmit(new Event("submit"))
  await entered.promise
  policyFixture.server = serverFor(ServerScope.fromServerKey(ServerConnection.Key.make("server-b")))
  policyFixture.sdk = sdkFor("/repo/main", policyFixture.server)
  gate.resolve()
  await sending
  expect(real.current()).toBe(contents)
  expect(pendingPolicy(key).mode).toBe("allowlist")
  expect(promoted).toEqual([])
  expect(promptInputs).toEqual([])
  policyFixture.server = source
  policyFixture.sdk = sdkFor("/repo/main", source)
  state.policyWrite = async () => {}
  await submit.handleSubmit(new Event("submit"))
  expect(createdSessions).toHaveLength(1)
  expect(promptInputs).toHaveLength(1)
})

describe("prompt admission and worktree selection", () => {

  test("locks a draft before worktree/session admission and preserves later typing", async () => {
    const gate = Promise.withResolvers<void>()
    state.createSessionGate = gate.promise
    const draft = createPromptState({ prompt: "first" })
    const submit = createPromptSubmit({
      ...submitInput(),
      prompt: draft,
      info: () => undefined,
      newSessionWorktree: () => "create",
    })
    const event = { preventDefault: () => undefined } as Event
    const first = submit.handleSubmit(event)
    const second = submit.handleSubmit(event)
    draft.set([{ type: "text", content: "later typing", start: 0, end: 12 }])
    gate.resolve()
    await Promise.all([first, second])
    expect(state.worktreeCreates).toBe(1)
    expect(worktreeCreateInputs).toEqual([
      { projectID: "project", strategy: "git_worktree", directory: "/repo/main-workspaces", location: { directory: "/repo/main" } },
    ])
    expect(createdSessions).toEqual(["/repo/main-workspaces/new"])
    expect(promptInputs).toHaveLength(1)
    expect(promptInputs[0]).toMatchObject({ sessionID: "session-1", text: "first" })
    expect(draft.current()[0]).toMatchObject({ content: "later typing" })
  })

  test("reads the latest worktree accessor value per submit", async () => {
    const submit = createPromptSubmit({
      prompt,
      info: () => undefined,
      imageAttachments: () => [],
      commentCount: () => 0,
      autoAccept: () => false,
      mode: () => "shell",
      working: () => false,
      editor: () => undefined,
      queueScroll: () => undefined,
      promptLength: (value) => value.reduce((sum, part) => sum + ("content" in part ? part.content.length : 0), 0),
      addToHistory: () => undefined,
      resetHistoryNavigation: () => undefined,
      setMode: () => undefined,
      setPopover: () => undefined,
      newSessionWorktree: () => state.selected,
      onNewSessionWorktreeReset: () => undefined,
      onSubmit: () => undefined,
    })

    const event = { preventDefault: () => undefined } as unknown as Event

    await submit.handleSubmit(event)
    state.params.id = undefined
    state.sdkOverride = undefined
    policyFixture.sdk = sdkFor("/repo/main", policyFixture.server)
    state.selected = "/repo/worktree-b"
    await submit.handleSubmit(event)

    expect(createdSessions).toEqual(["/repo/worktree-a", "/repo/worktree-b"])
    expect(sessionCreateInputs).toEqual([
      {
        agent: "backend",
        model: { id: "model", providerID: "provider", variant: undefined },
        location: { directory: "/repo/worktree-a" },
      },
      {
        agent: "backend",
        model: { id: "model", providerID: "provider", variant: undefined },
        location: { directory: "/repo/worktree-b" },
      },
    ])
    expect(sentShell).toEqual([
      expect.objectContaining({ sessionID: "session-1", id: expect.stringMatching(/^evt_/), command: "ls" }),
      expect.objectContaining({ sessionID: "session-2", id: expect.stringMatching(/^evt_/), command: "ls" }),
    ])
    expect(syncedDirectories).toEqual(["/repo/worktree-a", "/repo/worktree-a", "/repo/worktree-b", "/repo/worktree-b"])
    expect(state.serverSessionSyncs).toBe(0)
    expect(promoted).toEqual([
      { directory: "/repo/worktree-a", sessionID: "session-1" },
      { directory: "/repo/worktree-b", sessionID: "session-2" },
    ])
    expect(promotedAgents).toEqual(["backend", "backend"])
    expect(JSON.stringify([sessionCreateInputs, sentShell])).not.toContain("Pikachu")
    expect(syncedDirectories).toEqual(["/repo/worktree-a", "/repo/worktree-a", "/repo/worktree-b", "/repo/worktree-b"])
  })

  test("applies auto-accept to newly created sessions", async () => {
    const submit = createPromptSubmit({
      prompt,
      info: () => undefined,
      imageAttachments: () => [],
      commentCount: () => 0,
      autoAccept: () => true,
      mode: () => "shell",
      working: () => false,
      editor: () => undefined,
      queueScroll: () => undefined,
      promptLength: (value) => value.reduce((sum, part) => sum + ("content" in part ? part.content.length : 0), 0),
      addToHistory: () => undefined,
      resetHistoryNavigation: () => undefined,
      setMode: () => undefined,
      setPopover: () => undefined,
      newSessionWorktree: () => state.selected,
      onNewSessionWorktreeReset: () => undefined,
      onSubmit: () => undefined,
    })

    const event = { preventDefault: () => undefined } as unknown as Event

    await submit.handleSubmit(event)

    expect(enabledAutoAccept).toEqual([{ server: "server-a", sessionID: "session-1", directory: "/repo/worktree-a" }])
  })

  test("keeps auto-accept bound to the submission server", async () => {
    let release = () => {}
    state.createSessionGate = new Promise<void>((resolve) => {
      release = resolve
    })
    const submit = createPromptSubmit({
      prompt,
      info: () => undefined,
      imageAttachments: () => [],
      commentCount: () => 0,
      autoAccept: () => true,
      mode: () => "shell",
      working: () => false,
      editor: () => undefined,
      queueScroll: () => undefined,
      promptLength: (value) => value.reduce((sum, part) => sum + ("content" in part ? part.content.length : 0), 0),
      addToHistory: () => undefined,
      resetHistoryNavigation: () => undefined,
      setMode: () => undefined,
      setPopover: () => undefined,
      newSessionWorktree: () => state.selected,
      onNewSessionWorktreeReset: () => undefined,
      onSubmit: () => undefined,
    })

    const result = submit.handleSubmit({ preventDefault: () => undefined } as unknown as Event)
    state.permissionServer = "server-b"
    release()
    await result

    expect(enabledAutoAccept).toEqual([{ server: "server-a", sessionID: "session-1", directory: "/repo/worktree-a" }])
  })

  test("promotes drafts using the selected project's server", async () => {
    state.search = { draftId: "draft-1" }
    const submit = createPromptSubmit({
      prompt,
      info: () => undefined,
      imageAttachments: () => [],
      commentCount: () => 0,
      autoAccept: () => false,
      mode: () => "normal",
      working: () => false,
      editor: () => undefined,
      queueScroll: () => undefined,
      promptLength: (value) => value.reduce((sum, part) => sum + ("content" in part ? part.content.length : 0), 0),
      addToHistory: () => undefined,
      resetHistoryNavigation: () => undefined,
      setMode: () => undefined,
      setPopover: () => undefined,
      newSessionWorktree: () => state.selected,
      onNewSessionWorktreeReset: () => undefined,
      onSubmit: () => undefined,
    })

    await submit.handleSubmit({ preventDefault: () => undefined } as unknown as Event)

    expect(promotedDrafts).toEqual([{ draftID: "draft-1", server: "project-server", sessionId: "session-1" }])
  })

  test("seeds new sessions before optimistic prompts are added", async () => {
    const submit = createPromptSubmit({
      prompt,
      info: () => undefined,
      imageAttachments: () => [],
      commentCount: () => 0,
      autoAccept: () => false,
      mode: () => "normal",
      working: () => false,
      editor: () => undefined,
      queueScroll: () => undefined,
      promptLength: (value) => value.reduce((sum, part) => sum + ("content" in part ? part.content.length : 0), 0),
      addToHistory: () => undefined,
      resetHistoryNavigation: () => undefined,
      setMode: () => undefined,
      setPopover: () => undefined,
      newSessionWorktree: () => state.selected,
      onNewSessionWorktreeReset: () => undefined,
      onSubmit: () => undefined,
    })

    const event = { preventDefault: () => undefined } as unknown as Event

    await submit.handleSubmit(event)

    expect(storedSessions["/repo/worktree-a"]).toHaveLength(1)
    expect(storedSessions["/repo/worktree-a"]?.[0]).toMatchObject({ id: "session-1", title: "New session 1" })
    expect(optimisticSeeded).toEqual([true])
  })
})
