export * as MigrationBackup from "./migration-backup"

import { createHash, randomUUID } from "node:crypto"
import { lstat, mkdir, open as openFile, readFile, readdir, rename, rmdir, link, unlink } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import { Effect, Schema } from "effect"
import { sql } from "drizzle-orm"
import { EffectDrizzleSqlite } from "@orchestra/effect-drizzle-sqlite"
import { layer } from "#sqlite"

export type Event =
  | {
      kind: "slot-opened" | "slot-synced"
      slot: "owner" | "manifest"
      nextPhase: "owner" | "prepared" | "captured" | "ready" | "garbage" | "finalize"
    }
  | {
      kind: "prepared" | "captured" | "published" | "ready" | "garbage" | "committed" | "finalized"
      attemptID?: string
    }
export type Options = {
  observe?: (event: Event) => Effect.Effect<void, unknown>
  link?: (source: string, target: string) => Promise<void>
  remove?: (target: string) => Promise<void>
}

type Facts = { exists: boolean; applied: string[]; legacy: string[] }
type Plan = { baselineIDs: string[]; targetIDs: string[]; legacyIDs: string[] }
const Backup = Schema.Struct({ name: Schema.String, sha256: Schema.String, bytes: Schema.Number })
const Active = Schema.Struct({
  id: Schema.String,
  phase: Schema.Literals(["prepared", "captured", "ready"]),
  tempName: Schema.Literal("snapshot.sqlite"),
  finalName: Schema.String,
  baselineIDs: Schema.Array(Schema.String),
  targetIDs: Schema.Array(Schema.String),
  legacyIDs: Schema.Array(Schema.String),
  baselineIDsHash: Schema.String,
  targetIDsHash: Schema.String,
  backup: Schema.Union([Schema.Null, Backup]),
})
const Manifest = Schema.Struct({
  version: Schema.Literal(1),
  revision: Schema.Number,
  legacyAdopted: Schema.Literal(true),
  legacyPins: Schema.Array(Backup),
  recentAttempts: Schema.Array(
    Schema.Struct({ id: Schema.String, backup: Backup, outcome: Schema.Literals(["captured", "committed"]) }),
  ),
  currentBaselinePin: Schema.Union([Schema.Null, Schema.Struct({ id: Schema.String, ...Backup.fields })]),
  active: Schema.Union([Schema.Null, Active]),
  garbage: Schema.Array(Backup),
})
const Owner = Schema.Struct({ version: Schema.Literal(1), database: Schema.String })
type State = typeof Manifest.Type
type Copy = typeof Backup.Type
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
const sha = /^[a-f0-9]{64}$/
const makeDb = EffectDrizzleSqlite.makeWithDefaults()
const io = <A>(run: () => Promise<A>) => Effect.tryPromise({ try: run, catch: (cause) => cause })
const hash = (input: string | Uint8Array) => createHash("sha256").update(input).digest("hex")
const idsHash = (ids: readonly string[]) => hash(JSON.stringify(ids))
const missing = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"
const info = (file: string) =>
  lstat(file, { bigint: true }).catch((error: unknown) => {
    if (missing(error)) return undefined
    throw error
  })

/** All callers hold SQLite IMMEDIATE. The sidecar is a process-crash journal, not a power-loss receipt. */
export function open(file: string, needed: boolean, options: Options = {}) {
  return Effect.gen(function* () {
    const manifestFile = `${file}.migration-backups.json`
    const work = `${file}.migration-work`
    const stored = yield* io(() => info(manifestFile))
    const directory = yield* io(() => info(work))
    if (!needed && !stored && !directory) return
    if (stored && (!stored.isFile() || stored.isSymbolicLink()))
      return yield* Effect.fail(new Error("Invalid migration backup manifest file"))
    const state = stored
      ? yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Manifest))(
          yield* io(() => readFile(manifestFile, "utf8")),
        )
      : undefined
    if (state) yield* Effect.try({ try: () => validateState(file, state), catch: (cause) => cause })
    if (directory && (!directory.isDirectory() || directory.isSymbolicLink()))
      return yield* Effect.fail(new Error("Invalid migration backup control namespace"))
    if (!directory) yield* io(() => mkdir(work, { mode: 0o700 }))
    const session = new Session(
      file,
      state ?? {
        version: 1,
        revision: 0,
        legacyAdopted: true,
        legacyPins: [],
        recentAttempts: [],
        currentBaselinePin: null,
        active: null,
        garbage: [],
      },
      options,
    )
    yield* session.initialize(!!state)
    if (!state) {
      const names = (yield* io(() => readdir(dirname(file))))
        .filter((name) => name.startsWith(`${basename(file)}.backup-`))
        .sort()
      const pins = yield* Effect.forEach(names, (name) => session.inspect(name, true))
      session.state = { ...session.state, legacyPins: pins }
      // The first prepared publication adopts these pins atomically, before allocating a snapshot.
    }
    yield* session.validateFiles()
    return session
  })
}

