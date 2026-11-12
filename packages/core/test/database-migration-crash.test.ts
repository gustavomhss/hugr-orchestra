import { expect, test } from "bun:test"
import { readFile, readdir, writeFile, symlink, mkdir, unlink } from "node:fs/promises"
import { join, resolve } from "node:path"
import { Effect, Exit } from "effect"
import { sql } from "drizzle-orm"
import { Omni } from "../src/omni"
import { expectSpawn } from "./fixture/omni-expect"
import { DatabaseMigration } from "../src/database/migration"
import sessionMetadataMigration from "../src/database/migration/20260511173437_session-metadata"
import { tmpdir } from "./fixture/tmpdir"
import { run, migration, seed, ids, notes, snapshots, namedLegacy, inspectBackupFootprint } from "./fixture/migration-safety"

type Manifest = {
  version: number; legacyPins: { name: string }[]; recentAttempts: unknown[]
  active: null | { id: string; phase: string; tempName: string; finalName: string; baselineIDs: string[]; targetIDs: string[]; legacyIDs: string[]; baselineIDsHash: string; targetIDsHash: string; backup: null | { name: string; sha256: string; bytes: number } }
  currentBaselinePin: null | { id: string; name: string; sha256: string; bytes: number }
}
const manifest = (file: string) => readFile(`${file}.migration-backups.json`, "utf8").then((text) => JSON.parse(text) as Manifest)

async function crash(file: string, boundary: string, operation = "apply") {
  expectSpawn(import.meta.path)
  const omni = await Omni.load()
  const child = omni.spawn(process.execPath, [resolve(import.meta.dir, "fixture/migration-crash-worker.ts"), file, boundary, operation],
    { inheritEnv: false, env: Omni.childEnv(), stdin: "closed", text: true })
  Omni.count("spawns")
  const reached = Promise.withResolvers<void>()
  const output = { text: "" }
  const reading = (async () => {
    for await (const chunk of child.output) {
      output.text += chunk.data
      if (output.text.includes(`migration-crash-boundary:${boundary}\n`)) reached.resolve()
    }
  })()
  const timeout = Promise.withResolvers<string>()
  const timer = setTimeout(() => timeout.resolve("timeout"), 15000)
  try {
    const result = await Promise.race([
      reached.promise.then(() => "reached"), child.wait().then(() => "ended"), timeout.promise,
    ]).finally(() => clearTimeout(timer))
    if (result === "ended") {
      await reading
      expect((await child.wait()).success).toBe(true)
      expect(output.text).toContain("migration-worker-completed")
    }
    expect({ result, output: output.text.includes("migration-crash-boundary:") }).toEqual({ result: "reached", output: true })
    const exit = await child.stop({ graceMs: 0 })
    await reading
    expect(exit.success).toBe(false)
  } finally {
    clearTimeout(timer)
    await child.stop({ graceMs: 0 })
    await reading
  }
}

