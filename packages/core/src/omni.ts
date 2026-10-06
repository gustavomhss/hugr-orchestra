export * as Omni from "./omni.ts"

// The only module in Orchestra that imports hugr-omni (D-L2), and only through a dynamic import(): nothing loads the
// native addon unless the omni flag is on and a caller asks for it. Every other module reaches omni through here.
// It must also load under Node with --experimental-strip-types (the desktop server and the node test runner), so it
// imports only node: builtins and types.

import { existsSync, realpathSync } from "node:fs"
import path from "node:path"

type Binding = typeof import("hugr-omni")
export type Child = import("hugr-omni").Child
export type Paths = { addon?: string; supervisor?: string }
export type Found = { addon: string; supervisor: string }
// WP-H adds configure() to the binding; until then it is feature-checked.
type Configurable = Binding & { configure?: (paths: Found) => void }

const SUPERVISOR = `hugr-omni-supervisor${process.platform === "win32" ? ".exe" : ""}`
// The shipped file name (D-L8) and the name Cargo gives the addon in a checkout.
const SHIPPED_ADDON = "hugr_omni.node"
const BUILT_ADDON =
  ({ darwin: "libhugr_omni_node.dylib", win32: "hugr_omni_node.dll" } as Record<string, string>)[process.platform] ??
  "libhugr_omni_node.so"

let injected: Paths = {}
let loading: Promise<Binding> | undefined

/** Hands the loader explicit addon and supervisor paths (D-L8). Must run before the first load(). */
export function configure(paths: Paths) {
  if (loading) throw new Error("Omni.configure() must run before the first Omni.load().")
  injected = { ...injected, ...paths }
}

/**
 * Loads hugr-omni once. Rejects, loudly and with every place it looked, when the addon or the supervisor is
 * missing; callers that asked for omni (the flag is on) must never fall back silently.
 */
export function load() {
  loading ??= open()
  return loading
}

async function open(): Promise<Binding> {
  const found = locate()
  // Until the binding has configure(), its index.js picks the addon from HUGR_OMNI_ADDON, read on the JS side, so
  // this write reaches it on Bun too. childEnv() strips it from every child.
  process.env.HUGR_OMNI_ADDON = found.addon
  const binding: Configurable = await import("hugr-omni").catch((cause: unknown) => {
    throw new Error(`hugr-omni could not load its native addon ${found.addon}: ${String(cause)}`, { cause })
  })
  if (typeof binding.configure === "function") {
    binding.configure(found)
    return binding
  }
  // Without configure() the native side finds the supervisor next to the addon, or through a real (process-start)
  // HUGR_OMNI_SUPERVISOR. A process.env write under Bun never reaches native code (H4), so nothing else works.
  const native = process.env.HUGR_OMNI_SUPERVISOR
  if (path.dirname(found.supervisor) === path.dirname(found.addon) || native === found.supervisor) return binding
  throw new Error(
    `hugr-omni: the supervisor ${found.supervisor} is not next to the addon ${found.addon}, and this hugr-omni has no configure().`,
  )
}

/**
 * Where the addon and the supervisor are, in this order: the paths given to configure(), then HUGR_OMNI_ADDON and
 * HUGR_OMNI_SUPERVISOR (CI), then the directory of an explicit addon, then next to realpath(process.execPath) (the
 * CLI), then process.resourcesPath/omni (the desktop), then this checkout's packages/omni/target/{release,debug}.
 * A non-explicit location counts only when it holds both files, so a release addon never pairs a debug supervisor.
 */
