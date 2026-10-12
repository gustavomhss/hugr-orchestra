import { expect, test } from "bun:test"
import { createPromptState } from "@/context/prompt-state"
import { clearPending, pendingPolicy, togglePending } from "../draft-subagent-models"
import { createPromptSubmit, createdSessions, promptInputs, savedPolicies, state, submitInput } from "./submit-harness"

test("V2 first prompt persists the latest explicit deny-all before sending, then retries the same admitted session", async () => {
  const key = "policy-retry/full/slash/draft"
  const draft = createPromptState({ prompt: "retain this input" })
  togglePending(key, "router", "team/model/v1", true)
  state.rulesFailure = true
  const action = createPromptSubmit({ ...submitInput(), prompt: draft, info: () => undefined, pendingKey: () => key })
  const form = document.createElement("form")
  const submitted: Promise<unknown>[] = []
  form.addEventListener("submit", (event) => { submitted.push(Promise.resolve(action.handleSubmit(event))) })
  form.dispatchEvent(new Event("submit", { cancelable: true }))
  await submitted[0]
  expect(createdSessions).toEqual(["/repo/main"])
  expect(promptInputs).toEqual([])
  expect(draft.current()[0]).toMatchObject({ content: "retain this input" })
  expect(pendingPolicy(key)).toMatchObject({ mode: "allowlist" })
  state.rulesFailure = false
  const gate = Promise.withResolvers<void>()
  state.rulesGate = gate.promise
  state.rulesStarted = Promise.withResolvers<void>()
  form.dispatchEvent(new Event("submit", { cancelable: true }))
  form.dispatchEvent(new Event("submit", { cancelable: true }))
  await state.rulesStarted.promise
  togglePending(key, "router", "team/model/v1", false)
  expect(promptInputs).toEqual([])
  gate.resolve()
  await Promise.all(submitted)
  expect(createdSessions).toEqual(["/repo/main"])
  expect(savedPolicies).toEqual([
    { sessionID: "session-1", policy: { mode: "allowlist", models: [{ providerID: "router", id: "team/model/v1" }] } },
    { sessionID: "session-1", policy: { mode: "allowlist", models: [{ providerID: "router", id: "team/model/v1" }] } },
    { sessionID: "session-1", policy: { mode: "allowlist", models: [] } },
  ])
  expect(promptInputs).toHaveLength(1)
  expect(promptInputs[0]).toMatchObject({ sessionID: "session-1", text: "retain this input" })
  expect(pendingPolicy(key)).toEqual({ mode: "inherit" })
  clearPending(key)
})

test("explicit Inherit during V2 persistence gets its own acknowledgement before the first prompt", async () => {
  const key = "policy-inherit"
  togglePending(key, "router", "first", true)
  const gate = Promise.withResolvers<void>()
  state.rulesGate = gate.promise
  const action = createPromptSubmit({ ...submitInput(), prompt: createPromptState({ prompt: "inherit now" }), info: () => undefined, pendingKey: () => key })
  const pending = action.handleSubmit(new Event("submit", { cancelable: true }))
  await state.rulesStarted.promise
  clearPending(key)
  gate.resolve()
  await pending
  expect(savedPolicies.at(-1)).toEqual({ sessionID: "session-1", policy: { mode: "inherit" } })
  expect(promptInputs).toHaveLength(1)
})
