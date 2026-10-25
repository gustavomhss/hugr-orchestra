import { describe, expect, test } from "bun:test"
import { createPromptState } from "@/context/prompt-state"
import { Worktree } from "@/utils/worktree"
import { ServerScope } from "@/utils/server-scope"
import { createCompatibleApi } from "@/utils/server-compat"
import { clearPending, togglePending } from "../draft-subagent-models"
import type { FollowupDraft } from "./submit"
import {
  clientFor,
  commands,
  createPromptSubmit,
  interrupts,
  optimistic,
  optimisticRemovals,
  policyFixture,
  promoted,
  preparations,
  promptInputs,
  sendFollowupDraft,
  sdkReads,
  state,
  statusWrites,
  storedSessions,
  submitInput,
  sentCommands, sentShell, toasts,
} from "./submit-harness"

const deferred = () => Promise.withResolvers<void>()

test("non-string nested policy errors use the localized fallback and retain input", async () => {
  state.params.id = "session-1"
  state.policyWait = async () => { throw { data: { message: 42 } } }
  const real = createPromptState({ prompt: "keep draft" })
  expect(await createPromptSubmit({ ...submitInput(), prompt: real }).handleSubmit(new Event("submit"))).toBe(false)
  expect(real.current()[0]).toMatchObject({ content: "keep draft" })
  expect(toasts.at(-1)?.description).toBe("common.requestFailed")
  expect(promptInputs).toEqual([])
})

// Complete frozen e6c39ff72d cases, bound to the shared submission harness.
test("distinct existing Session steer and queue submissions both reach pending policy barrier", async () => {
  state.params.id = "session-1"
  const entered = deferred()
  const gate = deferred()
  const waits: string[] = []
  state.policyWait = async () => { waits.push("policy"); entered.resolve(); await gate.promise }
  const real = createPromptState({ prompt: "first steer" })
  let delivery: "steer" | "queue" = "steer"
  const submit = createPromptSubmit({ ...submitInput(), prompt: real, delivery: () => delivery, working: () => true })
  const first = submit.handleSubmit(new Event("submit"))
  await entered.promise
  real.set([{ type: "text", content: "second queue", start: 0, end: 12 }])
  delivery = "queue"
  const second = submit.handleSubmit(new Event("submit"))
  await Bun.sleep(0)
  expect(waits).toHaveLength(2)
  expect(promptInputs).toEqual([])
  gate.resolve()
  await Promise.all([first, second])
  expect(promptInputs).toHaveLength(2)
  expect(promptInputs).toEqual(expect.arrayContaining([
    expect.objectContaining({ text: "first steer", delivery: "steer" }),
    expect.objectContaining({ text: "second queue", delivery: "queue" }),
  ]))
})

test("empty existing Session submit interrupts while another submission awaits policy", async () => {
  state.params.id = "session-1"
  const entered = deferred()
  const gate = deferred()
  state.policyWait = async () => { entered.resolve(); await gate.promise }
  const real = createPromptState({ prompt: "pending send" })
  const submit = createPromptSubmit({ ...submitInput(), prompt: real, working: () => true })
  const sending = submit.handleSubmit(new Event("submit"))
  await entered.promise
  real.reset()
  await submit.handleSubmit(new Event("submit"))
  expect(interrupts).toEqual(["session-1"])
  expect(promptInputs).toEqual([])
  gate.resolve()
  await sending
  expect(promptInputs).toEqual([])
})

test("failed Stop toasts and reads the Session status back instead of keeping the optimistic idle", async () => {
  state.params.id = "session-1"
  const fixture = policyFixture.sdk
  policyFixture.sdk = {
    ...fixture,
    api: {
      ...fixture.api,
      session: {
        ...fixture.api.session,
        interrupt: async () => { throw new Error("interrupt failed") },
        active: async () => ({ "session-1": { type: "running" as const } }),
      },
    },
  }
  const entered = deferred()
  const gate = deferred()
  state.policyWait = async () => { entered.resolve(); await gate.promise }
  const submit = createPromptSubmit({ ...submitInput(), prompt: createPromptState({ prompt: "pending send" }), working: () => true })
  const sending = submit.handleSubmit(new Event("submit"))
  await entered.promise
  await submit.abort()
  expect(toasts.at(-1)).toMatchObject({ title: "orchestra.chat.stop.failed", description: "interrupt failed" })
  expect(statusWrites).toEqual([{ sessionID: "session-1", type: "idle" }, { sessionID: "session-1", type: "busy" }])
  gate.resolve()
  await sending
  expect(promptInputs).toEqual([])
})

test("a prompt a hook refused returns to the composer with the hook named, and the Session is not left busy", async () => {
  state.params.id = "session-1"
  const refusal = {
    name: "PromptBlockedError",
    data: {
      message: "Blocked by hook 'No prompts': Not now.",
      reason: "relay-hook-block",
      hook: { name: "No prompts", message: "Not now." },
    },
  }
  state.sendHook = async () => { throw new Error(refusal.data.message, { cause: { body: refusal, status: 409 } }) }
  const real = createPromptState({ prompt: "ship it" })
  expect(await createPromptSubmit({ ...submitInput(), prompt: real }).handleSubmit(new Event("submit"))).toBe(false)
  expect(promptInputs).toHaveLength(1)
  expect(real.current()[0]).toMatchObject({ content: "ship it" })
  expect(toasts.at(-1)).toMatchObject({
    title: "prompt.toast.promptSendFailed.title",
    description: "orchestra.chat.send.blockedByHook",
  })
  expect(optimisticRemovals.length).toBeGreaterThan(0)
  expect(statusWrites.at(-1)).toEqual({ sessionID: "session-1", type: "idle" })
})

