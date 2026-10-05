// Adapted from TechLead a68e7af92c7ed5aaf8b6574b7ad2f705fb38eeb5.
// Copyright 2026 HuGR Labs. Apache-2.0 (http://www.apache.org/licenses/LICENSE-2.0).
// Changed: reject malformed ranges, normalize lexical relative paths; no filesystem identity claim.
import { posix } from "node:path"

export interface Site { path: string; range?: { start: number; end: number } }
export interface WpWrites { id: string; writes?: string[]; reads?: string[]; appendOnly?: string[] }
export interface ConflictingPair { a: string; b: string; on: string[] }
export type Verdict = "CONFLICT-FREE" | "UNION-RESOLVABLE" | "CONFLICT"
export interface ScopeIssue { wp: string; field: "writes" | "reads" | "appendOnly"; site: string }
export interface ConflictReport { verdict: Verdict; conflictingPairs: ConflictingPair[]; hold?: { code: "PATTERN_SCOPE_UNRESOLVED"; scopes: ScopeIssue[] } }
// Closed exact-site notation: unescaped * and ? are unresolved patterns, not literal filenames.
// Literal *, ? and backslash use \*, \? and \\; brackets remain ordinary filename characters.
export function patternScope(site: string): boolean {
  for (let i = 0; i < site.length; i++) {
    if (site[i] === "\\" && ["\\", "*", "?"].includes(site[i + 1])) { i++; continue }
    if (site[i] === "*" || site[i] === "?") return true
  }
  return false
}
export function unresolvedScopes(wps: WpWrites[]): ScopeIssue[] {
  return wps.flatMap((wp) => (["writes", "reads", "appendOnly"] as const).flatMap((field) => (wp[field] ?? []).filter(patternScope).map((site) => ({ wp: wp.id, field, site }))))
}
export function normalizeSite(site: string): Site {
  const match = /^(.*):L(\d+)(?:-(\d+))?$/.exec(site)
  if (!match) {
    if (/:L[^/]*$/.test(site)) throw new Error(`malformed line range: ${site}`)
    return { path: posix.normalize(site.replace(/\\([\\*?])/g, "$1")) }
  }
  const start = Number(match[2])
  const end = match[3] ? Number(match[3]) : start
  if (!match[1] || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start) throw new Error(`malformed line range: ${site}`)
  return { path: posix.normalize(match[1].replace(/\\([\\*?])/g, "$1")), range: { start, end } }
}
export function sitesConflict(a: string, b: string): boolean {
  // True means a potential conflict for unresolved scopes, not proof of a glob intersection.
  if (patternScope(a) || patternScope(b)) return true
  const left = normalizeSite(a)
  const right = normalizeSite(b)
  return left.path === right.path && (!left.range || !right.range || left.range.start <= right.range.end && right.range.start <= left.range.end)
}
export function conflictVerdict(wps: WpWrites[]): ConflictReport {
  const scopes = unresolvedScopes(wps)
  if (scopes.length) return {
    verdict: "CONFLICT",
    // Unary blockers keep acceptance-floor consumers from passing even a singleton unresolved WP.
    conflictingPairs: wps.filter((wp) => scopes.some((scope) => scope.wp === wp.id)).map((wp) => ({ a: wp.id, b: wp.id, on: scopes.filter((scope) => scope.wp === wp.id).map((scope) => `PATTERN_SCOPE_UNRESOLVED: ${scope.field} ${scope.site}`) })),
    hold: { code: "PATTERN_SCOPE_UNRESOLVED", scopes },
  }
  const pairs = wps.flatMap((a, i) => wps.slice(i + 1).map((b) => {
    const overlaps = (a.writes ?? []).flatMap((aw) => (b.writes ?? []).filter((bw) => sitesConflict(aw, bw)).map(() => aw))
    const left = new Set((a.appendOnly ?? []).map((site) => normalizeSite(site).path))
    const right = new Set((b.appendOnly ?? []).map((site) => normalizeSite(site).path))
    const hard = [...new Set(overlaps.filter((site) => !left.has(normalizeSite(site).path) || !right.has(normalizeSite(site).path)))]
    return { a: a.id, b: b.id, on: hard, union: overlaps.length > 0 && !hard.length }
  }))
  const conflictingPairs = pairs.filter((p) => p.on.length).map((p) => ({ a: p.a, b: p.b, on: p.on }))
  return { verdict: conflictingPairs.length ? "CONFLICT" : pairs.some((p) => p.union) ? "UNION-RESOLVABLE" : "CONFLICT-FREE", conflictingPairs }
}
