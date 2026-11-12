export * as ReviewRustsecDb from "./rustsec-db"

import { lstat } from "node:fs/promises"
import path from "node:path"
import { Context, Effect, Option, Schema } from "effect"
import { Global } from "../global"
import { ReviewBoundedFile } from "./bounded-file"
import { ReviewCargoAuditFacts } from "./cargo-audit-facts"

export type State = { readonly dir: string; readonly revision: string; readonly committedAt: string; readonly refreshedAt: string }
export const Root = Context.Reference<string>("@orchestra/ReviewRustsecDb/Root", { defaultValue: () => path.join(Global.Path.cache, "rustsec") })
export const BeforeRead = Context.Reference<(file: string) => Effect.Effect<void>>("@orchestra/ReviewRustsecDb/BeforeRead", { defaultValue: () => () => Effect.void })

const POINTER_LIMIT = 4096
const GENERATION = /^gen-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const RFC3339 = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/

type Current = { ok: true; state: State } | { ok: false; status: "not-run" | "acquisition-error"; reason: string }
type Meta = { readonly generation: string; readonly revision: string; readonly committedAt: string; readonly refreshedAt: string }
type Placement = { ok: true; dir: string } | { ok: false; token: "symlink" | "path-outside" | "unreadable" }

// Age is the stored commit/refresh metadata. Directory mtime is never consulted.
export const current: () => Effect.Effect<Current> = () =>
  Effect.gen(function* () {
    const root = yield* Root
    const beforeRead = yield* BeforeRead
    const pointer = yield* ReviewBoundedFile.read(root, "current.json", POINTER_LIMIT, beforeRead)
    if (!pointer.ok) return pointer.reason === "missing" ? absent() : failure(token(pointer.reason))
    const meta = decodeMeta(pointer.bytes)
    if (!meta) return failure("metadata-invalid")
    const generation = generationClass(meta.generation)
    if (generation !== "ok") return failure(generation)
    const placed = yield* Effect.promise(() => directories(root, [meta.generation]))
    if (!placed.ok) return failure(placed.token)
    const marker = yield* ReviewBoundedFile.read(root, `${meta.generation}/manifest.json`, POINTER_LIMIT, beforeRead)
    if (!marker.ok) return failure(token(marker.reason))
    const marked = decodeMeta(marker.bytes)
    if (!marked) return failure("metadata-invalid")
    if (!same(meta, marked)) return failure("marker-mismatch")
    const db = yield* Effect.promise(() => published(root, meta.generation))
    if (!db.ok) return failure(db.token)
    return {
      ok: true,
      state: { dir: db.dir, revision: meta.revision, committedAt: meta.committedAt, refreshedAt: meta.refreshedAt },
    }
  })

function absent(): Current {
  return { ok: false, status: "not-run", reason: ReviewCargoAuditFacts.DATABASE_ABSENT }
}

function failure(token: string): Current {
  return { ok: false, status: "acquisition-error", reason: `rustsec database unavailable: ${token}` }
}

// Reader reasons stay in the frozen DB token set. A swapped leaf/parent has no separate token; the suite names that refusal symlink. A directory, fifo, or device is unreadable.
function token(reason: ReviewBoundedFile.Reason) {
  switch (reason) {
    case "symlink":
    case "path-outside":
    case "nofollow-unavailable":
    case "unreadable":
      return reason
    case "not-file":
      return "unreadable"
    case "changed":
      return "symlink"
    case "missing":
    case "too-large":
      return "metadata-invalid"
  }
}

function decodeMeta(bytes: Uint8Array) {
  const text = utf8(bytes)
  if (text === undefined) return undefined
  return parseMeta(text)
}

function utf8(bytes: Uint8Array) {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes)
  } catch {
    return undefined
  }
}

function parseMeta(text: string): Meta | undefined {
  const decoded = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(text)
  if (Option.isNone(decoded)) return undefined
  const value = decoded.value
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  if (keys.length !== 4) return undefined
  if (typeof record.generation !== "string" || typeof record.revision !== "string") return undefined
  if (typeof record.committedAt !== "string" || typeof record.refreshedAt !== "string") return undefined
  if (!/^[0-9a-f]{40}$/.test(record.revision)) return undefined
  if (!validDate(record.committedAt) || !validDate(record.refreshedAt)) return undefined
  return {
    generation: record.generation,
    revision: record.revision,
    committedAt: record.committedAt,
    refreshedAt: record.refreshedAt,
  }
}

function generationClass(value: string): "ok" | "path-outside" | "metadata-invalid" {
  if (value.includes("\0") || value.includes("/") || value.includes("\\") || value.includes("..") || path.isAbsolute(value) || path.win32.isAbsolute(value)) {
    return "path-outside"
  }
  if (!GENERATION.test(value)) return "metadata-invalid"
  return "ok"
}

export function validDate(value: string) {
  const match = RFC3339.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const second = Number(match[6])
  const offsetHour = match[9] ? Number(match[9]) : 0
  const offsetMinute = match[10] ? Number(match[10]) : 0
  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 60) return false
  if (offsetHour > 23 || offsetMinute > 59) return false
  const probe = new Date(Date.UTC(year, month - 1, day))
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day
}

function same(left: Meta, right: Meta) {
  return left.generation === right.generation && left.revision === right.revision && left.committedAt === right.committedAt && left.refreshedAt === right.refreshedAt
}

async function published(root: string, generation: string): Promise<Placement> {
  const db = await directories(root, [generation, "db"])
  if (!db.ok) return db
  const git = await directories(root, [generation, "db", ".git"])
  if (!git.ok) return git
  const crates = await directories(root, [generation, "db", "crates"])
  if (!crates.ok) return crates
  return db
}

async function directories(root: string, segments: readonly string[]): Promise<Placement> {
  const base = path.resolve(root)
  let cursor = base
  for (const segment of segments) {
    if (segment === "" || segment === "." || segment === ".." || segment.includes("\0") || segment.includes("/") || segment.includes("\\")) {
      return { ok: false, token: "path-outside" }
    }
    cursor = path.join(cursor, segment)
    if (!inside(base, cursor)) return { ok: false, token: "path-outside" }
    const item = await kind(cursor)
    if (item === "symlink") return { ok: false, token: "symlink" }
    if (item !== "dir") return { ok: false, token: "unreadable" }
  }
  return { ok: true, dir: cursor }
}

async function kind(file: string) {
  const info = await lstat(file).catch((error: NodeJS.ErrnoException) => error)
  if (info instanceof Error) return info.code === "ELOOP" ? "symlink" as const : "other" as const
  if (info.isSymbolicLink()) return "symlink" as const
  if (info.isDirectory()) return "dir" as const
  return "other" as const
}

function inside(root: string, file: string) {
  const relative = path.relative(root, file)
  return relative.length > 0 && !path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`)
}
