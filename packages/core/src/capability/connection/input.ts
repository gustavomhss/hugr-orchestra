export * as CapabilityConnectionInput from "./input"

import { types } from "node:util"
import { Schema } from "effect"
import { CapabilityOperatorScope } from "../operator/scope"

/** Call-time DTO snapshot. Reject proxies before reflection; never run accessors/serializers. */
export function capture<A>(input: unknown, parse: (value: unknown) => A) {
  return CapabilityOperatorScope.capture(null, () => {
    requireDataDescriptors(input)
    const captured = CapabilityOperatorScope.capture(input, parse)
    if (!captured.ok) throw new Error("Invalid management data")
    return captured.value
  })
}

function requireDataDescriptors(value: unknown, depth = 0, budget = { nodes: 0 }): void {
  if (++budget.nodes > 2048 || depth > 64) throw new Error("Invalid management data")
  if (value === null || typeof value !== "object") return
  if (types.isProxy(value)) throw new Error("Invalid management data")
  const keys = Reflect.ownKeys(value)
  if (keys.length > 2049) throw new Error("Invalid management data")
  keys.forEach((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor || !("value" in descriptor)) throw new Error("Invalid management data")
    if (Array.isArray(value) && key === "length") return
    requireDataDescriptors(descriptor.value, depth + 1, budget)
  })
}

export function decode<S extends Schema.Top>(schema: S) {
  return Schema.decodeUnknownSync(Schema.toType(schema), { onExcessProperty: "error" })
}
