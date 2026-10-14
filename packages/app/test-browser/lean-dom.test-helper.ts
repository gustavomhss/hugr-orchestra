import type { LeanMetrics } from "@orchestra/schema/lean-metrics"

// Browser-lane only. Tests load the app and ui modules they render through solidDom() (./solid-dom), which compiles
// them with the app's Solid preset whichever test file loaded the plain modules first. solid-js stays the single shared
// copy those compiled modules import, so the primitives below drive the same reactive runtime.
export const { createRoot, createComponent }: typeof import("solid-js") = await import("solid-js")
export const { createStore }: typeof import("solid-js/store") = await import("solid-js/store")
export const { render }: typeof import("solid-js/web") = await import("solid-js/web")
// Saved wire objects are mutable Solid state even though decoded Decisions are readonly.
type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> }
export function decision(callID: string, patch: Partial<LeanMetrics.Decision> = {}): Mutable<LeanMetrics.Decision> {
  return {
    version: 1, scope: "standard-registry", engine: "hugr-lean@0.2.0:4e46ae0534937bdf",
    owner: { projectID: "native-repo", location: "/repo", sessionID: "one", callID },
    model: { provider: "provider", id: "model" }, producer: "native-shell",
    eligible: true, status: "applied", reason: "reduced", filterProfile: "cargo", orchestraProfile: "native",
    bytes: { before: 12, after: 4, saved: 8 },
    tokens: { kind: "estimated", counter: "chars-per-token-4", before: 3, after: 1, saved: 2 },
    durationMs: 1, ...patch,
  }
}
