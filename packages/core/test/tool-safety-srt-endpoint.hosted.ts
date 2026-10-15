// Dedicated hosted proof: excluded from ordinary Bun suffix discovery, selected by its exact path.
// Linux CI only: it relaxes the runner's AppArmor user-namespace restriction for bubblewrap, installs the sandbox's
// system dependencies when absent, and runs a real Apache Cassandra and a real ScyllaDB in Docker on host loopback ports.
import { expect } from "bun:test"
import path from "node:path"
import { createHash } from "node:crypto"
import { createServer, type Socket } from "node:net"
import { Effect, Schedule } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { BackendToolkit } from "../src/backend-toolkit"
import { LayerNode } from "../src/effect/layer-node"
import { FSUtil } from "../src/fs-util"
import { AppProcess } from "../src/process"
import { ToolSafety } from "../src/tool-safety"
import { ToolSafetySandbox } from "../src/tool-safety-sandbox"
import { ToolSafetySandboxRuntime } from "../src/tool-safety-sandbox-runtime"
import { testEffect } from "./lib/effect"

if (process.platform !== "linux" || process.env.CI !== "true")
  throw new Error("srt exact-endpoint proof requires its explicit Linux CI runner")

const it = testEffect(LayerNode.compile(LayerNode.group([FSUtil.node, AppProcess.node])))
const CASSANDRA = "cassandra:5.0.5"
const SCYLLA = ["scylladb/scylla:6.1.2", "scylladb/scylla:2026.1.14"]
const SCHEMA = "CREATE KEYSPACE shop WITH replication = {'class': 'SimpleStrategy', 'replication_factor': 1}; " +
  "CREATE TABLE shop.carts (user_id text, item_id text, quantity int, added_at timestamp, PRIMARY KEY (user_id, item_id));"

const MODELS_SHA256 = "6112e7c58a90b3958f39ce98c7db1cfa6bf83aa9098ef263b46ae6df6d1706e4"

const host = (command: string, args: string[]) =>
  Effect.gen(function* () {
    const processes = yield* AppProcess.Service
    return yield* processes.run(ChildProcess.make(command, args), { timeout: "10 minutes" }).pipe(Effect.flatMap(AppProcess.requireSuccess))
  })

const prepareHost = Effect.gen(function* () {
  yield* host("sudo", ["sysctl", "-w", "kernel.apparmor_restrict_unprivileged_userns=0"])
  if (!(yield* ToolSafetySandbox.available("bwrap")) || !(yield* ToolSafetySandbox.available("socat")) || !(yield* ToolSafetySandbox.available("psql")))
    yield* host("sudo", ["apt-get", "install", "-y", "--no-install-recommends", "bubblewrap", "socat", "postgresql-client"])
  const node = yield* ToolSafetySandbox.available("node")
  if (!node) throw new Error("BLOCKED: node unavailable")
  return node
})

// Starts a detached database container, waits for its health check (a CQL round trip) and returns its loopback port.
const database = (image: string, args: string[], cqlsh: string[], healthCommand: string) =>
  Effect.gen(function* () {
    const processes = yield* AppProcess.Service
    const id = yield* Effect.acquireRelease(
      host("docker", ["run", "-d", "-p", "127.0.0.1::9042", ...args,
        "--health-cmd", healthCommand, "--health-interval", "5s", "--health-retries", "60", "--health-start-period", "20s",
        image, ...(image.startsWith("scylladb/") ? ["--smp", "1", "--memory", "512M", "--overprovisioned", "1", "--developer-mode", "1"] : [])]).pipe(
        Effect.map((result) => result.stdout.toString().trim())),
      (id) => processes.run(ChildProcess.make("docker", ["rm", "-f", id])).pipe(Effect.ignore),
    )
    const port = Number((yield* host("docker", ["port", id, "9042/tcp"])).stdout.toString().split("\n")[0].trim().split(":").at(-1))
    yield* host("docker", ["inspect", "--format", "{{.State.Health.Status}}", id]).pipe(
      Effect.flatMap((result) => result.stdout.toString().trim() === "healthy" ? Effect.void : Effect.fail(result.stdout.toString().trim())),
      Effect.retry({ schedule: Schedule.spaced("5 seconds"), times: 72 }),
    )
    yield* host("docker", ["exec", id, ...cqlsh])
    console.info(`${image} healthy on 127.0.0.1:${port}`)
    return port
  })

