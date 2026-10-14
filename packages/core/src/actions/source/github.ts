import { Actions } from "@orchestra/schema/actions"
import { Schema } from "effect"
import { condition, expression, object, strings } from "./document"
import type { Diagnostics } from "./document"

export function github(document: Schema.JsonObject, report: Diagnostics) {
  if (!object(document.jobs) || Object.keys(document.jobs).length === 0) {
    report.add("unresolved", "jobs_invalid:GitHub requires a nonempty jobs mapping")
    return { jobs: [], triggers: document.on }
  }
  if (document.on === undefined) report.add("unresolved", "triggers_missing:GitHub requires on")
  if (document.on !== undefined && typeof document.on !== "string" && !strings(document.on) && !object(document.on)) {
    report.add("unresolved", "triggers_invalid:expected native event string, array or mapping")
  }
  const definitions = document.jobs
  const jobs = Object.entries(definitions).flatMap(([id, configuration]): Actions.GraphJob[] => {
    if (!id || !object(configuration)) {
      report.add("unresolved", `job_invalid:jobs.${id}`)
      return []
    }
    const needs = configuration.needs === undefined ? [] : typeof configuration.needs === "string"
      ? [configuration.needs] : strings(configuration.needs) ? configuration.needs : undefined
    if (!needs || needs.some((need) => !need)) report.add("unresolved", `needs_invalid:jobs.${id}`)
    needs?.forEach((need) => {
      if (!Object.hasOwn(definitions, need)) report.add("unresolved", `needs_missing:jobs.${id}->${need}`)
    })
    if (needs && new Set(needs).size !== needs.length) report.add("unresolved", `needs_duplicate:jobs.${id}`)
    const strategy = object(configuration.strategy) ? configuration.strategy : undefined
    const matrix = strategy?.matrix
    if (matrix !== undefined && expression(matrix)) report.add("partial", `matrix_dynamic:jobs.${id}`)
    if (matrix !== undefined && !object(matrix) && typeof matrix !== "string") report.add("unresolved", `matrix_invalid:jobs.${id}`)
    if (typeof configuration.uses === "string") report.add("partial", `reusable_unresolved:jobs.${id}`)
    if (configuration.uses !== undefined && typeof configuration.uses !== "string") report.add("unresolved", `reusable_invalid:jobs.${id}`)
    if (Object.hasOwn(configuration, "<<")) report.add("partial", `yaml_merge_unsupported:jobs.${id}`)
    const steps = configuration.steps === undefined ? [] : Array.isArray(configuration.steps)
      ? configuration.steps.flatMap((step, index): Actions.GraphStep[] => {
        if (!object(step)) {
          report.add("unresolved", `step_invalid:jobs.${id}.steps.${index}`)
          return []
        }
        if (step.uses !== undefined && typeof step.uses !== "string" || step.run !== undefined && typeof step.run !== "string") {
          report.add("unresolved", `step_command_invalid:jobs.${id}.steps.${index}`)
        }
        return [{
          name: typeof step.name === "string" ? step.name : typeof step.id === "string" ? step.id
            : typeof step.uses === "string" ? step.uses : `Step ${index + 1}`,
          uses: typeof step.uses === "string" ? step.uses : undefined,
          run: typeof step.run === "string" ? step.run : undefined,
          condition: condition(step.if, `jobs.${id}.steps.${index}`, report),
        }]
      }) : undefined
    if (!steps) report.add("unresolved", `steps_invalid:jobs.${id}`)
    return [{
      id, name: typeof configuration.name === "string" ? configuration.name : id,
      needs: needs ?? [], condition: condition(configuration.if, `jobs.${id}`, report),
      runner: configuration["runs-on"], matrix,
      reusable: typeof configuration.uses === "string" ? configuration.uses : undefined,
      configuration, steps: steps ?? [],
    }]
  })
  return { jobs, triggers: document.on }
}