class Session {
  readonly work: string
  readonly manifestFile: string
  constructor(
    readonly file: string,
    public state: State,
    readonly options: Options,
  ) {
    this.work = `${file}.migration-work`
    this.manifestFile = `${file}.migration-backups.json`
  }

  get attemptID() {
    return this.state.active?.id
  }
  observe(event: Event) {
    return this.options.observe?.(event) ?? Effect.void
  }

  initialize(hasManifest: boolean) {
    const self = this
    return Effect.gen(function* () {
      const entries = yield* io(() => readdir(self.work))
      const ownerFile = join(self.work, "owner.json")
      const owner = yield* io(() => info(ownerFile))
      if (!owner) {
        if (hasManifest || entries.some((name) => name !== "owner.pending"))
          return yield* Effect.fail(new Error("Unowned migration backup namespace"))
        const pending = yield* io(() => info(join(self.work, "owner.pending")))
        if (pending) {
          if (!pending.isFile() || pending.isSymbolicLink())
            return yield* Effect.fail(new Error("Invalid pending migration owner"))
          const marker = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Owner))(
            yield* io(() => readFile(join(self.work, "owner.pending"), "utf8")),
          )
          if (marker.database !== basename(self.file))
            return yield* Effect.fail(new Error("Migration owner identity mismatch"))
          yield* io(() => rename(join(self.work, "owner.pending"), ownerFile))
          yield* io(() => syncDirectory(self.work))
        }
        if (!pending) yield* self.publishJSON("owner", "owner", { version: 1, database: basename(self.file) })
      }
      if (owner && (!owner.isFile() || owner.isSymbolicLink()))
        return yield* Effect.fail(new Error("Invalid migration owner marker"))
      const marker = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Owner))(
        yield* io(() => readFile(ownerFile, "utf8")),
      )
      if (marker.database !== basename(self.file))
        return yield* Effect.fail(new Error("Migration owner identity mismatch"))
      // Only a valid committed owner reserves these two fixed publication slots.
      for (const slot of ["owner.pending", "manifest.pending"]) {
        const pending = yield* io(() => info(join(self.work, slot)))
        if (!pending) continue
        if (!pending.isFile() || pending.isSymbolicLink())
          return yield* Effect.fail(new Error("Invalid migration publication slot"))
      }
      yield* self.validateNamespace()
      for (const slot of ["owner.pending", "manifest.pending"]) {
        if (yield* io(() => info(join(self.work, slot)))) yield* self.remove(join(self.work, slot))
      }
    })
  }

  validateNamespace() {
    const self = this
    return Effect.gen(function* () {
      const entries = yield* io(() => readdir(self.work, { withFileTypes: true }))
      for (const entry of entries) {
        if (entry.isSymbolicLink()) return yield* Effect.fail(new Error("Symlink in migration backup namespace"))
        if (["owner.json", "owner.pending", "manifest.pending"].includes(entry.name) && entry.isFile()) continue
        if (!entry.isDirectory() || entry.name !== self.state.active?.id)
          return yield* Effect.fail(new Error("Unknown migration backup namespace entry"))
        const children = yield* io(() => readdir(join(self.work, entry.name), { withFileTypes: true }))
        if (children.some((child) => child.name !== "snapshot.sqlite" || !child.isFile() || child.isSymbolicLink()))
          return yield* Effect.fail(new Error("Unknown migration backup scratch entry"))
      }
    })
  }

  validateFiles() {
    const self = this
    return Effect.gen(function* () {
      const protectedCopies = self.protected()
      yield* Effect.forEach(protectedCopies, (copy) => self.verify(copy))
      const allowed = new Set([...protectedCopies, ...self.state.garbage].map((copy) => copy.name))
      if (self.state.active) allowed.add(self.state.active.finalName)
      const names = yield* io(() => readdir(dirname(self.file)))
      if (names.some((name) => name.startsWith(`${basename(self.file)}.backup-`) && !allowed.has(name)))
        return yield* Effect.fail(new Error("Untracked migration backup file"))
    })
  }

  protected() {
    return uniqueCopies([
      ...this.state.legacyPins,
      ...this.state.recentAttempts.map((entry) => entry.backup),
      ...(this.state.currentBaselinePin ? [this.state.currentBaselinePin] : []),
      ...(this.state.active?.phase === "ready" && this.state.active.backup ? [this.state.active.backup] : []),
    ])
  }

  inspect(name: string, sqlite = false) {
    const self = this
    return Effect.gen(function* () {
      const path = join(dirname(self.file), name)
      const stat = yield* io(() => info(path))
      if (!stat?.isFile() || stat.isSymbolicLink())
        return yield* Effect.fail(new Error(`Invalid migration backup: ${name}`))
      const bytes = yield* io(() => readFile(path))
      if (sqlite && (bytes.byteLength < 100 || bytes.subarray(0, 16).toString("binary") !== "SQLite format 3\0"))
        return yield* Effect.fail(new Error(`Invalid SQLite migration backup header: ${name}`))
      if (sqlite)
        yield* readonlyDatabase(path, (db) =>
          Effect.gen(function* () {
            const checked = yield* db.get<{ integrity_check: string }>("PRAGMA integrity_check")
            if (checked?.integrity_check !== "ok")
              return yield* Effect.fail(new Error(`Invalid SQLite migration backup: ${name}`))
          }),
        )
      return { name, sha256: hash(bytes), bytes: bytes.byteLength }
    })
  }

  verify(copy: Copy) {
    const self = this
    return Effect.gen(function* () {
      const actual = yield* self.inspect(copy.name)
      if (actual.sha256 !== copy.sha256 || actual.bytes !== copy.bytes)
        return yield* Effect.fail(new Error(`Migration backup bytes changed: ${copy.name}`))
    })
  }

  recover(facts: Facts) {
    const self = this
    return Effect.gen(function* () {
      yield* self.collect()
      const active = self.state.active
      if (!active) return
      if (active.phase === "prepared") {
        // A scratch file without a captured hash is incomplete even if SQLite happens to open it.
        yield* self.cleanScratch(active.id)
        yield* self.save({ ...self.state, active: null }, "finalize")
        return
      }
      if (active.phase === "captured") yield* self.publishCapture()
      const completed = self.state.active
      if (!completed || completed.phase !== "ready")
        return yield* Effect.fail(new Error("Missing ready migration capture"))
      const applied = new Set(facts.applied)
      const committed =
        facts.exists &&
        completed.targetIDs.every((id) => applied.has(id)) &&
        facts.legacy.every((id) => applied.has(id))
      yield* self.finish(committed ? "committed" : "captured")
    })
  }

  capture(plan: Plan) {
    const self = this
    return Effect.gen(function* () {
      yield* self.collect()
      const id = randomUUID()
      const active: typeof Active.Type = {
        ...plan,
        id,
        phase: "prepared",
        tempName: "snapshot.sqlite",
        finalName: `${basename(self.file)}.backup-${id}`,
        baselineIDsHash: idsHash(plan.baselineIDs),
        targetIDsHash: idsHash(plan.targetIDs),
        backup: null,
      }
      yield* self.save({ ...self.state, active }, "prepared")
      yield* self.observe({ kind: "prepared", attemptID: id })
      yield* io(() => mkdir(join(self.work, id), { mode: 0o700 }))
      const scratch = join(self.work, id, "snapshot.sqlite")
      // This is a separate real reader. Its scope closes before the caller performs any writer DML.
      yield* readonlyDatabase(self.file, (reader) => reader.run(sql`VACUUM INTO ${scratch}`))
      yield* io(async () => {
        // Windows FlushFileBuffers requires write access, even though no bytes are changed.
        const handle = await openFile(scratch, "r+")
        try {
          await handle.sync()
        } finally {
          await handle.close()
        }
      })
      yield* readonlyDatabase(scratch, (db) =>
        Effect.gen(function* () {
          if ((yield* db.get<{ integrity_check: string }>("PRAGMA integrity_check"))?.integrity_check !== "ok")
            return yield* Effect.fail(new Error("Invalid captured migration snapshot"))
        }),
      )
      const bytes = yield* io(() => readFile(scratch))
      const backup = { name: active.finalName, sha256: hash(bytes), bytes: bytes.byteLength }
      yield* self.save({ ...self.state, active: { ...active, phase: "captured", backup } }, "captured")
      yield* self.observe({ kind: "captured", attemptID: id })
      yield* self.publishCapture()
    })
  }

  publishCapture() {
    const self = this
    return Effect.gen(function* () {
      const active = self.state.active
      if (!active || active.phase !== "captured" || !active.backup)
        return yield* Effect.fail(new Error("Missing captured migration snapshot"))
      const scratch = join(self.work, active.id, "snapshot.sqlite")
      const source = yield* io(() => info(scratch))
      if (!source?.isFile() || source.isSymbolicLink())
        return yield* Effect.fail(new Error("Missing captured migration scratch"))
      const scratchBytes = yield* io(() => readFile(scratch))
      if (scratchBytes.byteLength !== active.backup.bytes || hash(scratchBytes) !== active.backup.sha256)
        return yield* Effect.fail(new Error("Captured migration scratch changed"))
      const final = join(dirname(self.file), active.finalName)
      const published = yield* io(() => info(final))
      if (published) {
        // Existence/hash alone cannot prove this process published it. Require the recorded scratch hardlink.
        if (
          !published.isFile() ||
          published.isSymbolicLink() ||
          published.ino === 0n ||
          source.ino !== published.ino ||
          source.dev !== published.dev
        )
          return yield* Effect.fail(new Error("Migration backup publication conflict (EEXIST)"))
        yield* self.verify(active.backup)
      }
      if (!published) {
        yield* io(() => (self.options.link ?? link)(scratch, final))
        yield* io(() => syncDirectory(dirname(self.file)))
        yield* self.observe({ kind: "published", attemptID: active.id })
      }
      yield* self.save(
        {
          ...self.state,
          active: { ...active, phase: "ready" },
          currentBaselinePin: { id: active.id, ...active.backup },
        },
        "ready",
      )
      yield* self.observe({ kind: "ready", attemptID: active.id })
    })
  }

  finish(outcome: "captured" | "committed") {
    const self = this
    return Effect.gen(function* () {
      const active = self.state.active
      if (!active?.backup) return yield* Effect.fail(new Error("Missing migration backup for finalization"))
      yield* self.cleanScratch(active.id)
      const attempts = [
        ...self.state.recentAttempts.filter((entry) => entry.id !== active.id),
        { id: active.id, backup: active.backup, outcome },
      ]
      const recentAttempts = attempts.slice(-3)
      const protectedNames = new Set([
        ...self.state.legacyPins.map((copy) => copy.name),
        ...recentAttempts.map((entry) => entry.backup.name),
        ...(self.state.currentBaselinePin ? [self.state.currentBaselinePin.name] : []),
      ])
      const garbage = uniqueCopies([
        ...self.state.garbage,
        ...attempts.slice(0, -3).map((entry) => entry.backup),
      ]).filter((copy) => !protectedNames.has(copy.name))
      yield* self.save(
        { ...self.state, active: null, recentAttempts, garbage },
        garbage.length ? "garbage" : "finalize",
      )
      yield* self.collect()
      if (outcome === "committed") yield* self.observe({ kind: "finalized", attemptID: active.id })
    })
  }

  collect() {
    const self = this
    return Effect.gen(function* () {
      if (!self.state.garbage.length) return
      yield* self.observe({ kind: "garbage", attemptID: self.state.active?.id })
      const protectedNames = new Set(self.protected().map((copy) => copy.name))
      for (const copy of self.state.garbage) {
        if (protectedNames.has(copy.name))
          return yield* Effect.fail(new Error("Protected migration backup in garbage plan"))
        if (!(yield* io(() => info(join(dirname(self.file), copy.name))))) continue
        yield* self.verify(copy)
        yield* self.remove(join(dirname(self.file), copy.name))
      }
      yield* io(() => syncDirectory(dirname(self.file)))
      yield* self.save({ ...self.state, garbage: [] }, "garbage")
    })
  }

  cleanScratch(id: string) {
    const self = this
    return Effect.gen(function* () {
      const directory = join(self.work, id)
      if (!(yield* io(() => info(directory)))) return
      // Revalidate immediately before deleting; authority is limited to the recorded UUID's fixed file.
      yield* self.validateNamespace()
      const scratch = join(directory, "snapshot.sqlite")
      if (yield* io(() => info(scratch))) yield* self.remove(scratch)
      yield* io(() => rmdir(directory))
      yield* io(() => syncDirectory(self.work))
    })
  }

  remove(file: string) {
    return io(() => (this.options.remove ?? unlink)(file))
  }

  save(state: State, phase: "prepared" | "captured" | "ready" | "garbage" | "finalize") {
    const self = this
    return Effect.gen(function* () {
      const next = { ...state, revision: self.state.revision + 1 }
      yield* Effect.try({ try: () => validateState(self.file, next), catch: (cause) => cause })
      yield* self.publishJSON("manifest", phase, next)
      self.state = next
    })
  }

  publishJSON(
    slot: "owner" | "manifest",
    nextPhase: "owner" | "prepared" | "captured" | "ready" | "garbage" | "finalize",
    value: unknown,
  ) {
    const self = this
    return Effect.gen(function* () {
      const temporary = join(self.work, `${slot}.pending`)
      yield* Effect.acquireUseRelease(
        io(() => openFile(temporary, "wx", 0o600)),
        (handle) =>
          Effect.gen(function* () {
            yield* self.observe({ kind: "slot-opened", slot, nextPhase })
            yield* io(async () => {
              await handle.writeFile(JSON.stringify(value))
              await handle.sync()
            })
          }),
        (handle) => io(() => handle.close()).pipe(Effect.orDie),
      )
      yield* self.observe({ kind: "slot-synced", slot, nextPhase })
      yield* io(() => rename(temporary, slot === "owner" ? join(self.work, "owner.json") : self.manifestFile))
      yield* io(() => syncDirectory(slot === "owner" ? self.work : dirname(self.file)))
    })
  }
}

