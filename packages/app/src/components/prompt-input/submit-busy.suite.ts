import { expect, test } from "bun:test"
import { createComputed, createRoot } from "solid-js"
import { isServer } from "solid-js/web"
import { createPromptState } from "@/context/prompt-state"
import { ServerScope } from "@/utils/server-scope"
import { togglePending } from "../draft-subagent-models"
import { draftSessionKey } from "./draft-session"
import { createPromptSubmit, createdSessions, promptInputs, state, submitInput } from "./submit-harness"

test("qualified promotion exposes original source activity on the Session target until finally", async () => {
  state.search.draftId = "draft-1"
  const real = createPromptState({ prompt: "handoff activity" })
  const submit = createPromptSubmit({ ...submitInput(), prompt: real, info: () => undefined })
  const observed: boolean[] = []
  state.promoteDraftHook = () => { observed.push(submit.submitting()) }
  await submit.handleSubmit(new Event("submit"))
  expect(state.params.id).toBe("session-1")
  expect(observed).toEqual([true])
  expect(submit.submitting()).toBe(false)
  expect(promptInputs).toHaveLength(1)
})

// These assertions need real reactive reads; the isolated browser child must execute them.
test.skipIf(isServer).each(["create", "ACK", "POST"])("submitting stays tracked through delayed %s and same-target remount until finally", async (phase) => {
  expect(isServer).toBe(false)
  const entered = Promise.withResolvers<void>()
  const gate = Promise.withResolvers<void>()
  const key = draftSessionKey(ServerScope.local, "/repo/main")
  if (phase === "create") state.createSessionGate = gate.promise
  if (phase === "ACK") {
    togglePending(key, "provider", "model", true)
    state.policyWrite = async () => { entered.resolve(); await gate.promise }
  }
  if (phase === "POST") state.sendHook = async () => { entered.resolve(); await gate.promise }
  const observed: boolean[] = []
  const real = createPromptState({ prompt: "tracked source activity" })
  const input = { ...submitInput(), prompt: real, info: () => undefined, pendingKey: () => key }
  const root = createRoot((dispose) => {
    const submit = createPromptSubmit(input)
    createComputed(() => { observed.push(submit.submitting()) })
    return { dispose, submit }
  })
  const initial = observed.slice()
  const sending = root.submit.handleSubmit(new Event("submit"))
  await (phase === "create" ? state.createStarted.promise : entered.promise)
  const waiting = { busy: root.submit.submitting(), observed: observed.slice() }
  const remountObserved: boolean[] = []
  const remount = createRoot((dispose) => {
    const submit = createPromptSubmit(input)
    createComputed(() => { remountObserved.push(submit.submitting()) })
    return { dispose, submit }
  })
  const mounted = { busy: remount.submit.submitting(), observed: remountObserved.slice() }
  gate.resolve()
  await sending
  expect(initial).toEqual([false])
  expect(waiting).toEqual({ busy: true, observed: [false, true] })
  expect(mounted).toEqual({ busy: true, observed: [true] })
  expect(root.submit.submitting()).toBe(false)
  expect(remount.submit.submitting()).toBe(false)
  expect(observed.at(-1)).toBe(false)
  expect(remountObserved.at(-1)).toBe(false)
  expect(promptInputs).toHaveLength(1)
  root.dispose()
  remount.dispose()
})

test.skipIf(isServer)("submitting observes retained source finally after composer disposal/remount", async () => {
  expect(isServer).toBe(false)
  const gate = Promise.withResolvers<void>()
  state.createSessionGate = gate.promise
  const real = createPromptState({ prompt: "retained source counter" })
  const input = { ...submitInput(), prompt: real, info: () => undefined }
  const root = createRoot((dispose) => ({ dispose, submit: createPromptSubmit(input) }))
  expect(root.submit.submitting()).toBe(false)
  const sending = root.submit.handleSubmit(new Event("submit"))
  await state.createStarted.promise
  expect(root.submit.submitting()).toBe(true)
  root.dispose()
  const observed: boolean[] = []
  const remount = createRoot((dispose) => {
    const submit = createPromptSubmit(input)
    createComputed(() => { observed.push(submit.submitting()) })
    return { dispose, submit }
  })
  const mounted = observed.slice()
  gate.resolve()
  await sending
  expect(mounted).toEqual([true])
  expect(remount.submit.submitting()).toBe(false)
  expect(observed).toEqual([true, false])
  expect(createdSessions).toHaveLength(1)
  expect(promptInputs).toEqual([])
  await remount.submit.handleSubmit(new Event("submit"))
  expect(createdSessions).toHaveLength(1)
  expect(promptInputs).toHaveLength(1)
  remount.dispose()
})

test.skipIf(isServer).each(["steer", "queue"] as const)("existing submitting stays reactive while %s fails and other admission stays pending", async (failed) => {
  state.params.id = "session-1"
  const entered = { steer: Promise.withResolvers<void>(), queue: Promise.withResolvers<void>() }
  const gates = { steer: Promise.withResolvers<void>(), queue: Promise.withResolvers<void>() }
  state.sendHook = async (input) => {
    const request = input as { delivery: "steer" | "queue" }
    entered[request.delivery].resolve()
    await gates[request.delivery].promise
    if (request.delivery === failed) throw new Error(`${failed} admission failed`)
  }
  const selection = { delivery: "steer" as "steer" | "queue" }
  const observed: boolean[] = []
  const root = createRoot((dispose) => {
    const real = createPromptState({ prompt: "concurrent steer" })
    const submit = createPromptSubmit({ ...submitInput(), prompt: real, delivery: () => selection.delivery, working: () => true })
    createComputed(() => { observed.push(submit.submitting()) })
    return { dispose, real, submit }
  })
  expect(observed).toEqual([false])
  const steer = root.submit.handleSubmit(new Event("submit"))
  await entered.steer.promise
  root.real.set([{ type: "text", content: "concurrent queue", start: 0, end: 16 }])
  selection.delivery = "queue"
  const queue = root.submit.handleSubmit(new Event("submit"))
  await entered.queue.promise
  expect(promptInputs).toEqual(expect.arrayContaining([
    expect.objectContaining({ text: "concurrent steer", delivery: "steer" }),
    expect.objectContaining({ text: "concurrent queue", delivery: "queue" }),
  ]))
  const outcomes = { steer, queue }
  gates[failed].resolve()
  expect(await outcomes[failed]).toBe(false)
  const stillWaiting = { busy: root.submit.submitting(), observed: observed.slice() }
  const remaining = failed === "steer" ? "queue" : "steer"
  gates[remaining].resolve()
  await outcomes[remaining]
  expect(stillWaiting.busy).toBe(true)
  expect(stillWaiting.observed.at(-1)).toBe(true)
  expect(root.submit.submitting()).toBe(false)
  expect(observed[1]).toBe(true)
  expect(observed.at(-1)).toBe(false)
  root.dispose()
})
