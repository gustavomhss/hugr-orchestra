import { NodeHttpServer } from "@effect/platform-node"
import { ClaudeCodeAccount } from "@orchestra/core/claude-code-account"
import { Credential } from "@orchestra/core/credential"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { PermissionSaved } from "@orchestra/core/permission/saved"
import { SessionV2 } from "@orchestra/core/session"
import { Context, Effect, Layer, Option } from "effect"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { createServer } from "node:http"
import { writeSync } from "node:fs"
import path from "node:path"
import { WebUi } from "@orchestra/server/web-ui"
import { createRoutes } from "@orchestra/server/routes"
import type { HttpExtension } from "@orchestra/server/routes"
import { AppDockSocket } from "@orchestra/app-dock/socket-transport"
import { Commands } from "../commands"
import { ProductHost } from "../../host"
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner"
import { Runtime } from "../../framework/runtime"
import { Daemon } from "../../services/daemon"
import { listenerHosts } from "./serve-host"
import { addressInUse } from "./serve-port"
import { ServeShutdown } from "./serve-shutdown"

const SHUTDOWN_GRACE_MS = 2_000

export default Runtime.handler(Commands.commands.serve, (input) =>
  serveForever({ ...input, activityApprovalStdin: input["activity-approval-stdin"], allowedHosts: input["allowed-host"] }),
)

export type ServeInput = {
  readonly hostname: string
  readonly activityApprovalStdin?: boolean
  readonly port: Option.Option<number>
  readonly installation?: Option.Option<string>
  readonly register: boolean
  readonly cors?: ReadonlyArray<string>
  readonly allowedHosts?: ReadonlyArray<string>
  /** Runs once the server answers, with the address it bound. */
  readonly onListening?: (address: HttpServer.Address, webRoot: string | undefined) => Effect.Effect<void, unknown, ChildProcessSpawner>
}

/** The directory of the built web UI, when this install has one. */
export function webRoot() {
  return WebUi.resolveRoot([
    process.env.ORCHESTRA_WEB_UI_DIR,
    path.join(path.dirname(process.execPath), "web"),
    path.join(import.meta.dir, "../../../../web/dist"),
  ])
}

export const serveForever = Effect.fn("cli.serve")(function* (input: ServeInput) {
  const shutdown = { signal: undefined as NodeJS.Signals | undefined, startedAt: 0 }
  const note = (status: ServeShutdown.Status) => {
    if (!shutdown.signal) return
    const line = ServeShutdown.evidence({
      level: process.env.ORCHESTRA_LOG_LEVEL,
      pid: process.pid,
      signal: shutdown.signal,
      status,
      elapsedMs: Date.now() - shutdown.startedAt,
    })
    if (line) writeSync(2, line)
  }
  const onSignal = (signal: NodeJS.Signals) => {
    if (shutdown.signal) return
    shutdown.signal = signal
    shutdown.startedAt = Date.now()
    process.exitCode = ServeShutdown.exitCode(signal)
    note("started")
  }
  // Run after the listener closes and the installation has finished disposing.
  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      if (!shutdown.signal) return
      note("disposed")
      process.exit()
    }),
  )
  // Capture the per-launch credentials before an installation can start subprocesses.
  const launchPassword = process.env.ORCHESTRA_SERVER_PASSWORD
  delete process.env.ORCHESTRA_SERVER_PASSWORD
  delete process.env.ORCHESTRA_SERVER_USERNAME
  const privateExtension = input.activityApprovalStdin ? yield* Effect.gen(function* () {
    if (input.hostname !== "127.0.0.1" || Option.isNone(input.port) || !Number.isInteger(input.port.value) ||
      input.port.value < 1 || input.port.value > 65_535 || input.register ||
      (input.installation && Option.isSome(input.installation))) {
      return yield* Effect.fail(new Error("Activity private channel requires an unregistered loopback server and explicit port"))
    }
    const { ActivityPrivateChannelServer } = yield* Effect.promise(
      () => import("@orchestra/server/activity-private-channel"),
    )
    const { ActivityArmLedger } = yield* Effect.promise(() => import("@orchestra/core/activity-arm"))
    const { ActivityStopService } = yield* Effect.promise(() => import("@orchestra/core/activity-stop-service"))
    const { ActivityQuarantineCustody } = yield* Effect.promise(() => import("@orchestra/core/activity-quarantine-custody"))
    const scope = yield* Layer.build(AppNodeBuilder.build(Database.node))
    const database = Context.get(scope, Database.Service)
    const arm = ActivityArmLedger.make(database)
    const stop = process.platform === "win32" ? ActivityStopService.make(database) : undefined
    const custody = process.platform === "win32" ? ActivityQuarantineCustody.make(database) : undefined
    return yield* Effect.tryPromise({
      try: (signal) => ActivityPrivateChannelServer.acquire(process.stdin, signal, arm, stop, custody),
      catch: () => new Error("Activity private channel startup failed"),
    })
  }) : undefined
  const start = (wait: Effect.Effect<void>) =>
    withInstallation(input, (httpExtensions) => Effect.gen(function* () {
      const daemon = yield* Daemon.Service
      const password = launchPassword || (yield* daemon.password())
      const root = yield* Effect.promise(() => webRoot())
      // Legacy transcripts on this database are copied to V2 before the server answers: a Session is eligible only
      // while it has no V2 message, so a prompt reaching an old Session first would skip its history forever.
      yield* Effect.gen(function* () {
        const database = yield* Database.Service
        const imported = yield* SessionV2.SessionLegacyImport.run(database.db)
        if (imported > 0) console.log(`imported ${imported} legacy session transcripts`)
      }).pipe(
        Effect.provide(AppNodeBuilder.build(LayerNode.group([Database.node]))),
        Effect.catchCause((cause) => Effect.logError("legacy session import failed", cause)),
      )
      const allowedHosts = listenerHosts(input.hostname, input.allowedHosts)
      const bindHost = httpExtensions && input.hostname === "localhost" ? "127.0.0.1" : input.hostname
      const listening = yield* listen(bindHost, input.port, password, hosts(), root, allowedHosts, input.cors,
        privateExtension ? [...(httpExtensions ?? []), privateExtension] : httpExtensions, httpExtensions !== undefined)
      const address = listening.address
      // Closing the server waits for every open connection, and the event stream never ends on its own. Scope
      // finalizers run in reverse, so this drops the connections before the server closes.
      yield* Effect.addFinalizer(() => Effect.sync(() => listening.server.closeAllConnections?.()))
      if (input.register) yield* daemon.register(address)
      console.log(`server listening on ${HttpServer.formatAddress(address)}`)
      if (input.onListening) yield* input.onListening(address, root)
      return yield* wait
    }))
  if (input.installation && Option.isSome(input.installation)) {
    // The explicit installation owns asynchronous cleanup, even when a signal arrives before bind.
    return yield* ServeShutdown.withSignals(process, process.platform, onSignal, start(Effect.never))
  }
  return yield* start(ServeShutdown.untilSignal(process, process.platform, (signal) => {
    onSignal(signal)
    // The desktop kills an ordinary serve child a few seconds after SIGTERM.
    setTimeout(() => process.exit(), SHUTDOWN_GRACE_MS).unref()
  }))
}, Effect.scoped)

