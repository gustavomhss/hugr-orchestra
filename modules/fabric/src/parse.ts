import type { Admission, Limits } from "./contracts"

// Dependency scaffold only; never an implementation or delivery claim.
export function admit(value: unknown, limits?: Partial<Limits>): Admission {
  return { ok: false, diagnostics: [{ path: "", code: "invalid-input", messageKey: "fabric.declaration.scaffold" }] }
}

export function parse(text: string, format: "json" | "yaml", limits?: Partial<Limits>): Admission {
  return admit(text, limits)
}
