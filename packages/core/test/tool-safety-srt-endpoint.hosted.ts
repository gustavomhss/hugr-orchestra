// Dedicated hosted proof: excluded from ordinary Bun suffix discovery, selected by its exact path.
// Linux CI only: it relaxes the runner's AppArmor user-namespace restriction for bubblewrap, installs the sandbox's
// system dependencies when absent, and runs a real Apache Cassandra, ScyllaDB and PostgreSQL in Docker on host loopback
// ports.
import { expect } from "bun:test"
import path from "node:path"
import { createHash } from "node:crypto"
import { createServer, type Socket } from "node:net"
import { Effect, Fiber, Schedule } from "effect"
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
const POSTGRES = "postgres:17.6"
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

// Starts a detached database container, waits for its health check, runs its setup and returns its loopback port.
const database = (image: string, port: number, args: string[], healthCommand: string, setup?: string[]) =>
  Effect.gen(function* () {
    const processes = yield* AppProcess.Service
    const id = yield* Effect.acquireRelease(
      host("docker", ["run", "-d", "-p", `127.0.0.1::${port}`, ...args,
        "--health-cmd", healthCommand, "--health-interval", "5s", "--health-retries", "60", "--health-start-period", "20s",
        image, ...(image.startsWith("scylladb/") ? ["--smp", "1", "--memory", "512M", "--overprovisioned", "1", "--developer-mode", "1"] : [])]).pipe(
        Effect.map((result) => result.stdout.toString().trim())),
      (id) => processes.run(ChildProcess.make("docker", ["rm", "-f", id])).pipe(Effect.ignore),
    )
    const published = Number((yield* host("docker", ["port", id, `${port}/tcp`])).stdout.toString().split("\n")[0].trim().split(":").at(-1))
    yield* host("docker", ["inspect", "--format", "{{.State.Health.Status}}", id]).pipe(
      Effect.flatMap((result) => result.stdout.toString().trim() === "healthy" ? Effect.void : Effect.fail(result.stdout.toString().trim())),
      Effect.retry({ schedule: Schedule.spaced("5 seconds"), times: 72 }),
    )
    if (setup) yield* host("docker", ["exec", id, ...setup])
    console.info(`${image} healthy on 127.0.0.1:${published}`)
    return published
  })

// A real host service on another loopback port: a sandboxed command must never reach it.
const otherService = Effect.gen(function* () {
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
  return { port: address.port, accepted: () => other.accepted }
})