for (const phase of ["prepared", "captured", "ready", "garbage", "finalize"]) {
  for (const kind of ["slot-opened", "slot-synced"]) {
    test(`M5 process crash at ${kind} manifest ${phase} preserves SQL, pins and bounded fixed publication slot`, async () => {
      await using tmp = await tmpdir()
      const file = join(tmp.path, "source.db")
      await seed(file, ["000_base"])
      const sentinel = `${file}.manifest.pending.foreign`
      await writeFile(sentinel, "neighbor-sentinel")
      if (phase === "garbage") {
        for (const attempt of [1, 2, 3, 4]) {
          const outcome = await run(file, (db) => DatabaseMigration.apply(db, [migration("000_base"), {
            id: "001_A", up: () => Effect.fail(new Error(`prime-ring-${attempt}`)),
          }]).pipe(Effect.exit))
          expect(Exit.isFailure(outcome)).toBe(true)
          await Bun.sleep(2)
        }
      }
      await crash(file, `${kind}:manifest:${phase}`)
      expect(await notes(file)).toEqual(phase === "finalize" ? ["precious", "applied-once"] : ["precious"])
      const entries = await readdir(`${file}.migration-work`)
      expect(entries.filter((name) => name === "manifest.pending").length).toBeLessThanOrEqual(1)
      expect(entries.some((name) => name.endsWith(".tmp"))).toBe(false)
      await run(file, (db) => DatabaseMigration.apply(db, [migration("000_base"), migration("001_A", "applied-once")]))
      expect(await notes(file)).toEqual(["precious", "applied-once"])
      expect(await ids(file)).toEqual(["000_base", "001_A"])
      const state = await manifest(file)
      expect(state.version).toBe(1)
      expect(state.active).toBe(null)
      expect(state.recentAttempts.length).toBeLessThanOrEqual(3)
      expect((await inspectBackupFootprint(file)).directories).toEqual([])
      expect(await readFile(sentinel, "utf8")).toBe("neighbor-sentinel")
      expect((await readdir(`${file}.migration-work`)).filter((name) => name === "manifest.pending" || name.endsWith(".tmp"))).toEqual([])
    }, 30_000)
  }
}

for (const kind of ["slot-opened", "slot-synced"]) {
  test(`M5 owner bootstrap process crash ${kind} never authorizes SQL from a partial marker`, async () => {
    await using tmp = await tmpdir()
    const file = join(tmp.path, "source.db")
    await seed(file, ["000_base"])
    await crash(file, `${kind}:owner:owner`)
    expect(await notes(file)).toEqual(["precious"])
    const outcome = await run(file, (db) => DatabaseMigration.apply(db, [migration("000_base"), migration("001_A")]).pipe(Effect.exit))
    expect(Exit.isFailure(outcome)).toBe(kind === "slot-opened")
    expect(await notes(file)).toEqual(kind === "slot-opened" ? ["precious"] : ["precious", "001_A"])
    const entries = await readdir(`${file}.migration-work`)
    expect(entries.filter((name) => name === "owner.pending").length).toBeLessThanOrEqual(1)
    expect(entries.some((name) => name.endsWith(".tmp"))).toBe(false)
  }, 30_000)
}

test("M5 real EEXIST publication leaves foreign final bytes intact and refuses migration", async () => {
  await using tmp = await tmpdir()
  const file = join(tmp.path, "source.db")
  await seed(file, ["000_base"])
  const collision = { target: "" }
  const outcome = await run(file, (db) => DatabaseMigration.apply(db, [migration("000_base"), migration("001_A")], { backup: {
    observe: (event: { kind: string }) => event.kind !== "captured" ? Effect.void : Effect.promise(async () => {
      const state = await manifest(file)
      expect(state.active?.phase).toBe("captured")
      collision.target = join(tmp.path, state.active!.finalName)
      await writeFile(collision.target, "foreign-final-sentinel", { flag: "wx" })
    }),
  } }).pipe(Effect.exit))
  expect(Exit.isFailure(outcome)).toBe(true)
  expect(collision.target).not.toBe("")
  expect(await readFile(collision.target, "utf8")).toBe("foreign-final-sentinel")
  expect(await notes(file)).toEqual(["precious"])
  expect(await ids(file)).toEqual(["000_base"])
  const initial = await inspectBackupFootprint(file, [collision.target])
  const entries = (await readdir(`${file}.migration-work`, { recursive: true })).sort()
  const files = (await snapshots(file)).sort()
  for (const retry of [1, 2, 3]) {
    const observed: string[] = []
    const again = await run(file, (db) => DatabaseMigration.apply(db, [migration("000_base"), migration("001_A")], { backup: {
      observe: (event: { kind: string }) => Effect.sync(() => { observed.push(event.kind) }),
    } }).pipe(Effect.exit))
    expect(Exit.isFailure(again)).toBe(true)
    expect(observed.filter((kind) => ["prepared", "captured", "ready"].includes(kind))).toEqual([])
    const footprint = await inspectBackupFootprint(file, [collision.target])
    expect(footprint.state.active?.id).toBe(initial.state.active?.id)
    expect(footprint.state.active?.phase).toBe("captured")
    expect(footprint.state.currentBaselinePin).toEqual(initial.state.currentBaselinePin)
    expect(footprint.physicalBytes).toBe(initial.physicalBytes)
    expect((await readdir(`${file}.migration-work`, { recursive: true })).sort()).toEqual(entries)
    expect((await snapshots(file)).sort()).toEqual(files)
    expect(await readFile(collision.target, "utf8")).toBe("foreign-final-sentinel")
    expect(await ids(file)).toEqual(["000_base"])
  }
})

