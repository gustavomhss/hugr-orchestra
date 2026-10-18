export * as ProbeTypecheck from "./typecheck"

import path from "path"
import { lstat } from "fs/promises"
import { Effect } from "effect"
import { FSUtil } from "../../fs-util"
import type { Probe } from "./types"
import type { ProbeSnapshot } from "./snapshot"

// T-P2 and T-P3, from A/engine/compiler.ts and A/engine/brief-usage.ts: the compiler is the oracle, run as `tsc` in the
// jail rather than in the host's memory. Its `--pretty false` lines become diagnostics in original-file coordinates.
// The in-project oracle (tsconfig walk-up, location-free signature, undefined-name extraction) and the code-to-cause
// diagnosis are transplanted from the HuGR techlead (MIT): mcp/src/engine/verify-in-project.ts and diagnose-red.ts.

export type Diagnostic = NonNullable<Probe.ProbeResult["diagnostics"]>[number]

/** TS6133, TS6192 and TS6196 prove a symbol unused (brief-usage.ts:28-43), over the whole project. */
export const UNUSED = ["--noUnusedLocals", "--noUnusedParameters"]

export function argv(input: { readonly node: string; readonly tsc: string; readonly project: string; readonly heapMiB: number; readonly unused?: boolean }) {
  return [input.node, `--max-old-space-size=${input.heapMiB}`, input.tsc, "-p", input.project, "--noEmit", "--pretty", "false",
    ...(input.unused ? UNUSED : [])]
}

/** verify-in-project.ts `normErr`: the same error reads identically wherever it sits. */
export const signature = (item: Diagnostic) => `error ${item.code}: ${item.message}`

/**
 * verify-in-project.ts: the names a red project is missing. TS2593 is also "Cannot find name"; TS2339 names the type a
 * same-name global may shadow; TS18004 names a shorthand property with no value in scope.
 */
export function missing(diagnostics: ReadonlyArray<Diagnostic>) {
  return [...new Set(diagnostics.flatMap((item) => {
    const name = ["TS2304", "TS2552", "TS2593"].includes(item.code) ? /Cannot find name '([^']+)'/.exec(item.message)?.[1]
      : item.code === "TS2339" ? /on type '([^']+)'/.exec(item.message)?.[1]
      : item.code === "TS18004" ? /shorthand property '([^']+)'/.exec(item.message)?.[1]
      : undefined
    return name ? [name] : []
  }))]
}

const TEST_GLOBALS = new Set(["describe", "it", "test", "expect", "beforeEach", "afterEach", "vi", "jest"])

/**
 * diagnose-red.ts `diagnoseRed`, without the decomposition-specific reasons: the causes a red typecheck reduces to,
 * then each distinct error once with its count and first site. The condensed tail the model reads instead of raw lines.
 */
export function causes(diagnostics: ReadonlyArray<Diagnostic>) {
  const codes = new Set(diagnostics.map((item) => item.code))
  const names = missing(diagnostics)
  const assigned = [...new Set(diagnostics.flatMap((item) => item.code === "TS2632" ? [/Cannot assign to '([^']+)'/.exec(item.message)?.[1] ?? ""] : []))].filter(Boolean)
  const modules = [...new Set(diagnostics.flatMap((item) => ["TS2307", "TS2792"].includes(item.code) ? [/module '([^']+)'/.exec(item.message)?.[1] ?? ""] : []))].filter(Boolean)
  const reasons = [
    codes.has("TS2593") || names.some((name) => TEST_GLOBALS.has(name)) ? "cause: test-runner globals (describe/it/expect) have no types in this project" : "",
    codes.has("TS2591") ? "cause: a Node global (e.g. process) has no types in scope; the project lacks @types/node there" : "",
    assigned.length ? `cause: assignment to an imported binding (${assigned.join(", ")}); ES modules forbid it` : "",
    modules.length ? `cause: unresolved modules: ${modules.join(", ")}` : "",
    names.length ? `cause: names not found: ${names.join(", ")}` : "",
  ].filter(Boolean)
  const groups = diagnostics.reduce((map, item) => {
    const key = signature(item)
    map.set(key, { first: map.get(key)?.first ?? item, count: (map.get(key)?.count ?? 0) + 1 })
    return map
  }, new Map<string, { first: Diagnostic; count: number }>())
  return [...reasons, ...[...groups.entries()].map(([key, group]) =>
    `${group.count > 1 ? `${group.count}x ` : ""}${key.split("\n")[0]} (first at ${group.first.path || "<config>"}:${group.first.line}:${group.first.column})`)]
}

/**
 * The project tsc reads: a tsconfig or a directory as given, or for a source file the nearest tsconfig.json up to the
 * snapshot root (compiler.ts `findTsconfig`).
 */
export const project = Effect.fn("ProbeTypecheck.project")(function* (file: string, root: string) {
  if (file.endsWith(".json")) return file
  const stat = yield* Effect.promise(() => lstat(file))
  if (stat.isDirectory()) return file
  return yield* Effect.promise(() => nearest(path.dirname(file), root))
})

async function nearest(start: string, root: string): Promise<string | undefined> {
  if (!FSUtil.contains(root, start)) return undefined
  if (await Bun.file(path.join(start, "tsconfig.json")).exists()) return path.join(start, "tsconfig.json")
  if (start === root) return undefined
  return nearest(path.dirname(start), root)
}

const LINE = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/
const GLOBAL = /^error (TS\d+): (.*)$/

/**
 * Diagnostics from tsc's plain output. Paths resolve against `cwd` and come back relative to the original worktree;
 * indented lines continue the previous message. A diagnostic with no file (config errors) has line and column 0.
 */
export function parse(output: string, cwd: string, snapshot: Pick<ProbeSnapshot.Snapshot, "root" | "origin">) {
  // Appends in place: a broken project can print thousands of diagnostics.
  return output.split(/\r?\n/).reduce<Diagnostic[]>((list, line) => {
    const located = LINE.exec(line)
    const global = located ? undefined : GLOBAL.exec(line)
    const last = list.at(-1)
    if (located)
      list.push({ path: original(located[1], cwd, snapshot), line: Number(located[2]), column: Number(located[3]), code: located[4], message: located[5] })
    if (global) list.push({ path: "", line: 0, column: 0, code: global[1], message: global[2] })
    if (!located && !global && last && /^\s+\S/.test(line)) list[list.length - 1] = { ...last, message: `${last.message}\n${line.trim()}` }
    return list
  }, [])
}

/** Whether a stdout line is one parse() turned into a diagnostic (or its continuation), so the tail can leave it out. */
export function structured(line: string) {
  return LINE.test(line) || GLOBAL.test(line) || /^\s+\S/.test(line)
}

/** A snapshot path, or one tsc printed through a dependency link, as the original worktree spells it. */
export function original(file: string, cwd: string, snapshot: Pick<ProbeSnapshot.Snapshot, "root" | "origin">) {
  const absolute = path.resolve(cwd, file)
  const base = FSUtil.contains(snapshot.root, absolute) ? snapshot.root : FSUtil.contains(snapshot.origin, absolute) ? snapshot.origin : undefined
  return base ? path.relative(base, absolute).split(path.sep).join("/") : absolute
}