// Starts the srt acquisition when a test runs alone and waits until the pinned runtime is installed.
const runtimeReady = <R>(first: Effect.Effect<unknown, unknown, R>) =>
  Effect.gen(function* () {
    yield* first.pipe(Effect.ignore)
    yield* ToolSafetySandboxRuntime.resolve(false).pipe(
      Effect.flatMap((value) => "directory" in value ? Effect.void : Effect.fail(value.reason)),
      Effect.retry({ schedule: Schedule.spaced("1 second"), times: 300 }),
    )
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
    const port = yield* database(CASSANDRA, 9042, ["-e", "MAX_HEAP_SIZE=512M", "-e", "HEAP_NEWSIZE=128M"], "cqlsh -e 'describe keyspaces'", ["cqlsh", "-e", SCHEMA])
    const other = yield* otherService

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
    const undeclared = yield* sandboxed(command.replace(`127.0.0.1:${port}`, `127.0.0.1:${other.port}`), prepared.env)
    expect(undeclared.exitCode).not.toBe(0)
    expect(undeclared.stderr.toString()).toContain("orchestra-cassandra-dialer:undeclared-port")

    // Any client speaking CONNECT gets exactly the granted port. Raw TCP reaches the in-sandbox forwarder on the granted
    // port only; nothing listens on any other port in the sandbox's namespace.
    const probe = `const net=require('net');const u=new URL(process.env.HTTP_PROXY);
const auth=u.username?'Proxy-Authorization: Basic '+Buffer.from(decodeURIComponent(u.username)+':'+decodeURIComponent(u.password)).toString('base64')+'\\r\\n':'';
const connect=p=>new Promise(r=>{const c=net.connect(Number(u.port),'127.0.0.1',()=>c.write('CONNECT 127.0.0.1:'+p+' HTTP/1.1\\r\\nHost: 127.0.0.1:'+p+'\\r\\n'+auth+'\\r\\n'));
let out='';c.on('data',d=>{out+=d;if(out.includes('\\r\\n\\r\\n')){c.destroy();r(out.split('\\r\\n')[0])}});c.on('error',e=>r('ERR:'+e.code));c.setTimeout(5000,()=>{c.destroy();r('TIMEOUT')})});
const raw=p=>new Promise(r=>{const c=net.connect(p,'127.0.0.1',()=>{c.destroy();r('CONNECTED')});c.on('error',e=>r('ERR:'+e.code));c.setTimeout(3000,()=>{c.destroy();r('TIMEOUT')})});
Promise.all([connect(${port}),connect(${other.port}),raw(${port}),raw(${other.port})]).then(v=>console.log(JSON.stringify({granted:v[0],other:v[1],rawGranted:v[2],rawOther:v[3],ports:process.env.ORCHESTRA_TCP_PROXY_CONNECT})))`
    yield* fs.writeFileString(path.join(work, "probe.cjs"), probe)
    const probed = yield* sandboxed(`"${node}" probe.cjs`)
    expect(probed.exitCode, probed.stderr.toString()).toBe(0)
    const result = JSON.parse(probed.stdout.toString())
    console.info(`sandboxed probe: ${probed.stdout.toString().trim()}`)
    expect(result.granted).toStartWith("HTTP/1.1 200")
    expect(result.other).toStartWith("HTTP/1.1 403")
    expect(result.rawGranted).toBe("CONNECTED")
    expect(result.rawOther).toBe("ERR:ECONNREFUSED")
    expect(result.ports).toBe(String(port))
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
    expect(other.accepted()).toBe(0)
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
      const port = yield* database(image, 9042, [], `cqlsh "$(hostname -i)" -e 'describe keyspaces'`, cqlsh(SCHEMA))
      const { work, root, sandboxed } = yield* sandboxFor(port)
      yield* runtimeReady(sandboxed("true"))

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

// psql (libpq), SQLx and PGLS dial raw TCP and cannot speak CONNECT. In the sandbox they reach the granted PostgreSQL
// port only through the host-written forwarder, which tunnels through srt's proxy; every other port stays refused.
it.live("Linux srt exact endpoint: psql, a SQLx migration and PGLS check reach the granted PostgreSQL port through the forwarder", () =>
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const processes = yield* AppProcess.Service
    yield* prepareHost
    const port = yield* database(POSTGRES, 5432, ["-e", "POSTGRES_HOST_AUTH_METHOD=trust"], "pg_isready -U postgres -h 127.0.0.1")
    const other = yield* otherService
    const { work, root, sandboxed } = yield* sandboxFor(port)
    yield* runtimeReady(sandboxed("true"))
    const url = `postgres://postgres@127.0.0.1:${port}/postgres`
    const forwarders = processes.run(ChildProcess.make("pgrep", ["-f", "orchestra-endpoint-forwarder.cjs"])).pipe(
      Effect.map((result) => result.exitCode))

    // The command runs as the forwarder's child.
    const psql = yield* sandboxed(`psql "${url}" -tAc "select 1" && tr '\\0' ' ' < /proc/$PPID/cmdline`)
    expect(psql.exitCode, psql.stderr.toString()).toBe(0)
    console.info(`sandboxed psql: ${psql.stdout.toString().trim()}`)
    expect(psql.stdout.toString().split("\n")[0]).toBe("1")
    expect(psql.stdout.toString()).toContain("orchestra-endpoint-forwarder.cjs")

    const undeclared = yield* sandboxed(`PGCONNECT_TIMEOUT=3 psql "postgres://postgres@127.0.0.1:${other.port}/postgres" -c "select 1"`)
    expect(undeclared.exitCode).not.toBe(0)
    expect(undeclared.stderr.toString()).toContain("Connection refused")
    console.info(`sandboxed psql to an undeclared port: ${undeclared.stderr.toString().trim()}`)

    const migrate = `"$BACKEND_TOOLKIT_BIN/sqlx" migrate run --source migrations --database-url ${url}`
    yield* fs.writeWithDirs(path.join(work, "migrations", "0001_items.sql"), "CREATE TABLE items (id integer PRIMARY KEY, name text NOT NULL);\n")
    yield* BackendToolkit.ensure("sqlx").pipe(Effect.provideService(BackendToolkit.Root, root))
    const sqlx = yield* BackendToolkit.prepare(migrate).pipe(Effect.provideService(BackendToolkit.Root, root))
    expect(sqlx.blocked).toBeUndefined()
    const migrated = yield* sandboxed(migrate, sqlx.env)
    console.info(`sandboxed sqlx: ${migrated.stdout.toString().trim()} ${migrated.stderr.toString().trim()}`)
    expect(migrated.exitCode, migrated.stderr.toString()).toBe(0)
    // Checked from the host, outside the sandbox.
    expect((yield* host("psql", [url, "-tAc", "select version, success from _sqlx_migrations"])).stdout.toString().trim()).toBe("1|t")

    const check = (file: string) => `"$BACKEND_TOOLKIT_BIN/postgres-language-server" check --connection-string ${url} --max-diagnostics=none ${file}`
    yield* fs.writeFileString(path.join(work, "good.sql"), "select id, name from items;\n")
    yield* fs.writeFileString(path.join(work, "bad.sql"), "select id, missing_column from items;\n")
    yield* BackendToolkit.ensure("postgres-language-server").pipe(Effect.provideService(BackendToolkit.Root, root))
    const pgls = yield* BackendToolkit.prepare(check("good.sql")).pipe(Effect.provideService(BackendToolkit.Root, root))
    expect(pgls.blocked).toBeUndefined()
    const good = yield* sandboxed(check("good.sql"), pgls.env)
    const goodOutput = good.stdout.toString() + good.stderr.toString()
    console.info(`sandboxed PGLS good.sql (exit ${good.exitCode}): ${goodOutput.trim()}`)
    expect(good.exitCode, goodOutput).toBe(0)
    expect(goodOutput).not.toContain("database/connection")
    // Only a reached database can type-check the column against the schema.
    const bad = yield* sandboxed(check("bad.sql"), pgls.env)
    const badOutput = bad.stdout.toString() + bad.stderr.toString()
    console.info(`sandboxed PGLS bad.sql (exit ${bad.exitCode}): ${badOutput.trim()}`)
    expect(bad.exitCode, badOutput).toBe(1)
    expect(badOutput).toContain("missing_column")
    expect(badOutput).not.toContain("database/connection")

    // Positive control for the process probe: the forwarder is visible while a command runs, and gone after it.
    const running = yield* Effect.forkChild(sandboxed("sleep 5"))
    expect(yield* forwarders.pipe(
      Effect.flatMap((code) => code === 0 ? Effect.succeed(code) : Effect.fail(code)),
      Effect.retry({ schedule: Schedule.spaced("200 millis"), times: 20 }),
    )).toBe(0)
    expect((yield* Fiber.join(running)).exitCode).toBe(0)
    expect(yield* forwarders).toBe(1)
    expect(other.accepted()).toBe(0)
  }), 30 * 60_000,
)

