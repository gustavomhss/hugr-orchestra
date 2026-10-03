// Adapted from TechLead mcp/src/engine/scheduler.ts @ a68e7af. Advice never dispatches or merges.
// Copyright 2026 HuGR Labs. Apache-2.0 (http://www.apache.org/licenses/LICENSE-2.0).
// Spatial semantics remain shared with A's conflict-map; no second conflict rule.
import { conflictVerdict, unresolvedScopes } from "../tools/conflict-semantics.ts"
import { requireValue } from "../governance/contracts.ts"
import { type WpState, transition, detectCycles } from "./scheduler-fold.ts"

export interface SchedulerWp {
  id: string
  writes?: string[]
  reads?: string[]
  appendOnly?: string[]
  deps?: string[]
  hardDeps?: string[]
  blastRadius?: number
}
export interface WaveEvent { type: "dispatched" | "sealed" | "failed" | "merged"; wp: string }
export function schedule(wps: SchedulerWp[], events: WaveEvent[], cap = 10) {
  requireValue(Array.isArray(wps) && wps.length <= 512, "SCHEDULER_WPS_INVALID_OR_OVERFLOW")
  requireValue(Array.isArray(events) && events.length <= 8192, "SCHEDULER_EVENTS_INVALID_OR_OVERFLOW")
  requireValue(Number.isInteger(cap) && cap >= 0 && cap <= 512, "SCHEDULER_CAP_INVALID")
  events.forEach((event) => requireValue(event && ["dispatched", "sealed", "failed", "merged"].includes(event.type) && typeof event.wp === "string", "SCHEDULER_EVENT_INVALID"))
  const issues = new Set<string>()
  const byID = new Map<string, SchedulerWp>()
  wps.forEach((wp) => {
    requireValue(typeof wp.id === "string" && wp.id.length > 0 && wp.id.length <= 96, "SCHEDULER_ID_INVALID")
    ;[wp.writes, wp.reads, wp.appendOnly, wp.deps, wp.hardDeps].forEach((list) => {
      requireValue(list === undefined || (Array.isArray(list) && list.length <= 512 && list.every((item) => typeof item === "string" && item.length > 0 && item.length <= 4096)), `SCHEDULER_PATHS_INVALID: ${wp.id}`)
    })
    if (byID.has(wp.id)) { issues.add(`duplicate wp id: ${wp.id}`); return }
    byID.set(wp.id, wp)
  })
  const ids = [...byID.keys()].sort()
  // Unary preflight includes reads/appendOnly and duplicate declarations before any replay advice.
  // A owns exact-site notation. Unresolved patterns require acquisition/expansion outside this pure engine.
  const scopes = unresolvedScopes(wps).toSorted((a, b) => {
    const left = JSON.stringify([a.wp, a.field, a.site])
    const right = JSON.stringify([b.wp, b.field, b.site])
    return left < right ? -1 : left > right ? 1 : 0
  })
  if (scopes.length) return {
    status: "HOLD" as const, code: "PATTERN_SCOPE_UNRESOLVED" as const, unresolvedScopes: scopes,
    dispatchNow: [], mergeNow: null, done: false, replayEvaluated: false,
    inFlight: [], sealed: [], landed: [], redispatchable: [],
    blocked: ids.map((wp) => ({ wp, on: "PATTERN_SCOPE_UNRESOLVED" })),
    issues: [...new Set([...issues, "PATTERN_SCOPE_UNRESOLVED", ...scopes.map((scope) => `PATTERN_SCOPE_UNRESOLVED: ${scope.wp} ${scope.field} ${scope.site}`)])].sort(),
  }
  const conflict = (left: string, right: string) => conflictVerdict([byID.get(left)!, byID.get(right)!]).verdict === "CONFLICT"
  const deps = new Map(ids.map((key) => [key, [...new Set([...(byID.get(key)!.deps ?? []), ...(byID.get(key)!.hardDeps ?? [])])]]))
  const hard = new Map(ids.map((key) => {
    deps.get(key)!.forEach((dep) => {
      if (!byID.has(dep)) issues.add(`unknown dep: ${key}→${dep}`)
    })
    const promoted = deps.get(key)!.filter((dep) => byID.has(dep) && conflict(key, dep))
    promoted.forEach((dep) => { if (!byID.get(key)!.hardDeps?.includes(dep)) issues.add(`dep-conflict: ${key}↔${dep}`) })
    return [key, [...new Set([...(byID.get(key)!.hardDeps ?? []), ...promoted])]]
  }))
  const hardStar = (key: string) => {
    const found = new Set<string>()
    const pending = [...hard.get(key)!]
    while (pending.length) {
      const next = pending.pop()!
      if (found.has(next)) continue
      found.add(next)
      pending.push(...(hard.get(next) ?? []))
    }
    return [...found].sort()
  }
  const cycles = new Set<string>()
  detectCycles(ids, (key) => deps.get(key)!.filter((dep) => byID.has(dep)), issues, cycles)
  const states = new Map<string, WpState>(ids.map((key) => [key, "PENDING"]))
  const landed: string[] = []
  events.forEach((event) => {
    if (!byID.has(event.wp)) { issues.add(`unknown wp in events: ${event.wp}`); return }
    const current = states.get(event.wp)!
    const next = transition(current, event.type)
    if (!next) { issues.add(`ignored event: ${event.type} ${event.wp} in ${current}`); return }
    if (current === "DISPATCHED" && event.type === "merged") issues.add(`merged-without-seal: ${event.wp}`)
    if (event.type === "dispatched") {
      const clash = ids.find((key) => key !== event.wp && ["DISPATCHED", "SEALED"].includes(states.get(key)!) && conflict(event.wp, key))
      const dep = hardStar(event.wp).find((key) => !landed.includes(key))
      if (clash) issues.add(`dispatched-against-advice: ${event.wp} (conflict:${clash})`)
      if (!clash && dep) issues.add(`dispatched-against-advice: ${event.wp} (deps:${dep})`)
    }
    states.set(event.wp, next)
    if (next === "MERGED") landed.push(event.wp)
  })
  const inFlight = ids.filter((key) => ["DISPATCHED", "SEALED"].includes(states.get(key)!))
  const active = ids.filter((key) => states.get(key) === "DISPATCHED")
  const sealed = ids.filter((key) => states.get(key) === "SEALED")
  const redispatchable = ids.filter((key) => states.get(key) === "FAILED")
  const dispatchNow: string[] = []
  ids.forEach((key) => {
    if (!["PENDING", "FAILED"].includes(states.get(key)!)) return
    if (!hardStar(key).every((dep) => landed.includes(dep))) return
    if ([...inFlight, ...dispatchNow].some((other) => conflict(key, other))) return
    if (active.length + dispatchNow.length < cap) dispatchNow.push(key)
  })
  const blast = (key: string) => {
    const wp = byID.get(key)!
    if (wp.blastRadius === undefined) return wp.writes?.length ?? 0
    if (Number.isFinite(wp.blastRadius) && wp.blastRadius >= 0) return wp.blastRadius
    issues.add(`non-finite blastRadius: ${key}`)
    return wp.writes?.length ?? 0
  }
  const mergeable = sealed.filter((key) => !cycles.has(key) && deps.get(key)!.every((dep) => landed.includes(dep)))
  const priorities = new Map(mergeable.map((key) => [key, blast(key)]))
  const mergeNow = mergeable.sort((a, b) => priorities.get(a)! - priorities.get(b)! || (a < b ? -1 : a > b ? 1 : 0))[0] ?? null
  const blocked = ids.flatMap((key) => {
    const state = states.get(key)
    if (state === "SEALED") {
      const dep = [...deps.get(key)!].sort().find((dep) => !landed.includes(dep))
      return dep || cycles.has(key) ? [{ wp: key, on: `deps:${dep ?? key}` }] : []
    }
    if (!["PENDING", "FAILED"].includes(state!) || dispatchNow.includes(key)) return []
    const dep = hardStar(key).find((dep) => !landed.includes(dep))
    if (dep) return [{ wp: key, on: `deps:${dep}` }]
    const clash = [...new Set([...inFlight, ...dispatchNow])].sort().find((other) => other !== key && conflict(key, other))
    return [{ wp: key, on: clash ? `conflict:${clash}` : "cap" }]
  })
  const done = ids.every((key) => states.get(key) === "MERGED")
  if (!done && !dispatchNow.length && mergeNow === null && !active.length) issues.add("stalled: no dispatch, no merge, not done")
  return { dispatchNow, mergeNow, inFlight, sealed, landed, redispatchable, blocked, done, issues: [...issues].sort() }
}
