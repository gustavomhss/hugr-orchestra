export * as HookEvaluate from "./evaluate"

import { RelayHook } from "@opencode-ai/schema/relay-hook"
import type { RelayLedger } from "@opencode-ai/schema/relay-ledger"
import { HookGlob } from "./glob"

// Pure hook evaluation (WP9): which installed actions fire for one invocation, in what order. Core enforces them
// (WP11); nothing here grants anything. The Python Relay never ran hooks, so there is no golden: the tests pin this.

export interface Invocation {
  readonly operation: RelayHook.Operation
  readonly timing: RelayHook.Timing
  // Absent for session triggers.
  readonly tool?: string
  // Project-relative canonical paths, `/`-separated; `apply_patch` matches when any path matches.
  readonly paths: ReadonlyArray<string>
  readonly command?: string
  // Further operations of the same tool call, each with its own paths: an `apply_patch` that edits some files and adds
  // others is `edit` with the update and move paths plus `{operation: "write", paths: <added>}`. A trigger on one
  // operation sees only that operation's paths, a `tool` trigger sees all of them, and an install fires once per call.
  readonly also?: ReadonlyArray<Part>
}

export interface Part {
  readonly operation: RelayHook.Operation
  readonly paths: ReadonlyArray<string>
}

export interface Step {
  readonly installID: string
  readonly nodeID: string
  readonly action: RelayLedger.HookAction
  readonly message: string
  // Verify only.
  readonly check?: string
  // Verify only: the steps on its Fail port, when one is connected. A connected Fail whose branch fires nothing for
  // this invocation is `[]`, which is not the same as unconnected (the default verify failure).
  readonly onFail?: ReadonlyArray<Step>
}

/**
 * Enabled installs in install order; each graph walked from its trigger, a condition taking its Yes or No port, actions
 * in edge order. A Verify's Pass port continues the walk; its Fail port runs only when the check fails. Block has no
 * outputs, so it ends its branch. The install writer refuses fan-out (one next step per output), so an install's steps
 * after its Verify are exactly that Verify's Pass continuation.
 */
export const plan = (installs: ReadonlyArray<RelayHook.Install>, invocation: Invocation): ReadonlyArray<Step> =>
  installs
    .filter((install) => install.enabled)
    .toSorted((a, b) => a.order - b.order)
    .flatMap((install) => fire(install, invocation))

// `**` crosses directories in path patterns (HookGlob: minimatch-like and case-sensitive); other fields use Orchestra's
// permission Wildcard.
export const matches = (field: "path" | "tool" | "command" | "event", pattern: string, value: string): boolean => {
  if (field === "path") return HookGlob.match(pattern, value)
  const fold = process.platform === "win32"
  const normalized = pattern.replaceAll("\\", "/")
  const subject = value.replaceAll("\\", "/")
  return star(normalized, subject, fold) || (normalized.endsWith(" *") && star(normalized.slice(0, -2), subject, fold))
}

const TOOL_OPERATIONS = new Set<string>(RelayHook.ToolOperation.literals)

const ACTIONS = {
  [RelayHook.NodeType.remind]: "remind",
  [RelayHook.NodeType.block]: "block",
  [RelayHook.NodeType.approve]: "approve",
  [RelayHook.NodeType.verify]: "verify",
  [RelayHook.NodeType.repair]: "repair",
  [RelayHook.NodeType.record]: "record",
  [RelayHook.NodeType.allow]: "allow",
} as const satisfies Record<
  Exclude<RelayHook.NodeType, typeof RelayHook.NodeType.trigger | typeof RelayHook.NodeType.condition>,
  RelayLedger.HookAction
>

