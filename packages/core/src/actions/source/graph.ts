export * as ActionsGraph from "./graph"

import { Actions } from "@orchestra/schema/actions"
import { Schema } from "effect"
import { diagnostics, inputExpression, object, read } from "./document"
import type { Diagnostics } from "./document"
import { github } from "./github"
import { gitlab } from "./gitlab"

export function parse(provider: Actions.ProviderKind, source: Actions.Source): Actions.Graph {
  const report = diagnostics()
  source.diagnostics?.forEach((message) => report.add("partial", `source_diagnostic:${message}`))
  if (source.includes?.length) report.add("partial", "source_includes:external source not resolved")
  const document = read(source.text, provider, report)
  if (!document) return { source, state: "unresolved", jobs: [], diagnostics: report.items }
  const inputs = document.header ? inputDefinitions(document.header, report) : undefined
  if (provider === "gitlab" && inputExpression(document.value)) report.add("partial", "inputs_unresolved:body interpolation retained without evaluation")
  const result = provider === "github" ? github(document.value, report) : gitlab(document.value, report, document.references)
  // Inspect only definition-level edges. Matrix cells and provider execution IDs are separate data.
  const jobs = new Map(result.jobs.map((job) => [job.id, job]))
  const degree = new Map(result.jobs.map((job) => [job.id, job.needs.filter((id) => jobs.has(id)).length]))
  const outgoing = new Map<string, string[]>()
  result.jobs.forEach((job) => job.needs.forEach((id) => {
    if (!jobs.has(id)) return
    const destinations = outgoing.get(id)
    if (destinations) {
      destinations.push(job.id)
      return
    }
    outgoing.set(id, [job.id])
  }))
  const ready = result.jobs.filter((job) => degree.get(job.id) === 0).map((job) => job.id)
  const processed = { count: 0 }
  while (processed.count < ready.length) {
    const id = ready[processed.count++]
    if (id === undefined) break
    outgoing.get(id)?.forEach((child) => {
      const remaining = (degree.get(child) ?? 0) - 1
      degree.set(child, remaining)
      if (remaining === 0) ready.push(child)
    })
  }
  if (processed.count !== result.jobs.length) {
    report.add("unresolved", `needs_cycle:${result.jobs.filter((job) => (degree.get(job.id) ?? 0) > 0).map((job) => job.id).join(",")}`)
  }
  return { source, ...result, header: document.header, inputs, state: report.state(), diagnostics: report.items }
}

function inputDefinitions(header: Schema.JsonObject, report: Diagnostics): Actions.InputDefinition[] {
  if (!object(header.spec)) return []
  if (header.spec.include !== undefined) report.add("partial", "inputs_include_unresolved:external input definitions not fetched")
  if (!object(header.spec.inputs)) return []
  return Object.entries(header.spec.inputs).flatMap(([name, configuration]) => {
    const config = configuration === null ? {} : configuration
    if (!object(config) || !name) {
      report.add("unresolved", `input_invalid:${name}`)
      return []
    }
    if (config.rules !== undefined || inputExpression(config)) {
      report.add("partial", `input_unresolved:${name}:conditional or interpolated input definition`)
      return []
    }
    const definition = {
      name, type: config.type === undefined ? "string" : config.type, required: !Object.hasOwn(config, "default"),
      description: config.description, default: config.default, options: config.options,
    }
    if (!Schema.is(Actions.InputDefinition)(definition) || !["string", "boolean", "number", "array"].includes(definition.type)) {
      report.add("unresolved", `input_invalid:${name}:unsupported native input shape`)
      return []
    }
    if (config.regex !== undefined) report.add("partial", `input_constraints:${name}:native regex retained without evaluation`)
    return [definition]
  })
}
