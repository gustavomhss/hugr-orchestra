import type { Hooks, PluginInput, ToolContext } from "@orchestra/plugin"
import { createAppDockHooks } from "./app-dock"

export const context = { ask: async () => {}, abort: new AbortController().signal } as unknown as ToolContext
export const input = {} as PluginInput

export type FakePort = {
  postMessage(message: unknown): void
  on(event: string, listener: (event: { data: unknown }) => void): void
}

export function fakePort(): { port: FakePort; sent: unknown[]; deliver: (payload: unknown) => void } {
  const sent: unknown[] = []
  const listeners: Array<(event: { data: unknown }) => void> = []
  return {
    sent,
    port: {
      postMessage(message: unknown) {
        sent.push(message)
      },
      on(_event: string, listener: (event: { data: unknown }) => void) {
        listeners.push(listener)
      },
    },
    deliver(payload: unknown) {
      for (const listener of listeners) listener({ data: payload })
    },
  }
}

export const turn = () => new Promise((resolve) => setTimeout(resolve, 0))
export type Envelope = { type: string; id: string; op: string; args: Record<string, unknown> }
export const admission = (id: string) => ({ type: "dock.rpc.native-admitted", id, backend: "linux-atspi",
  target: { senderID: 1, tabID: "native", generation: 1, profileID: "profile", runtimeID: "runtime",
    runtimeEpoch: "epoch", appID: "app", launchEpoch: "launch", ownershipRevision: 1, accessibilitySessionID: "session" } })

export type Reply = { ok: true; value: unknown } | { ok: false; error: Record<string, unknown> }

export function host(respond: (op: string, args: Record<string, unknown>, index: number) => Reply, config: { findDeadlineMs?: number } = {}) {
  const f = fakePort()
  const calls: { op: string; args: Record<string, unknown> }[] = []
  f.port.postMessage = (message: unknown) => {
    const envelope = message as Envelope
    if (envelope.type !== "dock.rpc") return
    calls.push({ op: envelope.op, args: envelope.args })
    const reply = respond(envelope.op, envelope.args, calls.length - 1)
    queueMicrotask(() => f.deliver({ type: "dock.rpc.result", id: envelope.id, ...reply }))
  }
  return { hooks: createAppDockHooks(f.port, config) as Required<Hooks>, calls }
}

// coverage defaults to what the cursor implies; a final page may still report a partial traversal.
export const page = (items: unknown[], cursor?: string, coverage?: { complete: boolean; reasons: string[] }): Reply => ({ ok: true, value: {
  backend: "linux-atspi", scopeKind: "workspace", observation: "obs", items, hasMore: cursor !== undefined,
  ...(cursor === undefined ? {} : { cursor }),
  coverage: coverage ?? { complete: cursor === undefined, reasons: cursor === undefined ? [] : ["page-limit"] } } })
export const control = (ref: string, name: string, extra: Record<string, unknown> = {}) => ({
  ref, name, role: 43, roleName: "push-button", states: [8, 11, 24], interfaces: [], actions: [{ id: `a:${ref}`, name: "press" }],
  capabilities: { action: { supported: true, reason: "advertised-native-action" }, observedAction: { supported: true, reason: "x" },
    type: { supported: false, reason: "x" }, keyboardType: { supported: false, reason: "x" } }, ...extra })
export const field = (ref: string, name: string) => control(ref, name, { role: 79, roleName: "entry", states: [7, 8, 12, 24], actions: [],
  capabilities: { action: { supported: false, reason: "x" }, observedAction: { supported: false, reason: "x" },
    type: { supported: true, reason: "x" }, keyboardType: { supported: true, reason: "x" } } })
export const nativeError = (code: string, outcome = "not-dispatched"): Reply =>
  ({ ok: false, error: { backend: "linux-atspi", code, message: code, outcome } })