// A work directory, a private toolkit root and a runner of sandboxed commands granted exactly one loopback port.
const sandboxFor = (port: number) =>
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const processes = yield* AppProcess.Service
    const work = yield* fs.makeTempDirectoryScoped({ prefix: "srt-endpoint-" }).pipe(Effect.flatMap(fs.realPath))
    yield* fs.makeDirectory(path.join(work, "models"))
    const root = yield* Effect.acquireRelease(fs.makeTempDirectory({ prefix: "srt-endpoint-toolkit-" }), (root) => Effect.gen(function* () {
      yield* AppProcess.requireSuccess(yield* processes.run(ChildProcess.make("chmod", ["-R", "u+w", root])))
      yield* fs.remove(root, { recursive: true, force: true })
    }).pipe(Effect.orDie))
    const profile = { requireSandbox: true, writeRoots: ["models"], sandbox: { enabled: true, scratch: true, unconfinedFallback: true,
      allowedLoopbackEndpoints: [{ directory: work, host: "127.0.0.1" as const, port }] } } satisfies ToolSafety.Profile
    // The backend seat's shell also confines reads: its work directory, the toolkit and the host toolchain only.
    const confined = { ...profile, sandbox: { ...profile.sandbox, readRoots: [work, root] } } satisfies ToolSafety.Profile
    const sandboxed = (script: string, env?: Record<string, string>, reads = false) => Effect.scoped(Effect.gen(function* () {
      const command = yield* ToolSafetySandbox.wrap(ChildProcess.make("/bin/sh", ["-c", script], { cwd: work, env })).pipe(
        Effect.provideService(ToolSafety.RuntimeProfile, reads ? confined : profile),
        Effect.provideService(ToolSafety.NativeContext, { directory: work }),
      )
      return yield* processes.run(command, { timeout: "2 minutes" })
    }))
    return { work, root, sandboxed }
  })

