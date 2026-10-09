import { expect } from "bun:test"
import path from "path"
import { createHash } from "crypto"
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "fs/promises"
import { tmpdir } from "os"
import { createServer, type Socket } from "net"
import { Effect } from "effect"
import { PinnedArtifact } from "../src/pinned-artifact"
import { BackendToolkit } from "../src/backend-toolkit"
import { BackendToolkitCassandra } from "../src/backend-toolkit/cassandra-metadata"
import { BackendToolkitCassandraDialer } from "../src/backend-toolkit/cassandra-dialer"
import pack from "../src/backend-toolkit/packs/gocqlx-schemagen"
import { BackendToolkitTarget } from "../src/backend-toolkit/target"
import { BackendToolkitManifest } from "../src/backend-toolkit/manifest"
import { LayerNode } from "../src/effect/layer-node"
import { FSUtil } from "../src/fs-util"
import { TcpProxy } from "../src/tcp-proxy"
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
  const generator = yield* Effect.promise(() => readFile(path.join(f.original, "src/cmd/schemagen/schemagen.go")))
  const overlaid = yield* Effect.promise(() => readFile(path.join(directory, "src/cmd/schemagen/schemagen.go")))
  expect(digest(generator)).toBe(BackendToolkitCassandraDialer.BEFORE)
  expect(digest(overlaid)).toBe(BackendToolkitCassandraDialer.AFTER)
  expect(overlaid).toEqual(BackendToolkitCassandraDialer.patch(generator))
  expect(yield* Effect.promise(() => readFile(path.join(directory, "driver/LICENSE"), "utf8"))).toContain("Apache License")
  expect(yield* Effect.promise(() => readFile(path.join(directory, "driver/ORCHESTRA-MODIFICATIONS.txt"), "utf8"))).toContain("Orchestra cassandra1")
  expect(yield* Effect.promise(() => readFile(path.join(f.original, "driver/metadata_scylla.go")))).toEqual(before)
  expect((yield* BackendToolkitCassandra.prepare(directory).pipe(Effect.flip)).cause).toBe("compatibility:cassandra-metadata:generator-module-hash-mismatch")
}), 120_000)

