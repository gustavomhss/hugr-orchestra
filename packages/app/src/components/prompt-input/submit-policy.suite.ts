import { expect, test } from "bun:test"
import { createPromptState } from "@/context/prompt-state"
import { clearPending, pendingPolicy, pendingSelection, pendingSnapshot, togglePending } from "../draft-subagent-models"
import { draftSessionKey } from "./draft-session"
import { ServerScope } from "@/utils/server-scope"
import { createSubmissionPolicy } from "./submission-policy"
import type { SubagentModelPolicy } from "../subagent-model-rules"
import {
  acknowledgeDraftPolicy, createPromptSubmit, createdSessions, promptInputs, savedPolicies, savedRules,
  policyWrites, legacyBaseline, legacySessionPermissions, policyFixture, serverFor, sdkFor, promoted,
  state, submitInput, sentShell, promotedDrafts,
  storedSessions, canonicalPolicies,
} from "./submit-harness"

const deferred = () => Promise.withResolvers<void>()

test("canonical C arriving before a draft write blocks stale intent without consuming input", async () => {
  const key = "canonical-before-write"
  togglePending(key, "provider", "draft", true)
  canonicalPolicies.set("session-1", { mode: "allowlist", models: [{ providerID: "provider", id: "canonical-c" }] })
  const real = createPromptState({ prompt: "retain stale intent" })
  const contents = real.current()
  const submitted = createPromptSubmit({ ...submitInput(), prompt: real, info: () => undefined, pendingKey: () => key })
  expect(await submitted.handleSubmit(new Event("submit"))).toBe(false)
  expect(real.current()).toBe(contents)
  expect(policyWrites).toEqual([])
  expect(promptInputs).toEqual([])
  expect(promoted).toEqual([])
  expect(pendingPolicy(key).mode).toBe("allowlist")
  clearPending(key, pendingSnapshot(key).revision)
})

test("deliberate retry follows its own retained failed barrier and obtains a fresh ACK", async () => {
  const key = "retained-failed-barrier"
  togglePending(key, "provider", "model", true)
  const failure = new Error("owned write failed")
  const barrier = { current: Promise.reject<void>(failure) }
  const clock = { version: 1 }
  void barrier.current.catch(() => {})
  const writes: SubagentModelPolicy[] = []
  const policy = createSubmissionPolicy({
    key, sessionID: "same-session", protocol: Promise.resolve("v2"),
    current: () => true, initialPolicy: { mode: "inherit" }, failedMessage: "bad receipt",
    admission: { policyWritten: true, failedWrite: { cause: failure, version: 1 } },
    legacyWrite: async () => { throw new Error("unexpected V1 write") },
    management: {
      waitSubagentModels: () => barrier.current,
      subagentModelsWriteVersion: () => clock.version,
      readSubagentModels: async () => ({ policy: writes.at(-1) ?? { mode: "inherit" } }),
      setSubagentModels: async (_id, next) => { clock.version++; writes.push(next); barrier.current = Promise.resolve(); return next },
    },
  })
  const receipt = await policy.acknowledge(new AbortController().signal)
  expect(writes).toEqual([{ mode: "allowlist", models: [{ providerID: "provider", id: "model" }] }])
  expect(receipt).toEqual(pendingSnapshot(key))
  clearPending(key, receipt?.revision)
})

// Complete frozen e6c39ff72d cases, bound to the shared submission harness.
test("inherited-policy ABA during ACK wait persists latest inherit tombstone", async () => {
  const key = draftSessionKey(ServerScope.local, "/repo/main")
  const initial = pendingSnapshot(key)
  expect(initial.revision).toBe(0)
  const entered = deferred()
  const gate = deferred()
  const writes: SubagentModelPolicy[] = []
  const saving = acknowledgeDraftPolicy({
    key,
    current: () => true,
    written: () => writes.length > 0,
    markWritten: () => {},
    failedMessage: "bad ACK",
    write: async (policy) => { writes.push(policy); return policy },
    wait: async () => { entered.resolve(); await gate.promise },
  })
  await entered.promise
  clearPending(key)
  togglePending(key, "provider", "model", true)
  clearPending(key)
  const latest = pendingSnapshot(key)
  expect(latest.revision).toBeGreaterThan(initial.revision)
  expect(clearPending(key, initial.revision)).toBe(false)
  gate.resolve()
  const receipt = await saving
  expect(writes).toEqual([{ mode: "inherit" }])
  expect(receipt).toEqual(latest)
  expect(pendingSnapshot(key)).toEqual(latest)
  expect(clearPending(key, latest.revision)).toBe(true)
})