export function locate(): Found {
  const explicit = {
    addon: injected.addon ?? process.env.HUGR_OMNI_ADDON,
    supervisor: injected.supervisor ?? process.env.HUGR_OMNI_SUPERVISOR,
  }
  const missing = [explicit.addon, explicit.supervisor].filter((file) => file !== undefined && !existsSync(file))
  if (missing.length > 0) throw new Error(`hugr-omni: the configured file ${missing.join(" and ")} does not exist.`)
  const resources = "resourcesPath" in process && typeof process.resourcesPath === "string" ? process.resourcesPath : ""
  const target = path.join(import.meta.dirname, "..", "..", "omni", "target")
  const locations = [
    ...(explicit.addon ? [{ addon: explicit.addon, supervisor: sibling(explicit.addon, SUPERVISOR) }] : []),
    {
      addon: sibling(realpath(process.execPath), SHIPPED_ADDON),
      supervisor: sibling(realpath(process.execPath), SUPERVISOR),
    },
    ...(resources
      ? [{ addon: path.join(resources, "omni", SHIPPED_ADDON), supervisor: path.join(resources, "omni", SUPERVISOR) }]
      : []),
    ...["release", "debug"].map((profile) => ({
      addon: path.join(target, profile, BUILT_ADDON),
      supervisor: path.join(target, profile, SUPERVISOR),
    })),
  ]
  const pair = locations.find((entry) => existsSync(entry.addon) && existsSync(entry.supervisor))
  const addon = explicit.addon ?? pair?.addon
  const supervisor = explicit.supervisor ?? pair?.supervisor
  if (addon && supervisor) return { addon, supervisor }
  throw new Error(
    [
      `hugr-omni is required (OPENCODE_EXPERIMENTAL_OMNI_SPAWNER) but its ${addon ? "supervisor" : "addon"} was not found. Looked at:`,
      ...locations.map((entry) => `  ${entry.addon} + ${entry.supervisor}`),
      "Build it with `bun run omni:build`, or set HUGR_OMNI_ADDON and HUGR_OMNI_SUPERVISOR.",
    ].join("\n"),
  )
}

function sibling(file: string, name: string) {
  return path.join(path.dirname(file), name)
}

function realpath(file: string) {
  if (!existsSync(file)) return file
  return realpathSync(file)
}

const counters = { spawns: 0, delegations: 0 }
export type Counter = keyof typeof counters

/** Counts one spawn that omni ran, or one that was delegated to the legacy spawner (D-L1 positive control). */
export function count(kind: Counter) {
  counters[kind]++
}

export function snapshot() {
  return { ...counters }
}

/**
 * The positive control for a test run (D-L1): a run with the flag on that made no omni spawn proved nothing about
 * omni, and a strict run must not have delegated. Undefined means the run passes.
 */
export function verdict(mode: "off" | "on" | "strict", counts: { spawns: number; delegations: number }) {
  if (mode === "off") return
  if (counts.spawns === 0)
    return `OPENCODE_EXPERIMENTAL_OMNI_SPAWNER=${mode === "on" ? "1" : mode}, but this run made no omni spawn.`
  if (mode === "strict" && counts.delegations > 0)
    return `OPENCODE_EXPERIMENTAL_OMNI_SPAWNER=strict, but this run delegated ${counts.delegations} spawn(s) to legacy.`
}

/**
 * The environment of an omni child (D-L3), always used with inheritEnv:false: process.env, then `extra`, with
 * undefined values dropped and HUGR_OMNI_* removed from the final object. On Windows names are case-insensitive: a
 * later layer's `Path` replaces an earlier `PATH`, and only one key survives.
 */
export function childEnv(extra?: Record<string, string | undefined>) {
  const env: Record<string, string> = {}
  const names = new Map<string, string>()
  for (const layer of [process.env, extra ?? {}]) {
    for (const [key, value] of Object.entries(layer)) {
      const folded = process.platform === "win32" ? key.toUpperCase() : key
      const previous = names.get(folded)
      if (previous !== undefined) delete env[previous]
      names.delete(folded)
      if (value === undefined || key.toUpperCase().startsWith("HUGR_OMNI_")) continue
      names.set(folded, key)
      env[key] = value
    }
  }
  return env
}
