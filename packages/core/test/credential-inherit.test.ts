import { Database as Sqlite } from "bun:sqlite"
import { afterAll, afterEach, describe, expect, test } from "bun:test"
import { createHash } from "crypto"
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "fs"
import os from "os"
import path from "path"
import { Effect, Exit, Layer } from "effect"
import { Credential } from "@opencode-ai/core/credential"
import { Database } from "@opencode-ai/core/database/database"
import { Integration } from "@opencode-ai/core/integration"

const root = mkdtempSync(path.join(os.tmpdir(), "opencode-inherit-"))
afterAll(() => rmSync(root, { recursive: true, force: true }))

const openai = Integration.ID.make("openai")
const anthropic = Integration.ID.make("anthropic")
const key = (value: string) => Credential.Key.make({ type: "key", key: value })

let count = 0
const fixture = () => {
  const dir = path.join(root, `case-${count++}`)
  return { release: path.join(dir, "release", "opencode.db"), dev: path.join(dir, "dev", "opencode-dev.db") }
}

const run = <A, E>(
  filename: string,
  release: string | undefined,
  effect: (credentials: Credential.Interface) => Effect.Effect<A, E>,
) =>
  Effect.runPromise(
    Effect.gen(function* () {
      return yield* effect(yield* Credential.Service)
    }).pipe(Effect.provide(Credential.layerFrom(release).pipe(Layer.provide(Database.layerFromPath(filename))))),
  )

/** Creates a fully migrated release database, then closes it the way a clean exit leaves it. */
async function seedRelease(
  filename: string,
  seed: (credentials: Credential.Interface) => Effect.Effect<unknown>,
  wal: "kept" | "removed" = "kept",
) {
  require("fs").mkdirSync(path.dirname(filename), { recursive: true })
  await run(filename, undefined, seed)
  const db = new Sqlite(filename)
  db.run("PRAGMA wal_checkpoint(TRUNCATE)")
  db.close()
  if (wal === "removed") ["-wal", "-shm"].forEach((suffix) => rmSync(filename + suffix, { force: true }))
}

const createIn = (filename: string) => require("fs").mkdirSync(path.dirname(filename), { recursive: true })

/** Names, bytes, and mtimes of every file next to the release database. */
function snapshot(filename: string) {
  const dir = path.dirname(filename)
  return readdirSync(dir)
    .toSorted()
    .map((name) => ({
      name,
      hash: createHash("sha256")
        .update(readFileSync(path.join(dir, name)))
        .digest("hex"),
      mtime: statSync(path.join(dir, name)).mtimeMs,
    }))
}

const migrations = (filename: string) => {
  // Immutable: a plain read-only open fails on a WAL database without -wal.
  const db = new Sqlite(`file:${filename}?immutable=1`, { readonly: true })
  const ids = db
    .query<{ id: string }, []>("SELECT id FROM migration ORDER BY id")
    .all()
    .map((row) => row.id)
  db.close()
  return ids
}

const sleep = Effect.promise(() => Bun.sleep(5))

