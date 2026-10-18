import { Actions } from "@orchestra/schema/actions"
import { Schema } from "effect"
import { inputExpression, limits, object, strings } from "./document"
import type { Diagnostics } from "./document"

const reserved = new Set([
  "include", "stages", "default", "variables", "workflow", "spec", "image", "services", "cache",
  "before_script", "after_script", "types",
])

export function gitlab(document: Schema.JsonObject, report: Diagnostics, references: readonly (readonly string[])[] = []) {
  const opaque = (path: readonly string[]) => references.some((reference) => path.every((key, index) => reference[index] === key))
  const includes = document.include
  if (includes !== undefined) report.add("partial", "include_unresolved:external GitLab configuration not fetched")
  const explicit = document.stages === undefined ? document.types : document.stages
  const stages = opaque(["stages"]) || opaque(["types"]) || inputExpression(explicit) ? undefined
    : explicit === undefined ? includes === undefined ? [".pre", "build", "test", "deploy", ".post"] : undefined
    : strings(explicit) ? [...new Set([".pre", ...explicit, ".post"])] : undefined
  if (explicit !== undefined && !stages) report.add(opaque(["stages"]) || opaque(["types"]) || inputExpression(explicit) ? "partial" : "unresolved", "stages_unresolved:expected literal native stage name array")
  if (strings(explicit) && new Set(explicit).size !== explicit.length) report.add("unresolved", "stages_duplicate")
  const definitions = new Map(Object.entries(document).filter(([key]) => !reserved.has(key)))
  const resolved = new Map<string, Schema.JsonObject>()
  const levels = new Map<string, number>()
  const resolving = new Set<string>()
  const failed = new Set<string>()
  const parentsByID = new Map<string, string[]>()
  function resolve(id: string, depth = 0): Schema.JsonObject | undefined {
    if (!resolutionVisit(report)) return
    // Depth and active ancestry affect failure. A deep/cyclic caller must not poison a later shallow caller.
    const context = JSON.stringify([id, depth, Array.from(resolving)])
    if (failed.has(context)) return
    const fail = (message: string) => {
      failed.add(context)
      report.add("partial", message)
    }
    const cached = resolved.get(id)
    if (depth + (levels.get(id) ?? 0) > 11 || resolving.has(id)) {
      fail(`extends_unresolved:cycle or more than 11 levels at ${id}`)
      return
    }
    const raw = definitions.get(id)
    if (!object(raw)) {
      fail(`extends_missing:${id}`)
      return
    }
    if (opaque([id]) && depth > 0 || opaque([id, "extends"])) {
      fail(`extends_unresolved:opaque native reference at ${id}`)
      return
    }
    if (cached) return cached
    if (raw.extends === undefined || raw.extends === null) {
      resolved.set(id, raw)
      levels.set(id, 0)
      return raw
    }
    if (includes !== undefined) {
      fail(`extends_unresolved:unfetched includes may contribute parent configuration at ${id}`)
      return
    }
    const parents = parentsByID.get(id) ?? []
    if (!parentsByID.has(id)) {
      const candidates = typeof raw.extends === "string" ? [raw.extends] : Array.isArray(raw.extends) ? raw.extends : undefined
      if (!candidates || !candidates.every((parent) => {
        if (!resolutionVisit(report) || typeof parent !== "string" || !parent) return false
        parents.push(parent)
        return true
      })) {
        fail(`extends_invalid:${id}`)
        return
      }
      // Validate each immutable parent list once; repeated callers must not rescan wide failed lists.
      parentsByID.set(id, parents)
    }
    resolving.add(id)
    const result: { value: Schema.JsonObject } = { value: {} }
    const sound = parents.every((parent) => {
      const config = resolve(parent, depth + 1)
      if (!config) return false
      const value = merge(result.value, config, report)
      if (!value) return false
      result.value = value
      return true
    })
    resolving.delete(id)
    if (!sound) {
      failed.add(context)
      return
    }
    // GitLab reverse deep merge: later parent wins; child wins; arrays/null replace, never concatenate.
    const effective = merge(result.value, raw, report)
    if (!effective) {
      failed.add(context)
      return
    }
    resolved.set(id, effective)
    levels.set(id, 1 + parents.reduce((maximum, parent) => Math.max(maximum, levels.get(parent) ?? 0), 0))
    return effective
  }
  const jobs = Array.from(definitions).flatMap(([id, raw]): Actions.GraphJob[] => {
    if (id.startsWith(".")) return []
    if (!id || !object(raw)) {
      report.add("unresolved", `job_invalid:${id}`)
      return []
    }
    const effective = resolve(id)
    // Unfetched includes may redefine even known templates/jobs. Keep only source-local projections.
    const config = effective ? applyDefaults(document, effective, report, opaque, id) : raw
    if (inputExpression(id) || inputExpression(config)) report.add("partial", `inputs_unresolved:${id}:native interpolation retained`)
    const uncertain = opaque([id, "<<"])
    if (uncertain) report.add("partial", `merge_unresolved:opaque native reference at ${id}`)
    const stage = uncertain || opaque([id, "stage"]) || inputExpression(config.stage) ? undefined : typeof config.stage === "string" ? config.stage
      : config.stage === undefined && effective && includes === undefined ? "test" : undefined
    if (config.stage !== undefined && typeof config.stage !== "string") report.add(uncertain || opaque([id, "stage"]) ? "partial" : "unresolved", `stage_invalid:${id}`)
    if (stage && stages && !stages.includes(stage)) report.add(includes === undefined ? "unresolved" : "partial", `stage_missing:${id}->${stage}`)
    const status = object(config.needs) && typeof config.needs.pipeline === "string" && config.needs.pipeline.length > 0 && config.needs.job === undefined
    if (status) report.add("partial", `needs_pipeline_status:${id}`)
    const needs = uncertain || opaque([id, "needs"]) ? undefined : config.needs === undefined || status ? [] : Array.isArray(config.needs) ? config.needs.flatMap((need): string[] => {
      if (typeof need === "string" && need) {
        if (inputExpression(need)) return []
        if (!definitions.has(need) || need.startsWith(".")) report.add(includes === undefined ? "unresolved" : "partial", `needs_missing:${id}->${need}`)
        return [need]
      }
      if (!object(need) || typeof need.job !== "string" || !need.job) {
        report.add("unresolved", `needs_invalid:${id}`)
        return []
      }
      if (inputExpression(need.job)) return []
      if (need.project !== undefined || need.pipeline !== undefined) {
        report.add("partial", `needs_external:${id}->${need.job}`)
        return []
      }
      if (need.optional !== undefined && typeof need.optional !== "boolean" || need.artifacts !== undefined && typeof need.artifacts !== "boolean") {
        report.add("unresolved", `needs_options_invalid:${id}->${need.job}`)
      }
      if (!definitions.has(need.job) || need.job.startsWith(".")) {
        if (need.optional !== true) report.add(includes === undefined ? "unresolved" : "partial", `needs_missing:${id}->${need.job}`)
        return []
      }
      if (need.parallel !== undefined) report.add("partial", `needs_parallel:${id}->${need.job}`)
      return [need.job]
    }) : inputExpression(config.needs) ? [] : undefined
    if (!needs) report.add(uncertain || opaque([id, "needs"]) ? "partial" : "unresolved", `needs_invalid:${id}`)
    if (needs && new Set(needs).size !== needs.length) report.add("unresolved", `needs_duplicate:${id}`)
    if (config.trigger !== undefined) report.add("partial", `downstream_unresolved:${id}`)
    if (config.rules !== undefined || config.only !== undefined || config.except !== undefined) report.add("partial", `selection_native:${id}`)
    if (config.parallel !== undefined && !object(config.parallel) && typeof config.parallel !== "number") report.add("partial", `parallel_unresolved:${id}`)
    return [{
      id, name: id, needs: needs ?? [], stage,
      runner: uncertain ? undefined : config.tags, matrix: !uncertain && object(config.parallel) ? config.parallel.matrix : undefined,
      configuration: raw, steps: [],
    }]
  })
  if (jobs.length === 0) report.add(includes === undefined ? "unresolved" : "partial", "jobs_missing:no local execution definitions")
  return { jobs, stages, includes, triggers: document.workflow }
}

