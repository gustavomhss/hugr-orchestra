export * as AuthoringStore from "./store"

import { createHash, randomUUID } from "node:crypto"
import { mkdirSync, readdirSync, statSync } from "node:fs"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { Clock, Context, Effect, Layer, Scope } from "effect"
import type { RelayAuthoring } from "@orchestra/schema/relay-authoring"
import type { RelaySprint } from "@orchestra/schema/relay-sprint"
import { RelayJson } from "../json"
import { AuthoringGraph } from "./graph"
import { connect } from "#sqlite"

// Documents, versions and scopes in `authoring.sqlite3` (`#sqlite`; relay_authoring/store.py; WP8). The same tables
// and row bodies as the Python store, so a Python-made database opens unchanged. There is no executions table: runs
// are durable events. A Python-made database keeps its own executions table; nothing here reads or drops it.
//
// Rows are returned as stored, as the Python store returns them: `AuthoringGraph.validate` is the gate, in the layer
// above, as in Python's application. Every operation is one synchronous block, so operations in this process never
// interleave; writes run in a BEGIN IMMEDIATE transaction, so a check and the write it guards are atomic across
// processes too (Python's deferred transaction is not).

export interface SaveInput {
  readonly body: Partial<RelayAuthoring.Document>
  readonly id?: string
  readonly createID?: string
  // Both guards answer 409 `version-conflict` on mismatch.
  readonly expectedVersion?: string
  readonly expectedChecksum?: string
}