/** Own installation acquisition and cleanup around the server startup and lifetime. */
export function withInstallation<A, E, R>(
  input: ServeInput,
  start: (extensions: readonly HttpExtension[] | undefined) => Effect.Effect<A, E, R>,
) {
  return Effect.scoped(Effect.gen(function* () {
    if (!input.installation || Option.isNone(input.installation)) return yield* start(undefined)
    if (!["127.0.0.1", "localhost", "::1"].includes(input.hostname)) {
      return yield* Effect.fail(new Error("Installation requires a loopback hostname (127.0.0.1, localhost or ::1)"))
    }
    if (Option.isNone(input.port) || !Number.isInteger(input.port.value) || input.port.value < 1 || input.port.value > 65_535) {
      return yield* Effect.fail(new Error("Installation requires an explicit port from 1 to 65535"))
    }
    const { InstallationHttp } = yield* Effect.promise(() => import("../../services/installation-http"))
    const origin = `http://${input.hostname === "::1" ? "[::1]" : input.hostname}:${input.port.value}`
    const loaded = yield* Effect.acquireRelease(
      InstallationHttp.load(input.installation.value, { origin }),
      (installation) => Effect.tryPromise({
        try: () => installation.dispose(),
        catch: () => new Error("Installation cleanup failed"),
      }).pipe(Effect.catch(() => Effect.logError("Installation cleanup failed"))),
    )
    return yield* start([loaded])
  }))
}

function listen(
  hostname: string,
  port: Option.Option<number>,
  password: string,
  host: ReturnType<typeof hosts>,
  root: string | undefined,
  allowedHosts: ReadonlyArray<string>,
  cors?: ReadonlyArray<string>,
  httpExtensions?: readonly HttpExtension[],
  installation = false,
) {
  if (Option.isSome(port)) return bind(hostname, port.value, password, host, root, allowedHosts, cors, httpExtensions, installation)
  const next = (port: number): ReturnType<typeof bind> =>
    bind(hostname, port, password, host, root, allowedHosts, cors, httpExtensions, installation).pipe(
      Effect.catch((error) => (port === 65_535 || !addressInUse(error) ? Effect.fail(error) : next(port + 1))),
    )
  return next(4096)
}

function bind(
  hostname: string,
  port: number,
  password: string,
  host: ReturnType<typeof hosts>,
  root: string | undefined,
  allowedHosts: ReadonlyArray<string>,
  cors?: ReadonlyArray<string>,
  httpExtensions?: readonly HttpExtension[],
  installation = false,
) {
  return Effect.gen(function* () {
    const server = yield* serveTransport(installation)
    return yield* Layer.build(
      HttpRouter.serve(createRoutes({ password, host, webRoot: root, cors, allowedHosts, httpExtensions }), {
        disableListenLog: true,
        disableLogger: true,
      }).pipe(
        Layer.provideMerge(NodeHttpServer.layer(() => server, { port, host: hostname })),
        Layer.provide(AppNodeBuilder.build(LayerNode.group([Credential.node, PermissionSaved.node, ClaudeCodeAccount.node]))),
      ),
    ).pipe(Effect.map((context) => ({ address: Context.get(context, HttpServer.HttpServer).address, server })))
  })
}

/** Own connection teardown from the moment the transport starts listening. */
export function serveTransport(installation: boolean) {
  return Effect.gen(function* () {
    const server = createServer()
    if (installation) {
      // Bun can open the socket before reporting listening. Register cleanup before building the HTTP layer.
      yield* Effect.addFinalizer(() => Effect.sync(() => { server.closeAllConnections?.() }))
      const close = server.close.bind(server)
      server.close = (callback) => {
        const listening = server.listening
        server.closeAllConnections?.()
        // Bun closes the listener as part of closeAllConnections. Node still needs close().
        if (listening && !server.listening) {
          if (callback) queueMicrotask(() => callback())
          return server
        }
        return close(callback)
      }
    }
    return server
  })
}

// The Dock tools exist only when the desktop that owns this child handed it a Dock channel.
function hosts() {
  return ProductHost.contributions(AppDockSocket.fromEnv())
}
