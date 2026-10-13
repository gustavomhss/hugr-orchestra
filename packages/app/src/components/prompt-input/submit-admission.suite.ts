import { describe, expect, test } from "bun:test"
import { clearPending, pendingRules, togglePending } from "../draft-subagent-models"
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
  savedRules,
  sentShell,
  sessionCreateInputs,
  state,
  storedSessions,
  submitInput,
  syncedDirectories,
} from "./submit-harness"

describe("prompt admission and worktree selection", () => {
  test("saves the first restriction selected while session creation is pending", async () => {
    state.protocol = "v1"
    const gate = Promise.withResolvers<void>()
    state.createSessionGate = gate.promise
    const key = "late-first-restriction"
    const submit = createPromptSubmit({
      ...submitInput(),
      prompt: createPromptState({ prompt: "first" }),
      info: () => undefined,
      pendingKey: () => key,
    })
    const result = submit.handleSubmit({ preventDefault: () => undefined } as Event)
    await state.createStarted.promise
    togglePending(key, "provider", "restricted")
    gate.resolve()
    await result
    expect(savedRules[0]?.permission).toEqual([
      { permission: "task", pattern: "*/*", action: "deny" },
      { permission: "task", pattern: "provider/restricted", action: "allow" },
    ])
    expect(promptInputs).toHaveLength(1)
    clearPending(key)
  })

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
    expect(createdSessions).toEqual(["/repo/main/new"])
    expect(promptInputs).toHaveLength(1)
    expect(promptInputs[0]).toMatchObject({ sessionID: "session-1", text: "first" })
    expect(draft.current()[0]).toMatchObject({ content: "later typing" })
  })

  test("retains rules, text, worktree and created ID on permission failure; retry saves before sending", async () => {
    state.protocol = "v1"
    state.rulesFailure = true
    const key = "local:draft:rules-retry"
    togglePending(key, "provider", "allowed")
    const expected = pendingRules(key)
    const draft = createPromptState({ prompt: "restricted" })
    const submit = createPromptSubmit({
      ...submitInput(),
      prompt: draft,
      info: () => undefined,
      pendingKey: () => key,
      newSessionWorktree: () => "create",
    })
    const event = { preventDefault: () => undefined } as Event
    await submit.handleSubmit(event)
    expect(promptInputs).toEqual([])
    expect(pendingRules(key)).toEqual(expected)
    expect(draft.current()[0]).toMatchObject({ content: "restricted" })
    expect(createdSessions).toEqual(["/repo/main/new"])
    expect(promoted).toEqual([])

    state.rulesFailure = false
    const gate = Promise.withResolvers<void>()
    state.rulesGate = gate.promise
    state.rulesStarted = Promise.withResolvers<void>()
    const retry = submit.handleSubmit(event)
    await state.rulesStarted.promise
    expect(promptInputs).toEqual([])
    expect(pendingRules(key)).toEqual(expected)
    gate.resolve()
    await retry
    expect(state.worktreeCreates).toBe(1)
    expect(createdSessions).toEqual(["/repo/main/new"])
    expect(savedRules).toEqual([
      { sessionID: "session-1", directory: "/repo/main/new", permission: expected },
      { sessionID: "session-1", directory: "/repo/main/new", permission: expected },
    ])
    expect(pendingRules(key)).toEqual([])
    expect(promptInputs).toHaveLength(1)
    expect(promptInputs[0]).toMatchObject({ sessionID: "session-1", text: "restricted" })
    clearPending(key)
  })

  test("acknowledges picker changes made while the first permission write is pending", async () => {
    state.protocol = "v1"
    const key = "local:draft:rules-edited"
    togglePending(key, "provider", "allowed")
    const gate = Promise.withResolvers<void>()
    state.rulesGate = gate.promise
    const submit = createPromptSubmit({
      ...submitInput(),
      prompt: createPromptState({ prompt: "restricted" }),
      info: () => undefined,
      pendingKey: () => key,
    })
    const submitted = submit.handleSubmit({ preventDefault: () => undefined } as Event)
    await state.rulesStarted.promise
    togglePending(key, "provider", "allowed")
    gate.resolve()
    await submitted
    expect(savedRules.map((save) => save.permission)).toEqual([
      [
        { permission: "task", pattern: "*/*", action: "deny" },
        { permission: "task", pattern: "provider/allowed", action: "allow" },
      ],
      [{ permission: "task", pattern: "*/*", action: "allow" }],
    ])
    expect(promptInputs).toHaveLength(1)
    clearPending(key)
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
