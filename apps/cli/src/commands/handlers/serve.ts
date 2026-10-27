import { NodeHttpServer } from "@effect/platform-node"
import { ClaudeCodeAccount } from "@orchestra/core/claude-code-account"
import { Credential } from "@orchestra/core/credential"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { PermissionSaved } from "@orchestra/core/permission/saved"
import { SessionV2 } from "@orchestra/core/session"
import { Context, Layer, Option } from "effect"
import * as Effect from "effect/Effect"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { createServer } from "node:http"
import { writeSync } from "node:fs"
import path from "node:path"
import { WebUi } from "@orchestra/server/web-ui"
import { createRoutes } from "@orchestra/server/routes"
import { AppDockSocket } from "@orchestra/app-dock/socket-transport"
import { Commands } from "../commands"
import { ProductHost } from "../../host"
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner"
import { Runtime } from "../../framework/runtime"
import { Daemon } from "../../services/daemon"
import { addressInUse } from "./serve-port"
import { ServeShutdown } from "./serve-shutdown"

const SHUTDOWN_GRACE_MS = 2_000

export default Runtime.handler(Commands.commands.serve, (input) => serveForever(input))

export type ServeInput = {
  readonly hostname: string
  readonly port: Option.Option<number>
  readonly register: boolean
  readonly cors?: ReadonlyArray<string>
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
    return yield* Effect.scoped(
      Effect.gen(function* () {
        // The runtime interrupts on SIGTERM and SIGINT and runs the finalizers; this bounds a finalizer that hangs,
        // as the desktop kills its child a few seconds after SIGTERM. SIGHUP and, on Windows, SIGBREAK are not
        // interrupted by the runtime, so the wait at the end of this scope ends on them as well.
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
        // Registered first, so it runs after every other finalizer: the process exits with the signal's code only
        // once the server and its connections are closed.
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            if (!shutdown.signal) return
            note("disposed")
            process.exit()
          }),
        )
        const daemon = yield* Daemon.Service
        // A desktop-owned child gets a per-launch password in env and never touches the daemon's password file.
        const password = process.env.ORCHESTRA_SERVER_PASSWORD || (yield* daemon.password())
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
        const listening = yield* listen(input.hostname, input.port, password, hosts(), root, input.cors)
        const address = listening.address
        // Closing the server waits for every open connection, and the event stream never ends on its own. Scope
        // finalizers run in reverse, so this drops the connections before the server closes.
        yield* Effect.addFinalizer(() => Effect.sync(() => listening.server.closeAllConnections?.()))
        if (input.register) yield* daemon.register(address)
        console.log(`server listening on ${HttpServer.formatAddress(address)}`)
        if (input.onListening) yield* input.onListening(address, root)
        return yield* ServeShutdown.untilSignal(process, process.platform, (signal) => {
          if (shutdown.signal) return
          shutdown.signal = signal
          shutdown.startedAt = Date.now()
          process.exitCode = ServeShutdown.exitCode(signal)
          note("started")
          setTimeout(() => process.exit(), SHUTDOWN_GRACE_MS).unref()
        })
      }),
    )
})

function listen(hostname: string, port: Option.Option<number>, password: string, host: ReturnType<typeof hosts>, root: string | undefined, cors?: ReadonlyArray<string>) {
  if (Option.isSome(port)) return bind(hostname, port.value, password, host, root, cors)
  const next = (port: number): ReturnType<typeof bind> =>
    bind(hostname, port, password, host, root, cors).pipe(
      Effect.catch((error) => (port === 65_535 || !addressInUse(error) ? Effect.fail(error) : next(port + 1))),
    )
  return next(4096)
}

function bind(hostname: string, port: number, password: string, host: ReturnType<typeof hosts>, root: string | undefined, cors?: ReadonlyArray<string>) {
  const server = createServer()
  return Layer.build(
    HttpRouter.serve(createRoutes({ password, host, webRoot: root, cors }), { disableListenLog: true, disableLogger: true }).pipe(
      Layer.provideMerge(NodeHttpServer.layer(() => server, { port, host: hostname })),
      Layer.provide(AppNodeBuilder.build(LayerNode.group([Credential.node, PermissionSaved.node, ClaudeCodeAccount.node]))),
    ),
  ).pipe(Effect.map((context) => ({ address: Context.get(context, HttpServer.HttpServer).address, server })))
}

// The Dock tools exist only when the desktop that owns this child handed it a Dock channel.
function hosts() {
  return ProductHost.contributions(AppDockSocket.fromEnv())
}