it.live("source mutations, empty/malformed bytes and missing inputs produce typed HOLD before publication", () => Effect.gen(function* () {
  const f = yield* fixture
  const before = yield* Effect.promise(() => readFile(path.join(f.original, "driver/metadata_scylla.go")))
  const generator = yield* Effect.promise(() => readFile(path.join(f.original, "src/cmd/schemagen/schemagen.go")))
  for (const bytes of [Buffer.alloc(0), Buffer.from("package main\nnot Go"), Buffer.concat([generator, Buffer.from("\n")]), BackendToolkitCassandraDialer.patch(generator)]) {
    const error = yield* Effect.try({ try: () => BackendToolkitCassandraDialer.patch(bytes), catch: (error) => error }).pipe(Effect.flip)
    expect(error).toBeInstanceOf(PinnedArtifact.Failed)
    expect(error).toMatchObject({ cause: "compatibility:cassandra-dialer:generator-source-hash-mismatch" })
  }
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

it.live("original or cassandra1 ready binaries cannot satisfy cassandra2 cache identity", () => Effect.gen(function* () {
  const root = yield* Effect.acquireRelease(
    Effect.promise(() => mkdtemp(path.join(tmpdir(), "cassandra-cache-"))),
    (root) => Effect.promise(async () => {
      // Go's downloaded module directories are readonly by default; only this disposable install is made removable.
      if (process.platform !== "win32") {
        const child = Bun.spawn(["chmod", "-R", "u+w", root], { stdout: "ignore", stderr: "inherit" })
        if (await child.exited !== 0) throw new Error("cannot clean private Go cache")
      }
      await rm(root, { recursive: true, force: true })
    }),
  )
  const host = BackendToolkitTarget.detect()
  if (!("target" in host)) throw new Error(`unsupported host: ${host.unsupported}`)
  const old = path.join(root, `engines/gocqlx-schemagen/3.0.4-${host.target}`)
  const previous = path.join(root, `engines/gocqlx-schemagen/3.0.4+orchestra.cassandra1-${host.target}`)
  yield* Effect.promise(async () => {
    await mkdir(old, { recursive: true })
    await writeFile(path.join(old, ".complete"), "")
    await writeFile(path.join(old, "gocqlx-schemagen"), "old binary", { mode: 0o755 })
    await mkdir(previous, { recursive: true })
    await writeFile(path.join(previous, ".complete"), "")
    await writeFile(path.join(previous, "gocqlx-schemagen"), "previous binary", { mode: 0o755 })
  })
  expect(yield* PinnedArtifact.installed(old)).toBe(true)
  expect(yield* PinnedArtifact.installed(previous)).toBe(true)
  expect(pack.version).toBe("3.0.4+orchestra.cassandra2")
  expect(pack.install.artifact.url).toEndWith("/v3.0.4.zip")
  expect(yield* BackendToolkit.status("gocqlx-schemagen").pipe(
    Effect.provideService(BackendToolkit.Root, root),
    Effect.provideService(BackendToolkit.Target, host),
  )).toMatchObject([{ version: "3.0.4+orchestra.cassandra2", status: "absent" }])
  // Real production acquisition must reach the helper before building, not merely pass its isolated unit checks.
  const owned = yield* BackendToolkit.ensure("gocqlx-schemagen").pipe(Effect.provideService(BackendToolkit.Root, root))
  expect(path.dirname(owned.executable)).toBe(path.join(root, `engines/gocqlx-schemagen/${pack.version}-${host.target}`))
  expect(digest(yield* Effect.promise(() => readFile(path.join(path.dirname(owned.executable), "driver/metadata_scylla.go"))))).toBe(BackendToolkitCassandra.AFTER)
  expect(digest(yield* Effect.promise(() => readFile(path.join(path.dirname(owned.executable), "src/cmd/schemagen/schemagen.go"))))).toBe(BackendToolkitCassandraDialer.AFTER)
  const help = yield* Effect.promise(async () => {
    const child = Bun.spawn([owned.executable, "-help"], { stdout: "pipe", stderr: "pipe" })
    return { exit: await child.exited, text: await new Response(child.stderr).text() }
  })
  expect(help.exit).toBe(0)
  expect(help.text).toContain("-cluster")
  expect(yield* Effect.promise(() => readFile(path.join(old, "gocqlx-schemagen"), "utf8"))).toBe("old binary")
  expect(yield* Effect.promise(() => readFile(path.join(previous, "gocqlx-schemagen"), "utf8"))).toBe("previous binary")
  const go = path.join(root, "runtimes", "go", `${BackendToolkitManifest.RUNTIMES.go.version}-${host.target}`, BackendToolkitManifest.RUNTIMES.go.targets[host.target].executable)
  yield* Effect.promise(() => cp(path.join(import.meta.dirname, "fixtures/cassandra-dialer_test.go"), path.join(path.dirname(owned.executable), "src/cmd/schemagen/orchestra_dialer_test.go")))
  const command = (args: string[], env: Record<string, string> = {}) => Effect.promise(async () => {
    const child = Bun.spawn([go, ...args], {
      cwd: path.join(path.dirname(owned.executable), "src"),
      env: { ...process.env, GOFLAGS: "-mod=readonly", GOTOOLCHAIN: "local", GOWORK: "off", GOPATH: path.join(root, "cache/go"), GOCACHE: path.join(root, "cache/go-build"), ...env },
      stdout: "pipe", stderr: "pipe",
    })
    const [stdout, stderr, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
    return { stdout, stderr, exit }
  })
  const parsed = yield* command(["test", "./cmd/schemagen", "-run", "TestOrchestra(Routes|Address)$", "-count=1"])
  expect(parsed, parsed.stderr).toMatchObject({ exit: 0 })
  // Exact Unix grants are provided by the existing broker on Linux/macOS; Windows still builds and runs parser tests.
  if (process.platform === "win32") return
  const clients = new Set<Socket>()
  const counters = [0, 0]
  const targets = yield* Effect.forEach([0, 1], (index) => Effect.gen(function* () {
    const server = yield* Effect.acquireRelease(Effect.sync(() => createServer((socket) => {
      counters[index]++
      clients.add(socket)
      socket.on("error", () => socket.destroy())
      socket.on("close", () => clients.delete(socket))
      socket.pipe(socket)
    })), (server) => Effect.promise(() => new Promise<void>((resolve) => {
      clients.forEach((socket) => socket.destroy())
      server.close(() => resolve())
    })))
    yield* Effect.promise(() => new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve())))
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("TCP fixture failed to bind")
    return address.port
  }))
  const sockets = yield* TcpProxy.listen(targets)
  expect(counters).toEqual([0, 0])
  const roundtrip = yield* command(["test", "./cmd/schemagen", "-run", "TestOrchestraBroker$", "-count=1"], {
    ORCHESTRA_TCP_PROXY_ROUTES: `${targets[0]}:${Buffer.from(sockets[0], "utf8").toString("hex")}`,
    ORCHESTRA_DIALER_TEST_ADDRESS: `127.0.0.1:${targets[0]}`,
    ORCHESTRA_DIALER_TEST_OTHER: `127.0.0.1:${targets[1]}`,
  })
  expect(roundtrip, roundtrip.stderr).toMatchObject({ exit: 0 })
  expect(counters).toEqual([1, 0])
}).pipe(Effect.provide(LayerNode.compile(FSUtil.node))), 5 * 60_000)
