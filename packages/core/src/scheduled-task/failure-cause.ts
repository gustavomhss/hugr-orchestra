import type { Cause } from "effect"

// Operational provenance only: never serialize it or infer it from a historical receipt's text.
const causes = new WeakMap<object, Cause.Cause<unknown>>()

export function rememberFailureCause<T extends object>(value: T, cause: Cause.Cause<unknown>): T {
  causes.set(value, cause)
  return value
}

export function failureCause(value: object): Cause.Cause<unknown> | undefined {
  return causes.get(value)
}