export interface Interface {
  readonly documents: () => Effect.Effect<ReadonlyArray<RelayAuthoring.Document>>
  readonly get: (id: string) => Effect.Effect<RelayAuthoring.Document, AuthoringGraph.Refusal>
  readonly save: (input: SaveInput) => Effect.Effect<RelayAuthoring.Document, AuthoringGraph.Refusal>
  // Saves only when the ID is new.
  readonly seed: (id: string, body: Partial<RelayAuthoring.Document>) => Effect.Effect<void, AuthoringGraph.Refusal>
  readonly remove: (id: string) => Effect.Effect<void, AuthoringGraph.Refusal>
  readonly versions: (id: string) => Effect.Effect<ReadonlyArray<RelayAuthoring.Version>>
  readonly version: (id: string, versionID: string) => Effect.Effect<RelayAuthoring.Version, AuthoringGraph.Refusal>
  // `principal`, when given, is recorded as `publishedBy` or `unpublishedBy` (PARITY-EXCEPTIONS W14-1).
  readonly publish: (
    id: string,
    versionID: string,
    expectedChecksum?: string,
    principal?: string,
  ) => Effect.Effect<RelayAuthoring.Document, AuthoringGraph.Refusal>
  readonly unpublish: (
    id: string,
    expectedChecksum?: string,
    principal?: string,
  ) => Effect.Effect<RelayAuthoring.Document, AuthoringGraph.Refusal>
  readonly scopes: () => Effect.Effect<ReadonlyArray<RelayAuthoring.Scope>>
  readonly saveScope: (
    body: { readonly name: string; readonly description?: string },
    id?: string,
  ) => Effect.Effect<RelayAuthoring.Scope, AuthoringGraph.Refusal>
  readonly removeScope: (id: string) => Effect.Effect<void, AuthoringGraph.Refusal>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/relay/AuthoringStore") {}

// Opens `<dataDir>/authoring.sqlite3` scoped to one workspace (WAL, foreign keys on); closing the scope closes it.
export const open = (dataDir: string, workspaceID: string): Effect.Effect<Interface, never, Scope.Scope> =>
  Effect.gen(function* () {
    // Acquire and release stay synchronous: an async step in a release is dropped when the fiber is interrupted.
    const db = yield* Effect.acquireRelease(
      Effect.sync(() => {
        mkdirSync(dataDir, { recursive: true })
        return connect(path.join(dataDir, "authoring.sqlite3"))
      }),
      (db) => Effect.sync(() => db.close()),
    )
    yield* Effect.sync(() => {
      db.exec("PRAGMA journal_mode=WAL")
      db.exec("PRAGMA foreign_keys=ON")
      // sqlite3.connect's default 5 s timeout: another process's write is waited for, not failed.
      db.exec("PRAGMA busy_timeout=5000")
      db.exec(
        "CREATE TABLE IF NOT EXISTS documents(workspace TEXT, id TEXT, body TEXT NOT NULL, PRIMARY KEY(workspace,id))",
      )
      db.exec(
        "CREATE TABLE IF NOT EXISTS versions(workspace TEXT, document_id TEXT, id TEXT, body TEXT NOT NULL, PRIMARY KEY(workspace,id))",
      )
      db.exec(
        "CREATE TABLE IF NOT EXISTS scopes(workspace TEXT, id TEXT, body TEXT NOT NULL, PRIMARY KEY(workspace,id))",
      )
    })

    const row = <A>(table: "documents" | "versions" | "scopes", id: string): A => {
      const found = db.get<{ body: string }>(`SELECT body FROM ${table} WHERE workspace=? AND id=?`, workspaceID, id)
      return found ? JSON.parse(found.body) : AuthoringGraph.refuse("Resource not found", 404, "not-found")
    }
    const rows = <A>(sql: string, ...params: string[]): A[] =>
      db.all<{ body: string }>(sql, workspaceID, ...params).map((found) => JSON.parse(found.body))
    const put = (table: "documents" | "scopes", id: string, body: unknown) =>
      db.run(
        `INSERT INTO ${table}(workspace,id,body) VALUES(?,?,?) ON CONFLICT(workspace,id) DO UPDATE SET body=excluded.body`,
        workspaceID,
        id,
        dumps(body, false),
      )
    const drop = (table: "documents" | "scopes", id: string) =>
      db.run(`DELETE FROM ${table} WHERE workspace=? AND id=?`, workspaceID, id)
    const documents = () =>
      rows<RelayAuthoring.Document>("SELECT body FROM documents WHERE workspace=? ORDER BY rowid DESC")
    const scopes = () => rows<RelayAuthoring.Scope>("SELECT body FROM scopes WHERE workspace=? ORDER BY rowid")
    // The clock is read first; the transaction itself never yields.
    const write = <A>(body: (now: string) => A) =>
      Effect.flatMap(stamp, (now) => AuthoringGraph.refusing(Effect.sync(() => db.immediate(() => body(now)))))

    const save = (input: SaveInput, now: string) => {
      const previous = input.id ? row<RelayAuthoring.Document>("documents", input.id) : undefined
      if (previous) checkChecksum(previous, input.expectedChecksum)
      if (previous && input.expectedVersion !== undefined && previous.versionId !== input.expectedVersion)
        return AuthoringGraph.refuse(CHANGED, 409, "version-conflict")
      // Python's key order: the stored document's, then the given fields, then the defaults, then the save's own.
      const document: Record<string, unknown> = { ...previous }
      FIELDS.forEach((field) => {
        if (input.body[field] !== undefined) document[field] = structuredClone(input.body[field])
      })
      DEFAULTS.forEach((entry) => {
        if (!Object.hasOwn(document, entry[0])) document[entry[0]] = structuredClone(entry[1])
      })
      const id = input.id || input.createID || randomUUID()
      const versionId = randomUUID()
      Object.assign(document, {
        id,
        createdAt: previous ? previous.createdAt : now,
        updatedAt: now,
        versionId,
        versionCounter: (previous?.versionCounter ?? 0) + 1,
      })
      put("documents", id, document)
      db.run(
        "INSERT INTO versions(workspace,document_id,id,body) VALUES(?,?,?,?)",
        workspaceID,
        id,
        versionId,
        dumps({ ...document, workflowId: id }, false),
      )
      return document as unknown as RelayAuthoring.Document
    }

    return {
      documents: () => Effect.sync(documents),
      get: (id) => AuthoringGraph.refusing(Effect.sync(() => row<RelayAuthoring.Document>("documents", id))),
      save: (input) => write((now) => save(input, now)),
      seed: (id, body) =>
        write((now) => {
          if (db.get("SELECT 1 FROM documents WHERE workspace=? AND id=?", workspaceID, id)) return
          save({ body, createID: id }, now)
        }),
      remove: (id) =>
        write(() => {
          row("documents", id)
          drop("documents", id)
        }),
      versions: (id) =>
        Effect.sync(() =>
          rows<RelayAuthoring.Version>(
            "SELECT body FROM versions WHERE workspace=? AND document_id=? ORDER BY rowid DESC",
            id,
          ),
        ),
      version: (id, versionID) =>
        AuthoringGraph.refusing(
          Effect.sync(() => {
            const version = row<RelayAuthoring.Version>("versions", versionID)
            if (version.workflowId !== id) return AuthoringGraph.refuse("Version not found", 404, "not-found")
            return version
          }),
        ),
      publish: (id, versionID, expectedChecksum, principal) =>
        write((now) => {
          const document = row<RelayAuthoring.Document>("documents", id)
          checkChecksum(document, expectedChecksum)
          if (document.versionId !== versionID)
            return AuthoringGraph.refuse("The version changed before publishing", 409, "version-conflict")
          const published = {
            ...attribute(document, "publishedBy", principal),
            active: true,
            activeVersionId: versionID,
            updatedAt: now,
          }
          put("documents", id, published)
          return published
        }),
      unpublish: (id, expectedChecksum, principal) =>
        write((now) => {
          const document = row<RelayAuthoring.Document>("documents", id)
          checkChecksum(document, expectedChecksum)
          const unpublished = {
            ...attribute(document, "unpublishedBy", principal),
            active: false,
            activeVersionId: null,
            updatedAt: now,
          }
          put("documents", id, unpublished)
          return unpublished
        }),
      scopes: () => Effect.sync(scopes),
      saveScope: (body, id) => {
        const name = body.name.replace(STRIP, "")
        if (!name) return Effect.fail(refusal("A scope needs a name", 400, "invalid-request"))
        return write((now) => {
          const existing = id ? row<RelayAuthoring.Scope>("scopes", id) : undefined
          if (scopes().some((scope) => fold(scope.name) === fold(name) && scope.id !== id))
            return AuthoringGraph.refuse("This scope already exists", 409, "duplicate-scope")
          const scope = {
            id: id || randomUUID(),
            name,
            description: body.description ?? "",
            createdAt: existing ? existing.createdAt : now,
            updatedAt: now,
          }
          put("scopes", scope.id, scope)
          return scope
        })
      },
      // Python rewrites every document here; only the ones that held the scope change, so only they are rewritten.
      removeScope: (id) =>
        write(() => {
          row("scopes", id)
          drop("scopes", id)
          documents().forEach((document) => {
            const tags = document.tags.filter((tag) => (typeof tag === "object" && tag !== null ? tag.id : tag) !== id)
            if (tags.length !== document.tags.length) put("documents", document.id, { ...document, tags })
          })
        }),
    } satisfies Interface
  })

export const layer = (dataDir: string, workspaceID: string) => Layer.effect(Service, open(dataDir, workspaceID))

// sha256 of the document as `json.dumps(sort_keys=True, ensure_ascii=False)` encodes it (PARITY-EXCEPTIONS W8-1).
export const checksum = (document: unknown): string => createHash("sha256").update(dumps(document, true)).digest("hex")

// Owner decision R8 (2026-10-06): the shipped profiles and whether each may run. The other four check their work with
// Relay tool programs (`tools/*`) that are not ported yet; they are seeded so they can be read and edited.
export const PROFILES: ReadonlyMap<string, boolean> = new Map([
  ["design", false],
  ["planning", false],
  ["research-v2", false],
  ["spec-decompose", false],
  ["tdd_feature", true],
  ["wp-execute", true],
])

// packages/relay/profiles.
export const PROFILES_DIRECTORY = path.join(import.meta.dirname, "..", "..", "profiles")

/**
 * `seed_profiles`: every `*.sprint.json` in the directory, projected as "Relay · <name>" and seeded as `relay-<name>`,
 * in file-name order. Each seeded document is marked with `meta.relay.profile`, which `runnable` reads.
 */
export const seedProfiles = (
  store: Interface,
  directory = PROFILES_DIRECTORY,
): Effect.Effect<void, AuthoringGraph.Refusal> =>
  AuthoringGraph.refusing(Effect.sync(() => catalog(directory))).pipe(
    Effect.flatMap((names) =>
      Effect.forEach(
        names,
        (name) =>
          Effect.promise(() => readFile(path.join(directory, name + SUFFIX))).pipe(
            Effect.map((bytes) => decoder.decode(bytes)),
            Effect.flatMap(AuthoringGraph.loads),
            Effect.flatMap((sprint) => AuthoringGraph.project(`Relay · ${name}`, sprint as RelaySprint.Sprint)),
            Effect.flatMap((document) =>
              store.seed(`relay-${name}`, {
                ...document,
                meta: { ...document.meta, relay: { ...document.meta.relay, profile: name } },
              }),
            ),
          ),
        { discard: true },
      ),
    ),
  )

/**
 * Run admission: a document or version seeded from a profile that cannot run here is refused with 409
 * `profile-tools-missing`. Its profile is the seed's mark; a store Python seeded has no mark, so there a shipped
 * profile's `relay-<name>` ID names it. A mark this version does not know is refused too.
 */
export const runnable = (
  document: RelayAuthoring.Document | RelayAuthoring.Version,
): Effect.Effect<void, AuthoringGraph.Refusal> => {
  const seeded = document.id.startsWith("relay-") ? document.id.slice("relay-".length) : undefined
  const profile = document.meta.relay?.profile ?? (seeded !== undefined && PROFILES.has(seeded) ? seeded : undefined)
  if (profile === undefined || PROFILES.get(profile) === true) return Effect.void
  return Effect.fail(
    refusal(
      `The ${profile} profile checks its work with Relay tools that are not available yet. It can be edited, but it cannot run.`,
      409,
      "profile-tools-missing",
    ),
  )
}

const CHANGED = "The workflow changed. Reload it before saving."
// UTF-8 with U+FFFD for invalid bytes; a leading byte order mark is dropped.
const decoder = new TextDecoder()
const SUFFIX = ".sprint.json"
// The fields a save takes from its body, in the order Python assigns them.
const FIELDS = [
  "name",
  "description",
  "nodes",
  "connections",
  "tags",
  "meta",
  "isArchived",
  "active",
  "activeVersionId",
  "nodeGroups",
] as const satisfies ReadonlyArray<keyof RelayAuthoring.Document>
const DEFAULTS = [
  ["name", "New Relay workflow"],
  ["nodes", []],
  ["connections", {}],
  ["tags", []],
  ["meta", {}],
  ["active", false],
  ["activeVersionId", null],
  ["isArchived", false],
] as const
// `str.strip()`: what `str.isspace()` accepts. JS `trim` differs (U+001C–U+001F and U+0085 are space to Python, U+FEFF
// is not).
const SPACE = "[\\t\\n\\v\\f\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]"
const STRIP = new RegExp(`^${SPACE}+|${SPACE}+$`, "g")

// Python's `datetime.now(timezone.utc).isoformat()` with `Z`: six fraction digits, none when they are all zero.
const stamp = Effect.map(Clock.currentTimeMillis, (millis) => {
  const iso = new Date(millis).toISOString()
  return iso.endsWith(".000Z") ? iso.slice(0, -5) + "Z" : iso.slice(0, -1) + "000Z"
})

// Who made the latest publish or unpublish, replacing the other's mark. Python records neither (W14-1).
function attribute(
  document: RelayAuthoring.Document,
  mark: "publishedBy" | "unpublishedBy",
  principal: string | undefined,
): RelayAuthoring.Document {
  if (principal === undefined) return document
  const other = mark === "publishedBy" ? "unpublishedBy" : "publishedBy"
  return {
    ...(Object.fromEntries(Object.entries(document).filter((entry) => entry[0] !== other)) as RelayAuthoring.Document),
    [mark]: principal,
  }
}

function checkChecksum(document: RelayAuthoring.Document, expected: string | undefined) {
  if (expected !== undefined && expected !== checksum(document)) AuthoringGraph.refuse(CHANGED, 409, "version-conflict")
}

function refusal(message: string, status: number, code: string) {
  return new AuthoringGraph.Refusal({ status, code, message })
}

function catalog(directory: string) {
  if (!statSync(directory, { throwIfNoEntry: false })?.isDirectory())
    return AuthoringGraph.refuse("The installed Relay profile directory is unavailable", 503, "profiles-unavailable")
  // Python sorts the paths, suffix included.
  const names = readdirSync(directory)
    .filter((file) => file.endsWith(SUFFIX))
    .sort(byCodePoint)
    .map((file) => file.slice(0, -SUFFIX.length))
  if (!names.length)
    return AuthoringGraph.refuse("The installed Relay profile catalog is empty", 503, "profiles-unavailable")
  return names
}

/**
 * `str.casefold()` for comparing scope names. Lower, upper, lower folds ß with ss and the final sigma with sigma, as
 * full case folding does; the dotless ı is kept, because casefold keeps it apart from i (PARITY-EXCEPTIONS W8-2).
 */
function fold(text: string) {
  return text.replace(/[^ı]+/g, (run) => run.toLowerCase().toUpperCase().toLowerCase())
}

/**
 * `json.dumps(value, ensure_ascii=False, allow_nan=False)`, sorted by key when asked: Python's separators, string
 * escapes (JSON.stringify writes the same ones) and code point key order. A JS number has no int/float split: a safe
 * integer is written as an int and any other number in Python's float repr (PARITY-EXCEPTIONS W8-1).
 */
function dumps(value: unknown, sort: boolean): string {
  if (value === null) return "null"
  if (typeof value === "boolean" || typeof value === "string") return JSON.stringify(value)
  if (typeof value === "number") {
    if (Number.isSafeInteger(value)) return String(value)
    if (!Number.isFinite(value)) throw new RangeError("Out of range float values are not JSON compliant")
    return RelayJson.repr(new RelayJson.Float(String(value)))
  }
  if (Array.isArray(value))
    return `[${value.map((item) => (item === undefined ? "null" : dumps(item, sort))).join(", ")}]`
  if (typeof value !== "object") throw new TypeError(`Object of type ${typeof value} is not JSON serializable`)
  const members = Object.entries(value).filter((entry) => entry[1] !== undefined)
  const ordered = sort ? members.sort((left, right) => byCodePoint(left[0], right[0])) : members
  return `{${ordered.map((entry) => `${JSON.stringify(entry[0])}: ${dumps(entry[1], sort)}`).join(", ")}}`
}

// Python's string order: by code point, where JS compares UTF-16 units (an astral character sorts below U+FFFF there).
function byCodePoint(left: string, right: string) {
  const a = Array.from(left, (char) => char.codePointAt(0)!)
  const b = Array.from(right, (char) => char.codePointAt(0)!)
  const at = a.findIndex((point, index) => point !== b[index])
  if (at === -1) return a.length - b.length
  return b[at] === undefined ? 1 : a[at]! - b[at]!
}
