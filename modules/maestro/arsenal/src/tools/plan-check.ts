// Adapted from TechLead a68e7af92c7ed5aaf8b6574b7ad2f705fb38eeb5.
// Copyright 2026 HuGR Labs. Apache-2.0 (http://www.apache.org/licenses/LICENSE-2.0).
// Changed: require actual acceptance input, flag multiply owned items, native guidance.
import { text } from "../contract"
import type { Tool } from "../contract"
import { descriptor } from "../registry"
import { conflictVerdict } from "./conflict-semantics"
export interface AcceptanceItem { id: string; test: string; judged?: boolean }
export interface PlanWp { id: string; covers: string[]; writes?: string[]; reads?: string[]; appendOnly?: string[] }
export interface PlanCheckInput { items: AcceptanceItem[]; wps: PlanWp[]; maxItemsPerWp?: number }
export function runPlanCheck(input: PlanCheckInput) {
  const duplicates = (ids: string[]) => [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))]
  const ownership = Object.fromEntries(input.items.map((item) => [item.id, input.wps.filter((wp) => wp.covers.includes(item.id)).map((wp) => wp.id)]))
  const unowned = input.items.filter((item) => !ownership[item.id].length).map((item) => item.id)
  const multiplyOwned = input.items.filter((item) => ownership[item.id].length > 1).map((item) => item.id)
  const orphanWps = input.wps.filter((wp) => !wp.covers.some((id) => Object.hasOwn(ownership, id))).map((wp) => wp.id)
  const danglingRefs = input.wps.flatMap((wp) => {
    const missing = [...new Set(wp.covers.filter((id) => !Object.hasOwn(ownership, id)))]
    return missing.length ? [{ wp: wp.id, missing }] : []
  })
  const atomicityFlags = input.wps.flatMap((wp) => {
    const valid = [...new Set(wp.covers.filter((id) => Object.hasOwn(ownership, id)))].length
    return valid > (input.maxItemsPerWp ?? 4) ? [{ wp: wp.id, reason: `owns ${valid} items (> ${input.maxItemsPerWp ?? 4}) — consider a smaller slice` }] : []
  })
  const duplicateItemIds = duplicates(input.items.map((i) => i.id))
  const duplicateWpIds = duplicates(input.wps.map((wp) => wp.id))
  const writeConflicts = conflictVerdict(input.wps).conflictingPairs
  return { ok: input.items.length > 0 && input.wps.length > 0 && ![unowned, multiplyOwned, orphanWps, danglingRefs, writeConflicts, duplicateItemIds, duplicateWpIds].some((list) => list.length), unowned, multiplyOwned, orphanWps, danglingRefs, writeConflicts, atomicityFlags, judgedItems: input.items.filter((i) => i.judged).map((i) => i.id), duplicateItemIds, duplicateWpIds, ownership }
}
const tool: Tool<PlanCheckInput> = {
  ...descriptor("plan-check"),
  handler(input) {
    const result = runPlanCheck(input)
    return text(result, { next: result.ok ? "independently review acceptance coverage; collect actual red→green evidence before completion" : "fix unowned/multiply-owned items, orphan work, dangling references and write conflicts", invariant: "ownership checks do not run tests or approve judged items; judged acceptance remains explicit" })
  },
}
export default tool
