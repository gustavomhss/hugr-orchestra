import type { Schema } from "effect"
import { FabricWorkspace } from "@orchestra/schema/fabric-workspace"
import type { Diagnostic, Normalization } from "./contracts"

export function layout(document: FabricWorkspace.Document) {
  const overrides = document.layout.overrides
  const diagnostics = validate(document)
  const order = Object.fromEntries(FabricWorkspace.Slot.literals.map((slot) => [slot, [
    ...overrides.order?.[slot] ?? [],
    ...document.tools.filter((tool) => tool.slot === slot && !overrides.order?.[slot]?.includes(tool.id)).map((tool) => tool.id),
  ]]))
  const effective = {
    ...overrides,
    order,
    activeTab: Object.fromEntries(FabricWorkspace.Slot.literals.filter((slot) => order[slot].length)
      .map((slot) => [slot, overrides.activeTab?.[slot] ?? order[slot][0]])),
    sizes: { main: overrides.sizes?.main ?? 3, support: overrides.sizes?.support ?? 2, inspect: overrides.sizes?.inspect ?? 1 },
  }
  const normalizations: Normalization[] = (["order", "activeTab", "sizes"] as const).flatMap((field) => {
    if (equal(overrides[field], effective[field])) return []
    return [{
      path: `/layout/overrides/${field}`,
      ...(Object.hasOwn(overrides, field) ? { before: overrides[field] as Schema.Json } : {}),
      after: effective[field],
      messageKey: "fabric.declaration.default",
    }]
  })
  return { diagnostics, overrides: effective, normalizations }
}

function validate(document: FabricWorkspace.Document) {
  const diagnostics: Diagnostic[] = []
  const overrides = document.layout.overrides
  const tools = new Map(document.tools.map((tool) => [tool.id, tool]))
  FabricWorkspace.Slot.literals.forEach((slot) => {
    const seen = new Set<string>()
    overrides.order?.[slot]?.forEach((id, index) => {
      if (seen.has(id) || tools.get(id)?.slot !== slot) diagnostics.push(invalid(`/order/${slot}/${index}`))
      seen.add(id)
    })
    const active = overrides.activeTab?.[slot]
    if (active !== undefined && tools.get(active)?.slot !== slot) diagnostics.push(invalid(`/activeTab/${slot}`))
    const size = overrides.sizes?.[slot]
    if (size !== undefined && (!Number.isSafeInteger(size) || size <= 0)) diagnostics.push(invalid(`/sizes/${slot}`))
  })
  const pinned = new Set<string>()
  overrides.toolPins?.forEach((id, index) => {
    if (!tools.has(id) || pinned.has(id)) diagnostics.push(invalid(`/toolPins/${index}`))
    pinned.add(id)
  })
  Object.entries(overrides.resourcePins ?? {}).forEach(([id, alias]) => {
    if (!tools.has(id) || !document.context.resourceAliases.includes(alias)) {
      diagnostics.push(invalid(`/resourcePins/${id.replaceAll("~", "~0").replaceAll("/", "~1")}`))
    }
  })
  return diagnostics
}

function equal(before: unknown, after: unknown): boolean {
  if (before === after) return true
  if (Array.isArray(before) && Array.isArray(after)) {
    return before.length === after.length && before.every((value, index) => equal(value, after[index]))
  }
  if (!before || !after || typeof before !== "object" || typeof after !== "object") return false
  const entries = Object.entries(after)
  const original = new Map(Object.entries(before))
  return original.size === entries.length && entries.every(([key, value]) => original.has(key) && equal(original.get(key), value))
}

function invalid(path: string): Diagnostic {
  return { path: `/layout/overrides${path}`, code: "invalid-input", messageKey: "fabric.declaration.layout" }
}
