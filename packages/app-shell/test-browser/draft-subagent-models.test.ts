import { expect, test } from "bun:test"
import { createComputed, createRoot } from "solid-js"
import { ServerConnection } from "@/context/server"
import { ServerScope } from "@/utils/server-scope"
import { clearPending, pendingPolicy, pendingSelection, pendingSnapshot, togglePending } from "@/components/draft-subagent-models"
import { draftSessionKey } from "@/components/prompt-input/draft-session"
import type { SubagentModelPolicy } from "@/components/subagent-model-rules"

test("draft key isolates opaque server scope, source directory and draft identity", () => {
  const remote = ServerScope.fromServerKey(ServerConnection.Key.make("opaque-server-b"))
  const keys = [
    draftSessionKey(ServerScope.local, "/source", "draft-1"),
    draftSessionKey(remote, "/source", "draft-1"),
    draftSessionKey(ServerScope.local, "/other-source", "draft-1"),
    draftSessionKey(ServerScope.local, "/source", "draft-2"),
    draftSessionKey(ServerScope.local, "/source"),
  ]
  expect(new Set(keys).size).toBe(keys.length)
  togglePending(keys[0], "provider", "model/with/slashes", true)
  expect(pendingPolicy(keys[0])).toEqual({ mode: "allowlist", models: [{ providerID: "provider", id: "model/with/slashes" }] })
  keys.slice(1).forEach((key) => expect(pendingPolicy(key)).toEqual({ mode: "inherit" }))
  keys.forEach((key) => clearPending(key, pendingSnapshot(key).revision))
})

test("real reactive pending store distinguishes untouched/inherit from explicit empty and fences ACK clear", () => {
  const key = draftSessionKey(ServerScope.local, "/reactive-source", "draft-1")
  clearPending(key, pendingSnapshot(key).revision)
  const seen: SubagentModelPolicy[] = []
  createRoot((dispose) => {
    createComputed(() => { seen.push(pendingPolicy(key)) })
    pendingSelection(key)
    expect(seen).toEqual([{ mode: "inherit" }])
    togglePending(key, "provider", "model", false)
    expect(seen.at(-1)).toEqual({ mode: "allowlist", models: [] })
    const receipt = pendingSnapshot(key)
    togglePending(key, "provider", "model", true)
    expect(clearPending(key, receipt.revision)).toBe(false)
    expect(seen.at(-1)).toEqual({ mode: "allowlist", models: [{ providerID: "provider", id: "model" }] })
    pendingSelection(key).clear()
    expect(pendingSelection(key).size).toBe(1)
    clearPending(key)
    expect(seen.at(-1)).toEqual({ mode: "inherit" })
    expect(seen).toHaveLength(4)
    dispose()
  })
  clearPending(key, pendingSnapshot(key).revision)
})

test("inherit tombstones keep monotonic revisions across inherited-policy ABA until exact ACK consumes them", () => {
  const key = draftSessionKey(ServerScope.local, "/inherit-aba", "draft-1")
  clearPending(key, pendingSnapshot(key).revision)
  const untouched = pendingSnapshot(key)
  expect(untouched).toEqual({ revision: 0, policy: { mode: "inherit" } })
  clearPending(key)
  const inherited = pendingSnapshot(key)
  togglePending(key, "provider", "model", true)
  const allowed = pendingSnapshot(key)
  clearPending(key)
  const latest = pendingSnapshot(key)
  expect(inherited.revision).toBeGreaterThan(untouched.revision)
  expect(allowed.revision).toBeGreaterThan(inherited.revision)
  expect(latest.revision).toBeGreaterThan(allowed.revision)
  expect(latest.policy).toEqual({ mode: "inherit" })
  expect(clearPending(key, untouched.revision)).toBe(false)
  expect(clearPending(key, inherited.revision)).toBe(false)
  expect(pendingSnapshot(key)).toEqual(latest)
  expect(clearPending(key, latest.revision)).toBe(true)
  expect(pendingSnapshot(key)).toEqual({ revision: 0, policy: { mode: "inherit" } })
})