function merge(parent: Schema.JsonObject, child: Schema.JsonObject, report: Diagnostics): Schema.JsonObject | undefined {
  if (report.work.merges === limits.merges) {
    report.add("partial", `merge_limit:${limits.merges} visits`, true)
    return
  }
  const entries: [string, Schema.Json][] = []
  const sound = [...new Set([...Object.keys(parent), ...Object.keys(child)])].every((key) => {
    if (!mergeVisit(report)) return false
    const value = child[key]
    const previous = parent[key]
    const result = value === undefined ? previous : object(value) && object(previous) ? merge(previous, value, report) : value
    if (result === undefined) return false
    entries.push([key, result])
    return true
  })
  return sound ? Object.fromEntries(entries) : undefined
}

function resolutionVisit(report: Diagnostics) {
  if (report.work.resolutions === limits.resolutions) {
    report.add("partial", `resolution_limit:${limits.resolutions} visits`, true)
    return false
  }
  ++report.work.resolutions
  return true
}

function mergeVisit(report: Diagnostics) {
  if (report.work.merges === limits.merges) {
    report.add("partial", `merge_limit:${limits.merges} visits`, true)
    return false
  }
  ++report.work.merges
  return true
}

const defaultKeys = new Set([
  "after_script", "artifacts", "before_script", "cache", "hooks", "id_tokens", "image",
  "interruptible", "retry", "services", "tags",
])

