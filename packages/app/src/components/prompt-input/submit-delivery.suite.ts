import { describe, expect, test } from "bun:test"
import type { ModelSelection } from "@/context/local"
import type { FollowupDraft } from "./submit"
import {
  behaviorReads,
  behaviors,
  clientFor,
  commands,
  createPromptSubmit,
  events,
  followupSystem,
  optimistic,
  profileProjects,
  prompt,
  promptInputs,
  sendFollowupDraft,
  sentCommands,
  sentPrompts,
  state,
  submitInput,
} from "./submit-harness"

describe("prompt delivery and model selection", () => {
  test("includes the selected variant on optimistic prompts", async () => {
    state.params = { id: "session-1" }
    state.variant = "high"

    const submit = createPromptSubmit({
      prompt,
      info: () => ({ id: "session-1" }),
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
      onSubmit: () => undefined,
    })

    const event = { preventDefault: () => undefined } as unknown as Event

    await submit.handleSubmit(event)
    await Bun.sleep(0)

    expect(optimistic).toHaveLength(1)
    expect(optimistic[0]).toMatchObject({
      message: {
        agent: "backend",
        model: { providerID: "provider", modelID: "model", variant: "high" },
      },
    })
    expect(sentPrompts).toEqual(["/repo/main"])
    expect(promptInputs[0]).toMatchObject({
      sessionID: "session-1",
      text: "ls",
      files: [],
      agents: [],
    })
    expect((promptInputs[0] as { id?: string }).id).toStartWith("msg_")
    expect((promptInputs[0] as { legacyParts?: { id: string; type: string; text?: string }[] }).legacyParts).toEqual([
      { id: expect.stringMatching(/^prt_/), type: "text", text: "ls" },
    ])
  })

  test("reads the profile's LLM behaviors when each message is sent, after the input clears", async () => {
    state.params = { id: "session-1" }
    const submit = createPromptSubmit({
      ...submitInput(),
      setPopover: () => void events.push("clear input"),
    })
    const event = { preventDefault: () => undefined } as unknown as Event

    behaviors.system = "## Caveman (intensity: ultra)"
    await submit.handleSubmit(event)
    await Bun.sleep(0)
    behaviors.system = undefined
    await submit.handleSubmit(event)
    await Bun.sleep(0)

    expect(events).toEqual(["clear input", "resolve behaviors", "clear input", "resolve behaviors"])
    expect(behaviorReads).toEqual([
      { scope: "local", directory: "/repo/main", projects: profileProjects },
      { scope: "local", directory: "/repo/main", projects: profileProjects },
    ])
    expect(promptInputs).toHaveLength(2)
    expect((promptInputs[0] as { system?: string }).system).toBe("## Caveman (intensity: ultra)")
    expect((promptInputs[1] as { system?: string }).system).toBeUndefined()
  })

  test("a failing behavior read still sends the message, without behaviors", async () => {
    state.params = { id: "session-1" }
    behaviors.fail = true
    await createPromptSubmit(submitInput()).handleSubmit({ preventDefault: () => undefined } as unknown as Event)
    await Bun.sleep(0)

    expect(promptInputs).toHaveLength(1)
    expect(promptInputs[0]).toMatchObject({ sessionID: "session-1", text: "ls" })
    expect((promptInputs[0] as { system?: string }).system).toBeUndefined()
  })

  test("a queued message stores no behaviors; they are read when it is sent", async () => {
    state.params = { id: "session-1" }
    behaviors.system = "## Caveman (intensity: lite)"
    const queued: FollowupDraft[] = []
    await createPromptSubmit({
      ...submitInput(),
      shouldQueue: () => true,
      onQueue: (draft) => void queued.push(draft),
    }).handleSubmit({ preventDefault: () => undefined } as unknown as Event)

    expect(queued).toHaveLength(1)
    expect(queued[0]).not.toHaveProperty("system")
    expect(behaviorReads).toEqual([])
    expect(promptInputs).toEqual([])

    const sync = { data: { command: [] }, session: { optimistic: { add: () => {}, remove: () => {} } } }
    const serverSync = { data: { project: profileProjects }, session: { set: () => {} } }
    const send = (draft: FollowupDraft) =>
      sendFollowupDraft({
        api: clientFor("/repo/main").api.session as unknown as Parameters<typeof sendFollowupDraft>[0]["api"],
        sync: sync as unknown as Parameters<typeof sendFollowupDraft>[0]["sync"],
        serverSync: serverSync as unknown as Parameters<typeof sendFollowupDraft>[0]["serverSync"],
        draft,
      })
    const system = await followupSystem(
      { platform: "web" } as Parameters<typeof followupSystem>[0],
      "local" as Parameters<typeof followupSystem>[1],
      serverSync as unknown as Parameters<typeof followupSystem>[2],
      "/repo/worktree-a",
    )
    await send({ ...queued[0]!, system })
    await send(queued[0]!)

    expect(behaviorReads).toEqual([{ scope: "local", directory: "/repo/worktree-a", projects: profileProjects }])
    expect((promptInputs[0] as { system?: string }).system).toBe("## Caveman (intensity: lite)")
    expect((promptInputs[1] as { system?: string }).system).toBeUndefined()
  })

  test("sends the composer's delivery choice with prompts and commands to an existing session", async () => {
    state.params = { id: "session-1" }
    commands.push({ name: "review" })
    const submit = (delivery: "steer" | "queue" | undefined) =>
      createPromptSubmit({
        prompt,
        info: () => ({ id: "session-1" }),
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
        delivery: () => delivery,
      })
    const event = { preventDefault: () => undefined } as unknown as Event

    await submit("queue").handleSubmit(event)
    await Bun.sleep(0)
    expect(promptInputs).toHaveLength(1)
    expect(promptInputs[0]).toMatchObject({ sessionID: "session-1", text: "ls", delivery: "queue" })

    // Without a choice (a V1 server), no delivery field is sent at all.
    state.promptValue = [{ type: "text", content: "ls", start: 0, end: 2 }]
    await submit(undefined).handleSubmit(event)
    await Bun.sleep(0)
    expect(promptInputs).toHaveLength(2)
    expect(promptInputs[1]).not.toHaveProperty("delivery", expect.anything())

    state.promptValue = [{ type: "text", content: "/review staged changes", start: 0, end: 22 }]
    await submit("steer").handleSubmit(event)
    expect(sentCommands).toHaveLength(1)
    expect(sentCommands[0]).toMatchObject({ command: "review", delivery: "steer" })
  })

  test("a queued prompt sent while the session works gets no optimistic sent turn", async () => {
    state.params = { id: "session-1" }
    const submit = (working: boolean) =>
      createPromptSubmit({
        prompt,
        info: () => ({ id: "session-1" }),
        imageAttachments: () => [],
        commentCount: () => 0,
        autoAccept: () => false,
        mode: () => "normal",
        working: () => working,
        editor: () => undefined,
        queueScroll: () => undefined,
        promptLength: (value) => value.reduce((sum, part) => sum + ("content" in part ? part.content.length : 0), 0),
        addToHistory: () => undefined,
        resetHistoryNavigation: () => undefined,
        setMode: () => undefined,
        setPopover: () => undefined,
        delivery: () => "queue",
      })
    const event = { preventDefault: () => undefined } as unknown as Event

    await submit(true).handleSubmit(event)
    await Bun.sleep(0)
    expect(promptInputs).toHaveLength(1)
    expect(promptInputs[0]).toMatchObject({ delivery: "queue" })
    expect(optimistic).toHaveLength(0)

    // Idle, the queued prompt promotes at once, so it shows as sent like any prompt.
    state.promptValue = [{ type: "text", content: "ls", start: 0, end: 2 }]
    await submit(false).handleSubmit(event)
    await Bun.sleep(0)
    expect(promptInputs).toHaveLength(2)
    expect(optimistic).toHaveLength(1)
  })

  test("submits slash commands through the current session API", async () => {
    state.params = { id: "session-1" }
    state.variant = "high"
    commands.push({ name: "review" })
    state.promptValue = [{ type: "text", content: "/review staged changes", start: 0, end: 22 }]

    const submit = createPromptSubmit({
      prompt,
      info: () => ({ id: "session-1" }),
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
    })

    await submit.handleSubmit({ preventDefault: () => undefined } as unknown as Event)

    expect(sentCommands).toEqual([
      {
        sessionID: "session-1",
        id: expect.stringMatching(/^msg_/),
        command: "review",
        arguments: "staged changes",
        agent: "backend",
        model: { id: "model", providerID: "provider", variant: "high" },
        files: [],
      },
    ])
    expect(state.serverSessionSyncs).toBe(0)
  })

  test("uses an injected model selection", async () => {
    state.params = { id: "session-1" }
    const model = {
      current: () => ({ id: "draft-model", provider: { id: "draft-provider" } }),
      variant: { current: () => "draft-variant" },
    } as unknown as ModelSelection
    const submit = createPromptSubmit({
      prompt,
      info: () => ({ id: "session-1" }),
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
      model,
    })

    await submit.handleSubmit({ preventDefault: () => undefined } as unknown as Event)

    expect(optimistic[0]).toMatchObject({
      message: {
        model: { providerID: "draft-provider", modelID: "draft-model", variant: "draft-variant" },
      },
    })
  })
})