it.live("Linux srt exact endpoint: real Cassandra generation through the toolkit path; other ports and raw TCP refused", () =>
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const node = yield* prepareHost
    const port = yield* database(CASSANDRA, ["-e", "MAX_HEAP_SIZE=512M", "-e", "HEAP_NEWSIZE=128M"], ["cqlsh", "-e", SCHEMA], "cqlsh -e 'describe keyspaces'")

    // A real host service on another loopback port: the sandboxed command must never reach it.
    const other = { accepted: 0, clients: new Set<Socket>() }
    const server = yield* Effect.acquireRelease(Effect.sync(() => createServer((socket) => {
      other.accepted++
      other.clients.add(socket)
      socket.on("close", () => other.clients.delete(socket))
      socket.end("other-service")
    })), (server) => Effect.promise(() => new Promise<void>((resolve) => {
      other.clients.forEach((socket) => socket.destroy())
      server.close(() => resolve())
    })))
    yield* Effect.promise(() => new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve())))
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("other loopback service unavailable")

    const { work, root, sandboxed } = yield* sandboxFor(port)

    // Before srt is installed, the grant refuses instead of running unconfined; that call starts the acquisition.
    const runtime = yield* ToolSafetySandboxRuntime.resolve(false)
    if ("directory" in runtime) throw new Error("runtime must start absent on a fresh runner")
    expect(yield* Effect.flip(sandboxed("true"))).toMatchObject({ reason: "sandbox-loopback-endpoint-backend-unavailable" })
    yield* ToolSafetySandboxRuntime.resolve(false).pipe(
      Effect.flatMap((value) => "directory" in value ? Effect.void : Effect.fail(value.reason)),
      Effect.retry({ schedule: Schedule.spaced("1 second"), times: 300 }),
    )

    const command = `"$BACKEND_TOOLKIT_BIN/gocqlx-schemagen" -cluster 127.0.0.1:${port} -keyspace shop -pkgname models -output models`
    yield* BackendToolkit.ensure("gocqlx-schemagen").pipe(Effect.provideService(BackendToolkit.Root, root))
    const prepared = yield* BackendToolkit.prepare(command).pipe(Effect.provideService(BackendToolkit.Root, root))
    expect(prepared.blocked).toBeUndefined()
    const generated = yield* sandboxed(command, prepared.env)
    expect(generated.exitCode, generated.stderr.toString()).toBe(0)
    const models = yield* fs.readFile(path.join(work, "models", "models.go"))
    const text = Buffer.from(models).toString("utf8")
    console.info(`generated models.go: ${models.length} bytes, sha256 ${createHash("sha256").update(models).digest("hex")}`)
    // The same 496 bytes the cassandra2 Darwin deployment generated for this schema (cassandra-build.md).
    expect(createHash("sha256").update(models).digest("hex")).toBe(MODELS_SHA256)
    expect(text).toStartWith('// Code generated by "gocqlx/cmd/schemagen"; DO NOT EDIT.')
    expect(text).toContain("package models")
    expect(text).toMatch(/Name:\s+"carts"/)
    expect(text).toMatch(/Columns: \[\]string\{\s*"added_at",\s*"item_id",\s*"quantity",\s*"user_id",\s*\}/)
    expect(text).toMatch(/PartKey: \[\]string\{\s*"user_id",\s*\}/)
    expect(text).toMatch(/SortKey: \[\]string\{\s*"item_id",\s*\}/)
    expect(text).toMatch(/AddedAt\s+time\.Time\n\s+ItemId\s+string\n\s+Quantity\s+int32\n\s+UserId\s+string/)

    // The same grant: the owned client refuses an undeclared port before any connection.
    const undeclared = yield* sandboxed(command.replace(`127.0.0.1:${port}`, `127.0.0.1:${address.port}`), prepared.env)
    expect(undeclared.exitCode).not.toBe(0)
    expect(undeclared.stderr.toString()).toContain("orchestra-cassandra-dialer:undeclared-port")

    // Any client speaking CONNECT gets exactly the granted port; raw TCP (as libpq, sqlx and PGLS use) gets nothing.
    const probe = `const net=require('net');const u=new URL(process.env.HTTP_PROXY);
const auth=u.username?'Proxy-Authorization: Basic '+Buffer.from(decodeURIComponent(u.username)+':'+decodeURIComponent(u.password)).toString('base64')+'\\r\\n':'';
const connect=p=>new Promise(r=>{const c=net.connect(Number(u.port),'127.0.0.1',()=>c.write('CONNECT 127.0.0.1:'+p+' HTTP/1.1\\r\\nHost: 127.0.0.1:'+p+'\\r\\n'+auth+'\\r\\n'));
let out='';c.on('data',d=>{out+=d;if(out.includes('\\r\\n\\r\\n')){c.destroy();r(out.split('\\r\\n')[0])}});c.on('error',e=>r('ERR:'+e.code));c.setTimeout(5000,()=>{c.destroy();r('TIMEOUT')})});
const raw=p=>new Promise(r=>{const c=net.connect(p,'127.0.0.1',()=>{c.destroy();r('CONNECTED')});c.on('error',e=>r('ERR:'+e.code));c.setTimeout(3000,()=>{c.destroy();r('TIMEOUT')})});
Promise.all([connect(${port}),connect(${address.port}),raw(${port}),raw(${address.port})]).then(v=>console.log(JSON.stringify({granted:v[0],other:v[1],rawGranted:v[2],rawOther:v[3],ports:process.env.ORCHESTRA_TCP_PROXY_CONNECT})))`
    yield* fs.writeFileString(path.join(work, "probe.cjs"), probe)
    const probed = yield* sandboxed(`"${node}" probe.cjs`)
    expect(probed.exitCode, probed.stderr.toString()).toBe(0)
    const result = JSON.parse(probed.stdout.toString())
    console.info(`sandboxed probe: ${probed.stdout.toString().trim()}`)
    expect(result.granted).toStartWith("HTTP/1.1 200")
    expect(result.other).toStartWith("HTTP/1.1 403")
    expect(result.rawGranted).toStartWith("ERR:")
    expect(result.rawOther).toStartWith("ERR:")
    expect(result.ports).toBe(String(port))
    const psql = yield* sandboxed(`PGCONNECT_TIMEOUT=3 psql "host=127.0.0.1 port=${port} dbname=probe user=probe" -c "select 1"`)
    expect(psql.exitCode).not.toBe(0)
    expect(psql.stderr.toString()).toContain("Connection refused")
    console.info(`sandboxed psql: ${psql.stderr.toString().trim()}`)

    // Under confined reads the same engine generates the same models through the same grant, the CONNECT client still
    // reaches exactly the granted port, and a read outside the grants fails.
    yield* fs.remove(path.join(work, "models", "models.go"))
    const regenerated = yield* sandboxed(command, prepared.env, true)
    expect(regenerated.exitCode, regenerated.stderr.toString()).toBe(0)
    expect(createHash("sha256").update(yield* fs.readFile(path.join(work, "models", "models.go"))).digest("hex")).toBe(MODELS_SHA256)
    const reprobed = yield* sandboxed(`"${node}" probe.cjs`, undefined, true)
    expect(reprobed.exitCode, reprobed.stderr.toString()).toBe(0)
    expect(JSON.parse(reprobed.stdout.toString())).toMatchObject({ granted: expect.stringMatching(/^HTTP\/1.1 200/), other: expect.stringMatching(/^HTTP\/1.1 403/) })
    expect((yield* sandboxed("cat /etc/hostname")).exitCode).toBe(0)
    const outside = yield* sandboxed("cat /etc/hostname", undefined, true)
    expect(outside.exitCode).not.toBe(0)
    console.info(`confined reads: regenerated models.go, probe ${reprobed.stdout.toString().trim()}, /etc/hostname: ${outside.stderr.toString().trim()}`)
    expect(other.accepted).toBe(0)
  }), 20 * 60_000,
)