test("untouched draft reads inherit; explicit empty selection writes deny-all", async () => {
  const key = draftSessionKey(ServerScope.local, "/repo/main")
  expect(pendingSelection(key).size).toBe(0)
  expect(pendingPolicy(key)).toEqual({ mode: "inherit" })
  const inherited = createPromptState({ prompt: "first" })
  await createPromptSubmit({ ...submitInput(), prompt: inherited, info: () => undefined, pendingKey: () => key }).handleSubmit(new Event("submit"))
  expect(policyWrites).toEqual([])
  expect(promptInputs).toHaveLength(1)
  state.params.id = undefined
  state.sdkOverride = undefined
  policyFixture.sdk = sdkFor("/repo/main", policyFixture.server)
  const denied = createPromptState({ prompt: "second" })
  togglePending(key, "provider", "model", true)
  togglePending(key, "provider", "model", false)
  expect(pendingPolicy(key)).toEqual({ mode: "allowlist", models: [] })
  await createPromptSubmit({ ...submitInput(), prompt: denied, info: () => undefined, pendingKey: () => key }).handleSubmit(new Event("submit"))
  expect(policyWrites).toEqual([{ id: "session-2", policy: { mode: "allowlist", models: [] } }])
  expect(pendingPolicy(key)).toEqual({ mode: "inherit" })
})

test("draft inheritance edit during write gets another ACK before promotion", async () => {
  const key = draftSessionKey(ServerScope.local, "/repo/main", "draft-1")
  state.search.draftId = "draft-1"
  const entered = deferred()
  const gate = deferred()
  togglePending(key, "provider", "model", true)
  state.policyWrite = async () => { entered.resolve(); await gate.promise }
  const real = createPromptState({ prompt: "keep draft" })
  const submit = createPromptSubmit({ ...submitInput(), prompt: real, info: () => undefined, pendingKey: () => key })
  const sending = submit.handleSubmit(new Event("submit"))
  await entered.promise
  clearPending(key)
  expect(promotedDrafts).toEqual([])
  expect(promptInputs).toEqual([])
  gate.resolve()
  await sending
  expect(policyWrites.map((write) => write.policy)).toEqual([
    { mode: "allowlist", models: [{ providerID: "provider", id: "model" }] }, { mode: "inherit" },
  ])
  expect(promotedDrafts).toHaveLength(1)
  expect(promptInputs).toHaveLength(1)
})

test("draft ACK fence detects same-policy ABA edits and clear only consumes exact revision", async () => {
  const key = draftSessionKey(ServerScope.local, "/repo/main")
  const gate = deferred()
  const entered = deferred()
  togglePending(key, "provider", "model", true)
  const first = pendingSnapshot(key)
  const writes: SubagentModelPolicy[] = []
  const receipt = acknowledgeDraftPolicy({
    key, current: () => true, written: () => writes.length > 0, markWritten: () => {}, failedMessage: "bad ACK",
    wait: async () => {},
    write: async (policy) => { writes.push(policy); entered.resolve(); await gate.promise; return policy },
  })
  await entered.promise
  clearPending(key)
  togglePending(key, "provider", "model", true)
  expect(clearPending(key, first.revision)).toBe(false)
  gate.resolve()
  const acknowledged = await receipt
  expect(writes).toHaveLength(2)
  if (!acknowledged) throw new Error("missing draft ACK")
  expect(clearPending(key, acknowledged.revision)).toBe(true)
})