// One install: every trigger that fires on the invocation, walked depth-first in connection order.
function fire(install: RelayHook.Install, invocation: Invocation): ReadonlyArray<Step> {
  const graph = install.snapshot
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]))
  const all = [{ operation: invocation.operation, paths: invocation.paths }, ...(invocation.also ?? [])]
  return graph.nodes.flatMap((trigger) => {
    if (trigger.type !== RelayHook.NodeType.trigger || trigger.parameters.timing !== invocation.timing) return []
    const operation = trigger.parameters.operation
    const parts = all.filter((part) =>
      operation === "tool" ? TOOL_OPERATIONS.has(part.operation) : part.operation === operation,
    )
    if (parts.length === 0) return []
    const next = (from: string, port: number, trail: ReadonlyArray<string>): ReadonlyArray<Step> =>
      graph.connections
        .filter((edge) => edge.from === from && edge.port === port)
        .flatMap((edge) => visit(edge.to, [...trail, from]))
    const visit = (id: string, trail: ReadonlyArray<string>): ReadonlyArray<Step> => {
      const node = nodes.get(id)
      // Dangling targets, cycles and edges into a trigger only exist in snapshots the install writer refuses; the walk
      // still ends on them.
      if (!node || trail.includes(id) || node.type === RelayHook.NodeType.trigger) return []
      if (node.type === RelayHook.NodeType.condition)
        return next(id, holds(node.parameters, parts, invocation) ? 0 : 1, trail)
      const step = {
        installID: install.installID,
        nodeID: id,
        action: ACTIONS[node.type],
        message: node.parameters.message,
      }
      if (node.type === RelayHook.NodeType.block) return [step]
      if (node.type !== RelayHook.NodeType.verify) return [step, ...next(id, 0, trail)]
      const failConnected = graph.connections.some((edge) => edge.from === id && edge.port === 1)
      return [
        { ...step, check: node.parameters.check, ...(failConnected ? { onFail: next(id, 1, trail) } : {}) },
        ...next(id, 0, trail),
      ]
    }
    return next(trigger.id, 0, [])
  })
}

// A condition on a field the invocation lacks (a path on a command, a tool on a session trigger) takes its No port.
function holds(condition: RelayHook.ConditionParameters, parts: ReadonlyArray<Part>, invocation: Invocation) {
  if (condition.field === "path")
    return parts.some((part) => part.paths.some((path) => matches("path", condition.pattern, path)))
  if (condition.field === "event")
    return parts.some((part) => matches("event", condition.pattern, `${part.operation}.${invocation.timing}`))
  const value = condition.field === "tool" ? invocation.tool : invocation.command
  return value !== undefined && matches(condition.field, condition.pattern, value)
}

/**
 * Orchestra's Wildcard (core/src/util/wildcard.ts: `*` any run, newlines included; `?` one character; everything else
 * literal; case-insensitive on Windows) without its regex. That regex backtracks polynomially on several stars, and the
 * value here is a model-written command, so this matches greedily in O(pattern × value): the first and last literal
 * segments are anchored and each middle one takes its leftmost fit.
 */
function star(pattern: string, value: string, fold: boolean) {
  const segments = pattern.split("*")
  const head = segments[0]!
  if (segments.length === 1) return value.length === head.length && fits(head, value, 0, fold)
  const tail = segments.at(-1)!
  const end = value.length - tail.length
  if (end < head.length || !fits(head, value, 0, fold) || !fits(tail, value, end, fold)) return false
  return (
    segments
      .slice(1, -1)
      .reduce<
        number | undefined
      >((from, segment) => (from === undefined ? undefined : leftmost(segment, value, from, end, fold)), head.length) !==
    undefined
  )
}

// The end of the leftmost fit of `segment` in `value[from, limit)`.
function leftmost(segment: string, value: string, from: number, limit: number, fold: boolean) {
  const start = Array.from({ length: limit - segment.length - from + 1 }, (_, offset) => from + offset).find((index) =>
    fits(segment, value, index, fold),
  )
  return start === undefined ? undefined : start + segment.length
}

// Whether `segment` (`?` = any one UTF-16 unit, as in a non-unicode regex) matches `value` at `index`.
function fits(segment: string, value: string, index: number, fold: boolean) {
  return segment
    .split("")
    .every(
      (char, offset) =>
        char === "?" ||
        char === value[index + offset] ||
        (fold && char.toUpperCase() === value[index + offset]!.toUpperCase()),
    )
}
