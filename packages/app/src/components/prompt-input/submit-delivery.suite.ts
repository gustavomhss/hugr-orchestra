import { describe, expect, spyOn, test } from "bun:test"
import { createRequire } from "node:module"
import type { ModelSelection } from "@/context/local"
import type { FollowupDraft } from "./submit"
import { createPromptState } from "@/context/prompt-state"
import { createRoot } from "solid-js"
import { isServer } from "solid-js/web"
import { ServerScope } from "@/utils/server-scope"
import { ServerConnection } from "@/context/server"
import { queuedPromptSources } from "./queued-prompt"
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
  policyFixture, serverFor, sdkFor, setReactiveOwner, followupInput,
} from "./submit-harness"

test("queued attachment preparation rechecks the shared policy barrier before dispatch", async () => {
  state.params.id = "session-1"
  const queue: FollowupDraft[] = []
  await createPromptSubmit({ ...submitInput(), shouldQueue: () => true, onQueue: (draft) => { queue.push(draft) } }).handleSubmit(new Event("submit"))
  const draft = queue[0]
  if (!draft?.source) throw new Error("missing source")
  const url = "data:text/plain;base64,aGk="
  draft.prompt.push({ type: "image", id: "attachment", filename: "image.png", mime: "image/png", blob: { id: url, url } })
  const failure = new Error("policy changed during attachment preparation")
  const calls = { waits: 0 }
  state.policyWait = async () => { if (++calls.waits === 2) throw failure }
  // Bun's native Blob is not a DOM Blob. Exercise real browser fetch/FileReader in one realm.
  const { Window } = createRequire(Bun.resolveSync("@happy-dom/global-registrator", import.meta.dir))("happy-dom")
  const browser = new Window()
  const transport = spyOn(globalThis, "fetch").mockImplementation(browser.fetch.bind(browser) as unknown as typeof fetch)
  try {
    await expect(sendFollowupDraft(followupInput(draft))).rejects.toBe(failure)
  } finally {
    transport.mockRestore()
    await browser.happyDOM.close()
  }
  expect(calls.waits).toBe(2)
  expect(promptInputs).toEqual([])
  expect(optimistic).toEqual([])
})

test("HTTP prompt success remains admitted after the captured owner departs", async () => {
  state.params.id = "session-1"
  const queue: FollowupDraft[] = []
  await createPromptSubmit({ ...submitInput(), shouldQueue: () => true, onQueue: (draft) => { queue.push(draft) } }).handleSubmit(new Event("submit"))
  const draft = queue[0]
  if (!draft?.source) throw new Error("missing source")
  const entered = Promise.withResolvers<void>()
  const gate = Promise.withResolvers<void>()
  const runtime = queuedPromptSources.resolve(draft.source, draft)
  if (!runtime) throw new Error("missing runtime")
  const api = runtime.api
  runtime.api = { ...api, prompt: async (...args) => {
    const admitted = api.prompt(...args)
    entered.resolve()
    await gate.promise
    return admitted
  } }
  const sent = sendFollowupDraft(followupInput(draft))
  await entered.promise
  policyFixture.server = serverFor(ServerScope.fromServerKey(ServerConnection.Key.make("departed")))
  policyFixture.sdk = sdkFor("/other", policyFixture.server)
  gate.resolve()
  expect(await sent).toBe(true)
  expect(promptInputs).toHaveLength(1)
})

// Complete frozen e6c39ff72d cases, bound to the shared submission harness.
test.skipIf(isServer)("reactive owner ABA after queued clear cannot revive captured queued send", async () => {
  expect(isServer).toBe(false)
  state.params.id = "session-1"
  const source = { server: policyFixture.server, sdk: policyFixture.sdk }
  const otherServer = serverFor(ServerScope.fromServerKey(ServerConnection.Key.make("server-b")))
  const other = { server: otherServer, sdk: sdkFor("/repo/main", otherServer) }
  setReactiveOwner("read", () => () => source)
  const queued: FollowupDraft[] = []
  const root = createRoot((dispose) => {
    const real = createPromptState({ prompt: "queued source" })
    return { dispose, real, submit: createPromptSubmit({
      ...submitInput(), prompt: real, shouldQueue: () => true, onQueue: (draft) => { queued.push(draft) },
    }) }
  })
  await root.submit.handleSubmit(new Event("submit"))
  const draft = queued[0]
  if (!draft?.source) throw new Error("missing queued source")
  expect(root.real.current()).toEqual([{ type: "text", content: "", start: 0, end: 0 }])
  const runtime = queuedPromptSources.resolve(draft.source, draft)
  if (!runtime) throw new Error("missing runtime")
  expect(runtime.current()).toBe(true)
  setReactiveOwner("read", () => () => other)
  await Promise.resolve()
  setReactiveOwner("read", () => () => source)
  expect(runtime.current()).toBe(false)
  expect(await sendFollowupDraft(followupInput(draft))).toBe(false)
  expect(promptInputs).toEqual([])
  root.dispose()
})

test("queued handoff rechecks latest write and uses captured source at actual send", async () => {
  state.params.id = "session-1"
  const queued: FollowupDraft[] = []
  const real = createPromptState({ prompt: "/review changes" })
  commands.push({ name: "review" })
  await createPromptSubmit({ ...submitInput(), prompt: real, shouldQueue: () => true, onQueue: (draft) => { queued.push(draft) } }).handleSubmit(new Event("submit"))
  const draft = queued[0]
  if (!draft?.source) throw new Error("missing captured queued source")
  const failure = new Error("queued policy failed")
  state.policyWait = async () => { throw failure }
  await expect(sendFollowupDraft(followupInput(draft))).rejects.toBe(failure)
  expect(sentCommands).toEqual([])
  expect(optimistic).toEqual([])
  policyFixture.server = serverFor(ServerScope.fromServerKey(ServerConnection.Key.make("server-b")))
  policyFixture.sdk = sdkFor("/repo/main", policyFixture.server)
  state.policyWait = async () => {}
  expect(await sendFollowupDraft(followupInput(draft))).toBe(false)
  expect(sentCommands).toEqual([])
})

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