test("V1 fresh allowlist to inherit preserves restrictive baseline without updating permission", async () => {
  state.protocol = "v1"
  policyFixture.server = serverFor()
  policyFixture.sdk = sdkFor("/repo/main", policyFixture.server)
  legacyBaseline.push(
    { permission: "task", pattern: "*/*", action: "deny" },
    { permission: "task", pattern: "provider/original", action: "allow" },
  )
  const baseline = legacyBaseline.slice()
  const key = draftSessionKey(ServerScope.local, "/repo/main")
  const gate = deferred()
  state.createSessionGate = gate.promise
  togglePending(key, "provider", "draft-model", true)
  const real = createPromptState({ prompt: "normal prompt under original rules" })
  const submit = createPromptSubmit({ ...submitInput(), prompt: real, info: () => undefined, pendingKey: () => key })
  const sending = submit.handleSubmit(new Event("submit"))
  clearPending(key)
  expect(pendingPolicy(key)).toEqual({ mode: "inherit" })
  expect(savedRules).toEqual([])
  expect(promoted).toEqual([])
  gate.resolve()
  await sending
  expect(savedRules).toEqual([])
  expect(legacySessionPermissions.get("session-1")).toEqual(baseline)
  expect(storedSessions["/repo/main"]?.[0]).toMatchObject({ id: "session-1" })
  expect(promoted).toEqual([{ directory: "/repo/main", sessionID: "session-1" }])
  expect(promptInputs).toEqual([expect.objectContaining({ sessionID: "session-1", text: "normal prompt under original rules" })])
  expect(pendingSnapshot(key)).toEqual({ revision: 0, policy: { mode: "inherit" } })
})

test("V1 inherit after acknowledged override blocks promotion/send and retains selection on retry", async () => {
  state.protocol = "v1"
  policyFixture.server = serverFor()
  policyFixture.sdk = sdkFor("/repo/main", policyFixture.server)
  legacyBaseline.push(
    { permission: "task", pattern: "*/*", action: "deny" },
    { permission: "task", pattern: "provider/original", action: "allow" },
  )
  const key = draftSessionKey(ServerScope.local, "/repo/main")
  togglePending(key, "provider", "draft-model", true)
  // The first update succeeds while the draft changes; its ACK must prevent an unsafe inherit retry.
  state.legacyUpdateHook = async () => { clearPending(key) }
  const real = createPromptState({ prompt: "retain after legacy override" })
  real.context.add({ type: "file", path: "/repo/main/file", comment: "retain comment" })
  const contents = real.current()
  const context = real.context.items()
  const submit = createPromptSubmit({ ...submitInput(), prompt: real, info: () => undefined, pendingKey: () => key })
  expect(await submit.handleSubmit(new Event("submit"))).toBe(false)
  const selection = pendingSnapshot(key)
  expect(selection.policy).toEqual({ mode: "inherit" })
  expect(selection.revision).toBeGreaterThan(0)
  expect(real.current()).toBe(contents)
  expect(real.context.items()).toBe(context)
  expect(savedRules).toEqual([{
    sessionID: "session-1", directory: "/repo/main", permission: [
      { permission: "task", pattern: "*/*", action: "deny" },
      { permission: "task", pattern: "provider/draft-model", action: "allow" },
    ],
  }])
  expect(createdSessions).toEqual(["/repo/main"])
  expect(promoted).toEqual([])
  expect(promptInputs).toEqual([])
  state.legacyUpdateHook = async () => {}
  expect(await submit.handleSubmit(new Event("submit"))).toBe(false)
  expect(createdSessions).toEqual(["/repo/main"])
  expect(savedRules).toHaveLength(1)
  expect(pendingSnapshot(key)).toEqual(selection)
  expect(real.current()).toBe(contents)
  expect(real.context.items()).toBe(context)
  expect(promoted).toEqual([])
  expect(promptInputs).toEqual([])
})

test("V1 empty draft appends deny-all permission rules before sending", async () => {
  state.protocol = "v1"
  policyFixture.server = serverFor()
  policyFixture.sdk = sdkFor("/repo/main", policyFixture.server)
  const key = draftSessionKey(ServerScope.local, "/repo/main")
  togglePending(key, "provider", "model", false)
  const real = createPromptState({ prompt: "ls" })
  await createPromptSubmit({ ...submitInput(), prompt: real, info: () => undefined, mode: () => "shell", pendingKey: () => key }).handleSubmit(new Event("submit"))
  expect(savedRules).toEqual([{
    sessionID: "session-1", directory: "/repo/main", permission: [{ permission: "task", pattern: "*/*", action: "deny" }],
  }])
  expect(policyWrites).toEqual([])
  expect(sentShell).toHaveLength(1)
})

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
