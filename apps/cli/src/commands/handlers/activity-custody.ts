import { constants } from "node:fs"
import { chmod, lstat, mkdir, open, statfs } from "node:fs/promises"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import type { Socket } from "node:net"
import path from "node:path"
import { Readable } from "node:stream"

const usage = "orchestra activity-custody --root <absolute path> --socket </run/.../custody.sock>"
const diskFilesystems = new Set([0xef53, 0x58465342, 0x9123683e]) // ext, XFS, Btrfs

export async function launch(args: readonly string[]) {
  if (args.length === 1 && args[0] === "--help") {
    console.log(usage)
    return
  }
  if (process.platform !== "linux" || process.geteuid?.() !== 0)
    throw new Error("Activity custody requires an administrator-managed Linux service")
  if (args.length !== 4 || !["--root", "--socket"].every((flag) => args[0] === flag || args[2] === flag))
    throw new Error(usage)
  const root = args[args.indexOf("--root") + 1]!
  const socket = args[args.indexOf("--socket") + 1]!
  if (!isCanonical(root) || !isCanonical(socket) || !socket.startsWith("/run/") ||
    path.dirname(socket) === "/run" || Buffer.byteLength(socket) > 107)
    throw new Error(usage)

  await protectedParents(root)
  await protectedParents(path.dirname(socket), true)
  if (((await lstat(root)).mode & 0o077) !== 0)
    throw new Error("Activity custody root must be restricted to its owner")
  if (!diskFilesystems.has((await statfs(root)).type))
    throw new Error("Activity custody requires a supported disk-backed filesystem")
  if (await missingOrStat(socket)) throw new Error("Activity custody socket already exists")

  // The privileged entry point does not load the ordinary CLI or its installation paths.
  process.umask(0o077)
  process.chdir(root)
  for (const name of Object.keys(process.env)) {
    if (/^ORCHESTRA_/i.test(name)) delete process.env[name]
  }
  const runtime = path.join(root, "runtime")
  for (const dir of ["", "config", "config/orchestra", "state", "state/orchestra", "data", "data/orchestra",
    "data/orchestra/log", "data/orchestra/repos", "cache", "cache/orchestra", "cache/orchestra/bin", "tmp", "tmp/orchestra"]) {
    const file = path.join(runtime, dir)
    await mkdir(file, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error
    })
    const info = await lstat(file)
    if (!info.isDirectory() || info.uid !== 0 || (info.mode & 0o077) !== 0)
      throw new Error("Unprotected activity custody runtime directory")
  }
  process.env.XDG_CONFIG_HOME = path.join(runtime, "config")
  process.env.XDG_STATE_HOME = path.join(runtime, "state")
  process.env.XDG_DATA_HOME = path.join(runtime, "data")
  process.env.XDG_CACHE_HOME = path.join(runtime, "cache")
  process.env.TMPDIR = path.join(runtime, "tmp")

  const { NodeRuntime } = await import("@effect/platform-node")
  const { Context, Effect, Layer } = await import("effect")
  const { Omni } = await import("@orchestra/core/omni")
  const native = Omni.locate()
  for (const file of [path.resolve(native.addon), path.resolve(native.supervisor)]) {
    await protectedParents(path.dirname(file))
    const info = await lstat(file)
    if (!info.isFile() || info.uid !== 0 || (info.mode & 0o022) !== 0)
      throw new Error("Activity custody requires a protected Omni installation")
  }
  Omni.configure({ addon: path.resolve(native.addon), supervisor: path.resolve(native.supervisor) })

  const { ActivityApplyLinux } = await import("@orchestra/core/activity-apply-linux")
  const { ActivityApplyService } = await import("@orchestra/core/activity-apply")
  const { ActivityArmLedger } = await import("@orchestra/core/activity-arm")
  const { ActivityArmObjects } = await import("@orchestra/core/activity-arm-objects")
  const { ActivityCustodyProvision } = await import("@orchestra/core/activity-custody-provision")
  const { ActivityPrivateChannelServer } = await import("@orchestra/server/activity-private-channel")
  const { AppNodeBuilder } = await import("@orchestra/core/effect/app-node-builder")
  const { AppProcess } = await import("@orchestra/core/process")
  const { Database } = await import("@orchestra/core/database/database")
  const { ActivityPrivateChannel } = await import("@orchestra/schema/activity-private-channel")

  Effect.gen(function* () {
    const protection = yield* Effect.promise(() => ActivityApplyLinux.open(root))
    if (!protection) return yield* Effect.fail(new Error("Activity custody protected root is unavailable"))

    const processContext = yield* Layer.build(AppNodeBuilder.build(AppProcess.node))
    const config = yield* ActivityCustodyProvision.read(root, Context.get(processContext, AppProcess.Service))
    const filename = yield* Effect.tryPromise(() => databaseFile(root))
    const context = yield* Layer.build(Database.layerFromPath(filename))
    const database = Context.get(context, Database.Service)
    yield* database.db.run("PRAGMA synchronous = FULL")
    yield* ActivityCustodyProvision.install(database, config.registrations)

    const objects = ActivityArmObjects.make(database, config.git, { inspectProtectedSource: protection.inspectProtectedSource })
    const arm = ActivityArmLedger.make(database, { ...objects, maxSelection: 1 })
    const apply = ActivityApplyService.make(database, { authority: protection.authority(objects) })
    // Limit the signed response to operations provided by this custody process.
    const extension = yield* Effect.tryPromise((signal) => ActivityPrivateChannelServer.acquire(
      process.stdin, signal, arm, undefined, undefined, undefined, {
        ...apply,
        state: () => Effect.gen(function* () {
          const state = yield* apply.state()
          return { ...state, custodyPlan: yield* ActivityArmLedger.plan(database) }
        }),
      },
    ))
    const connections = new Set<Socket>()
    const requests = new Set<Promise<void>>()
    const server = createServer({
      headersTimeout: 5_000,
      requestTimeout: 8_000,
      connectionsCheckingInterval: 1_000,
      maxHeaderSize: 8_192,
    }, (input, output) => {
      const task = respond(input, output, extension.handler, ActivityPrivateChannel.maxBodyBytes).finally(() => requests.delete(task))
      requests.add(task)
    })
    server.maxConnections = 32
    server.maxRequestsPerSocket = 1
    server.on("connection", (connection) => {
      connections.add(connection)
      connection.once("close", () => connections.delete(connection))
    })
    server.on("checkContinue", (_input, output) => { output.writeHead(417).end() })

    yield* Effect.addFinalizer(() => Effect.promise(async () => {
      const closing = new Promise<void>((resolve) => { server.close(() => resolve()) })
      connections.forEach((connection) => connection.destroy())
      await closing
      // A disconnected client cannot interrupt an admitted durable Apply.
      await Promise.allSettled(requests)
    }))
    yield* Effect.tryPromise(() => new Promise<void>((resolve, reject) => {
      server.once("error", reject)
      server.listen(socket, () => {
        server.off("error", reject)
        chmod(socket, 0o666).then(resolve, reject)
      })
    })).pipe(Effect.uninterruptible)
    return yield* Effect.never
  }).pipe(Effect.scoped, NodeRuntime.runMain)
}