test("M5 unsupported link has no rename or copy fallback and never reaches SQL mutation", async () => {
  await using tmp = await tmpdir()
  const file = join(tmp.path, "source.db")
  await seed(file, ["000_base"])
  const observed = { calls: 0 }
  const outcome = await run(file, (db) => DatabaseMigration.apply(db, [migration("000_base"), migration("001_A")], { backup: {
    link: async () => { observed.calls += 1; throw Object.assign(new Error("unsupported-test-filesystem"), { code: "ENOTSUP" }) },
  } }).pipe(Effect.exit))
  expect(observed.calls).toBe(1)
  expect(Exit.isFailure(outcome)).toBe(true)
  expect(await notes(file)).toEqual(["precious"])
  expect(await ids(file)).toEqual(["000_base"])
})

test("M5 conversion-only COMMIT crash finalizes the complete legacy union without an empty-target shortcut", async () => {
  await using tmp = await tmpdir()
  const file = join(tmp.path, "source.db")
  await seed(file)
  await namedLegacy(file, [sessionMetadataMigration.id])
  await crash(file, "committed", "conversion")
  expect(await ids(file)).toEqual([sessionMetadataMigration.id])
  await run(file, (db) => db.run("INSERT INTO __drizzle_migrations(name,created_at) VALUES ('20260127222353_familiar_lady_ursula',1)"))
  await run(file, (db) => DatabaseMigration.applyOnly(db, []))
  expect(await ids(file)).toEqual(["20260127222353_familiar_lady_ursula", sessionMetadataMigration.id])
  expect((await manifest(file)).active).toBe(null)
})

test("M5 failed garbage unlink blocks retry allocation instead of growing backups", async () => {
  await using tmp = await tmpdir()
  const file = join(tmp.path, "source.db")
  await seed(file, ["000_base"])
  const inputs = [migration("000_base"), { id: "001_A", up: () => Effect.fail(new Error("migration-failed")) }]
  for (const attempt of [1, 2, 3, 4]) {
    await run(file, (db) => db.run(sql`INSERT INTO note VALUES (${`user-${attempt}`})`))
    await run(file, (db) => DatabaseMigration.apply(db, inputs).pipe(Effect.exit))
    await Bun.sleep(2)
  }
  const seen = { prepared: 0, removals: 0, garbage: 0 }
  const options = { backup: {
    observe: (event: { kind: string }) => Effect.sync(() => {
      if (event.kind === "prepared") seen.prepared += 1
      if (event.kind === "garbage") seen.garbage += 1
    }),
    remove: async (target: string) => {
      if (!target.startsWith(`${file}.backup-`)) return unlink(target)
      seen.removals += 1
      throw Object.assign(new Error("unlink-denied"), { code: "EACCES" })
    },
  } }
  const first = await run(file, (db) => DatabaseMigration.apply(db, inputs, options).pipe(Effect.exit))
  expect(Exit.isFailure(first)).toBe(true)
  expect(seen.removals).toBeGreaterThan(0)
  expect(seen.garbage).toBeGreaterThan(0)
  const prepared = seen.prepared
  const files = (await snapshots(file)).sort()
  for (const attempt of [1, 2, 3]) {
    await run(file, (db) => DatabaseMigration.apply(db, inputs, options).pipe(Effect.exit))
    expect(seen.prepared).toBe(prepared)
    expect((await snapshots(file)).sort()).toEqual(files)
    await inspectBackupFootprint(file, [], { allowPendingGarbage: true })
  }
  expect(await ids(file)).toEqual(["000_base"])
})

