export * as BoundedJson from "./json"

import type { Admission, Limits } from "./contracts"

// Frozen dependency scaffold, not an implementation. Profiles are selected only by trusted module code.
export function admit(value: unknown, profile: "workspace" | "package", limits?: Partial<Limits>): Admission {
  return { ok: false, diagnostics: [{ path: "", code: "invalid-input", messageKey: "fabric.package.scaffold" }] }
}

export function parse(text: string, format: "json" | "yaml", profile: "workspace" | "package", limits?: Partial<Limits>): Admission {
  return { ok: false, diagnostics: [{ path: "", code: "invalid-input", messageKey: "fabric.package.scaffold" }] }
}