// Attack cases against the grant: workspace runtime config, a port takeover, forwarder tampering, leftovers after the
// command or a SIGKILL of srt, and srt's own listener ports.
it.live("Linux srt exact endpoint: workspace runtime config, port takeover, tampering and leftovers stay confined", () =>
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const processes = yield* AppProcess.Service
    const node = yield* prepareHost
    const other = yield* otherService
    const { work, sandboxed } = yield* sandboxFor(other.port)
    yield* runtimeReady(sandboxed("true"))
    const running = (pattern: string) => processes.run(ChildProcess.make("pgrep", ["-f", pattern])).pipe(Effect.map((result) => result.exitCode))
    const until = (pattern: string, code: number) => running(pattern).pipe(
      Effect.flatMap((value) => value === code ? Effect.succeed(value) : Effect.fail(value)),
      Effect.retry({ schedule: Schedule.spaced("200 millis"), times: 25 }))

    // An earlier command can leave these in its workspace. Bun loads both from the cwd unless told not to.
    yield* fs.writeFileString(path.join(work, "bunfig.toml"), 'preload = ["./preload.cjs"]\n')
    yield* fs.writeFileString(path.join(work, "preload.cjs"), `const fs=require("fs");const line=process.argv.slice(1).join(" ")+"\\n"
try{fs.appendFileSync(${JSON.stringify(path.join(work, "escaped"))},line)}catch{fs.appendFileSync(${JSON.stringify(path.join(work, "models", "inside"))},line)}`)
    yield* fs.writeFileString(path.join(work, ".env"), "ORCHESTRA_DOTENV_PROBE=loaded\n")
    const config = yield* sandboxed(`printf 'dotenv=%s' "$ORCHESTRA_DOTENV_PROBE"`)
    const escaped = (yield* fs.exists(path.join(work, "escaped"))) ? Buffer.from(yield* fs.readFile(path.join(work, "escaped"))).toString() : ""
    const inside = (yield* fs.exists(path.join(work, "models", "inside"))) ? Buffer.from(yield* fs.readFile(path.join(work, "models", "inside"))).toString() : ""
    yield* fs.remove(path.join(work, "bunfig.toml"))

    // The command cannot take the granted port from the forwarder, with or without SO_REUSEPORT.
    const takeover = yield* sandboxed(`"${node}" -e "require('net').createServer().once('error',e=>console.log(e.code)).listen(${other.port},'127.0.0.1',()=>{console.log('BOUND');process.exit(0)})"; ` +
      `"${process.execPath}" -e "try{Bun.listen({hostname:'127.0.0.1',port:${other.port},reusePort:true,socket:{data(){}}});console.log('BOUND')}catch(e){console.log(e.code)}"`)

    // The forwarder script and its directory are read-only to the command.
    const tamper = yield* sandboxed(`f=$(tr '\\0' '\\n' < /proc/$PPID/cmdline | grep -m1 'orchestra-endpoint-forwarder.cjs$'); d=$(dirname "$f"); echo "seen=$f"
(echo x >> "$f") 2>/dev/null && echo WRITE; (mv "$f" "$f.x") 2>/dev/null && echo RENAME; (mv "$d" "$d.x") 2>/dev/null && echo MOVEDIR
(rm -f "$f") 2>/dev/null; [ -e "$f" ] || echo REMOVED; (ln -s / "$d/link") 2>/dev/null && echo CREATE; true`)

    // A daemonized grandchild ends with the command; a SIGKILL of srt ends the forwarder and the command.
    const daemon = yield* Effect.forkChild(sandboxed("setsid sh -c 'exec sleep 47.5' </dev/null >/dev/null 2>&1 & sleep 2"))
    const daemonSeen = yield* until("sleep 47.5", 0)
    yield* Fiber.join(daemon)
    const daemonGone = yield* until("sleep 47.5", 1)
    const forwarderGone = yield* until("orchestra-endpoint-forwarder.cjs", 1)
    const killed = yield* Effect.forkChild(sandboxed("sleep 48.5").pipe(Effect.exit))
    const killedSeen = yield* until("sleep 48.5", 0)
    yield* host("pkill", ["-KILL", "-f", "sandbox-runtime/dist/cli.js"])
    const killedGone = yield* until("sleep 48.5", 1)
    const killedForwarderGone = yield* until("orchestra-endpoint-forwarder.cjs", 1)
    yield* Fiber.join(killed)

    // srt's own in-sandbox listeners take 3128 and 1080 first, every time.
    const reserved = yield* Effect.forEach([3128, 1080, 3128, 1080, 3128, 1080], (port) => sandboxFor(port).pipe(
      Effect.flatMap((proxy) => proxy.sandboxed("echo ran")),
      Effect.map((result) => `${result.exitCode}:${result.stdout.toString().trim()}:${result.stderr.toString().trim()}`)))

    const result = {
      config: { exit: config.exitCode, stdout: config.stdout.toString(), stderr: config.stderr.toString().slice(0, 400), escaped, inside },
      takeover: takeover.stdout.toString().trim().split("\n"),
      tamper: tamper.stdout.toString().trim().split("\n"),
      daemon: { daemonSeen, daemonGone, forwarderGone, killedSeen, killedGone, killedForwarderGone },
      reserved,
    }
    console.info(`attack cases: ${JSON.stringify(result)}`)
    expect(result.config).toMatchObject({ exit: 0, stdout: "dotenv=", escaped: "", inside: "" })
    expect(result.takeover).toEqual(["EADDRINUSE", "EADDRINUSE"])
    expect(result.tamper.slice(1)).toEqual([])
    expect(result.tamper[0]).toContain("orchestra-endpoint-forwarder.cjs")
    expect(result.daemon).toEqual({ daemonSeen: 0, daemonGone: 1, forwarderGone: 1, killedSeen: 0, killedGone: 1, killedForwarderGone: 1 })
    result.reserved.forEach((entry) => expect(entry).toMatch(/^125::orchestra-endpoint-forwarder:listen-failed:(3128|1080):EADDRINUSE$/))
    expect(other.accepted()).toBe(0)
  }), 20 * 60_000,
)