function readonlyDatabase<A, E>(filename: string, body: (db: Effect.Success<typeof makeDb>) => Effect.Effect<A, E>) {
  return Effect.gen(function* () {
    return yield* body(yield* makeDb)
  }).pipe(
    Effect.provide(layer({ filename, readonly: true, readwrite: false, create: false, disableWAL: true })),
    Effect.scoped,
  )
}

function uniqueCopies(copies: readonly Copy[]) {
  return [...new Map(copies.map((copy) => [copy.name, copy])).values()]
}

async function syncDirectory(path: string) {
  // Windows does not support opening directories for fsync. File sync and atomic rename still bound process crashes.
  if (process.platform === "win32") return
  const handle = await openFile(path, "r")
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}

function validateState(file: string, state: State) {
  if (!Number.isSafeInteger(state.revision) || state.revision < 0 || state.recentAttempts.length > 3)
    throw new Error("Invalid migration backup manifest revision or ring")
  const prefix = `${basename(file)}.backup-`
  const copies = [
    ...state.legacyPins,
    ...state.recentAttempts.map((entry) => entry.backup),
    ...state.garbage,
    ...(state.currentBaselinePin ? [state.currentBaselinePin] : []),
    ...(state.active?.backup ? [state.active.backup] : []),
  ]
  for (const copy of copies) {
    if (
      basename(copy.name) !== copy.name ||
      copy.name.includes("\\") ||
      !copy.name.startsWith(prefix) ||
      !sha.test(copy.sha256) ||
      !Number.isSafeInteger(copy.bytes) ||
      copy.bytes <= 0
    )
      throw new Error("Invalid migration backup reference")
    if (
      copies.some((other) => other.name === copy.name && (other.sha256 !== copy.sha256 || other.bytes !== copy.bytes))
    )
      throw new Error("Conflicting migration backup references")
  }
  for (const entry of [...state.recentAttempts, ...(state.currentBaselinePin ? [state.currentBaselinePin] : [])]) {
    const name = "backup" in entry ? entry.backup.name : entry.name
    if (!uuid.test(entry.id) || name !== `${prefix}${entry.id}`)
      throw new Error("Invalid migration backup attempt reference")
  }
  const active = state.active
  if (!active) return
  if (
    !uuid.test(active.id) ||
    active.finalName !== `${prefix}${active.id}` ||
    (active.phase === "prepared") !== (active.backup === null) ||
    (active.backup && active.backup.name !== active.finalName)
  )
    throw new Error("Invalid active migration capture")
  for (const ids of [active.baselineIDs, active.targetIDs, active.legacyIDs]) {
    if (ids.some((id) => !id.length) || JSON.stringify(ids) !== JSON.stringify([...new Set(ids)].sort()))
      throw new Error("Invalid migration backup journal facts")
  }
  if (
    active.baselineIDsHash !== idsHash(active.baselineIDs) ||
    active.targetIDsHash !== idsHash(active.targetIDs) ||
    [...active.baselineIDs, ...active.legacyIDs].some((id) => !active.targetIDs.includes(id))
  )
    throw new Error("Invalid migration backup journal hashes")
  if (active.phase === "ready" && state.currentBaselinePin?.name !== active.finalName)
    throw new Error("Ready migration capture has no baseline pin")
}