// Scylla runtime proof: the same toolkit path, schema and sandbox as above against a real single-node ScyllaDB, which
// takes the driver's present-`scylla_tables` branch that Cassandra never reaches. Scylla listens on its container
// address, so cqlsh must name it.
SCYLLA.forEach((image) =>
  it.live(`Linux srt exact endpoint: real ${image} generation through the toolkit path equals the Cassandra models.go`, () =>
    Effect.gen(function* () {
      const fs = yield* FSUtil.Service
      yield* prepareHost
      const cqlsh = (statement: string) => ["sh", "-c", `cqlsh "$(hostname -i)" -e "${statement}"`]
      const port = yield* database(image, [], cqlsh(SCHEMA), `cqlsh "$(hostname -i)" -e 'describe keyspaces'`)
      const { work, root, sandboxed } = yield* sandboxFor(port)
      // Starts the srt acquisition when this test runs alone; already present after the Cassandra proof.
      yield* sandboxed("true").pipe(Effect.ignore)
      yield* ToolSafetySandboxRuntime.resolve(false).pipe(
        Effect.flatMap((value) => "directory" in value ? Effect.void : Effect.fail(value.reason)),
        Effect.retry({ schedule: Schedule.spaced("1 second"), times: 300 }),
      )

      const command = `"$BACKEND_TOOLKIT_BIN/gocqlx-schemagen" -cluster 127.0.0.1:${port} -keyspace shop -pkgname models -output models`
      yield* BackendToolkit.ensure("gocqlx-schemagen").pipe(Effect.provideService(BackendToolkit.Root, root))
      const prepared = yield* BackendToolkit.prepare(command).pipe(Effect.provideService(BackendToolkit.Root, root))
      expect(prepared.blocked).toBeUndefined()
      const generated = yield* sandboxed(command, prepared.env)
      expect(generated.exitCode, generated.stderr.toString()).toBe(0)
      const models = yield* fs.readFile(path.join(work, "models", "models.go"))
      const digest = createHash("sha256").update(models).digest("hex")
      console.info(`${image} generated models.go: ${models.length} bytes, sha256 ${digest}`)
      expect(digest, Buffer.from(models).toString("utf8")).toBe(MODELS_SHA256)
    }), 20 * 60_000,
  ),
)
