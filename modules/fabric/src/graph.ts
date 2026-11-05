import type { FabricWorkspace } from "@orchestra/schema/fabric-workspace"
import type { Component, Diagnostic, Port } from "./contracts"

export function graph(document: FabricWorkspace.Document, components: ReadonlyMap<string, Component>) {
  const diagnostics: Diagnostic[] = []
  const writers = new Map<string, Set<string>>()
  const incoming = new Map(document.tools.map((tool) => [tool.id, 0]))
  const outgoing = new Map(document.tools.map((tool) => [tool.id, [] as string[]]))
  document.bindings.forEach((binding, index) => {
    const path = `/bindings/${index}`
    const from = components.get(binding.from.tool)?.outputs
    const to = components.get(binding.to.tool)?.inputs
    const output = from && Object.hasOwn(from, binding.from.port) ? from[binding.from.port] : undefined
    const input = to && Object.hasOwn(to, binding.to.port) ? to[binding.to.port] : undefined
    if (!output) diagnostics.push(invalid(`${path}/from`))
    if (!input) diagnostics.push(invalid(`${path}/to`))
    const ports = writers.get(binding.to.tool) ?? new Set<string>()
    if (ports.has(binding.to.port)) diagnostics.push(invalid(`${path}/to`))
    ports.add(binding.to.port)
    writers.set(binding.to.tool, ports)
    if (!output || !input) return
    if (!compatible(output, input, binding.projection)) diagnostics.push(invalid(path))
    outgoing.get(binding.from.tool)?.push(binding.to.tool)
    incoming.set(binding.to.tool, (incoming.get(binding.to.tool) ?? 0) + 1)
  })
  if (diagnostics.length) return { diagnostics, order: [] }

  const order: string[] = []
  const emitted = new Set<string>()
  // Rescan declaration order at each step, so a newly released earlier node
  // takes precedence over a later node that was already ready.
  while (order.length < document.tools.length) {
    const next = document.tools.find((tool) => !emitted.has(tool.id) && incoming.get(tool.id) === 0)
    if (!next) return { diagnostics: [invalid("/bindings")], order: [] }
    order.push(next.id)
    emitted.add(next.id)
    outgoing.get(next.id)?.forEach((id) => incoming.set(id, (incoming.get(id) ?? 0) - 1))
  }
  return { diagnostics, order }
}

function compatible(output: Port, input: Port, projection: FabricWorkspace.Binding["projection"]) {
  if (output.revision !== input.revision || (output.nullable && !input.nullable)) return false
  if (projection === "executionResource") return output.type === "ExecutionRef" && input.type === "ResourceRef"
  return output.type === input.type
}

function invalid(path: string): Diagnostic {
  return { path, code: "invalid-input", messageKey: "fabric.declaration.binding" }
}