export function applyDefaults(document: Schema.JsonObject, config: Schema.JsonObject, report: Diagnostics, opaque = (_path: readonly string[]) => false, id?: string) {
  if (document.default === undefined) return config
  const inheritance = object(config.inherit) ? config.inherit.default : undefined
  if (config.inherit !== undefined && !object(config.inherit)
    || inheritance !== undefined && typeof inheritance !== "boolean" && !Array.isArray(inheritance)
    || inputExpression(config.inherit) || id !== undefined && opaque([id, "inherit"])
    || opaque(["default"]) || !object(document.default)) {
    report.add("partial", "defaults_unresolved:expected literal defaults and inherit:default boolean or allowlist")
    return config
  }
  if (inheritance === false) return config
  const allowed = new Set<string>()
  if (Array.isArray(inheritance) && !inheritance.every((key) => {
    if (!mergeVisit(report)) return false
    if (typeof key !== "string" || !defaultKeys.has(key)) return false
    allowed.add(key)
    return true
  })) {
    report.add("partial", "defaults_unresolved:unsupported or excessive inherit:default allowlist")
    return config
  }
  if (document.include !== undefined) {
    report.add("partial", "defaults_unresolved:unfetched includes may contribute job overrides")
    return config
  }
  if (report.work.merges === limits.merges) {
    report.add("partial", `merge_limit:${limits.merges} visits`, true)
    return config
  }
  const entries: [string, Schema.Json][] = []
  const sound = Object.entries(document.default).every(([key, value]) => {
    if (!mergeVisit(report)) return false
    if (!defaultKeys.has(key)) {
      report.add("partial", `default_unsupported:${key}`)
      return true
    }
    if (Array.isArray(inheritance) && !allowed.has(key) || Object.hasOwn(config, key)) return true
    // Native defaults copy whole keywords; they never deep-merge into an explicit job keyword.
    entries.push([key, value])
    return true
  })
  return sound ? { ...Object.fromEntries(entries), ...config } : config
}
