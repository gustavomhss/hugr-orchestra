import { expect } from "bun:test"
import path from "path"
import { createHash } from "crypto"
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "fs/promises"
import { tmpdir } from "os"
import { Effect } from "effect"
import { PinnedArtifact } from "../src/pinned-artifact"
import { BackendToolkit } from "../src/backend-toolkit"
import { BackendToolkitCassandra } from "../src/backend-toolkit/cassandra-metadata"
import pack from "../src/backend-toolkit/packs/gocqlx-schemagen"
import { it } from "./lib/effect"

const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")
const fixture = Effect.gen(function* () {
  const root = yield* Effect.acquireRelease(
    Effect.promise(async () => realpath(await mkdtemp(path.join(tmpdir(), "cassandra-backport-")))),
    (root) => Effect.promise(() => rm(root, { recursive: true, force: true })),
  )
  const original = path.join(root, "original")
  yield* PinnedArtifact.install(original, [pack.install.artifact, BackendToolkitCassandra.artifact])
  return { root, original }
})

it.live("verified upstream source gets exactly one catalog guard and a private driver replacement", () => Effect.gen(function* () {
  const f = yield* fixture
  const before = yield* Effect.promise(() => readFile(path.join(f.original, "driver/metadata_scylla.go")))
  const sum = yield* Effect.promise(() => readFile(path.join(f.original, "src/go.sum")))
  const directory = path.join(f.root, "owned")
  yield* PinnedArtifact.install(directory, [pack.install.artifact, BackendToolkitCassandra.artifact], BackendToolkitCassandra.prepare)
  const patched = yield* Effect.promise(() => readFile(path.join(directory, "driver/metadata_scylla.go")))
  expect(digest(before)).toBe(BackendToolkitCassandra.BEFORE)
  expect(digest(patched)).toBe("a9c4427039563b57c9b2597ceeb6aa603b50fb34c918823336aaca1b24d5d111")
  const anchor = '\tstmt = `SELECT * FROM system_schema.scylla_tables WHERE keyspace_name = ? AND table_name = ?`'
  // The entire existing Scylla path, not just its SELECT, is byte-for-byte unchanged.
  expect(patched.subarray(patched.indexOf(anchor))).toEqual(before.subarray(before.indexOf(anchor)))
  const text = patched.toString("utf8")
  expect(text).toContain('"system_schema", "scylla_tables")')
  expect(text).toContain('if err := iter.Close(); err != nil {\n\t\treturn nil, fmt.Errorf("error querying scylla table schema availability: %v", err)')
  expect(text).toContain("if !hasScyllaTables {\n\t\treturn tables, nil\n\t}")
  expect(yield* Effect.promise(() => readFile(path.join(directory, "src/go.sum")))).toEqual(sum)
  expect(digest(yield* Effect.promise(() => readFile(path.join(directory, "src/go.mod"))))).toBe("813bf43cbf7732310489d0cc6dbe046e144af305952c1d2ab3eeeaa4734aac40")
  expect(yield* Effect.promise(() => readFile(path.join(directory, "driver/LICENSE"), "utf8"))).toContain("Apache License")
  expect(yield* Effect.promise(() => readFile(path.join(directory, "driver/ORCHESTRA-MODIFICATIONS.txt"), "utf8"))).toContain("Orchestra cassandra1")
  expect(yield* Effect.promise(() => readFile(path.join(f.original, "driver/metadata_scylla.go")))).toEqual(before)
  expect((yield* BackendToolkitCassandra.prepare(directory).pipe(Effect.flip)).cause).toBe("compatibility:cassandra-metadata:generator-module-hash-mismatch")
}), 120_000)

it.live("source mutations, empty/malformed bytes and missing inputs produce typed HOLD before publication", () => Effect.gen(function* () {
  const f = yield* fixture
  const before = yield* Effect.promise(() => readFile(path.join(f.original, "driver/metadata_scylla.go")))
  for (const bytes of [Buffer.alloc(0), Buffer.from("package gocql\nnot Go"), Buffer.concat([before, Buffer.from("\n")]), BackendToolkitCassandra.patch(before)]) {
    const error = yield* Effect.try({ try: () => BackendToolkitCassandra.patch(bytes), catch: (error) => error }).pipe(Effect.flip)
    expect(error).toBeInstanceOf(PinnedArtifact.Failed)
    expect(error).toMatchObject({ cause: "compatibility:cassandra-metadata:driver-source-hash-mismatch" })
  }
  for (const [file, reason] of [["driver/metadata_scylla.go", "driver-source"], ["src/go.mod", "generator-module"], ["src/go.sum", "generator-sum"]]) {
    const staging = path.join(f.root, reason)
    yield* Effect.promise(() => cp(f.original, staging, { recursive: true }))
    const mod = yield* Effect.promise(() => readFile(path.join(staging, "src/go.mod")))
    yield* Effect.promise(() => writeFile(path.join(staging, file), ""))
    const error = yield* BackendToolkitCassandra.prepare(staging).pipe(Effect.flip)
    expect(error).toBeInstanceOf(PinnedArtifact.Failed)
    expect(error.cause).toBe(`compatibility:cassandra-metadata:${reason}-hash-mismatch`)
    if (file !== "src/go.mod") expect(yield* Effect.promise(() => readFile(path.join(staging, "src/go.mod")))).toEqual(mod)
    yield* Effect.promise(() => rm(path.join(staging, file)))
    expect((yield* BackendToolkitCassandra.prepare(staging).pipe(Effect.flip)).cause).toBe(`compatibility:cassandra-metadata:${reason}-unreadable`)
  }
  const failed = path.join(f.root, "failed-install")
  const error = yield* PinnedArtifact.install(failed, [pack.install.artifact, BackendToolkitCassandra.artifact], (staging) =>
    Effect.promise(() => writeFile(path.join(staging, "driver/metadata_scylla.go"), "")).pipe(Effect.andThen(BackendToolkitCassandra.prepare(staging))),
  ).pipe(Effect.flip)
  expect(error.cause).toBe("compatibility:cassandra-metadata:driver-source-hash-mismatch")
  expect(yield* PinnedArtifact.installed(failed)).toBe(false)
}), 120_000)

it.live("original 3.0.4 ready binary cannot satisfy owned cache identity", () => Effect.gen(function* () {
  const root = yield* Effect.acquireRelease(
    Effect.promise(() => mkdtemp(path.join(tmpdir(), "cassandra-cache-"))),
    (root) => Effect.promise(() => rm(root, { recursive: true, force: true })),
  )
  const old = path.join(root, "engines/gocqlx-schemagen/3.0.4-linux-x64")
  yield* Effect.promise(async () => {
    await mkdir(old, { recursive: true })
    await writeFile(path.join(old, ".complete"), "")
    await writeFile(path.join(old, "gocqlx-schemagen"), "old binary", { mode: 0o755 })
  })
  expect(yield* PinnedArtifact.installed(old)).toBe(true)
  expect(pack.version).toBe("3.0.4+orchestra.cassandra1")
  expect(pack.install.artifact.url).toEndWith("/v3.0.4.zip")
  expect(yield* BackendToolkit.status("gocqlx-schemagen").pipe(
    Effect.provideService(BackendToolkit.Root, root),
    Effect.provideService(BackendToolkit.Target, { target: "linux-x64" }),
  )).toMatchObject([{ version: "3.0.4+orchestra.cassandra1", status: "absent" }])
}))