test("M5 observer failure after ready propagates before migration SQL", async () => {
  await using tmp = await tmpdir()
  const file = join(tmp.path, "source.db")
  await seed(file, ["000_base"])
  const seen = { ready: false }
  const outcome = await run(file, (db) => DatabaseMigration.apply(db, [migration("000_base"), migration("001_A")], { backup: {
    observe: (event: { kind: string }) => {
      if (event.kind !== "ready") return Effect.void
      seen.ready = true
      return Effect.fail(new Error("observer-denied"))
    },
  } }).pipe(Effect.exit))
  expect(seen.ready).toBe(true)
  expect(Exit.isFailure(outcome)).toBe(true)
  expect(await ids(file)).toEqual(["000_base"])
  expect(await notes(file)).toEqual(["precious"])
})

test("M5 malformed committed manifest fails closed without replacing its bytes", async () => {
  await using tmp = await tmpdir()
  const file = join(tmp.path, "source.db")
  await seed(file, ["000_base"])
  await writeFile(`${file}.migration-backups.json`, "{incomplete")
  const outcome = await run(file, (db) => DatabaseMigration.apply(db, [migration("000_base"), migration("001_A")]).pipe(Effect.exit))
  expect(Exit.isFailure(outcome)).toBe(true)
  expect(await readFile(`${file}.migration-backups.json`, "utf8")).toBe("{incomplete")
  expect(await ids(file)).toEqual(["000_base"])
  expect(await snapshots(file)).toEqual([])
})

test("M5 a symlinked private scratch namespace never authorizes external cleanup or migration", async () => {
  await using tmp = await tmpdir()
  const file = join(tmp.path, "source.db")
  await seed(file, ["000_base"])
  const external = join(tmp.path, "foreign")
  await mkdir(external)
  await writeFile(join(external, "sentinel"), "external-sentinel")
  await symlink(external, `${file}.migration-work`, process.platform === "win32" ? "junction" : "dir")
  const outcome = await run(file, (db) => DatabaseMigration.apply(db, [migration("000_base"), migration("001_A")]).pipe(Effect.exit))
  expect(Exit.isFailure(outcome)).toBe(true)
  expect(await readFile(join(external, "sentinel"), "utf8")).toBe("external-sentinel")
  expect(await ids(file)).toEqual(["000_base"])
  expect(await snapshots(file)).toEqual([])
})

test("M5 real ready backup records the frozen private shape and exact complete journal facts", async () => {
  await using tmp = await tmpdir()
  const file = join(tmp.path, "source.db")
  await seed(file, ["000_base"])
  const outcome = await run(file, (db) => DatabaseMigration.apply(db, [migration("000_base"), {
    id: "001_A", up: () => Effect.fail(new Error("keep-ready-for-recovery")),
  }]).pipe(Effect.exit))
  expect(Exit.isFailure(outcome)).toBe(true)
  const state = await manifest(file)
  expect(state.active?.phase).toBe("ready")
  expect(state.active?.tempName).toBe("snapshot.sqlite")
  expect(state.active?.baselineIDs).toEqual(["000_base"])
  expect(state.active?.targetIDs).toEqual(["000_base", "001_A"])
  expect(state.active?.legacyIDs).toEqual([])
  expect(state.active?.baselineIDsHash).toMatch(/^[a-f0-9]{64}$/)
  expect(state.active?.targetIDsHash).toMatch(/^[a-f0-9]{64}$/)
  expect(state.active?.backup?.sha256).toMatch(/^[a-f0-9]{64}$/)
  expect(state.active?.backup?.bytes).toBeGreaterThan(0)
  expect(state.currentBaselinePin?.name).toBe(state.active?.finalName)
  expect(JSON.parse(await readFile(join(`${file}.migration-work`, "owner.json"), "utf8"))).toEqual({ version: 1, database: "source.db" })
  expect((await readdir(`${file}.migration-work`)).filter((name) => name === "manifest.pending" || name === "owner.pending")).toEqual([])
})