describe("Credential inheritance from the release database", () => {
  const env = process.env.OPENCODE_INHERIT_CREDENTIALS
  afterEach(() => {
    if (env === undefined) delete process.env.OPENCODE_INHERIT_CREDENTIALS
    else process.env.OPENCODE_INHERIT_CREDENTIALS = env
  })

  test("tests run isolated from the user's data directory", () => {
    expect(root.startsWith(os.tmpdir())).toBe(true)
    expect(process.env.OPENCODE_DB).toBe(":memory:")
    expect(env).toBe("0")
  })

  for (const wal of ["kept", "removed"] as const) {
    test(`an empty dev database resolves the release credential (wal ${wal})`, async () => {
      const paths = fixture()
      await seedRelease(
        paths.release,
        (credentials) =>
          Effect.gen(function* () {
            yield* credentials.create({ integrationID: openai, label: "old", value: key("sk-old") })
            yield* sleep
            yield* credentials.create({ integrationID: openai, label: "installed", value: key("sk-installed") })
          }),
        wal,
      )
      createIn(paths.dev)

      const result = await run(paths.dev, paths.release, (credentials) =>
        Effect.gen(function* () {
          const listed = yield* credentials.list(openai)
          return { listed, all: yield* credentials.all(), get: yield* credentials.get(listed[0]!.id) }
        }),
      )
      // Only the release database's active (newest) credential is visible.
      expect(result.listed.map((item) => [item.label, item.value])).toEqual([["installed", key("sk-installed")]])
      expect(result.all.map((item) => item.label)).toEqual(["installed"])
      expect(result.get?.label).toBe("installed")
    })
  }

  test("a credential in the dev database wins over the release one", async () => {
    const paths = fixture()
    await seedRelease(paths.release, (credentials) =>
      Effect.gen(function* () {
        yield* credentials.create({ integrationID: openai, label: "installed-openai", value: key("sk-installed") })
        yield* sleep
        yield* credentials.create({ integrationID: anthropic, label: "installed-anthropic", value: key("sk-ant") })
      }),
    )
    createIn(paths.dev)

    const result = await run(paths.dev, paths.release, (credentials) =>
      Effect.gen(function* () {
        yield* sleep
        yield* credentials.create({ integrationID: openai, label: "dev-openai", value: key("sk-dev") })
        return { openai: yield* credentials.list(openai), all: yield* credentials.all() }
      }),
    )
    expect(result.openai.map((item) => [item.label, item.value])).toEqual([["dev-openai", key("sk-dev")]])
    expect(result.all.map((item) => item.label).toSorted()).toEqual(["dev-openai", "installed-anthropic"])
  })

  test("a missing, locked, incompatible, or corrupt release database yields nothing without failing", async () => {
    const missing = fixture()
    createIn(missing.dev)

    const locked = fixture()
    createIn(locked.release)
    createIn(locked.dev)
    const holder = new Sqlite(locked.release, { create: true })
    holder.run("PRAGMA journal_mode = DELETE")
    holder.run("CREATE TABLE credential (id text PRIMARY KEY, integration_id text, label text, value text, time_created integer)")
    holder.run(
      `INSERT INTO credential VALUES ('cred_locked', 'openai', 'locked', '{"type":"key","key":"sk-locked"}', 1)`,
    )
    holder.run("BEGIN EXCLUSIVE")

    const incompatible = fixture()
    createIn(incompatible.release)
    createIn(incompatible.dev)
    const old = new Sqlite(incompatible.release, { create: true })
    // The first credential schema, before integration_id existed.
    old.run(
      "CREATE TABLE credential (id text PRIMARY KEY, connector_id text NOT NULL, method_id text NOT NULL, label text NOT NULL, value text NOT NULL, active integer DEFAULT false NOT NULL, time_created integer NOT NULL, time_updated integer NOT NULL)",
    )
    old.run(`INSERT INTO credential VALUES ('cred_old', 'openai', 'key', 'old', '{"type":"key","key":"sk-old"}', 1, 1, 1)`)
    old.close()

    const corrupt = fixture()
    createIn(corrupt.release)
    createIn(corrupt.dev)
    writeFileSync(corrupt.release, "not a database")

    const results = await Promise.all(
      [missing, locked, incompatible, corrupt].map((paths) =>
        run(paths.dev, paths.release, (credentials) =>
          Effect.gen(function* () {
            return [...(yield* credentials.list(openai)), ...(yield* credentials.all())]
          }),
        ),
      ),
    )
    holder.run("ROLLBACK")
    holder.close()
    expect(results).toEqual([[], [], [], []])
  })

  test("in-memory databases and OPENCODE_INHERIT_CREDENTIALS=0 stay isolated; =1 forces inheritance", async () => {
    const paths = fixture()
    await seedRelease(paths.release, (credentials) =>
      credentials.create({ integrationID: openai, label: "installed", value: key("sk-installed") }),
    )
    createIn(paths.dev)

    delete process.env.OPENCODE_INHERIT_CREDENTIALS
    expect(Credential.inheritedPath(":memory:", paths.release)).toBeUndefined()
    expect(Credential.inheritedPath(paths.release, paths.release)).toBeUndefined()
    expect(Credential.inheritedPath(paths.dev, paths.release)).toBe(paths.release)

    process.env.OPENCODE_INHERIT_CREDENTIALS = "1"
    expect(Credential.inheritedPath(":memory:", paths.release)).toBe(paths.release)

    process.env.OPENCODE_INHERIT_CREDENTIALS = "0"
    expect(Credential.inheritedPath(paths.dev, paths.release)).toBeUndefined()
    const disabled = await run(paths.dev, Credential.inheritedPath(paths.dev, paths.release), (credentials) =>
      credentials.list(openai),
    )
    expect(disabled).toEqual([])
  })

  test("dev writes never touch or migrate the release database", async () => {
    const paths = fixture()
    await seedRelease(
      paths.release,
      (credentials) =>
        Effect.gen(function* () {
          yield* credentials.create({ integrationID: openai, label: "installed", value: key("sk-installed") })
          yield* credentials.create({ integrationID: anthropic, label: "installed-ant", value: key("sk-ant") })
        }),
    )
    // Pretend the installed app predates the newest migration.
    const raw = new Sqlite(paths.release)
    const latest = raw.query<{ id: string }, []>("SELECT id FROM migration ORDER BY id DESC LIMIT 1").get()!.id
    raw.run("DELETE FROM migration WHERE id = ?", [latest])
    raw.run("PRAGMA wal_checkpoint(TRUNCATE)")
    raw.close()
    ;["-wal", "-shm"].forEach((suffix) => rmSync(paths.release + suffix, { force: true }))
    const migrated = migrations(paths.release)
    const before = snapshot(paths.release)
    createIn(paths.dev)

    const result = await run(paths.dev, paths.release, (credentials) =>
      Effect.gen(function* () {
        const inherited = (yield* credentials.list(openai))[0]!
        const ant = (yield* credentials.list(anthropic))[0]!
        const remove = yield* credentials.remove(inherited.id).pipe(Effect.exit)
        const relabel = yield* credentials.update(inherited.id, { label: "renamed" }).pipe(Effect.exit)
        yield* credentials.update(ant.id, { value: key("sk-rotated") })
        const created = yield* credentials.create({ integrationID: openai, label: "dev", value: key("sk-dev") })
        yield* credentials.update(created.id, { label: "dev-renamed" })
        yield* credentials.remove(created.id)
        return { inherited, remove, relabel, openai: yield* credentials.list(openai), ant: yield* credentials.list(anthropic) }
      }),
    )

    expect(Exit.isFailure(result.remove)).toBe(true)
    expect(String(result.remove)).toContain("Credential.InheritedError")
    expect(new Credential.InheritedError({ credentialID: result.inherited.id, source: paths.release }).message).toContain(
      `inherited read-only from ${paths.release}`,
    )
    expect(Exit.isFailure(result.relabel)).toBe(true)
    // The inherited credential is still visible after the refused logout.
    expect(result.openai.map((item) => item.label)).toEqual(["installed"])
    // A rotated token is stored in the dev database and wins from then on.
    expect(result.ant.map((item) => item.value)).toEqual([key("sk-rotated")])
    const dev = new Sqlite(paths.dev, { readonly: true })
    expect(dev.query("SELECT label FROM credential").all()).toEqual([{ label: "installed-ant" }])
    dev.close()

    expect(snapshot(paths.release)).toEqual(before)
    expect(migrations(paths.release)).toEqual(migrated)
    expect(migrated).not.toContain(latest)
  })

  test("the real wiring inherits through XDG data and OPENCODE_DB", async () => {
    const dir = path.join(root, "wiring")
    const data = path.join(dir, "share")
    const release = path.join(data, "opencode", "opencode.db")
    await seedRelease(release, (credentials) =>
      credentials.create({ integrationID: openai, label: "installed", value: key("sk-installed") }),
    )
    const script = `
      import { Effect } from "effect"
      import { Credential } from "@opencode-ai/core/credential"
      import { LayerNode } from "@opencode-ai/core/effect/layer-node"
      const labels = await Effect.runPromise(
        Effect.gen(function* () {
          return (yield* (yield* Credential.Service).all()).map((item) => item.label)
        }).pipe(Effect.provide(LayerNode.compile(Credential.node))),
      )
      console.log(JSON.stringify(labels))
    `
    const spawn = (extra: Record<string, string | undefined>) => {
      const env = {
        ...process.env,
        XDG_DATA_HOME: data,
        XDG_CACHE_HOME: path.join(dir, "cache"),
        XDG_CONFIG_HOME: path.join(dir, "config"),
        XDG_STATE_HOME: path.join(dir, "state"),
        OPENCODE_DB: path.join(dir, "dev.db"),
        ...extra,
      }
      const result = Bun.spawnSync(["bun", "-e", script], {
        cwd: path.join(import.meta.dir, ".."),
        env: Object.fromEntries(Object.entries(env).filter((entry) => entry[1] !== undefined)),
      })
      expect(result.exitCode).toBe(0)
      return JSON.parse(result.stdout.toString().trim().split("\n").at(-1)!)
    }
    expect(data.startsWith(os.tmpdir())).toBe(true)
    expect(spawn({ OPENCODE_INHERIT_CREDENTIALS: undefined })).toEqual(["installed"])
    expect(spawn({ OPENCODE_INHERIT_CREDENTIALS: "0" })).toEqual([])
    expect(spawn({ OPENCODE_INHERIT_CREDENTIALS: undefined, OPENCODE_DB: ":memory:" })).toEqual([])
  }, 240_000)
})
