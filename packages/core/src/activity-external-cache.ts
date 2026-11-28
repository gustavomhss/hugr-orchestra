export * as ActivityExternalCache from "./activity-external-cache"

import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { ActivityDisk } from "./activity-disk"
import { Schema } from "effect"

export type Declaration = { readonly name: string; readonly directory: string }

export type Row = {
  readonly id: string
  readonly name: string
  readonly owner: ""
  readonly useProof: "unproved"
  readonly unique: "not-collapsed"
  readonly attempt?: {
    readonly state: "complete" | "partial"
    readonly startedAt: number
    readonly sampledAt: number
    readonly issueCount: number
  }
  readonly logical?: { readonly bytes: number; readonly sampledAt: number }
}

export type Snapshot = {
  readonly instanceID: string
  readonly snapshotRevision: string
  readonly readAt: number
  readonly source: "node.fs.lstat"
  readonly coverage: "operator-declared-external-caches"
  readonly status: "unavailable" | "ready"
  readonly records: readonly Row[]
}

export type ReadResult =
  | { readonly status: "observed"; readonly snapshot: Snapshot }
  | { readonly status: "unknown" | "busy" }

export interface Inventory {
  readonly snapshot: () => Snapshot
  readonly read: (id: string) => Promise<ReadResult>
}

/** Parses a server operator declaration only. */
export function parseDeclaration(raw: string | undefined): readonly Declaration[] | undefined {
  if (raw === undefined || raw.length > 65536) return undefined
  const parsed = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(raw)
  if (parsed._tag === "None" || !Array.isArray(parsed.value) || parsed.value.length > 16) return undefined
  const names = new Set<string>()
  const directories = new Set<string>()
  const result: Declaration[] = []
  for (const item of parsed.value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return undefined
    if (Object.keys(item).length !== 2 || typeof item.name !== "string" || typeof item.directory !== "string") return undefined
    if (/[\x00-\x1f\x7f]/.test(item.name) || /[\x00-\x1f\x7f]/.test(item.directory)) return undefined
    const name = item.name.trim()
    if (!name || name.length > 80 || !path.isAbsolute(item.directory)) return undefined
    if (process.platform === "win32" && !/^[a-zA-Z]:[\\/]/.test(item.directory)) return undefined
    const directory = path.resolve(item.directory)
    const key = pathKey(directory)
    if (
      key === pathKey(path.parse(directory).root) ||
      key === pathKey(os.homedir()) ||
      key === pathKey(os.tmpdir()) ||
      (process.platform !== "win32" && key === pathKey("/tmp")) ||
      names.has(name) || directories.has(key)
    ) return undefined
    names.add(name)
    directories.add(key)
    result.push({ name, directory })
  }
  return result
}

/** One cache per server instance; snapshot does no filesystem work. */
export function make(declaration: readonly Declaration[] | undefined, measure?: typeof ActivityDisk.measure): Inventory {
  const instanceID = crypto.randomUUID()
  const records = (declaration ?? []).map((entry) => ({
    directory: entry.directory,
    row: { id: crypto.randomUUID(), name: entry.name, owner: "", useProof: "unproved", unique: "not-collapsed" } as Row,
  }))
  let revision = 0n
  let flight: { id: string; result: Promise<ReadResult> } | undefined
  const snapshot = (): Snapshot => structuredClone({
    instanceID,
    snapshotRevision: String(revision),
    readAt: Date.now(),
    source: "node.fs.lstat",
    coverage: "operator-declared-external-caches",
    status: declaration === undefined ? "unavailable" : "ready",
    records: records.map((record) => record.row),
  })
  return {
    snapshot,
    read(id) {
      const record = records.find((entry) => entry.row.id === id)
      if (!record) return Promise.resolve({ status: "unknown" })
      if (flight) return flight.id === id ? flight.result : Promise.resolve({ status: "busy" })
      const startedAt = Date.now()
      const partial = () => ({
        state: "partial" as const, startedAt, sampledAt: Date.now(), observedBytes: 0, entries: 0, issueCount: 1, issues: [],
      })
      const walk = async () => {
        if (measure) return measure(record.directory)
        const terminal = await fs.lstat(record.directory, { bigint: true }).catch(() => undefined)
        if (!terminal?.isDirectory() || terminal.isSymbolicLink()) return partial()
        const canonical = await fs.realpath(record.directory).catch(() => undefined)
        if (!canonical) return partial()
        const forbidden = [os.homedir(), os.tmpdir(), ...(process.platform === "win32" ? [] : ["/tmp"])]
        const aliases = await Promise.all(forbidden.map((value) => fs.realpath(value).catch(() => undefined)))
        const key = pathKey(canonical)
        if (
          key === pathKey(path.parse(canonical).root) ||
          forbidden.some((value) => pathKey(value) === key) ||
          aliases.some((value) => value !== undefined && pathKey(value) === key)
        ) return partial()
        return ActivityDisk.measure(canonical, { expectedRoot: { canonical, device: terminal.dev, inode: terminal.ino } })
      }
      const result: Promise<ReadResult> = walk().catch(partial).then((attempt) => {
        record.row = {
          ...record.row,
          attempt: { state: attempt.state, startedAt: attempt.startedAt, sampledAt: attempt.sampledAt, issueCount: attempt.issueCount },
          ...(attempt.state === "complete" ? { logical: { bytes: attempt.observedBytes, sampledAt: attempt.sampledAt } } : {}),
        }
        revision += 1n
        return { status: "observed", snapshot: snapshot() }
      }).finally(() => { flight = undefined })
      flight = { id, result }
      return result
    },
  }
}

function pathKey(value: string) {
  const resolved = path.resolve(value)
  return process.platform === "win32" ? resolved.toLowerCase() : resolved
}