test("M5 process crash after publication recovers its real hardlink then captures new live data", async () => {
  await using tmp = await tmpdir()
  const file = join(tmp.path, "source.db")
  await seed(file, ["000_base"])
  await crash(file, "published")
  expect((await manifest(file)).active?.phase).toBe("captured")
  const linked = await inspectBackupFootprint(file)
  expect(linked.physicalCopies).toBe(1)
  expect(linked.namedBytes).toBe(linked.physicalBytes * 2n)
  expect(await notes(file)).toEqual(["precious"])
  await run(file, (db) => db.run("INSERT INTO note VALUES ('between-crash-and-retry')"))
  await run(file, (db) => DatabaseMigration.apply(db, [migration("000_base"), migration("001_A", "applied-once")]))
  expect(await notes(file)).toEqual(["precious", "between-crash-and-retry", "applied-once"])
  const captured = await Promise.all((await snapshots(file)).map((name) => notes(join(tmp.path, name))))
  expect(captured.some((rows) => rows.includes("between-crash-and-retry") && !rows.includes("applied-once"))).toBe(true)
  expect((await manifest(file)).active).toBe(null)
  expect((await inspectBackupFootprint(file)).directories).toEqual([])
}, 30_000)

test("M5 process crash after SQL COMMIT finalizes without repeating the destructive attempt", async () => {
  await using tmp = await tmpdir()
  const file = join(tmp.path, "source.db")
  await seed(file, ["000_base"])
  await crash(file, "committed")
  expect(await ids(file)).toEqual(["000_base", "001_A"])
  expect(await notes(file)).toEqual(["precious", "applied-once"])
  await run(file, (db) => DatabaseMigration.apply(db, [migration("000_base"), migration("001_A", "applied-once")]))
  expect(await notes(file)).toEqual(["precious", "applied-once"])
  expect((await manifest(file)).active).toBe(null)
}, 30_000)


test("M5 a real process crash inside B rolls back earlier A and both journal writes", async () => {
  await using tmp = await tmpdir()
  const file = join(tmp.path, "source.db")
  await seed(file, ["000_base"])
  await crash(file, "sql-mutated")
  expect(await notes(file)).toEqual(["precious"])
  expect(await ids(file)).toEqual(["000_base"])
})

test("M5 four repeated captured-slot process crashes leave only the active UUID and no finalized scratch orphans", async () => {
  await using tmp = await tmpdir()
  const file = join(tmp.path, "source.db")
  await seed(file, ["000_base"])
  const sentinel = `${file}.manifest.pending.foreign`
  await writeFile(sentinel, "foreign-neighbor")
  for (const attempt of [1, 2, 3, 4]) {
    await crash(file, "slot-synced:manifest:captured")
    const footprint = await inspectBackupFootprint(file)
    expect(footprint.state.active?.phase).toBe("prepared")
    expect(footprint.directories).toEqual([footprint.state.active!.id])
    expect(footprint.physicalCopies).toBeLessThanOrEqual(footprint.state.legacyPins.length + 5)
    expect(await ids(file)).toEqual(["000_base"])
    expect(await readFile(sentinel, "utf8")).toBe("foreign-neighbor")
  }
  await run(file, (db) => DatabaseMigration.apply(db, [migration("000_base"), migration("001_A", "applied-once")]))
  const final = await inspectBackupFootprint(file)
  expect(final.state.active).toBe(null)
  expect(final.directories).toEqual([])
  expect(final.state.recentAttempts.length).toBeLessThanOrEqual(3)
  expect(await notes(file)).toEqual(["precious", "applied-once"])
}, 60_000)