test("leaving the Session while a send waits returns the cleared prompt to the composer it came from", async () => {
  state.params.id = "session-1"
  // Hold the send in its request preparation. A worktree barrier would leave /repo/main ready for the rest of the
  // suite, since a ready worktree cannot become pending again.
  const waiting = deferred()
  const delayed = deferred()
  state.behaviorHook = async () => waiting.resolve()
  preparations.push(delayed)
  const real = createPromptState({ prompt: "keep this" })
  const sending = createPromptSubmit({ ...submitInput(), prompt: real }).handleSubmit(new Event("submit"))
  await waiting.promise
  expect(real.current()[0]).toMatchObject({ content: "" })
  state.params.id = "session-2"
  delayed.resolve()
  expect(await sending).toBe(false)
  expect(promptInputs).toEqual([])
  expect(real.current()[0]).toMatchObject({ content: "keep this" })
})

test.each(["prompt", "command", "shell", "handoff"])("existing Session %s fences failed writes without clearing", async (pathway) => {
  state.params.id = "session-1"
  commands.push({ name: "review" })
  const real = createPromptState({ prompt: pathway === "command" ? "/review changes" : "keep input" })
  real.context.add({ type: "file", path: "/repo/main/file", comment: "keep comment" })
  const contents = real.current()
  const context = real.context.items()
  const failure = new Error("latest write failed")
  state.policyWait = async () => { throw failure }
  const queued: FollowupDraft[] = []
  const submit = createPromptSubmit({
    ...submitInput(), prompt: real, mode: () => pathway === "shell" ? "shell" : "normal",
    shouldQueue: () => pathway === "handoff", onQueue: (draft) => { queued.push(draft) },
  })
  expect(await submit.handleSubmit(new Event("submit"))).toBe(false)
  expect(real.current()).toBe(contents)
  expect(real.context.items()).toBe(context)
  expect(promptInputs).toEqual([])
  expect(sentCommands).toEqual([])
  expect(sentShell).toEqual([])
  expect(queued).toEqual([])
})

describe("prompt dispatch and cancellation", () => {

  test("Stop cancels every preflight, including delayed preparation, without deleting later jobs", async () => {
    state.params = { id: "session-1" }
    const delayed = Promise.withResolvers<void>()
    preparations.push(delayed)
    const submit = createPromptSubmit(submitInput())
    const event = { preventDefault: () => undefined } as Event
    const first = submit.handleSubmit(event)
    const second = submit.handleSubmit(event)
    await submit.abort()
    const third = submit.handleSubmit(event)
    delayed.resolve()
    await Promise.all([first, second, third])
    expect(interrupts).toEqual(["session-1"])
    expect(promptInputs).toHaveLength(1)
  })

  test("canceled preparation cannot resurrect busy or optimistic content after it resolves", async () => {
    state.params = { id: "session-1" }
    const delayed = Promise.withResolvers<void>()
    preparations.push(delayed)
    const submit = createPromptSubmit(submitInput())
    const submitted = submit.handleSubmit({ preventDefault: () => undefined } as Event)
    await submit.abort()
    expect(statusWrites).toEqual([{ sessionID: "session-1", type: "idle" }])
    delayed.resolve()
    await submitted
    expect(statusWrites).toEqual([{ sessionID: "session-1", type: "idle" }])
    expect(optimistic).toEqual([])
    expect(promptInputs).toEqual([])
  })

  test("cancellation during attachment preparation cannot mark busy or add an optimistic turn", async () => {
    const { useSync } = await import("@/context/sync")
    const { useServerSync } = await import("@/context/server-sync")
    const controller = new AbortController()
    const submitted = sendFollowupDraft({
      api: clientFor("/repo/main").api.session as unknown as Parameters<typeof sendFollowupDraft>[0]["api"],
      sync: useSync()(),
      serverSync: useServerSync()(),
      draft: {
        sessionID: "session-1",
        sessionDirectory: "/repo/main",
        prompt: state.promptValue,
        context: [],
        agent: "maestro",
        model: { providerID: "provider", modelID: "model" },
      },
      optimisticBusy: true,
      signal: controller.signal,
    })
    controller.abort()
    expect(await submitted).toBe(false)
    expect(statusWrites).toEqual([])
    expect(optimistic).toEqual([])
    expect(promptInputs).toEqual([])
  })

  test("Stop cancels both actual worktree waiters before readiness can send either prompt", async () => {
    state.params = { id: "session-1" }
    Worktree.pending(ServerScope.local, "/repo/main")
    const submit = createPromptSubmit(submitInput())
    const first = submit.handleSubmit({ preventDefault: () => undefined } as Event)
    const second = submit.handleSubmit({ preventDefault: () => undefined } as Event)
    await state.waitersReady.promise
    await submit.abort()
    Worktree.ready(ServerScope.local, "/repo/main")
    await Promise.all([first, second])
    expect(promptInputs).toEqual([])
    expect(interrupts).toEqual(["session-1"])
    await submit.handleSubmit({ preventDefault: () => undefined } as Event)
    expect(promptInputs).toHaveLength(1)
  })
})