async function respond(
  input: IncomingMessage,
  output: ServerResponse,
  handler: (request: Request) => Promise<Response | undefined> | Response | undefined,
  maxBodyBytes: number,
) {
  const abort = new AbortController()
  output.once("close", () => abort.abort())
  try {
    const size = input.headers["content-length"]
    if (input.method !== "POST" || !input.url?.startsWith("/") || input.headers["transfer-encoding"] ||
      (size !== undefined && (!/^\d+$/.test(size) || Number(size) > maxBodyBytes))) {
      output.writeHead(403, { connection: "close", "cache-control": "no-store" }).end()
      return
    }
    const headers = new Headers()
    for (const [name, value] of Object.entries(input.headers)) {
      if (value === undefined) continue
      for (const item of Array.isArray(value) ? value : [value]) headers.append(name, item)
    }
    const options: RequestInit & { duplex?: "half" } = { method: "POST", headers, signal: abort.signal }
    if (Number(size) > 0) {
      options.body = Readable.toWeb(input) as ReadableStream<Uint8Array>
      options.duplex = "half"
    }
    const response = await handler(new Request("http://localhost" + input.url, options))
    if (abort.signal.aborted) return
    if (!response) {
      output.writeHead(404, { connection: "close", "cache-control": "no-store" }).end()
      return
    }
    output.writeHead(response.status, { ...Object.fromEntries(response.headers), connection: "close" })
    output.end(await response.text())
  } catch {
    if (abort.signal.aborted) return
    if (!output.headersSent) output.writeHead(500, { connection: "close", "cache-control": "no-store" })
    output.end()
  }
}

async function databaseFile(root: string) {
  const file = path.join(root, "activity-custody.sqlite")
  for (const candidate of [file, file + "-wal", file + "-shm", file + "-journal"]) {
    const info = await missingOrStat(candidate)
    if (info && (!info.isFile() || info.uid !== 0 || (info.mode & 0o077) !== 0 || info.nlink !== 1))
      throw new Error("Unprotected activity custody database file")
  }
  const handle = await open(file, constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW, 0o600)
  await handle.close()
  const directory = await open(root, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
  try {
    await directory.sync()
  } finally {
    await directory.close()
  }
  return file
}

function isCanonical(file: string) {
  return path.isAbsolute(file) && path.resolve(file) === file && file !== "/" && !/[\u0000-\u001f\u007f]/.test(file)
}

async function protectedParents(directory: string, publicSearch = false) {
  const parents = ["/"]
  for (const part of directory.split("/").filter(Boolean)) parents.push(path.join(parents.at(-1)!, part))
  for (const parent of parents) {
    const info = await lstat(parent)
    if (!info.isDirectory() || info.uid !== 0 || (info.mode & 0o022) !== 0 || (publicSearch && (info.mode & 0o001) === 0))
      throw new Error("Unprotected activity custody path: " + parent)
  }
}

function missingOrStat(file: string) {
  return lstat(file).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error
    return undefined
  })
}
